import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails, assertSucceeds, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import {
  getEnv, teardown, seed, as, asStranger, asAnonymous,
  OWNER, ADMIN, CRS, MANAGER, SALES_A, SALES_B, FINANCE, VIEWER, ROBOT, DISABLED,
} from "./setup";

/* ══════════════════════════════════════════════════════════════════
   FIRESTORE SECURITY RULES

   The half of the permission model that actually enforces anything.
   src/lib/permissions.ts decides what to render; this decides what the
   SDK will allow, and only this survives someone opening a console.

   ⚠️ Nothing here imports the permission matrix. A test that reads the
   same table the code reads proves the table equals itself.
   ══════════════════════════════════════════════════════════════════ */

let env: RulesTestEnvironment;

beforeAll(async () => { env = await getEnv(); });
afterAll(async () => { await teardown(); });
beforeEach(async () => { await seed(env); });

/* ── The front door ────────────────────────────────────────────── */

describe("unauthenticated access", () => {
  it("cannot read anything", async () => {
    const db = asAnonymous(env);
    await assertFails(getDoc(doc(db, "hotels", "h1")));
    await assertFails(getDoc(doc(db, "customers", "owned_by_a")));
    await assertFails(getDoc(doc(db, "reservations", "owned_by_a")));
    await assertFails(getDoc(doc(db, "invoices", "inv1")));
  });

  it("cannot write anything", async () => {
    const db = asAnonymous(env);
    await assertFails(setDoc(doc(db, "customers", "new"), { name: "X" }));
    await assertFails(setDoc(doc(db, "hotels", "new"), { name: "X" }));
  });
});

describe("signed in but with no profile", () => {
  /* The account exists in Auth but has no users document, which is
     what an uninvited sign-up produces. It must be inert. */
  it("cannot read business data", async () => {
    const db = asStranger(env);
    await assertFails(getDoc(doc(db, "hotels", "h1")));
    await assertFails(getDoc(doc(db, "customers", "owned_by_a")));
    await assertFails(getDoc(doc(db, "reservations", "owned_by_a")));
  });

  it("cannot create records", async () => {
    const db = asStranger(env);
    await assertFails(setDoc(doc(db, "customers", "x"), { ownerId: "u_stranger" }));
  });
});

describe("a disabled account", () => {
  /* Disabling is the substitute for deletion, so it has to actually
     revoke. An admin whose status is "disabled" keeps role: admin. */
  it("is refused despite holding the admin role", async () => {
    const db = as(env, DISABLED);
    await assertFails(getDoc(doc(db, "hotels", "h1")));
    await assertFails(setDoc(doc(db, "hotels", "new"), { name: "X" }));
    await assertFails(getDoc(doc(db, "hotels/h1/private", "commercial")));
  });
});

/* ── Privilege escalation ──────────────────────────────────────────
   The tests that matter most. Everything else in this file assumes
   role is trustworthy.                                              */

