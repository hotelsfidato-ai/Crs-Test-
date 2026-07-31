/* ══════════════════════════════════════════════════════════════════
   BUSINESS VOCABULARY

   The picklists the product offers. These were previously buried in
   the seed generator, which meant deleting the fake data would have
   deleted the industry list with it — they are not test data, they
   are the options a real user picks from.

   ⚠️ Every list is open. The forms that use these allow free text as
   well, because a picklist that cannot be escaped turns into a data
   quality problem the moment reality supplies an option nobody
   anticipated.
   ══════════════════════════════════════════════════════════════════ */

export const INDUSTRIES = [
  "Information Technology",
  "Pharmaceuticals",
  "Manufacturing",
  "Automotive",
  "Banking & Finance",
  "Logistics & Supply Chain",
  "Textiles",
  "FMCG",
  "Healthcare",
  "Real Estate",
  "Education",
  "Engineering & Construction",
  "Media & Entertainment",
  "Chemicals",
  "Retail",
  "Travel & Tourism",
] as const;

export const DESIGNATIONS = [
  "Procurement Manager",
  "Travel Desk Head",
  "HR Manager",
  "Admin Head",
  "Executive Assistant",
  "Operations Manager",
  "Regional Director",
  "Events Manager",
  "Finance Controller",
  "General Manager",
  "Founder",
  "Sales Director",
  "Programme Manager",
  "Facilities Manager",
] as const;

/**
 * Attached to a customer, then surfaced on every reservation for that
 * guest. This is the list that makes a repeat guest feel recognised,
 * so it is worth keeping specific to how people actually travel here.
 */
export const GUEST_PREFERENCES = [
  "High floor",
  "Non-smoking",
  "Late check-out",
  "Early check-in",
  "Twin beds",
  "King bed",
  "Airport pickup",
  "Vegetarian meals",
  "Jain meals",
  "Quiet room",
  "Away from lift",
  "Extra pillows",
  "Room with a view",
  "Ground floor",
  "Connecting rooms",
] as const;

/**
 * ⚠️ Required on every cancellation, and stored on the reservation.
 * Cancellations are the only way a booking leaves the book — BR-02
 * forbids deletion — so the reason is the entire audit story.
 */
export const CANCELLATION_REASONS = [
  "Guest cancelled the trip",
  "Corporate travel plan changed",
  "Duplicate booking raised in error",
  "Event postponed by the client",
  "Rate not approved by the client's finance team",
  "Guest found alternate accommodation",
  "Flight cancelled",
] as const;

export type Industry = (typeof INDUSTRIES)[number];
export type Designation = (typeof DESIGNATIONS)[number];
export type GuestPreference = (typeof GUEST_PREFERENCES)[number];
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];
