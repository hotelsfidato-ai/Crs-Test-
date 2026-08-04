/* ══════════════════════════════════════════════════════════════════
   DOCUMENT DEFAULTS

   Fields every document of a given collection must carry, applied on
   the way IN (create, import) and again on the way OUT (every read).

   ⚠️ Why both. A missing ARRAY is not an empty one — `undefined.length`
   throws and takes the whole screen down as a blank white page, not a
   missing chip. TypeScript cannot help: the domain types say these
   fields are required, and Firestore returns whatever is actually
   stored, so the compiler is asserting something nobody enforced.

   ⚠️ Why on read as well as write. Not every document comes through a
   repository. A row typed into the Firebase console, written by n8n, or
   created before a field existed will still be missing it. Defaulting
   only on write protects new documents and leaves every older one able
   to crash a list.

   ⚠️ Read-side defaults never overwrite a stored value — they fill
   absent keys only. A stored empty string or 0 survives.
   ══════════════════════════════════════════════════════════════════ */

export const HOTEL_DEFAULTS: Record<string, unknown> = {
  roomMix: [],
  features: [],
  facilities: [],
  amenities: [],
  thingsToDo: [],
  distances: [],
  contacts: [],
  totalRooms: 0,
  starRating: 0,
  description: "",
  address: "",
  contactPerson: "",
  email: "",
  phone: "",
  country: "India",
  /* Copied onto every reservation for the property. Absent here means
     an undefined on the booking, which Firestore refuses. */
  name: "",
  shortName: "",
  city: "",
  state: "",
};

export const ROOM_TYPE_DEFAULTS: Record<string, unknown> = {
  amenities: [],
  totalRooms: 0,
  maxOccupancy: 2,
  maxExtraBeds: 0,
  sizeSqft: 0,
  description: "",
};

export const SEASON_DEFAULTS: Record<string, unknown> = {
  mealPlans: [],
  minNights: 1,
  cancellationPolicy: "",
  isActive: true,
};

/**
 * ⚠️ `negotiatedDiscountPercent` is the dangerous one here. The
 * reservation quote multiplies by it, and `undefined` becomes NaN that
 * propagates silently through the whole total — no crash, just a
 * booking worth "NaN".
 */
export const COMPANY_DEFAULTS: Record<string, unknown> = {
  legalName: "",
  industry: "",
  gstin: "",
  city: "",
  state: "",
  address: "",
  website: "",
  phone: "",
  email: "",
  notes: "",
  creditLimit: 0,
  creditUsed: 0,
  paymentTermDays: 0,
  negotiatedDiscountPercent: 0,
  totalReservations: 0,
  totalRevenue: 0,
  tier: "sme",
  status: "prospect",
};

/**
 * ⚠️ `email` and `phone` are here for a specific failure. Creating a
 * reservation copies them onto the booking's guest list, and Firestore
 * rejects a write containing undefined — so one customer saved without
 * a phone number made every booking for that customer abort with
 * "nothing was saved" and no usable reason.
 */
export const CUSTOMER_DEFAULTS: Record<string, unknown> = {
  preferences: [],
  fullName: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  notes: "",
  designation: "",
  vip: false,
  status: "lead",
  source: "direct",
  totalReservations: 0,
  totalRevenue: 0,
};

export const RESERVATION_DEFAULTS: Record<string, unknown> = {
  rooms: [],
  guests: [],
  totalRooms: 0,
  nights: 0,
  roomCharges: 0,
  extrasCharges: 0,
  discountAmount: 0,
  discountPercent: 0,
  taxAmount: 0,
  totalAmount: 0,
  specialRequests: "",
  internalNotes: "",
};

export const INVOICE_DEFAULTS: Record<string, unknown> = {
  lines: [],
  amountPaid: 0,
  amountDue: 0,
  totalAmount: 0,
  taxAmount: 0,
  subtotal: 0,
};

export const USER_DEFAULTS: Record<string, unknown> = {
  department: "",
  branch: "",
  status: "active",
};

/** Keyed by collection path, so the read helpers can look it up. */
export const DEFAULTS_BY_COLLECTION: Record<string, Record<string, unknown>> = {
  hotels: HOTEL_DEFAULTS,
  roomTypes: ROOM_TYPE_DEFAULTS,
  seasons: SEASON_DEFAULTS,
  companies: COMPANY_DEFAULTS,
  customers: CUSTOMER_DEFAULTS,
  reservations: RESERVATION_DEFAULTS,
  invoices: INVOICE_DEFAULTS,
  users: USER_DEFAULTS,
};

/**
 * Fills absent keys only.
 *
 * ⚠️ Uses `in`, not a falsy check. A stored `0`, `false` or `""` is a
 * real value and must survive — replacing them with the default would
 * turn a genuine zero rate into whatever the default happens to be.
 */
export function applyDefaults<T extends object>(
  value: T,
  defaults: Record<string, unknown> | undefined,
): T {
  if (!defaults) return value;
  const out = value as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!(key in out) || out[key] === undefined || out[key] === null) {
      // Fresh array per document — a shared one would be mutated across rows.
      out[key] = Array.isArray(fallback) ? [] : fallback;
    }
  }
  return out as T;
}