describe("nobody can promote themselves", () => {
  it("a salesperson cannot make themselves owner", async () => {
    const db = as(env, SALES_A);
    await assertFails(updateDoc(doc(db, "users", SALES_A.uid), { role: "owner" }));
  });

  it("a salesperson cannot make themselves admin", async () => {
    const db = as(env, SALES_A);
    await assertFails(updateDoc(doc(db, "users", SALES_A.uid), { role: "admin" }));
  });

  it("a viewer cannot re-activate a disabled colleague", async () => {
    const db = as(env, VIEWER);
    await assertFails(updateDoc(doc(db, "users", DISABLED.uid), { status: "active" }));
  });

  it("a salesperson cannot edit anyone else's profile", async () => {
    const db = as(env, SALES_A);
    await assertFails(updateDoc(doc(db, "users", SALES_B.uid), { name: "Renamed" }));
  });

  it("but may edit their own name", async () => {
    const db = as(env, SALES_A);
    await assertSucceeds(updateDoc(doc(db, "users", SALES_A.uid), { name: "New Name" }));
  });

  /* ── Administering users: Owner and Admin ──────────────────────
     ⚠️ `edit` on a user sets `role`, and every rule in this file trusts
     that field. What keeps an Admin from simply promoting themselves is
     the owner-escalation guard, which these pin.                    */

  it("an admin can change a role and disable an account", async () => {
    const db = as(env, ADMIN);
    await assertSucceeds(updateDoc(doc(db, "users", SALES_A.uid), { role: "manager" }));
    await assertSucceeds(updateDoc(doc(db, "users", SALES_A.uid), { status: "disabled" }));
  });

  /* The escalation the guard exists to stop, in one write. */
  it("an admin cannot promote anyone to owner", async () => {
    const db = as(env, ADMIN);
    await assertFails(updateDoc(doc(db, "users", SALES_A.uid), { role: "owner" }));
  });

  it("an admin cannot touch an existing owner's record", async () => {
    const db = as(env, ADMIN);
    await assertFails(updateDoc(doc(db, "users", OWNER.uid), { status: "disabled" }));
  });

  it("a crs manager and a manager cannot administer users at all", async () => {
    for (const person of [CRS, MANAGER]) {
      await assertFails(
        updateDoc(doc(as(env, person), "users", SALES_A.uid), { role: "admin" }),
      );
      await assertFails(deleteDoc(doc(as(env, person), "users", SALES_B.uid)));
    }
  });

  it("owner and admin can delete a user", async () => {
    await assertSucceeds(deleteDoc(doc(as(env, ADMIN), "users", SALES_B.uid)));
    await assertSucceeds(deleteDoc(doc(as(env, OWNER), "users", VIEWER.uid)));
  });

  /* Losing your own profile signs you out of an account you cannot
     sign back into — `active()` reads that document. */
  it("nobody can delete themselves", async () => {
    await assertFails(deleteDoc(doc(as(env, ADMIN), "users", ADMIN.uid)));
    await assertFails(deleteDoc(doc(as(env, OWNER), "users", OWNER.uid)));
  });

  it("an admin cannot delete an owner", async () => {
    await assertFails(deleteDoc(doc(as(env, ADMIN), "users", OWNER.uid)));
  });

  it("nobody may mint the automation account", async () => {
    const db = as(env, OWNER);
    await assertFails(updateDoc(doc(db, "users", SALES_B.uid), { role: "automation" }));
  });

  /* ⚠️ The two-move escalation this rule exists to stop: an Admin
     invites an Owner at an address they control, then signs up as it. */
  it("an admin cannot invite an owner", async () => {
    const db = as(env, ADMIN);
    await assertFails(
      setDoc(doc(db, "invitations", "new@fidatohotels.com"), {
        email: "new@fidatohotels.com", name: "New", role: "owner",
      }),
    );
  });

  it("an owner can invite an owner", async () => {
    const db = as(env, OWNER);
    await assertSucceeds(
      setDoc(doc(db, "invitations", "new@fidatohotels.com"), {
        email: "new@fidatohotels.com", name: "New", role: "owner",
      }),
    );
  });

  it("an admin cannot promote an existing user to owner", async () => {
    const db = as(env, ADMIN);
    await assertFails(updateDoc(doc(db, "users", MANAGER.uid), { role: "owner" }));
  });

  it("an admin cannot demote an owner", async () => {
    const db = as(env, ADMIN);
    await assertFails(updateDoc(doc(db, "users", OWNER.uid), { role: "viewer" }));
  });

  /* ⚠️ The service account must never be assignable to a person. */
  it("nobody can invite the automation role", async () => {
    for (const person of [OWNER, ADMIN]) {
      const db = as(env, person);
      await assertFails(
        setDoc(doc(db, "invitations", "bot@fidatohotels.com"), {
          email: "bot@fidatohotels.com", name: "Bot", role: "automation",
        }),
      );
    }
  });

  it("an owner cannot grant the automation role to an existing user", async () => {
    const db = as(env, OWNER);
    await assertFails(updateDoc(doc(db, "users", VIEWER.uid), { role: "automation" }));
  });
});

/* ── Invitations ───────────────────────────────────────────────── */

