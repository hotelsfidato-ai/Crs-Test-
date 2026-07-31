import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Info, CalendarPlus } from "lucide-react";
import { useSession, useActor } from "@/lib/session";
import { hotelsRepo, roomConfigRepo } from "@/data/repositories";
import { dateShort } from "@/lib/format";
import { canEditRates } from "@/lib/rules";
import { GST_THRESHOLD } from "@/lib/tax";
import {
  Page, PageHeader, Card, CardBody, CardHeader, Button, DataTable, Skeleton,
  StatusPill, Dialog, DialogContent, DialogTrigger, DialogClose, Field, Input,
  Textarea, EmptyState, Tooltip, Checkbox, toast, Stat, type Column,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import { MEAL_PLAN_LABELS, type MealPlan, type Season } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   SEASONS

   Phase 1 called this "rate plans" and each row carried a price.
   Phase 2 removed the price.

   ⚠️ Fidato negotiates every booking. A published rate on a property
   it does not own is a number nobody is bound by, and the moment one
   exists the wizard starts defaulting to it — which is how a
   salesperson quotes last year's price without noticing. A season now
   defines *applicability* — dates, meal plans, minimum stay, policy —
   and the selling rate is typed per reservation.
   ══════════════════════════════════════════════════════════════════ */

const ALL_MEAL_PLANS: MealPlan[] = ["EP", "AP", "MAP", "ALL_INCLUSIVE"];

export default function RatesPage() {
  const { id = "" } = useParams();
  const role = useSession((s) => s.role);
  const access = canEditRates(role);

  const hotel = useQuery({
    queryKey: ["hotel", id],
    queryFn: () => hotelsRepo.get(id),
  });

  const seasonsQuery = useQuery({
    queryKey: ["hotel-seasons", id],
    queryFn: () => hotelsRepo.seasons(id),
  });

  if (hotel.isLoading) return <PageSkeleton />;
  if (!hotel.data) return <NotFound />;

  const h = hotel.data;
  const seasons = seasonsQuery.data ?? [];
  const active = seasons.filter((s) => s.isActive);
  const today = new Date().toISOString().slice(0, 10);
  const current = active.find((s) => s.validFrom <= today && s.validTo >= today);

  const columns: Column<Season>[] = [
    {
      key: "name", header: "Season",
      cell: (s) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 truncate">{s.name}</p>
          <p className="text-sm text-grey-500 tabular">
            {dateShort(s.validFrom)} → {dateShort(s.validTo)}
          </p>
        </div>
      ),
    },
    {
      key: "mealPlans", header: "Meal plans",
      cell: (s) => (
        <div className="flex flex-wrap gap-1">
          {s.mealPlans.map((plan) => (
            <Tooltip key={plan} content={MEAL_PLAN_LABELS[plan]}>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs bg-grey-100 text-2xs font-medium text-grey-600">
                {plan === "ALL_INCLUSIVE" ? "AI" : plan}
              </span>
            </Tooltip>
          ))}
          {s.mealPlans.length === 0 && <span className="text-sm text-grey-400">None set</span>}
        </div>
      ),
    },
    {
      key: "minNights", header: "Min nights", numeric: true, hideBelow: "lg",
      cell: (s) => <span className="tabular">{s.minNights || "—"}</span>,
    },
    {
      key: "cancellationPolicy", header: "Cancellation policy", hideBelow: "xl",
      cell: (s) => (
        <span className="text-sm text-grey-600 line-clamp-2">
          {s.cancellationPolicy || "—"}
        </span>
      ),
    },
    {
      key: "isActive", header: "Status",
      cell: (s) => (
        <StatusPill tone={s.isActive ? "success" : "neutral"}>
          {s.isActive ? "Active" : "Inactive"}
        </StatusPill>
      ),
    },
    {
      key: "actions", header: "", width: "w-20",
      cell: (s) =>
        access.allowed ? (
          <SeasonDialog hotelId={id} hotelName={h.name} season={s} />
        ) : (
          <Tooltip content={access.reason}>
            <span className="inline-flex items-center gap-1 text-2xs text-grey-400">
              <Lock className="size-3" />
              Locked
            </span>
          </Tooltip>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Properties", to: "/hotels" },
          { label: h.shortName, to: `/hotels/${h.id}` },
          { label: "Seasons" },
        ]}
        title="Seasons"
        description={`Date windows, meal plans and stay rules for ${h.name}. Selling rates are entered per booking.`}
        actions={
          access.allowed ? <SeasonDialog hotelId={id} hotelName={h.name} /> : undefined
        }
      />

      {/* The restriction is stated plainly rather than hidden behind a
          disabled button with no explanation. */}
      {!access.allowed && (
        <Card className="mb-6 bg-grey-50">
          <CardBody className="flex items-start gap-3">
            <Lock className="size-4 text-grey-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-ink-900">Read-only for your role</p>
              <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                {access.reason} You can see every season here, but changes must come from
                the revenue team.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Seasons" value={seasons.length} hint={`${active.length} active`} />
        </Card>
        <Card className="p-5">
          <Stat
            label="In effect today"
            value={current?.name ?? "None"}
            hint={current ? `Until ${dateShort(current.validTo)}` : "No season covers today"}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Meal plans offered"
            value={new Set(seasons.flatMap((s) => s.mealPlans)).size}
            hint={`Of ${ALL_MEAL_PLANS.length}`}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Longest min stay"
            value={seasons.length ? Math.max(...seasons.map((s) => s.minNights)) : 0}
            hint="Nights"
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="All seasons"
          description="Newest window first. Where two overlap, the later start wins."
        />
        <DataTable
          columns={columns}
          rows={seasons}
          rowKey={(s) => s.id}
          loading={seasonsQuery.isLoading}
          className="border-0 rounded-none rounded-b-md"
          stickyHeader={false}
          empty={
            <EmptyState
              compact
              title="No seasons yet"
              description="Add a season to define which meal plans and stay rules apply, and when. Bookings still work without one — the wizard just will not pre-fill a meal plan."
            />
          }
        />
      </Card>

      <p className="flex items-start gap-2 text-xs text-grey-400 mt-4">
        <Info className="size-3.5 shrink-0 mt-px" />
        Seasons carry no price. The salesperson types the selling rate on each booking, and
        GST follows that rate — 5% below ₹{GST_THRESHOLD.toLocaleString("en-IN")} per night,
        18% at or above.
      </p>
    </Page>
  );
}

/* ── Create / edit ─────────────────────────────────────────────── */

function SeasonDialog({
  hotelId, hotelName, season,
}: {
  hotelId: string;
  hotelName: string;
  season?: Season;
}) {
  const actor = useActor();
  const queryClient = useQueryClient();
  const isEdit = Boolean(season);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(season?.name ?? "");
  const [validFrom, setValidFrom] = useState(season?.validFrom ?? "");
  const [validTo, setValidTo] = useState(season?.validTo ?? "");
  const [mealPlans, setMealPlans] = useState<MealPlan[]>(season?.mealPlans ?? ["EP"]);
  const [minNights, setMinNights] = useState(String(season?.minNights ?? 1));
  const [policy, setPolicy] = useState(season?.cancellationPolicy ?? "");
  const [isActive, setIsActive] = useState(season?.isActive ?? true);

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      const payload = {
        hotelId,
        hotelName,
        name: name.trim(),
        validFrom,
        validTo,
        mealPlans,
        minNights: Number(minNights) || 1,
        cancellationPolicy: policy.trim(),
        isActive,
      };
      if (season) await roomConfigRepo.updateSeason(season.id, payload, actor);
      else await roomConfigRepo.createSeason(payload, actor);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-seasons", hotelId] });
      toast.success(
        isEdit ? "Season updated" : "Season added",
        `${name} applies from ${dateShort(validFrom)} to ${dateShort(validTo)}.`,
      );
      setOpen(false);
    },
    onError: () => toast.error("Could not save", "Nothing was changed."),
  });

  /* ⚠️ An inverted range silently matches nothing — every booking then
     falls outside every season with no error anywhere. Caught here. */
  const rangeInvalid = Boolean(validFrom && validTo && validFrom > validTo);
  const ready = name.trim().length > 1 && validFrom && validTo && !rangeInvalid;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm" leadingIcon={<Pencil className="size-3.5" />}>
            Edit
          </Button>
        ) : (
          <Button leadingIcon={<CalendarPlus className="size-4" />}>Add season</Button>
        )}
      </DialogTrigger>

      <DialogContent
        title={isEdit ? season!.name : "Add a season"}
        description={hotelName}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!ready}
              onClick={() => save.mutate()}
            >
              {isEdit ? "Save season" : "Add season"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Season name" required hint="How the sales team refers to it.">
            {({ id }) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Peak — Diwali"
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valid from" required>
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Valid to"
              required
              error={rangeInvalid ? "End date is before the start date." : undefined}
            >
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field
            label="Meal plans"
            hint="Which board options this property offers in this window."
          >
            {() => (
              <div className="grid gap-2 sm:grid-cols-2">
                {ALL_MEAL_PLANS.map((plan) => (
                  <label
                    key={plan}
                    className="flex items-start gap-2.5 px-3 py-2 rounded-md border border-grey-200 cursor-pointer hover:border-grey-300"
                  >
                    <Checkbox
                      checked={mealPlans.includes(plan)}
                      onCheckedChange={(next) =>
                        setMealPlans((prev) =>
                          next ? [...prev, plan] : prev.filter((p) => p !== plan),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-900">{plan}</span>
                      <span className="block text-xs text-grey-500">
                        {MEAL_PLAN_LABELS[plan]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <Field label="Minimum nights" hint="1 means no minimum.">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                numeric
                min={1}
                value={minNights}
                onChange={(e) => setMinNights(e.target.value)}
              />
            )}
          </Field>

          <Field label="Cancellation policy">
            {({ id }) => (
              <Textarea
                id={id}
                rows={3}
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
                placeholder="Free cancellation up to 7 days before arrival."
              />
            )}
          </Field>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(Boolean(v))} />
            <span className="text-sm text-ink-900">
              Active — offer this season in the reservation wizard
            </span>
          </label>

          <p className="text-sm text-grey-500 leading-relaxed">
            Changing a season affects new bookings only. Existing reservations keep the
            meal plan and rate they were quoted, and the change is written to the audit
            trail.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PageSkeleton() {
  return (
    <Page>
      <Skeleton className="h-3 w-56 mb-3" />
      <Skeleton className="h-8 w-48 mb-8" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </Page>
  );
}
