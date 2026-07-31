import { db } from "@/data/repositories";
import { money, moneyCompact, percent, dateShort } from "@/lib/format";

/* ══════════════════════════════════════════════════════════════════
   SCRIPTED AI RESPONSES
   Phase 1 calls no model. Answers are computed from the same live
   seed data the rest of the app reads, so the numbers the assistant
   quotes always agree with the dashboards. Phase 2 swaps this file
   for a real completion call; the component contract stays.
   ══════════════════════════════════════════════════════════════════ */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  footnote?: string;
}

export const SUGGESTED_PROMPTS = [
  "How did we perform this month?",
  "Which properties are underperforming?",
  "What needs my approval right now?",
  "Draft a follow-up email for an overdue invoice",
  "Who are our top five accounts?",
];

const FOOTNOTE = "Generated from live platform data. Phase 1 uses scripted analysis, not a language model.";

function live() {
  return db.reservations.filter((r) => r.status !== "cancelled" && r.status !== "draft");
}

/* ── Answer builders ───────────────────────────────────────────── */

function performanceSummary(): string {
  const rows = live();
  const revenue = rows.reduce((s, r) => s + r.totalAmount, 0);
  const roomNights = rows.reduce((s, r) => s + r.totalRooms * r.nights, 0);
  const cancelled = db.reservations.filter((r) => r.status === "cancelled").length;
  const rate = db.reservations.length ? (cancelled / db.reservations.length) * 100 : 0;

  return [
    `Across the portfolio you are holding ${rows.length} live reservations worth ${money(revenue)}.`,
    "",
    `• Room nights sold: ${roomNights.toLocaleString("en-IN")}`,
    `• Average booking value: ${money(Math.round(revenue / Math.max(1, rows.length)))}`,
    `• Cancellation rate: ${percent(rate)}`,
    `• Properties live: ${db.hotels.filter((h) => h.status === "active").length} of ${db.hotels.length}`,
    "",
    "The strongest contribution is coming from the corporate and direct-sales channels. Open Reports → Revenue for the month-by-month breakdown.",
  ].join("\n");
}

function underperformers(): string {
  const byHotel = new Map<string, { name: string; city: string; revenue: number; bookings: number; rooms: number }>();
  for (const h of db.hotels) {
    byHotel.set(h.id, { name: h.name, city: h.city, revenue: 0, bookings: 0, rooms: h.totalRooms });
  }
  for (const r of live()) {
    const entry = byHotel.get(r.hotelId);
    if (entry) {
      entry.revenue += r.totalAmount;
      entry.bookings += 1;
    }
  }

  const ranked = [...byHotel.values()]
    .map((e) => ({ ...e, perRoom: e.revenue / Math.max(1, e.rooms) }))
    .sort((a, b) => a.perRoom - b.perRoom)
    .slice(0, 5);

  return [
    "These five properties are earning the least per available room, which is the fairest way to compare a 17-key property against a 236-key one:",
    "",
    ...ranked.map(
      (e, i) =>
        `${i + 1}. ${e.name}, ${e.city} — ${moneyCompact(e.revenue)} across ${e.bookings} booking${e.bookings === 1 ? "" : "s"} (${moneyCompact(e.perRoom)} per room)`,
    ),
    "",
    "Worth checking whether their rate plans are still competitive, and whether the sales team has been quoting them at all.",
  ].join("\n");
}

function approvalsSummary(): string {
  const pending = db.reservations
    .filter((r) => r.status === "pending_approval")
    .sort((a, b) => b.totalAmount - a.totalAmount);

  if (!pending.length) {
    return "Nothing is waiting on approval right now. The queue is clear.";
  }

  const total = pending.reduce((s, r) => s + r.totalAmount, 0);
  const top = pending.slice(0, 5);

  return [
    `${pending.length} reservation${pending.length === 1 ? "" : "s"} ${pending.length === 1 ? "is" : "are"} waiting on approval, worth ${money(total)} in total.`,
    "",
    "The largest are:",
    ...top.map(
      (r) =>
        `• ${r.reference} — ${r.customerName} at ${r.hotelName}, ${money(r.totalAmount)}, check-in ${dateShort(r.checkIn)}`,
    ),
    "",
    "Open Reservations → Approvals to clear them.",
  ].join("\n");
}

