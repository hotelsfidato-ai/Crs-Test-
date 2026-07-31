import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { cn } from "@/lib/cn";
import { useScope } from "@/lib/session";
import { reservationsRepo, hotelsRepo, TODAY } from "@/data/repositories";
import { isoDate, money, dateShort, truncate } from "@/lib/format";
import { labelFor } from "@/lib/rules";
import {
  Page, PageHeader, Card, Button, Segmented, Skeleton,
  StatusPill, NativeSelect, EmptyState, Tooltip,
} from "@/components/ui";
import type { Reservation } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   RESERVATION CALENDAR
   Two views: a month grid for "what is happening when", and a
   property timeline for "which property is filling up".
   ══════════════════════════════════════════════════════════════════ */

type View = "month" | "timeline";

const STATUS_BAR: Record<string, string> = {
  confirmed: "bg-success",
  checked_in: "bg-info",
  pending_approval: "bg-brand-yellow",
  completed: "bg-grey-400",
  draft: "bg-grey-300",
  cancelled: "bg-brand-red",
  no_show: "bg-brand-rose",
};

export default function CalendarPage() {
  const scope = useScope();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("month");
  const [month, setMonth] = useState(startOfMonth(TODAY));
  const [hotelFilter, setHotelFilter] = useState("all");

  const rangeStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

  const hotels = useQuery({
    queryKey: ["hotels-all"],
    queryFn: () => hotelsRepo.all(),
  });

  const reservations = useQuery({
    queryKey: ["reservations-range", isoDate(rangeStart), isoDate(rangeEnd), scope.role, scope.userId],
    queryFn: () => reservationsRepo.inRange(isoDate(rangeStart), isoDate(rangeEnd), scope),
  });

  const rows = useMemo(() => {
    const all = reservations.data ?? [];
    return hotelFilter === "all" ? all : all.filter((r) => r.hotelId === hotelFilter);
  }, [reservations.data, hotelFilter]);

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Reservations", to: "/reservations" }, { label: "Calendar" }]}
        title="Calendar"
        description="Stays overlapping the visible window. Colour follows reservation status."
        actions={
          <Button asChild variant="secondary" leadingIcon={<List className="size-4" />}>
            <Link to="/reservations">List view</Link>
          </Button>
        }
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonth((m) => subMonths(m, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-md font-semibold text-ink-900 min-w-[150px] text-center">
              {format(month, "MMMM yyyy")}
            </span>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next month"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-1"
              onClick={() => setMonth(startOfMonth(TODAY))}
            >
              Today
            </Button>
          </div>

          <NativeSelect
            value={hotelFilter}
            onChange={(e) => setHotelFilter(e.target.value)}
            aria-label="Filter by property"
            className="w-auto min-w-[180px]"
          >
            <option value="all">All properties</option>
            {(hotels.data ?? []).map((h) => (
              <option key={h.id} value={h.id}>{h.shortName}</option>
            ))}
          </NativeSelect>

          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "month", label: "Month" },
              { value: "timeline", label: "By property" },
            ]}
          />
        </div>
      </PageHeader>

      {reservations.isLoading ? (
        <Skeleton className="h-[640px] w-full" />
      ) : view === "month" ? (
        <MonthView
          month={month}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          reservations={rows}
          onOpen={(id) => navigate(`/reservations/${id}`)}
        />
      ) : (
        <TimelineView month={month} reservations={rows} onOpen={(id) => navigate(`/reservations/${id}`)} />
      )}

      <Legend />
    </Page>
  );
}

/* ── Month grid ────────────────────────────────────────────────── */