describe("invitations", () => {
  it("only an owner or admin may create one", async () => {
    for (const person of [MANAGER, SALES_A, FINANCE, VIEWER]) {
      const db = as(env, person);
      await assertFails(
        setDoc(doc(db, "invitations", "x@fidatohotels.com"), {
          email: "x@fidatohotels.com", name: "X", role: "salesperson",
        }),
      );
    }
    await assertSucceeds(
      setDoc(doc(as(env, ADMIN), "invitations", "x@fidatohotels.com"), {
        email: "x@fidatohotels.com", name: "X", role: "salesperson",
      }),
    );
  });

  /* ⚠️ You may read only the invitation addressed to you. Anything
     looser turns this collection into a staff directory for anyone who
     can create an account. */
  it("cannot be read by someone it is not addressed to", async () => {
    const db = asStranger(env, "someoneelse@example.com");
    await assertFails(getDoc(doc(db, "invitations", "invited@fidatohotels.com")));
  });

  it("can be read by the person it is addressed to", async () => {
    const db = asStranger(env, "invited@fidatohotels.com");
    await assertSucceeds(getDoc(doc(db, "invitations", "invited@fidatohotels.com")));
  });

  it("cannot be listed by an outsider", async () => {
    const db = asStranger(env);
    await assertFails(getDocs(collection(db, "invitations")));
  });
});

/* ── Claiming an invitation ────────────────────────────────────── */

describe("claiming an invitation", () => {
  const invitee = { uid: "u_new", email: "invited@fidatohotels.com" };

  function asInvitee() {
    return env.authenticatedContext(invitee.uid, { email: invitee.email }).firestore();
  }

  const profile = (over: Record<string, unknown> = {}) => ({
    authUid: invitee.uid,
    name: "Invited",
    email: invitee.email,
    role: "salesperson",
    status: "active",
    ...over,
  });

  it("succeeds with the invited role", async () => {
    await assertSucceeds(setDoc(doc(asInvitee(), "users", invitee.uid), profile()));
  });

  /* ⚠️ The rule re-reads the invitation rather than trusting the
     payload, so editing the client hands you nothing. */
  it("fails when claiming a role richer than the one invited", async () => {
    await assertFails(
      setDoc(doc(asInvitee(), "users", invitee.uid), profile({ role: "owner" })),
    );
    await assertFails(
      setDoc(doc(asInvitee(), "users", invitee.uid), profile({ role: "admin" })),
    );
  });

  it("fails when writing to somebody else's uid", async () => {
    await assertFails(setDoc(doc(asInvitee(), "users", "u_someone_else"), profile()));
  });

  it("fails when no invitation exists for that address", async () => {
    const db = env
      .authenticatedContext("u_uninvited", { email: "uninvited@example.com" })
      .firestore();
    await assertFails(
      setDoc(doc(db, "users", "u_uninvited"), {
        authUid: "u_uninvited", name: "Nobody", email: "uninvited@example.com",
        role: "salesperson", status: "active",
      }),
    );
  });

  it("fails when the profile email does not match the account", async () => {
    await assertFails(
      setDoc(doc(asInvitee(), "users", invitee.uid), profile({ email: "other@example.com" })),
    );
  });
});

/* ── Commission ────────────────────────────────────────────────────
   The requirement stated as "visible ONLY to Owner, Admin".          */

