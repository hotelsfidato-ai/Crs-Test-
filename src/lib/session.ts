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

interface SessionState {
  status: Status;
  account: SessionUser | null;
  /** Impersonation. Null means "act as my own role". */
  viewAs: Role | null;
  /** The effective role — what every screen reads. */
  role: Role;
  setRole: (role: Role) => void;
  setAccount: (account: SessionUser | null, status: Status) => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      status: "loading",
      account: null,
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

      setAccount: (account, status) =>
        set({
          account,
          status,
          // Impersonation never survives a sign-in.
          viewAs: null,
          role: account?.role ?? ANONYMOUS.role,
        }),
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
export function useAuthListener(): void {
  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        useSession.getState().setAccount(null, "signed_out");
        return;
      }

      const profile = await profileFor(firebaseUser.uid);

      if (!profile || profile.status === "disabled") {
        await signOut(auth);
        useSession.getState().setAccount(null, "signed_out");
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
  const credential = await createUserWithEmailAndPassword(auth, address, password);
  const uid = credential.user.uid;

  const invitation = await getDoc(doc(db, "invitations", address)).catch(() => null);

  if (!invitation?.exists()) {
    await deleteUser(credential.user).catch(() => signOut(auth));
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
}

export class NoInvitationError extends Error {
  constructor() {
    super("No invitation exists for that address.");
    this.name = "NoInvitationError";
  }
}

export async function signOutOfApp(): Promise<void> {
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
