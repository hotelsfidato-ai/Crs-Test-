import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO, addDays } from "date-fns";
import {
  Check, ChevronLeft, ChevronRight, AlertTriangle, Minus, Plus, Info, Star,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useActor } from "@/lib/session";
import {
  customersRepo, hotelsRepo, reservationsRepo, TODAY,
} from "@/data/repositories";
import { money, moneyCompact, dateShort, percent, humanise } from "@/lib/format";
import { APPROVAL_THRESHOLD } from "@/lib/rules";
import {
  Page, PageHeader, Card, CardHeader, CardBody, CardFooter, Button, Field,
  Combobox, DateRangePicker, Textarea, NativeSelect, StatusPill, Skeleton,
  EmptyState, StarRating, toast,
} from "@/components/ui";
import type { ReservationRoom, RoomType, RatePlan } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   NEW RESERVATION WIZARD
   Customer → property → dates & rooms → rates & extras → review.
   The quote recalculates live at every step, including the corporate
   discount and the ₹50,000 approval threshold, so nothing about the
   commercials is a surprise at the end.
   ══════════════════════════════════════════════════════════════════ */

const STEPS = [
  { key: "customer", label: "Customer" },
  { key: "property", label: "Property" },
  { key: "dates", label: "Dates & rooms" },
  { key: "rates", label: "Rates & extras" },
  { key: "review", label: "Review" },
] as const;

interface RoomSelection {
  roomTypeId: string;
  ratePlanId: string;
  quantity: number;
  adults: number;
  children: number;
}

