import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Legend,
} from "recharts";
import { useScope } from "@/lib/session";
import { reportsRepo } from "@/data/repositories";
import { money, moneyCompact, number, percent, humanise } from "@/lib/format";
import {
  Card, CardHeader, CardBody, Skeleton, DataTable, Stat, type Column,
} from "@/components/ui";
import { ReportShell } from "./ReportShell";
import { ChartTooltip } from "@/features/dashboard/DashboardPage";

const CHANNEL_COLORS = ["#df6128", "#eb8c00", "#ffb600", "#1f6f5c", "#2b6cb0", "#db536a"];

interface MonthRow {
  month: string;
  label: string;
  revenue: number;
  bookings: number;
  roomNights: number;
}

export default function RevenueReportPage() {
  const scope = useScope();

  const series = useQuery({
    queryKey: ["revenue-series-full", scope.role, scope.userId],
    queryFn: () => reportsRepo.revenueSeries(12, scope),
  });

  const channels = useQuery({
    queryKey: ["channel-mix"],
    queryFn: () => reportsRepo.channelMix(),
  });

  const rows = series.data ?? [];
  const totalRevenue = rows.reduce((s, m) => s + m.revenue, 0);
  const totalBookings = rows.reduce((s, m) => s + m.bookings, 0);
  const totalNights = rows.reduce((s, m) => s + m.roomNights, 0);
  const best = [...rows].sort((a, b) => b.revenue - a.revenue)[0];

  const columns: Column<MonthRow>[] = [
    { key: "label", header: "Month", cell: (r) => <span className="font-medium">{r.label}</span> },
    { key: "bookings", header: "Bookings", numeric: true, cell: (r) => number(r.bookings) },
    { key: "roomNights", header: "Room nights", numeric: true, cell: (r) => number(r.roomNights) },
    {
      key: "adr", header: "Avg rate", numeric: true, hideBelow: "md",
      cell: (r) => (r.roomNights ? money(Math.round(r.revenue / r.roomNights)) : "—"),
    },
    {
      key: "revenue", header: "Revenue", numeric: true,
      cell: (r) => <span className="font-medium">{money(r.revenue)}</span>,
    },
  ];

  return (
    <ReportShell
      title="Revenue"
      description="Booked revenue by check-in month across the last twelve months, with the channel mix behind it."
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Total revenue" value={moneyCompact(totalRevenue)} hint="Last 12 months" />
        </Card>
        <Card className="p-5">
          <Stat label="Bookings" value={number(totalBookings)} hint="Excluding cancellations" />
        </Card>
        <Card className="p-5">
          <Stat label="Room nights" value={number(totalNights)} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Best month"
            value={best?.label ?? "—"}
            hint={best ? moneyCompact(best.revenue) : undefined}
          />
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title="Revenue trend" description="Booked revenue by check-in month" />
        <CardBody>
          {series.isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <div className="h-[300px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rows}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#df6128" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#df6128" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef0f2" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9aa2a9", fontSize: 11 }} dy={6} />
                  <YAxis
                    tickFormatter={(v) => moneyCompact(v as number)}
                    tickLine={false} axisLine={false}
                    tick={{ fill: "#9aa2a9", fontSize: 11 }} width={62}
                  />
                  <RTooltip content={<ChartTooltip />} cursor={{ stroke: "#ccd0d4" }} />
                  <Area type="monotone" dataKey="revenue" stroke="#df6128" strokeWidth={2} fill="url(#revFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader title="Bookings by month" />
          <CardBody>
            {series.isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <div className="h-[260px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows}>
                    <CartesianGrid stroke="#eef0f2" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9aa2a9", fontSize: 11 }} dy={6} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#9aa2a9", fontSize: 11 }} width={40} />
                    <RTooltip content={<ChartTooltip />} cursor={{ fill: "#f7f8f9" }} />
                    <Bar dataKey="bookings" fill="#eb8c00" radius={[3, 3, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Channel mix" description="Share of booked revenue by source" />
          <CardBody>
            {channels.isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channels.data ?? []}
                      dataKey="revenue"
                      nameKey="channel"
                      innerRadius={54}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {(channels.data ?? []).map((_, i) => (
                        <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                      ))}
                    </Pie>
                    <RTooltip
                      formatter={(value, name) => [money(Number(value)), humanise(String(name))]}
                      contentStyle={{
                        border: "1px solid #e2e5e8", borderRadius: 8,
                        fontSize: 12, boxShadow: "0 8px 24px -6px rgb(3 23 40 / 0.14)",
                      }}
                    />
                    <Legend
                      formatter={(value: string) => (
                        <span style={{ color: "#67737e", fontSize: 12 }}>{humanise(value)}</span>
                      )}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Month by month" />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.month}
          loading={series.isLoading}
          className="border-0 rounded-none rounded-b-md"
          stickyHeader={false}
        />
        {rows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-grey-200 bg-grey-50 rounded-b-md">
            <span className="text-sm font-medium text-grey-600">Total</span>
            <div className="flex items-center gap-8 text-sm tabular">
              <span className="text-grey-600">{number(totalBookings)} bookings</span>
              <span className="text-grey-600">{number(totalNights)} nights</span>
              <span className="font-semibold text-ink-900">{money(totalRevenue)}</span>
            </div>
          </div>
        )}
      </Card>

      <p className="text-xs text-grey-400 mt-4">
        Revenue is attributed to the month of check-in and excludes cancelled and draft
        reservations. Figures include tax. Occupancy is quoted at {percent(0)} where a
        property has no inventory loaded.
      </p>
    </ReportShell>
  );
}
