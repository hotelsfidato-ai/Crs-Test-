/* ══════════════════════════════════════════════════════════════════
   FIRESTORE INDEX GENERATOR

       npm run indexes

   Writes firestore.indexes.json from src/data/queryPlan.ts — the same
   declaration the list screens read to decide which column headers are
   clickable. Neither can drift from the other.

   ⚠️ BOTH DIRECTIONS, ALWAYS. Firestore will not serve
   `orderBy(x, "desc")` from an ascending composite index. An ASC-only
   file looked complete, matched every query field for field, and every
   descending list still threw "The query requires an index". That is
   the bug this comment exists to stop recurring.

   ⚠️ THE BUDGET. Firestore allows 200 composite indexes per database
   and the count is (scopes + filters) × sorts × 2. Keep the sort lists
   in queryPlan.ts short; this script fails the build if the total goes
   over, rather than letting a deploy silently drop the excess.
   ══════════════════════════════════════════════════════════════════ */

import { writeFileSync } from "node:fs";
import { QUERY_PLAN } from "../src/data/queryPlan.ts";

const LIMIT = 200;

const indexes = [];
const seen = new Set();

const field = (fieldPath, dir) => ({
  fieldPath,
  order: dir === "desc" ? "DESCENDING" : "ASCENDING",
});

function add(collectionGroup, prefixes, sort, dir) {
  const paths = [...prefixes, sort];
  // An equality on the field being ordered by needs no composite.
  if (new Set(paths).size !== paths.length) return;

  const key = `${collectionGroup}:${prefixes.join(",")}|${sort}:${dir}`;
  if (seen.has(key)) return;
  seen.add(key);

  indexes.push({
    collectionGroup,
    queryScope: "COLLECTION",
    fields: [...prefixes.map((p) => field(p, "asc")), field(sort, dir)],
  });
}

for (const [name, plan] of Object.entries(QUERY_PLAN)) {
  const scopes = plan.scopes ?? [];
  const filters = plan.filters ?? [];
  const sorts = plan.sorts ?? [];

  for (const prefix of [...scopes, ...filters]) {
    for (const sort of sorts) {
      // Both directions — see the note at the top.
      add(name, [prefix], sort, "asc");
      add(name, [prefix], sort, "desc");
    }
  }

  /* A salesperson's list is scoped AND filtered at once: pick a status
     while scoped to yourself and the query carries two equalities. */
  for (const scope of scopes) {
    for (const filter of filters) {
      for (const sort of sorts) {
        add(name, [scope, filter], sort, "asc");
        add(name, [scope, filter], sort, "desc");
      }
    }
  }

  for (const [a, b, dir] of plan.pairs ?? []) add(name, [a], b, dir);
  for (const [a, b, c, dir] of plan.triples ?? []) add(name, [a, b], c, dir);
}

writeFileSync(
  "firestore.indexes.json",
  `${JSON.stringify({ indexes, fieldOverrides: [] }, null, 2)}\n`,
  "utf8",
);

const byCollection = {};
for (const i of indexes) {
  byCollection[i.collectionGroup] = (byCollection[i.collectionGroup] ?? 0) + 1;
}

console.log(`Wrote ${indexes.length} composite indexes (limit ${LIMIT})\n`);
for (const [name, count] of Object.entries(byCollection).sort()) {
  console.log(`  ${String(count).padStart(3)}  ${name}`);
}

if (indexes.length > LIMIT) {
  console.error(
    `\n⚠️ ${indexes.length} exceeds Firestore's ${LIMIT}-index limit.\n` +
      "Shorten a `sorts` list in src/data/queryPlan.ts — the screens will\n" +
      "stop offering that column automatically.",
  );
  process.exit(1);
}
