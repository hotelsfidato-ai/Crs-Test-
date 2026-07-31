import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { reportsRepo } from "@/data/repositories";
import { money, moneyCompact, number, percent } from "@/lib/format";
import {
  Card, CardHeader, CardBody, Skeleton, DataTable, Stat, ProgressBar, type Column,
} from "@/components/ui";
import { ReportShell } from "./ReportShell";

interface CityRow {
  city: string;
  rooms: number;
  roomNights: number;
  revenue: number;
  occupancyPercent: number;
}

export default function OccupancyReportPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["occupancy-by-city"],
    queryFn: () => reportsRepo.occupancyByCity(),
  });

  const rows = (data ?? []) as CityRow[];
  const totalRooms = rows.reduce((s, r) => s + r.rooms, 0);
  const totalNights = rows.reduce((s, r) => s + r.roomNights, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  // Weighted by room count — a 236-key city hotel should not be averaged
  // flat against a 17-key retreat.
  const averageOccupancy = totalRooms
    ? rows.reduce((s, r) => s + r.occupancyPercent * r.rooms, 0) / totalRooms
    : 0;

  const columns: Column<CityRow>[] = [
    {
      key: "city", header: "City",
      cell: (r) => <span className="font-medium text-ink-900">{r.city}</span>,
    },
    { key: "rooms", header: "Rooms", numeric: true, cell: (r) => number(r.rooms) },
    {
      key: "roomNights", header: "Fidato nights", numeric: true,
      cell: (r) => number(r.roomNights),
    },
    {
      key: "adr", header: "Avg rate", numeric: true, hideBelow: "md",
      cell: (r) => (r.roomNights ? money(Math.round(r.revenue / r.roomNights)) : "—"),
    },
    {
      key: "occupancyPercent", header: "Occupancy", numeric: true,
      cell: (r) => (
        <div className="min-w-[110px]">
          <p className="font-medium">{percent(r.occupancyPercent, 0)}</p>
          <ProgressBar
            value={r.occupancyPercent}
            tone={r.occupancyPercent > 60 ? "success" : r.occupancyPercent > 35 ? "accent" : "warning"}
            className="mt-1.5"
          />
        </div>
      ),
    },
    {
      key: "revenue", header: "Revenue", numeric: true,
      cell: (r) => <span className="font-medium">{money(r.revenue)}</span>,
    },
  ];

  const chartData = rows.slice(0, 12).map((r) => ({
    label: r.city,
    occupancy: Math.round(r.occupancyPercent),
  }));

  return (
    <ReportShell
      title="Occupancy"
      description="How full the properties are, next to what Fidato itself has booked into them. Cities with several properties are aggregated."
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Total rooms" value={number(totalRooms)} hint={`${rows.length} cities`} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Fidato room nights"
            value={number(totalNights)}
            hint="Booked through this platform"
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Property occupancy"
            value={percent(averageOccupancy, 0)}
            hint="All channels, next 30 days"
          />
        </Card>
        <Card className="p-5">
          <Stat label="Revenue" value={moneyCompact(totalRevenue)} />
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title="Occupancy by city" description="Percentage of available room nights sold" />
        <CardBody>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <div className="h-[300px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#eef0f2" vertical={false} />
                  <XAxis
                    dataKey="label" tickLine={false} axisLine={false}
                    tick={{ fill: "#9aa2a9", fontSize: 11 }} dy={6}
                    angle={-25} textAnchor="end" height={60} interval={0}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    tickLine={false} axisLine={false}
                    tick={{ fill: "#9aa2a9", fontSize: 11 }} width={40}
                  />
                  <RTooltip
                    formatter={(value) => [`${Number(value)}%`, "Occupancy"]}
                    cursor={{ fill: "#f7f8f9" }}
                    contentStyle={{
                      border: "1px solid #e2e5e8", borderRadius: 8,
                      fontSize: 12, boxShadow: "0 8px 24px -6px rgb(3 23 40 / 0.14)",
                    }}
                  />
                  <Bar dataKey="occupancy" fill="#1f6f5c" radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="By city" />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.city}
          loading={isLoading}
          className="border-0 rounded-none rounded-b-md"
          stickyHeader={false}
        />
      </Card>

      <p className="text-xs text-grey-400 mt-4">
        Occupancy is taken from each property's inventory across the next 30 days and
        covers every channel, not only Fidato. It is deliberately not derived from the
        reservations in this platform — Fidato sells a slice of each partner property, so
        reservations over total rooms would report a fraction of a percent and tell you
        nothing. &ldquo;Fidato nights&rdquo; is that slice. Phase 2 replaces the simulated
        inventory with the live PMS feed.
      </p>
    </ReportShell>
  );
}
