/* ══════════════════════════════════════════════════════════════════
   GST

   Indian GST on hotel accommodation is banded on the tariff **per room
   per night**, not on the booking total. A ten-night booking of a
   ₹4,000 room totals ₹40,000 and is still taxed at the lower band.

   ⚠️ A reservation may legitimately contain both bands — a ₹6,000
   Deluxe and a ₹9,000 Suite on the same booking. Tax must therefore be
   computed per line and summed. Computing it on the reservation total
   is a tax error, not a rounding difference.
   ══════════════════════════════════════════════════════════════════ */

/** Tariff at or above this attracts the higher band. */
export const GST_THRESHOLD = 7_500;

export const GST_LOW = 0.05;
export const GST_HIGH = 0.18;

/** Identifies which band table produced a stored tax figure. */
export type GstVersion = "legacy" | "2025-09";

/** The band table in force for new bookings. */
export const CURRENT_GST_VERSION: GstVersion = "2025-09";

/**
 * Historical rates, kept so an old folio remains explainable.
 * Reservations created before the change are never recomputed —
 * see docs/phase-2/01-scope-and-changes.md.
 */
const BANDS: Record<GstVersion, { low: number; high: number }> = {
  legacy: { low: 0.12, high: 0.18 },
  "2025-09": { low: GST_LOW, high: GST_HIGH },
};

/** The GST rate for one room line, from its per-night tariff. */
export function gstRateFor(
  perNightRate: number,
  version: GstVersion = CURRENT_GST_VERSION,
): number {
  const band = BANDS[version] ?? BANDS[CURRENT_GST_VERSION];
  return perNightRate >= GST_THRESHOLD ? band.high : band.low;
}

export interface TaxableLine {
  /** Per room per night, before tax. Decides the band. */
  sellingRate: number;
  /** The line's full pre-tax value across all rooms and nights. */
  taxableAmount: number;
}

export interface TaxBreakdown {
  taxAmount: number;
  /** Pre-tax value taxed at each band, for the invoice breakdown. */
  byBand: { rate: number; taxable: number; tax: number }[];
  /** Effective blended rate, for display only. Never for computation. */
  effectiveRate: number;
}

/** Computes tax per line and sums. The only correct way to tax a booking. */
export function computeTax(
  lines: TaxableLine[],
  version: GstVersion = CURRENT_GST_VERSION,
): TaxBreakdown {
  const buckets = new Map<number, { taxable: number; tax: number }>();

  for (const line of lines) {
    const rate = gstRateFor(line.sellingRate, version);
    const tax = Math.round(line.taxableAmount * rate);
    const bucket = buckets.get(rate) ?? { taxable: 0, tax: 0 };
    bucket.taxable += line.taxableAmount;
    bucket.tax += tax;
    buckets.set(rate, bucket);
  }

  const byBand = [...buckets.entries()]
    .map(([rate, b]) => ({ rate, taxable: b.taxable, tax: b.tax }))
    .sort((a, b) => a.rate - b.rate);

  const taxAmount = byBand.reduce((s, b) => s + b.tax, 0);
  const taxable = byBand.reduce((s, b) => s + b.taxable, 0);

  return {
    taxAmount,
    byBand,
    effectiveRate: taxable > 0 ? taxAmount / taxable : 0,
  };
}

/** "5%" / "18%" — for column headers and pill labels. */
export function gstLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
