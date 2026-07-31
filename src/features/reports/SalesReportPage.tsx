import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { reportsRepo } from "@/data/repositories";
import { money, moneyCompact, number, percent, truncate } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import {
  Card, CardHeader, CardBody, Skeleton, DataTable, Stat, StatusPill,
  ProgressBar, type Column,
} from "@/components/ui";
import { ReportShell } from "./ReportShell";
import { ChartTooltip } from "@/features/dashboard/DashboardPage";

interface SalesRow {
  userId: string;
  name: string;
  role: Role;
  bookings: number;
  revenue: number;
  averageBookingValue: number;
  cancellations: number;
  conversionPercent: number;
  accounts: number;
}

export default function SalesReportPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["sales-performance"],
    queryFn: () => reportsRepo.salesPerformance(),
  });

  const rows = (data ?? []) as SalesRow[];
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalBookings = rows.reduce((s, r) => s + r.bookings, 0);
  const best = rows[0];
  const topRevenue = best?.revenue ?? 1;

  const columns: Column<SalesRow>[] = [
    {
      key: "name", header: "Salesperson",
      cell: (r, i) => (
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center size-6 rounded-full bg-grey-100 text-2xs font-semibold text-grey-500 tabular shrink-0">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink-900 truncate">{r.name}</p>
            <p className="text-sm text-grey-500">{ROLE_LABELS[r.role]}</p>
          </div>
        </div>
      ),
    },
    { key: "accounts", header: "Accounts", numeric: true, hideBelow: "lg", cell: (r) => number(r.accounts) },
    { key: "bookings", header: "Bookings", numeric: true, cell: (r) => number(r.bookings) },
    {
      key: "averageBookingValue", header: "Avg value", numeric: true, hideBelow: "md",
      cell: (r) => money(Math.round(r.averageBookingValue)),
    },
    {
      key: "cancellations", header: "Cancelled", numeric: true, hideBelow: "lg",
      cell: (r) =>
        r.cancellations > 0 ? (
          <StatusPill tone={r.cancellations > 8 ? "danger" : "neutral"} dot={false}>
            {r.cancellations}
          </StatusPill>
        ) : (
          <span className="text-grey-400">—</span>
        ),
    },
    {
      key: "conversionPercent", header: "Conversion", numeric: true, hideBelow: "xl",
      cell: (r) => percent(r.conversionPercent, 0),
    },
    {
      key: "revenue", header: "Revenue", numeric: true,
      cell: (r) => (
        <div className="min-w-[110px]">
          <p className="font-medium text-ink-900">{money(r.revenue)}</p>
          <ProgressBar value={(r.revenue / topRevenue) * 100} className="mt-1.5" />
        </div>
      ),
    },
  ];

  const chartData = rows.slice(0, 8).map((r) => ({
    label: truncate(r.name.split(" ")[0] ?? r.name, 10),
    revenue: r.revenue,
  }));

  return (
    <ReportShell
      title="Sales performance"
      description="Every salesperson and sales manager, ranked by booked revenue. Conversion is live bookings as a share of everything they raised."
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Team revenue" value={moneyCompact(totalRevenue)} />
        </Card>
        <Card className="p-5">
          <Stat label="Bookings" value={number(totalBookings)} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Top performer"
            value={best ? (best.name.split(" ")[0] ?? best.name) : "—"}
            hint={best ? moneyCompact(best.revenue) : undefined}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Avg per head"
            value={rows.length ? moneyCompact(totalRevenue / rows.length) : "—"}
          />
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title="Revenue by salesperson" description="Top eight" />
        <CardBody>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <div className="h-[280px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#eef0f2" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9aa2a9", fontSize: 11 }} dy={6} />
                  <YAxis
                    tickFormatter={(v) => moneyCompact(v as number)}
                    tickLine={false} axisLine={false}
                    tick={{ fill: "#9aa2a9", fontSize: 11 }} width={62}
                  />
                  <RTooltip content={<ChartTooltip />} cursor={{ fill: "#f7f8f9" }} />
                  <Bar dataKey="revenue" fill="#df6128" radius={[3, 3, 0, 0]} maxBarSize={46} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Leaderboard"
          description="Ranked by booked revenue, excluding cancellations"
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.userId}
          loading={isLoading}
          className="border-0 rounded-none rounded-b-md"
          stickyHeader={false}
        />
      </Card>

      <p className="text-xs text-grey-400 mt-4">
        Ownership follows the account, so a booking counts towards whoever owns the
        customer's company. See{" "}
        <Link to="/admin/roles" className="text-brand-orange hover:underline">
          Roles &amp; permissions
        </Link>{" "}
        for how scoping is applied.
      </p>
    </ReportShell>
  );
}
