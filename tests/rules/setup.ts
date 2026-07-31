import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type RulesTestContext,
} from "@firebase/rules-unit-testing";
import { setDoc, doc } from "firebase/firestore";

/* ══════════════════════════════════════════════════════════════════
   RULES TEST HARNESS

   ⚠️ These tests execute firestore.rules in the real rules engine.
   That distinction is the whole point: the permission matrix in
   src/lib/permissions.ts is what the *interface* consults, and it can
   agree perfectly with the rules while the rules themselves are wrong.
   Nothing here imports that matrix — a test that reads the same table
   the code reads proves only that the table equals itself.

   Requires the Firestore emulator:
       npm run emulator          (leave running)
       npm run test:rules
   ══════════════════════════════════════════════════════════════════ */

export const PROJECT_ID = "fidato-rules-test";

let env: RulesTestEnvironment | null = null;

export async function getEnv(): Promise<RulesTestEnvironment> {
  if (env) return env;
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  return env;
}

export async function teardown(): Promise<void> {
  await env?.cleanup();
  env = null;
}

/* ── Identities ────────────────────────────────────────────────────
   Each helper returns a Firestore instance authenticated as that
   person, with a matching users/{uid} profile already seeded.        */

export interface Person {
  uid: string;
  email: string;
  role: string;
  status?: string;
}

export const OWNER: Person = { uid: "u_owner", email: "owner@fidatohotels.com", role: "owner" };
export const ADMIN: Person = { uid: "u_admin", email: "admin@fidatohotels.com", role: "admin" };
export const MANAGER: Person = { uid: "u_manager", email: "manager@fidatohotels.com", role: "manager" };
export const SALES_A: Person = { uid: "u_sales_a", email: "a@fidatohotels.com", role: "salesperson" };
export const SALES_B: Person = { uid: "u_sales_b", email: "b@fidatohotels.com", role: "salesperson" };
export const FINANCE: Person = { uid: "u_finance", email: "fin@fidatohotels.com", role: "finance" };
export const VIEWER: Person = { uid: "u_viewer", email: "view@fidatohotels.com", role: "viewer" };
export const ROBOT: Person = { uid: "u_robot", email: "n8n@fidatohotels.com", role: "automation" };
export const DISABLED: Person = {
  uid: "u_gone", email: "gone@fidatohotels.com", role: "admin", status: "disabled",
};

export const EVERYONE = [
  OWNER, ADMIN, MANAGER, SALES_A, SALES_B, FINANCE, VIEWER, ROBOT, DISABLED,
];

/** A Firestore handle authenticated as `person`, subject to the rules. */
export function as(environment: RulesTestEnvironment, person: Person) {
  return context(environment, person).firestore();
}

export function context(
  environment: RulesTestEnvironment,
  person: Person,
): RulesTestContext {
  return environment.authenticatedContext(person.uid, { email: person.email });
}

/** Signed in with no profile document — the enumeration case. */
export function asStranger(environment: RulesTestEnvironment, email = "nobody@example.com") {
  return environment.authenticatedContext("u_stranger", { email }).firestore();
}

export function asAnonymous(environment: RulesTestEnvironment) {
  return environment.unauthenticatedContext().firestore();
}

/**
 * Seeds profiles and fixtures with the rules switched OFF.
 *
 * ⚠️ Fixtures must be written unguarded. Creating them through the
 * rules would make every test depend on the create rule passing, so a
 * broken create rule would show up as dozens of unrelated failures.
 */
export async function seed(environment: RulesTestEnvironment): Promise<void> {
  await environment.clearFirestore();

  await environment.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();

    for (const person of EVERYONE) {
      await setDoc(doc(db, "users", person.uid), {
        authUid: person.uid,
        name: person.uid,
        email: person.email,
        role: person.role,
        status: person.status ?? "active",
        department: "",
        branch: "",
        lastSeenAt: new Date(),
      });
    }

    await setDoc(doc(db, "hotels", "h1"), { name: "Test Property", city: "Pune" });
    await setDoc(doc(db, "hotels/h1/private", "commercial"), {
      hotelId: "h1", commissionPercent: 12,
    });

    // One record each, owned by salesperson A.
    for (const collection of ["customers", "companies"]) {
      await setDoc(doc(db, collection, "owned_by_a"), {
        ownerId: SALES_A.uid, name: "Owned by A",
      });
    }

    await setDoc(doc(db, "reservations", "owned_by_a"), {
      ownerId: SALES_A.uid, status: "confirmed", reference: "FH-1",
    });
    await setDoc(doc(db, "reservations", "completed"), {
      ownerId: SALES_A.uid, status: "completed", reference: "FH-2",
    });

    await setDoc(doc(db, "invoices", "inv1"), { number: "INV-1", customerId: "owned_by_a" });
    await setDoc(doc(db, "payments", "pay1"), { amount: 100, invoiceId: "inv1" });
    await setDoc(doc(db, "commissions", "com1"), { amount: 50, hotelId: "h1" });
    await setDoc(doc(db, "auditLogs", "log1"), { actorId: OWNER.uid, summary: "seeded" });
    await setDoc(doc(db, "automationQueue", "evt1"), {
      type: "reservation.created", status: "pending", attempts: 0,
    });
    await setDoc(doc(db, "settings", "org"), { brandName: "Fidato" });
    await setDoc(doc(db, "invitations", "invited@fidatohotels.com"), {
      email: "invited@fidatohotels.com", name: "Invited", role: "salesperson",
      department: "", branch: "",
    });
  });
}
