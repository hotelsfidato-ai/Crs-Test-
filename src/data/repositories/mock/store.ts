import * as seed from "@/data/seed";
import type { ListQuery, ListResult } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   IN-MEMORY STORE
   Stands in for Firestore in Phase 1. Collection names, document
   shapes and query semantics match what Phase 2 will use, so the
   swap is a change of implementation, not of interface.

   Data resets on refresh — by design, so every review starts from
   the same state.
   ══════════════════════════════════════════════════════════════════ */

export const db = {
  hotels: [...seed.hotels],
  roomTypes: [...seed.roomTypes],
  ratePlans: [...seed.ratePlans],
  companies: [...seed.companies],
  customers: [...seed.customers],
  reservations: [...seed.reservations],
  invoices: [...seed.invoices],
  payments: [...seed.payments],
  commissions: [...seed.commissions],
  users: [...seed.users],
  auditLogs: [...seed.auditLogs],
  notifications: [...seed.notifications],
  notificationTemplates: [...seed.notificationTemplates],
  automationWorkflows: [...seed.automationWorkflows],
  automationRuns: [...seed.automationRuns],
  integrations: [...seed.integrations],
  orgSettings: { ...seed.orgSettings },
};

export type Db = typeof db;

/* ── Simulated network ─────────────────────────────────────────────
   Real latency means skeletons, optimistic updates and error states
   are exercised rather than decorative.                            */

const MIN_LATENCY = 120;
const MAX_LATENCY = 400;

export function latency(): Promise<void> {
  const ms = MIN_LATENCY + Math.random() * (MAX_LATENCY - MIN_LATENCY);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wraps a read so every repository call behaves like a network call. */
export async function read<T>(produce: () => T): Promise<T> {
  await latency();
  return produce();
}

/** Wraps a write. Slightly slower, matching a real round trip. */
export async function write<T>(produce: () => T): Promise<T> {
  await latency();
  await new Promise((resolve) => setTimeout(resolve, 80));
  return produce();
}

/* ── Query helpers ─────────────────────────────────────────────── */

function getField(record: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
    record,
  );
}

/** Free-text search across the given fields. */
export function matchesSearch<T>(record: T, term: string, fields: (keyof T | string)[]): boolean {
  if (!term.trim()) return true;
  const needle = term.trim().toLowerCase();
  return fields.some((field) => {
    const value = getField(record, String(field));
    return typeof value === "string" && value.toLowerCase().includes(needle);
  });
}

/** Equality filters, mirroring Firestore where() clauses. */
export function applyFilters<T>(records: T[], filters: ListQuery["filters"]): T[] {
  if (!filters) return records;
  const active = Object.entries(filters).filter(
    ([, value]) => value !== undefined && value !== "" && value !== "all",
  );
  if (!active.length) return records;
  return records.filter((record) =>
    active.every(([key, value]) => {
      const field = getField(record, key);
      if (Array.isArray(field)) return field.includes(value as never);
      return field === value;
    }),
  );
}

export function applySort<T>(records: T[], sortBy?: string, sortDir: "asc" | "desc" = "asc"): T[] {
  if (!sortBy) return records;
  const factor = sortDir === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    const left = getField(a, sortBy);
    const right = getField(b, sortBy);
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
    return String(left).localeCompare(String(right)) * factor;
  });
}

export function paginate<T>(records: T[], page = 1, pageSize = 25): ListResult<T> {
  const start = (page - 1) * pageSize;
  return {
    items: records.slice(start, start + pageSize),
    total: records.length,
    page,
    pageSize,
  };
}

/** The full read pipeline every list repository uses. */
export function runQuery<T>(
  records: T[],
  query: ListQuery | undefined,
  searchFields: (keyof T | string)[],
): ListResult<T> {
  const q = query ?? {};
  let result = records;
  if (q.search) result = result.filter((r) => matchesSearch(r, q.search!, searchFields));
  result = applyFilters(result, q.filters);
  result = applySort(result, q.sortBy, q.sortDir);
  return paginate(result, q.page ?? 1, q.pageSize ?? 25);
}

/* ── Id generation ─────────────────────────────────────────────── */

const counters = new Map<string, number>();

export function nextId(prefix: string, width = 4): string {
  const current = (counters.get(prefix) ?? 9000) + 1;
  counters.set(prefix, current);
  return `${prefix}-${String(current).padStart(width, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