function MonthView({
  month, rangeStart, rangeEnd, reservations, onOpen,
}: {
  month: Date;
  rangeStart: Date;
  rangeEnd: Date;
  reservations: Reservation[];
  onOpen: (id: string) => void;
}) {
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  // A stay occupies every night from check-in up to (not including) check-out.
  const byDay = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of reservations) {
      const start = parseISO(r.checkIn);
      const end = parseISO(r.checkOut);
      for (const d of eachDayOfInterval({ start, end: addDays(end, -1) })) {
        const key = isoDate(d);
        map.set(key, [...(map.get(key) ?? []), r]);
      }
    }
    return map;
  }, [reservations]);

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-grey-200 bg-grey-50">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="px-2 h-9 flex items-center justify-center text-2xs font-semibold uppercase tracking-wide text-grey-500"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = isoDate(day);
          const items = byDay.get(key) ?? [];
          const outside = !isSameMonth(day, month);
          const today = isSameDay(day, TODAY);

          return (
            <div
              key={key}
              className={cn(
                "min-h-[112px] border-b border-r border-grey-100 p-1.5",
                "last-of-type:border-r-0 [&:nth-child(7n)]:border-r-0",
                outside && "bg-grey-50/60",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "inline-flex items-center justify-center size-5 rounded-full text-xs tabular",
                    today
                      ? "bg-brand-orange text-white font-semibold"
                      : outside
                        ? "text-grey-300"
                        : "text-grey-600",
                  )}
                >
                  {format(day, "d")}
                </span>
                {items.length > 3 && (
                  <span className="text-2xs text-grey-400 tabular">{items.length}</span>
                )}
              </div>

              <div className="space-y-0.5">
                {items.slice(0, 3).map((r) => (
                  <Tooltip
                    key={`${key}-${r.id}`}
                    content={
                      <>
                        {r.reference} · {r.customerName}
                        <br />
                        {r.hotelName} · {money(r.totalAmount)}
                        <br />
                        {dateShort(r.checkIn)} → {dateShort(r.checkOut)}
                      </>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(r.id)}
                      className="flex items-center gap-1 w-full px-1 py-0.5 rounded-xs text-left hover:bg-grey-100 transition-colors duration-150"
                    >
                      <span
                        className={cn("w-1 h-3 rounded-full shrink-0", STATUS_BAR[r.status])}
                      />
                      <span className="text-2xs text-grey-700 truncate">
                        {truncate(r.customerName, 14)}
                      </span>
                    </button>
                  </Tooltip>
                ))}
                {items.length > 3 && (
                  <p className="px-1 text-2xs text-grey-400">+{items.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── Property timeline ─────────────────────────────────────────── */

function TimelineView({
  month, reservations, onOpen,
}: {
  month: Date;
  reservations: Reservation[];
  onOpen: (id: string) => void;
}) {
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });

  const byHotel = useMemo(() => {
    const map = new Map<string, { name: string; items: Reservation[] }>();
    for (const r of reservations) {
      const entry = map.get(r.hotelId) ?? { name: r.hotelName, items: [] };
      entry.items.push(r);
      map.set(r.hotelId, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
  }, [reservations]);

  if (!byHotel.length) {
    return (
      <Card>
        <EmptyState
          title="Nothing booked this month"
          description="No reservations overlap the visible window for the current filter."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto scrollbar-quiet">
        <div className="min-w-[900px]">
          {/* Day ruler */}
          <div className="flex border-b border-grey-200 bg-grey-50 sticky top-0 z-10">
            <div className="w-[180px] shrink-0 px-4 h-9 flex items-center text-2xs font-semibold uppercase tracking-wide text-grey-500 border-r border-grey-200">
              Property
            </div>
            <div className="flex-1 flex">
              {days.map((d) => (
                <div
                  key={isoDate(d)}
                  className={cn(
                    "flex-1 h-9 flex items-center justify-center text-2xs tabular border-r border-grey-100 last:border-r-0",
                    isSameDay(d, TODAY) ? "bg-brand-orange-50 text-brand-orange font-semibold" : "text-grey-400",
                  )}
                >
                  {format(d, "d")}
                </div>
              ))}
            </div>
          </div>

          {byHotel.map(([hotelId, entry]) => (
            <div key={hotelId} className="flex border-b border-grey-100 last:border-b-0">
              <div className="w-[180px] shrink-0 px-4 py-2.5 border-r border-grey-200 min-w-0">
                <Link
                  to={`/hotels/${hotelId}`}
                  className="text-sm text-ink-900 hover:text-brand-orange transition-colors duration-150 block truncate"
                >
                  {entry.name}
                </Link>
                <p className="text-2xs text-grey-400">
                  {entry.items.length} booking{entry.items.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="flex-1 relative py-2 min-h-[52px]">
                {/* Day gridlines */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {days.map((d) => (
                    <div
                      key={isoDate(d)}
                      className={cn(
                        "flex-1 border-r border-grey-100 last:border-r-0",
                        isSameDay(d, TODAY) && "bg-brand-orange-50/40",
                      )}
                    />
                  ))}
                </div>

                {/* Stay bars, packed into rows so they don't overlap */}
                <div className="relative space-y-1">
                  {packRows(entry.items, days[0]!, days.length).map((row, rowIndex) => (
                    <div key={rowIndex} className="relative h-5">
                      {row.map(({ reservation, offset, span }) => (
                        <Tooltip
                          key={reservation.id}
                          content={
                            <>
                              {reservation.reference} · {reservation.customerName}
                              <br />
                              {dateShort(reservation.checkIn)} → {dateShort(reservation.checkOut)}
                              <br />
                              {reservation.totalRooms} room
                              {reservation.totalRooms === 1 ? "" : "s"} ·{" "}
                              {money(reservation.totalAmount)}
                            </>
                          }
                        >
                          <button
                            type="button"
                            onClick={() => onOpen(reservation.id)}
                            className={cn(
                              "absolute h-5 rounded-xs px-1.5 flex items-center overflow-hidden",
                              "text-2xs text-white whitespace-nowrap",
                              "hover:brightness-110 transition-[filter] duration-150",
                              STATUS_BAR[reservation.status],
                            )}
                            style={{
                              left: `${(offset / days.length) * 100}%`,
                              width: `${(span / days.length) * 100}%`,
                            }}
                          >
                            {truncate(reservation.customerName, 18)}
                          </button>
                        </Tooltip>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

interface PackedBar {
  reservation: Reservation;
  offset: number;
  span: number;
}

/** Greedy interval packing so overlapping stays stack instead of colliding. */
function packRows(items: Reservation[], firstDay: Date, dayCount: number): PackedBar[][] {
  const bars: PackedBar[] = items
    .map((r) => {
      const start = parseISO(r.checkIn);
      const end = parseISO(r.checkOut);
      const offset = Math.max(
        0,
        Math.round((start.getTime() - firstDay.getTime()) / 86_400_000),
      );
      const rawSpan = Math.round((end.getTime() - start.getTime()) / 86_400_000);
      const span = Math.max(1, Math.min(rawSpan, dayCount - offset));
      return { reservation: r, offset, span };
    })
    .filter((b) => b.offset < dayCount && b.span > 0)
    .sort((a, b) => a.offset - b.offset);

  const rows: PackedBar[][] = [];
  for (const bar of bars) {
    const row = rows.find((r) => {
      const last = r[r.length - 1]!;
      return last.offset + last.span <= bar.offset;
    });
    if (row) row.push(bar);
    else if (rows.length < 6) rows.push([bar]);
  }
  return rows;
}

function Legend() {
  const entries = [
    "confirmed", "checked_in", "pending_approval", "completed", "cancelled",
  ];
  return (
    <div className="flex items-center gap-4 flex-wrap mt-4">
      {entries.map((status) => (
        <span key={status} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", STATUS_BAR[status])} />
          <span className="text-sm text-grey-500">{labelFor(status as never)}</span>
        </span>
      ))}
      <StatusPill tone="neutral" dot={false} className="ml-auto">
        Select any bar to open the reservation
      </StatusPill>
    </div>
  );
}
