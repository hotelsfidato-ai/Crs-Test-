import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, PauseCircle } from "lucide-react";
import { reservationsRepo } from "@/data/repositories";
import { useScope } from "@/lib/session";
import { Card } from "@/components/ui";

/* ══════════════════════════════════════════════════════════════════
   AUTOMATION HEALTH

   How many recent bookings did NOT reach n8n.

   ⚠️ Counted from reservations, not from automationQueue. The queue is
   readable only by Owner and Admin, so a count taken from there would
   be blank for the salesperson who made the booking — the one person
   who needs to know their guest was never emailed.

   ⚠️ Scoped like every other reservation read, so a salesperson sees
   their own failures and a manager sees everyone's.

   ⚠️ Silent when everything is fine. A banner that is always on screen
   stops being read, and this one only earns its space when something
   needs doing.
   ══════════════════════════════════════════════════════════════════ */

export function AutomationHealthBanner() {
  const scope = useScope();

  const { data } = useQuery({
    queryKey: ["automation-health", scope],
    queryFn: () => reservationsRepo.automationHealth(scope),
    // Cheap enough to keep current, slow enough not to be chatty.
    staleTime: 30_000,
  });

  if (!data) return null;
  const { failed, disabled } = data;
  if (!failed && !disabled) return null;

  /* A broken endpoint outranks a switched-off one: if both are true the
     failures are the thing somebody has to act on. */
  if (failed > 0) {
    return (
      <Card className="mb-5 border-brand-red-100 bg-brand-red-50">
        <div className="flex items-start gap-3 p-4">
          <AlertTriangle className="size-4 text-brand-red shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-base font-medium text-brand-red">
              {failed} recent booking{failed === 1 ? "" : "s"} did not reach n8n
            </p>
            <p className="text-sm text-brand-red mt-1 leading-relaxed">
              Those guests have not been emailed a voucher. Open the booking and use
              Voucher to send it manually, then check{" "}
              <Link to="/admin/integrations" className="underline font-medium">
                Admin → Integrations
              </Link>{" "}
              — the endpoint is refusing or unreachable.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-5 border-grey-200 bg-grey-50">
      <div className="flex items-start gap-3 p-4">
        <PauseCircle className="size-4 text-grey-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-base font-medium text-ink-900">
            Automation is off — {disabled} recent booking{disabled === 1 ? "" : "s"} not sent
          </p>
          <p className="text-sm text-grey-600 mt-1 leading-relaxed">
            Nothing was attempted, so no guest has been emailed. Turn on “Push events” in{" "}
            <Link to="/admin/integrations" className="underline font-medium">
              Admin → Integrations
            </Link>
            . Existing bookings are not resent when you do.
          </p>
        </div>
      </div>
    </Card>
  );
}
