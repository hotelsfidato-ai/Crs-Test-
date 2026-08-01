import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { automationRepo } from "@/data/repositories";
import { number, dateTime, relative, humanise } from "@/lib/format";
import {
  Page, PageHeader, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, Card, Stat, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import type { AutomationEvent, AutomationEventStatus } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   THE AUTOMATION QUEUE

   Phase 1 showed n8n *runs*, invented. Phase 2 shows the real thing:
   the events this application writes and does not process.

   ⚠️ The distinction matters operationally. A row sitting at "pending"
   means the app did its job and n8n has not collected it yet — that is
   an n8n problem, not a Fidato one, and the screen has to make that
   readable at a glance or every stall gets escalated to the wrong team.
   ══════════════════════════════════════════════════════════════════ */

const FILTER_KEYS = ["status", "type"];

const EVENT_TONES: Record<AutomationEventStatus, "success" | "danger" | "info" | "warning"> = {
  done: "success",
  failed: "danger",
  processing: "info",
  pending: "warning",
};

export default function RunsPage() {
  const navigate = useNavigate();
  const list = useListState({
    filterKeys: FILTER_KEYS,
    /* ⚠️ createdAt, not startedAt. A queue event has no startedAt —
       that field belonged to the old n8n *run* records. Firestore
       excludes documents missing the orderBy field, so sorting by it
       returned nothing at all and the queue silently looked empty
       rather than erroring. */
    defaultSortBy: "createdAt",
    defaultSortDir: "desc",
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["automation-queue", list.query],
    queryFn: () => automationRepo.queue(list.query),
  });

  const stats = useQuery({
    queryKey: ["automation-stats"],
    queryFn: () => automationRepo.queueStats(),
  });



  const columns: Column<AutomationEvent>[] = [
    {
      key: "status", header: "State", sortable: true,
      cell: (e) => (
        <StatusPill tone={EVENT_TONES[e.status] ?? "neutral"}>{humanise(e.status)}</StatusPill>
      ),
    },
    {
      key: "type", header: "Event", sortable: true,
      cell: (e) => <span className="font-medium text-ink-900">{humanise(e.type)}</span>,
    },
    {
      key: "entityLabel", header: "Record",
      cell: (e) => (
        <div className="min-w-0">
          <p className="text-ink-900 truncate">{e.entityLabel}</p>
          <p className="text-sm text-grey-500">{humanise(e.entityType)}</p>
        </div>
      ),
    },
    {
      key: "createdAt", header: "Queued", sortable: true, hideBelow: "md",
      cell: (e) => <span className="tabular text-grey-600">{dateTime(e.createdAt)}</span>,
    },
    {
      key: "processedAt", header: "Collected", sortable: true, hideBelow: "lg",
      cell: (e) =>
        e.processedAt ? (
          <span className="tabular text-grey-600">{relative(e.processedAt)}</span>
        ) : (
          <span className="text-sm text-grey-400">Waiting for n8n</span>
        ),
    },
    {
      key: "attempts", header: "Tries", numeric: true, hideBelow: "xl",
      cell: (e) => <span className="tabular text-grey-600">{e.attempts}</span>,
    },
    {
      key: "lastError", header: "Detail",
      cell: (e) =>
        e.lastError ? (
          <span className="text-sm text-brand-red">{e.lastError}</span>
        ) : (
          <span className="text-sm text-grey-400">—</span>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Automation", to: "/automation" }, { label: "Event queue" }]}
        title="Event queue"
        description="Every business event this platform has published, newest first. Fidato writes them; n8n collects and acts on them."
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Events" value={number(stats.data?.total ?? 0)} />
        </Card>
        <Card className="p-5">
          <Stat label="Processed" value={number(stats.data?.done ?? 0)} />
        </Card>
        <Card className="p-5">
          <Stat label="Pending" value={stats.data?.pending ?? 0} hint="Awaiting n8n" />
        </Card>
        <Card className="p-5">
          <Stat label="Failed" value={stats.data?.failed ?? 0} />
        </Card>
      </div>

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search event or record…"
        filters={[
          {
            key: "status", label: "State",
            options: (["pending", "processing", "done", "failed"] as AutomationEventStatus[]).map(
              (s) => ({ value: s, label: humanise(s) }),
            ),
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
        onRowClick={(e) => navigate(entityLink(e))}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            compact
            icon={<History />}
            title="No events queued"
            description="Events appear here the moment a reservation, invoice or customer is created. An empty queue on a busy day means writes are not reaching Firestore."
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

/** Takes you to the record the event is about, not to a run log. */
function entityLink(event: AutomationEvent): string {
  switch (event.entityType) {
    case "reservation": return `/reservations/${event.entityId}`;
    case "invoice": return `/invoices/${event.entityId}`;
    case "customer": return `/crm/customers/${event.entityId}`;
    case "company": return `/crm/companies/${event.entityId}`;
    case "hotel": return `/hotels/${event.entityId}`;
    default: return "/automation/runs";
  }
}
