import { describe, expect, it } from "vitest";
import { shouldSend, sampleReservationPayload } from "./webhook";
import type { WebhookConfig } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   WEBHOOK DISPATCH GATING

   ⚠️ The dangerous direction is sending when nobody meant to — an
   event pushed to a stale URL is a guest email that never arrives and
   nobody notices. Every case that must NOT send is pinned.
   ══════════════════════════════════════════════════════════════════ */

const config = (over: Partial<WebhookConfig> = {}): WebhookConfig => ({
  url: "https://n8n.example.com/webhook/fidato",
  secret: "s3cret",
  enabled: true,
  events: [],
  ...over,
});

describe("shouldSend", () => {
  it("sends when enabled with no event filter", () => {
    expect(shouldSend(config(), "reservation.created")).toBe(true);
  });

  it("does not send when disabled", () => {
    expect(shouldSend(config({ enabled: false }), "reservation.created")).toBe(false);
  });

  it("does not send when no URL is configured", () => {
    expect(shouldSend(config({ url: "" }), "reservation.created")).toBe(false);
  });

  it("does not send when nothing is configured at all", () => {
    expect(shouldSend(null, "reservation.created")).toBe(false);
    expect(shouldSend(undefined, "reservation.created")).toBe(false);
  });

  it("respects an event filter", () => {
    const only = config({ events: ["reservation.created"] });
    expect(shouldSend(only, "reservation.created")).toBe(true);
    expect(shouldSend(only, "invoice.created")).toBe(false);
  });

  /* ⚠️ An empty list means "all", not "none". The opposite reading
     would make a fresh configuration silently send nothing, which is
     the failure that takes longest to notice. */
  it("treats an empty event list as every event", () => {
    expect(shouldSend(config({ events: [] }), "payment.recorded")).toBe(true);
  });
});

describe("the sample payload", () => {
  it("is marked as a test so a workflow can ignore it", () => {
    expect(sampleReservationPayload().event).toBe("test");
  });

  it("carries the real shape a workflow will receive", () => {
    const data = sampleReservationPayload().data as Record<string, Record<string, unknown>>;
    expect(data.reservation.reference).toBeTruthy();
    expect(data.customer.email).toBeTruthy();
    expect(data.hotel.name).toBeTruthy();
  });
});
