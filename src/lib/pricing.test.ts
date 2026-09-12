import { describe, expect, it } from "vitest";
import { priceBooking, lineTotal } from "./pricing";
import { splitGstInclusive } from "./tax";
import type { ReservationRoom } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   PRICING

   The owner's cases, as they were reported. Each one is a bill a guest
   or a company will read, so the totals are pinned to the paisa.
   ══════════════════════════════════════════════════════════════════ */

const room = (over: Partial<ReservationRoom> = {}): ReservationRoom => ({
  roomTypeId: "rt", roomTypeName: "Standard Room", mealPlan: "CP",
  quantity: 1, adults: 2, children: 0, extraBeds: 0,
  sellingRate: 0, extraBedRate: 0, childRate: 0,
  ...over,
});

/** A room entered with "Rates include GST": what the wizard saves. */
const inclusive = (rate: number, bed = 0, child = 0, over: Partial<ReservationRoom> = {}) => {
  const pre = (v: number) => {
    const s = splitGstInclusive(v);
    if ("error" in s) throw new Error(s.error);
    return s.base;
  };
  return room({
    extraBeds: bed ? 1 : 0,
    children: child ? 1 : 0,
    sellingRate: pre(rate),
    extraBedRate: pre(bed),
    childRate: pre(child),
    inclusiveRates: { sellingRate: rate, extraBedRate: bed, childRate: child },
    ...over,
  });
};

describe("priceBooking, rates including GST", () => {
  /* The screenshot: Room 1 at ₹6,500, Room 2 at ₹6,500 with a ₹1,500
     extra bed. It showed ₹14,501. */
  it("totals exactly what was typed: ₹6,500 + ₹6,500 + ₹1,500 bed is ₹14,500.00", () => {
    const price = priceBooking([inclusive(6500), inclusive(6500, 1500)], 1);
    expect(price.totalAmount).toBe(14_500);
    expect(price.roomCharges).toBe(13_809.53);
    expect(price.taxAmount).toBe(690.47);
    expect(price.taxByBand).toEqual([{ rate: 0.05, taxable: 13_809.53, tax: 690.47 }]);
  });

  it("totals exactly ₹14,500.00 for one room at ₹14,500", () => {
    const price = priceBooking([inclusive(14_500)], 1);
    expect(price.totalAmount).toBe(14_500);
    expect(price.roomCharges).toBe(12_288.14);
    expect(price.taxAmount).toBe(2_211.86);
  });

  /* ⚠️ The extra bed keeps its own 5% even beside an 18% room. */
  it("taxes an 18% room and its extra bed separately", () => {
    const price = priceBooking([inclusive(9_000, 1_500)], 1);
    expect(price.totalAmount).toBe(10_500);
    const bands = Object.fromEntries(price.taxByBand.map((b) => [b.rate, b]));
    expect(bands[0.18]!.taxable).toBe(7_627.12);
    expect(bands[0.05]!.taxable).toBe(1_428.57);
  });

  it("stays exact across nights and rooms", () => {
    const price = priceBooking([inclusive(14_500), inclusive(6_300, 1_200, 800)], 3);
    expect(price.totalAmount).toBe((14_500 + 6_300 + 1_200 + 800) * 3);
  });

  it("never takes a corporate discount off an inclusive rate", () => {
    const price = priceBooking([inclusive(6_500)], 1, 10);
    expect(price.discountAmount).toBe(0);
    expect(price.discountPercent).toBe(0);
    expect(price.totalAmount).toBe(6_500);
  });

  /* A sweep, in paise: whatever is typed is what is billed. */
  it("totals what was typed for every rate and extra bed in range", () => {
    for (let r = 1_000; r <= 20_000; r += 173) {
      if ("error" in splitGstInclusive(r)) continue;
      for (const bed of [0, 750, 1_500, 2_250]) {
        const price = priceBooking([inclusive(r, bed)], 2);
        expect(Math.round(price.totalAmount * 100), `₹${r} + ₹${bed}`).toBe((r + bed) * 2 * 100);
      }
    }
  });
});

describe("priceBooking, rates before tax", () => {
  it("adds 18% on the room and 5% on the extra bed", () => {
    const price = priceBooking([room({ sellingRate: 8_000, extraBeds: 1, extraBedRate: 1_500 })], 1);
    expect(price.taxAmount).toBe(1_440 + 75);
    expect(price.totalAmount).toBe(11_015);
  });

  it("keeps every figure to two decimals", () => {
    const price = priceBooking([room({ sellingRate: 6_190.5 })], 3);
    expect(price.roomCharges).toBe(18_571.5);
    expect(price.taxAmount).toBe(928.58); // 5% of 18,571.50 = 928.575
    expect(price.totalAmount).toBe(19_500.08);
  });

  it("takes the corporate discount off before tax", () => {
    const price = priceBooking([room({ sellingRate: 6_000 })], 1, 10);
    expect(price.discountAmount).toBe(600);
    expect(price.taxAmount).toBe(270);
    expect(price.totalAmount).toBe(5_670);
  });

  it("charges nothing for an extra the room does not have", () => {
    expect(lineTotal(room({ sellingRate: 5_000, extraBedRate: 1_000 }), 2)).toBe(10_000);
  });
});
