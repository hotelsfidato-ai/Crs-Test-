import { Check, ChevronDown, Eye, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession, useCurrentUser, signOutOfApp } from "@/lib/session";
import { ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/permissions";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem, Avatar,
} from "@/components/ui";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";

/* ══════════════════════════════════════════════════════════════════
   ROLE SWITCHER
   Phase 1 had no login page, so this control stood in for one. With
   Firebase Auth in place it survives as downward impersonation for
   Owner and Admin: picking a role changes what the interface shows,
   so navigation, dashboards,
   permissions and row-level scoping all change with it. It is the
   single control that makes the whole permission model reviewable.
   ══════════════════════════════════════════════════════════════════ */

export function RoleSwitcher() {
  const role = useSession((s) => s.role);
  const setRole = useSession((s) => s.setRole);
  const account = useSession((s) => s.account);
  const user = useCurrentUser();

  /* ⚠️ Impersonation is Owner and Admin only, and the store enforces
     that independently — this is presentation, not the control. Even
     when it is shown, it changes nothing server-side: the security
     rules read the signed-in account, never this selection. */
  const mayImpersonate = account?.role === "owner" || account?.role === "admin";

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
