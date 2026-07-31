import { describe, expect, it } from "vitest";
import { hasHotelConfirmation } from "@/data/repositories";
import { MEAL_PLANS, MEAL_PLAN_LABELS, MEAL_PLAN_SHORT } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   HOTEL CONFIRMATION

   Fidato does not own these properties. A booking with no proof the
   hotel accepted it is unusable at the front desk, so the rule is
   "any one of the three, but not none".
   ══════════════════════════════════════════════════════════════════ */

describe("hasHotelConfirmation", () => {
  it("accepts a confirmation number alone", () => {
    expect(hasHotelConfirmation({ hotelConfirmationNumber: "RES-88213" })).toBe(true);
  });

  it("accepts the name of who confirmed it alone", () => {
    expect(hasHotelConfirmation({ hotelRepName: "Priya, Front Office" })).toBe(true);
  });

  it("accepts a confirmation time alone", () => {
    expect(hasHotelConfirmation({ confirmedAt: "2026-08-12T14:30" })).toBe(true);
  });

  it("rejects an empty booking", () => {
    expect(hasHotelConfirmation({})).toBe(false);
  });

  /* ⚠️ Whitespace is the realistic near-miss: a field that looks filled
     in the form but carries nothing. */
  it("rejects whitespace in every field", () => {
    expect(
      hasHotelConfirmation({
        hotelConfirmationNumber: "   ",
        hotelRepName: "\t",
        confirmedAt: " ",
      }),
    ).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════
   MEAL PLANS
   ══════════════════════════════════════════════════════════════════ */

describe("meal plans", () => {
  it("offers all five the trade quotes", () => {
    expect(MEAL_PLANS).toEqual(["EP", "CP", "MAP", "AP", "ALL_INCLUSIVE"]);
  });

  it("names every one of them", () => {
    for (const plan of MEAL_PLANS) {
      expect(MEAL_PLAN_LABELS[plan], plan).toBeTruthy();
      expect(MEAL_PLAN_SHORT[plan], plan).toBeTruthy();
    }
  });

  /* ⚠️ ALL_INCLUSIVE is stored long but printed "AI". A voucher reading
     "ALL_INCLUSIVE" is the kind of thing a guest queries at check-in. */
  it("prints all-inclusive as AI", () => {
    expect(MEAL_PLAN_SHORT.ALL_INCLUSIVE).toBe("AI");
  });

  it("includes CP, which the trade calls bed and breakfast", () => {
    expect(MEAL_PLANS).toContain("CP");
    expect(MEAL_PLAN_LABELS.CP.toLowerCase()).toContain("breakfast");
  });
});
