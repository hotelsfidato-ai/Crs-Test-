/* ══════════════════════════════════════════════════════════════════
   FIRESTORE INDEX GENERATOR

       node scripts/build-indexes.mjs

   Writes firestore.indexes.json from the declaration below.

   ⚠️ Why this is generated rather than hand-written.

   The first hand-written set was derived from each repository's
   `defaultSort`. But the SCREENS override that — the customers list
   sorts by lastActivityAt, not fullName — and every sortable column
   header is another sort the user can pick at runtime. So the file
   looked complete, matched the repository exactly, and still threw
   "The query requires an index" the moment a salesperson opened their
   own customer list.

   A composite index is needed for every combination of:
       (equality filter or ownership scope) × (field being ordered by)
   so the honest way to get them all is to enumerate them.

   ⚠️ Directions are ASC only. Firestore can read an index backwards
   when every ordering in the query is inverted, and these queries have
   a single orderBy, so one ascending index serves both directions.

   ⚠️ If a screen gains a sortable column or a filter, add it HERE and
   re-run. Adding it to the JSON by hand puts the two out of step again,
   which is the whole failure this file exists to prevent.
   ══════════════════════════════════════════════════════════════════ */

import { writeFileSync } from "node:fs";

/**
 * `scoped` — fields a row-level scope pins (ownerId for a salesperson).
 * `filters` — every key in the screen's FILTER_KEYS.
 * `sorts`   — every sortable column, plus the screen's default sort.
 * `pairs`   — explicit one-off queries the repositories issue directly.
 */
const COLLECTIONS = {
  customers: {
    scoped: ["ownerId"],
    filters: ["status", "source"],
    sorts: [
      "fullName", "status", "totalReservations", "totalRevenue",
      "ownerName", "lastActivityAt", "createdAt",
    ],
    pairs: [["companyId", "fullName"]],
  },

  companies: {
    scoped: ["ownerId"],
    filters: ["status", "tier"],
    sorts: [
      "name", "tier", "status", "totalReservations", "totalRevenue",
      "ownerName", "lastActivityAt",
    ],
  },

  reservations: {
    scoped: ["ownerId"],
    filters: ["status", "channel", "paymentTerm"],
    sorts: ["reference", "hotelName", "checkIn", "status", "totalAmount", "createdAt"],
    pairs: [
      ["hotelId", "checkIn"],
      ["companyId", "checkIn"],
      ["customerId", "checkIn"],
      ["status", "totalAmount"],
    ],
  },

  invoices: {
    filters: ["status"],
    sorts: ["number", "issueDate", "dueDate", "status", "amountDue", "totalAmount"],
    pairs: [["customerId", "issueDate"]],
  },

  payments: {
    filters: ["method", "reconciled"],
    sorts: ["reference", "method", "receivedAt", "amount"],
    pairs: [["invoiceId", "receivedAt"]],
  },

  commissions: {
    filters: ["status"],
    sorts: ["periodMonth", "amount"],
  },

  users: {
    filters: ["role", "status"],
    sorts: ["name", "role", "lastSeenAt", "status", "createdAt"],
  },

  auditLogs: {
    filters: ["entityType", "action"],
    sorts: ["action", "actorName", "at"],
    // The reservation timeline: two equalities, then the sort.
    triples: [["entityType", "entityId", "at"]],
  },

  automationQueue: {
    filters: ["status", "type", "entityType"],
    sorts: ["createdAt", "processedAt", "status", "type"],
  },

  hotels: {
    filters: ["status", "category", "state"],
    sorts: ["name", "city", "totalRooms", "status", "starRating"],
  },

  roomTypes: { pairs: [["hotelId", "name"]] },
  seasons: { pairs: [["hotelId", "validFrom"]] },
  inventory: { pairs: [["hotelId", "date"]] },
  automationRuns: { pairs: [["workflowId", "startedAt"]] },
  notifications: { pairs: [["isRead", "at"]] },
};

const asc = (fieldPath) => ({ fieldPath, order: "ASCENDING" });

const indexes = [];
const seen = new Set();

function add(collectionGroup, fields) {
  // An equality on the same field it orders by needs no composite.
  if (new Set(fields).size !== fields.length) return;
  const key = `${collectionGroup}:${fields.join(",")}`;
  if (seen.has(key)) return;
  seen.add(key);
  indexes.push({
    collectionGroup,
    queryScope: "COLLECTION",
    fields: fields.map(asc),
  });
}

for (const [name, spec] of Object.entries(COLLECTIONS)) {
  const prefixes = [...(spec.scoped ?? []), ...(spec.filters ?? [])];

  for (const prefix of prefixes) {
    for (const sort of spec.sorts ?? []) add(name, [prefix, sort]);
  }

  /* ⚠️ A salesperson's list is scoped AND filtered at once — pick a
     status while scoped to yourself and the query carries two
     equalities before the sort. */
  for (const scope of spec.scoped ?? []) {
    for (const filter of spec.filters ?? []) {
      for (const sort of spec.sorts ?? []) add(name, [scope, filter, sort]);
    }
  }

  for (const pair of spec.pairs ?? []) add(name, pair);
  for (const triple of spec.triples ?? []) add(name, triple);
}

writeFileSync(
  "firestore.indexes.json",
  `${JSON.stringify({ indexes, fieldOverrides: [] }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${indexes.length} composite indexes to firestore.indexes.json`);
if (indexes.length > 200) {
  console.error(
    `⚠️ ${indexes.length} exceeds Firestore's 200-index limit. Trim a sortable column.`,
  );
  process.exit(1);
}