export default function NewReservationPage() {
  const navigate = useNavigate();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const [stepIndex, setStepIndex] = useState(0);
  const [customerId, setCustomerId] = useState(params.get("customer") ?? "");
  const [hotelId, setHotelId] = useState("");
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [selections, setSelections] = useState<RoomSelection[]>([]);
  const [channel, setChannel] = useState<string>("direct_sales");
  const [specialRequests, setSpecialRequests] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const step = STEPS[stepIndex]!.key;

  const customers = useQuery({
    queryKey: ["customers-all"],
    queryFn: () => customersRepo.all(),
  });

  const hotels = useQuery({
    queryKey: ["hotels-all"],
    queryFn: () => hotelsRepo.all(),
  });

  const roomTypes = useQuery({
    queryKey: ["hotel-room-types", hotelId],
    queryFn: () => hotelsRepo.roomTypes(hotelId),
    enabled: Boolean(hotelId),
  });

  const ratePlans = useQuery({
    queryKey: ["hotel-rate-plans", hotelId],
    queryFn: () => hotelsRepo.ratePlans(hotelId),
    enabled: Boolean(hotelId),
  });

  const customer = customers.data?.find((c) => c.id === customerId);
  const hotel = hotels.data?.find((h) => h.id === hotelId);

  const nights =
    range.from && range.to
      ? Math.max(1, differenceInCalendarDays(parseISO(range.to), parseISO(range.from)))
      : 0;

  /* Build the priced room lines the repository expects. */
  const rooms: ReservationRoom[] = useMemo(() => {
    if (!roomTypes.data || !ratePlans.data) return [];
    return selections.flatMap((sel) => {
      const rt = roomTypes.data.find((t) => t.id === sel.roomTypeId);
      const plan = ratePlans.data.find((p) => p.id === sel.ratePlanId);
      if (!rt || sel.quantity < 1) return [];
      return [{
        roomTypeId: rt.id,
        roomTypeName: rt.name,
        ratePlanId: plan?.id ?? "",
        ratePlanName: plan?.name ?? "Room only",
        mealPlan: plan?.mealPlan ?? "EP",
        quantity: sel.quantity,
        ratePerNight: plan?.rate ?? rt.baseRate,
        adults: sel.adults,
        children: sel.children,
      }];
    });
  }, [selections, roomTypes.data, ratePlans.data]);

  const quote = useMemo(
    () => reservationsRepo.quote(rooms, nights, customer?.companyId),
    [rooms, nights, customer?.companyId],
  );

  const create = useMutation({
    mutationFn: () =>
      reservationsRepo.create(
        {
          customerId,
          hotelId,
          checkIn: range.from!,
          checkOut: range.to!,
          rooms,
          specialRequests,
          internalNotes,
          channel: channel as never,
        },
        actor,
      ),
    onSuccess: (reservation) => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      if (reservation.status === "pending_approval") {
        toast.warning(
          "Sent for approval",
          `${reservation.reference} is above ₹50,000 and needs a manager's sign-off.`,
        );
      } else {
        toast.success("Reservation confirmed", `${reservation.reference} has been created.`);
      }
      navigate(`/reservations/${reservation.id}`);
    },
    onError: () => toast.error("Could not create", "Nothing was saved. Try again."),
  });

  /* Each step gates the next — you cannot skip ahead of a decision. */
  const canAdvance =
    (step === "customer" && Boolean(customerId)) ||
    (step === "property" && Boolean(hotelId)) ||
    (step === "dates" && nights > 0 && rooms.length > 0) ||
    step === "rates" ||
    step === "review";

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Reservations", to: "/reservations" },
          { label: "New reservation" },
        ]}
        title="New reservation"
        description="Five steps. The quote updates as you go, including any corporate discount."
      />

      <Stepper index={stepIndex} onJump={(i) => i < stepIndex && setStepIndex(i)} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <Card>
          {/* ── 1. Customer ── */}
          {step === "customer" && (
            <>
              <CardHeader
                title="Who is this booking for?"
                description="Search by name, email or phone. The customer's company sets the discount."
              />
              <CardBody className="space-y-5">
                <Field label="Customer" required>
                  {({ id }) => (
                    <Combobox
                      id={id}
                      value={customerId}
                      onChange={setCustomerId}
                      options={(customers.data ?? []).map((c) => ({
                        value: c.id,
                        label: c.fullName,
                        description: `${c.email}${c.companyName ? ` · ${c.companyName}` : ""}`,
                      }))}
                      placeholder="Search customers…"
                      footer={
                        <Link
                          to="/crm/customers/new"
                          className="flex items-center gap-2 px-2.5 py-2 rounded-sm text-base text-brand-orange hover:bg-grey-100 transition-colors duration-150"
                        >
                          <Plus className="size-4" />
                          Create a new customer
                        </Link>
                      }
                    />
                  )}
                </Field>

                {customer && (
                  <div className="rounded-md border border-grey-200 bg-grey-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900 flex items-center gap-1.5">
                          {customer.fullName}
                          {customer.vip && (
                            <Star className="size-3 fill-brand-yellow text-brand-yellow" />
                          )}
                        </p>
                        <p className="text-sm text-grey-600 mt-0.5">{customer.email}</p>
                        {customer.companyName && (
                          <p className="text-sm text-grey-600">{customer.companyName}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm text-grey-500">Past stays</p>
                        <p className="text-lg font-semibold text-ink-900 tabular">
                          {customer.totalReservations}
                        </p>
                      </div>
                    </div>

                    {customer.preferences.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-grey-200">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-2">
                          Preferences
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {customer.preferences.map((p) => (
                            <StatusPill key={p} tone="neutral" dot={false}>
                              {p}
                            </StatusPill>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Field label="Booking channel">
                  {({ id }) => (
                    <NativeSelect
                      id={id}
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                    >
                      <option value="direct_sales">Direct sales</option>
                      <option value="corporate">Corporate</option>
                      <option value="travel_agent">Travel agent</option>
                      <option value="website">Website</option>
                      <option value="phone">Phone</option>
                      <option value="walk_in">Walk-in</option>
                    </NativeSelect>
                  )}
                </Field>
              </CardBody>
            </>
          )}

          {/* ── 2. Property ── */}
          {step === "property" && (
            <>
              <CardHeader
                title="Which property?"
                description="All 32 partner properties. Paused properties cannot take new bookings."
              />
              <CardBody>
                {hotels.isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2 max-h-[520px] overflow-y-auto scrollbar-quiet pr-1">
                    {(hotels.data ?? []).map((h) => {
                      const disabled = h.status === "paused";
                      return (
                        <button
                          key={h.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setHotelId(h.id);
                            setSelections([]);
                          }}
                          className={cn(
                            "text-left p-3.5 rounded-md border transition-colors duration-150",
                            hotelId === h.id
                              ? "border-brand-orange bg-brand-orange-50 ring-1 ring-brand-orange"
                              : "border-grey-200 bg-white hover:border-grey-300",
                            disabled && "opacity-50 cursor-not-allowed hover:border-grey-200",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-ink-900 truncate">{h.shortName}</p>
                              <p className="text-sm text-grey-500 truncate">
                                {h.city}, {h.state}
                              </p>
                            </div>
                            {disabled && (
                              <StatusPill tone="warning" dot={false}>
                                Paused
                              </StatusPill>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <StarRating value={h.starRating} />
                            <span className="text-sm text-grey-500">{h.totalRooms} rooms</span>
                            <span className="text-sm text-grey-400">{humanise(h.category)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </>
          )}

          {/* ── 3. Dates & rooms ── */}
          {step === "dates" && (
            <>
              <CardHeader
                title="When, and how many rooms?"
                description={hotel ? `${hotel.name}, ${hotel.city}` : undefined}
              />
              <CardBody className="space-y-5">
                <Field label="Check-in and check-out" required>
                  {({ id }) => (
                    <DateRangePicker
                      id={id}
                      from={range.from}
                      to={range.to}
                      onChange={setRange}
                      minDate={TODAY}
                      className="max-w-md"
                    />
                  )}
                </Field>

                {nights > 0 && (
                  <p className="text-sm text-grey-500 -mt-2">
                    {nights} night{nights === 1 ? "" : "s"} · check out{" "}
                    {dateShort(addDays(parseISO(range.from!), nights))}
                  </p>
                )}

                <div>
                  <p className="text-sm font-medium text-grey-700 mb-2.5">Room types</p>
                  {roomTypes.isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : !roomTypes.data?.length ? (
                    <EmptyState
                      compact
                      title="No room types loaded"
                      description="This property has no room inventory configured yet."
                    />
                  ) : (
                    <div className="space-y-2.5">
                      {roomTypes.data.map((rt) => (
                        <RoomTypeRow
                          key={rt.id}
                          roomType={rt}
                          ratePlans={(ratePlans.data ?? []).filter((p) => p.roomTypeId === rt.id)}
                          selection={selections.find((s) => s.roomTypeId === rt.id)}
                          onChange={(next) =>
                            setSelections((prev) => {
                              const rest = prev.filter((s) => s.roomTypeId !== rt.id);
                              return next ? [...rest, next] : rest;
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </CardBody>
            </>
          )}

          {/* ── 4. Rates & extras ── */}
          {step === "rates" && (
            <>
              <CardHeader
                title="Rates and extras"
                description="Rate plans come from the property's season grid. The corporate discount is applied automatically."
              />
              <CardBody className="space-y-5">
                <div className="rounded-md border border-grey-200 overflow-hidden">
                  <table className="w-full text-base">
                    <thead className="bg-grey-50 border-b border-grey-200">
                      <tr>
                        <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9">
                          Room
                        </th>
                        <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9 hidden sm:table-cell">
                          Rate plan
                        </th>
                        <th className="text-right text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9">
                          Per night
                        </th>
                        <th className="text-right text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.map((r) => (
                        <tr key={r.roomTypeId} className="border-b border-grey-100 last:border-b-0">
                          <td className="px-4 py-3">
                            <p className="text-ink-900">{r.roomTypeName}</p>
                            <p className="text-sm text-grey-500">
                              × {r.quantity} · {r.adults} adult{r.adults === 1 ? "" : "s"}
                              {r.children ? `, ${r.children} child` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-grey-600 hidden sm:table-cell">
                            {r.ratePlanName}
                            <span className="text-grey-400 ml-1.5">({r.mealPlan})</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular">{money(r.ratePerNight)}</td>
                          <td className="px-4 py-3 text-right tabular font-medium">
                            {money(r.ratePerNight * r.quantity * nights)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Field label="Special requests" hint="Sent to the property with the booking">
                  {({ id }) => (
                    <Textarea
                      id={id}
                      rows={3}
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      placeholder="Late arrival, connecting rooms, dietary requirements…"
                    />
                  )}
                </Field>

                <Field label="Internal notes" hint="Never leaves the platform">
                  {({ id }) => (
                    <Textarea
                      id={id}
                      rows={2}
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                    />
                  )}
                </Field>
              </CardBody>
            </>
          )}

          {/* ── 5. Review ── */}
          {step === "review" && (
            <>
              <CardHeader
                title="Review before confirming"
                description="Nothing is written until you confirm."
              />
              <CardBody className="space-y-5">
                {quote.requiresApproval && (
                  <div className="flex items-start gap-3 p-4 rounded-md bg-brand-yellow-50 border border-brand-yellow-100">
                    <AlertTriangle className="size-4 text-[#8a6300] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-base font-medium text-[#8a6300]">
                        This booking needs approval
                      </p>
                      <p className="text-sm text-[#8a6300] mt-1 leading-relaxed">
                        At {money(quote.totalAmount)} it is at or above the{" "}
                        {money(APPROVAL_THRESHOLD)} threshold. It will be created as{" "}
                        <em>pending approval</em> and routed to a sales manager rather than
                        confirmed straight away.
                      </p>
                    </div>
                  </div>
                )}

                <ReviewRow label="Customer" value={customer?.fullName ?? "—"} sub={customer?.email} />
                <ReviewRow
                  label="Company"
                  value={customer?.companyName ?? "Individual booking"}
                  sub={
                    quote.discountPercent
                      ? `${quote.discountPercent}% negotiated discount applies`
                      : undefined
                  }
                />
                <ReviewRow
                  label="Property"
                  value={hotel?.name ?? "—"}
                  sub={hotel ? `${hotel.city}, ${hotel.state}` : undefined}
                />
                <ReviewRow
                  label="Stay"
                  value={
                    range.from && range.to
                      ? `${dateShort(range.from)} → ${dateShort(range.to)}`
                      : "—"
                  }
                  sub={`${nights} night${nights === 1 ? "" : "s"}`}
                />
                <ReviewRow
                  label="Rooms"
                  value={`${rooms.reduce((s, r) => s + r.quantity, 0)} room${
                    rooms.reduce((s, r) => s + r.quantity, 0) === 1 ? "" : "s"
                  }`}
                  sub={rooms.map((r) => `${r.quantity} × ${r.roomTypeName}`).join(", ")}
                />
                <ReviewRow label="Channel" value={humanise(channel)} />
                {specialRequests && <ReviewRow label="Special requests" value={specialRequests} />}
              </CardBody>
            </>
          )}

          <CardFooter className="justify-between">
            <Button
              variant="ghost"
              disabled={stepIndex === 0}
              leadingIcon={<ChevronLeft className="size-4" />}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </Button>

            {step === "review" ? (
              <Button
                variant="primary"
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                {quote.requiresApproval ? "Submit for approval" : "Confirm reservation"}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!canAdvance}
                trailingIcon={<ChevronRight className="size-4" />}
                onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
              >
                Continue
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* ── Live quote ── */}
        <Card className="lg:sticky lg:top-6">
          <CardHeader title="Quote" description="Updates as you go" />
          <CardBody className="space-y-3">
            {rooms.length === 0 || nights === 0 ? (
              <p className="text-base text-grey-500 leading-relaxed">
                Pick dates and rooms to see the price.
              </p>
            ) : (
              <>
                <QuoteRow label="Room charges" value={money(quote.roomCharges)} />
                {quote.discountAmount > 0 && (
                  <QuoteRow
                    label={`Discount (${quote.discountPercent}%)`}
                    value={`− ${money(quote.discountAmount)}`}
                    tone="success"
                  />
                )}
                <QuoteRow
                  label={`GST (${percent(quote.taxRate * 100, 0)})`}
                  value={money(quote.taxAmount)}
                />

                <div className="pt-3 border-t border-grey-200">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-medium text-ink-900">Total</span>
                    <span className="text-xl font-semibold text-ink-900 tabular">
                      {money(quote.totalAmount)}
                    </span>
                  </div>
                  <p className="text-xs text-grey-500 mt-1">
                    {moneyCompact(quote.totalAmount / Math.max(1, nights))} per night
                  </p>
                </div>

                {quote.requiresApproval && (
                  <div className="flex items-start gap-2 pt-3 border-t border-grey-200">
                    <Info className="size-3.5 text-[#8a6300] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#8a6300] leading-relaxed">
                      Above {money(APPROVAL_THRESHOLD)} — routes to approval.
                    </p>
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </Page>
  );
}

/* ── Pieces ────────────────────────────────────────────────────── */

function RoomTypeRow({
  roomType, ratePlans, selection, onChange,
}: {
  roomType: RoomType;
  ratePlans: RatePlan[];
  selection?: RoomSelection;
  onChange: (next: RoomSelection | null) => void;
}) {
  const quantity = selection?.quantity ?? 0;
  const planId = selection?.ratePlanId ?? ratePlans[0]?.id ?? "";
  const plan = ratePlans.find((p) => p.id === planId);

  function setQuantity(next: number) {
    if (next <= 0) return onChange(null);
    onChange({
      roomTypeId: roomType.id,
      ratePlanId: planId,
      quantity: next,
      adults: selection?.adults ?? 2,
      children: selection?.children ?? 0,
    });
  }

  return (
    <div
      className={cn(
        "p-3.5 rounded-md border transition-colors duration-150",
        quantity > 0 ? "border-brand-orange bg-brand-orange-50/50" : "border-grey-200 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink-900">{roomType.name}</p>
          <p className="text-sm text-grey-500">
            {roomType.totalRooms} available · sleeps {roomType.maxOccupancy} ·{" "}
            {roomType.sizeSqft} sq ft
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-base font-medium text-ink-900 tabular">
              {money(plan?.rate ?? roomType.baseRate)}
            </p>
            <p className="text-sm text-grey-500">per night</p>
          </div>

          <div className="flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={() => setQuantity(quantity - 1)}
              disabled={quantity === 0}
              aria-label={`Remove one ${roomType.name}`}
              className="flex items-center justify-center size-7 rounded-sm border border-grey-300 text-grey-600 hover:bg-grey-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-7 text-center text-base tabular font-medium">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              disabled={quantity >= roomType.totalRooms}
              aria-label={`Add one ${roomType.name}`}
              className="flex items-center justify-center size-7 rounded-sm border border-grey-300 text-grey-600 hover:bg-grey-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {quantity > 0 && ratePlans.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 mt-3 pt-3 border-t border-grey-200">
          <label className="block">
            <span className="block text-sm text-grey-600 mb-1">Rate plan</span>
            <NativeSelect
              value={planId}
              onChange={(e) =>
                onChange({ ...selection!, roomTypeId: roomType.id, ratePlanId: e.target.value })
              }
            >
              {ratePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.rate)}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className="block">
            <span className="block text-sm text-grey-600 mb-1">Adults per room</span>
            <NativeSelect
              value={String(selection?.adults ?? 2)}
              onChange={(e) => onChange({ ...selection!, adults: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </NativeSelect>
          </label>

          <label className="block">
            <span className="block text-sm text-grey-600 mb-1">Children per room</span>
            <NativeSelect
              value={String(selection?.children ?? 0)}
              onChange={(e) => onChange({ ...selection!, children: Number(e.target.value) })}
            >
              {[0, 1, 2].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </NativeSelect>
          </label>
        </div>
      )}
    </div>
  );
}

function Stepper({ index, onJump }: { index: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-1.5 mb-6 flex-wrap">
      {STEPS.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={s.key} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={i >= index}
              onClick={() => onJump(i)}
              className={cn(
                "flex items-center gap-2 transition-colors duration-150",
                done && "cursor-pointer hover:opacity-70",
                i >= index && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center size-6 rounded-full text-2xs font-semibold tabular shrink-0",
                  done
                    ? "bg-success text-white"
                    : active
                      ? "bg-brand-orange text-white"
                      : "bg-grey-100 text-grey-400",
                )}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-base hidden sm:inline",
                  active ? "text-ink-900 font-medium" : "text-grey-500",
                )}
              >
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && <span className="w-5 sm:w-8 h-px bg-grey-200 mx-0.5" />}
          </li>
        );
      })}
    </ol>
  );
}

function ReviewRow({
  label, value, sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,160px)_1fr] gap-4 py-2.5 border-b border-grey-100 last:border-b-0">
      <p className="text-sm text-grey-500">{label}</p>
      <div className="min-w-0">
        <p className="text-base text-ink-900">{value}</p>
        {sub && <p className="text-sm text-grey-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function QuoteRow({
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
        className={cn(
          "text-base tabular",
          tone === "success" ? "text-success" : "text-ink-900",
        )}
      >
        {value}
      </span>
    </div>
  );
}