describe("commercial terms", () => {
  it("are readable by owner and admin", async () => {
    for (const person of [OWNER, ADMIN]) {
      await assertSucceeds(getDoc(doc(as(env, person), "hotels/h1/private", "commercial")));
    }
  });

  /* Finance is the interesting denial: they handle the money but not
     the terms Fidato negotiated to earn it. */
  it("are denied to manager, finance, salesperson and viewer", async () => {
    for (const person of [MANAGER, FINANCE, SALES_A, VIEWER]) {
      await assertFails(getDoc(doc(as(env, person), "hotels/h1/private", "commercial")));
    }
  });

  it("are denied to the automation account", async () => {
    await assertFails(getDoc(doc(as(env, ROBOT), "hotels/h1/private", "commercial")));
  });

  it("are writable only by owner and admin", async () => {
    await assertSucceeds(
      setDoc(doc(as(env, ADMIN), "hotels/h1/private", "commercial"), { commissionPercent: 15 }),
    );
    await assertFails(
      setDoc(doc(as(env, MANAGER), "hotels/h1/private", "commercial"), { commissionPercent: 15 }),
    );
  });

  /* ⚠️ The hotel document itself stays readable — that is the point of
     the subcollection. If this ever fails, commission has been moved
     back onto the hotel and is exposed to everyone. */
  it("do not make the hotel itself unreadable", async () => {
    await assertSucceeds(getDoc(doc(as(env, SALES_A), "hotels", "h1")));
  });

  it("keep commission rows owner-and-admin only", async () => {
    await assertSucceeds(getDoc(doc(as(env, OWNER), "commissions", "com1")));
    await assertFails(getDoc(doc(as(env, FINANCE), "commissions", "com1")));
    await assertFails(getDoc(doc(as(env, MANAGER), "commissions", "com1")));
  });
});

/* ── Invoices ──────────────────────────────────────────────────────
   "Visible ONLY to Owner, Admin, Manager" — plus Finance, who do the
   work.                                                              */

describe("the invoice module", () => {
  it("is readable by owner, admin, manager and finance", async () => {
    for (const person of [OWNER, ADMIN, MANAGER, FINANCE]) {
      await assertSucceeds(getDoc(doc(as(env, person), "invoices", "inv1")));
    }
  });

  it("is denied to salespeople and viewers", async () => {
    for (const person of [SALES_A, VIEWER]) {
      await assertFails(getDoc(doc(as(env, person), "invoices", "inv1")));
    }
  });

  it("cannot be written by a salesperson", async () => {
    await assertFails(
      setDoc(doc(as(env, SALES_A), "invoices", "inv2"), { number: "INV-2" }),
    );
  });

  it("keeps payments to owner, admin and finance for writes", async () => {
    await assertSucceeds(
      setDoc(doc(as(env, FINANCE), "payments", "pay2"), { amount: 10, invoiceId: "inv1" }),
    );
    await assertFails(
      setDoc(doc(as(env, MANAGER), "payments", "pay3"), { amount: 10, invoiceId: "inv1" }),
    );
  });
});

/* ── Row-level scoping ─────────────────────────────────────────── */

describe("a salesperson sees only their own book", () => {
  it("can read their own customer", async () => {
    await assertSucceeds(getDoc(doc(as(env, SALES_A), "customers", "owned_by_a")));
  });

  it("cannot read a colleague's customer", async () => {
    await assertFails(getDoc(doc(as(env, SALES_B), "customers", "owned_by_a")));
  });

  it("cannot read a colleague's reservation", async () => {
    await assertFails(getDoc(doc(as(env, SALES_B), "reservations", "owned_by_a")));
  });

  it("cannot create a record owned by someone else", async () => {
    await assertFails(
      setDoc(doc(as(env, SALES_A), "customers", "new"), {
        ownerId: SALES_B.uid, name: "Poached",
      }),
    );
  });

  it("can create a record they own", async () => {
    await assertSucceeds(
      setDoc(doc(as(env, SALES_A), "customers", "new"), {
        ownerId: SALES_A.uid, name: "Mine",
      }),
    );
  });

  it("does not constrain a manager", async () => {
    await assertSucceeds(getDoc(doc(as(env, MANAGER), "customers", "owned_by_a")));
    await assertSucceeds(getDoc(doc(as(env, MANAGER), "reservations", "owned_by_a")));
  });
});

/* ── Immutability ──────────────────────────────────────────────── */

