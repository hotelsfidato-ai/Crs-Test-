import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Menu, Search, Sparkles, CheckCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUi, useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { notificationsRepo } from "@/data/repositories";
import { relative } from "@/lib/format";
import { RoleSwitcher } from "./RoleSwitcher";
import {
  Button, Drawer, DrawerContent, DrawerTrigger, StatusPill,
  EmptyState, Skeleton, type Tone,
} from "@/components/ui";

/* ══════════════════════════════════════════════════════════════════
   TOP BAR
   Search, notifications, the AI panel and the role switcher. Nothing
   else earns a place up here — create actions belong to the page
   header, where they sit beside the other actions for that screen.
   ══════════════════════════════════════════════════════════════════ */

const CATEGORY_TONES: Record<string, Tone> = {
  approval: "warning",
  reservation: "info",
  payment: "danger",
  automation: "accent",
  customer: "info",
  system: "neutral",
};

export function TopBar() {
  const role = useSession((s) => s.role);
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  const setMobileNavOpen = useUi((s) => s.setMobileNavOpen);
  const setAiPanelOpen = useUi((s) => s.setAiPanelOpen);

  const canUseAi = can(role, "view", "ai");

  return (
    <header className="flex items-center gap-3 h-14 px-4 sm:px-5 bg-white border-b border-grey-200 shrink-0">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="lg:hidden p-1.5 -ml-1.5 rounded-md text-grey-500 hover:bg-grey-100 hover:text-ink-900 transition-colors duration-150"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      {/* Search opens the palette rather than being a second search box. */}
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        /* Collapses to an icon below `sm`, so it needs its own name. */
        aria-label="Search or jump to a record"
        className={cn(
          "flex items-center gap-2.5 h-9 px-3 rounded-md min-w-0",
          "border border-grey-200 bg-grey-50 text-grey-400",
          "hover:bg-white hover:border-grey-300 transition-colors duration-150",
          "w-9 sm:w-64 lg:w-80 justify-center sm:justify-start",
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden sm:block text-base truncate">Search or jump to…</span>
        <kbd className="hidden lg:inline-flex items-center h-5 px-1.5 ml-auto rounded-xs bg-white border border-grey-200 text-2xs font-medium text-grey-500">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1.5 ml-auto">
        {/* No create action here. Every screen where raising a booking is
            the natural next step already offers it in its page header, at
            every width — putting one here too would place two primary
            buttons on the same view. ⌘K covers the global path. */}
        {canUseAi && (
          <button
            type="button"
            onClick={() => setAiPanelOpen(true)}
            className="p-2 rounded-md text-grey-500 hover:bg-grey-100 hover:text-ink-900 transition-colors duration-150"
            aria-label="Open AI assistant"
            title="AI assistant"
          >
            <Sparkles className="size-[18px]" />
          </button>
        )}

        <NotificationBell />

        <div className="w-px h-6 bg-grey-200 mx-1" />

        <RoleSwitcher />
      </div>
    </header>
  );
}

function NotificationBell() {
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsRepo.list(),
  });

  const unread = notifications?.filter((n) => !n.isRead).length ?? 0;

  const markAll = useMutation({
    mutationFn: () => notificationsRepo.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => notificationsRepo.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="relative p-2 rounded-md text-grey-500 hover:bg-grey-100 hover:text-ink-900 transition-colors duration-150"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-brand-orange text-white text-[9px] font-semibold tabular">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DrawerTrigger>

      <DrawerContent
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "You are all caught up"}
        footer={
          unread > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => markAll.mutate()}
              loading={markAll.isPending}
              leadingIcon={<CheckCheck className="size-4" />}
            >
              Mark all as read
            </Button>
          )
        }
      >
        {isLoading ? (
          <div className="p-5 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : !notifications?.length ? (
          <EmptyState
            icon={<Bell />}
            title="No notifications"
            description="Approvals, arrivals and payment alerts will appear here."
          />
        ) : (
          <ul className="divide-y divide-grey-100">
            {notifications.map((n) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className={cn(
                        "text-base leading-snug",
                        n.isRead ? "text-grey-600" : "text-ink-900 font-medium",
                      )}
                    >
                      {n.title}
                    </p>
                    {!n.isRead && (
                      <span className="size-1.5 rounded-full bg-brand-orange shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-sm text-grey-500 mt-1 leading-snug">{n.body}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <StatusPill tone={CATEGORY_TONES[n.category] ?? "neutral"} dot={false}>
                      {n.category}
                    </StatusPill>
                    <span className="text-2xs text-grey-400">{relative(n.at)}</span>
                  </div>
                </>
              );

              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={() => !n.isRead && markOne.mutate(n.id)}
                      className={cn(
                        "block px-5 py-3.5 transition-colors duration-150 hover:bg-grey-50",
                        !n.isRead && "bg-brand-orange-50/40",
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={cn("px-5 py-3.5", !n.isRead && "bg-brand-orange-50/40")}>
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DrawerContent>
    </Drawer>
  );
}
