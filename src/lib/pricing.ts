import { computeTax, fromPaise, toPaise, type TaxBand } from "@/lib/tax";
import type { ReservationRoom } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   PRICING A BOOKING

   The one home for the arithmetic the wizard quotes and `create` saves,
   so a confirmed price can never differ from the quoted one. Pure, so
   it is tested without Firestore.

   ⚠️ A room line is three charges, each taxed on its own: the room at
   the room rate's band, the extra beds at the extra-bed rate's band,
   the children at the child rate's band. A ₹9,000 room with a ₹1,500
   extra bed is 18% on ₹9,000 and 5% on ₹1,500, never 18% on ₹10,500.

   ⚠️ Rates agreed inclusive of GST keep what was typed. The line holds
   the pre-tax figures for the invoice and the typed figures in
   `inclusiveRates`, and the tax is the difference, so ₹14,500 typed is
   ₹14,500.00 on the bill, not ₹14,501.
   ══════════════════════════════════════════════════════════════════ */

/** One charge on a room line, across the stay. */
export interface Charge {
  /** Per unit per night, before tax. Decides the band. */
  unitRate: number;
  /** Rooms, extra beds or children. */
  units: number;
  /** Before tax, across all units and nights, in paise. */
  basePaise: number;
  /** Including GST, across all units and nights, in paise. Only for inclusive rates. */
  inclusivePaise?: number;
}

/** A room line's charges: the room, its extra beds and its children. */
export function chargesOf(room: ReservationRoom, nights: number): Charge[] {
  const typed = room.inclusiveRates;
  return [
    { unitRate: room.sellingRate, units: room.quantity, inclusive: typed?.sellingRate },
    { unitRate: room.extraBedRate, units: room.extraBeds, inclusive: typed?.extraBedRate },
    { unitRate: room.childRate, units: room.children, inclusive: typed?.childRate },
  ]
    .filter((c) => c.units > 0 && c.unitRate > 0)
    .map((c) => ({
      unitRate: c.unitRate,
      units: c.units,
      basePaise: toPaise(c.unitRate) * c.units * nights,
      ...(c.inclusive !== undefined
        ? { inclusivePaise: toPaise(c.inclusive) * c.units * nights }
        : {}),
    }));
}

/** Pre-tax value of one room line across all rooms and nights. */
export function lineTotal(room: ReservationRoom, nights: number): number {
  return fromPaise(chargesOf(room, nights).reduce((s, c) => s + c.basePaise, 0));
}

export interface BookingPrice {
  roomCharges: number;
  discountPercent: number;
  discountAmount: number;
  taxAmount: number;
  /** One entry per GST band, for the quote, the folio and the voucher. */
  taxByBand: TaxBand[];
  /** Effective blended rate, for display only. */
  gstRate: number;
  totalAmount: number;
}

/** Prices a booking: every figure to the paisa, tax per charge. */
export function priceBooking(
  rooms: ReservationRoom[],
  nights: number,
  discountPercent = 0,
): BookingPrice {
  const charges = rooms.flatMap((r) => chargesOf(r, nights));
  const basePaise = charges.reduce((s, c) => s + c.basePaise, 0);

  /* ⚠️ The discount comes off charges priced before tax only. A rate
     agreed inclusive of GST is the final price, and taking the company's
     percentage off it as well would discount the same booking twice. */
  const discountable = charges
    .filter((c) => c.inclusivePaise === undefined)
    .reduce((s, c) => s + c.basePaise, 0);
  const discountPaise = Math.round((discountable * discountPercent) / 100);

  /* The discount reduces each charge proportionally, so the band each
     charge falls into is unaffected: the band follows the tariff. */
  const factor = discountable > 0 ? (discountable - discountPaise) / discountable : 1;

  const tax = computeTax(
    charges.map((c) =>
      c.inclusivePaise !== undefined
        ? {
            unitRate: c.unitRate,
            taxableAmount: fromPaise(c.basePaise),
            inclusiveAmount: fromPaise(c.inclusivePaise),
          }
        : {
            unitRate: c.unitRate,
            taxableAmount: fromPaise(Math.round(c.basePaise * factor)),
          },
    ),
  );

  return {
    roomCharges: fromPaise(basePaise),
    discountPercent: discountable > 0 ? discountPercent : 0,
    discountAmount: fromPaise(discountPaise),
    taxAmount: tax.taxAmount,
    taxByBand: tax.byBand,
    gstRate: tax.effectiveRate,
    totalAmount: fromPaise(basePaise - discountPaise + toPaise(tax.taxAmount)),
  };
}
