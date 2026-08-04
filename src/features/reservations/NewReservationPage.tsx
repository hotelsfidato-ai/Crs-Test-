import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO, addDays } from "date-fns";
import {
  Check, ChevronLeft, ChevronRight, AlertTriangle, Minus, Plus, Star,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useActor, useSession, useScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  adminRepo, companiesRepo, customersRepo, hotelsRepo, reservationsRepo,
  lineTotal, TODAY,
} from "@/data/repositories";
import { money, moneyCompact, dateShort, percent, humanise } from "@/lib/format";
import { GST_THRESHOLD } from "@/lib/tax";
import {
  Page, PageHeader, Card, CardHeader, CardBody, CardFooter, Button, Field,
  Combobox, DateRangePicker, Textarea, Input, NativeSelect, StatusPill, Skeleton,
  EmptyState, StarRating, toast, describeError,
} from "@/components/ui";
import {
  MEAL_PLANS, MEAL_PLAN_LABELS, MEAL_PLAN_SHORT, PAYMENT_TERM_LABELS,
  type ReservationRoom, type RoomType, type Season, type MealPlan, type PaymentTerm,
} from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   NEW RESERVATION WIZARD
   Customer → property → dates & rooms → rates & extras → review.

   ⚠️ The selling rate is TYPED HERE, not looked up. Fidato does not
   own these properties and negotiates every booking, so there is no
   rack rate to pull from. The season supplies the meal plan and the
   stay rules; the price is the salesperson's, and it is frozen onto
   the reservation the moment it is created.

   The quote recalculates live at every step — corporate discount and
   both GST bands — so nothing about the commercials is a surprise at
   the end.

   ⚠️ A booking must carry the property's confirmation. Fidato does
   not own these hotels, so without a confirmation number, the name of
   who confirmed it, or at minimum a time, there is nothing to quote
   back when a guest arrives and reception has no record.
   ══════════════════════════════════════════════════════════════════ */

const STEPS = [
  { key: "customer", label: "Customer" },
  { key: "property", label: "Property" },
  { key: "dates", label: "Dates & rooms" },
  { key: "rates", label: "Rates & payment" },
  { key: "review", label: "Review" },
] as const;

interface RoomSelection {
  roomTypeId: string;
  quantity: number;
  adults: number;
  children: number;
  extraBeds: number;
  mealPlan: MealPlan;
  /* Typed by the salesperson. Held as strings so a half-typed number
     does not collapse to 0 and flash a wrong total mid-keystroke. */
  sellingRate: string;
  extraBedRate: string;
  childRate: string;
}

