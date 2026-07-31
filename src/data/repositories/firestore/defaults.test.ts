import { describe, expect, it } from "vitest";
import {
  applyDefaults, DEFAULTS_BY_COLLECTION,
  HOTEL_DEFAULTS, CUSTOMER_DEFAULTS, COMPANY_DEFAULTS,
} from "./defaults";

/* ══════════════════════════════════════════════════════════════════
   DOCUMENT DEFAULTS

   These exist because of a real crash: a property created through the
   form had no `roomMix`, the list screen called `.length` on it, and
   the whole page went blank. TypeScript could not catch it — the Hotel
   type says `roomMix` is required, and Firestore returns whatever was
   actually written.

   The tests below pin the two things that make the fix correct: it
   fills what is missing, and it touches nothing that is present.
   ══════════════════════════════════════════════════════════════════ */

describe("applyDefaults", () => {
  it("fills a missing array so .length cannot throw", () => {
    const hotel = applyDefaults({ name: "New Property" }, HOTEL_DEFAULTS) as unknown as {
      roomMix: string[];
      amenities: string[];
    };
    expect(hotel.roomMix).toEqual([]);
    expect(hotel.amenities).toEqual([]);
    expect(() => hotel.roomMix.length).not.toThrow();
  });

  /* ⚠️ The failure mode this guards: a falsy check instead of `in`
     would silently replace a real 0 with the default. A hotel that
     genuinely has 0 rooms is not a hotel with unknown rooms. */
  it("never overwrites a stored value, including 0, false and empty string", () => {
    const stored = applyDefaults(
      { totalRooms: 0, description: "", country: "Nepal", roomMix: ["Deluxe"] },
      HOTEL_DEFAULTS,
    ) as Record<string, unknown>;

    expect(stored.totalRooms).toBe(0);
    expect(stored.description).toBe("");
    expect(stored.country).toBe("Nepal");
    expect(stored.roomMix).toEqual(["Deluxe"]);
  });

  it("replaces an explicit null, which Firestore can store", () => {
    const row = applyDefaults({ roomMix: null }, HOTEL_DEFAULTS) as unknown as { roomMix: string[] };
    expect(row.roomMix).toEqual([]);
  });

  /* ⚠️ A shared array literal would be mutated across every row that
     defaulted to it — push to one hotel's amenities and they all gain
     it. Each document must get its own. */
  it("gives every document its own array instance", () => {
    const a = applyDefaults({}, HOTEL_DEFAULTS) as unknown as { roomMix: string[] };
    const b = applyDefaults({}, HOTEL_DEFAULTS) as unknown as { roomMix: string[] };
    a.roomMix.push("Deluxe");
    expect(b.roomMix).toEqual([]);
  });

  it("is a no-op when the collection has no defaults", () => {
    const row = { anything: 1 };
    expect(applyDefaults(row, undefined)).toBe(row);
  });
});

/* ── The regression itself ─────────────────────────────────────────
   Every array field a screen dereferences, asserted present on a
   minimally-filled document of that collection.                     */

const ARRAYS_THE_UI_DEREFERENCES: Record<string, string[]> = {
  hotels: ["roomMix", "features", "facilities", "amenities", "thingsToDo", "distances", "contacts"],
  customers: ["preferences"],
  reservations: ["rooms", "guests"],
  invoices: ["lines"],
  seasons: ["mealPlans"],
  roomTypes: ["amenities"],
};

describe("a minimally-filled document never crashes a screen", () => {
  for (const [collectionName, fields] of Object.entries(ARRAYS_THE_UI_DEREFERENCES)) {
    it(`${collectionName}: every dereferenced array is present`, () => {
      const defaults = DEFAULTS_BY_COLLECTION[collectionName];
      expect(defaults, `${collectionName} has no registered defaults`).toBeDefined();

      // What a form or a spreadsheet realistically supplies: a name, nothing else.
      const document = applyDefaults({ name: "X" }, defaults) as Record<string, unknown>;

      for (const field of fields) {
        expect(Array.isArray(document[field]), `${collectionName}.${field}`).toBe(true);
      }
    });
  }
});

/* ⚠️ Not a crash — worse. `undefined * n` is NaN, and NaN propagates
   silently through the whole quote to produce a booking worth "NaN"
   with nothing thrown anywhere. */
describe("numbers that feed arithmetic", () => {
  it("defaults a company's negotiated discount to 0, not undefined", () => {
    const company = applyDefaults({ name: "Acme" }, COMPANY_DEFAULTS) as unknown as {
      negotiatedDiscountPercent: number;
    };
    expect(company.negotiatedDiscountPercent).toBe(0);
    expect(10_000 * (company.negotiatedDiscountPercent / 100)).toBe(0);
  });

  it("defaults customer roll-ups to 0 so sorting and totals work", () => {
    const customer = applyDefaults({ fullName: "A B" }, CUSTOMER_DEFAULTS) as unknown as {
      totalReservations: number;
      totalRevenue: number;
    };
    expect(customer.totalReservations).toBe(0);
    expect(customer.totalRevenue).toBe(0);
  });
});
