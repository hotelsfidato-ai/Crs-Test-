import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from "recharts";
import { Info, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardBody, Skeleton } from "@/components/ui";
import { money, number } from "@/lib/format";
import { fetchReport, deriveGrouped, deriveMonthly } from "./registerRepo";
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

  /* ⚠️ The same query key the totals cards use, so arriving on this tab
     fetches nothing — and, more to the point, every chart below is
     folded from ONE set of rows. Six independent scans of the same
     filtered register is six chances for them to disagree. */
  const report = useQuery({
    queryKey: ["register-report", query],
    queryFn: () => fetchReport(query),
  });
  const rows = useMemo(() => report.data?.rows ?? [], [report.data]);
  const loading = report.isLoading;

  const monthly = useMemo(() => deriveMonthly(rows, dateField), [rows, dateField]);
  const byHotel = useMemo(() => deriveGrouped(rows, "hotel_name"), [rows]);
  const byBooker = useMemo(() => deriveGrouped(rows, "booking_done_by", 15), [rows]);
  const byCompany = useMemo(() => deriveGrouped(rows, "company_or_ta"), [rows]);
  const byMealPlan = useMemo(() => deriveGrouped(rows, "meal_plan", 14), [rows]);

  /* Columns that exist in the schema but hold nothing. Named rather
     than hidden, so it is obvious the report is missing because the
     data is missing — not because somebody forgot to build it. */
  const empty = coverage.filter((c) => c.filled === 0).map((c) => c.field);

  return (
    <div className="space-y-6 mt-4">
      {/* ⚠️ Said out loud rather than absorbed. Every figure on this tab
          is folded in the browser from rows fetched over the network, so
          a scan that stopped early makes all of them describe part of
          the register while still looking like totals. */}
      {report.data?.truncated && (
        <Card className="border-brand-orange-100 bg-brand-orange-50">
          <CardBody className="flex items-start gap-3">
            <AlertTriangle className="size-4 text-brand-orange shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-ink-900">
                These reports cover part of the register
              </p>
              <p className="text-sm text-grey-700 mt-1 leading-relaxed">
                {number(rows.length)} of {number(report.data.total)} matching rows were
                read before the safety limit stopped the scan, so every figure and chart
                below is computed from those. Narrow the filters to bring the count down.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {filled.has(dateField) && filled.has("total_revenue") && (
        <Card>
          <CardHeader
            title="Revenue over time"
            description={`By ${dateField === "check_in_date" ? "check-in" : "booking"} month.`}
          />
          <CardBody>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={288}>
                <LineChart data={monthly}>
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
          data={byHotel} loading={loading}
          show={filled.has("hotel_name")}
        />
        <GroupedChart
          title="By booker"
          description="Revenue per person who took the booking."
          data={byBooker} loading={loading}
          show={filled.has("booking_done_by")}
        />
        <GroupedChart
          title="Top companies and agents"
          description="By revenue."
          data={byCompany} loading={loading}
          show={filled.has("company_or_ta")}
        />
        <GroupedChart
          title="Meal plan mix"
          description="Room nights by plan."
          data={byMealPlan} loading={loading}
          show={filled.has("meal_plan")}
          metric="roomNights"
        />
      </div>

      {(report.data?.totals.receivedSuspect ?? 0) > 0 && (
        <Card className="border-brand-orange-100 bg-brand-orange-50">
          <CardBody className="flex items-start gap-3">
            <AlertTriangle className="size-4 text-brand-orange shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-ink-900">
                “Amount received” is not reliable yet
              </p>
              <p className="text-sm text-grey-700 mt-1 leading-relaxed">
                {number(report.data!.totals.receivedSuspect)} entries hold a value larger than
                the booking itself was worth — bank and UTR reference numbers that landed
                in a money column when the spreadsheet was imported, often repeated down
                several rows. Summing the column gives a figure in the quadrillions, so
                no total is shown for it and there is no chart.
                {" "}Only {money(report.data!.totals.receivedPlausible)} across the plausible
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
  title, description, data, loading, show, metric = "revenue",
}: {
  title: string;
  description: string;
  data: { label: string; revenue: number; roomNights: number }[];
  loading: boolean;
  show: boolean;
  metric?: "revenue" | "roomNights";
}) {
  if (!show) return null;

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
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