export default function NewReservationPage() {
  const navigate = useNavigate();
  const actor = useActor();
  const scope = useScope();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const [stepIndex, setStepIndex] = useState(0);
  const [customerId, setCustomerId] = useState(params.get("customer") ?? "");
  const [hotelId, setHotelId] = useState("");
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [selections, setSelections] = useState<RoomSelection[]>([]);
  const [channel, setChannel] = useState<string>("direct_sales");
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>("DP");
  const [specialRequests, setSpecialRequests] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [hotelConfirmationNumber, setHotelConfirmationNumber] = useState("");
  const [hotelRepName, setHotelRepName] = useState("");
  const [confirmedAt, setConfirmedAt] = useState(() => localNow());
  /* Empty means "me". Only roles that book on behalf of someone else
     ever change it — see canAssignOwner. */
  const [ownerId, setOwnerId] = useState("");

  const step = STEPS[stepIndex]!.key;
  const role = useSession((s) => s.role);

  /* ⚠️ Booking on behalf of someone else is the CRS desk's job. A
     salesperson never sees this — letting them reassign ownership
     would let them move commission onto or off their own name. */
  const canAssignOwner = can(role, "edit", "user") || role === "crs_manager";

  const staff = useQuery({
    queryKey: ["assignable-owners"],
    queryFn: () => adminRepo.allUsers(),
    enabled: canAssignOwner,
  });

  const assignableOwners = (staff.data ?? []).filter(
    (u) => u.status === "active" && u.id !== actor.id &&
      (u.role === "salesperson" || u.role === "manager" || u.role === "crs_manager"),
  );

  const assignedOwner = assignableOwners.find((u) => u.id === ownerId);

  /* ⚠️ Scoped, like every other customer list. Without the scope this
     issues an unfiltered query, and Firestore fails a query outright
     when it *could* return a document the rules would refuse — so a
     salesperson got an empty customer picker rather than their own
     leads. See scopeConstraints in lib/permissions. */
  const customers = useQuery({
    queryKey: ["customers-all", scope],
    queryFn: () => customersRepo.all(scope),
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

  const seasons = useQuery({
    queryKey: ["hotel-seasons", hotelId],
    queryFn: () => hotelsRepo.seasons(hotelId),
    enabled: Boolean(hotelId),
  });

  const customer = customers.data?.find((c) => c.id === customerId);
  const hotel = hotels.data?.find((h) => h.id === hotelId);

  /* The discount is a property of the company, so the quote needs the
     company record — not just its id. */
  const company = useQuery({
    queryKey: ["company", customer?.companyId],
    queryFn: () => companiesRepo.get(customer!.companyId!),
    enabled: Boolean(customer?.companyId),
  });

  const nights =
    range.from && range.to
      ? Math.max(1, differenceInCalendarDays(parseISO(range.to), parseISO(range.from)))
      : 0;

  /* The season covering check-in. Supplies the meal plans on offer and
     the cancellation policy — never a price. */
  const season = useMemo(() => {
    if (!range.from) return undefined;
    return (seasons.data ?? []).find(
      (s) => s.isActive && s.validFrom <= range.from! && s.validTo >= range.from!,
    );
  }, [seasons.data, range.from]);

  /* Build the priced room lines the repository expects. */
  const rooms: ReservationRoom[] = useMemo(() => {
    if (!roomTypes.data) return [];
    return selections.flatMap((sel) => {
      const rt = roomTypes.data.find((t) => t.id === sel.roomTypeId);
      if (!rt || sel.quantity < 1) return [];
      return [{
        roomTypeId: rt.id,
        roomTypeName: rt.name,
        mealPlan: sel.mealPlan,
        ...(season ? { seasonId: season.id, seasonName: season.name } : {}),
        quantity: sel.quantity,
        adults: sel.adults,
        children: sel.children,
        extraBeds: sel.extraBeds,
        sellingRate: Number(sel.sellingRate) || 0,
        extraBedRate: Number(sel.extraBedRate) || 0,
        childRate: Number(sel.childRate) || 0,
      }];
    });
  }, [selections, roomTypes.data, season]);

  const quote = useMemo(
    () => reservationsRepo.quote(rooms, nights, company.data),
    [rooms, nights, company.data],
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
          paymentTerm,
          specialRequests,
          internalNotes,
          hotelConfirmationNumber,
          hotelRepName,
          confirmedAt,
          ...(assignedOwner
            ? { ownerId: assignedOwner.id, ownerName: assignedOwner.name }
            : {}),
          channel: channel as never,
        },
        actor,
      ),
    onSuccess: (reservation) => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      toast.success(
        "Reservation confirmed",
        assignedOwner
          ? `${reservation.reference} created and assigned to ${assignedOwner.name}.`
          : `${reservation.reference} has been created.`,
      );
      navigate(`/reservations/${reservation.id}`);
    },
    onError: (error) => {
      const detail = describeError(error);
      toast.error(
        detail.title ?? "Could not create",
        detail.message ?? "Nothing was saved. Try again.",
      );
    },
  });

  /* ⚠️ Any ONE of the three is enough, but not none. Mirrors
     hasHotelConfirmation in the repository, which is the real gate. */
  const hasConfirmation = Boolean(
    hotelConfirmationNumber.trim() || hotelRepName.trim() || confirmedAt.trim(),
  );

  /* Each step gates the next — you cannot skip ahead of a decision. */
  const canAdvance =
    (step === "customer" && Boolean(customerId)) ||
    (step === "property" && Boolean(hotelId)) ||
    (step === "dates" && nights > 0 && rooms.length > 0) ||
    (step === "rates" && hasConfirmation) ||
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
                      loading={customers.isLoading}
                      error={customers.error}
                      options={(customers.data ?? []).map((c) => ({
                        value: c.id,
                        label: c.fullName || c.email || "Unnamed customer",
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
                          season={season}
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
                title="Rates and payment"
                description="You set the selling rate. The corporate discount and GST are applied on top."
              />
              <CardBody className="space-y-5">
                {selections.length === 0 ? (
                  <EmptyState
                    compact
                    title="No rooms selected"
                    description="Go back a step and add at least one room."
                  />
                ) : (
                  <div className="space-y-3">
                    {selections.map((sel) => {
                      const rt = roomTypes.data?.find((t) => t.id === sel.roomTypeId);
                      if (!rt) return null;
                      const line = rooms.find((r) => r.roomTypeId === sel.roomTypeId);
                      return (
                        <RateLine
                          key={sel.roomTypeId}
                          roomType={rt}
                          selection={sel}
                          nights={nights}
                          subtotal={line ? lineTotal(line, nights) : 0}
                          onChange={(next) =>
                            setSelections((prev) =>
                              prev.map((s) => (s.roomTypeId === sel.roomTypeId ? next : s)),
                            )
                          }
                        />
                      );
                    })}
                  </div>
                )}

                <Field
                  label="Payment method"
                  required
                  hint={PAYMENT_TERM_HINTS[paymentTerm]}
                >
                  {({ id }) => (
                    <NativeSelect
                      id={id}
                      value={paymentTerm}
                      onChange={(e) => setPaymentTerm(e.target.value as PaymentTerm)}
                    >
                      {(Object.keys(PAYMENT_TERM_LABELS) as PaymentTerm[]).map((t) => (
                        <option key={t} value={t}>
                          {t} — {PAYMENT_TERM_LABELS[t]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>

                {/* ── The property's confirmation ── */}
                <div className="rounded-md border border-grey-200 p-4 space-y-4">
                  <div>
                    <p className="text-base font-medium text-ink-900">
                      Hotel confirmation <span className="text-brand-red">*</span>
                    </p>
                    <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                      Fidato does not own this property, so the booking needs proof it was
                      accepted. Fill in <strong>at least one</strong> — whichever the hotel
                      actually gave you.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Confirmation number" hint="The hotel's own reference.">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={hotelConfirmationNumber}
                          onChange={(e) => setHotelConfirmationNumber(e.target.value)}
                          placeholder="e.g. RES-88213"
                        />
                      )}
                    </Field>
                    <Field label="Confirmed by" hint="Who at the hotel confirmed it.">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={hotelRepName}
                          onChange={(e) => setHotelRepName(e.target.value)}
                          placeholder="e.g. Priya, Front Office"
                        />
                      )}
                    </Field>
                    <Field label="Confirmed at">
                      {({ id }) => (
                        <Input
                          id={id}
                          type="datetime-local"
                          value={confirmedAt}
                          onChange={(e) => setConfirmedAt(e.target.value)}
                        />
                      )}
                    </Field>
                  </div>

                  {!hasConfirmation && (
                    <p className="flex items-start gap-2 text-sm text-brand-red leading-relaxed">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      Enter the confirmation number, the name of who confirmed it, or the
                      time — one of the three is enough.
                    </p>
                  )}
                </div>

                {/* ── Whose booking is this ── */}
                {canAssignOwner && (
                  <Field
                    label="Booked for"
                    hint="The salesperson this booking belongs to. It appears in their list and against their name."
                  >
                    {({ id }) => (
                      <NativeSelect
                        id={id}
                        value={ownerId}
                        onChange={(e) => setOwnerId(e.target.value)}
                      >
                        <option value="">
                          {actor.name} — me
                        </option>
                        {assignableOwners.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                            {u.department ? ` — ${u.department}` : ""}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </Field>
                )}

                {paymentTerm === "BTC" && !customer?.companyId && (
                  <div className="flex items-start gap-3 p-4 rounded-md bg-brand-yellow-50 border border-brand-yellow-100">
                    <AlertTriangle className="size-4 text-[#8a6300] shrink-0 mt-0.5" />
                    <p className="text-sm text-[#8a6300] leading-relaxed">
                      Bill to company needs a company on the invoice, and this guest is not
                      attached to one. Either pick a different payment method or link the
                      customer to a company first — otherwise the invoice has nobody to go to.
                    </p>
                  </div>
                )}

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
                {"Confirm reservation"}
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
                {/* ⚠️ One line per band. A booking can legitimately span
                    both — a ₹6,000 Deluxe at 5% and a ₹9,000 Suite at 18% —
                    and collapsing them into a single "GST" line hides the
                    fact that two rates were applied. */}
                {quote.taxByBand.map((band) => (
                  <QuoteRow
                    key={band.rate}
                    label={`GST ${percent(band.rate * 100, 0)} on ${moneyCompact(band.taxable)}`}
                    value={money(band.tax)}
                  />
                ))}

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
  roomType, season, selection, onChange,
}: {
  roomType: RoomType;
  season?: Season;
  selection?: RoomSelection;
  onChange: (next: RoomSelection | null) => void;
}) {
  const quantity = selection?.quantity ?? 0;
  /* Falls back to EP when no season covers these dates. Room-only is
     the safe default: it is the one plan every property offers, and it
     under-promises rather than billing the guest for meals nobody
     agreed to. */
  /* ⚠️ Falls back to every plan, not just EP. A property with no
     season configured should still be sellable on any board basis —
     restricting to room-only would silently drop the meal from the
     booking, and it is the meal that gets billed. */
  const offered = season?.mealPlans?.length ? season.mealPlans : MEAL_PLANS;

  function setQuantity(next: number) {
    if (next <= 0) return onChange(null);
    onChange({
      roomTypeId: roomType.id,
      quantity: next,
      adults: selection?.adults ?? 2,
      children: selection?.children ?? 0,
      extraBeds: selection?.extraBeds ?? 0,
      mealPlan: selection?.mealPlan ?? offered[0]!,
      sellingRate: selection?.sellingRate ?? "",
      extraBedRate: selection?.extraBedRate ?? "",
      childRate: selection?.childRate ?? "",
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

      {quantity > 0 && selection && (
        <div className="grid gap-3 sm:grid-cols-4 mt-3 pt-3 border-t border-grey-200">
          <label className="block">
            <span className="block text-sm text-grey-600 mb-1">Meal plan</span>
            <NativeSelect
              value={selection.mealPlan}
              onChange={(e) =>
                onChange({ ...selection, mealPlan: e.target.value as MealPlan })
              }
            >
              {offered.map((plan) => (
                <option key={plan} value={plan}>
                  {MEAL_PLAN_SHORT[plan]} — {MEAL_PLAN_LABELS[plan]}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className="block">
            <span className="block text-sm text-grey-600 mb-1">Adults per room</span>
            <NativeSelect
              value={String(selection.adults)}
              onChange={(e) => onChange({ ...selection, adults: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </NativeSelect>
          </label>

          <label className="block">
            <span className="block text-sm text-grey-600 mb-1">Children per room</span>
            <NativeSelect
              value={String(selection.children)}
              onChange={(e) => onChange({ ...selection, children: Number(e.target.value) })}
            >
              {[0, 1, 2].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </NativeSelect>
          </label>

          <label className="block">
            {/* ⚠️ Extra beds are per LINE, not per room — the same wording
                appears on the type. Two guests sharing one rollaway across
                three rooms is one extra bed, and charging three is the
                mistake this label exists to prevent. */}
            <span className="block text-sm text-grey-600 mb-1">Extra beds (total)</span>
            <NativeSelect
              value={String(selection.extraBeds)}
              onChange={(e) => onChange({ ...selection, extraBeds: Number(e.target.value) })}
            >
              {Array.from({ length: (roomType.maxExtraBeds || 0) * quantity + 1 }, (_, n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </NativeSelect>
          </label>
        </div>
      )}
    </div>
  );
}

/* ── Rate entry ────────────────────────────────────────────────────
   The step that replaced the rate-plan lookup.                      */

function RateLine({
  roomType, selection, nights, subtotal, onChange,
}: {
  roomType: RoomType;
  selection: RoomSelection;
  nights: number;
  subtotal: number;
  onChange: (next: RoomSelection) => void;
}) {
  const rate = Number(selection.sellingRate) || 0;
  const band = rate >= GST_THRESHOLD ? 18 : 5;

  return (
    <div className="p-3.5 rounded-md border border-grey-200 bg-white">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="font-medium text-ink-900">{roomType.name}</p>
          <p className="text-sm text-grey-500">
            × {selection.quantity} · {selection.mealPlan} · {selection.adults} adult
            {selection.adults === 1 ? "" : "s"}
            {selection.children ? `, ${selection.children} child` : ""}
            {selection.extraBeds ? `, ${selection.extraBeds} extra bed` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-medium text-ink-900 tabular">{money(subtotal)}</p>
          <p className="text-sm text-grey-500">
            {nights} night{nights === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Room rate per night"
          required
          hint={rate > 0 ? `Falls in the ${band}% GST band` : "Per room, before tax"}
        >
          {({ id }) => (
            <Input
              id={id}
              type="number"
              numeric
              min={0}
              value={selection.sellingRate}
              onChange={(e) => onChange({ ...selection, sellingRate: e.target.value })}
              placeholder="0"
            />
          )}
        </Field>

        <Field
          label="Extra bed rate"
          hint={selection.extraBeds ? "Per bed per night" : "No extra beds on this line"}
        >
          {({ id }) => (
            <Input
              id={id}
              type="number"
              numeric
              min={0}
              disabled={selection.extraBeds === 0}
              value={selection.extraBedRate}
              onChange={(e) => onChange({ ...selection, extraBedRate: e.target.value })}
              placeholder="0"
            />
          )}
        </Field>

        <Field
          label="Child rate"
          hint={selection.children ? "Per child per night" : "No children on this line"}
        >
          {({ id }) => (
            <Input
              id={id}
              type="number"
              numeric
              min={0}
              disabled={selection.children === 0}
              value={selection.childRate}
              onChange={(e) => onChange({ ...selection, childRate: e.target.value })}
              placeholder="0"
            />
          )}
        </Field>
      </div>
    </div>
  );
}

const PAYMENT_TERM_HINTS: Record<PaymentTerm, string> = {
  DP: "The guest settles with the hotel directly. Fidato invoices commission only.",
  RA: "An advance is collected now; the balance is settled at the property.",
  BTC: "The full amount is invoiced to the company on account.",
};

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

/**
 * `datetime-local` wants a local wall-clock string, not an ISO instant.
 *
 * ⚠️ `toISOString()` is UTC, so in India it renders as 5½ hours ago and
 * the salesperson silently records the wrong confirmation time.
 */
function localNow(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}
