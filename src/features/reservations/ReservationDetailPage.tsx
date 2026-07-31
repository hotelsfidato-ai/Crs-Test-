import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban, CheckCircle2, Lock, Mail, FileText, Sparkles, Building2,
  Hotel as HotelIcon, User, Download, LogIn, LogOut,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession, useActor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { reservationsRepo } from "@/data/repositories";
import {
  money, moneyPrecise, dateShort, dateTime, nightsLabel, humanise, relative,
} from "@/lib/format";
import {
  canCancelReservation, canEditReservation, labelFor, nextStatuses, isTerminal,
} from "@/lib/rules";
import { summariseReservation } from "@/features/ai/responses";
import { CANCELLATION_REASONS } from "@/data/seed/names";
import {
  Page, PageHeader, Button, Card, CardHeader, CardBody, DetailList, DetailRow,
  StatusPill, RESERVATION_TONES, Skeleton, Tabs, TabsList, TabsTrigger,
  TabsContent, Dialog, DialogContent, DialogTrigger, DialogClose, NativeSelect,
  Textarea, Field, toast, Stat, EmptyState, Tooltip, Avatar,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import type { ReservationStatus } from "@/data/types";

export default function ReservationDetailPage() {
  const { id = "" } = useParams();
  const role = useSession((s) => s.role);
  const actor = useActor();
  const queryClient = useQueryClient();

  const reservation = useQuery({
    queryKey: ["reservation", id],
    queryFn: () => reservationsRepo.get(id),
  });

  const audit = useQuery({
    queryKey: ["reservation-audit", id],
    queryFn: () => reservationsRepo.audit(id),
  });

  const setStatus = useMutation({
    mutationFn: (input: { status: ReservationStatus; reason?: string; note?: string }) =>
      reservationsRepo.setStatus(id, input.status, actor, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["reservation", id] });
      queryClient.invalidateQueries({ queryKey: ["reservation-audit", id] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      toast.success(`Reservation ${labelFor(updated.status).toLowerCase()}`, updated.reference);
    },
    onError: () => toast.error("Could not update", "Nothing was changed."),
  });

  if (reservation.isLoading) return <DetailSkeleton />;
  if (!reservation.data) return <NotFound />;

  const r = reservation.data;
  const cancelCheck = canCancelReservation(role, r);
  const editCheck = canEditReservation(role, r);
  const locked = isTerminal(r.status);
  const transitions = nextStatuses(r.status);
  const canApprove =
    r.status === "pending_approval" && can(role, "approve", "reservation_approval");

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Reservations", to: "/reservations" },
          { label: r.reference },
        ]}
        title={r.reference}
        description={`${r.customerName} · ${r.hotelName}, ${r.hotelCity}`}
        badge={
          <div className="flex items-center gap-2">
            <StatusPill tone={RESERVATION_TONES[r.status] ?? "neutral"}>
              {labelFor(r.status)}
            </StatusPill>
            {locked && (
              <Tooltip content="Completed and cancelled reservations are locked against edits">
                <span className="inline-flex items-center gap-1 text-2xs text-grey-400">
                  <Lock className="size-3" />
                  Locked
                </span>
              </Tooltip>
            )}
          </div>
        }
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<Download className="size-4" />}
              onClick={() =>
                toast.success(
                  "Voucher generated",
                  "In Phase 2 this renders the branded PDF and emails it to the guest.",
                )
              }
            >
              Voucher
            </Button>

            {canApprove && (
              <ApproveDialog
                onApprove={(note) => setStatus.mutate({ status: "confirmed", note })}
                amount={r.totalAmount}
                pending={setStatus.isPending}
              />
            )}

            {!canApprove && transitions.includes("checked_in") && editCheck.allowed && (
              <Button
                variant="primary"
                leadingIcon={<LogIn className="size-4" />}
                loading={setStatus.isPending}
                onClick={() => setStatus.mutate({ status: "checked_in" })}
              >
                Check in
              </Button>
            )}

            {transitions.includes("completed") && editCheck.allowed && (
              <Button
                variant="primary"
                leadingIcon={<LogOut className="size-4" />}
                loading={setStatus.isPending}
                onClick={() => setStatus.mutate({ status: "completed" })}
              >
                Check out
              </Button>
            )}

            {/* Cancel is always offered where legal — there is no delete. */}
            {cancelCheck.allowed ? (
              <CancelDialog
                reference={r.reference}
                pending={setStatus.isPending}
                onCancel={(reason) => setStatus.mutate({ status: "cancelled", reason })}
              />
            ) : (
              <Tooltip content={cancelCheck.reason}>
                <span>
                  <Button variant="secondary" disabled leadingIcon={<Ban className="size-4" />}>
                    Cancel
                  </Button>
                </span>
              </Tooltip>
            )}
          </>
        }
      />

      {/* ── Locked / approval banners ── */}
      {r.status === "pending_approval" && (
        <Card className="mb-6 border-brand-yellow-100 bg-brand-yellow-50">
          <CardBody className="flex items-start gap-3 py-4">
            <CheckCircle2 className="size-4 text-[#8a6300] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-base font-medium text-[#8a6300]">Waiting on approval</p>
              <p className="text-sm text-[#8a6300] mt-1 leading-relaxed">
                At {money(r.totalAmount)} this booking is at or above the ₹50,000
                threshold. It stays unconfirmed until a sales manager or admin signs it
                off. Raised by {r.ownerName} {relative(r.createdAt)}.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {r.status === "cancelled" && (
        <Card className="mb-6 border-brand-red-100 bg-brand-red-50">
          <CardBody className="flex items-start gap-3 py-4">
            <Ban className="size-4 text-brand-red shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-base font-medium text-brand-red">Cancelled</p>
              <p className="text-sm text-brand-red mt-1 leading-relaxed">
                {r.cancellationReason || "No reason recorded"} · cancelled by{" "}
                {r.cancelledBy} on {r.cancelledAt ? dateTime(r.cancelledAt) : "—"}. The
                record is kept for audit — reservations are never deleted.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Summary strip ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat
            label="Stay"
            value={dateShort(r.checkIn)}
            hint={`${nightsLabel(r.checkIn, r.checkOut)} → ${dateShort(r.checkOut)}`}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Rooms"
            value={r.totalRooms}
            hint={`${r.totalAdults} adults${r.totalChildren ? `, ${r.totalChildren} children` : ""}`}
          />
        </Card>
        <Card className="p-5">
          <Stat label="Channel" value={humanise(r.channel)} hint={`Owner: ${r.ownerName}`} />
        </Card>
        <Card className="p-5">
          <Stat label="Total" value={money(r.totalAmount)} hint="Including GST" />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="folio">
            <TabsList>
              <TabsTrigger value="folio">Folio</TabsTrigger>
              <TabsTrigger value="guests" count={r.guests.length}>
                Guests
              </TabsTrigger>
              <TabsTrigger value="timeline" count={audit.data?.length}>
                Timeline
              </TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            {/* ── Folio ── */}
            <TabsContent value="folio">
              <Card>
                <CardHeader title="Charges" description="Room lines and taxes" />
                <div className="overflow-x-auto scrollbar-quiet">
                  <table className="w-full text-base">
                    <thead className="bg-grey-50 border-b border-grey-200">
                      <tr>
                        <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-5 h-9">
                          Description
                        </th>
                        <th className="text-right text-2xs font-semibold uppercase tracking-wide text-grey-500 px-5 h-9">
                          Nights
                        </th>
                        <th className="text-right text-2xs font-semibold uppercase tracking-wide text-grey-500 px-5 h-9">
                          Rate
                        </th>
                        <th className="text-right text-2xs font-semibold uppercase tracking-wide text-grey-500 px-5 h-9">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.rooms.map((room, i) => (
                        <tr key={i} className="border-b border-grey-100">
                          <td className="px-5 py-3">
                            <p className="text-ink-900">
                              {room.roomTypeName} × {room.quantity}
                            </p>
                            <p className="text-sm text-grey-500">
                              {room.ratePlanName} · {room.mealPlan}
                            </p>
                          </td>
                          <td className="px-5 py-3 text-right tabular text-grey-600">
                            {r.nights}
                          </td>
                          <td className="px-5 py-3 text-right tabular text-grey-600">
                            {money(room.ratePerNight)}
                          </td>
                          <td className="px-5 py-3 text-right tabular font-medium">
                            {money(room.ratePerNight * room.quantity * r.nights)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <CardBody className="border-t border-grey-200 bg-grey-50 rounded-b-md">
                  <div className="ml-auto max-w-xs space-y-2">
                    <FolioRow label="Room charges" value={moneyPrecise(r.roomCharges)} />
                    {r.extrasCharges > 0 && (
                      <FolioRow label="Extras" value={moneyPrecise(r.extrasCharges)} />
                    )}
                    {r.discountAmount > 0 && (
                      <FolioRow
                        label="Corporate discount"
                        value={`− ${moneyPrecise(r.discountAmount)}`}
                        tone="success"
                      />
                    )}
                    <FolioRow label="GST" value={moneyPrecise(r.taxAmount)} />
                    <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-grey-300">
                      <span className="text-base font-medium text-ink-900">Total</span>
                      <span className="text-lg font-semibold text-ink-900 tabular">
                        {moneyPrecise(r.totalAmount)}
                      </span>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {(r.specialRequests || r.internalNotes) && (
                <Card className="mt-5">
                  <CardHeader title="Notes" />
                  <CardBody className="pt-0 space-y-4">
                    {r.specialRequests && (
                      <div>
                        <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-1.5">
                          Special requests — sent to the property
                        </p>
                        <p className="text-base text-ink-900 leading-relaxed">
                          {r.specialRequests}
                        </p>
                      </div>
                    )}
                    {r.internalNotes && (
                      <div>
                        <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-1.5">
                          Internal — never shown to the guest
                        </p>
                        <p className="text-base text-grey-600 leading-relaxed">
                          {r.internalNotes}
                        </p>
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}
            </TabsContent>

            {/* ── Guests ── */}
            <TabsContent value="guests">
              <Card>
                <ul className="divide-y divide-grey-100">
                  {r.guests.map((g, i) => (
                    <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                      <Avatar name={g.name} color={g.isPrimary ? "#df6128" : "#9aa2a9"} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="text-base text-ink-900 truncate">{g.name}</p>
                        {g.email && <p className="text-sm text-grey-500 truncate">{g.email}</p>}
                      </div>
                      {g.isPrimary && (
                        <StatusPill tone="accent" dot={false}>
                          Primary
                        </StatusPill>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </TabsContent>

            {/* ── Timeline ── */}
            <TabsContent value="timeline">
              <Card>
                {audit.isLoading ? (
                  <CardBody className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </CardBody>
                ) : !audit.data?.length ? (
                  <EmptyState compact title="No activity recorded" />
                ) : (
                  <CardBody>
                    <ol className="relative">
                      {audit.data.map((entry, i) => (
                        <li key={entry.id} className="flex gap-3.5 pb-5 last:pb-0">
                          <div className="flex flex-col items-center shrink-0">
                            <span
                              className={cn(
                                "size-2.5 rounded-full mt-1.5 ring-4 ring-white",
                                entry.action === "cancelled"
                                  ? "bg-brand-red"
                                  : entry.action === "approved"
                                    ? "bg-success"
                                    : entry.action === "created"
                                      ? "bg-brand-orange"
                                      : "bg-grey-300",
                              )}
                            />
                            {i < audit.data.length - 1 && (
                              <span className="w-px flex-1 bg-grey-200 mt-1" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 -mt-0.5">
                            <p className="text-base text-ink-900 leading-snug">
                              {entry.summary}
                            </p>
                            {entry.detail && (
                              <p className="text-sm text-grey-500 mt-1 leading-snug">
                                {entry.detail}
                              </p>
                            )}
                            <p className="text-xs text-grey-400 mt-1.5">
                              {entry.actorName} · {dateTime(entry.at)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </CardBody>
                )}
              </Card>
            </TabsContent>

            {/* ── Documents ── */}
            <TabsContent value="documents">
              <Card>
                <ul className="divide-y divide-grey-100">
                  <DocumentRow
                    icon={<FileText className="size-4" />}
                    title="Booking voucher"
                    detail="Branded PDF sent to the guest on confirmation"
                  />
                  <DocumentRow
                    icon={<Mail className="size-4" />}
                    title="Confirmation email"
                    detail={
                      r.status === "confirmed" || r.status === "completed"
                        ? "Sent on confirmation"
                        : "Sends once the booking is confirmed"
                    }
                  />
                  {r.invoiceId && (
                    <li className="flex items-center gap-3 px-5 py-3.5">
                      <span className="flex items-center justify-center size-8 rounded-md bg-grey-100 text-grey-500 shrink-0">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base text-ink-900">Invoice</p>
                        <p className="text-sm text-grey-500">Raised on checkout</p>
                      </div>
                      <Button asChild variant="secondary" size="sm">
                        <Link to={`/finance/invoices/${r.invoiceId}`}>Open</Link>
                      </Button>
                    </li>
                  )}
                </ul>
                <CardBody className="border-t border-grey-200 bg-grey-50 rounded-b-md">
                  <p className="text-sm text-grey-500 leading-relaxed">
                    Document generation and delivery run through the automation
                    workflows. In Phase 1 the buttons show what would happen; Phase 3
                    wires them to n8n.
                  </p>
                </CardBody>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Side rail ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Booking" />
            <CardBody className="pt-0">
              <DetailList>
                <DetailRow label="Guest">
                  <Link
                    to={`/crm/customers/${r.customerId}`}
                    className="flex items-center gap-2 text-brand-orange hover:underline"
                  >
                    <User className="size-3.5 shrink-0" />
                    {r.customerName}
                  </Link>
                </DetailRow>
                {r.companyName && (
                  <DetailRow label="Company">
                    <Link
                      to={`/crm/companies/${r.companyId}`}
                      className="flex items-center gap-2 text-brand-orange hover:underline"
                    >
                      <Building2 className="size-3.5 shrink-0" />
                      {r.companyName}
                    </Link>
                  </DetailRow>
                )}
                <DetailRow label="Property">
                  <Link
                    to={`/hotels/${r.hotelId}`}
                    className="flex items-center gap-2 text-brand-orange hover:underline"
                  >
                    <HotelIcon className="size-3.5 shrink-0" />
                    {r.hotelName}
                  </Link>
                </DetailRow>
                <DetailRow label="Check-in">
                  <span className="tabular">{dateShort(r.checkIn)}</span>
                </DetailRow>
                <DetailRow label="Check-out">
                  <span className="tabular">{dateShort(r.checkOut)}</span>
                </DetailRow>
                <DetailRow label="Raised by">{r.ownerName}</DetailRow>
                <DetailRow label="Created">{dateTime(r.createdAt)}</DetailRow>
                {r.approvedBy && (
                  <DetailRow label="Approved by">
                    {r.approvedBy}
                    <span className="block text-sm text-grey-500">
                      {r.approvedAt ? dateTime(r.approvedAt) : ""}
                    </span>
                  </DetailRow>
                )}
              </DetailList>
            </CardBody>
          </Card>

          {can(role, "view", "ai") && (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Sparkles className="size-4 text-brand-orange" />
                    Summary
                  </span>
                }
              />
              <CardBody className="pt-0">
                <p className="text-base text-grey-600 leading-relaxed">
                  {summariseReservation(r.id)}
                </p>
              </CardBody>
            </Card>
          )}

          {!editCheck.allowed && (
            <Card className="bg-grey-50">
              <CardBody className="flex items-start gap-2.5">
                <Lock className="size-4 text-grey-400 shrink-0 mt-0.5" />
                <p className="text-sm text-grey-600 leading-relaxed">{editCheck.reason}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

/* ── Dialogs ───────────────────────────────────────────────────── */

function ApproveDialog({
  onApprove, amount, pending,
}: {
  onApprove: (note: string) => void;
  amount: number;
  pending: boolean;
}) {
  const [note, setNote] = useState("");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="primary" leadingIcon={<CheckCircle2 className="size-4" />}>
          Approve
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Approve this reservation?"
        description={`${money(amount)} — approving confirms the booking and releases the guest confirmation.`}
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

function CancelDialog({
  reference, onCancel, pending,
}: {
  reference: string;
  onCancel: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState<string>(CANCELLATION_REASONS[0]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" leadingIcon={<Ban className="size-4" />}>
          Cancel
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Cancel ${reference}?`}
        description="The reservation is kept and marked cancelled — records are never deleted."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger" loading={pending} onClick={() => onCancel(reason)}>
                Cancel reservation
              </Button>
            </DialogClose>
          </>
        }
      >
        <Field label="Reason" required hint="Feeds the cancellation report">
          {({ id }) => (
            <NativeSelect id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
              {CANCELLATION_REASONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <p className="text-sm text-grey-500 mt-4 leading-relaxed">
          Cancelling releases the rooms back to inventory and sends the guest an
          acknowledgement. Any refund follows the rate plan's cancellation policy.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/* ── Pieces ────────────────────────────────────────────────────── */

function FolioRow({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-base text-grey-600">{label}</span>
      <span
        className={cn("text-base tabular", tone === "success" ? "text-success" : "text-ink-900")}
      >
        {value}
      </span>
    </div>
  );
}

function DocumentRow({
  icon, title, detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span className="flex items-center justify-center size-8 rounded-md bg-grey-100 text-grey-500 shrink-0">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base text-ink-900">{title}</p>
        <p className="text-sm text-grey-500">{detail}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          toast.info("Preview only", "Document delivery is wired up in Phase 3 via n8n.")
        }
      >
        Preview
      </Button>
    </li>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="h-3 w-48 mb-3" />
      <Skeleton className="h-8 w-64 mb-2" />
      <Skeleton className="h-3.5 w-96 mb-8" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </Page>
  );
}