describe("what may be removed, and by whom", () => {
  /* ⚠️ A booking raised in error can be removed by the desk. Cancelling
     remains the norm — a cancellation with its reason is the audit
     story and a deletion is a hole — but a mistyped booking that was
     never billed should not sit in the book forever. */
  it("lets the CRS desk delete a confirmed reservation", async () => {
    for (const person of [OWNER, ADMIN, CRS]) {
      await seed(env);
      await assertSucceeds(deleteDoc(doc(as(env, person), "reservations", "owned_by_a")));
    }
  });

  /* ⚠️ A Manager edits the book but does not delete from it. Amending
     leaves an audit row; deleting leaves a gap. */
  it("refuses a manager, who may still amend", async () => {
    await assertFails(deleteDoc(doc(as(env, MANAGER), "reservations", "owned_by_a")));
    await assertSucceeds(
      updateDoc(doc(as(env, MANAGER), "reservations", "owned_by_a"), { status: "checked_in" }),
    );
  });

  /* The salesperson raises bookings; the desk amends and removes them. */
  it("refuses a salesperson, even on their own booking", async () => {
    await assertFails(deleteDoc(doc(as(env, SALES_A), "reservations", "owned_by_a")));
    await assertFails(
      updateDoc(doc(as(env, SALES_A), "reservations", "owned_by_a"), { status: "checked_in" }),
    );
  });

  /* ⚠️ An invoice or a commission almost certainly references a
     completed booking, and Firestore will not stop those rows pointing
     at nothing. Cancel instead. */
  it("refuses to delete a completed reservation, even as owner", async () => {
    await assertFails(deleteDoc(doc(as(env, OWNER), "reservations", "completed")));
  });

  it("still refuses to delete a customer, a company or an invoice", async () => {
    const db = as(env, OWNER);
    await assertFails(deleteDoc(doc(db, "customers", "owned_by_a")));
    await assertFails(deleteDoc(doc(db, "companies", "owned_by_a")));
    await assertFails(deleteDoc(doc(db, "invoices", "inv1")));
  });

  /* BR-04. A completed booking is an accounting record; reopening it
     changes a figure an invoice was already raised against. */
  it("refuses to edit a completed reservation, even as owner", async () => {
    await assertFails(
      updateDoc(doc(as(env, OWNER), "reservations", "completed"), { status: "confirmed" }),
    );
  });

  it("allows editing a confirmed one", async () => {
    await assertSucceeds(
      updateDoc(doc(as(env, MANAGER), "reservations", "owned_by_a"), { status: "checked_in" }),
    );
  });
});

describe("the audit trail is append-only", () => {
  it("accepts an entry stamped with the writer's own id", async () => {
    await assertSucceeds(
      setDoc(doc(as(env, SALES_A), "auditLogs", "new"), {
        actorId: SALES_A.uid, entityType: "customer", summary: "did a thing",
      }),
    );
  });

  /* ⚠️ Forging another actor is the one thing a client could do to
     make the trail lie about who acted. */
  it("refuses an entry attributed to somebody else", async () => {
    await assertFails(
      setDoc(doc(as(env, SALES_A), "auditLogs", "forged"), {
        actorId: OWNER.uid, entityType: "customer", summary: "wasn't me",
      }),
    );
  });

  it("refuses to alter or remove an existing entry", async () => {
    const db = as(env, OWNER);
    await assertFails(updateDoc(doc(db, "auditLogs", "log1"), { summary: "rewritten" }));
    await assertFails(deleteDoc(doc(db, "auditLogs", "log1")));
  });

  it("is not readable by a salesperson", async () => {
    await assertFails(getDoc(doc(as(env, SALES_A), "auditLogs", "log1")));
  });
});

/* ── The n8n seam ──────────────────────────────────────────────── */

describe("the automation queue", () => {
  it("accepts an event from any active user", async () => {
    await assertSucceeds(
      setDoc(doc(as(env, SALES_A), "automationQueue", "new"), {
        type: "reservation.created", status: "pending", attempts: 0,
      }),
    );
  });

  /* ⚠️ A client must not be able to write an event already marked
     done — that is how you skip processing entirely. */
  it("refuses an event that starts in any state but pending", async () => {
    await assertFails(
      setDoc(doc(as(env, SALES_A), "automationQueue", "sneaky"), {
        type: "reservation.created", status: "done", attempts: 0,
      }),
    );
  });

  it("lets the automation account drain it", async () => {
    await assertSucceeds(getDoc(doc(as(env, ROBOT), "automationQueue", "evt1")));
    await assertSucceeds(
      updateDoc(doc(as(env, ROBOT), "automationQueue", "evt1"), { status: "done" }),
    );
  });

  it("is not readable by a salesperson", async () => {
    await assertFails(getDoc(doc(as(env, SALES_A), "automationQueue", "evt1")));
  });
});

