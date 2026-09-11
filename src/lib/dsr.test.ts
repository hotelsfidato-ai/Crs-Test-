import { describe, expect, it } from "vitest";
import { canChangeDsr, dayKeyOf, dayOfIso, isoOfDay } from "./dsr";
import { companyNameKey } from "./companyName";

/* ══════════════════════════════════════════════════════════════════
   DSR RULES

   The "same day only" lock and the day arithmetic it rests on. Both
   are mirrored by firestore.rules; these pin the client half.
   ══════════════════════════════════════════════════════════════════ */

const TODAY = 20260910;

describe("who may change a DSR entry", () => {
  it("lets a salesperson change their own entry on the same day", () => {
    expect(canChangeDsr("salesperson", "haider", "haider", TODAY, TODAY)).toBe(true);
  });

  /* ⚠️ The owner's rule: after the day ends, the entry is the record. */
  it("locks a salesperson's own entry once the day has passed", () => {
    expect(canChangeDsr("salesperson", "haider", "haider", TODAY - 1, TODAY)).toBe(false);
  });

  it("never lets a salesperson change a colleague's report, even today", () => {
    expect(canChangeDsr("salesperson", "haider", "pijush", TODAY, TODAY)).toBe(false);
  });

  it("gives a manager the same same-day rule for their own report", () => {
    expect(canChangeDsr("manager", "m", "m", TODAY, TODAY)).toBe(true);
    expect(canChangeDsr("manager", "m", "m", TODAY - 1, TODAY)).toBe(false);
    expect(canChangeDsr("manager", "m", "haider", TODAY, TODAY)).toBe(false);
  });

  /* The desk corrects anyone's, any day. */
  it("lets the CRS desk, Admin and Owner correct any entry on any day", () => {
    for (const role of ["crs_manager", "admin", "owner"] as const) {
      expect(canChangeDsr(role, "desk", "haider", TODAY - 30, TODAY), role).toBe(true);
    }
  });

  it("gives finance and viewers nothing", () => {
    for (const role of ["finance", "viewer"] as const) {
      expect(canChangeDsr(role, "x", "x", TODAY, TODAY), role).toBe(false);
    }
  });
});

describe("day keys", () => {
  it("round-trips between yyyymmdd and a date input's value", () => {
    expect(isoOfDay(20260910)).toBe("2026-09-10");
    expect(dayOfIso("2026-09-10")).toBe(20260910);
    expect(Number.isNaN(dayOfIso("10/09/2026"))).toBe(true);
  });

  /* ⚠️ In India time. 20:00 UTC on the 9th is already 01:30 on the 10th
     in Pune — the rule's "today" is the 10th, so the screen's must be. */
  it("uses India time, not UTC, to decide what day it is", () => {
    expect(dayKeyOf(new Date("2026-09-09T20:00:00Z"))).toBe(20260910);
    expect(dayKeyOf(new Date("2026-09-09T18:00:00Z"))).toBe(20260909);
    expect(dayKeyOf(new Date("2026-09-09T18:30:00Z"))).toBe(20260910);
  });
});

describe("companyNameKey", () => {
  it("folds case, punctuation and the legal suffix", () => {
    expect(companyNameKey("SM ELECTRONIC TECHNOLOGIES PVT. LTD.")).toBe("sm electronic technologies");
    expect(companyNameKey("Varun Beverages Ltd")).toBe("varun beverages");
    expect(companyNameKey("VARUN BEVERAGES LIMITED")).toBe("varun beverages");
    expect(companyNameKey("Bonfiglioli Transmissions Pvt. Ltd.")).toBe("bonfiglioli transmissions");
    expect(companyNameKey("Taciti Consulting LLP")).toBe("taciti consulting");
  });

  /* ⚠️ Two different companies in the same DSR must stay two. */
  it("keeps apart names that differ by more than their legal form", () => {
    expect(companyNameKey("ABB India Ltd")).not.toBe(companyNameKey("ABB Robotics India Pvt. Ltd"));
  });

  it("treats & and 'and' as the same", () => {
    expect(companyNameKey("Mahindra & Mahindra Ltd")).toBe(companyNameKey("Mahindra and Mahindra"));
  });

  it("only strips legal forms from the end", () => {
    expect(companyNameKey("Company Secretaries LLP")).toBe("company secretaries");
    expect(companyNameKey("The Oberoi Group")).toBe("oberoi group");
  });

  /* Honest about the limit: a typo is not normalised away. The search
     lists both spellings so the salesperson can pick the existing one. */
  it("does not pretend to fix a typo", () => {
    expect(companyNameKey("SM ELECTRONIC TECHNOLOGIES PTVT. LTD."))
      .not.toBe(companyNameKey("SM ELECTRONIC TECHNOLOGIES PVT. LTD."));
  });
});
