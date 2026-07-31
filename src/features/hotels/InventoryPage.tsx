import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isWeekend } from "date-fns";
import { cn } from "@/lib/cn";
import { hotelsRepo, TODAY } from "@/data/repositories";
import { money, number, percent, isoDate } from "@/lib/format";
import {
  Page, PageHeader, Card, CardBody, Skeleton, Stat, Segmented,
  StatusPill, Tooltip, EmptyState,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import type { InventoryDay } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   INVENTORY GRID
   Room types down, days across. Cell shading is availability
   pressure, so a wall of dark cells reads as "we are full" at a
   glance without reading a single number.
   ══════════════════════════════════════════════════════════════════ */

type Horizon = 30 | 45 | 60;

export default function InventoryPage() {
  const { id = "" } = useParams();
  const [horizon, setHorizon] = useState<Horizon>(30);

  const hotel = useQuery({
    queryKey: ["hotel", id],
    queryFn: () => hotelsRepo.get(id),
  });

  const roomTypes = useQuery({
    queryKey: ["hotel-room-types", id],
    queryFn: () => hotelsRepo.roomTypes(id),
  });

  const inventory = useQuery({
    queryKey: ["hotel-inventory", id, horizon],
    queryFn: () => hotelsRepo.inventory(id, horizon),
  });

  const days = useMemo(() => {
    const set = new Set((inventory.data ?? []).map((d) => d.date));
    return [...set].sort();
  }, [inventory.data]);

  const byRoomType = useMemo(() => {
    const map = new Map<string, Map<string, InventoryDay>>();
    for (const row of inventory.data ?? []) {
      const inner = map.get(row.roomTypeId) ?? new Map();
      inner.set(row.date, row);
      map.set(row.roomTypeId, inner);
    }
    return map;
  }, [inventory.data]);

  const totals = useMemo(() => {
    const rows = inventory.data ?? [];
    const capacity = rows.reduce((s, r) => s + r.totalRooms, 0);
    const booked = rows.reduce((s, r) => s + r.booked, 0);
    const blocked = rows.reduce((s, r) => s + r.blocked, 0);
    return {
      capacity,
      booked,
      blocked,
      available: capacity - booked - blocked,
      occupancy: capacity > 0 ? (booked / capacity) * 100 : 0,
    };
  }, [inventory.data]);

  if (hotel.isLoading) return <PageSkeleton />;
  if (!hotel.data) return <NotFound />;

  const h = hotel.data;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Properties", to: "/hotels" },
          { label: h.shortName, to: `/hotels/${h.id}` },
          { label: "Inventory" },
        ]}
        title="Inventory"
        description={`Room availability at ${h.name} for the next ${horizon} days.`}
      >
        <Segmented
          value={String(horizon)}
          onChange={(v) => setHorizon(Number(v) as Horizon)}
          options={[
            { value: "30", label: "30 days" },
            { value: "45", label: "45 days" },
            { value: "60", label: "60 days" },
          ]}
        />
      </PageHeader>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat
            label="Room nights"
            value={number(totals.capacity)}
            hint={`${h.totalRooms} rooms × ${horizon} days`}
          />
        </Card>
        <Card className="p-5">
          <Stat label="Booked" value={number(totals.booked)} />
        </Card>
        <Card className="p-5">
          <Stat label="Available" value={number(totals.available)} hint={`${totals.blocked} blocked`} />
        </Card>
        <Card className="p-5">
          <Stat label="Occupancy" value={percent(totals.occupancy, 0)} hint="Across the window" />
        </Card>
      </div>

      {inventory.isLoading || roomTypes.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : !roomTypes.data?.length ? (
        <Card>
          <EmptyState
            title="No room types configured"
            description="Inventory appears once room types are set up for this property."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto scrollbar-quiet">
            <div className="min-w-[900px]">
              {/* Day ruler */}
              <div className="flex border-b border-grey-200 bg-grey-50 sticky top-0 z-10">
                <div className="w-[200px] shrink-0 px-4 h-11 flex items-center text-2xs font-semibold uppercase tracking-wide text-grey-500 border-r border-grey-200">
                  Room type
                </div>
                <div className="flex-1 flex">
                  {days.map((d) => {
                    const date = parseISO(d);
                    const today = d === isoDate(TODAY);
                    return (
                      <div
                        key={d}
                        className={cn(
                          "flex-1 min-w-[26px] h-11 flex flex-col items-center justify-center border-r border-grey-100 last:border-r-0",
                          isWeekend(date) && "bg-grey-100/60",
                          today && "bg-brand-orange-50",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[9px] uppercase",
                            today ? "text-brand-orange font-semibold" : "text-grey-400",
                          )}
                        >
                          {format(date, "EEEEE")}
                        </span>
                        <span
                          className={cn(
                            "text-2xs tabular",
                            today ? "text-brand-orange font-semibold" : "text-grey-600",
                          )}
                        >
                          {format(date, "d")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* One row per room type */}
              {roomTypes.data.map((rt) => {
                const cells = byRoomType.get(rt.id);
                return (
                  <div key={rt.id} className="flex border-b border-grey-100 last:border-b-0">
                    <div className="w-[200px] shrink-0 px-4 py-2.5 border-r border-grey-200 min-w-0">
                      <p className="text-sm font-medium text-ink-900 truncate">{rt.name}</p>
                      <p className="text-2xs text-grey-400 tabular">
                        {rt.totalRooms} rooms · {money(rt.baseRate)}
                      </p>
                    </div>

                    <div className="flex-1 flex">
                      {days.map((d) => {
                        const cell = cells?.get(d);
                        if (!cell) {
                          return <div key={d} className="flex-1 min-w-[26px] border-r border-grey-100 last:border-r-0" />;
                        }

                        const soldPercent =
                          cell.totalRooms > 0 ? (cell.booked / cell.totalRooms) * 100 : 0;

                        return (
                          <Tooltip
                            key={d}
                            content={
                              <>
                                {format(parseISO(d), "EEE d MMM")}
                                <br />
                                {cell.available} of {cell.totalRooms} available
                                <br />
                                {cell.booked} booked
                                {cell.blocked > 0 && `, ${cell.blocked} blocked`}
                                <br />
                                Rate {money(cell.rate)}
                              </>
                            }
                          >
                            <div
                              className={cn(
                                "flex-1 min-w-[26px] h-11 flex items-center justify-center",
                                "border-r border-grey-100 last:border-r-0 cursor-default",
                                pressureClass(soldPercent),
                              )}
                            >
                              <span
                                className={cn(
                                  "text-2xs tabular",
                                  soldPercent >= 75 ? "text-white" : "text-grey-700",
                                )}
                              >
                                {cell.available}
                              </span>
                            </div>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <CardBody className="border-t border-grey-200 bg-grey-50">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-grey-500">Rooms still available:</span>
              {[
                { label: "Plenty", cls: "bg-white border border-grey-200" },
                { label: "Filling", cls: "bg-brand-yellow-50" },
                { label: "Tight", cls: "bg-brand-orange-100" },
                { label: "Nearly full", cls: "bg-brand-orange" },
                { label: "Sold out", cls: "bg-brand-red" },
              ].map((entry) => (
                <span key={entry.label} className="flex items-center gap-1.5">
                  <span className={cn("size-3.5 rounded-xs", entry.cls)} />
                  <span className="text-sm text-grey-600">{entry.label}</span>
                </span>
              ))}
              <StatusPill tone="neutral" dot={false} className="ml-auto">
                Simulated data — Phase 2 reads live PMS inventory
              </StatusPill>
            </div>
          </CardBody>
        </Card>
      )}
    </Page>
  );
}

/** Cell shading by how sold-out the day is. */
function pressureClass(soldPercent: number): string {
  if (soldPercent >= 100) return "bg-brand-red";
  if (soldPercent >= 88) return "bg-brand-orange";
  if (soldPercent >= 70) return "bg-brand-orange-100";
  if (soldPercent >= 45) return "bg-brand-yellow-50";
  return "bg-white";
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
      <Skeleton className="h-[420px] w-full" />
    </Page>
  );
}
