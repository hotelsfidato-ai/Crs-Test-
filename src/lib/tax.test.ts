import { describe, expect, it } from "vitest";
import { computeTax, gstRateFor, GST_THRESHOLD } from "./tax";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GST BANDS

   The change with the most money attached to it. A wrong band here is
   a tax error on a real invoice, not a rounding difference, so the
   boundary and the mixed-band case are both pinned.
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

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
     â‚¹7,500 is the case a reading of the rule most easily gets wrong,
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
     A â‚¹6,000 Deluxe and a â‚¹9,000 Suite on one booking total â‚¹15,000;
     taxing that total at either single rate is wrong both ways. */
  it("splits a booking that spans both bands", () => {
    const result = computeTax([line(6_000), line(9_000)]);

    const bands = Object.fromEntries(result.byBand.map((b) => [b.rate, b]));
    expect(bands[0.05]!.tax).toBe(300);   // 5% of 6,000
    expect(bands[0.18]!.tax).toBe(1_620); // 18% of 9,000
    expect(result.taxAmount).toBe(1_920);

    // Taxing the â‚¹15,000 total at one rate gives 750 or 2,700 â€” both wrong.
    expect(result.taxAmount).not.toBe(750);
    expect(result.taxAmount).not.toBe(2_700);
  });

  it("bands on the per-night rate, not the line total", () => {
    // Three nights of a â‚¹6,000 room is â‚¹18,000, which is well over the
    // threshold â€” but the band follows the tariff, so it stays at 5%.
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