describe("the automation account", () => {
  it("may read business records it has to act on", async () => {
    const db = as(env, ROBOT);
    await assertSucceeds(getDoc(doc(db, "reservations", "owned_by_a")));
    await assertSucceeds(getDoc(doc(db, "customers", "owned_by_a")));
    await assertSucceeds(getDoc(doc(db, "invoices", "inv1")));
  });

  /* ⚠️ A compromised n8n instance must not become an identity
     provider. It reads business data; it does not administer people. */
  it("cannot administer users or invitations", async () => {
    const db = as(env, ROBOT);
    await assertFails(updateDoc(doc(db, "users", VIEWER.uid), { role: "owner" }));
    await assertFails(
      setDoc(doc(db, "invitations", "bot2@fidatohotels.com"), {
        email: "bot2@fidatohotels.com", name: "Bot", role: "admin",
      }),
    );
  });
});

/* ── Configuration ─────────────────────────────────────────────── */

describe("hotels and configuration", () => {
  it("are readable by every active user", async () => {
    for (const person of [OWNER, ADMIN, MANAGER, SALES_A, FINANCE, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(env, person), "hotels", "h1")));
    }
  });

  it("are writable by owner, admin and manager only", async () => {
    await assertSucceeds(setDoc(doc(as(env, MANAGER), "hotels", "h2"), { name: "New" }));
    await assertFails(setDoc(doc(as(env, SALES_A), "hotels", "h3"), { name: "New" }));
    await assertFails(setDoc(doc(as(env, FINANCE), "hotels", "h4"), { name: "New" }));
  });

  it("keeps org settings readable but owner/admin-writable", async () => {
    await assertSucceeds(getDoc(doc(as(env, SALES_A), "settings", "org")));
    await assertFails(setDoc(doc(as(env, MANAGER), "settings", "org"), { brandName: "X" }));
    await assertSucceeds(setDoc(doc(as(env, OWNER), "settings", "org"), { brandName: "X" }));
  });
});

/* ── Default deny ──────────────────────────────────────────────── */

describe("collections nobody wrote a rule for", () => {
  /* ⚠️ The property that makes adding a collection safe: it is
     unreachable until someone deliberately opens it. */
  it("are closed even to an owner", async () => {
    const db = as(env, OWNER);
    await assertFails(getDoc(doc(db, "someFutureCollection", "x")));
    await assertFails(setDoc(doc(db, "someFutureCollection", "x"), { a: 1 }));
  });
});

/* ══════════════════════════════════════════════════════════════════
   CRS MANAGER, AND LEAD OWNERSHIP

   The role exists to work every account from a central desk, and to
   raise bookings on behalf of the salesperson who will own them.
   ══════════════════════════════════════════════════════════════════ */

describe("the CRS manager", () => {
  it("reads every customer and company, whoever owns them", async () => {
    const db = as(env, CRS);
    await assertSucceeds(getDoc(doc(db, "customers", "owned_by_a")));
    await assertSucceeds(getDoc(doc(db, "customers", "owned_by_b")));
    await assertSucceeds(getDoc(doc(db, "companies", "owned_by_a")));
    await assertSucceeds(getDoc(doc(db, "companies", "owned_by_b")));
  });

  it("reads every reservation", async () => {
    await assertSucceeds(getDoc(doc(as(env, CRS), "reservations", "owned_by_a")));
  });

  /* ⚠️ The behaviour the role is for: the booking is raised by the CRS
     desk but owned by the salesperson, so it lands in their list and
     against their name. */
  it("can raise a booking owned by somebody else", async () => {
    await assertSucceeds(
      setDoc(doc(as(env, CRS), "reservations", "on_behalf"), {
        ownerId: SALES_A.uid, status: "confirmed", reference: "FH-3",
      }),
    );
  });

  it("can edit a booking it does not own", async () => {
    await assertSucceeds(
      updateDoc(doc(as(env, CRS), "reservations", "owned_by_a"), { status: "checked_in" }),
    );
  });

  it("may read invoices", async () => {
    await assertSucceeds(getDoc(doc(as(env, CRS), "invoices", "inv1")));
  });

  /* Seeing every booking is not the same as setting what Fidato earns
     on one, or deciding who else gets an account. */
  it("cannot read commission terms", async () => {
    await assertFails(getDoc(doc(as(env, CRS), "hotels/h1/private", "commercial")));
    await assertFails(getDoc(doc(as(env, CRS), "commissions", "com1")));
  });

  it("cannot invite users or change roles", async () => {
    const db = as(env, CRS);
    await assertFails(
      setDoc(doc(db, "invitations", "x@fidatohotels.com"), {
        email: "x@fidatohotels.com", name: "X", role: "salesperson",
      }),
    );
    await assertFails(updateDoc(doc(db, "users", VIEWER.uid), { role: "admin" }));
  });
});

