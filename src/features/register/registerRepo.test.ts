import { describe, expect, it, vi, beforeEach } from "vitest";

/* ══════════════════════════════════════════════════════════════════
   REGISTER REPORTING

   Two things are pinned here, and both produced wrong numbers on
   screen rather than errors.

   1. Paging past the server's row cap. PostgREST caps every response —
      Supabase ships with "Max rows" at 1,000 — and applies it silently.
      Asking for 10,000 rows returned 1,000 with a 200, so a "total
      revenue" was the sum of the first 1,000 of 6,626 rows and the
      properties dropdown listed whichever properties fell inside them.

   2. The folds themselves, which are pure and therefore cheap to hold
      to account.
   ══════════════════════════════════════════════════════════════════ */

/** Rows the fake server holds. Enough to need several pages. */
const TOTAL = 2_500;

/** What the fake PostgREST will send at most, whatever is asked for. */
let serverCap = 1_000;
let requests: { from: number; to: number }[] = [];

const dataset = Array.from({ length: TOTAL }, (_, i) => ({
  excel_row_num: i + 1,
  hotel_name: `Hotel ${i % 82}`,
  booking_done_by: `Booker ${i % 15}`,
  company_or_ta: i % 3 === 0 ? null : `Company ${i % 533}`,
  meal_plan: "EP",
  total_revenue: 100,
  room_nights: 2,
  amount_received: null,
  commission_amount: 0,
  booking_status_normalised: i % 10 === 0 ? "Cancelled" : "Confirmed",
  check_in_date: `2026-0${(i % 9) + 1}-15`,
  booking_date: "2026-01-01",
}));

vi.mock("./registerClient", () => {
  const builder = () => {
    const self: Record<string, unknown> = {};
    for (const method of ["select", "order", "eq", "gte", "lte", "or", "not", "limit"]) {
      self[method] = () => self;
    }
    self.range = (from: number, to: number) => {
      requests.push({ from, to });
      /* ⚠️ The cap is the point. The server sends min(asked, cap) rows
         and reports the TRUE total in count — exactly as PostgREST
         does, which is what makes a capped page distinguishable from
         the last page. */
      const asked = to - from + 1;
      const rows = dataset.slice(from, from + Math.min(asked, serverCap));
      return Promise.resolve({ data: rows, error: null, count: TOTAL });
    };
    return self;
  };
  return {
    registerDb: () => ({ from: () => builder() }),
    describeRegisterError: (e: unknown) => String(e),
  };
});

const {
  fetchReport, fetchFilterOptions, deriveTotals, deriveGrouped, deriveMonthly, distinctValues,
} = await import("./registerRepo");

beforeEach(() => {
  requests = [];
  serverCap = 1_000;
});

describe("reading past the server's row cap", () => {
  it("collects every row when the server caps each page", async () => {
    const report = await fetchReport({});

    expect(report.rows).toHaveLength(TOTAL);
    expect(report.total).toBe(TOTAL);
    expect(report.truncated).toBe(false);
    // 2,500 rows at 1,000 a page.
    expect(requests).toHaveLength(3);
  });

  /* ⚠️ The bug in one assertion. A single request asking for more than
     the cap does NOT return more than the cap, so anything folded from
     it describes a fraction of the register. */
  it("would have seen only the first page without paging", async () => {
    const first = dataset.slice(0, serverCap);
    expect(first).toHaveLength(1_000);
    expect(deriveTotals(first).bookings).not.toBe(TOTAL);
  });

  it("adapts when the cap is lower than the requested page size", async () => {
    serverCap = 250;
    const report = await fetchReport({});

    expect(report.rows).toHaveLength(TOTAL);
    expect(report.truncated).toBe(false);
    expect(requests).toHaveLength(10);
  });

  /* Each page must start where the last one ended. Overlapping ranges
     double-count revenue; gaps lose it. */
  it("walks contiguous ranges", async () => {
    serverCap = 400;
    await fetchReport({});

    let expected = 0;
    for (const r of requests) {
      expect(r.from).toBe(expected);
      expected += 400;
    }
  });

  /* Totals must equal the whole, not a sample. */
  it("totals the entire register", async () => {
    const report = await fetchReport({});
    expect(report.totals.bookings).toBe(TOTAL);
    expect(report.totals.revenue).toBe(TOTAL * 100);
    expect(report.totals.roomNights).toBe(TOTAL * 2);
    expect(report.totals.cancelled).toBe(TOTAL / 10);
  });
});

