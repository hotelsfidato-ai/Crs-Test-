import {
  collection, doc, getDoc, getDocs, getCountFromServer, query, where,
  orderBy, limit, startAfter, addDoc, setDoc, updateDoc, serverTimestamp,
  Timestamp, type DocumentData, type QueryConstraint,
  type QueryDocumentSnapshot, type Query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { scopeConstraints, type ScopeContext, type Role } from "@/lib/permissions";
import type { ListQuery, ListResult, AutomationEvent, AutomationEventType } from "@/data/types";
import { applyDefaults, DEFAULTS_BY_COLLECTION } from "./defaults";

/* ══════════════════════════════════════════════════════════════════
   FIRESTORE HELPERS

   Everything the repositories share: document conversion, the query
   pipeline, cursor pagination, audit writes and the automation queue.
   ══════════════════════════════════════════════════════════════════ */

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

/* ── Timestamps ────────────────────────────────────────────────────
   Firestore stores Timestamp; the whole app above this layer speaks
   ISO strings. Converting at the boundary means nothing upstream
   changes.

   ⚠️ Date-ONLY fields (checkIn, checkOut, issueDate) stay strings.
   Converting them to Timestamp would shift them by a day across
   timezones, and `yyyy-MM-dd` already sorts and range-filters
   correctly as a string.                                            */

function toIso(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toIso);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toIso(v)]),
    );
  }
  return value;
}

/**
 * Firestore document → domain object.
 *
 * `collection` fills any field the stored document is missing — see
 * defaults.ts for why that has to happen on read and not only on write.
 */
export function fromDoc<T>(
  snap: QueryDocumentSnapshot<DocumentData>,
  collection?: string,
): T {
  const value = { ...(toIso(snap.data()) as object), id: snap.id } as T;
  return applyDefaults(
    value as object,
    collection ? DEFAULTS_BY_COLLECTION[collection] : undefined,
  ) as T;
}

/** Strips `undefined`, which Firestore rejects, and the client-side id. */
export function toDoc<T extends object>(value: T): DocumentData {
  const out: DocumentData = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined || key === "id") continue;
    out[key] = v;
  }
  return out;
}

export const now = () => new Date().toISOString();
export const serverNow = () => serverTimestamp();

/* ── The query pipeline ───────────────────────────────────────────
   Mirrors the Phase 1 shape so no screen changes.

   ⚠️ Firestore has no substring search. `search` is applied in the
   client over the fetched page, exactly as Phase 1 did. It therefore
   searches the page, not the collection — the UI states this. Moving
   to Typesense later changes only this function.                     */

export interface Cursor {
  last?: QueryDocumentSnapshot<DocumentData>;
}

function matchesSearch<T>(record: T, term: string, fields: string[]): boolean {
  if (!term.trim()) return true;
  const needle = term.trim().toLowerCase();
  return fields.some((field) => {
    const value = (record as Record<string, unknown>)[field];
    return typeof value === "string" && value.toLowerCase().includes(needle);
  });
}

export interface RunQueryOptions {
  /** Equality filters. `"all"` and empty are treated as absent. */
  filterFields?: string[];
  searchFields?: string[];
  defaultSort?: { field: string; dir: "asc" | "desc" };
  /** Applied before anything else — row-level scoping. */
  scope?: ScopeContext;
}

/**
 * Runs a list query.
 *
 * ⚠️ Scope constraints are applied to the *query*, not just the rules.
 * Firestore rules filter documents one at a time; a query that could
 * return a forbidden document fails outright rather than returning a
 * subset. The rule and the query must agree.
 */