function overdueEmail(): string {
  const overdue = db.invoices
    .filter((i) => i.status === "overdue")
    .sort((a, b) => b.amountDue - a.amountDue)[0];

  if (!overdue) {
    return "There are no overdue invoices at the moment, so there is nothing to chase.";
  }

  return [
    `Here is a draft for ${overdue.number} (${money(overdue.amountDue)} outstanding):`,
    "",
    `Subject: Outstanding invoice ${overdue.number}`,
    "",
    `Dear ${overdue.companyName ?? overdue.customerName},`,
    "",
    `I hope you are well. Our records show invoice ${overdue.number}, raised on ${dateShort(overdue.issueDate)} for ${money(overdue.totalAmount)}, remains partly unsettled with ${money(overdue.amountDue)} outstanding against a due date of ${dateShort(overdue.dueDate)}.`,
    "",
    "If the invoice is already scheduled for payment, please share the expected date and I will update our records. If anything on it needs clarifying, I am happy to walk through the detail.",
    "",
    "Kind regards,",
    "Fidato Hotels — Finance",
  ].join("\n");
}

function topAccounts(): string {
  const ranked = [...db.companies]
    .filter((c) => c.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 5);

  if (!ranked.length) return "No company has booked revenue yet.";

  return [
    "Your five largest accounts by booked revenue:",
    "",
    ...ranked.map(
      (c, i) =>
        `${i + 1}. ${c.name} — ${money(c.totalRevenue)} across ${c.totalReservations} reservation${c.totalReservations === 1 ? "" : "s"} (owner: ${c.ownerName})`,
    ),
    "",
    `Together they account for ${percent(
      (ranked.reduce((s, c) => s + c.totalRevenue, 0) /
        Math.max(1, db.companies.reduce((s, c) => s + c.totalRevenue, 0))) *
        100,
    )} of all company revenue — worth protecting with named account ownership.`,
  ].join("\n");
}

function occupancySummary(): string {
  const rows = live();
  const roomNights = rows.reduce((s, r) => s + r.totalRooms * r.nights, 0);
  const capacity = db.hotels.reduce((s, h) => s + h.totalRooms, 0) * 365;
  return [
    `Portfolio capacity is ${db.hotels.reduce((s, h) => s + h.totalRooms, 0).toLocaleString("en-IN")} rooms across ${db.hotels.length} properties.`,
    "",
    `You have sold ${roomNights.toLocaleString("en-IN")} room nights, an annualised occupancy of roughly ${percent((roomNights / Math.max(1, capacity)) * 100)}.`,
    "",
    "Reports → Occupancy breaks this down by city, which is where the variance actually shows.",
  ].join("\n");
}

