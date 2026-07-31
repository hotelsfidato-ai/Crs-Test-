import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { automationRepo, db } from "@/data/repositories";
import { number, percent, dateTime, humanise } from "@/lib/format";
import {
  Page, PageHeader, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, Card, Stat, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import type { AutomationRun } from "@/data/types";

const FILTER_KEYS = ["status", "trigger"];

const RUN_TONES = {
  success: "success",
  failed: "danger",
  running: "info",
} as const;

export default function RunsPage() {
  const navigate = useNavigate();
  const list = useListState({
    filterKeys: FILTER_KEYS,
    defaultSortBy: "startedAt",
    defaultSortDir: "desc",
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["automation-runs", list.query],
    queryFn: () => automationRepo.runs(list.query),
  });

  const all = db.automationRuns;
  const failed = all.filter((r) => r.status === "failed");
  const successRate = all.length ? ((all.length - failed.length) / all.length) * 100 : 100;
  const avgDuration = all.length
    ? all.reduce((s, r) => s + r.durationMs, 0) / all.length / 1000
    : 0;

  const columns: Column<AutomationRun>[] = [
    {
      key: "status", header: "Result", sortable: true,
      cell: (r) => (
        <StatusPill tone={RUN_TONES[r.status] ?? "neutral"}>{humanise(r.status)}</StatusPill>
      ),
    },
    {
      key: "workflowName", header: "Workflow", sortable: true,
      cell: (r) => <span className="font-medium text-ink-900">{r.workflowName}</span>,
    },
    {
      key: "entityLabel", header: "Record",
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-ink-900 truncate">{r.entityLabel}</p>
          <p className="text-sm text-grey-500">{humanise(r.trigger)}</p>
        </div>
      ),
    },
    {
      key: "startedAt", header: "Started", sortable: true, hideBelow: "md",
      cell: (r) => <span className="tabular text-grey-600">{dateTime(r.startedAt)}</span>,
    },
    {
      key: "durationMs", header: "Duration", numeric: true, sortable: true, hideBelow: "lg",
      cell: (r) => <span className="tabular">{(r.durationMs / 1000).toFixed(1)}s</span>,
    },
    {
      key: "steps", header: "Steps", numeric: true, hideBelow: "xl",
      cell: (r) => (
        <span className="tabular text-grey-600">
          {r.stepsCompleted}/{r.stepsTotal}
        </span>
      ),
    },
    {
      key: "error", header: "Detail",
      cell: (r) =>
        r.error ? (
          <span className="text-sm text-brand-red">{r.error}</span>
        ) : (
          <span className="text-sm text-grey-400">Completed</span>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Automation", to: "/automation" }, { label: "Run history" }]}
        title="Run history"
        description="Every automation execution, newest first. Failures show the reason and how far the workflow got."
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Runs" value={number(all.length)} />
        </Card>
        <Card className="p-5">
          <Stat label="Success rate" value={percent(successRate)} />
        </Card>
        <Card className="p-5">
          <Stat label="Failures" value={failed.length} />
        </Card>
        <Card className="p-5">
          <Stat label="Average duration" value={`${avgDuration.toFixed(1)}s`} />
        </Card>
      </div>

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search workflow or record…"
        filters={[
          {
            key: "status", label: "Result",
            options: [
              { value: "success", label: "Success" },
              { value: "failed", label: "Failed" },
              { value: "running", label: "Running" },
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
        onRowClick={(r) => navigate(`/automation/${r.workflowId}`)}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            compact
            icon={<History />}
            title="No runs recorded"
            description="Automation runs will appear here once workflows start firing."
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
