import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, updateProfile, createUserWithEmailAndPassword,
  deleteUser,
} from "firebase/auth";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ASSIGNABLE_ROLES, type Role, type ScopeContext } from "@/lib/permissions";
import type { Actor } from "@/data/repositories";
import type { Invitation, User, UserStatus } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   SESSION

   Phase 1 had no login — a role switcher stood in for identity.
   Phase 2 replaces that with Firebase Auth. The switcher survives,
   but only as downward impersonation for Owner and Admin: it can
   never grant a permission the signed-in account does not already
   have, because the security rules read the account, not the store.

   ⚠️ The role lives in `users/{docId}.role`, not in a custom claim.
   Custom claims need the Admin SDK, which needs a server, which needs
   Blaze. Rules therefore do a document lookup — see firestore.rules.
   ══════════════════════════════════════════════════════════════════ */

export interface SessionUser {
  id: string;
  authUid: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  hotelId?: string;
  hotelName?: string;
}

/** Used before auth resolves and after sign-out. Grants nothing. */
const ANONYMOUS: SessionUser = {
  id: "",
  authUid: "",
  name: "Signed out",
  email: "",
  role: "viewer",
  status: "disabled",
};

type Status = "loading" | "signed_out" | "signed_in";

/**
 * Why a signed-in account was rejected.
 *
 * ⚠️ Without this the rejection is invisible: sign-in succeeds, the
 * listener signs the account straight back out, and the person lands on
 * the login screen with a correct password and no explanation. That is
 * indistinguishable from a wrong password, and it is exactly what
 * happens to an account created in the Firebase console instead of
 * through /signup.
 */
export type AuthIssue = "no_profile" | "disabled";

interface SessionState {
  status: Status;
  account: SessionUser | null;
  /** Set when the last sign-in attempt was rejected after authenticating. */
  issue: AuthIssue | null;
  /** Impersonation. Null means "act as my own role". */
  viewAs: Role | null;
  /** The effective role — what every screen reads. */
  role: Role;
  setRole: (role: Role) => void;
  setAccount: (account: SessionUser | null, status: Status, issue?: AuthIssue | null) => void;
  clearIssue: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      status: "loading",
      account: null,
      issue: null,
      viewAs: null,
      role: ANONYMOUS.role,

      /**
       * Impersonation, not elevation.
       *
       * ⚠️ Ignored unless the signed-in account is Owner or Admin. A
       * salesperson calling this changes nothing — and would gain
       * nothing anyway, since the rules never see this value.
       */
      setRole: (role) => {
        const { account } = get();
        if (!account) return;
        if (account.role !== "owner" && account.role !== "admin") return;
        if (!ASSIGNABLE_ROLES.includes(role)) return;
        const viewAs = role === account.role ? null : role;
        set({ viewAs, role });
      },

      setAccount: (account, status, issue = null) =>
        set({
          account,
          status,
          issue,
          // Impersonation never survives a sign-in.
          viewAs: null,
          role: account?.role ?? ANONYMOUS.role,
        }),

      clearIssue: () => set({ issue: null }),
    }),
    {
      name: "fidato.session",
      // ⚠️ Nothing about identity is persisted. Firebase Auth owns the
      // session; persisting a role here would let a stale localStorage
      // entry outlive a revoked account.
      partialize: () => ({}) as SessionState,
    },
  ),
);

/* ── Wiring ────────────────────────────────────────────────────────
   Mounted once, at the app root.                                    */

/**
 * Subscribes the store to Firebase Auth.
 *
 * ⚠️ Signing in is not the same as having access. The Auth account
 * proves who you are; the `users` document says what you may do. An
 * account with no matching document — or a disabled one — is signed
 * out again rather than left in a half-authenticated state.
 */
/**
 * Suppresses the listener while an invitation is being claimed.
 *
 * ⚠️ Without this, sign-up cannot work at all.
 * `createUserWithEmailAndPassword` fires `onAuthStateChanged`
 * immediately — before `users/{uid}` has been written, because writing
 * it requires being signed in first. The listener would find no
 * profile, sign the brand-new account out, and the very next write
 * would then be rejected for being unauthenticated.
 *
 * The account is mid-creation, not rejected. `claimInvitation`
 * populates the session itself once the profile exists.
 */
