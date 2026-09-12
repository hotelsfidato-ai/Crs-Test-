import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO, addDays } from "date-fns";
import {
  Check, ChevronLeft, ChevronRight, AlertTriangle, Minus, Plus, Star, Copy,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useActor, useSession, useScope } from "@/lib/session";
import { canAssignOwner, assignableOwners } from "@/lib/permissions";
import {
  adminRepo, companiesRepo, customersRepo, hotelsRepo, reservationsRepo,
  lineTotal, TODAY,
} from "@/data/repositories";
import { money, moneyCompact, dateShort, percent, humanise } from "@/lib/format";
import { GST_THRESHOLD, splitGstInclusive } from "@/lib/tax";
import {
  Page, PageHeader, Card, CardHeader, CardBody, CardFooter, Button, Field,
  Combobox, DateRangePicker, Textarea, Input, NativeSelect, StatusPill, Skeleton,
  EmptyState, StarRating, Checkbox, toast, describeError,
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

/**
 * One physical room.
 *
 * ⚠️ Per ROOM, not per room type. Two Executive Deluxe rooms on one
 * booking are routinely different: one for two adults at one rate, the
 * other for three with an extra bed at another. A single "× 2" line
 * forced both onto one occupancy and one rate, so each room is its own
 * entry and becomes its own line on the reservation (quantity 1).
 */
interface RoomSelection {
  /** Stable across edits, so React and "copy to all" can find this room. */
  key: string;
  roomTypeId: string;
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
  /* ⚠️ Negotiated rates often already include GST. Ticked, every rate
     typed on the rates step is the final price per night, and the GST
     is taken out of it rather than added on top. */
  const [ratesIncludeGst, setRatesIncludeGst] = useState(false);

  const step = STEPS[stepIndex]!.key;
  const role = useSession((s) => s.role);

  /* ⚠️ Booking on behalf of someone else is the CRS desk's job. Shared
     with the importer through lib/permissions, so "who may book for a
     salesperson" and "who may import for one" cannot drift apart. */
  const mayAssign = canAssignOwner(role);

  const staff = useQuery({
    queryKey: ["assignable-owners"],
    queryFn: () => adminRepo.allUsers(),
    enabled: mayAssign,
  });

  const owners = assignableOwners(staff.data ?? [], actor.id);
  const assignedOwner = owners.find((u) => u.id === ownerId);

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

  /* Room selections in room-type order, so every room of a type sits
     together on the rates step whatever order they were added in. */
  const orderedSelections = useMemo(() => {
    const order = new Map((roomTypes.data ?? []).map((t, i) => [t.id, i]));
    return [...selections].sort(
      (a, b) => (order.get(a.roomTypeId) ?? 0) - (order.get(b.roomTypeId) ?? 0),
    );
  }, [selections, roomTypes.data]);

  /* A GST-inclusive rate no pre-tax tariff can produce, per room. */
  const inclusiveErrors = useMemo(() => {
    const out = new Map<string, string>();
    if (!ratesIncludeGst) return out;
    for (const sel of selections) {
      const split = splitGstInclusive(Number(sel.sellingRate) || 0);
      if ("error" in split) out.set(sel.key, split.error);
    }
    return out;
  }, [selections, ratesIncludeGst]);

  /* Build the priced room lines the repository expects: one per room.
     With "Rates include GST", every typed rate is converted to its
     pre-tax figure here, so the tax, the invoice and the voucher all
     work from pre-tax rates exactly as before, and the total comes back
     to what was typed. */
  const lineByKey = useMemo(() => {
    const out = new Map<string, ReservationRoom>();
    if (!roomTypes.data) return out;
    for (const sel of orderedSelections) {
      const rt = roomTypes.data.find((t) => t.id === sel.roomTypeId);
      if (!rt) continue;
      let sellingRate = Number(sel.sellingRate) || 0;
      /* A rate for an extra the room does not have is not stored: it
         cannot be charged, and left on the line it reads like one was. */
      let extraBedRate = sel.extraBeds ? Number(sel.extraBedRate) || 0 : 0;
      let childRate = sel.children ? Number(sel.childRate) || 0 : 0;
      if (ratesIncludeGst) {
        const split = splitGstInclusive(sellingRate);
        if ("base" in split) {
          const pre = (v: number) => Math.round((v / (1 + split.rate)) * 100) / 100;
          sellingRate = split.base;
          extraBedRate = pre(extraBedRate);
          childRate = pre(childRate);
        }
      }
      out.set(sel.key, {
        roomTypeId: rt.id,
        roomTypeName: rt.name,
        mealPlan: sel.mealPlan,
        ...(season ? { seasonId: season.id, seasonName: season.name } : {}),
        quantity: 1,
        adults: sel.adults,
        children: sel.children,
        extraBeds: sel.extraBeds,
        sellingRate,
        extraBedRate,
        childRate,
      });
    }
    return out;
  }, [orderedSelections, roomTypes.data, season, ratesIncludeGst]);
  const rooms: ReservationRoom[] = useMemo(() => [...lineByKey.values()], [lineByKey]);

  /* ⚠️ No corporate discount on GST-inclusive rates. A rate negotiated
     inclusive of tax is the agreed final price; taking the company's
     percentage off it as well would discount the same booking twice.
     Mirrored in reservationsRepo.create, which is the real gate. */
  const quote = useMemo(
    () => reservationsRepo.quote(rooms, nights, ratesIncludeGst ? null : company.data),
    [rooms, nights, company.data, ratesIncludeGst],
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
          ratesIncludeGst,
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
    (step === "rates" && hasConfirmation && inclusiveErrors.size === 0) ||
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
                          rooms={orderedSelections.filter((s) => s.roomTypeId === rt.id)}
                          onAdd={(room) => setSelections((prev) => [...prev, room])}
                          onRemove={() =>
                            setSelections((prev) => {
                              const last = [...prev].reverse().find((s) => s.roomTypeId === rt.id);
                              return last ? prev.filter((s) => s.key !== last.key) : prev;
                            })
                          }
                          onChange={(next) =>
                            setSelections((prev) => prev.map((s) => (s.key === next.key ? next : s)))
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
                description={
                  ratesIncludeGst
                    ? "The rates you enter include GST. The quote shows the GST inside them."
                    : "You set the selling rate. The corporate discount and GST are applied on top."
                }
              />
              <CardBody className="space-y-5">
                <div className="rounded-md border border-grey-200 bg-grey-50 p-3.5">
                  <Checkbox
                    checked={ratesIncludeGst}
                    onCheckedChange={setRatesIncludeGst}
                    label="Rates include GST"
                  />
                  <p className="text-sm text-grey-500 mt-1.5 ml-[26px] leading-relaxed">
                    {ratesIncludeGst
                      ? "Each rate below is the final price per night. GST is taken out of it, and no corporate discount is added."
                      : "Tick this when the rate agreed with the hotel already includes GST."}
                  </p>
                </div>

                {selections.length === 0 ? (
                  <EmptyState
                    compact
                    title="No rooms selected"
                    description="Go back a step and add at least one room."
                  />
                ) : (
                  <div className="space-y-3">
                    {orderedSelections.map((sel) => {
                      const rt = roomTypes.data?.find((t) => t.id === sel.roomTypeId);
                      const line = lineByKey.get(sel.key);
                      if (!rt || !line) return null;
                      const siblings = orderedSelections.filter((s) => s.roomTypeId === sel.roomTypeId);
                      const index = siblings.findIndex((s) => s.key === sel.key);
                      return (
                        <RateLine
                          key={sel.key}
                          roomType={rt}
                          selection={sel}
                          index={index}
                          count={siblings.length}
                          nights={nights}
                          line={line}
                          inclusive={ratesIncludeGst}
                          error={inclusiveErrors.get(sel.key)}
                          onChange={(next) =>
                            setSelections((prev) => prev.map((s) => (s.key === next.key ? next : s)))
                          }
                          onCopyToAll={() =>
                            setSelections((prev) =>
                              prev.map((s) =>
                                s.roomTypeId === sel.roomTypeId && s.key !== sel.key
                                  ? {
                                      ...s,
                                      sellingRate: sel.sellingRate,
                                      extraBedRate: sel.extraBedRate,
                                      childRate: sel.childRate,
                                    }
                                  : s,
                              ),
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
                          {t} · {PAYMENT_TERM_LABELS[t]}
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
                      accepted. Fill in <strong>at least one</strong>, whichever the hotel
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
                      time. One of the three is enough.
                    </p>
                  )}
                </div>

                {/* ── Whose booking is this ── */}
                {mayAssign && (
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
                          {actor.name} (me)
                        </option>
                        {owners.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                            {u.department ? ` · ${u.department}` : ""}
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
                      customer to a company first, otherwise the invoice has nobody to go to.
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

                <ReviewRow label="Customer" value={customer?.fullName ?? "-"} sub={customer?.email} />
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
                  value={hotel?.name ?? "-"}
                  sub={hotel ? `${hotel.city}, ${hotel.state}` : undefined}
                />
                <ReviewRow
                  label="Stay"
                  value={
                    range.from && range.to
                      ? `${dateShort(range.from)} → ${dateShort(range.to)}`
                      : "-"
                  }
                  sub={`${nights} night${nights === 1 ? "" : "s"}`}
                />
                <ReviewRow
                  label="Rooms"
                  value={`${rooms.length} room${rooms.length === 1 ? "" : "s"}`}
                  sub={roomSummary(rooms)}
                />
                <ReviewRow
                  label="Rates"
                  value={ratesIncludeGst ? "Include GST" : "GST added on top"}
                  sub={
                    ratesIncludeGst && company.data?.negotiatedDiscountPercent
                      ? "No corporate discount: the rates entered are the final price"
                      : undefined
                  }
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
                <QuoteRow
                  label={ratesIncludeGst ? "Room charges before GST" : "Room charges"}
                  value={money(quote.roomCharges)}
                />
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
                    {ratesIncludeGst && " · rates include GST"}
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
  roomType, season, rooms, onAdd, onRemove, onChange,
}: {
  roomType: RoomType;
  season?: Season;
  /** This type's rooms on the booking, in order. */
  rooms: RoomSelection[];
  onAdd: (room: RoomSelection) => void;
  onRemove: () => void;
  onChange: (next: RoomSelection) => void;
}) {
  const quantity = rooms.length;
  /* ⚠️ Falls back to every plan, not just EP. A property with no
     season configured should still be sellable on any board basis —
     restricting to room-only would silently drop the meal from the
     booking, and it is the meal that gets billed. */
  const offered = season?.mealPlans?.length ? season.mealPlans : MEAL_PLANS;

  /* A new room starts as a copy of the one before it, so ten identical
     rooms are one set of choices and nine clicks, and only the room
     that differs needs changing. */
  function add() {
    const last = rooms[rooms.length - 1];
    onAdd({
      key: newRoomKey(),
      roomTypeId: roomType.id,
      adults: last?.adults ?? 2,
      children: last?.children ?? 0,
      extraBeds: last?.extraBeds ?? 0,
      mealPlan: last?.mealPlan ?? offered[0]!,
      sellingRate: last?.sellingRate ?? "",
      extraBedRate: last?.extraBedRate ?? "",
      childRate: last?.childRate ?? "",
    });
  }

  const maxAdults = Math.max(4, roomType.maxOccupancy || 0);

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
            {/* ⚠️ 0 means "not set yet", not "sold out". Counts for a few
                properties are still being collected from the hotels, and
                capping at 0 made those properties impossible to book. The
                count is a sanity cap, not live availability; Fidato does
                not hold these hotels' inventory. */}
            {roomType.totalRooms > 0 ? `${roomType.totalRooms} rooms` : "Room count not set"}
            {" · "}sleeps {roomType.maxOccupancy}
            {roomType.sizeSqft > 0 && ` · ${roomType.sizeSqft} sq ft`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={onRemove}
              disabled={quantity === 0}
              aria-label={`Remove one ${roomType.name}`}
              className="flex items-center justify-center size-7 rounded-sm border border-grey-300 text-grey-600 hover:bg-grey-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-7 text-center text-base tabular font-medium">{quantity}</span>
            <button
              type="button"
              onClick={add}
              disabled={roomType.totalRooms > 0 && quantity >= roomType.totalRooms}
              aria-label={`Add one ${roomType.name}`}
              className="flex items-center justify-center size-7 rounded-sm border border-grey-300 text-grey-600 hover:bg-grey-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {quantity > 0 && (
        <div className="mt-3 pt-3 border-t border-grey-200 space-y-3">
          {rooms.map((room, i) => (
            <div key={room.key} className="grid gap-3 grid-cols-2 sm:grid-cols-[64px_repeat(4,minmax(0,1fr))] items-end">
              <p className="col-span-2 sm:col-span-1 text-sm font-medium text-ink-900 sm:pb-2">
                Room {i + 1}
              </p>
              <label className="block">
                <span className="block text-sm text-grey-600 mb-1">Meal plan</span>
                <NativeSelect
                  value={room.mealPlan}
                  onChange={(e) => onChange({ ...room, mealPlan: e.target.value as MealPlan })}
                >
                  {offered.map((plan) => (
                    <option key={plan} value={plan}>
                      {MEAL_PLAN_SHORT[plan]} · {MEAL_PLAN_LABELS[plan]}
                    </option>
                  ))}
                </NativeSelect>
              </label>

              <label className="block">
                <span className="block text-sm text-grey-600 mb-1">Adults</span>
                <NativeSelect
                  value={String(room.adults)}
                  onChange={(e) => onChange({ ...room, adults: Number(e.target.value) })}
                >
                  {Array.from({ length: maxAdults }, (_, n) => n + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </NativeSelect>
              </label>

              <label className="block">
                <span className="block text-sm text-grey-600 mb-1">Children</span>
                <NativeSelect
                  value={String(room.children)}
                  onChange={(e) => onChange({ ...room, children: Number(e.target.value) })}
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </NativeSelect>
              </label>

              <label className="block">
                <span className="block text-sm text-grey-600 mb-1">Extra beds</span>
                <NativeSelect
                  value={String(room.extraBeds)}
                  onChange={(e) => onChange({ ...room, extraBeds: Number(e.target.value) })}
                >
                  {Array.from({ length: (roomType.maxExtraBeds || 0) + 1 }, (_, n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </NativeSelect>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A key for a room on this booking. Only needs to be unique on the page. */
function newRoomKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** "2 × Executive Deluxe Room, 1 × Suite" */
function roomSummary(rooms: ReservationRoom[]): string {
  const counts = new Map<string, number>();
  for (const r of rooms) counts.set(r.roomTypeName, (counts.get(r.roomTypeName) ?? 0) + r.quantity);
  return [...counts.entries()].map(([name, n]) => `${n} × ${name}`).join(", ");
}

/* ── Rate entry ────────────────────────────────────────────────────
   The step that replaced the rate-plan lookup.                      */

function RateLine({
  roomType, selection, index, count, nights, line, inclusive, error, onChange, onCopyToAll,
}: {
  roomType: RoomType;
  selection: RoomSelection;
  /** This room's position among the booking's rooms of the same type. */
  index: number;
  count: number;
  nights: number;
  /** The priced line, pre-tax, as it will be saved. */
  line: ReservationRoom;
  /** The rates typed include GST. */
  inclusive: boolean;
  /** Set when an inclusive rate cannot be split into the GST bands. */
  error?: string;
  onChange: (next: RoomSelection) => void;
  onCopyToAll: () => void;
}) {
  const entered = Number(selection.sellingRate) || 0;
  const rate = inclusive ? (splitGstInclusive(entered) as { rate?: number }).rate ?? 0 : 0;
  const band = inclusive ? Math.round(rate * 100) : line.sellingRate >= GST_THRESHOLD ? 18 : 5;
  const preTax = lineTotal(line, nights);
  /* Inclusive: what was typed, across the stay. Otherwise: the pre-tax line. */
  const shown = inclusive
    ? ((Number(selection.sellingRate) || 0) +
        (Number(selection.extraBedRate) || 0) * selection.extraBeds +
        (Number(selection.childRate) || 0) * selection.children) * nights
    : preTax;

  const rateHint = !entered
    ? inclusive ? "Per room per night, including GST" : "Per room per night, before tax"
    : inclusive
      ? `${money(line.sellingRate)} + ${money(entered - line.sellingRate)} GST (${band}%)`
      : `Falls in the ${band}% GST band`;

  return (
    <div className="p-3.5 rounded-md border border-grey-200 bg-white">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="font-medium text-ink-900">
            {roomType.name}
            {count > 1 && (
              <span className="text-grey-500 font-normal"> · Room {index + 1} of {count}</span>
            )}
          </p>
          <p className="text-sm text-grey-500">
            {selection.mealPlan} · {selection.adults} adult{selection.adults === 1 ? "" : "s"}
            {selection.children ? `, ${selection.children} child${selection.children === 1 ? "" : "ren"}` : ""}
            {selection.extraBeds ? `, ${selection.extraBeds} extra bed${selection.extraBeds === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-medium text-ink-900 tabular">{money(shown)}</p>
          <p className="text-sm text-grey-500">
            {nights} night{nights === 1 ? "" : "s"}
            {inclusive ? " · incl. GST" : " · before tax"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Room rate per night" required error={error} hint={rateHint}>
          {(p) => (
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              invalid={p.invalid}
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
          hint={
            selection.extraBeds
              ? `Per bed per night${inclusive ? ", including GST" : ""}`
              : "No extra beds in this room"
          }
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
          hint={
            selection.children
              ? `Per child per night${inclusive ? ", including GST" : ""}`
              : "No children in this room"
          }
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

      {count > 1 && index === 0 && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Copy className="size-3.5" />}
            onClick={onCopyToAll}
            disabled={!selection.sellingRate}
          >
            Use these rates for all {count} rooms
          </Button>
        </div>
      )}
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
