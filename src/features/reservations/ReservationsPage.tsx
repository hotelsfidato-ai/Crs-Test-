import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, CalendarCheck, CalendarRange, Download } from "lucide-react";
import { useSession, useScope } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { reservationsRepo } from "@/data/repositories";
import { money, dateShort, number, humanise } from "@/lib/format";
import { labelFor } from "@/lib/rules";
import {
  Page, PageHeader, Button, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, RESERVATION_TONES, toast, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import type { Reservation } from "@/data/types";

const FILTER_KEYS = ["status", "channel"];

export default function ReservationsPage() {
  const role = useSession((s) => s.role);
  const scope = useScope();
  const navigate = useNavigate();
  const list = useListState({
    filterKeys: FILTER_KEYS,
    defaultSortBy: "checkIn",
    defaultSortDir: "desc",
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reservations", list.query, scope.role, scope.userId],
    queryFn: () => reservationsRepo.list(list.query, scope),
  });

  const columns: Column<Reservation>[] = [
    {
      key: "reference", header: "Reference", sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 tabular">{r.reference}</p>
          <p className="text-sm text-grey-500 truncate">{r.customerName}</p>
        </div>
      ),
    },
    {
      key: "hotelName", header: "Property", sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-ink-900 truncate">{r.hotelName}</p>
          <p className="text-sm text-grey-500">{r.hotelCity}</p>
        </div>
      ),
    },
    {
      key: "checkIn", header: "Stay", sortable: true, hideBelow: "md",
      cell: (r) => (
        <div className="tabular">
          <p className="text-ink-900">{dateShort(r.checkIn)}</p>
          <p className="text-sm text-grey-500">
            {r.nights} night{r.nights === 1 ? "" : "s"}
          </p>
        </div>
      ),
    },
    {
      key: "totalRooms", header: "Rooms", numeric: true, hideBelow: "lg",
      cell: (r) => number(r.totalRooms),
    },
    {
      key: "channel", header: "Channel", hideBelow: "xl",
      cell: (r) => (
        <StatusPill tone="neutral" dot={false}>
          {humanise(r.channel)}
        </StatusPill>
      ),
    },
    {
      key: "status", header: "Status", sortable: true,
      cell: (r) => (
        <StatusPill tone={RESERVATION_TONES[r.status] ?? "neutral"}>
          {labelFor(r.status)}
        </StatusPill>
      ),
    },
    {
      key: "ownerName", header: "Owner", hideBelow: "xl",
      cell: (r) => <span className="text-grey-600">{r.ownerName}</span>,
    },
    {
      key: "totalAmount", header: "Value", numeric: true, sortable: true,
      cell: (r) => <span className="font-medium">{money(r.totalAmount)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Reservations"
        description={
          role === "salesperson"
            ? `Bookings on your accounts — scoped to ${ROLE_LABELS[role]}`
            : role === "hotel_manager"
              ? "Bookings at your property"
              : "Every booking across the 32-property portfolio"
        }
        actions={
          <>
            <Button asChild variant="secondary" leadingIcon={<CalendarRange className="size-4" />}>
              <Link to="/reservations/calendar">Calendar</Link>
            </Button>
            {can(role, "export", "reservation") && (
              <Button
                variant="secondary"
                leadingIcon={<Download className="size-4" />}
                onClick={() =>
                  toast.success(
                    "Export queued",
                    "In Phase 2 this produces a CSV of the current view.",
                  )
                }
              >
                Export
              </Button>
            )}
            {can(role, "create", "reservation") && (
              <Button asChild variant="primary" leadingIcon={<Plus className="size-4" />}>
                <Link to="/reservations/new">New reservation</Link>
              </Button>
            )}
          </>
        }
      />

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search reference, guest or property…"
        filters={[
          {
            key: "status", label: "Status",
            options: [
              { value: "confirmed", label: "Confirmed" },
              { value: "pending_approval", label: "Pending approval" },
              { value: "checked_in", label: "Checked in" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
              { value: "no_show", label: "No show" },
              { value: "draft", label: "Draft" },
            ],
          },
          {
            key: "channel", label: "Channel",
            options: [
              { value: "direct_sales", label: "Direct sales" },
              { value: "corporate", label: "Corporate" },
              { value: "travel_agent", label: "Travel agent" },
              { value: "website", label: "Website" },
              { value: "phone", label: "Phone" },
              { value: "walk_in", label: "Walk-in" },
            ],
          },
        ]}
        values={list.filters}
        onFilterChange={list.setFilter}
        onClear={list.clear}
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        onRowClick={(r) => navigate(`/reservations/${r.id}`)}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            compact
            icon={<CalendarCheck />}
            title="No reservations yet"
            description="Bookings raised by the sales team, the website or a travel agent all land here."
            action={
              can(role, "create", "reservation") && (
                <Button asChild variant="primary" size="sm">
                  <Link to="/reservations/new">Raise the first booking</Link>
                </Button>
              )
            }
          />
        }
      />

      {data && data.total > 0 && (
        <Pagination
          className="mt-4"
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={list.setPage}
        />
      )}
    </Page>
  );
}
