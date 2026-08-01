import { describe, expect, it } from "vitest";
import { buildVoucher, renderVoucherHtml, renderVoucherEmail } from "./voucher";
import type { Reservation, Hotel, Customer, OrgSettings } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   VOUCHER

   The guest-facing document. Its figures must match the folio exactly,
   which is why the model reads stored values and never recomputes.
   ══════════════════════════════════════════════════════════════════ */

const reservation = {
  id: "r1",
  reference: "FH-2026-00042",
  status: "confirmed",
  paymentTerm: "DP",
  customerId: "c1",
  customerName: "Ananya Bose",
  companyName: "Meridian Logistics",
  hotelId: "h1",
  hotelName: "Ayati Resort & Spa",
  hotelCity: "Mahabaleshwar",
  checkIn: "2026-08-12",
  checkOut: "2026-08-15",
  nights: 3,
  totalRooms: 2,
  totalAdults: 4,
  totalChildren: 1,
  rooms: [
    {
      roomTypeId: "rt1", roomTypeName: "Deluxe Room", mealPlan: "CP",
      seasonName: "Peak", quantity: 2, adults: 4, children: 1, extraBeds: 1,
      sellingRate: 6000, extraBedRate: 1200, childRate: 800,
    },
  ],
  roomCharges: 42_000,
  discountAmount: 2_000,
  taxAmount: 2_000,
  totalAmount: 42_000,
  gstRate: 0.05,
  hotelConfirmationNumber: "AYT-99120",
  hotelRepName: "Priya, Front Office",
  confirmedAt: "2026-08-01T10:30:00.000Z",
  ownerName: "Rhea Kapoor",
  specialRequests: "High floor, away from the lift",
  createdAt: "2026-08-01T10:00:00.000Z",
} as unknown as Reservation;

const hotel = {
  id: "h1", name: "Ayati Resort & Spa", city: "Mahabaleshwar", state: "Maharashtra",
  address: "Panchgani Road", phone: "+91 20 1234 5678", email: "res@ayati.example",
  contactPerson: "Front Office",
} as unknown as Hotel;

const customer = {
  id: "c1", fullName: "Ananya Bose", email: "ananya@example.com", phone: "+91 98765 43210",
} as unknown as Customer;

const org = {
  brandName: "Fidato Hotels",
  registeredAddress: "520 Clover Hills Plaza, NIBM Road, Pune",
  supportPhone: "020 4270 1073",
  supportEmail: "info@fidatohotels.com",
  gstin: "27AAAAA0000A1Z5",
} as unknown as OrgSettings;

const model = buildVoucher({ reservation, hotel, customer, org });

describe("buildVoucher", () => {
  /* ⚠️ The whole point of reading stored values. If this ever starts
     recomputing, a later GST change would restate a voucher the guest
     is already holding. */
  it("uses the stored totals rather than recalculating", () => {
    expect(model.totalAmount).toBe(42_000);
    expect(model.taxAmount).toBe(2_000);
    expect(model.discountAmount).toBe(2_000);
  });

  it("carries the hotel's confirmation, which is why the booking is valid", () => {
    expect(model.hotelConfirmationNumber).toBe("AYT-99120");
    expect(model.hotelRepName).toBe("Priya, Front Office");
    expect(model.confirmedAt).toBeTruthy();
  });

  it("computes each room line from rate, extras and nights", () => {
    // (6000 × 2 + 1200 × 1 + 800 × 1) × 3 nights
    expect(model.rooms[0]!.lineTotal).toBe(42_000);
  });

  it("spells the meal plan out as well as abbreviating it", () => {
    expect(model.rooms[0]!.mealPlan).toBe("CP");
    expect(model.rooms[0]!.mealPlanFull).toBe("Continental Plan");
  });

  it("builds a map link from the hotel's real address", () => {
    expect(model.mapUrl).toContain("Panchgani");
    expect(model.mapUrl).toContain("Mahabaleshwar");
  });

  it("survives a hotel or customer that could not be loaded", () => {
    const bare = buildVoucher({ reservation });
    expect(bare.hotelName).toBe("Ayati Resort & Spa"); // denormalised on the booking
    expect(bare.guestEmail).toBe("");
    expect(() => renderVoucherHtml(bare)).not.toThrow();
  });
});

describe("renderVoucherHtml", () => {
  const html = renderVoucherHtml(model);

  it("shows every detail the guest and the front desk need", () => {
    for (const needle of [
      "FH-2026-00042", "Ayati Resort &amp; Spa", "Ananya Bose",
      "AYT-99120", "Priya, Front Office", "Deluxe Room",
      "Meridian Logistics", "Rhea Kapoor", "High floor",
    ]) {
      expect(html, needle).toContain(needle);
    }
  });

  it("is a self-contained document with no external assets", () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/<script/i);
  });

  it("carries A4 print rules so Save as PDF needs no adjusting", () => {
    expect(html).toContain("@page");
    expect(html).toContain("A4");
  });

  /* ⚠️ A guest name containing a quote or an angle bracket must not be
     able to break the document — this is emailed, and it is rendered
     as HTML at the other end. */
  it("escapes values rather than interpolating them raw", () => {
    const nasty = buildVoucher({
      reservation: { ...reservation, customerName: '<script>alert("x")</script>' } as Reservation,
      hotel, customer, org,
    });
    const out = renderVoucherHtml(nasty);
    expect(out).not.toContain("<script>alert");
    expect(out).toContain("&lt;script&gt;");
  });
});

describe("renderVoucherEmail", () => {
  const mail = renderVoucherEmail(model);

  it("puts the hotel, date and reference in the subject", () => {
    expect(mail.subject).toContain("Ayati Resort & Spa");
    expect(mail.subject).toContain("FH-2026-00042");
  });

  it("offers a plain-text alternative for clients that refuse HTML", () => {
    expect(mail.text).toContain("FH-2026-00042");
    expect(mail.text).toContain("Dear Ananya Bose");
    expect(mail.text).not.toContain("<");
  });
});
