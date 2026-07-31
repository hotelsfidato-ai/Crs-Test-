import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Info } from "lucide-react";
import { useSession, useActor } from "@/lib/session";
import { hotelsRepo, ratePlansRepo } from "@/data/repositories";
import { money, dateShort, humanise } from "@/lib/format";
import { canEditRates } from "@/lib/rules";
import {
  Page, PageHeader, Card, CardBody, CardHeader, Button, DataTable, Skeleton,
  StatusPill, Dialog, DialogContent, DialogTrigger, DialogClose, Field, Input,
  Textarea, EmptyState, Tooltip, toast, Stat, type Column,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import type { RatePlan } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   RATE PLANS
   Hotel managers can read this screen but never edit it — pricing
   is owned centrally by the revenue team. That restriction is the
   clearest demonstration of the role model in the product.
   ══════════════════════════════════════════════════════════════════ */

const MEAL_PLAN_LABELS: Record<string, string> = {
  EP: "Room only",
  CP: "Bed & breakfast",
  MAP: "Half board",
  AP: "Full board",
};

export default function RatesPage() {
  const { id = "" } = useParams();
  const role = useSession((s) => s.role);
  const access = canEditRates(role);

  const hotel = useQuery({
    queryKey: ["hotel", id],
    queryFn: () => hotelsRepo.get(id),
  });

  const ratePlans = useQuery({
    queryKey: ["hotel-rate-plans", id],
    queryFn: () => hotelsRepo.ratePlans(id),
  });

  if (hotel.isLoading) return <PageSkeleton />;
  if (!hotel.data) return <NotFound />;

  const h = hotel.data;
  const plans = ratePlans.data ?? [];
  const active = plans.filter((p) => p.isActive);
  const lowest = plans.length ? Math.min(...plans.map((p) => p.rate)) : 0;
  const highest = plans.length ? Math.max(...plans.map((p) => p.rate)) : 0;

  const columns: Column<RatePlan>[] = [
    {
      key: "name", header: "Rate plan",
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 truncate">{p.name}</p>
          <p className="text-sm text-grey-500">
            {p.code} · {MEAL_PLAN_LABELS[p.mealPlan] ?? p.mealPlan}
          </p>
        </div>
      ),
    },
    { key: "roomTypeName", header: "Room type", cell: (p) => p.roomTypeName },
    {
      key: "validFrom", header: "Season", hideBelow: "lg",
      cell: (p) => (
        <span className="text-sm text-grey-600 tabular">
          {dateShort(p.validFrom)} → {dateShort(p.validTo)}
        </span>
      ),
    },
    {
      key: "minNights", header: "Min nights", numeric: true, hideBelow: "xl",
      cell: (p) => p.minNights,
    },
    {
      key: "isActive", header: "Status",
      cell: (p) => (
        <StatusPill tone={p.isActive ? "success" : "neutral"}>
          {p.isActive ? "Active" : "Inactive"}
        </StatusPill>
      ),
    },
    {
      key: "rate", header: "Rate", numeric: true,
      cell: (p) => <span className="font-medium">{money(p.rate)}</span>,
    },
    {
      key: "actions", header: "", width: "w-20",
      cell: (p) =>
        access.allowed ? (
          <EditRateDialog plan={p} />
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
          { label: "Rate plans" },
        ]}
        title="Rate plans"
        description={`Season and meal-plan pricing for ${h.name}.`}
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
                {access.reason} You can see every rate here, but changes must come from
                the revenue team. Switch role in the top bar to see the editable view.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Rate plans" value={plans.length} hint={`${active.length} active`} />
        </Card>
        <Card className="p-5">
          <Stat label="Lowest rate" value={lowest ? money(lowest) : "—"} />
        </Card>
        <Card className="p-5">
          <Stat label="Highest rate" value={highest ? money(highest) : "—"} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Room types"
            value={new Set(plans.map((p) => p.roomTypeId)).size}
            hint="Priced"
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="All rate plans"
          description="Grouped by room type, meal plan and season"
        />
        <DataTable
          columns={columns}
          rows={plans}
          rowKey={(p) => p.id}
          loading={ratePlans.isLoading}
          className="border-0 rounded-none rounded-b-md"
          stickyHeader={false}
          empty={
            <EmptyState
              compact
              title="No rate plans"
              description="Rates are configured during property onboarding."
            />
          }
        />
      </Card>

      <p className="flex items-start gap-2 text-xs text-grey-400 mt-4">
        <Info className="size-3.5 shrink-0 mt-px" />
        Rates shown are per room per night before tax. The applicable GST band follows the
        nightly rate — 12% below ₹7,500 and 18% at or above.
      </p>
    </Page>
  );
}

function EditRateDialog({ plan }: { plan: RatePlan }) {
  const actor = useActor();
  const queryClient = useQueryClient();
  const [rate, setRate] = useState(String(plan.rate));
  const [policy, setPolicy] = useState(plan.cancellationPolicy);

  const save = useMutation({
    mutationFn: () =>
      ratePlansRepo.update(
        plan.id,
        { rate: Number(rate), cancellationPolicy: policy },
        actor,
      ),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["hotel-rate-plans", plan.hotelId] });
      toast.success("Rate updated", `${updated.name} is now ${money(updated.rate)}.`);
    },
    onError: () => toast.error("Could not update", "Nothing was changed."),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" leadingIcon={<Pencil className="size-3.5" />}>
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent
        title={plan.name}
        description={`${plan.roomTypeName} · ${humanise(plan.mealPlan)} · ${dateShort(plan.validFrom)} → ${dateShort(plan.validTo)}`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                Save rate
              </Button>
            </DialogClose>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Rate per night" required hint="Before tax">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                numeric
                value={rate}
                onChange={(e) => setRate(e.target.value)}
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
              />
            )}
          </Field>

          <p className="text-sm text-grey-500 leading-relaxed">
            Changing a rate affects new bookings only. Existing reservations keep the rate
            they were quoted, and the change is written to the audit trail.
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