describe("lead ownership between salespeople", () => {
  /* The requirement: a lead belongs to whoever created it, and a
     colleague is not allowed to look at it. */
  it("hides one salesperson's customer from another", async () => {
    await assertFails(getDoc(doc(as(env, SALES_B), "customers", "owned_by_a")));
    await assertFails(getDoc(doc(as(env, SALES_A), "customers", "owned_by_b")));
  });

  it("hides one salesperson's company from another", async () => {
    await assertFails(getDoc(doc(as(env, SALES_B), "companies", "owned_by_a")));
    await assertFails(getDoc(doc(as(env, SALES_A), "companies", "owned_by_b")));
  });

  it("stops a salesperson editing a colleague's lead", async () => {
    await assertFails(
      updateDoc(doc(as(env, SALES_B), "customers", "owned_by_a"), { name: "Poached" }),
    );
  });

  /* ⚠️ A salesperson must not be able to reassign work to themselves,
     which is what creating a record under another owner would allow in
     reverse. */
  it("stops a salesperson creating a lead owned by a colleague", async () => {
    await assertFails(
      setDoc(doc(as(env, SALES_B), "customers", "new_one"), {
        ownerId: SALES_A.uid, name: "Not mine to give",
      }),
    );
  });

  it("lets owner, admin and crs manager see both", async () => {
    for (const person of [OWNER, ADMIN, CRS]) {
      await assertSucceeds(getDoc(doc(as(env, person), "customers", "owned_by_a")));
      await assertSucceeds(getDoc(doc(as(env, person), "customers", "owned_by_b")));
    }
  });
});

/* ══════════════════════════════════════════════════════════════════
   THE n8n WEBHOOK CONFIGURATION

   Lives at settings/webhook. Readable by every active user because the
   browser has to read it to push an event; writable only by Owner and
   Admin, because changing the URL redirects every future booking.
   ══════════════════════════════════════════════════════════════════ */

describe("the webhook configuration", () => {
  it("is readable by any active user, since the browser posts the event", async () => {
    for (const person of [SALES_A, CRS, FINANCE, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(env, person), "settings", "webhook")));
    }
  });

  /* ⚠️ Redirecting the endpoint silently reroutes every guest email and
     every property notification. That is an administrator's decision. */
  it("is writable only by owner and admin", async () => {
    for (const person of [OWNER, ADMIN]) {
      await assertSucceeds(
        setDoc(doc(as(env, person), "settings", "webhook"), {
          url: "https://n8n.example.com/webhook/x", enabled: true,
        }),
      );
    }
    for (const person of [CRS, MANAGER, SALES_A, FINANCE, VIEWER]) {
      await assertFails(
        setDoc(doc(as(env, person), "settings", "webhook"), {
          url: "https://evil.example.com/webhook", enabled: true,
        }),
      );
    }
  });

  it("cannot be read at all by someone with no profile", async () => {
    await assertFails(getDoc(doc(asStranger(env), "settings", "webhook")));
  });
});

