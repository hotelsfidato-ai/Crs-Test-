import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Eye, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession, useCurrentUser, signOutOfApp } from "@/lib/session";
import { adminRepo } from "@/data/repositories";
import { ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/permissions";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem, Avatar,
} from "@/components/ui";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";

/* ══════════════════════════════════════════════════════════════════
   ROLE SWITCHER

   Phase 1 had no login page, so this stood in for one. With Firebase
   Auth in place it survives as downward impersonation for Owner and
   Admin: picking a role changes what the interface shows, so
   navigation, dashboards, permissions and row-level scoping all change
   with it. It is the single control that makes the permission model
   reviewable in one sitting.

   ⚠️ OFF UNLESS ENABLED IN SETTINGS. It never granted extra access —
   the security rules read the signed-in account and ignore the
   selection — but it makes the top bar read "Salesperson" while an
   Owner is signed in, and nobody looking at the screen can tell. That
   is fine while the model is being reviewed and wrong the rest of the
   time, so Admin → Settings decides.

   ⚠️ Hiding it is presentation only. `setRole` in the session store
   still refuses anyone who is not an Owner or Admin, and the rules
   never read it at all. Do not treat this switch as the boundary.
   ══════════════════════════════════════════════════════════════════ */

export function RoleSwitcher() {
  const role = useSession((s) => s.role);
  const setRole = useSession((s) => s.setRole);
  const account = useSession((s) => s.account);
  const viewAs = useSession((s) => s.viewAs);
  const user = useCurrentUser();

  /* Read once and cached — this sits in the top bar of every screen,
     so it must not be a query that refires on navigation. */
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => adminRepo.settings(),
    staleTime: 5 * 60_000,
  });

  /* ⚠️ Two independent conditions, and both are presentation. The
     store refuses a non-owner/admin regardless, and the rules never
     read the selection at all. */
  const switchingEnabled = Boolean(settings.data?.allowRoleSwitching);
  const mayImpersonate =
    switchingEnabled && (account?.role === "owner" || account?.role === "admin");

  /* ⚠️ Drop any impersonation the moment the setting goes off.
     Without this, whoever was previewing as a Salesperson when it was
     disabled stays one — the control that would undo it has just
     disappeared, and a reload does not clear it either, because the
     role is derived from the account and the stale viewAs. */
  useEffect(() => {
    if (!switchingEnabled && viewAs && account) setRole(account.role);
  }, [switchingEnabled, viewAs, account, setRole]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          /* The name and role are hidden below `sm`, so the button would
             otherwise be an unlabelled avatar to a screen reader. */
          aria-label={`Viewing as ${ROLE_LABELS[role]} (${user.name}). Change role`}
          className={cn(
            "flex items-center gap-2.5 h-9 pl-1.5 pr-2.5 rounded-md",
            "border border-grey-200 bg-white",
            "hover:border-grey-300 hover:bg-grey-50",
            "transition-colors duration-150",
          )}
        >
          <Avatar name={user.name} size="sm" />
          <span className="hidden sm:flex flex-col items-start leading-none min-w-0">
            <span className="text-xs font-medium text-ink-900 truncate max-w-[130px]">
              {user.name}
            </span>
            <span className="text-2xs text-grey-500 mt-0.5">{ROLE_LABELS[role]}</span>
          </span>
          <ChevronDown className="size-3.5 text-grey-400 shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-[300px]" align="end">
        {mayImpersonate && (
          <div className="flex items-start gap-2 px-2.5 py-2 mb-1 rounded-sm bg-brand-orange-50">
            <Eye className="size-3.5 text-brand-orange-700 shrink-0 mt-0.5" />
            <p className="text-xs text-brand-orange-700 leading-snug">
              Changes what you see, not what you may do. Every write is still recorded
              against your own account.
            </p>
          </div>
        )}

        {mayImpersonate && <DropdownMenuLabel>Viewing as</DropdownMenuLabel>}

        {mayImpersonate && ASSIGNABLE_ROLES.map((r) => (
          <DropdownPrimitive.Item
            key={r}
            onSelect={() => setRole(r)}
            className={cn(
              "flex items-start gap-2.5 px-2.5 py-2 rounded-sm cursor-pointer select-none outline-none",
              "transition-colors duration-150",
              "data-[highlighted]:bg-grey-100",
            )}
          >
            <Check
              className={cn(
                "size-4 shrink-0 mt-0.5 text-brand-orange",
                r === role ? "opacity-100" : "opacity-0",
              )}
            />
            <span className="min-w-0">
              <span className="block text-base text-ink-900">{ROLE_LABELS[r]}</span>
              <span className="block text-xs text-grey-500 leading-snug mt-0.5">
                {ROLE_DESCRIPTIONS[r]}
              </span>
            </span>
          </DropdownPrimitive.Item>
        ))}

        {mayImpersonate && <DropdownMenuSeparator />}

        <div className="px-2.5 py-1.5">
          <p className="text-2xs text-grey-400">
            Signed in as {account?.name ?? user.name} · {account?.email ?? user.email}
          </p>
          {user.hotelName && (
            <p className="text-2xs text-grey-400 mt-0.5">Property: {user.hotelName}</p>
          )}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => void signOutOfApp()}>
          <LogOut className="size-4 text-grey-400" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
