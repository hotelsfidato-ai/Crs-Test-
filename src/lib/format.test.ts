import { describe, expect, it } from "vitest";
import {
  dateShort, dateCompact, dateLong, dateTime, timeOnly, relative,
  nights, nightsLabel, isoDate, isValidDate, NO_DATE,
} from "./format";

/* ══════════════════════════════════════════════════════════════════
   DATE FORMATTERS

   These tests exist because of a real crash. A user row with a missing
   `lastSeenAt` threw `RangeError: Invalid time value` inside a table
   cell, React unmounted the tree, and the entire Users screen went
   blank — no message, nothing to click.

   ⚠️ The rule is absolute: a formatter must NEVER throw. A missing
   date rendered as "—" is correct and readable. A missing date that
   destroys the screen is neither.
   ══════════════════════════════════════════════════════════════════ */

const BAD_INPUTS: unknown[] = [
  undefined,
  null,
  "",
  "not a date",
  "0000-00-00",
  NaN,
  new Date("nonsense"),
];

const FORMATTERS: [string, (v: never) => string][] = [
  ["dateShort", dateShort],
  ["dateCompact", dateCompact],
  ["dateLong", dateLong],
  ["dateTime", dateTime],
  ["timeOnly", timeOnly],
  ["relative", relative],
];

describe("every date formatter is total", () => {
  for (const [name, fn] of FORMATTERS) {
    it(`${name} returns a placeholder instead of throwing`, () => {
      for (const input of BAD_INPUTS) {
        expect(() => fn(input as never), `${name}(${String(input)})`).not.toThrow();
        expect(fn(input as never), `${name}(${String(input)})`).toBe(NO_DATE);
      }
    });
  }

  it("still formats a real date correctly", () => {
    expect(dateShort("2026-08-12")).toBe("12 Aug 2026");
    expect(dateCompact("2026-08-12")).toBe("12 Aug");
    expect(dateShort(new Date("2026-08-12T00:00:00"))).toBe("12 Aug 2026");
  });
});

/* ⚠️ The quieter sibling of the crash: NaN does not throw, it spreads.
   A NaN night count multiplies into every total on the folio and the
   voucher, and nothing anywhere reports a problem. */
describe("nights", () => {
  it("counts a real stay", () => {
    expect(nights("2026-08-12", "2026-08-15")).toBe(3);
    expect(nightsLabel("2026-08-12", "2026-08-13")).toBe("1 night");
  });

  it("returns 0 rather than NaN when a date is missing", () => {
    for (const input of BAD_INPUTS) {
      expect(nights(input as never, "2026-08-15")).toBe(0);
      expect(nights("2026-08-12", input as never)).toBe(0);
    }
  });
});

describe("isoDate", () => {
  it("formats a date for storage", () => {
    expect(isoDate(new Date("2026-08-12T10:00:00"))).toBe("2026-08-12");
  });

  it("returns an empty string for a bad value, never a crash", () => {
    for (const input of BAD_INPUTS) {
      expect(() => isoDate(input as never)).not.toThrow();
      expect(isoDate(input as never)).toBe("");
    }
  });
});

describe("isValidDate", () => {
  it("separates real dates from the rest", () => {
    expect(isValidDate("2026-08-12")).toBe(true);
    expect(isValidDate(new Date())).toBe(true);
    for (const input of BAD_INPUTS) {
      expect(isValidDate(input as never), String(input)).toBe(false);
    }
  });
});
