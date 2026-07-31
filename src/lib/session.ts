import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultUserForRole } from "@/data/repositories";
import type { Role, ScopeContext } from "@/lib/permissions";
import type { Actor } from "@/data/repositories";

/* ══════════════════════════════════════════════════════════════════
   SESSION
   Phase 1 has no login. The role switcher in the top bar stands in
   for authentication: picking a role assumes that user's identity,
   which is what makes permissions and row-level scoping observable.

   In Phase 2 this store is fed by Firebase Auth instead, and the
   switcher becomes a dev-only affordance.
   ══════════════════════════════════════════════════════════════════ */

interface SessionState {
  role: Role;
  setRole: (role: Role) => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      role: "sales_manager",
      setRole: (role) => set({ role }),
    }),
    { name: "fidato.session" },
  ),
);

/** The user record the current role is acting as. */
export function useCurrentUser() {
  const role = useSession((s) => s.role);
  return defaultUserForRole(role);
}

/** Everything a repository needs to scope a query to this actor. */
export function useScope(): ScopeContext {
  const user = useCurrentUser();
  return { role: user.role, userId: user.id, hotelId: user.hotelId };
}

/** Identity for writes — stamped onto audit entries. */
export function useActor(): Actor {
  const user = useCurrentUser();
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
