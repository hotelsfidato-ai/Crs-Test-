import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip,
  XAxis, YAxis, Bar, BarChart,
} from "recharts";
import {
  ArrowRight, TrendingUp, TrendingDown, LogIn, LogOut, BedDouble,
  CheckSquare, Receipt, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession, useScope, useCurrentUser } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { reportsRepo, reservationsRepo, TODAY } from "@/data/repositories";
import { isoDate, money, moneyCompact, number, percent, delta, dateShort } from "@/lib/format";
import { summariseReservation } from "@/features/ai/responses";
import {
  Page, PageHeader, Section, Card, CardHeader, CardBody, Button,
  StatusPill, RESERVATION_TONES, Skeleton, EmptyState, ProgressBar,
} from "@/components/ui";
import { labelFor } from "@/lib/rules";

/* ══════════════════════════════════════════════════════════════════
   DASHBOARD
   Role-aware: the KPI row, the panels and the wording all change
   with who is looking. A salesperson sees their own pipeline; a
   hotel manager sees their property's day; finance sees the money.
   ══════════════════════════════════════════════════════════════════ */

export default function DashboardPage() {
  const role = useSession((s) => s.role);
  const scope = useScope();
  const user = useCurrentUser();
  const today = isoDate(TODAY);

  const kpis = useQuery({
    queryKey: ["kpis", scope.role, scope.userId],
    queryFn: () => reportsRepo.kpis(scope),
  });

  const series = useQuery({
    queryKey: ["revenue-series", scope.role, scope.userId],
    queryFn: () => reportsRepo.revenueSeries(12, scope),
  });

  const daySheet = useQuery({
    queryKey: ["day-sheet", today, scope.role, scope.userId],
    queryFn: () => reservationsRepo.daySheet(today, scope),
  });

  const approvals = useQuery({
    queryKey: ["pending-approvals", scope.role, scope.userId],
    queryFn: () => reservationsRepo.pendingApprovals(scope),
    enabled: can(role, "view", "reservation_approval"),
  });

  const recent = useQuery({
    queryKey: ["recent-reservations", scope.role, scope.userId],
    queryFn: () =>
      reservationsRepo.list({ sortBy: "createdAt", sortDir: "desc", pageSize: 6 }, scope),
  });

  const isFinance = role === "finance";
  const isHotelManager = role === "hotel_manager";
  const isSalesperson = role === "salesperson";

  const greeting = isHotelManager
    ? `${user.hotelName ?? "Your property"} today`
    : isSalesperson
      ? "Your pipeline"
      : isFinance
        ? "Financial position"
        : "Portfolio overview";

  return (
    <Page>
      <PageHeader
        title={greeting}
        description={
          <>
            {dateShort(TODAY)} · Viewing as {ROLE_LABELS[role]}
            {isSalesperson && " — showing only your accounts"}
            {isHotelManager && user.hotelName && ` — ${user.hotelName}`}
          </>
        }
        actions={
          can(role, "create", "reservation") && (
            <Button asChild variant="primary">
              <Link to="/reservations/new">New reservation</Link>
            </Button>
          )
        }
      />

      {/* ── KPI row ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
        {kpis.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : kpis.data ? (
          isFinance ? (
            <>
              <Kpi
                label="Revenue this month"
                value={moneyCompact(kpis.data.revenueThisMonth)}
                change={kpis.data.revenueChangePercent}
                highlight
              />
              <Kpi
                label="Overdue invoices"
                value={number(kpis.data.overdueInvoices)}
                hint={`${moneyCompact(kpis.data.overdueValue)} outstanding`}
                tone={kpis.data.overdueInvoices > 0 ? "danger" : undefined}
              />
              <Kpi
                label="Average booking"
                value={moneyCompact(kpis.data.averageBookingValue)}
                hint="This month"
              />
              <Kpi
                label="Awaiting approval"
                value={moneyCompact(kpis.data.pendingApprovalValue)}
                hint={`${kpis.data.pendingApprovals} reservations`}
              />
            </>
          ) : isHotelManager ? (
            <>
              <Kpi label="Arrivals today" value={number(kpis.data.arrivalsToday)} highlight />
              <Kpi label="Departures today" value={number(kpis.data.departuresToday)} />
              <Kpi label="In house" value={number(kpis.data.inHouse)} />
              <Kpi
                label="Occupancy"
                value={percent(kpis.data.occupancyPercent, 0)}
                hint="All channels, next 30 days"
              />
            </>
          ) : (
            <>
              <Kpi
                label={isSalesperson ? "Your revenue" : "Revenue this month"}
                value={moneyCompact(kpis.data.revenueThisMonth)}
                change={kpis.data.revenueChangePercent}
                highlight
              />
              <Kpi
                label="Reservations"
                value={number(kpis.data.reservationsThisMonth)}
                change={kpis.data.reservationsChangePercent}
              />
              <Kpi
                label="Awaiting approval"
                value={number(kpis.data.pendingApprovals)}
                hint={moneyCompact(kpis.data.pendingApprovalValue)}
                tone={kpis.data.pendingApprovals > 0 ? "warning" : undefined}
              />
              <Kpi
                label="Cancellation rate"
                value={percent(kpis.data.cancellationRate)}
                hint="This month"
              />
            </>
          )
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Revenue chart ── */}
        <Card className="lg:col-span-2">
          <CardHeader
            title={isSalesperson ? "Your booked revenue" : "Booked revenue"}
            description="Last twelve months, by check-in month"
            actions={
              can(role, "view", "report") && (
                <Button asChild variant="ghost" size="sm" trailingIcon={<ArrowRight className="size-3.5" />}>
                  <Link to="/reports/revenue">Report</Link>
                </Button>
              )
            }
          />
          <CardBody>
            {series.isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <div className="h-[260px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series.data ?? []}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#df6128" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#df6128" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#eef0f2" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#9aa2a9", fontSize: 11 }}
                      dy={6}
                    />
                    <YAxis
                      tickFormatter={(v) => moneyCompact(v as number)}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#9aa2a9", fontSize: 11 }}
                      width={58}
                    />
                    <RTooltip content={<ChartTooltip />} cursor={{ stroke: "#ccd0d4" }} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#df6128"
                      strokeWidth={2}
                      fill="url(#revenueFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ── Today ── */}
        <Card>
          <CardHeader title="Today" description={dateShort(TODAY)} />
          <CardBody className="space-y-1">
            {daySheet.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))
            ) : (
              <>
                <DayRow
                  icon={<LogIn className="size-4" />}
                  label="Arrivals"
                  count={daySheet.data?.arrivals.length ?? 0}
                  tone="success"
                />
                <DayRow
                  icon={<LogOut className="size-4" />}
                  label="Departures"
                  count={daySheet.data?.departures.length ?? 0}
                  tone="info"
                />
                <DayRow
                  icon={<BedDouble className="size-4" />}
                  label="In house"
                  count={daySheet.data?.inHouse.length ?? 0}
                  tone="neutral"
                />
              </>
            )}

            {(daySheet.data?.arrivals.length ?? 0) > 0 && (
              <div className="pt-3 mt-3 border-t border-grey-100">
                <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-2">
                  Arriving
                </p>
                <ul className="space-y-2">
                  {daySheet.data?.arrivals.slice(0, 4).map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/reservations/${r.id}`}
                        className="block group"
                      >
                        <p className="text-base text-ink-900 group-hover:text-brand-orange transition-colors duration-150 truncate">
                          {r.customerName}
                        </p>
                        <p className="text-sm text-grey-500 truncate">
                          {r.hotelName} · {r.totalRooms} room{r.totalRooms === 1 ? "" : "s"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Approvals ── */}
      {can(role, "approve", "reservation_approval") && (
        <Section
          className="mt-8"
          title="Waiting on you"
          description="Reservations at or above ₹50,000 need approval before they confirm"
          actions={
            <Button asChild variant="secondary" size="sm">
              <Link to="/reservations/approvals">View queue</Link>
            </Button>
          }
        >
          <Card>
            {approvals.isLoading ? (
              <CardBody className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </CardBody>
            ) : !approvals.data?.length ? (
              <EmptyState
                compact
                icon={<CheckSquare />}
                title="Approval queue is clear"
                description="Nothing is waiting on your sign-off."
              />
            ) : (
              <ul className="divide-y divide-grey-100">
                {approvals.data.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/reservations/${r.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-grey-50 transition-colors duration-150"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-medium text-ink-900 truncate">
                            {r.customerName}
                          </p>
                          <span className="text-sm text-grey-400 tabular shrink-0">
                            {r.reference}
                          </span>
                        </div>
                        <p className="text-sm text-grey-500 truncate mt-0.5">
                          {r.hotelName} · {dateShort(r.checkIn)} · {r.nights} night
                          {r.nights === 1 ? "" : "s"} · raised by {r.ownerName}
                        </p>
                      </div>
                      <p className="text-md font-semibold text-ink-900 tabular shrink-0">
                        {money(r.totalAmount)}
                      </p>
                      <ArrowRight className="size-4 text-grey-300 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-3 mt-8">
        {/* ── Recent activity ── */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent reservations"
            description={
              isSalesperson
                ? "Bookings you raised"
                : isHotelManager
                  ? `Latest bookings at ${user.hotelName ?? "your property"}`
                  : "Latest bookings across the portfolio"
            }
            actions={
              <Button asChild variant="ghost" size="sm" trailingIcon={<ArrowRight className="size-3.5" />}>
                <Link to="/reservations">All</Link>
              </Button>
            }
          />
          {recent.isLoading ? (
            <CardBody className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </CardBody>
          ) : !recent.data?.items.length ? (
            <EmptyState
              compact
              title="No reservations yet"
              description="New bookings will appear here as they are raised."
            />
          ) : (
            <ul className="divide-y divide-grey-100">
              {recent.data.items.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/reservations/${r.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-grey-50 transition-colors duration-150"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-base text-ink-900 truncate">{r.customerName}</p>
                      <p className="text-sm text-grey-500 truncate">
                        {r.hotelName} · {dateShort(r.checkIn)}
                      </p>
                    </div>
                    <StatusPill tone={RESERVATION_TONES[r.status] ?? "neutral"}>
                      {labelFor(r.status)}
                    </StatusPill>
                    <p className="text-base text-ink-900 tabular shrink-0 w-24 text-right">
                      {money(r.totalAmount)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── AI briefing ── */}
        {can(role, "view", "ai") && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Sparkles className="size-4 text-brand-orange" />
                  Daily briefing
                </span>
              }
            />
            <CardBody>
              {recent.data?.items[0] ? (
                <p className="text-base text-grey-600 leading-relaxed">
                  {summariseReservation(recent.data.items[0])}
                </p>
              ) : (
                <p className="text-base text-grey-500">Nothing to brief on yet.</p>
              )}

              {kpis.data && (
                <div className="mt-5 pt-4 border-t border-grey-100 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-grey-500">Property occupancy</span>
                      <span className="text-ink-900 tabular">
                        {percent(kpis.data.occupancyPercent, 0)}
                      </span>
                    </div>
                    <ProgressBar value={kpis.data.occupancyPercent} tone="accent" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-grey-500">Cancellation rate</span>
                      <span className="text-ink-900 tabular">
                        {percent(kpis.data.cancellationRate)}
                      </span>
                    </div>
                    <ProgressBar
                      value={kpis.data.cancellationRate}
                      tone={kpis.data.cancellationRate > 15 ? "danger" : "success"}
                    />
                  </div>
                </div>
              )}

              <Button asChild variant="secondary" size="sm" className="mt-5 w-full">
                <Link to="/ai">Ask the assistant</Link>
              </Button>
            </CardBody>
          </Card>
        )}

        {/* Finance replaces the AI card when it has money to show */}
        {!can(role, "view", "ai") && can(role, "view", "invoice") && (
          <Card>
            <CardHeader title="Receivables" />
            <CardBody>
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center size-9 rounded-full bg-brand-red-50 text-brand-red">
                  <Receipt className="size-4" />
                </span>
                <div>
                  <p className="text-lg font-semibold text-ink-900 tabular">
                    {moneyCompact(kpis.data?.overdueValue ?? 0)}
                  </p>
                  <p className="text-sm text-grey-500">
                    across {kpis.data?.overdueInvoices ?? 0} overdue invoices
                  </p>
                </div>
              </div>
              <Button asChild variant="secondary" size="sm" className="mt-5 w-full">
                <Link to="/finance/invoices?status=overdue">Review invoices</Link>
              </Button>
            </CardBody>
          </Card>
        )}
      </div>

      {/* ── Month at a glance ── */}
      <Section className="mt-8" title="Room nights by month">
        <Card>
          <CardBody>
            {series.isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="h-[200px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series.data ?? []}>
                    <CartesianGrid stroke="#eef0f2" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#9aa2a9", fontSize: 11 }}
                      dy={6}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#9aa2a9", fontSize: 11 }}
                      width={46}
                    />
                    <RTooltip content={<ChartTooltip />} cursor={{ fill: "#f7f8f9" }} />
                    <Bar dataKey="roomNights" fill="#eb8c00" radius={[3, 3, 0, 0]} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </Section>
    </Page>
  );
}

/* ── Pieces ────────────────────────────────────────────────────── */

function Kpi({
  label, value, change, hint, highlight, tone,
}: {
  label: string;
  value: string;
  change?: number;
  hint?: string;
  highlight?: boolean;
  tone?: "warning" | "danger";
}) {
  const up = (change ?? 0) >= 0;

  return (
    <Card className={cn("p-5", highlight && "relative overflow-hidden")}>
      {highlight && (
        <span className="absolute inset-x-0 top-0 h-0.5 brand-gradient" aria-hidden />
      )}
      <p className="text-2xs font-medium uppercase tracking-wide text-grey-400">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular mt-2",
          tone === "danger" ? "text-brand-red" : tone === "warning" ? "text-[#8a6300]" : "text-ink-900",
        )}
      >
        {value}
      </p>
      {change !== undefined ? (
        <p
          className={cn(
            "flex items-center gap-1 text-xs mt-1.5 tabular",
            up ? "text-success" : "text-brand-red",
          )}
        >
          {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {delta(change)} vs last month
        </p>
      ) : hint ? (
        <p className="text-xs text-grey-500 mt-1.5">{hint}</p>
      ) : null}
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-7 w-32 mt-3" />
      <Skeleton className="h-2.5 w-20 mt-3" />
    </Card>
  );
}

function DayRow({
  icon, label, count, tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "success" | "info" | "neutral";
}) {
  const tones = {
    success: "bg-success-50 text-success",
    info: "bg-info-50 text-info",
    neutral: "bg-grey-100 text-grey-500",
  };
  return (
    <div className="flex items-center gap-3 py-2">
      <span className={cn("flex items-center justify-center size-8 rounded-full shrink-0", tones[tone])}>
        {icon}
      </span>
      <span className="text-base text-grey-600 flex-1">{label}</span>
      <span className="text-lg font-semibold text-ink-900 tabular">{count}</span>
    </div>
  );
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

export function ChartTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-grey-200 rounded-md shadow-popover px-3 py-2">
      {label && <p className="text-xs font-medium text-ink-900 mb-1">{label}</p>}
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex items-center gap-2 text-xs text-grey-600">
          <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.dataKey === "revenue" || entry.dataKey === "amount"
            ? money(entry.value)
            : number(entry.value)}
        </p>
      ))}
    </div>
  );
}
