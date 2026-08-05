import { useQuery } from "@tanstack/react-query";
import {
  Plug, CheckCircle2, AlertTriangle, Clock, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { adminRepo } from "@/data/repositories";
import { relative, humanise } from "@/lib/format";
import {
  Page, PageHeader, Card, CardBody, CardHeader, StatusPill, Skeleton,
  Stat, EmptyState, Button, toast,
} from "@/components/ui";
import type { Integration } from "@/data/types";
import { WebhookCard } from "./WebhookCard";
import { SupabaseCard } from "./SupabaseCard";

const STATUS_TONES = {
  connected: "success",
  available: "info",
  error: "danger",
} as const;

const STATUS_ICONS = {
  connected: CheckCircle2,
  available: Clock,
  error: AlertTriangle,
} as const;

const STATUS_DETAIL: Record<Integration["status"], string> = {
  connected: "Live and syncing.",
  available: "Not yet connected — arrives with the phase noted below.",
  error: "The last sync failed. Credentials or endpoint need attention.",
};

export default function IntegrationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => adminRepo.integrations(),
  });

  const integrations = data ?? [];
  const connected = integrations.filter((i) => i.status === "connected");
  const errored = integrations.filter((i) => i.status === "error");
  const planned = integrations.filter((i) => i.status === "available");

  const categories = [...new Set(integrations.map((i) => i.category))];

  return (
    <Page>
      <PageHeader
        title="Integrations"
        description="Everything outside this platform goes through n8n. Configure the seam below; the catalogue underneath is what n8n connects to."
      />

      {/* The one integration that is real and configurable today. */}
      <div className="mb-8">
        <WebhookCard />

      <SupabaseCard />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Integrations" value={integrations.length} />
        </Card>
        <Card className="p-5">
          <Stat label="Connected" value={connected.length} />
        </Card>
        <Card className="p-5">
          <Stat label="Needs attention" value={errored.length} />
        </Card>
        <Card className="p-5">
          <Stat label="Not connected" value={planned.length} hint="Phase 2 and 3" />
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : integrations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Plug />}
            title="No integrations"
            description="Connect a PMS, channel manager or messaging provider to extend the platform."
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => {
            const group = integrations.filter((i) => i.category === category);
            return (
              <section key={category}>
                <h2 className="text-md font-semibold text-ink-900 mb-3">
                  {humanise(category)}
                  <span className="text-sm font-normal text-grey-400 ml-2">
                    {group.length}
                  </span>
                </h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  {group.map((integration) => (
                    <IntegrationCard key={integration.id} integration={integration} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}

function IntegrationCard({ integration: i }: { integration: Integration }) {
  const Icon = STATUS_ICONS[i.status] ?? Plug;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={i.name}
        description={i.description}
        actions={
          <StatusPill tone={STATUS_TONES[i.status] ?? "neutral"}>
            {humanise(i.status)}
          </StatusPill>
        }
      />

      <CardBody className="pt-0 flex-1">
        <div className="flex items-start gap-2.5">
          <Icon
            className={cn(
              "size-4 shrink-0 mt-0.5",
              i.status === "connected"
                ? "text-success"
                : i.status === "error"
                  ? "text-brand-red"
                  : "text-grey-400",
            )}
          />
          <p className="text-sm text-grey-600 leading-relaxed">{STATUS_DETAIL[i.status]}</p>
        </div>

        {i.viaN8n && (
          <div className="mt-4 flex items-center gap-2">
            <StatusPill tone="neutral" dot={false}>
              Runs through n8n
            </StatusPill>
            <span className="text-2xs text-grey-400">Wired up in Phase 3</span>
          </div>
        )}
      </CardBody>

      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-grey-100 bg-grey-50 rounded-b-md">
        <span className="text-sm text-grey-500">
          {i.lastSyncAt
            ? `Synced ${relative(i.lastSyncAt)}`
            : i.connectedAt
              ? `Connected ${relative(i.connectedAt)}`
              : i.viaN8n
                ? "Arrives in Phase 3"
                : "Arrives in Phase 2"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          trailingIcon={<ExternalLink className="size-3.5" />}
          onClick={() =>
            toast.info(
              i.status === "available" ? "Not yet available" : "Configuration",
              i.status === "available"
                ? `${i.name} is scheduled for ${i.viaN8n ? "Phase 3" : "Phase 2"}.`
                : "Integration settings arrive with the Phase 2 backend.",
            )
          }
        >
          Configure
        </Button>
      </div>
    </Card>
  );
}
