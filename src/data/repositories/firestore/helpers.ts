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
   client over a window of records (see runQuery), not the whole
   collection, and a capped window is reported so the UI can say so.
   Moving to a search service later changes only this function.       */

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
  /**
   * Filters on an ARRAY field: the chosen value must be one of its
   * elements (`array-contains`). Firestore allows at most one per query.
   */
  arrayFilterFields?: string[];
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
/* ── Paging ────────────────────────────────────────────────────────
   ⚠️ Every list used to return the first 25 rows whatever page was
   asked for, and reported those 25 as the total, so the pagination
   under a table could never offer page 2. A sales book of 400 companies
   showed 25 and stopped.

   Firestore has no OFFSET that saves reads, so pages are walked with
   cursors: page N starts after the last document of page N-1. Each
   list remembers the cursors it has seen, so Next costs one page of
   reads and going back costs nothing extra; jumping straight to page 9
   walks from the furthest page already known. The total is a count
   aggregation, charged at one read per thousand matching documents,
   not one per document. */

type Snap = QueryDocumentSnapshot<DocumentData>;

/** The last document of each page already fetched, per distinct list. */
const pageCursors = new Map<string, Snap[]>();
/** Search windows, briefly, so paging through results does not refetch them. */
const searchWindows = new Map<string, { at: number; docs: Snap[]; capped: boolean }>();
const SEARCH_WINDOW = 500;
const SEARCH_TTL_MS = 60_000;
const MAX_REMEMBERED = 50;

function remember<V>(map: Map<string, V>, key: string, value: V) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_REMEMBERED) map.delete(map.keys().next().value as string);
}

/** Page `page` (1-based) of `base`, walking from the furthest cursor already known. */
async function pageOf(base: Query<DocumentData>, page: number, pageSize: number, key: string): Promise<Snap[]> {
  const known = pageCursors.get(key) ?? [];
  const from = Math.min(known.length, page - 1);
  const need = (page - from) * pageSize;
  const snap = await getDocs(
    from > 0 ? query(base, startAfter(known[from - 1]!), limit(need)) : query(base, limit(need)),
  );
  for (let p = from + 1; p <= page; p++) {
    const last = snap.docs[(p - from) * pageSize - 1];
    if (last) known[p - 1] = last;
  }
  remember(pageCursors, key, known);
  return snap.docs.slice((page - from - 1) * pageSize, (page - from) * pageSize);
}

export async function runQuery<T>(
  path: string,
  q: ListQuery | undefined,
  options: RunQueryOptions = {},
): Promise<ListResult<T>> {
  const {
    filterFields = [],
    arrayFilterFields = [],
    searchFields = [],
    defaultSort,
    scope,
  } = options;
  const query_ = q ?? {};
  const pageSize = query_.pageSize ?? 25;
  const page = Math.max(1, Math.floor(query_.page ?? 1));

  const constraints: QueryConstraint[] = [];
  const signature: unknown[] = [path, pageSize];

  // Scoping first — see the note above.
  const pinned = scope ? scopeConstraints(scope) : [];
  constraints.push(...pinned.map((c) => where(c.field, "==", c.value)));
  signature.push(pinned);

  for (const field of filterFields) {
    const value = query_.filters?.[field];
    if (!value || value === "all") continue;
    /* ⚠️ A scope already pins this field — a salesperson filtering by
       salesperson. Adding a second equality would either duplicate the
       first or, for anyone else's id, silently return nothing. The scope
       is the truth; the filter defers to it. */
    if (pinned.some((c) => c.field === field)) continue;
    constraints.push(where(field, "==", value));
    signature.push([field, value]);
  }

  /* ⚠️ At most one — Firestore rejects a query with two array-contains
     clauses. The first chosen wins; the screens offer only one. */
  const arrayField = arrayFilterFields.find((f) => {
    const v = query_.filters?.[f];
    return v && v !== "all";
  });
  if (arrayField) {
    constraints.push(where(arrayField, "array-contains", query_.filters![arrayField]));
    signature.push(["contains", arrayField, query_.filters![arrayField]]);
  }

  const sortField = query_.sortBy ?? defaultSort?.field;
  const sortDir = query_.sortDir ?? defaultSort?.dir ?? "desc";
  if (sortField) constraints.push(orderBy(sortField, sortDir));
  signature.push([sortField, sortDir]);

  const base = query(collection(db, path) as Query<DocumentData>, ...constraints);
  const key = JSON.stringify(signature);

  /* ⚠️ Search is still in the browser: Firestore has no substring match.
     It looks through the first SEARCH_WINDOW records in the current sort
     and filters, and pages through what matched. `capped` says there
     were more records than the window, so a miss may not be a true
     miss; the screen says so and suggests a filter. Moving to a search
     service later changes only this branch. */
  if (query_.search?.trim()) {
    const searchKey = `${key}|${query_.search.trim().toLowerCase()}`;
    let window = searchWindows.get(searchKey);
    if (!window || Date.now() - window.at > SEARCH_TTL_MS) {
      const snap = await getDocs(query(base, limit(SEARCH_WINDOW + 1)));
      window = { at: Date.now(), docs: snap.docs.slice(0, SEARCH_WINDOW), capped: snap.docs.length > SEARCH_WINDOW };
      remember(searchWindows, searchKey, window);
    }
    const matched = window.docs
      .map((d) => fromDoc<T>(d, path))
      .filter((r) => matchesSearch(r, query_.search!, searchFields));
    return {
      items: matched.slice((page - 1) * pageSize, page * pageSize),
      total: matched.length,
      page,
      pageSize,
      ...(window.capped ? { searchCapped: SEARCH_WINDOW } : {}),
    };
  }

  const [counted, docs] = await Promise.all([
    getCountFromServer(base).then((c) => c.data().count),
    pageOf(base, page, pageSize, key),
  ]);
  return {
    items: docs.map((d) => fromDoc<T>(d, path)),
    total: counted,
    page,
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
