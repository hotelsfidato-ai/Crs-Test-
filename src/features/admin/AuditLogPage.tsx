import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Info } from "lucide-react";
import { adminRepo } from "@/data/repositories";
import { dateTime, relative, humanise, number } from "@/lib/format";
import {
  Page, PageHeader, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, Card, Stat, Avatar, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import type { AuditLog } from "@/data/types";

const FILTER_KEYS = ["entityType", "action"];

const ACTION_TONES: Record<string, "success" | "danger" | "warning" | "accent" | "neutral"> = {
  created: "accent",
  approved: "success",
  cancelled: "danger",
  merged: "warning",
  deleted: "danger",
  updated: "neutral",
  imported: "accent",
  status_changed: "neutral",
};

/* Where an audit row points at a record you can open, the row is
   clickable — an audit trail you cannot follow is only half useful. */
const ENTITY_LINKS: Record<string, (id: string) => string> = {
  reservation: (id) => `/reservations/${id}`,
  customer: (id) => `/crm/customers/${id}`,
  company: (id) => `/crm/companies/${id}`,
  invoice: (id) => `/finance/invoices/${id}`,
  hotel: (id) => `/hotels/${id}`,
};

export default function AuditLogPage() {
  const navigate = useNavigate();
  const list = useListState({
    filterKeys: FILTER_KEYS,
    defaultSortBy: "at",
    defaultSortDir: "desc",
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["audit-log", list.query],
    queryFn: () => adminRepo.auditLog(list.query),
  });

  const stats = useQuery({ queryKey: ["audit-stats"], queryFn: () => adminRepo.auditStats() });

    

  const columns: Column<AuditLog>[] = [
    {
      key: "action", header: "Action",
      cell: (a) => (
        <StatusPill tone={ACTION_TONES[a.action] ?? "neutral"}>
          {humanise(a.action)}
        </StatusPill>
      ),
    },
    {
      key: "summary", header: "What happened",
      cell: (a) => (
        <div className="min-w-0">
          <p className="text-ink-900 truncate">{a.summary}</p>
          {a.detail && <p className="text-sm text-grey-500 truncate">{a.detail}</p>}
        </div>
      ),
    },
    {
      key: "entityLabel", header: "Record", hideBelow: "md",
      cell: (a) => (
        <div className="min-w-0">
          <p className="text-ink-900 truncate tabular">{a.entityLabel}</p>
          <p className="text-sm text-grey-500">{humanise(a.entityType)}</p>
        </div>
      ),
    },
    {
      key: "actorName", header: "By", hideBelow: "lg",
      cell: (a) => (
        <span className="flex items-center gap-2 min-w-0">
          <Avatar name={a.actorName} color="#9aa2a9" size="xs" />
          <span className="text-grey-700 truncate">{a.actorName}</span>
        </span>
      ),
    },
    {
      key: "at", header: "When", sortable: true,
      cell: (a) => (
        <div className="text-right">
          <p className="text-grey-700">{relative(a.at)}</p>
          <p className="text-sm text-grey-400 tabular">{dateTime(a.at)}</p>
        </div>
      ),
      numeric: true,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Audit log"
        description="Every change to a record, who made it and when. Entries are never edited or removed."
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Entries" value={number(stats.data?.total ?? 0)} hint="Recent window" />
        </Card>
        <Card className="p-5">
          <Stat label="Actors" value={stats.data?.actors ?? 0} hint="People and automations" />
        </Card>
        <Card className="p-5">
          <Stat label="Cancellations" value={stats.data?.cancellations ?? 0} />
        </Card>
        <Card className="p-5">
          <Stat label="Retention" value="Append-only" hint="Never edited or deleted" />
        </Card>
      </div>

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search record, person or description…"
        filters={[
          {
            key: "entityType", label: "Record type",
            options: [
              { value: "reservation", label: "Reservation" },
              { value: "customer", label: "Customer" },
              { value: "company", label: "Company" },
              { value: "invoice", label: "Invoice" },
              { value: "rate", label: "Rate plan" },
              { value: "user", label: "User" },
              { value: "hotel", label: "Property" },
            ],
          },
          {
            key: "action", label: "Action",
            options: [
              { value: "created", label: "Created" },
              { value: "updated", label: "Updated" },
              { value: "status_changed", label: "Status changed" },
              { value: "approved", label: "Approved" },
              { value: "cancelled", label: "Cancelled" },
              { value: "merged", label: "Merged" },
              { value: "imported", label: "Imported" },
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
        rowKey={(a) => a.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        onRowClick={(a) => {
          const link = ENTITY_LINKS[a.entityType];
          if (link) navigate(link(a.entityId));
        }}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            compact
            icon={<ScrollText />}
            title="Nothing logged"
            description="Changes to reservations, customers and rates are recorded here automatically."
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

      <p className="flex items-start gap-2 text-xs text-grey-400 mt-4">
        <Info className="size-3.5 shrink-0 mt-px" />
        The audit trail is append-only. Because reservations are cancelled rather than
        deleted, the history of any booking can always be reconstructed from these
        entries.
      </p>
    </Page>
  );
}
