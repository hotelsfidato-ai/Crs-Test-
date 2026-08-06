import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarOff } from "lucide-react";
import { Card, CardBody, Button, NativeSelect, Skeleton } from "@/components/ui";
import { money } from "@/lib/format";
import { fetchRegister } from "./registerRepo";
import type { RegisterQuery, RegisterBookingRow } from "./types";

/* ══════════════════════════════════════════════════════════════════
   CALENDAR

   ⚠️ Toggles between check-in and booking date, as asked. They answer
   different questions — arrivals on a day versus sales made on a day —
   and the same booking sits in two different places depending which
   you pick.

   ⚠️ The 1,657 blank rows can never appear here, whatever the table is
   set to show. They have no dates at all; there is nothing to place
   them on. That is a property of the data, not a filter.
   ══════════════════════════════════════════════════════════════════ */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function RegisterCalendar({
  query, onChange,
}: {
  query: RegisterQuery;
  onChange: (q: RegisterQuery) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const dateField = query.dateField ?? "check_in_date";

  const monthStart = new Date(cursor.year, cursor.month, 1);
  const monthEnd = new Date(cursor.year, cursor.month + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  /* ⚠️ Fetches the month, not the filtered page. The table pages at 50;
     a calendar showing 50 of a month's bookings would be wrong in a way
     nobody would notice. */
  const monthQuery: RegisterQuery = {
    ...query,
    from: iso(monthStart),
    to: iso(monthEnd),
    dateField,
    hideBlank: true,
    page: 1,
    pageSize: 1000,
  };

  const data = useQuery({
    queryKey: ["register-calendar", monthQuery],
    queryFn: () => fetchRegister(monthQuery),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, RegisterBookingRow[]>();
    for (const row of data.data?.rows ?? []) {
      const key = row[dateField];
      if (!key) continue;
      const day = String(key).slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(row);
      map.set(day, list);
    }
    return map;
  }, [data.data, dateField]);

  /* Monday-first, which is how an Indian hotel week is read. */
  const leading = (monthStart.getDay() + 6) % 7;
  const days = monthEnd.getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, i) => iso(new Date(cursor.year, cursor.month, i + 1))),
  ];

  const step = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const monthTotal = (data.data?.rows ?? []).reduce(
    (sum, r) => sum + (r.total_revenue ?? 0),
    0,
  );

  return (
    <Card className="mt-4">
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => step(-1)} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-base font-semibold text-ink-900 min-w-[160px] text-center">
              {MONTHS[cursor.month]} {cursor.year}
            </span>
            <Button variant="secondary" size="sm" onClick={() => step(1)} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-grey-500">
              {data.data?.total ?? 0} · {money(monthTotal)}
            </span>
            <NativeSelect
              value={dateField}
              onChange={(e) =>
                onChange({ ...query, dateField: e.target.value as RegisterQuery["dateField"] })
              }
            >
              <option value="check_in_date">By check-in</option>
              <option value="booking_date">By booking date</option>
            </NativeSelect>
          </div>
        </div>

        {data.isLoading ? (
          <Skeleton className="h-[480px] w-full" />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-px bg-grey-200 border border-grey-200 rounded-md overflow-hidden">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="bg-grey-50 px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-grey-500 text-center">
                  {d}
                </div>
              ))}

              {cells.map((day, i) => {
                if (!day) return <div key={`pad-${i}`} className="bg-grey-50 min-h-[92px]" />;
                const rows = byDay.get(day) ?? [];
                const revenue = rows.reduce((s, r) => s + (r.total_revenue ?? 0), 0);
                return (
                  <div key={day} className="bg-white min-h-[92px] p-1.5 flex flex-col">
                    <span className="text-2xs text-grey-400 mb-1">{Number(day.slice(-2))}</span>
                    {rows.length > 0 && (
                      <div className="flex-1 space-y-0.5">
                        <div className="text-sm font-semibold text-ink-900">
                          {rows.length} {rows.length === 1 ? "booking" : "bookings"}
                        </div>
                        <div className="text-2xs text-grey-500 tabular">{money(revenue)}</div>
                        {rows.slice(0, 2).map((r) => (
                          <div key={r.id} className="text-2xs text-grey-600 truncate" title={r.guest_name ?? ""}>
                            {r.guest_name ?? "—"}
                          </div>
                        ))}
                        {rows.length > 2 && (
                          <div className="text-2xs text-grey-400">+{rows.length - 2} more</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="flex items-start gap-2 text-xs text-grey-400 mt-3 leading-relaxed">
              <CalendarOff className="size-3.5 shrink-0 mt-px" />
              Showing {dateField === "check_in_date" ? "arrivals" : "bookings taken"} this
              month. The 1,657 blank spreadsheet rows never appear here — they carry no
              dates, so there is nowhere to put them.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
