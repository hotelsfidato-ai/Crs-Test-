import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Mail, MessageSquare, FileText, Bell, Database, Clock, GitBranch,
} from "lucide-react";
import { useSession, useActor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { automationRepo } from "@/data/repositories";
import { number, percent, relative, dateTime, humanise } from "@/lib/format";
import {
  Page, PageHeader, Card, CardHeader, CardBody, Switch, StatusPill,
  Skeleton, Stat, EmptyState, Tabs, TabsList, TabsTrigger, TabsContent,
  DataTable, Tooltip, toast, type Column,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import type { AutomationRun } from "@/data/types";

const STEP_ICONS: Record<string, typeof Mail> = {
  send_email: Mail,
  send_whatsapp: MessageSquare,
  generate_pdf: FileText,
  notify_user: Bell,
  update_record: Database,
  webhook: Zap,
  wait: Clock,
  condition: GitBranch,
};

const RUN_TONES = {
  success: "success",
  failed: "danger",
  running: "info",
} as const;

export default function WorkflowDetailPage() {
  const { id = "" } = useParams();
  const role = useSession((s) => s.role);
  const actor = useActor();
  const queryClient = useQueryClient();

  const workflow = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => automationRepo.workflow(id),
  });

  const runs = useQuery({
    queryKey: ["workflow-runs", id],
    queryFn: () => automationRepo.runsForWorkflow(id),
  });

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      automationRepo.setStatus(id, next ? "active" : "paused", actor),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["workflow", id] });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success(
        updated.status === "active" ? "Workflow resumed" : "Workflow paused",
        updated.name,
      );
    },
  });

  if (workflow.isLoading) return <DetailSkeleton />;
  if (!workflow.data) return <NotFound />;

  const w = workflow.data;
  const rows = runs.data ?? [];
  const failures = Math.round((w.runsLast30Days * (100 - w.successRate)) / 100);

  const runColumns: Column<AutomationRun>[] = [
    {
      key: "status", header: "Result",
      cell: (r) => (
        <StatusPill tone={RUN_TONES[r.status] ?? "neutral"}>{humanise(r.status)}</StatusPill>
      ),
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
      key: "startedAt", header: "Started", hideBelow: "md",
      cell: (r) => <span className="tabular text-grey-600">{dateTime(r.startedAt)}</span>,
    },
    {
      key: "durationMs", header: "Duration", numeric: true, hideBelow: "lg",
      cell: (r) => <span className="tabular">{(r.durationMs / 1000).toFixed(1)}s</span>,
    },
    {
      key: "error", header: "Detail",
      cell: (r) =>
        r.error ? (
          <span className="text-sm text-brand-red">{r.error}</span>
        ) : (
          <span className="text-sm text-grey-400">
            {r.stepsCompleted} of {r.stepsTotal} steps
          </span>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Automation", to: "/automation" }, { label: w.name }]}
        title={w.name}
        description={w.description}
        badge={
          <StatusPill tone={w.status === "active" ? "success" : "neutral"}>
            {humanise(w.status)}
          </StatusPill>
        }
        actions={
          can(role, "edit", "automation") && (
            <div className="flex items-center gap-2.5">
              <span className="text-sm text-grey-600">
                {w.status === "active" ? "Active" : "Paused"}
              </span>
              <Switch
                checked={w.status === "active"}
                onCheckedChange={(next) => toggle.mutate(next)}
                aria-label={`${w.status === "active" ? "Pause" : "Resume"} workflow`}
              />
            </div>
          )
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Runs" value={number(w.runsLast30Days)} hint="Last 30 days" />
        </Card>
        <Card className="p-5">
          <Stat label="Success rate" value={percent(w.successRate)} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Average duration"
            value={`${(w.averageDurationMs / 1000).toFixed(1)}s`}
            hint={`~${failures} failures`}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Last run"
            value={w.lastRunAt ? relative(w.lastRunAt) : "Never"}
            hint={w.lastRunAt ? dateTime(w.lastRunAt) : undefined}
          />
        </Card>
      </div>

      <Tabs defaultValue="definition">
        <TabsList>
          <TabsTrigger value="definition">Definition</TabsTrigger>
          <TabsTrigger value="runs" count={rows.length}>
            Runs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="definition">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {/* ── Trigger ── */}
              <Card>
                <CardHeader title="Trigger" description="What starts this workflow" />
                <CardBody className="pt-0">
                  <div className="flex items-center gap-3 p-3.5 rounded-md bg-brand-orange-50 border border-brand-orange-100">
                    <span className="flex items-center justify-center size-8 rounded-md bg-brand-orange text-white shrink-0">
                      <Zap className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">{humanise(w.trigger)}</p>
                      <p className="text-sm text-grey-600 mt-0.5">{w.triggerDetail}</p>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* ── Conditions ── */}
              {w.conditions.length > 0 && (
                <Card>
                  <CardHeader
                    title="Conditions"
                    description="All must hold for the actions to run"
                  />
                  <CardBody className="pt-0">
                    <ul className="space-y-2">
                      {w.conditions.map((condition, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2.5 p-3 rounded-md bg-grey-50 border border-grey-200"
                        >
                          <GitBranch className="size-4 text-grey-400 shrink-0 mt-0.5" />
                          <span className="text-base text-ink-900">{condition}</span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              )}

              {/* ── Steps ── */}
              <Card>
                <CardHeader title="Steps" description={`${w.steps.length} steps, in order`} />
                <CardBody className="pt-0">
                  <ol className="relative">
                    {w.steps.map((step, i) => {
                      const Icon = STEP_ICONS[step.kind] ?? Zap;
                      return (
                        <li key={step.id} className="flex gap-3.5 pb-4 last:pb-0">
                          <div className="flex flex-col items-center shrink-0">
                            <span className="flex items-center justify-center size-8 rounded-md bg-grey-100 text-grey-600 ring-4 ring-white">
                              <Icon className="size-4" />
                            </span>
                            {i < w.steps.length - 1 && (
                              <span className="w-px flex-1 bg-grey-200 mt-1" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 pt-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-2xs text-grey-400 tabular">
                                {String(step.order).padStart(2, "0")}
                              </span>
                              <p className="text-base font-medium text-ink-900">
                                {step.label}
                              </p>
                              {step.n8nNode && (
                                <Tooltip content="The n8n node this maps to in Phase 3">
                                  <StatusPill tone="neutral" dot={false}>
                                    {step.n8nNode}
                                  </StatusPill>
                                </Tooltip>
                              )}
                            </div>
                            <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                              {step.detail}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </CardBody>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader title="Execution" />
                <CardBody className="pt-0 space-y-3">
                  <Row label="Status" value={humanise(w.status)} />
                  <Row label="Runs (30d)" value={number(w.runsLast30Days)} />
                  <Row label="Success rate" value={percent(w.successRate)} />
                  <Row
                    label="Average duration"
                    value={`${(w.averageDurationMs / 1000).toFixed(1)}s`}
                  />
                  <Row
                    label="Last run"
                    value={w.lastRunAt ? dateTime(w.lastRunAt) : "Never"}
                  />
                </CardBody>
              </Card>

              <Card className="bg-grey-50">
                <CardBody>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-2">
                    Phase 3
                  </p>
                  <p className="text-sm text-grey-600 leading-relaxed">
                    This definition becomes the contract for the n8n workflow. The
                    platform will POST the trigger payload to a webhook; n8n runs the
                    steps and posts results back to the run log.
                  </p>
                  <p className="text-2xs text-grey-400 mt-3 font-mono break-all">
                    POST /webhook/{w.trigger.replace(/_/g, "-")}
                  </p>
                </CardBody>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="runs">
          <DataTable
            columns={runColumns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={runs.isLoading}
            stickyHeader={false}
            empty={
              <EmptyState
                compact
                icon={<Clock />}
                title="No runs yet"
                description="This workflow has not fired."
              />
            }
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm text-grey-500 shrink-0">{label}</span>
      <span className="text-base text-ink-900 text-right">{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="h-3 w-48 mb-3" />
      <Skeleton className="h-8 w-72 mb-2" />
      <Skeleton className="h-3.5 w-96 mb-8" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </Page>
  );
}
