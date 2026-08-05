import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import {
  createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { claimInvitation, NoInvitationError, AlreadySetUpError } from "@/lib/session";

/* ══════════════════════════════════════════════════════════════════
   CLAIMING AN INVITATION

   Runs against the Auth + Firestore emulators, exercising the real
   `claimInvitation` rather than a copy of its logic.

       npm run test:auth

   ⚠️ The case that matters is the ORPHANED ACCOUNT: an Auth account
   with no profile. Spark has no Admin SDK, so deleting a user removes
   the `users` document and leaves the Auth account behind — and that
   address then failed both ways. Signing in reported no access;
   signing up reported the account already exists. Somebody holding a
   legitimate invitation had no route in from inside the product.

   These pin the recovery, and pin that it still needs the password.
   ══════════════════════════════════════════════════════════════════ */

const PASSWORD = "correct-horse-battery";
let n = 0;
/** Fresh address per test — the Auth emulator persists within a run. */
const nextEmail = () => `claim${++n}.${Date.now()}@fidatohotels.com`;

/**
 * Seeds an invitation with the rules BYPASSED.
 *
 * ⚠️ Not a convenience. Creating one through the SDK requires an Owner
 * or Admin, so seeding that way would make every test here depend on
 * the invitation-create rule passing — and a break in that rule would
 * surface as six unrelated failures in the claim flow. The emulator's
 * `Bearer owner` token is the documented admin bypass.
 */
async function invite(email: string, role = "salesperson") {
  const url =
    `http://127.0.0.1:8080/v1/projects/fidato-rules-test/databases/(default)` +
    `/documents/invitations/${encodeURIComponent(email)}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        email: { stringValue: email },
        name: { stringValue: "Invited Person" },
        role: { stringValue: role },
        department: { stringValue: "" },
        branch: { stringValue: "" },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not seed invitation: ${response.status} ${await response.text()}`);
  }
}

beforeAll(() => {
  if (!import.meta.env.VITE_USE_FIREBASE_EMULATOR) {
    throw new Error(
      "Refusing to run against the live project. Set VITE_USE_FIREBASE_EMULATOR=1.",
    );
  }
});

beforeEach(async () => {
  await signOut(auth).catch(() => {});
});

describe("claiming a fresh invitation", () => {
  it("creates the account and the profile with the invited role", async () => {
    const email = nextEmail();
    await invite(email, "crs_manager");

    await claimInvitation(email, PASSWORD, "New Person");

    const uid = auth.currentUser!.uid;
    const profile = await getDoc(doc(db, "users", uid));
    expect(profile.exists()).toBe(true);
    expect(profile.data()!.role).toBe("crs_manager");
    expect(profile.data()!.email).toBe(email);
    expect(profile.data()!.status).toBe("active");
  });

  it("consumes the invitation, so it cannot be claimed twice", async () => {
    const email = nextEmail();
    await invite(email);
    await claimInvitation(email, PASSWORD, "First");

    const invitation = await getDoc(doc(db, "invitations", email));
    expect(invitation.exists()).toBe(false);
  });

  /* Without an invitation nothing may be kept, or the sign-up screen
     becomes open registration. */
  it("refuses, and leaves no account behind, when uninvited", async () => {
    const email = nextEmail();

    await expect(claimInvitation(email, PASSWORD, "Nobody"))
      .rejects.toBeInstanceOf(NoInvitationError);

    /* The account it created must be gone — proven by being able to
       create it again, which fails if one still exists. */
    const retry = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    expect(retry.user.uid).toBeTruthy();
  });
});

describe("claiming onto an ORPHANED account", () => {
  /** An Auth account whose profile was deleted — what a removed user leaves. */
  async function orphan(email: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    await deleteDoc(doc(db, "users", cred.user.uid)).catch(() => {});
    await signOut(auth);
  }

  /* ⚠️ THE LOCKOUT. This threw auth/email-already-in-use and the person
     could not get in by any route. */
  it("attaches the invitation to the existing account", async () => {
    const email = nextEmail();
    await orphan(email);
    await invite(email, "manager");

    await claimInvitation(email, PASSWORD, "Recovered");

    const uid = auth.currentUser!.uid;
    const profile = await getDoc(doc(db, "users", uid));
    expect(profile.exists()).toBe(true);
    expect(profile.data()!.role).toBe("manager");
  });

  it("keeps the original account rather than making a second one", async () => {
    const email = nextEmail();
    const first = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    const originalUid = first.user.uid;
    await deleteDoc(doc(db, "users", originalUid)).catch(() => {});
    await signOut(auth);

    await invite(email);
    await claimInvitation(email, PASSWORD, "Recovered");

    expect(auth.currentUser!.uid).toBe(originalUid);
  });

  /* ⚠️ Recovery must still require the password. Otherwise anyone who
     knew an invited address could claim somebody else's account. */
  it("refuses the wrong password", async () => {
    const email = nextEmail();
    await orphan(email);
    await invite(email);

    await expect(claimInvitation(email, "not-the-password", "Impostor"))
      .rejects.toThrow();

    expect(auth.currentUser).toBeNull();
  });

  /* ⚠️ And an uninvited orphan must NOT lose their credentials. The
     cleanup path deletes only an account the claim itself created. */
  it("does not delete a pre-existing account when uninvited", async () => {
    const email = nextEmail();
    await orphan(email);

    await expect(claimInvitation(email, PASSWORD, "Nobody"))
      .rejects.toBeInstanceOf(NoInvitationError);

    // Still theirs, still signable-into.
    const back = await signInWithEmailAndPassword(auth, email, PASSWORD);
    expect(back.user.email).toBe(email);
  });
});

describe("claiming an account that is already set up", () => {
  it("says so instead of looping back to sign-up", async () => {
    const email = nextEmail();
    await invite(email);
    await claimInvitation(email, PASSWORD, "Person");
    await signOut(auth);

    await expect(claimInvitation(email, PASSWORD, "Person"))
      .rejects.toBeInstanceOf(AlreadySetUpError);
  });
});
