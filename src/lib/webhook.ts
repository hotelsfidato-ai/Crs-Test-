import type { WebhookConfig, AutomationEventType } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   THE n8n SEAM

   Phase 2 wrote events to `automationQueue` and left them there for
   n8n to poll. This adds a push so n8n reacts immediately instead of
   on its next poll.

   ⚠️ THE QUEUE REMAINS AUTHORITATIVE. This POST is best-effort and
   fires from the browser, so it is lost if the tab closes mid-flight,
   the network drops, or CORS rejects it. The queued event is the
   durable record; the webhook only makes delivery prompt. Treating
   the push as the source of truth would silently lose bookings.

   ⚠️ On Spark there is no server to send this from — no Cloud
   Functions, no Admin SDK. A browser POST is the only option, and its
   limits are the reason for the paragraph above rather than a defect
   to fix later.

   ⚠️ The React app still never talks to an email provider. It talks to
   n8n, which is the automation layer; n8n decides what to send and
   holds the mail credentials.
   ══════════════════════════════════════════════════════════════════ */

export interface WebhookPayload {
  event: AutomationEventType | "test";
  sentAt: string;
  source: "fidato-crs";
  /** Correlates with the automationQueue document, so n8n can dedupe. */
  eventId?: string;
  data: Record<string, unknown>;
}

export interface WebhookResult {
  ok: boolean;
  status?: number;
  detail: string;
  durationMs: number;
}

/** Aborts a hung endpoint rather than leaving the UI waiting. */
const TIMEOUT_MS = 10_000;

export function shouldSend(config: WebhookConfig | null | undefined, event: string): boolean {
  if (!config?.enabled || !config.url) return false;
  // An empty list means "everything" — the common case, and safer than
  // silently sending nothing when nobody has ticked a box.
  if (!config.events?.length) return true;
  return config.events.includes(event as AutomationEventType);
}

export async function postWebhook(
  config: WebhookConfig,
  payload: WebhookPayload,
): Promise<WebhookResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.secret ? { "X-Fidato-Signature": config.secret } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // n8n webhooks do not use cookies, and omitting credentials keeps
      // the request a simple CORS one wherever possible.
      credentials: "omit",
    });

    const durationMs = Math.round(performance.now() - started);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        detail: `n8n replied ${response.status} ${response.statusText || ""}`.trim(),
        durationMs,
      };
    }
    return { ok: true, status: response.status, detail: "Delivered", durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);

    /* ⚠️ A CORS rejection and a dead host are indistinguishable from
       the browser — both surface as an opaque TypeError. Saying so is
       more useful than "network error", because the fix is completely
       different: one is an n8n header setting, the other is a URL. */
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, detail: `No response within ${TIMEOUT_MS / 1000}s`, durationMs };
    }
    return {
      ok: false,
      detail:
        "Could not reach the endpoint. Either the URL is wrong, n8n is down, or the " +
        "workflow does not return CORS headers for this origin.",
      durationMs,
    };
  } finally {
    window.clearTimeout(timer);
  }
}

/** A representative payload, so a test exercises the real shape. */
export function sampleReservationPayload(): WebhookPayload {
  return {
    event: "test",
    sentAt: new Date().toISOString(),
    source: "fidato-crs",
    data: {
      note: "Test from Fidato CRS. No booking was created.",
      reservation: {
        reference: "FH-2026-00000",
        status: "confirmed",
        checkIn: "2026-08-12",
        checkOut: "2026-08-15",
        nights: 3,
        totalRooms: 1,
        totalAmount: 24_150,
        paymentTerm: "DP",
        hotelConfirmationNumber: "SAMPLE-001",
      },
      customer: {
        fullName: "Sample Guest",
        email: "guest@example.com",
        phone: "+91 90000 00000",
      },
      hotel: { name: "Sample Property", city: "Pune" },
      voucher: { subject: "Booking confirmed — Sample Property" },
    },
  };
}
