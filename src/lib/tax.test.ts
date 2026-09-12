import { describe, expect, it } from "vitest";
import { computeTax, gstRateFor, splitGstInclusive, GST_THRESHOLD } from "./tax";

/* ══════════════════════════════════════════════════════════════════
   GST BANDS

   The change with the most money attached to it. A wrong band here is
   a tax error on a real invoice, not a rounding difference, so the
   boundary and the mixed-band case are both pinned.
   ══════════════════════════════════════════════════════════════════ */

const line = (rate: number, quantity = 1, nights = 1) => ({
  sellingRate: rate,
  taxableAmount: rate * quantity * nights,
});

describe("gstRateFor", () => {
  it("charges 5% below the threshold", () => {
    expect(gstRateFor(6_000)).toBe(0.05);
  });

  it("charges 18% above the threshold", () => {
    expect(gstRateFor(9_000)).toBe(0.18);
  });

  /* âš ï¸ The rule is "at or above", not "above". A room at exactly
     ₹7,500 is the case a reading of the rule most easily gets wrong,
     and the one a hotel is most likely to price at. */
  it("charges 18% at exactly the threshold", () => {
    expect(gstRateFor(GST_THRESHOLD)).toBe(0.18);
    expect(gstRateFor(GST_THRESHOLD - 1)).toBe(0.05);
  });

  it("keeps historical folios on the old bands", () => {
    expect(gstRateFor(6_000, "legacy")).toBe(0.12);
    expect(gstRateFor(9_000, "legacy")).toBe(0.18);
  });
});

describe("computeTax", () => {
  it("taxes a single line at its own band", () => {
    const result = computeTax([line(6_000)]);
    expect(result.taxAmount).toBe(300);
    expect(result.byBand).toHaveLength(1);
  });

  /* âš ï¸ The reason tax is computed per line rather than on the total.
     A ₹6,000 Deluxe and a ₹9,000 Suite on one booking total ₹15,000;
     taxing that total at either single rate is wrong both ways. */
  it("splits a booking that spans both bands", () => {
    const result = computeTax([line(6_000), line(9_000)]);

    const bands = Object.fromEntries(result.byBand.map((b) => [b.rate, b]));
    expect(bands[0.05]!.tax).toBe(300);   // 5% of 6,000
    expect(bands[0.18]!.tax).toBe(1_620); // 18% of 9,000
    expect(result.taxAmount).toBe(1_920);

    // Taxing the ₹15,000 total at one rate gives 750 or 2,700 — both wrong.
    expect(result.taxAmount).not.toBe(750);
    expect(result.taxAmount).not.toBe(2_700);
  });

  it("bands on the per-night rate, not the line total", () => {
    // Three nights of a ₹6,000 room is ₹18,000, which is well over the
    // threshold — but the band follows the tariff, so it stays at 5%.
    const result = computeTax([line(6_000, 1, 3)]);
    expect(result.byBand).toHaveLength(1);
    expect(result.byBand[0]!.rate).toBe(0.05);
    expect(result.taxAmount).toBe(900);
  });

  it("returns nothing to charge on an empty booking", () => {
    const result = computeTax([]);
    expect(result.taxAmount).toBe(0);
    expect(result.byBand).toHaveLength(0);
  });
});

/* Negotiated rates that already include GST: the tax is taken out, not added. */
describe("splitGstInclusive", () => {
  const base = (p: number) => splitGstInclusive(p) as { base: number; rate: number };

  it("takes 5% out of an inclusive rate in the low band", () => {
    expect(base(5250)).toEqual({ base: 5000, rate: 0.05 });
  });

  it("takes 18% out of an inclusive rate in the high band", () => {
    expect(base(11800)).toEqual({ base: 10000, rate: 0.18 });
    expect(base(8850)).toEqual({ base: 7500, rate: 0.18 });
  });

  /* The band follows the pre-tax tariff, so the split must land back in
     the band it was taken at, or the invoice taxes it differently. */
  it("always lands in the band it was taken at", () => {
    for (let p = 500; p <= 30000; p += 37) {
      const split = splitGstInclusive(p);
      if ("error" in split) continue;
      expect(gstRateFor(split.base), `₹${p}`).toBe(split.rate);
    }
  });

  it("rounds a rate just under the threshold down, never into the high band", () => {
    const split = base(7874.99);
    expect(split.rate).toBe(0.05);
    expect(split.base).toBeLessThan(GST_THRESHOLD);
  });

  it("refuses an inclusive rate no pre-tax tariff can produce", () => {
    for (const p of [7875, 8000, 8849]) {
      expect(splitGstInclusive(p), `₹${p}`).toHaveProperty("error");
    }
  });

  /* What the salesperson typed is what the guest pays, give or take the
     rupee the per-line tax rounding can move it. */
  it("gives back the entered amount once the tax is added again", () => {
    for (const p of [1999, 3500, 5250, 7000, 9999, 12500]) {
      const { base: b, rate } = base(p);
      const nights = 3;
      const tax = computeTax([{ sellingRate: b, taxableAmount: b * nights }]).taxAmount;
      expect(Math.abs(b * nights + tax - p * nights), `₹${p}`).toBeLessThanOrEqual(1);
      expect(rate).toBe(gstRateFor(b));
    }
  });
});
