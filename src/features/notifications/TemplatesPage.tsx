import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, MessageSquare, Smartphone, Monitor, Code2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { notificationsRepo, db } from "@/data/repositories";
import { humanise } from "@/lib/format";
import {
  Page, PageHeader, Card, CardHeader, CardBody, StatusPill, Skeleton,
  EmptyState, Segmented, Tooltip,
} from "@/components/ui";
import type { NotificationTemplate } from "@/data/types";

/* Templates are shown as they will actually render, with merge fields
   substituted from a sample record — a template full of {{tokens}}
   tells you nothing about whether the wording is right. */

const CHANNEL_ICONS = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: Smartphone,
  in_app: Monitor,
} as const;

const SAMPLE: Record<string, string> = {
  "{{guest_name}}": "Ananya Bose",
  "{{customer_name}}": "Ananya Bose",
  "{{hotel_name}}": "Ayati Resort & Spa",
  "{{hotel_city}}": "Mahabaleshwar",
  "{{reference}}": "FH-2607-4821",
  "{{check_in}}": "12 Aug 2026",
  "{{check_out}}": "15 Aug 2026",
  "{{nights}}": "3",
  "{{rooms}}": "2",
  "{{total}}": "₹64,800",
  "{{amount}}": "₹64,800",
  "{{amount_due}}": "₹18,400",
  "{{invoice_number}}": "INV-2607-0193",
  "{{number}}": "INV-2607-0193",
  "{{due_date}}": "27 Aug 2026",
  "{{company_name}}": "Meridian Logistics",
  "{{owner_name}}": "Rhea Kapoor",
  "{{salesperson}}": "Rhea Kapoor",
  "{{support_email}}": "reservations@fidatohotels.com",
  "{{support_phone}}": "+91 20 4890 1200",
  "{{brand_name}}": "Fidato Hotels",
};

function render(text: string): string {
  return text.replace(/\{\{[a-z_]+\}\}/g, (token) => SAMPLE[token] ?? token);
}

type Mode = "preview" | "source";

export default function TemplatesPage() {
  const [mode, setMode] = useState<Mode>("preview");

  const { data, isLoading } = useQuery({
    queryKey: ["notification-templates"],
    queryFn: () => notificationsRepo.templates(),
  });

  const templates = data ?? [];
  const byChannel = ["email", "whatsapp", "sms", "in_app"] as const;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Notifications", to: "/notifications" },
          { label: "Templates" },
        ]}
        title="Message templates"
        description="What the platform sends, and on which channel. Preview substitutes a sample booking so you can read the real wording."
      >
        <div className="flex items-center justify-end">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "preview", label: "Preview" },
              { value: "source", label: "Merge fields" },
            ]}
          />
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <EmptyState title="No templates" description="Templates are seeded per event." />
        </Card>
      ) : (
        <div className="space-y-8">
          {byChannel.map((channel) => {
            const group = templates.filter((t) => t.channel === channel);
            if (!group.length) return null;
            const Icon = CHANNEL_ICONS[channel];

            return (
              <section key={channel}>
                <h2 className="flex items-center gap-2 text-md font-semibold text-ink-900 mb-3">
                  <Icon className="size-4 text-grey-400" />
                  {humanise(channel)}
                  <span className="text-sm font-normal text-grey-400">
                    {group.length} template{group.length === 1 ? "" : "s"}
                  </span>
                </h2>

                <div className="grid gap-4 lg:grid-cols-2">
                  {group.map((t) => (
                    <TemplateCard key={t.id} template={t} mode={mode} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Card className="mt-8 bg-grey-50">
        <CardBody className="flex items-start gap-3">
          <Code2 className="size-4 text-grey-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-base font-medium text-ink-900">Merge fields</p>
            <p className="text-sm text-grey-600 mt-1 leading-relaxed">
              Tokens like <code className="text-brand-orange">{"{{guest_name}}"}</code> are
              replaced from the triggering record at send time. Unknown tokens are left
              intact rather than blanked, so a typo is visible instead of silently
              producing an empty sentence.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {Object.keys(SAMPLE).slice(0, 12).map((token) => (
                <code
                  key={token}
                  className="px-1.5 py-0.5 rounded-xs bg-white border border-grey-200 text-2xs text-grey-600"
                >
                  {token}
                </code>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>
    </Page>
  );
}

function TemplateCard({
  template: t, mode,
}: {
  template: NotificationTemplate;
  mode: Mode;
}) {
  const workflow = db.automationWorkflows.find((w) => w.trigger === t.event);
  const body = mode === "preview" ? render(t.body) : t.body;
  const subject = t.subject ? (mode === "preview" ? render(t.subject) : t.subject) : undefined;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t.name}
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <span>Fires on {humanise(t.event)}</span>
            {workflow && (
              <Tooltip content={`Used by the "${workflow.name}" workflow`}>
                <StatusPill tone="neutral" dot={false}>
                  Automated
                </StatusPill>
              </Tooltip>
            )}
          </span>
        }
        actions={
          <StatusPill tone={t.isActive ? "success" : "neutral"}>
            {t.isActive ? "Active" : "Inactive"}
          </StatusPill>
        }
      />

      <CardBody className="pt-0 flex-1">
        {/* A phone-ish frame for the short channels reads more honestly
            than a plain paragraph. */}
        <div
          className={cn(
            "rounded-md border p-4",
            t.channel === "whatsapp"
              ? "bg-[#f0f5ee] border-[#dbe6d6]"
              : "bg-grey-50 border-grey-200",
          )}
        >
          {subject && (
            <p className="text-base font-medium text-ink-900 pb-2.5 mb-2.5 border-b border-grey-200">
              {subject}
            </p>
          )}
          <p
            className={cn(
              "text-base leading-relaxed whitespace-pre-line",
              mode === "source" ? "text-grey-600 font-mono text-sm" : "text-ink-900",
            )}
          >
            {body}
          </p>
        </div>

        {t.channel === "sms" && (
          <p className="text-xs text-grey-400 mt-2 tabular">
            {render(t.body).length} characters ·{" "}
            {Math.ceil(render(t.body).length / 160)} SMS segment
            {Math.ceil(render(t.body).length / 160) === 1 ? "" : "s"}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
