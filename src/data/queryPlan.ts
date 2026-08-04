/* ══════════════════════════════════════════════════════════════════
   THE QUERY PLAN

   One declaration of what each list can be filtered and sorted by.

   ⚠️ This file is read by TWO things that must never disagree:
     · scripts/build-indexes.mjs, which generates firestore.indexes.json
     · the list screens, which decide whether a column header is sortable

   If a screen offers a sort the index file does not cover, clicking
   that header throws "The query requires an index" in the user's face.
   Deriving both from here makes that impossible: a column is only
   clickable because an index for it exists.

   ⚠️ DIRECTION MATTERS. Firestore will not serve `orderBy(x, "desc")`
   from an ascending index — the composite must be declared in the
   direction the query uses. This was learned the hard way: an
   ASC-only file looked complete and every descending list still
   failed. Both directions are therefore emitted for every sort.

   ⚠️ WHY THE SORT LISTS ARE SHORT. Firestore allows 200 composite
   indexes per database, and the count is
       (scopes + filters) × sorts × 2 directions
   which explodes fast. Seven sortable columns on two screens alone
   would consume the entire budget. Each list therefore offers the
   sorts people actually use — the default plus a couple — rather than
   making every column clickable because it can be.
   ══════════════════════════════════════════════════════════════════ */

export interface CollectionPlan {
  /** Fields a row-level scope pins. `ownerId` for a salesperson. */
  scopes?: string[];
  /** Equality filters the screen's FilterBar offers. */
  filters?: string[];
  /** Sortable columns. The first is the screen's default. */
  sorts?: string[];
  /** Direct relation queries the repositories issue, with direction. */
  pairs?: [string, string, "asc" | "desc"][];
  /** Two equalities then a sort. */
  triples?: [string, string, string, "asc" | "desc"][];
}

export const QUERY_PLAN: Record<string, CollectionPlan> = {
  customers: {
    scopes: ["ownerId"],
    filters: ["status", "source"],
    sorts: ["lastActivityAt", "fullName", "totalRevenue"],
    pairs: [
      ["companyId", "fullName", "asc"],
      ["ownerId", "createdAt", "desc"],
    ],
  },

  companies: {
    scopes: ["ownerId"],
    filters: ["status", "tier"],
    sorts: ["totalRevenue", "name", "lastActivityAt"],
  },

  reservations: {
    scopes: ["ownerId"],
    filters: ["status", "channel", "paymentTerm"],
    sorts: ["checkIn", "totalAmount", "reference"],
    pairs: [
      ["hotelId", "checkIn", "desc"],
      ["companyId", "checkIn", "desc"],
      ["customerId", "checkIn", "desc"],
      ["status", "totalAmount", "desc"],
    ],
  },

  invoices: {
    filters: ["status"],
    sorts: ["issueDate", "dueDate", "amountDue"],
    pairs: [["customerId", "issueDate", "desc"]],
  },

  payments: {
    filters: ["method"],
    sorts: ["receivedAt", "amount"],
    pairs: [["invoiceId", "receivedAt", "desc"]],
  },

  commissions: {
    filters: ["status"],
    sorts: ["periodMonth"],
  },

  users: {
    filters: ["role", "status"],
    sorts: ["name", "lastSeenAt"],
  },

  auditLogs: {
    filters: ["entityType", "action"],
    sorts: ["at"],
    triples: [["entityType", "entityId", "at", "desc"]],
  },

  automationQueue: {
    filters: ["status", "type", "entityType"],
    sorts: ["createdAt", "processedAt"],
  },

  hotels: {
    filters: ["status", "category", "state"],
    sorts: ["name", "totalRooms"],
  },

  roomTypes: { pairs: [["hotelId", "name", "asc"]] },
  seasons: { pairs: [["hotelId", "validFrom", "desc"]] },
  inventory: { pairs: [["hotelId", "date", "asc"]] },
  automationRuns: { pairs: [["workflowId", "startedAt", "desc"]] },
  notifications: { pairs: [["isRead", "at", "desc"]] },
};

/**
 * Whether a list may offer this column as sortable.
 *
 * ⚠️ Screens call this instead of hard-coding `sortable: true`. A
 * column the plan does not cover is not clickable, so the interface
 * cannot ask Firestore for a query no index serves.
 */
export function isSortable(collection: string, field: string): boolean {
  return QUERY_PLAN[collection]?.sorts?.includes(field) ?? false;
}

/** The default sort for a list, and the direction it opens in. */
export function defaultSort(collection: string): { by: string; dir: "asc" | "desc" } {
  const first = QUERY_PLAN[collection]?.sorts?.[0];
  // Dates and money read newest/largest first; names read A–Z.
  const dir: "asc" | "desc" =
    first && /name|reference|number/i.test(first) ? "asc" : "desc";
  return { by: first ?? "createdAt", dir };
}
