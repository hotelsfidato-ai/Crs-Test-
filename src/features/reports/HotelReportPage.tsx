import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { reportsRepo } from "@/data/repositories";
import { money, moneyCompact, number, percent, humanise } from "@/lib/format";
import {
  Card, CardHeader, Skeleton, DataTable, Stat, ProgressBar,
  StatusPill, Segmented, type Column,
} from "@/components/ui";
import { ReportShell } from "./ReportShell";

interface HotelRow {
  hotelId: string;
  hotelName: string;
  city: string;
  category: string;
  totalRooms: number;
  bookings: number;
  revenue: number;
  roomNights: number;
  averageRate: number;
  occupancyPercent: number;
  cancellations: number;
  commissionPercent: number;
}

type SortKey = "revenue" | "occupancy" | "perRoom";

export default function HotelReportPage() {
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>("revenue");

  const { data, isLoading } = useQuery({
    queryKey: ["hotel-performance"],
    queryFn: () => reportsRepo.hotelPerformance(),
  });

  const base = (data ?? []) as HotelRow[];

  // Revenue alone flatters big properties, so per-room is offered
  // as the fairer comparison.
  const rows = [...base].sort((a, b) => {
    if (sort === "occupancy") return b.occupancyPercent - a.occupancyPercent;
    if (sort === "perRoom") {
      return b.revenue / Math.max(1, b.totalRooms) - a.revenue / Math.max(1, a.totalRooms);
    }
    return b.revenue - a.revenue;
  });

  const totalRevenue = base.reduce((s, r) => s + r.revenue, 0);
  const totalRooms = base.reduce((s, r) => s + r.totalRooms, 0);
  const topRevenue = rows[0]?.revenue ?? 1;
  const best = [...base].sort((a, b) => b.revenue - a.revenue)[0];

  const columns: Column<HotelRow>[] = [
    {
      key: "hotelName", header: "Property",
      cell: (r, i) => (
        <div className="flex items-center gap-3">
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
    {
      key: "category", header: "Type", hideBelow: "lg",
      cell: (r) => (
        <StatusPill tone="neutral" dot={false}>
          {humanise(r.category)}
        </StatusPill>
      ),
    },
    { key: "totalRooms", header: "Rooms", numeric: true, hideBelow: "md", cell: (r) => number(r.totalRooms) },
    { key: "bookings", header: "Bookings", numeric: true, cell: (r) => number(r.bookings) },
    {
      key: "averageRate", header: "Avg rate", numeric: true, hideBelow: "md",
      cell: (r) => (r.averageRate ? money(Math.round(r.averageRate)) : "—"),
    },
    {
      key: "perRoom", header: "Per room", numeric: true, hideBelow: "xl",
      cell: (r) => moneyCompact(r.revenue / Math.max(1, r.totalRooms)),
    },
    {
      key: "occupancyPercent", header: "Occupancy", numeric: true, hideBelow: "lg",
      cell: (r) => percent(r.occupancyPercent, 0),
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

  return (
    <ReportShell
      title="Property performance"
      description="All 32 partner properties. Revenue rewards scale, so per-room is the honest comparison between a 17-key retreat and a 236-key city hotel."
      filters={
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: "revenue", label: "By revenue" },
            { value: "perRoom", label: "By revenue per room" },
            { value: "occupancy", label: "By occupancy" },
          ]}
        />
      }
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Properties" value={number(base.length)} hint={`${number(totalRooms)} rooms`} />
        </Card>
        <Card className="p-5">
          <Stat label="Portfolio revenue" value={moneyCompact(totalRevenue)} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Revenue per room"
            value={totalRooms ? moneyCompact(totalRevenue / totalRooms) : "—"}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Top property"
            value={best ? best.city : "—"}
            hint={best ? best.hotelName : undefined}
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="All properties"
          description={
            sort === "perRoom"
              ? "Ranked by revenue per available room"
              : sort === "occupancy"
                ? "Ranked by occupancy"
                : "Ranked by total booked revenue"
          }
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
          />
        )}
      </Card>

      <p className="text-xs text-grey-400 mt-4">
        Select any row to open the property. Commission rates vary by property and are
        shown on the property record.
      </p>
    </ReportShell>
  );
}
