import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis, Area, ReferenceLine,
} from "recharts";
import { TrendingUp, Info } from "lucide-react";
import { reportsRepo } from "@/data/repositories";
import { money, moneyCompact, delta } from "@/lib/format";
import { Card, CardHeader, CardBody, Skeleton, Stat, DataTable, type Column } from "@/components/ui";
import { ReportShell } from "./ReportShell";
import { ChartTooltip } from "@/features/dashboard/DashboardPage";

interface Point {
  month: string;
  label: string;
  revenue: number;
  projected: boolean;
}

export default function ForecastReportPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["forecast"],
    queryFn: () => reportsRepo.forecast(6),
  });

  const history = (data?.history ?? []) as Point[];
  const projection = (data?.projection ?? []) as Point[];

  // One continuous series, with the projected half held in a second
  // key so the chart can render it distinctly.
  const combined = [
    ...history.map((p) => ({ label: p.label, actual: p.revenue, forecast: null as number | null })),
    ...(history.length
      ? [{
          label: history[history.length - 1]!.label,
          actual: history[history.length - 1]!.revenue,
          forecast: history[history.length - 1]!.revenue,
        }]
      : []),
    ...projection.map((p) => ({ label: p.label, actual: null as number | null, forecast: p.revenue })),
  ];

  const projectedTotal = projection.reduce((s, p) => s + p.revenue, 0);

  const columns: Column<Point>[] = [
    { key: "label", header: "Month", cell: (r) => <span className="font-medium">{r.label}</span> },
    {
      key: "revenue", header: "Projected revenue", numeric: true,
      cell: (r) => money(r.revenue),
    },
  ];

  return (
    <ReportShell
      title="Forecast"
      description="A six-month projection extended from the last six months of booked revenue."
    >
      <Card className="mb-6 border-info-100 bg-info-50">
        <CardBody className="flex items-start gap-3 py-4">
          <Info className="size-4 text-info shrink-0 mt-0.5" />
          <p className="text-base text-ink-900 leading-relaxed">
            This is a straight-line projection from recent trend, not a demand model. It
            takes no account of seasonality, the events calendar or properties still
            onboarding. Treat it as a direction, not a number to plan against.
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat
            label="Avg monthly revenue"
            value={moneyCompact(data?.averageMonthlyRevenue ?? 0)}
            hint="Last 6 months"
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Trend"
            value={data ? delta(data.growthRate) : "—"}
            hint="Month on month"
          />
        </Card>
        <Card className="p-5">
          <Stat label="Next 6 months" value={moneyCompact(projectedTotal)} hint="Projected" />
        </Card>
        <Card className="p-5">
          <Stat
            label="Exit run rate"
            value={moneyCompact(projection[projection.length - 1]?.revenue ?? 0)}
            hint={projection[projection.length - 1]?.label}
          />
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Revenue and projection"
          description="Solid is booked, dashed is projected"
        />
        <CardBody>
          {isLoading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <div className="h-[320px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={combined}>
                  <defs>
                    <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#df6128" stopOpacity={0.16} />
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
                  {history.length > 0 && (
                    <ReferenceLine
                      x={history[history.length - 1]!.label}
                      stroke="#ccd0d4"
                      strokeDasharray="3 3"
                      label={{ value: "Today", fill: "#9aa2a9", fontSize: 10, position: "top" }}
                    />
                  )}
                  <Area
                    type="monotone" dataKey="actual" stroke="#df6128"
                    strokeWidth={2} fill="url(#actualFill)" connectNulls={false}
                  />
                  <Line
                    type="monotone" dataKey="forecast" stroke="#67737e"
                    strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Projected months"
          actions={<TrendingUp className="size-4 text-grey-400" />}
        />
        <DataTable
          columns={columns}
          rows={projection}
          rowKey={(r) => r.month}
          loading={isLoading}
          className="border-0 rounded-none rounded-b-md"
          stickyHeader={false}
        />
      </Card>
    </ReportShell>
  );
}
