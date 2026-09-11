import type { Role } from "@/lib/permissions";
import type { VisitType } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   DSR — THE DAILY SALES REPORT

   The rules of the daily visit log, in one place, shared by the screen
   and mirrored by firestore.rules.

   ⚠️ SAME DAY ONLY, for a salesperson. They log and correct their own
   visits until the day ends; after that the entry is the record, and
   only the CRS desk, Admin or Owner can change it. The owner chose this
   on 2026-09-10. It is enforced by firestore.rules — the functions here
   only decide which buttons to show, and must agree with the rule or
   the screen offers an edit the database refuses.
   ══════════════════════════════════════════════════════════════════ */

export const VISIT_TYPES: VisitType[] = [
  "introduction", "courtesy", "follow_up", "meeting", "contract", "not_met",
];

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  introduction: "Introduction",
  courtesy: "Courtesy / brand recall",
  follow_up: "Follow-up",
  meeting: "Meeting",
  contract: "Contract / proposal",
  not_met: "Could not meet",
};

export const VISIT_TYPE_TONES: Record<VisitType, "accent" | "info" | "neutral" | "success" | "warning"> = {
  introduction: "accent",
  courtesy: "info",
  follow_up: "neutral",
  meeting: "neutral",
  contract: "success",
  not_met: "warning",
};

/**
 * A calendar day as yyyymmdd — 20260910.
 *
 * ⚠️ In INDIA time, not the machine's and not UTC. The security rule
 * computes "today" as UTC + 5:30, so the screen must too — otherwise a
 * salesperson working past 18:30 UTC (midnight IST) on a laptop set to
 * another zone would see an edit button the database then refuses.
 */
export function dayKeyOf(date: Date): number {
  const ist = new Date(date.getTime() + (330 + date.getTimezoneOffset()) * 60_000);
  return ist.getFullYear() * 10_000 + (ist.getMonth() + 1) * 100 + ist.getDate();
}

export const todayKey = (): number => dayKeyOf(new Date());

/** 20260910 → "2026-09-10", for date inputs and display. */
export function isoOfDay(day: number): string {
  const s = String(day);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** "2026-09-10" → 20260910. Returns NaN for anything malformed. */
export function dayOfIso(iso: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Number(iso.replace(/-/g, "")) : Number.NaN;
}

/** Roles that correct any DSR, on any day. */
export const DSR_DESK_ROLES: readonly Role[] = ["owner", "admin", "crs_manager"];

/** Roles that keep a DSR of their own. */
export const DSR_FIELD_ROLES: readonly Role[] = ["salesperson", "manager"];

/**
 * May this person add to, edit or delete entries in `ownerId`'s DSR for
 * `day`?
 *
 * ⚠️ Mirrors firestore.rules (match /dsrVisits, /dsrDays). Change both.
 */
export function canChangeDsr(
  role: Role,
  actorId: string,
  ownerId: string,
  day: number,
  today = todayKey(),
): boolean {
  if (DSR_DESK_ROLES.includes(role)) return true;
  return DSR_FIELD_ROLES.includes(role) && ownerId === actorId && day === today;
}

/** Why a change is refused, for the tooltip on a disabled control. */
export function whyLocked(role: Role, actorId: string, ownerId: string): string {
  if (DSR_FIELD_ROLES.includes(role) && ownerId !== actorId) {
    return "This is someone else's report.";
  }
  return "Past days are locked. Ask the CRS desk to correct an entry.";
}