export async function runQuery<T>(
  path: string,
  q: ListQuery | undefined,
  options: RunQueryOptions = {},
): Promise<ListResult<T>> {
  const {
    filterFields = [],
    searchFields = [],
    defaultSort,
    scope,
  } = options;
  const query_ = q ?? {};
  const pageSize = query_.pageSize ?? 25;

  const constraints: QueryConstraint[] = [];

  // Scoping first — see the note above.
  if (scope) constraints.push(...scopeConstraints(scope).map((c) => where(c.field, "==", c.value)));

  for (const field of filterFields) {
    const value = query_.filters?.[field];
    if (value && value !== "all") constraints.push(where(field, "==", value));
  }

  const sortField = query_.sortBy ?? defaultSort?.field;
  const sortDir = query_.sortDir ?? defaultSort?.dir ?? "desc";
  if (sortField) constraints.push(orderBy(sortField, sortDir));

  // Over-fetch slightly so client-side search still fills a page.
  const fetchSize = query_.search ? pageSize * 4 : pageSize;
  constraints.push(limit(fetchSize + 1));

  const base = collection(db, path) as Query<DocumentData>;
  const snap = await getDocs(query(base, ...constraints));

  let items = snap.docs.slice(0, fetchSize).map((d) => fromDoc<T>(d, path));
  if (query_.search) {
    items = items.filter((r) => matchesSearch(r, query_.search!, searchFields));
  }

  return {
    items: items.slice(0, pageSize),
    total: items.length,
    page: query_.page ?? 1,
    pageSize,
  };
}

/** One read regardless of match count. Cheaper than fetching to count. */
export async function countWhere(path: string, ...constraints: QueryConstraint[]): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, path), ...constraints));
  return snap.data().count;
}

export async function getOne<T>(path: string, id: string): Promise<T | null> {
  if (!id) return null;
  const snap = await getDoc(doc(db, path, id));
  if (!snap.exists()) return null;
  const value = { ...(toIso(snap.data()) as object), id: snap.id } as T;
  return applyDefaults(value as object, DEFAULTS_BY_COLLECTION[path]) as T;
}

export async function listAll<T>(
  path: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const snap = await getDocs(query(collection(db, path), ...constraints));
  return snap.docs.map((d) => fromDoc<T>(d, path));
}

/* ── Audit ─────────────────────────────────────────────────────────
   Every write goes through this so no path can forget it.

   ⚠️ On Spark the client writes audit entries directly. Rules make
   them un-editable and un-forgeable, but cannot guarantee one was
   written at all. The trail is tamper-EVIDENT, not tamper-proof.    */

export interface AuditInput {
  entityType: string;
  entityId: string;
  entityLabel: string;
  action: string;
  summary: string;
  detail?: string;
  actor: Actor;
}

export async function recordAudit(entry: AuditInput): Promise<void> {
  await addDoc(collection(db, "auditLogs"), {
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    action: entry.action,
    summary: entry.summary,
    ...(entry.detail ? { detail: entry.detail } : {}),
    actorId: entry.actor.id,
    actorName: entry.actor.name,
    actorRole: entry.actor.role,
    at: serverTimestamp(),
  });
}

/* ── Automation queue ──────────────────────────────────────────────
   Events are written and NOT processed. n8n polls this collection in
   Phase 2.5.                                                        */

export interface QueueInput {
  type: AutomationEventType;
  entityType: AutomationEvent["entityType"];
  entityId: string;
  entityLabel: string;
  payload?: Record<string, unknown>;
  actor: Actor;
}

export async function queueEvent(input: QueueInput): Promise<void> {
  await addDoc(collection(db, "automationQueue"), {
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    // ⚠️ Minimal — ids, not copies. A fat payload goes stale the moment
    // the record is edited. n8n re-reads the document.
    payload: input.payload ?? {},
    status: "pending",
    attempts: 0,
    createdAt: serverTimestamp(),
    createdBy: input.actor.id,
  });
}

/* ── Counters ──────────────────────────────────────────────────────
   Invoice numbering. A transaction against a counter document is the
   Spark-compatible replacement for a Cloud Function holding a
   sequence.                                                         */

export { doc, collection, setDoc, updateDoc, addDoc, where, orderBy, limit, startAfter, getDocs, getDoc };
