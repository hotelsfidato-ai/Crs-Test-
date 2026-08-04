import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Workflow, History, Zap, Mail, MessageSquare, FileText, Bell,
  Database, ArrowRight, Clock, GitBranch,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession, useActor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { automationRepo } from "@/data/repositories";
import { number, percent, relative, humanise } from "@/lib/format";
import {
  Page, PageHeader, Card, CardBody, Button, Switch, StatusPill,
  Skeleton, Stat, EmptyState, toast, Tooltip,
describeError,
} from "@/components/ui";
import type { AutomationWorkflow } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   AUTOMATION
   In Phase 1 these are descriptions of intent with simulated run
   history. Phase 3 replaces each workflow body with an n8n webhook —
   the trigger, conditions and step list defined here become the
   contract that n8n implements.
   ══════════════════════════════════════════════════════════════════ */

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

export default function WorkflowsPage() {
  const role = useSession((s) => s.role);

  const { data, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => automationRepo.workflows(),
  });

  const workflows = data ?? [];
  const active = workflows.filter((w) => w.status === "active");
  const totalRuns = workflows.reduce((s, w) => s + w.runsLast30Days, 0);
  // Weight each workflow's success rate by how often it actually ran.
  const successRate = totalRuns
    ? workflows.reduce((s, w) => s + w.successRate * w.runsLast30Days, 0) / totalRuns
    : 100;
  const totalFailures = Math.round((totalRuns * (100 - successRate)) / 100);

  return (
    <Page>
      <PageHeader
        title="Automation"
        description="What the platform does on its own when something happens. Each workflow is a trigger, some conditions and an ordered list of actions."
        actions={
          <Button asChild variant="secondary" leadingIcon={<History className="size-4" />}>
            <Link to="/automation/runs">Run history</Link>
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat
            label="Workflows"
            value={workflows.length}
            hint={`${active.length} active`}
          />
        </Card>
        <Card className="p-5">
          <Stat label="Runs" value={number(totalRuns)} hint="Last 30 days" />
        </Card>
        <Card className="p-5">
          <Stat
            label="Success rate"
            value={percent(successRate)}
            hint={`~${totalFailures} failures`}
          />
        </Card>
        <Card className="p-5">
          <Stat label="Paused" value={workflows.filter((w) => w.status === "paused").length} />
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Workflow />}
            title="No workflows configured"
            description="Automation workflows fire on platform events — a reservation confirmed, an invoice overdue, a guest checked out."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {workflows.map((w) => (
            <WorkflowCard key={w.id} workflow={w} canEdit={can(role, "edit", "automation")} />
          ))}
        </div>
      )}

      <Card className="mt-6 bg-grey-50">
        <CardBody className="flex items-start gap-3">
          <Zap className="size-4 text-grey-400 shrink-0 mt-0.5" />
          <p className="text-sm text-grey-600 leading-relaxed">
            These workflows do not execute in Phase 1 — the run history is simulated. In
            Phase 3 each one becomes an n8n workflow triggered by a webhook from the
            platform, and this screen becomes the control surface for enabling, pausing
            and inspecting them.
          </p>
        </CardBody>
      </Card>
    </Page>
  );
}

function WorkflowCard({
  workflow: w, canEdit,
}: {
  workflow: AutomationWorkflow;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const actor = useActor();
  const queryClient = useQueryClient();

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      automationRepo.setStatus(w.id, next ? "active" : "paused", actor),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["workflow", w.id] });
      toast.success(
        updated.status === "active" ? "Workflow resumed" : "Workflow paused",
        updated.name,
      );
    },
    onError: (error) => {
      const detail = describeError(error);
      toast.error(detail.title ?? "Could not update", detail.message ?? "Nothing was changed.");
    },
  });


  return (
    <Card className="flex flex-col">
      <CardBody className="flex-1">
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate(`/automation/${w.id}`)}
            className="text-left min-w-0 group"
          >
            <h2 className="font-semibold text-ink-900 group-hover:text-brand-orange transition-colors duration-150">
              {w.name}
            </h2>
            <p className="text-sm text-grey-600 mt-1 leading-relaxed">{w.description}</p>
          </button>

          {canEdit ? (
            <Switch
              checked={w.status === "active"}
              onCheckedChange={(next) => toggle.mutate(next)}
              aria-label={`${w.status === "active" ? "Pause" : "Resume"} ${w.name}`}
            />
          ) : (
            <StatusPill tone={w.status === "active" ? "success" : "neutral"}>
              {humanise(w.status)}
            </StatusPill>
          )}
        </div>

        {/* Trigger → actions, as a readable chain */}
        <div className="flex items-center gap-1.5 flex-wrap mt-4">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-brand-orange-50 text-2xs text-brand-orange font-medium">
            <Zap className="size-3" />
            {humanise(w.trigger)}
          </span>
          {w.steps.slice(0, 4).map((step) => {
            const Icon = STEP_ICONS[step.kind] ?? Zap;
            return (
              <span key={step.id} className="inline-flex items-center gap-1.5">
                <ArrowRight className="size-3 text-grey-300" />
                <Tooltip content={step.detail}>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-grey-100 text-2xs text-grey-600">
                    <Icon className="size-3" />
                    {step.label}
                  </span>
                </Tooltip>
              </span>
            );
          })}
          {w.steps.length > 4 && (
            <span className="text-2xs text-grey-400">+{w.steps.length - 4}</span>
          )}
        </div>
      </CardBody>

      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-grey-100 bg-grey-50 rounded-b-md">
        <div className="flex items-center gap-4 text-sm text-grey-500">
          <span className="tabular">{number(w.runsLast30Days)} runs</span>
          <span
            className={cn(
              "tabular",
              w.successRate < 95 ? "text-brand-red" : "text-grey-500",
            )}
          >
            {percent(w.successRate)} success
          </span>
        </div>
        <span className="text-sm text-grey-400">
          {w.lastRunAt ? relative(w.lastRunAt) : "Never run"}
        </span>
      </div>
    </Card>
  );
}
