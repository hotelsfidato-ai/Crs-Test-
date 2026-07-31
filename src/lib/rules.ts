import { can, type Role } from "./permissions";
import type { Reservation, ReservationStatus } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   BUSINESS RULES
   Encoded once here so the UI cannot drift from them. Every screen
   that offers an action asks these functions first.
   ══════════════════════════════════════════════════════════════════ */

/** Bookings at or above this value need a manager's approval before confirming. */
/**
 * ⚠️ Removed. Bookings no longer route through an approval queue —
 * every reservation confirms on creation.
 *
 * Kept as a named zero so any straggling caller is obvious rather than
 * silently comparing against `undefined`, which is false for every
 * amount and would look like it worked.
 */
export const APPROVAL_THRESHOLD = 0;

/* The rules stated in plain language, for the Roles & permissions screen.
   `enforcedIn` names the function below that actually applies each one, so
   the documentation and the implementation cannot drift apart. */

export interface BusinessRule {
  id: string;
  rule: string;
  rationale: string;
  enforcedIn: string;
}

export const BUSINESS_RULES: BusinessRule[] = [
  {
    id: "BR-01",
    rule: "A reservation is never deleted, only cancelled.",
    rationale:
      "The commercial history of a booking has to survive the booking itself — for disputes, commission reconciliation and the cancellation report.",
    enforcedIn: "rules.ts · canCancelReservation()",
  },
  {
    id: "BR-03",
    rule: "Completed, cancelled and no-show reservations are locked against edits.",
    rationale:
      "Once a stay has resolved, its folio is the basis for invoicing and commission. Changing it after the fact would silently alter money already accounted for.",
    enforcedIn: "rules.ts · canEditReservation()",
  },
  {
    id: "BR-04",
    rule: "Hotel managers cannot edit rate plans.",
    rationale:
      "Pricing is negotiated centrally by the revenue team. A property changing its own rates would break the rates quoted to corporate accounts.",
    enforcedIn: "rules.ts · canEditRates()",
  },
  {
    id: "BR-05",
    rule: "A salesperson sees only the accounts assigned to them.",
    rationale:
      "Account ownership drives commission, so the data each person sees has to match the book they are accountable for.",
    enforcedIn: "permissions.ts · scopeRecords()",
  },
  {
    id: "BR-06",
    rule: "Customer email addresses and phone numbers must be unique.",
    rationale:
      "Duplicate contacts split a guest's stay history across records, which corrupts lifetime value and sends the same guest conflicting messages.",
    enforcedIn: "rules.ts · isDuplicateEmail() / isDuplicatePhone()",
  },
  {
    id: "BR-07",
    rule: "Merging customers moves all reservations and invoices onto the surviving record.",
    rationale:
      "A merge must never orphan history. The absorbed records' bookings follow them, and the merge itself is written to the audit trail.",
    enforcedIn: "repositories · customersRepo.merge()",
  },
  {
    id: "BR-08",
    rule: "Every change to a record is written to the append-only audit log.",
    rationale:
      "Who changed what, and when, is the only reliable way to resolve a disagreement between a property, a client and the sales team.",
    enforcedIn: "repositories · recordAudit()",
  },
];

/** Statuses that lock a reservation against further commercial edits. */
const TERMINAL_STATUSES: ReservationStatus[] = ["completed", "cancelled", "no_show"];

export function isTerminal(status: ReservationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Reservations are never deleted, only cancelled — there is no delete path. */
export function canCancelReservation(
  role: Role,
  reservation: Reservation,
): { allowed: boolean; reason?: string } {
  if (!can(role, "cancel", "reservation")) {
    return { allowed: false, reason: "Your role cannot cancel reservations." };
  }
  if (reservation.status === "cancelled") {
    return { allowed: false, reason: "This reservation is already cancelled." };
  }
  if (reservation.status === "completed") {
    return { allowed: false, reason: "Completed reservations are locked." };
  }
  if (reservation.status === "checked_in") {
    return {
      allowed: false,
      reason: "Guest is in-house. Check out before cancelling.",
    };
  }
  return { allowed: true };
}

export function canEditReservation(
  role: Role,
  reservation: Reservation,
): { allowed: boolean; reason?: string } {
  if (!can(role, "edit", "reservation")) {
    return { allowed: false, reason: "Your role has read-only access here." };
  }
  if (isTerminal(reservation.status)) {
    return {
      allowed: false,
      reason: `${labelFor(reservation.status)} reservations are locked.`,
    };
  }
  return { allowed: true };
}

/** Hotel managers run the property but never touch commercials. */
export function canEditRates(role: Role): { allowed: boolean; reason?: string } {
  if (role === "hotel_manager") {
    return {
      allowed: false,
      reason: "Rate plans are managed centrally by the revenue team.",
    };
  }
  if (!can(role, "edit", "rate")) {
    return { allowed: false, reason: "Your role cannot edit pricing." };
  }
  return { allowed: true };
}

/* ── Status presentation ───────────────────────────────────────── */

export function labelFor(status: ReservationStatus): string {
  const labels: Record<ReservationStatus, string> = {
    draft: "Draft",
    confirmed: "Confirmed",
    checked_in: "Checked in",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No show",
  };
  return labels[status];
}

/** Which statuses a reservation may legally move to next. */
export function nextStatuses(current: ReservationStatus): ReservationStatus[] {
  const transitions: Record<ReservationStatus, ReservationStatus[]> = {
    draft: ["confirmed", "cancelled"],
    confirmed: ["checked_in", "cancelled", "no_show"],
    checked_in: ["completed"],
    completed: [],
    cancelled: [],
    no_show: [],
  };
  return transitions[current];
}

/* ── Uniqueness rules (validated client-side in Phase 1) ───────── */

export function isDuplicateEmail(
  email: string,
  existing: { email: string; id: string }[],
  ignoreId?: string,
): boolean {
  const normalised = email.trim().toLowerCase();
  return existing.some(
    (c) => c.id !== ignoreId && c.email.trim().toLowerCase() === normalised,
  );
}

export function isDuplicatePhone(
  phoneValue: string,
  existing: { phone: string; id: string }[],
  ignoreId?: string,
): boolean {
  const digits = phoneValue.replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return false;
  return existing.some(
    (c) => c.id !== ignoreId && c.phone.replace(/\D/g, "").slice(-10) === digits,
  );
}