describe("filter options", () => {
  /* ⚠️ The reported fault. Built from one capped page the dropdowns
     were short, and which entries survived depended on which rows the
     server happened to send. */
  it("lists every property and booker in the register, not the first page", async () => {
    const options = await fetchFilterOptions();
    expect(options.hotels).toHaveLength(82);
    expect(options.bookers).toHaveLength(15);
  });

  it("fetches all three lists in a single scan", async () => {
    await fetchFilterOptions();
    expect(requests).toHaveLength(3); // pages, not one scan per dropdown
  });

  it("skips nulls and blanks rather than offering an empty option", () => {
    const rows = [
      { hotel_name: "Ayati" }, { hotel_name: null },
      { hotel_name: "   " }, { hotel_name: "Ayati" }, { hotel_name: "Centre Point" },
    ];
    expect(distinctValues(rows, "hotel_name", 10)).toEqual(["Ayati", "Centre Point"]);
  });

  it("orders by frequency, most used first", () => {
    const rows = [
      { c: "rare" }, { c: "common" }, { c: "common" }, { c: "common" }, { c: "mid" }, { c: "mid" },
    ];
    expect(distinctValues(rows, "c", 10)).toEqual(["common", "mid", "rare"]);
  });
});

describe("the folds", () => {
  it("groups by a column and ranks by revenue", () => {
    const rows = [
      { hotel_name: "A", total_revenue: 100, room_nights: 1 },
      { hotel_name: "B", total_revenue: 500, room_nights: 2 },
      { hotel_name: "A", total_revenue: 300, room_nights: 3 },
    ];
    // Ranked by revenue, so B's single 500 outranks A's two totalling 400.
    expect(deriveGrouped(rows, "hotel_name")).toEqual([
      { label: "B", bookings: 1, revenue: 500, roomNights: 2 },
      { label: "A", bookings: 2, revenue: 400, roomNights: 4 },
    ]);
  });

  it("drops rows with no value in the grouping column", () => {
    const rows = [
      { hotel_name: null, total_revenue: 900, room_nights: 1 },
      { hotel_name: "A", total_revenue: 100, room_nights: 1 },
    ];
    const out = deriveGrouped(rows, "hotel_name");
    expect(out).toHaveLength(1);
    expect(out[0]!.revenue).toBe(100);
  });

  it("buckets by month and returns them in order", () => {
    const rows = [
      { check_in_date: "2026-03-04", total_revenue: 10, room_nights: 1 },
      { check_in_date: "2026-01-31", total_revenue: 20, room_nights: 1 },
      { check_in_date: "2026-03-28", total_revenue: 30, room_nights: 1 },
    ];
    expect(deriveMonthly(rows, "check_in_date").map((m) => m.month))
      .toEqual(["2026-01", "2026-03"]);
    expect(deriveMonthly(rows, "check_in_date")[1]!.revenue).toBe(40);
  });

  /**
   * ⚠️ `amount_received` holds bank and UTR reference numbers alongside
   * real payments. Summing it gave 1.37 quadrillion against 7.2 crore
   * of revenue, so anything larger than the booking it belongs to is
   * counted as suspect rather than added.
   */
  it("refuses to add a payment larger than the booking", () => {
    const totals = deriveTotals([
      { total_revenue: 1_000, amount_received: 1_000 },
      { total_revenue: 1_000, amount_received: 900 },
      { total_revenue: 1_000, amount_received: 50_000_000 }, // a UTR reference
    ]);
    expect(totals.receivedPlausible).toBe(1_900);
    expect(totals.receivedSuspect).toBe(1);
  });

  it("allows 5% of slack for rounding and small overpayments", () => {
    const totals = deriveTotals([{ total_revenue: 1_000, amount_received: 1_040 }]);
    expect(totals.receivedPlausible).toBe(1_040);
    expect(totals.receivedSuspect).toBe(0);
  });
});