function cancellationSummary(): string {
  const cancelled = db.reservations.filter((r) => r.status === "cancelled");
  const reasons = new Map<string, number>();
  for (const r of cancelled) {
    const key = r.cancellationReason || "Not recorded";
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const ranked = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return [
    `${cancelled.length} reservations have been cancelled, ${percent((cancelled.length / Math.max(1, db.reservations.length)) * 100)} of everything booked.`,
    "",
    "Most common reasons:",
    ...ranked.map(([reason, count]) => `• ${reason} — ${count}`),
    "",
    "Note that reservations are never deleted, only cancelled, so this history stays auditable.",
  ].join("\n");
}

/* ── Intent routing ────────────────────────────────────────────── */

const MATCHERS: { test: RegExp; answer: () => string }[] = [
  { test: /(approv|pending|waiting|sign.?off)/i, answer: approvalsSummary },
  { test: /(underperform|worst|weak|struggling|lowest)/i, answer: underperformers },
  { test: /(overdue|chase|unpaid|outstanding|draft.*(email|mail)|follow.?up)/i, answer: overdueEmail },
  { test: /(top|best|largest|biggest).*(account|company|client|customer)/i, answer: topAccounts },
  { test: /(occupan|room night|capacity|available)/i, answer: occupancySummary },
  { test: /(cancel|churn|drop)/i, answer: cancellationSummary },
  { test: /(perform|how.*(doing|month|going)|summary|revenue|overview)/i, answer: performanceSummary },
];

export function answerFor(question: string): ChatTurn {
  for (const { test, answer } of MATCHERS) {
    if (test.test(question)) {
      return { role: "assistant", content: answer(), footnote: FOOTNOTE };
    }
  }

  return {
    role: "assistant",
    content: [
      "I can help with performance, approvals, accounts and drafting messages. Try one of these:",
      "",
      ...SUGGESTED_PROMPTS.map((p) => `• ${p}`),
      "",
      "In Phase 2 this assistant is wired to a real model with access to the full record set, so it will handle open-ended questions properly.",
    ].join("\n"),
    footnote: FOOTNOTE,
  };
}

/* ── Record summaries — shown on detail screens ────────────────── */

export function summariseReservation(reservationId: string): string {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) return "";
  const customer = db.customers.find((c) => c.id === r.customerId);

  const parts = [
    `${r.customerName} is booked into ${r.hotelName}, ${r.hotelCity} for ${r.nights} night${r.nights === 1 ? "" : "s"} from ${dateShort(r.checkIn)}, taking ${r.totalRooms} room${r.totalRooms === 1 ? "" : "s"} at ${money(r.totalAmount)}.`,
  ];

  if (r.companyName) {
    parts.push(`Billed to ${r.companyName}.`);
  }
  if (customer && customer.totalReservations > 1) {
    parts.push(`This is a returning guest — ${customer.totalReservations} stays worth ${money(customer.totalRevenue)} so far.`);
  }
  if (r.requiresApproval && r.status === "pending_approval") {
    parts.push("It is above the ₹50,000 threshold and is waiting on approval.");
  }
  if (r.specialRequests) {
    parts.push(`Special request on file: ${r.specialRequests}`);
  }

  return parts.join(" ");
}

export function summariseCustomer(customerId: string): string {
  const c = db.customers.find((x) => x.id === customerId);
  if (!c) return "";

  const bookings = db.reservations.filter((r) => r.customerId === c.id);
  const completed = bookings.filter((r) => r.status === "completed");
  const favourite = new Map<string, number>();
  for (const b of completed) favourite.set(b.hotelName, (favourite.get(b.hotelName) ?? 0) + 1);
  const top = [...favourite.entries()].sort((a, b) => b[1] - a[1])[0];

  const parts = [
    `${c.fullName}${c.companyName ? ` of ${c.companyName}` : ""} has ${c.totalReservations} reservation${c.totalReservations === 1 ? "" : "s"} on record worth ${money(c.totalRevenue)}.`,
  ];

  if (top) parts.push(`Most frequent property: ${top[0]} (${top[1]} stays).`);
  if (c.preferences.length) parts.push(`Preferences: ${c.preferences.join(", ").toLowerCase()}.`);
  if (c.vip) parts.push("Flagged VIP — notify the property before arrival.");

  return parts.join(" ");
}

export function summariseCompany(companyId: string): string {
  const c = db.companies.find((x) => x.id === companyId);
  if (!c) return "";

  const utilisation = c.creditLimit > 0 ? (c.creditUsed / c.creditLimit) * 100 : 0;
  const parts = [
    `${c.name} is a ${c.tier.replace("_", " ")} account in ${c.industry}, owned by ${c.ownerName}.`,
    `${c.totalReservations} reservation${c.totalReservations === 1 ? "" : "s"} worth ${money(c.totalRevenue)}.`,
    `Credit utilisation is ${percent(utilisation)} of ${money(c.creditLimit)} on ${c.paymentTermDays}-day terms.`,
  ];

  if (c.negotiatedDiscountPercent > 0) {
    parts.push(`A negotiated ${c.negotiatedDiscountPercent}% discount applies to their bookings.`);
  }
  if (utilisation > 70) {
    parts.push("Credit utilisation is high — worth a conversation before the next large booking.");
  }

  return parts.join(" ");
}
