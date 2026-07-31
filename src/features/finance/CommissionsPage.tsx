import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Percent, Info } from "lucide-react";
import { reportsRepo } from "@/data/repositories";
import { money, moneyCompact, number, percent } from "@/lib/format";
import {
  Page, PageHeader, Card, CardHeader, DataTable, Stat, ProgressBar,
  EmptyState, Skeleton, type Column,
} from "@/components/ui";

/* Commission is what Fidato actually earns — the property keeps the
   rest. Revenue figures elsewhere are gross booking value, so this
   screen is the one that answers "what did we make?". */

interface CommissionRow {
  hotelId: string;
  hotelName: string;
  city: string;
  bookings: number;
  revenue: number;
  commissionPercent: number;
}

export default function CommissionsPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["hotel-performance"],
    queryFn: () => reportsRepo.hotelPerformance(),
  });

  const rows = ((data ?? []) as CommissionRow[])
    .map((r) => ({ ...r, commission: (r.revenue * r.commissionPercent) / 100 }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.commission - a.commission);

  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const topCommission = rows[0]?.commission ?? 1;
  const blendedRate = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0;

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "hotelName", header: "Property",
      cell: (r, i) => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center justify-center size-6 rounded-full bg-grey-100 text-2xs font-semibold text-grey-500 tabular shrink-0">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink-900 truncate">{r.hotelName}</p>
            <p className="text-sm text-grey-500">{r.city}</p>
          </div>
        </div>
      ),
    },
    { key: "bookings", header: "Bookings", numeric: true, hideBelow: "md", cell: (r) => number(r.bookings) },
    {
      key: "revenue", header: "Booking value", numeric: true,
      cell: (r) => <span className="text-grey-600">{money(r.revenue)}</span>,
    },
    {
      key: "commissionPercent", header: "Rate", numeric: true,
      cell: (r) => <span className="tabular">{r.commissionPercent}%</span>,
    },
    {
      key: "commission", header: "Commission earned", numeric: true,
      cell: (r) => (
        <div className="min-w-[120px]">
          <p className="font-medium text-ink-900">{money(Math.round(r.commission))}</p>
          <ProgressBar value={(r.commission / topCommission) * 100} className="mt-1.5" />
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Commissions"
        description="What Fidato earns on booked business. Rates are negotiated per property and set on the property record."
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Commission earned" value={moneyCompact(totalCommission)} />
        </Card>
        <Card className="p-5">
          <Stat label="On booking value" value={moneyCompact(totalRevenue)} />
        </Card>
        <Card className="p-5">
          <Stat label="Blended rate" value={percent(blendedRate)} hint="Weighted by revenue" />
        </Card>
        <Card className="p-5">
          <Stat
            label="Top earner"
            value={rows[0] ? rows[0].city : "—"}
            hint={rows[0] ? moneyCompact(rows[0].commission) : undefined}
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="By property"
          description="Ranked by commission earned, not by booking value"
        />
        {isLoading ? (
          <div className="p-5">
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.hotelId}
            onRowClick={(r) => navigate(`/hotels/${r.hotelId}`)}
            className="border-0 rounded-none rounded-b-md"
            stickyHeader={false}
            empty={
              <EmptyState
                compact
                icon={<Percent />}
                title="No commission yet"
                description="Commission accrues as bookings complete."
              />
            }
          />
        )}
      </Card>

      <p className="flex items-start gap-2 text-xs text-grey-400 mt-4">
        <Info className="size-3.5 shrink-0 mt-px" />
        Commission is calculated on gross booking value including tax, which is how the
        current property agreements are written. Cancelled bookings are excluded.
      </p>
    </Page>
  );
}