/* ══════════════════════════════════════════════════════════════════
   A SALESPERSON CREATES BUT DOES NOT AMEND

   They add their own leads and cannot alter them afterwards. A
   customer record is what an invoice and a commission attach to, so
   changing an email or a company after a booking exists silently
   redirects a voucher or moves a stay onto another account.
   ══════════════════════════════════════════════════════════════════ */

describe("a salesperson's write access to leads", () => {
  it("can still create a customer and a company they own", async () => {
    const db = as(env, SALES_A);
    await assertSucceeds(
      setDoc(doc(db, "customers", "fresh_lead"), {
        ownerId: SALES_A.uid, fullName: "New Lead",
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, "companies", "fresh_account"), {
        ownerId: SALES_A.uid, name: "New Account",
      }),
    );
  });

  /* ⚠️ The point of the change: even their OWN record is read-only
     once created. */
  it("cannot edit their own customer after creating it", async () => {
    await assertFails(
      updateDoc(doc(as(env, SALES_A), "customers", "owned_by_a"), {
        email: "redirected@example.com",
      }),
    );
  });

  it("cannot edit their own company after creating it", async () => {
    await assertFails(
      updateDoc(doc(as(env, SALES_A), "companies", "owned_by_a"), {
        negotiatedDiscountPercent: 50,
      }),
    );
  });

  it("cannot delete either, and neither can anyone else", async () => {
    for (const person of [SALES_A, CRS, MANAGER, ADMIN, OWNER]) {
      await assertFails(deleteDoc(doc(as(env, person), "customers", "owned_by_a")));
      await assertFails(deleteDoc(doc(as(env, person), "companies", "owned_by_a")));
    }
  });

  it("leaves corrections to the CRS desk, admin, manager and owner", async () => {
    for (const person of [CRS, MANAGER, ADMIN, OWNER]) {
      await assertSucceeds(
        updateDoc(doc(as(env, person), "customers", "owned_by_a"), { city: "Pune" }),
      );
      await assertSucceeds(
        updateDoc(doc(as(env, person), "companies", "owned_by_a"), { city: "Pune" }),
      );
    }
  });

  /* ⚠️ Extends to their bookings too, and this test used to assert the
     opposite. A salesperson RAISES a reservation and the desk owns it
     from that moment: a confirmed booking is what an invoice, a
     commission and a voucher already in the guest's hands hang off, so
     changing a date or a rate afterwards silently restates all three. */
  it("extends to their own reservations — they raise, the desk amends", async () => {
    await assertFails(
      updateDoc(doc(as(env, SALES_A), "reservations", "owned_by_a"), { status: "checked_in" }),
    );
  });

  it("but they can still raise one", async () => {
    await assertSucceeds(
      setDoc(doc(as(env, SALES_A), "reservations", "fresh"), {
        ownerId: SALES_A.uid, status: "confirmed", reference: "FH-NEW",
      }),
    );
  });

  /* ⚠️ The regression this guards against: creating a reservation bumps
     the customer/company roll-up counters in the same transaction, from
     the owning salesperson's own session. Without this carve-out, every
     booking a salesperson made failed at the last step. */
  it("can still bump the roll-up counters on their own customer and company", async () => {
    await assertSucceeds(
      updateDoc(doc(as(env, SALES_A), "customers", "owned_by_a"), {
        totalReservations: 4, totalRevenue: 52000, lastActivityAt: "2026-08-04",
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as(env, SALES_A), "companies", "owned_by_a"), {
        totalReservations: 4, totalRevenue: 52000, lastActivityAt: "2026-08-04",
      }),
    );
  });

  it("cannot smuggle another field in alongside a roll-up update", async () => {
    await assertFails(
      updateDoc(doc(as(env, SALES_A), "customers", "owned_by_a"), {
        totalReservations: 4, email: "redirected@example.com",
      }),
    );
  });

  it("cannot bump roll-up counters on someone else's customer or company", async () => {
    await assertFails(
      updateDoc(doc(as(env, SALES_B), "customers", "owned_by_a"), {
        totalReservations: 4, totalRevenue: 52000, lastActivityAt: "2026-08-04",
      }),
    );
  });
});