let claiming = false;

export function useAuthListener(): void {
  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (claiming) return;

      if (!firebaseUser) {
        // A plain sign-out, not a rejection — keep any issue already set,
        // or the reason vanishes before the login screen can show it.
        const { issue } = useSession.getState();
        useSession.getState().setAccount(null, "signed_out", issue);
        return;
      }

      const profile = await profileFor(firebaseUser.uid);

      if (!profile || profile.status === "disabled") {
        // ⚠️ Record why BEFORE signing out. signOut re-enters this
        // listener, and the branch above reads what we set here.
        useSession
          .getState()
          .setAccount(null, "signed_out", profile ? "disabled" : "no_profile");
        await signOut(auth);
        return;
      }

      useSession.getState().setAccount(profile, "signed_in");
    });
  }, []);
}

/**
 * Loads the profile for an Auth account.
 *
 * ⚠️ One direct read at `users/{uid}` — no query. The security rules
 * resolve the caller's role the same way, so the document id has to be
 * the uid. A profile found any other way would be a profile the rules
 * cannot see.
 */
async function profileFor(authUid: string): Promise<SessionUser | null> {
  const snap = await getDoc(doc(db, "users", authUid)).catch(() => null);
  if (!snap?.exists()) return null;
  const data = snap.data() as User;

  return {
    id: snap.id,
    authUid,
    name: data.name,
    email: data.email,
    role: data.role,
    status: data.status,
    hotelId: data.hotelId,
    hotelName: data.hotelName,
  };
}

/* ── Actions ───────────────────────────────────────────────────── */

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
}

/**
 * Completes an invitation: creates the Auth account and the profile.
 *
 * ⚠️ On Spark nobody can create an account on someone else's behalf —
 * that needs the Admin SDK. So sign-up is open, and the *invitation*
 * is the gate: an account with no `users/{uid}` document is signed
 * straight back out by the listener above.
 *
 * Order matters. The auth account has to exist before the invitation
 * can be read, because the rule on `invitations` requires the caller's
 * own email. If no invitation is found the account is deleted again,
 * so a failed attempt leaves nothing behind.
 *
 * ⚠️ The role is copied from the invitation, and the security rule on
 * `users` re-reads that same invitation to verify it. A client cannot
 * hand itself a role by editing this call.
 */
export async function claimInvitation(
  email: string,
  password: string,
  displayName: string,
): Promise<void> {
  const address = email.trim().toLowerCase();

  // Held for the whole sequence — see the note on `claiming`.
  claiming = true;
  try {
    await claim(address, password, displayName);
  } finally {
    claiming = false;
  }
}

