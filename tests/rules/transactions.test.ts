import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { doc, runTransaction, setDoc, getDoc } from "firebase/firestore";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getEnv, teardown, seed, as, OWNER } from "./setup";

/* ══════════════════════════════════════════════════════════════════
   TRANSACTION ORDERING

   Not a rules test — a Firestore-semantics test, which is why it runs
   against the emulator rather than a mock. A mock would happily accept
   the ordering the real engine rejects, which is exactly how the bug
   this file exists for reached production.

   ⚠️ Firestore aborts a transaction the moment it reads after writing.
   It has to: the write was based on a snapshot, and a later read could
   not be given a consistent view of it.

   reservationsRepo.create takes a customer AND, when the customer
   belongs to one, a company — bumping the roll-up totals on both. The
   company read sat below the reservation write, so a booking for a
   company-linked customer threw

       "Firestore transactions require all reads to be executed
        before all writes"

   while a booking for an unattached customer worked, because without a
   company there is no second read and the ordering happens to be
   legal. Intermittent by data shape, not by luck.
   ══════════════════════════════════════════════════════════════════ */

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await getEnv();
  await seed(env);
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await setDoc(doc(db, "customers", "cust_with_company"), {
      ownerId: OWNER.uid, fullName: "Has Company", companyId: "co1",
      totalReservations: 0, totalRevenue: 0,
    });
    await setDoc(doc(db, "companies", "co1"), {
      ownerId: OWNER.uid, name: "Acme", totalReservations: 0, totalRevenue: 0,
    });
  });
});

afterAll(teardown);

describe("the reservation transaction", () => {
  /* Pins the engine's actual behaviour. If this ever passes, Firestore
     relaxed the rule and the ordering below stopped being load-bearing. */
  it("rejects a read issued after a write", async () => {
    const db = as(env, OWNER);

    await expect(
      runTransaction(db, async (tx) => {
        const customerRef = doc(db, "customers", "cust_with_company");
        const companyRef = doc(db, "companies", "co1");

        await tx.get(customerRef);
        // The write that poisons everything after it.
        tx.set(doc(db, "reservations", "tx_bad"), { reference: "FH-BAD" });
        await tx.get(companyRef); // ← too late
        tx.update(companyRef, { totalReservations: 1 });
      }),
    ).rejects.toThrow(/all reads.*before all writes/i);
  });

  /* The shape reservationsRepo.create now uses. */
  it("accepts both reads hoisted above both writes", async () => {
    const db = as(env, OWNER);

    await runTransaction(db, async (tx) => {
      const customerRef = doc(db, "customers", "cust_with_company");
      const companyRef = doc(db, "companies", "co1");

      const cust = await tx.get(customerRef);
      const comp = await tx.get(companyRef);

      tx.set(doc(db, "reservations", "tx_good"), {
        reference: "FH-GOOD", ownerId: OWNER.uid, status: "confirmed",
      });
      tx.update(customerRef, {
        totalReservations: (cust.data()?.totalReservations ?? 0) + 1,
        totalRevenue: (cust.data()?.totalRevenue ?? 0) + 1000,
      });
      tx.update(companyRef, {
        totalReservations: (comp.data()?.totalReservations ?? 0) + 1,
        totalRevenue: (comp.data()?.totalRevenue ?? 0) + 1000,
      });
    });

    const db2 = as(env, OWNER);
    const saved = await getDoc(doc(db2, "reservations", "tx_good"));
    const cust = await getDoc(doc(db2, "customers", "cust_with_company"));
    const comp = await getDoc(doc(db2, "companies", "co1"));

    expect(saved.exists()).toBe(true);
    // The roll-ups the transaction exists to keep in step.
    expect(cust.data()?.totalReservations).toBe(1);
    expect(cust.data()?.totalRevenue).toBe(1000);
    expect(comp.data()?.totalReservations).toBe(1);
    expect(comp.data()?.totalRevenue).toBe(1000);
  });

  /* The path that masked the bug: no company, so only one read. */
  it("still works for a customer with no company", async () => {
    const db = as(env, OWNER);

    await runTransaction(db, async (tx) => {
      const customerRef = doc(db, "customers", "owned_by_a");
      const cust = await tx.get(customerRef);
      tx.set(doc(db, "reservations", "tx_solo"), {
        reference: "FH-SOLO", ownerId: OWNER.uid, status: "confirmed",
      });
      tx.update(customerRef, {
        totalReservations: (cust.data()?.totalReservations ?? 0) + 1,
      });
    });

    const saved = await getDoc(doc(as(env, OWNER), "reservations", "tx_solo"));
    expect(saved.exists()).toBe(true);
  });
});
