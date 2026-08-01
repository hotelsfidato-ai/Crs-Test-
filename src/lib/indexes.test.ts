import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════
   FIRESTORE INDEX COVERAGE

   ⚠️ This is the check that would have caught the live failure.

   The hand-written index file was derived from each repository's
   `defaultSort`, but the screens override it — the customers list
   sorts by lastActivityAt, not fullName. So the file matched the
   repository exactly and still threw "The query requires an index"
   the moment a salesperson opened their own customer list.

   These tests assert the generated file covers what the screens
   actually ask for, so the two cannot drift apart again.
   ══════════════════════════════════════════════════════════════════ */

interface IndexDef {
  collectionGroup: string;
  fields: { fieldPath: string; order: string }[];
}

const file = JSON.parse(readFileSync("firestore.indexes.json", "utf8")) as {
  indexes: IndexDef[];
};

const has = (collection: string, ...fields: string[]) =>
  file.indexes.some(
    (i) =>
      i.collectionGroup === collection &&
      i.fields.length === fields.length &&
      i.fields.every((f, n) => f.fieldPath === fields[n]),
  );

/** Exactly what each list screen's default view queries. */
const SCREEN_DEFAULTS: [string, string, string][] = [
  // [collection, scope-or-filter, the screen's default sort]
  ["customers", "ownerId", "lastActivityAt"],
  ["companies", "ownerId", "totalRevenue"],
  ["reservations", "ownerId", "checkIn"],
  ["hotels", "status", "name"],
  ["invoices", "status", "issueDate"],
  ["payments", "method", "receivedAt"],
  ["users", "role", "name"],
  ["auditLogs", "entityType", "at"],
  ["automationQueue", "status", "createdAt"],
];

describe("a salesperson's default list view is indexed", () => {
  for (const [collection, scope, sort] of SCREEN_DEFAULTS) {
    it(`${collection}: ${scope} + ${sort}`, () => {
      expect(has(collection, scope, sort)).toBe(true);
    });
  }
});

describe("every sortable column is indexed for a scoped salesperson", () => {
  const SORTABLE: Record<string, string[]> = {
    customers: [
      "fullName", "status", "totalReservations", "totalRevenue",
      "ownerName", "lastActivityAt",
    ],
    companies: [
      "name", "tier", "status", "totalReservations", "totalRevenue",
      "ownerName", "lastActivityAt",
    ],
    reservations: ["reference", "hotelName", "checkIn", "status", "totalAmount"],
  };

  for (const [collection, sorts] of Object.entries(SORTABLE)) {
    it(`${collection} covers all ${sorts.length} sortable columns`, () => {
      for (const sort of sorts) {
        expect(has(collection, "ownerId", sort), `${collection} ownerId+${sort}`).toBe(true);
      }
    });
  }
});

describe("the relation queries the repositories issue directly", () => {
  it("covers each one", () => {
    expect(has("roomTypes", "hotelId", "name")).toBe(true);
    expect(has("seasons", "hotelId", "validFrom")).toBe(true);
    expect(has("reservations", "hotelId", "checkIn")).toBe(true);
    expect(has("reservations", "customerId", "checkIn")).toBe(true);
    expect(has("customers", "companyId", "fullName")).toBe(true);
    expect(has("payments", "invoiceId", "receivedAt")).toBe(true);
    expect(has("auditLogs", "entityType", "entityId", "at")).toBe(true);
  });
});

describe("the file itself", () => {
  it("stays under Firestore's 200 composite index limit", () => {
    expect(file.indexes.length).toBeLessThanOrEqual(200);
  });

  it("contains no duplicates", () => {
    const keys = file.indexes.map(
      (i) => `${i.collectionGroup}:${i.fields.map((f) => f.fieldPath).join(",")}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