async function claim(
  address: string,
  password: string,
  displayName: string,
): Promise<void> {
  /* ⚠️ An Auth account can outlive its profile, and this used to be a
     dead end.
     Firebase Spark has no Admin SDK, so removing a user deletes the
     `users` document and leaves the Auth account behind. That address
     then fails BOTH ways: signing in reports no access because there is
     no profile, and signing up reports the account already exists. The
     person is locked out of an invitation they legitimately hold, with
     no way forward from inside the product.

     So when the account already exists, prove ownership by signing in
     with the password they just typed, then claim the invitation
     against it. Nothing is weakened: an invitation is still required,
     the profile is still written at users/{uid}, and the rules still
     refuse any role that does not match the invitation. Somebody
     without the password gets nowhere. */
  let credential;
  let accountIsNew = true;

  try {
    credential = await createUserWithEmailAndPassword(auth, address, password);
  } catch (error) {
    if (!isFirebaseCode(error, "auth/email-already-in-use")) throw error;

    accountIsNew = false;
    // Throws auth/wrong-password or auth/invalid-credential if it is
    // not theirs — which the sign-up screen translates.
    credential = await signInWithEmailAndPassword(auth, address, password);

    /* Already has a profile, so this is not an orphan and not a claim.
       Sending them round the sign-up loop again would be pointless. */
    const existing = await getDoc(doc(db, "users", credential.user.uid)).catch(() => null);
    if (existing?.exists()) throw new AlreadySetUpError();
  }

  const uid = credential.user.uid;

  const invitation = await getDoc(doc(db, "invitations", address)).catch(() => null);

  if (!invitation?.exists()) {
    /* ⚠️ Only delete an account this call created. Deleting a
       pre-existing one would destroy somebody's credentials because
       an administrator had not got round to inviting them yet. */
    if (accountIsNew) {
      await deleteUser(credential.user).catch(() => signOut(auth));
    } else {
      await signOut(auth);
    }
    throw new NoInvitationError();
  }

  const invited = invitation.data() as Invitation;
  const name = displayName.trim() || invited.name || address;

  if (name) await updateProfile(credential.user, { displayName: name });

  await setDoc(doc(db, "users", uid), {
    authUid: uid,
    name,
    email: address,
    role: invited.role,
    status: "active",
    department: invited.department ?? "",
    branch: invited.branch ?? "",
    ...(invited.hotelId ? { hotelId: invited.hotelId, hotelName: invited.hotelName } : {}),
    invitedAt: invited.invitedAt ?? null,
    lastSeenAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });

  /* The invitation has done its job. Leaving it would let a second
     account claim the same role at the same address. */
  await deleteDoc(doc(db, "invitations", address)).catch(() => {
    /* The profile exists, which is what matters. A stale invitation is
       visible on the users screen and can be withdrawn there. */
  });

  /* The listener was suppressed for this whole sequence, so nothing has
     populated the session. Do it here, from the profile just written. */
  const profile = await profileFor(uid);
  if (profile) useSession.getState().setAccount(profile, "signed_in");
}

export class NoInvitationError extends Error {
  constructor() {
    super("No invitation exists for that address.");
    this.name = "NoInvitationError";
  }
}

/**
 * The account exists AND already has a profile — so it is set up, and
 * the person is on the wrong screen. Distinct from
 * `auth/email-already-in-use`, which now only means an Auth account
 * exists; that one is recoverable and this one is not a fault at all.
 */
export class AlreadySetUpError extends Error {
  constructor() {
    super("That account is already set up.");
    this.name = "AlreadySetUpError";
  }
}

/** Narrows an unknown catch to a Firebase error with a given code. */
function isFirebaseCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === code;
}

export async function signOutOfApp(): Promise<void> {
  // A deliberate sign-out is not a rejection.
  useSession.getState().clearIssue();
  await signOut(auth);
}

/**
 * Sends a reset link.
 *
 * ⚠️ Resolves even when the address is unknown. Reporting "no such
 * account" turns the reset form into a way to test which email
 * addresses exist here.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  } catch {
    /* deliberately silent — see above */
  }
}

export async function updateDisplayName(name: string): Promise<void> {
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: name });
}

/* ── Selectors ─────────────────────────────────────────────────── */

/** The user record the current role is acting as. */
export function useCurrentUser(): SessionUser {
  const account = useSession((s) => s.account);
  const role = useSession((s) => s.role);
  if (!account) return ANONYMOUS;
  return role === account.role ? account : { ...account, role };
}

/** True while an Owner or Admin is viewing the product as someone else. */
export function useIsImpersonating(): boolean {
  return useSession((s) => s.viewAs !== null);
}

/** Everything a repository needs to scope a query to this actor. */
export function useScope(): ScopeContext {
  const user = useCurrentUser();
  return { role: user.role, userId: user.id, hotelId: user.hotelId };
}

/**
 * Identity for writes — stamped onto audit entries.
 *
 * ⚠️ Deliberately the *real* account, never the impersonated one. An
 * audit row that records the costume rather than the person wearing
 * it is worse than no audit row.
 */
export function useActor(): Actor {
  const account = useSession((s) => s.account);
  const user = account ?? ANONYMOUS;
  return { id: user.id, name: user.name, role: user.role };
}

/* ── UI state ──────────────────────────────────────────────────── */

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      commandOpen: false,
      setCommandOpen: (open) => set({ commandOpen: open }),
      aiPanelOpen: false,
      setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
    }),
    {
      name: "fidato.ui",
      // Only the durable preference is worth persisting.
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }) as UiState,
    },
  ),
);
