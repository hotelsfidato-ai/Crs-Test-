import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from "recharts";
import { Info, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardBody, Skeleton } from "@/components/ui";
import { money, number } from "@/lib/format";
import { fetchGrouped, fetchMonthly, fetchTotals } from "./registerRepo";
import type { RegisterQuery, FieldCoverage } from "./types";

/* ══════════════════════════════════════════════════════════════════
   REPORTS

   ⚠️ NOT A FIXED LIST. Every chart here is gated on its source column
   holding data, read from register_field_coverage. commission_amount
   is empty on all 6,626 rows today and is filled in by hand through
   this very screen — a hardcoded chart list would show an empty
   commission chart forever, or omit it forever. Enter one commission
   figure and the chart appears, with no code change and no deploy.

   ⚠️ Aggregated over the FILTERED register, not the visible page. A
   chart of the 50 rows on screen would be quietly wrong.
   ══════════════════════════════════════════════════════════════════ */

const ORANGE = "#FE611F";
const INK = "#142B3A";

export function RegisterCharts({
  query, filled, coverage,
}: {
  query: RegisterQuery;
  filled: Set<string>;
  coverage: FieldCoverage[];
}) {
  const dateField = query.dateField ?? "check_in_date";

  const monthly = useQuery({
    queryKey: ["register-monthly", query, dateField],
    queryFn: () => fetchMonthly(query, dateField),
    enabled: filled.has(dateField) && filled.has("total_revenue"),
  });

  const byHotel = useQuery({
    queryKey: ["register-by", "hotel_name", query],
    queryFn: () => fetchGrouped("hotel_name", query),
    enabled: filled.has("hotel_name"),
  });

  const byBooker = useQuery({
    queryKey: ["register-by", "booking_done_by", query],
    queryFn: () => fetchGrouped("booking_done_by", query, 15),
    enabled: filled.has("booking_done_by"),
  });

  const byCompany = useQuery({
    queryKey: ["register-by", "company_or_ta", query],
    queryFn: () => fetchGrouped("company_or_ta", query),
    enabled: filled.has("company_or_ta"),
  });

  const byMealPlan = useQuery({
    queryKey: ["register-by", "meal_plan", query],
    queryFn: () => fetchGrouped("meal_plan", query, 14),
    enabled: filled.has("meal_plan"),
  });

  /* Columns that exist in the schema but hold nothing. Named rather
     than hidden, so it is obvious the report is missing because the
     data is missing — not because somebody forgot to build it. */
  const empty = coverage.filter((c) => c.filled === 0).map((c) => c.field);

  /* How much of `amount_received` is unusable. Surfaced rather than
     silently dropped: the register is maintained by hand, so the person
     reading this is the person who can fix it. */
  const totals = useQuery({
    queryKey: ["register-totals", query],
    queryFn: () => fetchTotals(query),
  });

  return (
    <div className="space-y-6 mt-4">
      {filled.has(dateField) && filled.has("total_revenue") && (
        <Card>
          <CardHeader
            title="Revenue over time"
            description={`By ${dateField === "check_in_date" ? "check-in" : "booking"} month.`}
          />
          <CardBody>
            {monthly.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={288}>
                <LineChart data={monthly.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e8" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 100000)}L`} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Line type="monotone" dataKey="revenue" stroke={ORANGE} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <GroupedChart
          title="Top properties"
          description="By revenue across the filtered register."
          state={byHotel}
          show={filled.has("hotel_name")}
        />
        <GroupedChart
          title="By booker"
          description="Revenue per person who took the booking."
          state={byBooker}
          show={filled.has("booking_done_by")}
        />
        <GroupedChart
          title="Top companies and agents"
          description="By revenue."
          state={byCompany}
          show={filled.has("company_or_ta")}
        />
        <GroupedChart
          title="Meal plan mix"
          description="Room nights by plan."
          state={byMealPlan}
          show={filled.has("meal_plan")}
          metric="roomNights"
        />
      </div>

      {(totals.data?.receivedSuspect ?? 0) > 0 && (
        <Card className="border-brand-orange-100 bg-brand-orange-50">
          <CardBody className="flex items-start gap-3">
            <AlertTriangle className="size-4 text-brand-orange shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-ink-900">
                “Amount received” is not reliable yet
              </p>
              <p className="text-sm text-grey-700 mt-1 leading-relaxed">
                {number(totals.data!.receivedSuspect)} entries hold a value larger than
                the booking itself was worth — bank and UTR reference numbers that landed
                in a money column when the spreadsheet was imported, often repeated down
                several rows. Summing the column gives a figure in the quadrillions, so
                no total is shown for it and there is no chart.
                {" "}Only {money(totals.data!.receivedPlausible)} across the plausible
                entries can be trusted. Correct them in the table and this disappears.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {empty.length > 0 && (
        <Card>
          <CardBody className="flex items-start gap-3">
            <Info className="size-4 text-grey-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-ink-900">
                No report yet for {empty.length === 1 ? "one column" : `${empty.length} columns`}
              </p>
              <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                <span className="font-mono text-xs">{empty.join(", ")}</span> — nothing has
                been entered in {empty.length === 1 ? "it" : "them"} yet, so there is
                nothing to chart. Fill {empty.length === 1 ? "it" : "them"} in from the
                table and the report appears here on its own.
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function GroupedChart({
  title, description, state, show, metric = "revenue",
}: {
  title: string;
  description: string;
  state: { isLoading: boolean; data?: { label: string; revenue: number; roomNights: number }[] };
  show: boolean;
  metric?: "revenue" | "roomNights";
}) {
  if (!show) return null;

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {state.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <BarChart data={state.data ?? []} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e8" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  metric === "revenue" ? `${Math.round(v / 100000)}L` : number(v)
                }
              />
              <YAxis
                type="category"
                dataKey="label"
                width={130}
                tick={{ fontSize: 11 }}
                /* Long hotel and company names would otherwise push the
                   plot area to nothing. */
                tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
              />
              <Tooltip
                formatter={(value) =>
                  metric === "revenue" ? money(Number(value)) : number(Number(value))
                }
              />
              <Bar dataKey={metric} fill={metric === "revenue" ? ORANGE : INK} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}
