import { CheckCircle2, XCircle, PauseCircle, Clock } from "lucide-react";
import { StatusPill, Tooltip } from "@/components/ui";
import { dateTime } from "@/lib/format";
import type { Reservation, ReservationAutomationStatus } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   DID THIS BOOKING REACH n8n?

   ⚠️ "Sent" means n8n ACCEPTED the push — not that the guest received
   an email. Everything after the webhook returns 200 happens inside
   n8n, and this application has no way to observe it. The wording
   stays on the right side of that line deliberately: a badge that
   claimed delivery would be lying about the one thing a salesperson
   would rely on it for.

   ⚠️ `disabled` is not `failed`. One is a setting in Admin →
   Integrations, the other is a broken endpoint, and they send
   different people looking in different places.
   ══════════════════════════════════════════════════════════════════ */

const LOOK: Record<
  ReservationAutomationStatus,
  { tone: "success" | "danger" | "neutral" | "warning"; label: string; icon: typeof CheckCircle2 }
> = {
  sent: { tone: "success", label: "Handed to n8n", icon: CheckCircle2 },
  failed: { tone: "danger", label: "Not sent", icon: XCircle },
  disabled: { tone: "neutral", label: "Automation off", icon: PauseCircle },
  queued: { tone: "warning", label: "Waiting for n8n", icon: Clock },
};

/**
 * An older booking has no `automation` field at all. That is not a
 * failure either — it predates this being recorded, so it says nothing
 * rather than implying something went wrong.
 */
export function AutomationBadge({
  reservation, compact = false,
}: {
  reservation: Reservation;
  compact?: boolean;
}) {
  const a = reservation.automation;
  if (!a) {
    return compact ? (
      <span className="text-sm text-grey-400">—</span>
    ) : null;
  }

  const look = LOOK[a.status] ?? LOOK.queued;
  const Icon = look.icon;

  const explanation = [
    a.detail,
    a.durationMs != null ? `Round trip ${a.durationMs} ms.` : "",
    `Recorded ${dateTime(a.at)}.`,
    a.status === "sent"
      ? "n8n accepted the booking. Whether the guest received the email is reported by n8n, not here."
      : "",
    a.status === "sent" && a.withPdf === false
      ? "The PDF could not be built, so only the HTML voucher was sent."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tooltip content={explanation}>
      <span className="inline-flex">
        <StatusPill tone={look.tone} dot={false}>
          <Icon className="size-3 mr-1" />
          {look.label}
        </StatusPill>
      </span>
    </Tooltip>
  );
}
