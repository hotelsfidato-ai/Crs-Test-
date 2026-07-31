import { money, moneyCompact, percent, dateShort } from "@/lib/format";
import { PAYMENT_TERM_LABELS, type Reservation, type Customer, type Company } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   ASSISTANT RESPONSES

   Phase 1 computed these from the full in-memory seed. That is not
   viable against Firestore — reading every reservation to answer one
   question would cost a document read per row, per question, and
   Spark allows 50k a day.

   So the assistant now answers from a **bounded snapshot** the page
   fetches once. Figures still reconcile with Reports because both read
   the same repositories.

   🔧 Phase 2.5 replaces `answerFor` with a real completion call. The
   signature does not change, so AiPage.tsx is untouched.
   ══════════════════════════════════════════════════════════════════ */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  footnote?: string;
}

/** Everything the scripted answers can draw on. Fetched once. */
export interface AssistantSnapshot {
  liveReservations: number;
  bookedValue: number;
  roomNights: number;
  averageBookingValue: number;
  cancellationRate: number;
  pendingApprovals: number;
  pendingApprovalValue: number;
  activeProperties: number;
  totalProperties: number;
  overdueInvoices: number;
  overdueValue: number;
  topAccounts: { name: string; revenue: number; bookings: number }[];
}

export const EMPTY_SNAPSHOT: AssistantSnapshot = {
  liveReservations: 0, bookedValue: 0, roomNights: 0, averageBookingValue: 0,
  cancellationRate: 0, pendingApprovals: 0, pendingApprovalValue: 0,
  activeProperties: 0, totalProperties: 0, overdueInvoices: 0, overdueValue: 0,
  topAccounts: [],
};

export const SUGGESTED_PROMPTS = [
  "How did we perform this month?",
  "What needs my approval right now?",
  "Which invoices are overdue?",
  "Who are our top accounts?",
  "Draft a follow-up email for an overdue invoice",
];

const FOOTNOTE =
  "Computed from live platform data over a bounded window. Phase 2 uses scripted analysis, " +
  "not a language model.";

/* ── Answer builders ───────────────────────────────────────────── */

function performance(s: AssistantSnapshot): string {
  if (s.liveReservations === 0) {
    return [
      "There are no live reservations yet.",
      "",
      "Once bookings are created — or customer and company data is imported and the first " +
        "reservations raised — this will summarise revenue, room nights, average booking value " +
        "and cancellation rate.",
    ].join("\n");
  }

  return [
    `You are holding ${s.liveReservations} live reservations worth ${money(s.bookedValue)}.`,
    "",
    `• Room nights: ${s.roomNights.toLocaleString("en-IN")}`,
    `• Average booking value: ${money(Math.round(s.averageBookingValue))}`,
    `• Cancellation rate: ${percent(s.cancellationRate)}`,
    `• Properties live: ${s.activeProperties} of ${s.totalProperties}`,
    "",
    "Open Reports → Revenue for the month-by-month breakdown.",
  ].join("\n");
}

function approvals(s: AssistantSnapshot): string {
  if (s.pendingApprovals === 0) {
    return "The approval queue is clear. Nothing is waiting on a sign-off.";
  }
  return [
    `${s.pendingApprovals} reservation${s.pendingApprovals === 1 ? " is" : "s are"} waiting on ` +
      `approval, holding ${money(s.pendingApprovalValue)}.`,
    "",
    "Bookings reach the queue automatically at or above ₹50,000. Open Reservations → " +
      "Approvals to review them, largest first.",
  ].join("\n");
}

function overdue(s: AssistantSnapshot): string {
  if (s.overdueInvoices === 0) {
    return "No invoices are overdue. Everything billed is either settled or still within terms.";
  }
  return [
    `${s.overdueInvoices} invoice${s.overdueInvoices === 1 ? " is" : "s are"} overdue, ` +
      `totalling ${money(s.overdueValue)}.`,
    "",
    "Open Finance → Invoices and filter by Overdue. The billing contact for each is on the " +
      "invoice record.",
  ].join("\n");
}

function topAccounts(s: AssistantSnapshot): string {
  if (!s.topAccounts.length) {
    return "No company accounts have booked yet. Import your company data to get started.";
  }
  return [
    "Your largest accounts by booked revenue:",
    "",
    ...s.topAccounts.map(
      (a, i) =>
        `${i + 1}. ${a.name} — ${moneyCompact(a.revenue)} across ${a.bookings} booking` +
        `${a.bookings === 1 ? "" : "s"}`,
    ),
  ].join("\n");
}

