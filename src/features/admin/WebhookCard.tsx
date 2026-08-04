import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Webhook, Send, CheckCircle2, XCircle, RefreshCw, Copy, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { adminRepo } from "@/data/repositories";
import { useActor, useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { relative } from "@/lib/format";
import {
  Card, CardHeader, CardBody, CardFooter, Button, Field, Input,
  Checkbox, StatusPill, Skeleton, fieldProps, toast,
describeError,
} from "@/components/ui";
import { postWebhook, sampleReservationPayload, type WebhookResult } from "@/lib/webhook";
import type { AutomationEventType, WebhookConfig } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   n8n WEBHOOK

   Paste the Production URL from the n8n Webhook node, test it, save.

   ⚠️ Test before save is deliberate. Saving an untested URL turns
   every subsequent booking into a silent failure that nobody notices
   until a guest asks where their confirmation went.
   ══════════════════════════════════════════════════════════════════ */

const EVENTS: { value: AutomationEventType; label: string; hint: string }[] = [
  { value: "reservation.created", label: "Reservation created", hint: "Sends the voucher to the guest" },
  { value: "reservation.cancelled", label: "Reservation cancelled", hint: "Notifies guest and property" },
  { value: "reservation.checked_in", label: "Guest checked in", hint: "" },
  { value: "reservation.checked_out", label: "Guest checked out", hint: "" },
  { value: "invoice.created", label: "Invoice raised", hint: "" },
  { value: "payment.recorded", label: "Payment received", hint: "" },
  { value: "customer.created", label: "Customer created", hint: "" },
  { value: "company.created", label: "Company created", hint: "" },
];

export function WebhookCard() {
  const actor = useActor();
  const role = useSession((s) => s.role);
  const queryClient = useQueryClient();
  const mayEdit = can(role, "edit", "integration");

  const { data, isLoading } = useQuery({
    queryKey: ["webhook-config"],
    queryFn: () => adminRepo.webhook(),
  });

  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<AutomationEventType[]>([]);
  const [test, setTest] = useState<WebhookResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setUrl(data.url ?? "");
    setSecret(data.secret ?? "");
    setEnabled(Boolean(data.enabled));
    setEvents(data.events ?? []);
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<WebhookConfig>) => adminRepo.saveWebhook(patch, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook-config"] });
      toast.success("Webhook saved", enabled ? "Events will be pushed to n8n." : "Saved, but disabled.");
    },
    onError: (error) => {
      const detail = describeError(error);
      toast.error(detail.title ?? "Could not save", detail.message ?? "Nothing was changed.");
    },
  });

  async function runTest() {
    if (!looksLikeUrl) return;
    setTesting(true);
    setTest(null);
    const result = await postWebhook(
      { url: url.trim(), secret: secret.trim(), enabled: true, events: [] },
      sampleReservationPayload(),
    );
    setTest(result);
    setTesting(false);

    // Recorded so the next person can see when it last worked.
    save.mutate({
      lastTestAt: new Date().toISOString(),
      lastTestStatus: result.ok ? "ok" : "failed",
      lastTestDetail: result.detail,
    });
  }

  const looksLikeUrl = /^https?:\/\/.+/i.test(url.trim());
  const dirty =
    url.trim() !== (data?.url ?? "") ||
    secret.trim() !== (data?.secret ?? "") ||
    enabled !== Boolean(data?.enabled) ||
    events.join(",") !== (data?.events ?? []).join(",");

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Webhook className="size-4 text-grey-400" />
            n8n webhook
          </span>
        }
        description="Where this platform pushes business events. n8n does the sending — email, WhatsApp, Drive."
        actions={
          <StatusPill tone={data?.enabled ? "success" : "neutral"}>
            {data?.enabled ? "Active" : "Not sending"}
          </StatusPill>
        }
      />

      <CardBody className="space-y-5">
        <Field
          label="Production webhook URL"
          required
          hint="From the n8n Webhook node — use the Production URL, not the Test URL."
          error={url && !looksLikeUrl ? "Must start with http:// or https://" : undefined}
        >
          {(p) => (
            <Input
              {...fieldProps(p)}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://n8n.yourdomain.com/webhook/fidato-reservations"
              disabled={!mayEdit}
            />
          )}
        </Field>

        <Field
          label="Shared secret"
          hint="Sent as the X-Fidato-Signature header. Have the workflow reject anything without it."
        >
          {(p) => (
            <div className="flex gap-2">
              <Input
                {...fieldProps(p)}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="A long random string"
                disabled={!mayEdit}
              />
              {mayEdit && (
                <Button
                  variant="secondary"
                  leadingIcon={<RefreshCw className="size-4" />}
                  onClick={() => setSecret(randomSecret())}
                >
                  Generate
                </Button>
              )}
            </div>
          )}
        </Field>

        {/* ⚠️ Stated plainly rather than left for someone to assume. */}
        <div className="flex items-start gap-2.5 p-3 rounded-md bg-grey-50 border border-grey-200">
          <ShieldAlert className="size-4 text-grey-400 shrink-0 mt-0.5" />
          <p className="text-xs text-grey-600 leading-relaxed">
            Both values are stored in Firestore and sent from the browser, so any signed-in
            colleague can read them. The secret keeps strangers who guess the URL out — it
            is not a password, and it should not be reused anywhere that matters.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-grey-700 mb-2">Events to push</p>
          <p className="text-xs text-grey-500 mb-3">
            Leave every box unticked to push all of them.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {EVENTS.map((e) => (
              <label
                key={e.value}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-2 rounded-md border cursor-pointer",
                  events.includes(e.value)
                    ? "border-brand-orange bg-brand-orange-50/40"
                    : "border-grey-200 hover:border-grey-300",
                  !mayEdit && "cursor-not-allowed opacity-60",
                )}
              >
                <Checkbox
                  checked={events.includes(e.value)}
                  disabled={!mayEdit}
                  onCheckedChange={(next) =>
                    setEvents((prev) =>
                      next ? [...prev, e.value] : prev.filter((v) => v !== e.value),
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm text-ink-900">{e.label}</span>
                  {e.hint && <span className="block text-xs text-grey-500">{e.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            checked={enabled}
            disabled={!mayEdit}
            onCheckedChange={(v) => setEnabled(Boolean(v))}
          />
          <span>
            <span className="block text-sm text-ink-900">Push events to this endpoint</span>
            <span className="block text-xs text-grey-500 mt-0.5">
              Bookings are still queued either way — this only decides whether n8n is told
              immediately or picks them up on its next poll.
            </span>
          </span>
        </label>

        {/* ── Test result ── */}
        {test && (
          <div
            className={cn(
              "flex items-start gap-3 p-4 rounded-md border",
              test.ok
                ? "bg-success-50 border-success-100"
                : "bg-brand-red-50 border-brand-red-100",
            )}
          >
            {test.ok ? (
              <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-4 text-brand-red shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "text-base font-medium",
                  test.ok ? "text-success" : "text-brand-red",
                )}
              >
                {test.ok
                  ? `n8n accepted the test in ${test.durationMs} ms`
                  : "The test did not get through"}
              </p>
              <p
                className={cn(
                  "text-sm mt-1 leading-relaxed",
                  test.ok ? "text-success" : "text-brand-red",
                )}
              >
                {test.detail}
                {test.status ? ` (HTTP ${test.status})` : ""}
              </p>
              {!test.ok && (
                <p className="text-xs text-grey-600 mt-2 leading-relaxed">
                  If the workflow ran but this still failed, it is almost certainly CORS.
                  The browser posts directly, so the n8n response must include
                  <code className="mx-1 px-1 rounded-xs bg-white border border-grey-200">
                    Access-Control-Allow-Origin
                  </code>
                  for this site's origin.
                </p>
              )}
            </div>
          </div>
        )}

        {data?.lastTestAt && !test && (
          <p className="text-xs text-grey-500">
            Last tested {relative(data.lastTestAt)} —{" "}
            <span className={data.lastTestStatus === "ok" ? "text-success" : "text-brand-red"}>
              {data.lastTestStatus === "ok" ? "succeeded" : "failed"}
            </span>
            {data.lastTestDetail ? `. ${data.lastTestDetail}` : ""}
          </p>
        )}
      </CardBody>

      {mayEdit && (
        <CardFooter>
          <Button
            variant="secondary"
            leadingIcon={<Copy className="size-4" />}
            onClick={() => {
              void navigator.clipboard?.writeText(
                JSON.stringify(sampleReservationPayload(), null, 2),
              );
              toast.success("Payload copied", "Paste it into n8n to shape the workflow.");
            }}
          >
            Copy sample payload
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Send className="size-4" />}
            loading={testing}
            disabled={!looksLikeUrl}
            onClick={() => void runTest()}
          >
            Send test
          </Button>
          <Button
            loading={save.isPending}
            disabled={!dirty || (enabled && !looksLikeUrl)}
            onClick={() =>
              save.mutate({ url: url.trim(), secret: secret.trim(), enabled, events })
            }
          >
            Save configuration
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/** 32 hex characters from the platform CSPRNG. */
function randomSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
