import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { QUERY_PLAN, isSortable, defaultSort } from "@/data/queryPlan";

/* ══════════════════════════════════════════════════════════════════
   FIRESTORE INDEX COVERAGE

   ⚠️ These tests exist because of two live failures, in order:

   1. The file was derived from each repository's defaultSort, but the
      SCREENS override that — customers sorts by lastActivityAt, not
      fullName. It matched the repository exactly and still threw.

   2. The regenerated file emitted ASCENDING only, on the assumption
      that Firestore reads an index backwards. It does not for this
      shape: `orderBy(x, "desc")` needs a DESCENDING composite. Every
      descending list still threw, which is every default list view.

   So direction is asserted explicitly below. An index that exists in
   the wrong direction is the same as no index at all.
   ══════════════════════════════════════════════════════════════════ */

interface IndexDef {
  collectionGroup: string;
  fields: { fieldPath: string; order: string }[];
}

const file = JSON.parse(readFileSync("firestore.indexes.json", "utf8")) as {
  indexes: IndexDef[];
};

function has(collection: string, prefixes: string[], sort: string, dir: "asc" | "desc") {
  const want = [...prefixes, sort];
  const order = dir === "desc" ? "DESCENDING" : "ASCENDING";
  return file.indexes.some(
    (i) =>
      i.collectionGroup === collection &&
      i.fields.length === want.length &&
      i.fields.every((f, n) => f.fieldPath === want[n]) &&
      i.fields[i.fields.length - 1]!.order === order,
  );
}

describe("every sort is indexed in BOTH directions", () => {
  for (const [collection, plan] of Object.entries(QUERY_PLAN)) {
    const prefixes = [...(plan.scopes ?? []), ...(plan.filters ?? [])];
    if (!plan.sorts?.length || !prefixes.length) continue;

    it(`${collection}`, () => {
      for (const prefix of prefixes) {
        for (const sort of plan.sorts!) {
          if (prefix === sort) continue;
          expect(has(collection, [prefix], sort, "asc"), `${prefix}+${sort} ASC`).toBe(true);
          expect(has(collection, [prefix], sort, "desc"), `${prefix}+${sort} DESC`).toBe(true);
        }
      }
    });
  }
});

/* The exact queries that failed on the live site. */
describe("the queries that broke in production", () => {
  it("a salesperson's customer list, newest activity first", () => {
    expect(has("customers", ["ownerId"], "lastActivityAt", "desc")).toBe(true);
  });

  it("a salesperson's company list, highest revenue first", () => {
    expect(has("companies", ["ownerId"], "totalRevenue", "desc")).toBe(true);
  });

  it("a salesperson's reservation list, newest stay first", () => {
    expect(has("reservations", ["ownerId"], "checkIn", "desc")).toBe(true);
  });

  /* ⚠️ The queue sorted by startedAt, which a queue event does not
     have. Firestore excludes documents missing the orderBy field, so
     it returned nothing and looked permanently empty. */
  it("the automation queue sorts by a field its documents carry", () => {
    expect(defaultSort("automationQueue").by).toBe("createdAt");
    expect(has("automationQueue", ["status"], "createdAt", "desc")).toBe(true);
  });
});

describe("a scoped list that is also filtered", () => {
  it("is indexed for customers and companies", () => {
    expect(has("customers", ["ownerId", "status"], "lastActivityAt", "desc")).toBe(true);
    expect(has("companies", ["ownerId", "status"], "totalRevenue", "desc")).toBe(true);
  });
});

describe("relation queries the repositories issue directly", () => {
  it("are covered in the direction each uses", () => {
    expect(has("roomTypes", ["hotelId"], "name", "asc")).toBe(true);
    expect(has("seasons", ["hotelId"], "validFrom", "desc")).toBe(true);
    expect(has("reservations", ["hotelId"], "checkIn", "desc")).toBe(true);
    expect(has("reservations", ["customerId"], "checkIn", "desc")).toBe(true);
    expect(has("customers", ["companyId"], "fullName", "asc")).toBe(true);
    expect(has("payments", ["invoiceId"], "receivedAt", "desc")).toBe(true);
  });
});

/* ⚠️ The guard that keeps the interface honest: a header is only
   clickable because an index for it exists. */
describe("isSortable agrees with the generated file", () => {
  it("says no to a column with no index", () => {
    expect(isSortable("customers", "ownerName")).toBe(false);
    expect(isSortable("users", "createdAt")).toBe(false);
  });

  it("says yes to each planned sort", () => {
    expect(isSortable("customers", "lastActivityAt")).toBe(true);
    expect(isSortable("companies", "totalRevenue")).toBe(true);
  });
});

describe("the file itself", () => {
  it("stays within Firestore's 200 composite index limit", () => {
    expect(file.indexes.length).toBeLessThanOrEqual(200);
  });

  it("contains no duplicates", () => {
    const keys = file.indexes.map(
      (i) => `${i.collectionGroup}:${i.fields.map((f) => `${f.fieldPath}:${f.order}`).join(",")}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
