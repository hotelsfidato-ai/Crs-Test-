import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, CheckCheck, Mail, MessageSquare, Smartphone, Monitor, FileCog,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { notificationsRepo } from "@/data/repositories";
import { relative, humanise } from "@/lib/format";
import {
  Page, PageHeader, Card, Button, EmptyState, StatusPill, Skeleton,
  Segmented, Stat,
} from "@/components/ui";
import type { AppNotification, NotificationChannel } from "@/data/types";

const CHANNEL_ICONS: Record<NotificationChannel, typeof Mail> = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: Smartphone,
  in_app: Monitor,
  push: Bell,
};

/* Approvals and payments are the categories people actually act on, so
   they are the ones given visual weight. */
const URGENT_CATEGORIES = new Set(["approval", "payment"]);

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsRepo.list(),
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsRepo.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsRepo.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  const all = data ?? [];
  const unread = all.filter((n) => !n.isRead);
  const rows = filter === "unread" ? unread : all;

  return (
    <Page>
      <PageHeader
        title="Notifications"
        description="Everything the platform has told you, across every channel."
        actions={
          <>
            <Button asChild variant="secondary" leadingIcon={<FileCog className="size-4" />}>
              <Link to="/notifications/templates">Templates</Link>
            </Button>
            {unread.length > 0 && (
              <Button
                variant="secondary"
                leadingIcon={<CheckCheck className="size-4" />}
                loading={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                Mark all read
              </Button>
            )}
          </>
        }
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All (${all.length})` },
              { value: "unread", label: `Unread (${unread.length})` },
            ]}
          />
        </div>
      </PageHeader>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Total" value={all.length} />
        </Card>
        <Card className="p-5">
          <Stat label="Unread" value={unread.length} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Needs action"
            value={all.filter((n) => URGENT_CATEGORIES.has(n.category)).length}
            hint="Approvals and payments"
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Channels"
            value={new Set(all.map((n) => n.channel)).size}
            hint="In use"
          />
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell />}
            title={filter === "unread" ? "Nothing unread" : "No notifications"}
            description={
              filter === "unread"
                ? "You are up to date."
                : "Notifications arrive when something needs your attention — an approval, an overdue invoice, a cancellation."
            }
            action={
              filter === "unread" && (
                <Button variant="secondary" size="sm" onClick={() => setFilter("all")}>
                  Show all
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-grey-100">
            {rows.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onOpen={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
              />
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}

function NotificationRow({
  notification: n, onOpen,
}: {
  notification: AppNotification;
  onOpen: () => void;
}) {
  const Icon = CHANNEL_ICONS[n.channel] ?? Bell;
  const urgent = URGENT_CATEGORIES.has(n.category);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex items-start gap-3.5 w-full text-left px-5 py-4",
          "hover:bg-grey-50 transition-colors duration-150",
          !n.isRead && "bg-brand-orange-50/30",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center size-9 rounded-full shrink-0",
            urgent && !n.isRead
              ? "bg-brand-red-50 text-brand-red"
              : !n.isRead
                ? "bg-brand-orange-50 text-brand-orange"
                : "bg-grey-100 text-grey-400",
          )}
        >
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p
              className={cn(
                "text-base truncate",
                n.isRead ? "text-grey-700" : "text-ink-900 font-medium",
              )}
            >
              {n.title}
            </p>
            <span className="text-sm text-grey-400 shrink-0">{relative(n.at)}</span>
          </div>

          <p className="text-base text-grey-600 mt-0.5 leading-relaxed">{n.body}</p>

          <div className="flex items-center gap-2 mt-2">
            <StatusPill tone="neutral" dot={false}>
              {humanise(n.category)}
            </StatusPill>
            <StatusPill tone="neutral" dot={false}>
              {humanise(n.channel)}
            </StatusPill>
            {n.actorName && (
              <span className="text-2xs text-grey-400">by {n.actorName}</span>
            )}
            {!n.isRead && (
              <span className="text-2xs text-brand-orange font-medium ml-auto">Unread</span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