function followUpEmail(s: AssistantSnapshot): string {
  const account = s.topAccounts[0]?.name ?? "the account";
  return [
    "Here is a draft you can edit before sending:",
    "",
    "Subject: Outstanding invoice — Fidato Hotels",
    "",
    `Dear ${account} team,`,
    "",
    "I hope you are well. Our records show an invoice that is now past its due date. I have " +
      "attached a copy for your reference.",
    "",
    "If it has already been settled, please ignore this note and accept my apologies — do send " +
      "the payment reference so I can reconcile our end.",
    "",
    "If there is a query holding it up, tell me what you need and I will sort it.",
    "",
    "Kind regards",
    "",
    "— Fidato Hotels",
  ].join("\n");
}

/* ── Record summaries ──────────────────────────────────────────────
   These take the loaded record rather than an id. The screen has
   already fetched it, so summarising costs no extra reads — which is
   the difference between a nice touch and a quota problem.          */

export function summariseReservation(r: Reservation): string {
  const parts = [
    `${r.customerName} is booked into ${r.hotelName}, ${r.hotelCity} for ` +
      `${r.nights} night${r.nights === 1 ? "" : "s"} from ${dateShort(r.checkIn)}, ` +
      `taking ${r.totalRooms} room${r.totalRooms === 1 ? "" : "s"} at ${money(r.totalAmount)}.`,
  ];

  if (r.companyName) parts.push(`Billed to ${r.companyName}.`);
  if (r.paymentTerm) parts.push(`Payment term: ${PAYMENT_TERM_LABELS[r.paymentTerm]}.`);

  if (r.status === "pending_approval") {
    parts.push("It is above the ₹50,000 threshold and is waiting on approval.");
  } else if (r.status === "cancelled") {
    parts.push(`Cancelled — ${r.cancellationReason ?? "no reason recorded"}.`);
  }

  if (r.hotelConfirmationNumber) {
    parts.push(
      `The property confirmed it as ${r.hotelConfirmationNumber}` +
        `${r.hotelRepName ? ` via ${r.hotelRepName}` : ""}.`,
    );
  }
  if (r.specialRequests) parts.push(`Special request on file: ${r.specialRequests}`);

  return parts.join(" ");
}

export function summariseCustomer(c: Customer): string {
  if (!c.totalReservations) {
    return (
      `${c.fullName} has not booked yet` +
      `${c.companyName ? `, and is a contact at ${c.companyName}` : ""}. ` +
      `Recorded as a ${c.status} from ${c.source.replace(/_/g, " ")}.`
    );
  }
  return (
    `${c.fullName} has ${c.totalReservations} booking` +
    `${c.totalReservations === 1 ? "" : "s"} worth ${money(c.totalRevenue)}` +
    `${c.companyName ? `, billed to ${c.companyName}` : ""}.` +
    `${c.vip ? " Flagged VIP — the property is notified before arrival." : ""}` +
    `${c.preferences.length ? ` Preferences: ${c.preferences.join(", ")}.` : ""}`
  );
}

export function summariseCompany(c: Company): string {
  const utilisation =
    c.creditLimit > 0 ? Math.round((c.creditUsed / c.creditLimit) * 100) : 0;

  const parts = [
    `${c.name} is a ${c.tier.replace(/_/g, " ")} account` +
      `${c.totalReservations ? ` with ${c.totalReservations} bookings worth ${money(c.totalRevenue)}` : " with no bookings yet"}.`,
  ];

  if (c.negotiatedDiscountPercent) {
    parts.push(`A ${c.negotiatedDiscountPercent}% discount applies automatically.`);
  }
  parts.push(`Terms are ${c.paymentTermDays} days.`);
  if (c.creditLimit > 0) {
    parts.push(
      `Credit is ${utilisation}% used${utilisation > 70 ? " — worth a word with finance before the next large booking." : "."}`,
    );
  }
  return parts.join(" ");
}

/* ── Routing ───────────────────────────────────────────────────── */

export function answerFor(question: string, snapshot: AssistantSnapshot): ChatTurn {
  const q = question.toLowerCase();

  const content =
    /approv|sign.?off|waiting/.test(q) ? approvals(snapshot)
    : /overdue|unpaid|outstanding|chase/.test(q) ? overdue(snapshot)
    : /email|draft|write|follow.?up/.test(q) ? followUpEmail(snapshot)
    : /account|client|compan|top/.test(q) ? topAccounts(snapshot)
    : /perform|revenue|month|how did|summary|overview/.test(q) ? performance(snapshot)
    : [
        "I can answer questions about performance, approvals, overdue invoices and your top " +
          "accounts, and draft a follow-up email.",
        "",
        "Everything I quote is read from the platform, so it always agrees with Reports.",
      ].join("\n");

  return { role: "assistant", content, footnote: FOOTNOTE };
}
