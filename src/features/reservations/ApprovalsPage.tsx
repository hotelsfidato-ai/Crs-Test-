import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Ban, ArrowRight, ShieldCheck } from "lucide-react";
import { useSession, useActor, useScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { reservationsRepo } from "@/data/repositories";
import { money, dateShort, relative, humanise } from "@/lib/format";
import { APPROVAL_THRESHOLD } from "@/lib/rules";
import { CANCELLATION_REASONS } from "@/lib/vocabulary";
import {
  Page, PageHeader, Card, CardBody, Button, EmptyState, StatusPill,
  Skeleton, Stat, Dialog, DialogContent, DialogTrigger, DialogClose,
  Field, Textarea, NativeSelect, toast, Avatar,
} from "@/components/ui";
import type { Reservation } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   APPROVAL QUEUE
   Everything at or above ₹50,000 that has not yet been signed off,
   largest first — the ones holding up the most money get seen first.
   ══════════════════════════════════════════════════════════════════ */

export default function ApprovalsPage() {
  const role = useSession((s) => s.role);
  const scope = useScope();

  const { data, isLoading } = useQuery({
    queryKey: ["pending-approvals", scope.role, scope.userId],
    queryFn: () => reservationsRepo.pendingApprovals(scope),
  });

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + r.totalAmount, 0);
  const canDecide = can(role, "approve", "reservation_approval");

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Reservations", to: "/reservations" }, { label: "Approvals" }]}
        title="Approval queue"
        description={`Reservations at or above ${money(APPROVAL_THRESHOLD)} stay unconfirmed until a sales manager or admin signs them off.`}
      />

      {!canDecide && (
        <Card className="mb-6 bg-grey-50">
          <CardBody className="flex items-start gap-3">
            <ShieldCheck className="size-4 text-grey-400 shrink-0 mt-0.5" />
            <p className="text-base text-grey-600 leading-relaxed">
              You can see this queue but not act on it. Approving is limited to sales
              managers and admins — switch role in the top bar to try it.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
        <Card className="p-5">
          <Stat label="Waiting" value={rows.length} hint="Reservations" />
        </Card>
        <Card className="p-5">
          <Stat label="Value held" value={money(total)} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Largest"
            value={rows[0] ? money(rows[0].totalAmount) : "—"}
            hint={rows[0]?.hotelName}
          />
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 />}
            title="The queue is clear"
            description="Nothing is waiting on approval. Bookings above ₹50,000 will appear here automatically."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link to="/reservations">All reservations</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <ApprovalCard key={r.id} reservation={r} canDecide={canDecide} />
          ))}
        </div>
      )}
    </Page>
  );
}

function ApprovalCard({
  reservation: r, canDecide,
}: {
  reservation: Reservation;
  canDecide: boolean;
}) {
  const actor = useActor();
  const queryClient = useQueryClient();

  const decide = useMutation({
    mutationFn: (input: { status: "confirmed" | "cancelled"; note?: string; reason?: string }) =>
      reservationsRepo.setStatus(r.id, input.status, actor, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservation", r.id] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      toast.success(
        updated.status === "confirmed" ? "Approved" : "Declined",
        `${updated.reference} is now ${updated.status === "confirmed" ? "confirmed" : "cancelled"}.`,
      );
    },
    onError: () => toast.error("Could not update", "Nothing was changed."),
  });

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Link
                to={`/reservations/${r.id}`}
                className="text-md font-semibold text-ink-900 hover:text-brand-orange transition-colors duration-150 tabular"
              >
                {r.reference}
              </Link>
              <StatusPill tone="warning">Pending approval</StatusPill>
              <StatusPill tone="neutral" dot={false}>
                {humanise(r.channel)}
              </StatusPill>
            </div>

            <p className="text-base text-ink-900 mt-2">
              {r.customerName}
              {r.companyName && <span className="text-grey-500"> · {r.companyName}</span>}
            </p>
            <p className="text-base text-grey-600 mt-0.5">
              {r.hotelName}, {r.hotelCity}
            </p>

            <div className="flex items-center gap-x-5 gap-y-1 flex-wrap mt-3 text-sm text-grey-500">
              <span className="tabular">
                {dateShort(r.checkIn)} → {dateShort(r.checkOut)}
              </span>
              <span>
                {r.nights} night{r.nights === 1 ? "" : "s"}
              </span>
              <span>
                {r.totalRooms} room{r.totalRooms === 1 ? "" : "s"}
              </span>
              <span className="flex items-center gap-1.5">
                <Avatar name={r.ownerName} color="#9aa2a9" size="xs" />
                {r.ownerName} · {relative(r.createdAt)}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-2xl font-semibold text-ink-900 tabular">
              {money(r.totalAmount)}
            </p>
            <p className="text-sm text-grey-500 mt-0.5">
              {money(Math.round(r.totalAmount / r.nights / r.totalRooms))} per room-night
            </p>

            {canDecide && (
              <div className="flex items-center gap-2 mt-4 justify-end">
                <DeclineDialog
                  reference={r.reference}
                  pending={decide.isPending}
                  onDecline={(reason) => decide.mutate({ status: "cancelled", reason })}
                />
                <ApproveDialog
                  reference={r.reference}
                  amount={r.totalAmount}
                  pending={decide.isPending}
                  onApprove={(note) => decide.mutate({ status: "confirmed", note })}
                />
              </div>
            )}

            {!canDecide && (
              <Button asChild variant="secondary" size="sm" className="mt-4" trailingIcon={<ArrowRight className="size-3.5" />}>
                <Link to={`/reservations/${r.id}`}>View</Link>
              </Button>
            )}
          </div>
        </div>

        {r.specialRequests && (
          <p className="text-sm text-grey-600 mt-4 pt-4 border-t border-grey-100 leading-relaxed">
            <span className="text-grey-400">Special request: </span>
            {r.specialRequests}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function ApproveDialog({
  reference, amount, onApprove, pending,
}: {
  reference: string;
  amount: number;
  onApprove: (note: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState("");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm" leadingIcon={<CheckCircle2 className="size-4" />}>
          Approve
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Approve ${reference}?`}
        description={`${money(amount)} — this confirms the booking and releases the guest confirmation.`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="primary" loading={pending} onClick={() => onApprove(note)}>
                Approve and confirm
              </Button>
            </DialogClose>
          </>
        }
      >
        <Field label="Approval note" hint="Recorded on the audit trail">
          {({ id }) => (
            <Textarea
              id={id}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Within the account's negotiated band."
            />
          )}
        </Field>
      </DialogContent>
    </Dialog>
  );
}

function DeclineDialog({
  reference, onDecline, pending,
}: {
  reference: string;
  onDecline: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState<string>(
    "Rate not approved by the client's finance team",
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" leadingIcon={<Ban className="size-4" />}>
          Decline
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Decline ${reference}?`}
        description="Declining cancels the reservation. The record is kept for audit."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Go back</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger" loading={pending} onClick={() => onDecline(reason)}>
                Decline and cancel
              </Button>
            </DialogClose>
          </>
        }
      >
        <Field label="Reason" required>
          {({ id }) => (
            <NativeSelect id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
              {CANCELLATION_REASONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <p className="text-sm text-grey-500 mt-4 leading-relaxed">
          The salesperson who raised it is notified, and the rooms return to inventory.
        </p>
      </DialogContent>
    </Dialog>
  );
}

