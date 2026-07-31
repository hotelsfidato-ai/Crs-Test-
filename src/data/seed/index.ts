import { addDays, subDays, subMonths, formatISO } from "date-fns";
import { createRandom } from "./random";
import { SEED_HOTELS } from "./hotels.data";
import {
  FIRST_NAMES, LAST_NAMES, COMPANY_PREFIXES, COMPANY_SUFFIXES, LEGAL_SUFFIXES,
  INDUSTRIES, DESIGNATIONS, GUEST_PREFERENCES, SPECIAL_REQUESTS,
  CANCELLATION_REASONS, INTERNAL_NOTES, AVATAR_COLORS,
} from "./names";
import { isoDate } from "@/lib/format";
import type { Role } from "@/lib/permissions";
import type {
  Hotel, RoomType, RatePlan, Company, Customer, Reservation, ReservationRoom,
  Invoice, Payment, Commission, User, AuditLog, AppNotification,
  NotificationTemplate, AutomationWorkflow, AutomationRun, Integration,
  OrgSettings, ReservationStatus, MealPlan, HotelCategory, HotelStatus,
  BookingChannel, CustomerSource, CompanyTier,
} from "../types";

/* The one fixed seed the whole dataset derives from. */
const SEED = 20260728;

/** "Today" is pinned so relative data (arrivals, overdue invoices) is stable. */
export const TODAY = new Date(2026, 6, 28);

const rng = createRandom(SEED);
const ts = (d: Date) => formatISO(d);

/* ══════════════════════════════════════════════════════════════════
   USERS — 24 across all eight roles
   ══════════════════════════════════════════════════════════════════ */

const SALES_TEAM_SIZE = 8;

function buildUsers(): User[] {
  const spec: { role: Role; count: number; department: string }[] = [
    { role: "super_admin", count: 1, department: "Technology" },
    { role: "admin", count: 2, department: "Operations" },
    { role: "sales_manager", count: 2, department: "Sales" },
    { role: "salesperson", count: SALES_TEAM_SIZE, department: "Sales" },
    { role: "hotel_manager", count: 5, department: "Property Operations" },
    { role: "finance", count: 3, department: "Finance" },
    { role: "support", count: 2, department: "Guest Support" },
    { role: "viewer", count: 1, department: "Leadership" },
  ];

  const users: User[] = [];
  let n = 0;
  let hotelCursor = 0;

  for (const { role, count, department } of spec) {
    for (let i = 0; i < count; i++) {
      const first = FIRST_NAMES[n % FIRST_NAMES.length]!;
      const last = LAST_NAMES[(n * 7 + 3) % LAST_NAMES.length]!;
      const name = `${first} ${last}`;
      const hotel = role === "hotel_manager" ? SEED_HOTELS[hotelCursor++ % SEED_HOTELS.length]! : undefined;
      const created = subMonths(TODAY, rng.int(6, 30));

      users.push({
        id: `usr-${String(n + 1).padStart(3, "0")}`,
        name,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@fidatohotels.com`,
        phone: `+9198${rng.int(10000000, 99999999)}`,
        role,
        hotelId: hotel?.id,
        hotelName: hotel?.name,
        department,
        isActive: rng.bool(0.94),
        lastSeenAt: ts(subDays(TODAY, rng.int(0, 9))),
        avatarColor: AVATAR_COLORS[n % AVATAR_COLORS.length]!,
        createdAt: ts(created),
        createdBy: "system",
        updatedAt: ts(subDays(TODAY, rng.int(1, 60))),
        updatedBy: "system",
      });
      n++;
    }
  }
  return users;
}

export const users = buildUsers();

const salespeople = users.filter((u) => u.role === "salesperson");
const systemUser = users.find((u) => u.role === "super_admin")!;
const approvers = users.filter((u) => u.role === "sales_manager" || u.role === "admin");

/** The identity the role switcher assumes for each role. */
export function defaultUserForRole(role: Role): User {
  return users.find((u) => u.role === role) ?? systemUser;
}

/* ══════════════════════════════════════════════════════════════════
   HOTELS — real portfolio, wrapped in the domain type
   ══════════════════════════════════════════════════════════════════ */

const hotelManagers = users.filter((u) => u.role === "hotel_manager");

export const hotels: Hotel[] = SEED_HOTELS.map((h, i) => {
  const onboarded = subMonths(TODAY, rng.int(4, 40));
  const manager = hotelManagers.find((m) => m.hotelId === h.id);
  return {
    id: h.id,
    name: h.name,
    shortName: h.shortName,
    city: h.city,
    state: h.state,
    address: h.address,
    category: h.category as HotelCategory,
    status: h.status as HotelStatus,
    starRating: h.starRating,
    totalRooms: h.totalRooms,
    description: h.description,
    roomMix: h.roomMix,
    features: h.features,
    facilities: h.facilities,
    amenities: h.amenities,
    thingsToDo: h.thingsToDo,
    distances: h.distances,
    contacts: [
      {
        name: `${FIRST_NAMES[(i * 5) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 3) % LAST_NAMES.length]}`,
        designation: "General Manager",
        email: `gm@${h.id.replace(/^htl-/, "").replace(/-/g, "")}.example.com`,
        phone: `+9198${rng.int(10000000, 99999999)}`,
      },
      {
        name: `${FIRST_NAMES[(i * 11 + 4) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 5 + 2) % LAST_NAMES.length]}`,
        designation: "Reservations Manager",
        email: `reservations@${h.id.replace(/^htl-/, "").replace(/-/g, "")}.example.com`,
        phone: `+9198${rng.int(10000000, 99999999)}`,
      },
    ],
    managerId: manager?.id,
    commissionPercent: h.commissionPercent,
    onboardedAt: isoDate(onboarded),
    createdAt: ts(onboarded),
    createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, rng.int(2, 120))),
    updatedBy: systemUser.id,
  };
});

const hotelById = new Map(hotels.map((h) => [h.id, h]));

/* ══════════════════════════════════════════════════════════════════
   ROOM TYPES — derived from each property's real room mix
   ══════════════════════════════════════════════════════════════════ */

/** Base rate anchored to star rating and room-type keywords. */
function rateFor(star: number, typeName: string): number {
  const base = [0, 1800, 2400, 3200, 5200, 8500][star] ?? 3200;
  const n = typeName.toLowerCase();
  let multiplier = 1;
  if (n.includes("suite")) multiplier = 1.9;
  else if (n.includes("villa") || n.includes("bhk")) multiplier = 2.2;
  else if (n.includes("premium") || n.includes("club")) multiplier = 1.45;
  else if (n.includes("executive") || n.includes("business")) multiplier = 1.3;
  else if (n.includes("superior")) multiplier = 1.2;
  else if (n.includes("cottage")) multiplier = 1.35;
  return Math.round((base * multiplier) / 100) * 100;
}

export const roomTypes: RoomType[] = [];

for (const hotel of hotels) {
  const seed = SEED_HOTELS.find((h) => h.id === hotel.id)!;
  seed.roomTypes.forEach((rt, idx) => {
    const rate = rateFor(hotel.starRating, rt.name);
    roomTypes.push({
      id: `rmt-${hotel.id.replace(/^htl-/, "")}-${idx + 1}`,
      hotelId: hotel.id,
      hotelName: hotel.name,
      name: rt.name,
      code: rt.name.split(" ").map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 4),
      description: `${rt.name} at ${hotel.name}, ${hotel.city}.`,
      totalRooms: rt.count,
      maxOccupancy: rt.name.toLowerCase().includes("suite") || rt.name.toLowerCase().includes("bhk") ? 4 : rng.int(2, 3),
      baseRate: rate,
      extraAdultRate: Math.round(rate * 0.25 / 100) * 100,
      amenities: rng.sample(
        ["Air conditioning", "Wi-Fi", "Mini bar", "Tea/coffee maker", "Work desk",
          "Safe", "Television", "Hair dryer", "Bathtub", "Balcony"], rng.int(4, 7),
      ),
      sizeSqft: rng.int(180, 520),
      createdAt: hotel.createdAt,
      createdBy: systemUser.id,
      updatedAt: hotel.updatedAt,
      updatedBy: systemUser.id,
    });
  });
}

const roomTypesByHotel = new Map<string, RoomType[]>();
for (const rt of roomTypes) {
  const list = roomTypesByHotel.get(rt.hotelId) ?? [];
  list.push(rt);
  roomTypesByHotel.set(rt.hotelId, list);
}

/* ══════════════════════════════════════════════════════════════════
   RATE PLANS — a season grid per room type
   ══════════════════════════════════════════════════════════════════ */

const MEAL_PLANS: { plan: MealPlan; label: string; uplift: number }[] = [
  { plan: "EP", label: "Room Only", uplift: 1 },
  { plan: "CP", label: "Bed & Breakfast", uplift: 1.12 },
  { plan: "MAP", label: "Half Board", uplift: 1.28 },
  { plan: "AP", label: "Full Board", uplift: 1.44 },
];

const SEASONS = [
  { name: "Peak Season", from: "2026-10-01", to: "2027-02-28", factor: 1.25, minNights: 2 },
  { name: "Shoulder Season", from: "2026-03-01", to: "2026-06-30", factor: 1.0, minNights: 1 },
  { name: "Monsoon Saver", from: "2026-07-01", to: "2026-09-30", factor: 0.82, minNights: 1 },
];

const CANCELLATION_POLICIES = [
  "Free cancellation up to 48 hours before check-in.",
  "Free cancellation up to 7 days before check-in. One night charged thereafter.",
  "Non-refundable. Full amount charged at the time of booking.",
  "Free cancellation up to 24 hours before check-in.",
];

export const ratePlans: RatePlan[] = [];

for (const hotel of hotels) {
  const types = roomTypesByHotel.get(hotel.id) ?? [];
  for (const rt of types) {
    // Two meal plans and two seasons per room type keeps the grid readable.
    const meals = rng.sample(MEAL_PLANS, 2);
    const seasons = rng.sample(SEASONS, 2);
    for (const meal of meals) {
      for (const season of seasons) {
        ratePlans.push({
          id: `rpl-${rt.id.replace(/^rmt-/, "")}-${meal.plan}-${season.name.split(" ")[0]!.toLowerCase()}`,
          hotelId: hotel.id,
          hotelName: hotel.name,
          roomTypeId: rt.id,
          roomTypeName: rt.name,
          name: `${meal.label} — ${season.name}`,
          code: `${rt.code}-${meal.plan}`,
          mealPlan: meal.plan,
          rate: Math.round((rt.baseRate * meal.uplift * season.factor) / 100) * 100,
          validFrom: season.from,
          validTo: season.to,
          minNights: season.minNights,
          cancellationPolicy: rng.pick(CANCELLATION_POLICIES),
          isActive: hotel.status === "active",
          createdAt: hotel.createdAt,
          createdBy: systemUser.id,
          updatedAt: hotel.updatedAt,
          updatedBy: systemUser.id,
        });
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   COMPANIES — 40 corporate accounts
   ══════════════════════════════════════════════════════════════════ */

const CITY_POOL = [...new Set(hotels.map((h) => h.city))];

export const companies: Company[] = Array.from({ length: 40 }, (_, i) => {
  const prefix = COMPANY_PREFIXES[i % COMPANY_PREFIXES.length]!;
  const suffix = COMPANY_SUFFIXES[(i * 3 + 1) % COMPANY_SUFFIXES.length]!;
  const name = `${prefix} ${suffix}`;
  const owner = salespeople[i % salespeople.length]!;
  const city = rng.pick(CITY_POOL);
  const tier = rng.weighted<CompanyTier>([
    ["corporate", 5], ["sme", 4], ["key_account", 2], ["travel_agent", 2],
  ]);
  const status = rng.weighted<Company["status"]>([["active", 7], ["prospect", 2], ["dormant", 1]]);
  const creditLimit = rng.money(200_000, 3_000_000, 50_000);
  const created = subMonths(TODAY, rng.int(3, 34));

  return {
    id: `cmp-${String(i + 1).padStart(3, "0")}`,
    name,
    legalName: `${name} ${rng.pick(LEGAL_SUFFIXES)}`,
    tier,
    status,
    industry: rng.pick(INDUSTRIES),
    gstin: `27${prefix.slice(0, 3).toUpperCase()}${rng.int(1000, 9999)}${String.fromCharCode(65 + (i % 26))}1Z${rng.int(1, 9)}`,
    city,
    state: hotels.find((h) => h.city === city)?.state ?? "Maharashtra",
    address: `${rng.int(1, 400)}, ${rng.pick(["Tech Park", "Business Bay", "Industrial Estate", "Corporate Centre"])}, ${city}`,
    website: `www.${prefix.toLowerCase()}${suffix.split(" ")[0]!.toLowerCase()}.com`,
    phone: `+9122${rng.int(10000000, 99999999)}`,
    email: `travel@${prefix.toLowerCase()}.com`,
    ownerId: owner.id,
    ownerName: owner.name,
    creditLimit,
    creditUsed: Math.round(creditLimit * (rng.next() * 0.7) / 1000) * 1000,
    paymentTermDays: rng.pick([15, 30, 45, 60]),
    contractStart: isoDate(subMonths(TODAY, rng.int(1, 18))),
    contractEnd: isoDate(addDays(TODAY, rng.int(30, 500))),
    negotiatedDiscountPercent: tier === "key_account" ? rng.int(10, 18) : rng.int(0, 9),
    totalReservations: 0,
    totalRevenue: 0,
    lastActivityAt: ts(subDays(TODAY, rng.int(0, 45))),
    notes: rng.pick(INTERNAL_NOTES),
    createdAt: ts(created),
    createdBy: owner.id,
    updatedAt: ts(subDays(TODAY, rng.int(1, 30))),
    updatedBy: owner.id,
  };
});

/* ══════════════════════════════════════════════════════════════════
   CUSTOMERS — 180, most attached to a company
   ══════════════════════════════════════════════════════════════════ */

export const customers: Customer[] = Array.from({ length: 180 }, (_, i) => {
  const first = FIRST_NAMES[(i * 5) % FIRST_NAMES.length]!;
  const last = LAST_NAMES[(i * 3 + 7) % LAST_NAMES.length]!;
  const fullName = `${first} ${last}`;
  const company = rng.bool(0.68) ? companies[rng.int(0, companies.length - 1)]! : undefined;
  const owner = company
    ? users.find((u) => u.id === company.ownerId)!
    : salespeople[i % salespeople.length]!;
  const city = company?.city ?? rng.pick(CITY_POOL);
  const created = subMonths(TODAY, rng.int(1, 30));

  return {
    id: `cus-${String(i + 1).padStart(3, "0")}`,
    firstName: first,
    lastName: last,
    fullName,
    // Index suffix guarantees uniqueness — the duplicate-detection screen
    // introduces deliberate collisions separately.
    email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@${company ? company.website.replace("www.", "") : "gmail.com"}`,
    phone: `+9198${String(rng.int(10000000, 99999999))}`,
    status: rng.weighted<Customer["status"]>([["active", 6], ["lead", 3], ["inactive", 1]]),
    source: rng.weighted<CustomerSource>([
      ["corporate", 5], ["direct", 4], ["referral", 3],
      ["website", 3], ["ota", 2], ["walk_in", 1], ["campaign", 1],
    ]),
    companyId: company?.id,
    companyName: company?.name,
    designation: company ? rng.pick(DESIGNATIONS) : undefined,
    city,
    state: hotels.find((h) => h.city === city)?.state ?? "Maharashtra",
    ownerId: owner.id,
    ownerName: owner.name,
    preferences: rng.sample(GUEST_PREFERENCES, rng.int(0, 4)),
    vip: rng.bool(0.09),
    totalReservations: 0,
    totalRevenue: 0,
    lastActivityAt: ts(subDays(TODAY, rng.int(0, 60))),
    notes: rng.pick(INTERNAL_NOTES),
    createdAt: ts(created),
    createdBy: owner.id,
    updatedAt: ts(subDays(TODAY, rng.int(1, 40))),
    updatedBy: owner.id,
  };
});

/* Deliberate near-duplicates so /crm/merge has something real to find. */
const DUPLICATE_SOURCES = [3, 17, 42, 88];
for (const idx of DUPLICATE_SOURCES) {
  const original = customers[idx]!;
  const n = customers.length + 1;
  customers.push({
    ...original,
    id: `cus-${String(n).padStart(3, "0")}`,
    // Same person, entered again from a different channel.
    email: original.email.replace(/(\d+)@/, "@").replace("@", `.${original.lastName.toLowerCase()}@`),
    phone: original.phone,
    source: "website",
    companyId: undefined,
    companyName: undefined,
    designation: undefined,
    totalReservations: 0,
    totalRevenue: 0,
    preferences: [],
    notes: "Created from the website enquiry form.",
    createdAt: ts(subDays(TODAY, rng.int(5, 90))),
    updatedAt: ts(subDays(TODAY, rng.int(1, 20))),
  });
}

const customerById = new Map(customers.map((c) => [c.id, c]));
const companyById = new Map(companies.map((c) => [c.id, c]));

/* ══════════════════════════════════════════════════════════════════
   RESERVATIONS — 320 across a 14-month window
   ══════════════════════════════════════════════════════════════════ */

const CHANNELS: readonly (readonly [BookingChannel, number])[] = [
  ["direct_sales", 5], ["corporate", 5], ["travel_agent", 3],
  ["website", 3], ["phone", 2], ["walk_in", 1],
];

/** Status follows from the dates — past stays complete, future ones don't. */
function statusForDates(checkIn: Date, checkOut: Date, total: number): ReservationStatus {
  const past = checkOut < TODAY;
  const inHouse = checkIn <= TODAY && checkOut >= TODAY;

  if (past) {
    return rng.weighted<ReservationStatus>([
      ["completed", 12], ["cancelled", 2], ["no_show", 1],
    ]);
  }
  if (inHouse) return "checked_in";
  if (total >= 50_000 && rng.bool(0.45)) return "pending_approval";
  return rng.weighted<ReservationStatus>([
    ["confirmed", 8], ["draft", 1], ["cancelled", 1],
  ]);
}

let reservationCounter = 4200;

function buildReservation(index: number): Reservation {
  const hotel = hotels[rng.int(0, hotels.length - 1)]!;
  const types = roomTypesByHotel.get(hotel.id) ?? [];
  const customer = customers[rng.int(0, customers.length - 1)]!;
  const company = customer.companyId ? companyById.get(customer.companyId) : undefined;
  const owner = users.find((u) => u.id === customer.ownerId) ?? salespeople[0]!;

  // Spread across 11 months back and 5 months forward. At ~1,100
  // reservations that is roughly three arrivals a day across the
  // portfolio, so any given day has something happening on it —
  // which is what a 32-property book actually looks like.
  const offset = rng.int(-330, 150);
  const checkIn = addDays(TODAY, offset);
  const nights = rng.weighted([[1, 4], [2, 5], [3, 4], [4, 2], [5, 1], [7, 1]]);
  const checkOut = addDays(checkIn, nights);

  const roomCount = rng.weighted([[1, 6], [2, 4], [3, 2], [5, 1], [8, 1]]);
  const chosen = rng.sample(types.length ? types : roomTypes.slice(0, 3), Math.min(rng.int(1, 2), types.length || 1));

  const rooms: ReservationRoom[] = chosen.map((rt, i) => {
    const plan = ratePlans.find((p) => p.roomTypeId === rt.id);
    const qty = i === 0 ? Math.max(1, roomCount - (chosen.length - 1)) : 1;
    return {
      roomTypeId: rt.id,
      roomTypeName: rt.name,
      ratePlanId: plan?.id ?? `rpl-${rt.id}`,
      ratePlanName: plan?.name ?? "Room Only — Shoulder Season",
      mealPlan: plan?.mealPlan ?? "EP",
      quantity: qty,
      ratePerNight: plan?.rate ?? rt.baseRate,
      adults: rng.int(1, 2),
      children: rng.bool(0.2) ? 1 : 0,
    };
  });

  const totalRooms = rooms.reduce((s, r) => s + r.quantity, 0);
  const roomCharges = rooms.reduce((s, r) => s + r.ratePerNight * r.quantity * nights, 0);
  const extrasCharges = rng.bool(0.35) ? rng.money(1_000, 18_000, 500) : 0;
  const discountPercent = company?.negotiatedDiscountPercent ?? 0;
  const discountAmount = Math.round((roomCharges * discountPercent) / 100);
  const taxable = roomCharges + extrasCharges - discountAmount;
  // Indian hotel GST: 12% below ₹7,500 per night, 18% at or above.
  const perNight = totalRooms > 0 ? roomCharges / totalRooms / nights : 0;
  const taxAmount = Math.round(taxable * (perNight >= 7500 ? 0.18 : 0.12));
  const totalAmount = taxable + taxAmount;

  const status = statusForDates(checkIn, checkOut, totalAmount);
  const needsApproval = totalAmount >= 50_000;
  // Booked some weeks before arrival — but never in the future. A
  // forward booking was necessarily raised on or before today.
  const leadTime = subDays(checkIn, rng.int(3, 60));
  const created = leadTime > TODAY ? subDays(TODAY, rng.int(0, 21)) : leadTime;
  const approver = approvers[rng.int(0, approvers.length - 1)]!;

  const guests = [
    { name: customer.fullName, email: customer.email, phone: customer.phone, isPrimary: true },
    ...(totalRooms > 1
      ? [{
          name: `${FIRST_NAMES[(index * 7) % FIRST_NAMES.length]} ${LAST_NAMES[(index * 5) % LAST_NAMES.length]}`,
          isPrimary: false,
        }]
      : []),
  ];

  reservationCounter += rng.int(1, 4);

  const isApproved = needsApproval && (status === "confirmed" || status === "checked_in" || status === "completed");
  const isCancelled = status === "cancelled";

  return {
    id: `res-${String(index + 1).padStart(4, "0")}`,
    reference: `FH-2026-${String(reservationCounter).padStart(5, "0")}`,
    status,
    channel: rng.weighted(CHANNELS),
    customerId: customer.id,
    customerName: customer.fullName,
    companyId: company?.id,
    companyName: company?.name,
    hotelId: hotel.id,
    hotelName: hotel.name,
    hotelCity: hotel.city,
    checkIn: isoDate(checkIn),
    checkOut: isoDate(checkOut),
    nights,
    rooms,
    guests,
    totalRooms,
    totalAdults: rooms.reduce((s, r) => s + r.adults * r.quantity, 0),
    totalChildren: rooms.reduce((s, r) => s + r.children * r.quantity, 0),
    roomCharges,
    extrasCharges,
    discountAmount,
    taxAmount,
    totalAmount,
    ownerId: owner.id,
    ownerName: owner.name,
    requiresApproval: needsApproval,
    approvedBy: isApproved ? approver.name : undefined,
    approvedAt: isApproved ? ts(addDays(created, 1)) : undefined,
    approvalNote: isApproved ? "Approved — within the account's negotiated band." : undefined,
    cancelledAt: isCancelled ? ts(subDays(checkIn, rng.int(1, 14))) : undefined,
    cancelledBy: isCancelled ? owner.name : undefined,
    cancellationReason: isCancelled ? rng.pick(CANCELLATION_REASONS) : undefined,
    specialRequests: rng.pick(SPECIAL_REQUESTS),
    internalNotes: rng.pick(INTERNAL_NOTES),
    createdAt: ts(created),
    createdBy: owner.id,
    updatedAt: ts(subDays(TODAY, rng.int(0, 30))),
    updatedBy: owner.id,
  };
}

export const reservations: Reservation[] = Array.from({ length: 1100 }, (_, i) => buildReservation(i));

/* Roll up the denormalised counters the list screens read. */
for (const r of reservations) {
  if (r.status === "cancelled" || r.status === "draft") continue;
  const c = customerById.get(r.customerId);
  if (c) {
    c.totalReservations += 1;
    c.totalRevenue += r.totalAmount;
    if (r.status === "completed" && (!c.lastStayAt || r.checkOut > c.lastStayAt)) {
      c.lastStayAt = ts(new Date(r.checkOut));
    }
  }
  if (r.companyId) {
    const co = companyById.get(r.companyId);
    if (co) {
      co.totalReservations += 1;
      co.totalRevenue += r.totalAmount;
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   INVOICES & PAYMENTS
   ══════════════════════════════════════════════════════════════════ */

const billable = reservations.filter(
  (r) => r.status === "completed" || r.status === "checked_in" || r.status === "confirmed",
);

export const invoices: Invoice[] = billable.slice(0, 150).map((r, i) => {
  const issue = new Date(r.checkOut);
  const company = r.companyId ? companyById.get(r.companyId) : undefined;
  const dueDate = addDays(issue, company?.paymentTermDays ?? 15);

  const lines = [
    {
      description: `Accommodation — ${r.rooms[0]?.roomTypeName ?? "Room"} × ${r.totalRooms} × ${r.nights} nights`,
      quantity: r.totalRooms * r.nights,
      unitPrice: r.rooms[0]?.ratePerNight ?? 0,
      amount: r.roomCharges,
      taxPercent: 12,
    },
    ...(r.extrasCharges
      ? [{
          description: "Food, beverage & incidentals",
          quantity: 1,
          unitPrice: r.extrasCharges,
          amount: r.extrasCharges,
          taxPercent: 5,
        }]
      : []),
  ];

  const isPast = issue < TODAY;
  const overdue = isPast && dueDate < TODAY;
  const status = r.status === "completed"
    ? rng.weighted<Invoice["status"]>(
        overdue ? [["paid", 5], ["overdue", 3], ["partially_paid", 2]] : [["paid", 6], ["sent", 3], ["partially_paid", 1]],
      )
    : rng.weighted<Invoice["status"]>([["sent", 3], ["draft", 2]]);

  const amountPaid =
    status === "paid" ? r.totalAmount
      : status === "partially_paid" ? Math.round(r.totalAmount * 0.5 / 100) * 100
        : 0;

  return {
    id: `inv-${String(i + 1).padStart(4, "0")}`,
    number: `FH/INV/26-27/${String(1000 + i)}`,
    status,
    reservationId: r.id,
    reservationReference: r.reference,
    customerId: r.customerId,
    customerName: r.customerName,
    companyId: r.companyId,
    companyName: r.companyName,
    hotelId: r.hotelId,
    hotelName: r.hotelName,
    issueDate: isoDate(issue),
    dueDate: isoDate(dueDate),
    lines,
    subtotal: r.roomCharges + r.extrasCharges - r.discountAmount,
    taxAmount: r.taxAmount,
    totalAmount: r.totalAmount,
    amountPaid,
    amountDue: r.totalAmount - amountPaid,
    notes: company ? `Billed to ${company.legalName}. GSTIN ${company.gstin}.` : "",
    createdAt: ts(issue),
    createdBy: users.find((u) => u.role === "finance")!.id,
    updatedAt: ts(subDays(TODAY, rng.int(0, 30))),
    updatedBy: users.find((u) => u.role === "finance")!.id,
  };
});

/* Link invoices back onto their reservations. */
const invoiceByReservation = new Map(invoices.map((inv) => [inv.reservationId, inv]));
for (const r of reservations) {
  const inv = invoiceByReservation.get(r.id);
  if (inv) r.invoiceId = inv.id;
}

export const payments: Payment[] = invoices
  .filter((inv) => inv.amountPaid > 0)
  .map((inv, i) => ({
    id: `pay-${String(i + 1).padStart(4, "0")}`,
    reference: `RCPT-${String(50000 + i)}`,
    invoiceId: inv.id,
    invoiceNumber: inv.number,
    customerId: inv.customerId,
    customerName: inv.customerName,
    amount: inv.amountPaid,
    method: rng.weighted<Payment["method"]>([
      ["bank_transfer", 6], ["upi", 4], ["card", 3], ["cheque", 2], ["cash", 1],
    ]),
    receivedAt: ts(addDays(new Date(inv.issueDate), rng.int(1, 40))),
    reconciled: rng.bool(0.85),
    note: "",
    createdAt: ts(addDays(new Date(inv.issueDate), rng.int(1, 40))),
    createdBy: users.find((u) => u.role === "finance")!.id,
    updatedAt: ts(subDays(TODAY, rng.int(0, 20))),
    updatedBy: users.find((u) => u.role === "finance")!.id,
  }));

export const commissions: Commission[] = reservations
  .filter((r) => r.status === "completed")
  .map((r, i) => {
    const hotel = hotelById.get(r.hotelId)!;
    const amount = Math.round((r.roomCharges * hotel.commissionPercent) / 100);
    return {
      id: `com-${String(i + 1).padStart(4, "0")}`,
      reservationId: r.id,
      reservationReference: r.reference,
      hotelId: r.hotelId,
      hotelName: r.hotelName,
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      bookingValue: r.roomCharges,
      percent: hotel.commissionPercent,
      amount,
      status: rng.weighted<Commission["status"]>([["paid", 5], ["approved", 3], ["accrued", 2]]),
      periodMonth: r.checkOut.slice(0, 7),
      createdAt: ts(new Date(r.checkOut)),
      createdBy: systemUser.id,
      updatedAt: ts(subDays(TODAY, rng.int(0, 30))),
      updatedBy: systemUser.id,
    };
  });

/* ══════════════════════════════════════════════════════════════════
   AUDIT LOG — the trail every detail screen shows
   ══════════════════════════════════════════════════════════════════ */

export const auditLogs: AuditLog[] = [];

let auditId = 0;
function addAudit(entry: Omit<AuditLog, "id">) {
  auditLogs.push({ id: `aud-${String(++auditId).padStart(5, "0")}`, ...entry });
}

for (const r of reservations) {
  const actor = users.find((u) => u.id === r.ownerId) ?? systemUser;

  addAudit({
    entityType: "reservation", entityId: r.id, entityLabel: r.reference,
    action: "created",
    summary: `Reservation created for ${r.customerName} at ${r.hotelName}`,
    detail: `${r.totalRooms} room(s), ${r.nights} night(s), check-in ${r.checkIn}`,
    actorId: actor.id, actorName: actor.name, actorRole: actor.role, at: r.createdAt,
  });

  if (r.requiresApproval) {
    addAudit({
      entityType: "reservation", entityId: r.id, entityLabel: r.reference,
      action: "status_changed",
      summary: "Routed to approval — booking value is at or above ₹50,000",
      actorId: "system", actorName: "Automation", actorRole: "super_admin",
      at: ts(addDays(new Date(r.createdAt), 0)),
    });
  }

  if (r.approvedAt) {
    addAudit({
      entityType: "reservation", entityId: r.id, entityLabel: r.reference,
      action: "approved", summary: `Approved by ${r.approvedBy}`,
      detail: r.approvalNote,
      actorId: "usr-004", actorName: r.approvedBy ?? "Sales Manager",
      actorRole: "sales_manager", at: r.approvedAt,
    });
  }

  if (r.cancelledAt) {
    addAudit({
      entityType: "reservation", entityId: r.id, entityLabel: r.reference,
      action: "cancelled", summary: `Cancelled — ${r.cancellationReason}`,
      actorId: actor.id, actorName: actor.name, actorRole: actor.role, at: r.cancelledAt,
    });
  }

  if (r.status === "completed") {
    addAudit({
      entityType: "reservation", entityId: r.id, entityLabel: r.reference,
      action: "status_changed", summary: "Stay completed and folio closed",
      actorId: "system", actorName: "Automation", actorRole: "super_admin",
      at: ts(new Date(r.checkOut)),
    });
  }
}

for (const inv of invoices.slice(0, 60)) {
  const actor = users.find((u) => u.role === "finance")!;
  addAudit({
    entityType: "invoice", entityId: inv.id, entityLabel: inv.number,
    action: "created", summary: `Invoice raised for ${inv.customerName}`,
    detail: `Reservation ${inv.reservationReference}`,
    actorId: actor.id, actorName: actor.name, actorRole: actor.role, at: inv.createdAt,
  });
}

auditLogs.sort((a, b) => (a.at < b.at ? 1 : -1));

/* ══════════════════════════════════════════════════════════════════
   NOTIFICATIONS
   ══════════════════════════════════════════════════════════════════ */

const pendingApprovals = reservations.filter((r) => r.status === "pending_approval");
const arrivingToday = reservations.filter((r) => r.checkIn === isoDate(TODAY));
const overdueInvoices = invoices.filter((i) => i.status === "overdue");

export const notifications: AppNotification[] = [
  ...pendingApprovals.slice(0, 5).map((r, i) => ({
    id: `ntf-a${i}`,
    title: "Approval required",
    body: `${r.reference} for ${r.customerName} at ${r.hotelName} is awaiting your approval.`,
    category: "approval" as const,
    channel: "in_app" as const,
    isRead: i > 1,
    actorName: r.ownerName,
    link: `/reservations/${r.id}`,
    at: ts(subDays(TODAY, i)),
  })),
  ...arrivingToday.slice(0, 3).map((r, i) => ({
    id: `ntf-b${i}`,
    title: "Arrival today",
    body: `${r.customerName} checks in at ${r.hotelName} today — ${r.totalRooms} room(s).`,
    category: "reservation" as const,
    channel: "in_app" as const,
    isRead: false,
    link: `/reservations/${r.id}`,
    at: ts(subDays(TODAY, 0)),
  })),
  ...overdueInvoices.slice(0, 4).map((inv, i) => ({
    id: `ntf-c${i}`,
    title: "Invoice overdue",
    body: `${inv.number} for ${inv.companyName ?? inv.customerName} is past its due date.`,
    category: "payment" as const,
    channel: "email" as const,
    isRead: i > 2,
    link: `/finance/invoices/${inv.id}`,
    at: ts(subDays(TODAY, i + 1)),
  })),
  {
    id: "ntf-d0",
    title: "Automation failed",
    body: "Confirmation email for FH-2026-04310 could not be delivered — mailbox full.",
    category: "automation" as const,
    channel: "in_app" as const,
    isRead: false,
    link: "/automation/runs",
    at: ts(subDays(TODAY, 1)),
  },
  {
    id: "ntf-d1",
    title: "New property onboarded",
    body: "De Mandarin Resort, Goa has completed onboarding and is live for bookings.",
    category: "system" as const,
    channel: "in_app" as const,
    isRead: true,
    link: "/hotels",
    at: ts(subDays(TODAY, 4)),
  },
].sort((a, b) => (a.at < b.at ? 1 : -1));

export const notificationTemplates: NotificationTemplate[] = [
  {
    id: "tpl-001", name: "Reservation confirmation", event: "reservation.confirmed",
    channel: "email", subject: "Your Fidato booking {{reference}} is confirmed",
    body: "Dear {{customerName}},\n\nYour stay at {{hotelName}} from {{checkIn}} to {{checkOut}} is confirmed.\n\nReservation: {{reference}}\nRooms: {{totalRooms}}\nTotal: {{totalAmount}}\n\nWe look forward to welcoming you.\n\nFidato Hotels",
    isActive: true,
    variables: ["customerName", "hotelName", "checkIn", "checkOut", "reference", "totalRooms", "totalAmount"],
    createdAt: ts(subMonths(TODAY, 14)), createdBy: systemUser.id,
    updatedAt: ts(subMonths(TODAY, 2)), updatedBy: systemUser.id,
  },
  {
    id: "tpl-002", name: "Approval requested", event: "reservation.approval_required",
    channel: "in_app", subject: "Approval needed for {{reference}}",
    body: "{{ownerName}} raised {{reference}} for {{totalAmount}}, which is above the ₹50,000 approval threshold.",
    isActive: true,
    variables: ["ownerName", "reference", "totalAmount"],
    createdAt: ts(subMonths(TODAY, 14)), createdBy: systemUser.id,
    updatedAt: ts(subMonths(TODAY, 5)), updatedBy: systemUser.id,
  },
  {
    id: "tpl-003", name: "Pre-arrival reminder", event: "reservation.pre_arrival",
    channel: "whatsapp", subject: "",
    body: "Hi {{customerName}}, your stay at {{hotelName}} begins tomorrow. Check-in from 14:00. Reply here if you need an airport pickup.",
    isActive: true,
    variables: ["customerName", "hotelName"],
    createdAt: ts(subMonths(TODAY, 10)), createdBy: systemUser.id,
    updatedAt: ts(subMonths(TODAY, 1)), updatedBy: systemUser.id,
  },
  {
    id: "tpl-004", name: "Invoice due reminder", event: "invoice.due_soon",
    channel: "email", subject: "Invoice {{number}} is due on {{dueDate}}",
    body: "Dear {{companyName}},\n\nInvoice {{number}} for {{totalAmount}} falls due on {{dueDate}}.\n\nFidato Hotels — Finance",
    isActive: true,
    variables: ["companyName", "number", "totalAmount", "dueDate"],
    createdAt: ts(subMonths(TODAY, 12)), createdBy: systemUser.id,
    updatedAt: ts(subMonths(TODAY, 3)), updatedBy: systemUser.id,
  },
  {
    id: "tpl-005", name: "Cancellation acknowledgement", event: "reservation.cancelled",
    channel: "email", subject: "Cancellation confirmed — {{reference}}",
    body: "Dear {{customerName}},\n\nWe have cancelled reservation {{reference}}. Any refund due follows the rate plan's cancellation policy.\n\nFidato Hotels",
    isActive: true,
    variables: ["customerName", "reference"],
    createdAt: ts(subMonths(TODAY, 9)), createdBy: systemUser.id,
    updatedAt: ts(subMonths(TODAY, 4)), updatedBy: systemUser.id,
  },
  {
    id: "tpl-006", name: "Post-stay feedback", event: "reservation.completed",
    channel: "sms", subject: "",
    body: "Thank you for staying at {{hotelName}}. Tell us how it went: {{feedbackLink}}",
    isActive: false,
    variables: ["hotelName", "feedbackLink"],
    createdAt: ts(subMonths(TODAY, 7)), createdBy: systemUser.id,
    updatedAt: ts(subMonths(TODAY, 7)), updatedBy: systemUser.id,
  },
];

/* ══════════════════════════════════════════════════════════════════
   AUTOMATION — the Phase 3 n8n seam
   ══════════════════════════════════════════════════════════════════ */

export const automationWorkflows: AutomationWorkflow[] = [
  {
    id: "atm-001",
    name: "Reservation confirmed",
    description: "Fires the moment a booking reaches confirmed. Produces the guest voucher, notifies the property, and files the record.",
    trigger: "reservation.status_changed",
    triggerDetail: "status → confirmed",
    conditions: ["Reservation is not a draft", "Hotel status is active"],
    steps: [
      { id: "s1", order: 1, kind: "generate_pdf", label: "Generate booking voucher", detail: "Renders the branded PDF voucher from the reservation record.", n8nNode: "HTML → PDF" },
      { id: "s2", order: 2, kind: "send_email", label: "Email the guest", detail: "Template: Reservation confirmation", n8nNode: "Send Email" },
      { id: "s3", order: 3, kind: "send_email", label: "Email the property", detail: "Sends the rooming list to the reservations desk.", n8nNode: "Send Email" },
      { id: "s4", order: 4, kind: "send_whatsapp", label: "WhatsApp the guest", detail: "Short confirmation with the reference number.", n8nNode: "WhatsApp Business Cloud" },
      { id: "s5", order: 5, kind: "notify_user", label: "Notify the salesperson", detail: "In-app notification to the account owner.", n8nNode: "Webhook" },
      { id: "s6", order: 6, kind: "update_record", label: "Write the audit entry", detail: "Appends to the reservation's audit trail.", n8nNode: "Firestore" },
    ],
    status: "active", runsLast30Days: 284, successRate: 98.6, averageDurationMs: 4120,
    lastRunAt: ts(subDays(TODAY, 0)),
    createdAt: ts(subMonths(TODAY, 13)), createdBy: systemUser.id,
    updatedAt: ts(subMonths(TODAY, 1)), updatedBy: systemUser.id,
  },
  {
    id: "atm-002",
    name: "High-value approval routing",
    description: "Routes any booking at or above ₹50,000 to the approval queue and pings the approvers.",
    trigger: "reservation.created",
    triggerDetail: "totalAmount ≥ ₹50,000",
    conditions: ["Total amount ≥ ₹50,000", "Status is not cancelled"],
    steps: [
      { id: "s1", order: 1, kind: "condition", label: "Check the threshold", detail: "totalAmount ≥ 50000", n8nNode: "IF" },
      { id: "s2", order: 2, kind: "update_record", label: "Set pending approval", detail: "status → pending_approval", n8nNode: "Firestore" },
      { id: "s3", order: 3, kind: "notify_user", label: "Notify approvers", detail: "Sales managers and admins.", n8nNode: "Webhook" },
      { id: "s4", order: 4, kind: "wait", label: "Wait 24 hours", detail: "Escalates if still unapproved.", n8nNode: "Wait" },
      { id: "s5", order: 5, kind: "send_email", label: "Escalate", detail: "Emails the head of sales.", n8nNode: "Send Email" },
    ],
    status: "active", runsLast30Days: 63, successRate: 100, averageDurationMs: 1870,
    lastRunAt: ts(subDays(TODAY, 1)),
    createdAt: ts(subMonths(TODAY, 12)), createdBy: systemUser.id,
    updatedAt: ts(subMonths(TODAY, 2)), updatedBy: systemUser.id,
  },
  {
    id: "atm-003",
    name: "Pre-arrival reminder",
    description: "Messages the guest the day before check-in and offers an airport pickup.",
    trigger: "schedule.daily",
    triggerDetail: "07:00 IST",
    conditions: ["Check-in is tomorrow", "Status is confirmed"],
    steps: [
      { id: "s1", order: 1, kind: "update_record", label: "Collect tomorrow's arrivals", detail: "Queries reservations where checkIn = today + 1.", n8nNode: "Firestore" },
      { id: "s2", order: 2, kind: "send_whatsapp", label: "WhatsApp each guest", detail: "Template: Pre-arrival reminder", n8nNode: "WhatsApp Business Cloud" },
      { id: "s3", order: 3, kind: "notify_user", label: "Brief the property", detail: "Sends the arrivals list to the hotel manager.", n8nNode: "Webhook" },
    ],
    status: "active", runsLast30Days: 30, successRate: 96.7, averageDurationMs: 12400,
    lastRunAt: ts(subDays(TODAY, 0)),
    createdAt: ts(subMonths(TODAY, 9)), createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, 20)), updatedBy: systemUser.id,
  },
  {
    id: "atm-004",
    name: "Invoice generation",
    description: "Raises the invoice when a stay completes and sends it to the billing contact.",
    trigger: "reservation.status_changed",
    triggerDetail: "status → completed",
    conditions: ["Reservation has no invoice yet"],
    steps: [
      { id: "s1", order: 1, kind: "update_record", label: "Build invoice lines", detail: "From the folio and rate plan.", n8nNode: "Function" },
      { id: "s2", order: 2, kind: "generate_pdf", label: "Render the invoice PDF", detail: "Branded, GST-compliant layout.", n8nNode: "HTML → PDF" },
      { id: "s3", order: 3, kind: "send_email", label: "Email the billing contact", detail: "Template: Invoice", n8nNode: "Send Email" },
      { id: "s4", order: 4, kind: "webhook", label: "Push to accounting", detail: "Posts the invoice to Tally.", n8nNode: "HTTP Request" },
    ],
    status: "active", runsLast30Days: 118, successRate: 94.1, averageDurationMs: 6800,
    lastRunAt: ts(subDays(TODAY, 0)),
    createdAt: ts(subMonths(TODAY, 11)), createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, 9)), updatedBy: systemUser.id,
  },
  {
    id: "atm-005",
    name: "Payment overdue chase",
    description: "Escalating reminders on unpaid invoices past their due date.",
    trigger: "schedule.daily",
    triggerDetail: "09:00 IST",
    conditions: ["Invoice status is sent or partially paid", "Due date has passed"],
    steps: [
      { id: "s1", order: 1, kind: "condition", label: "Find overdue invoices", detail: "dueDate < today AND amountDue > 0", n8nNode: "IF" },
      { id: "s2", order: 2, kind: "send_email", label: "Reminder to the company", detail: "Template: Invoice due reminder", n8nNode: "Send Email" },
      { id: "s3", order: 3, kind: "notify_user", label: "Notify finance", detail: "Daily digest to the finance team.", n8nNode: "Webhook" },
    ],
    status: "active", runsLast30Days: 30, successRate: 100, averageDurationMs: 3200,
    lastRunAt: ts(subDays(TODAY, 0)),
    createdAt: ts(subMonths(TODAY, 8)), createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, 30)), updatedBy: systemUser.id,
  },
  {
    id: "atm-006",
    name: "Cancellation handling",
    description: "Releases inventory, acknowledges the guest and records the reason.",
    trigger: "reservation.status_changed",
    triggerDetail: "status → cancelled",
    conditions: [],
    steps: [
      { id: "s1", order: 1, kind: "update_record", label: "Release the rooms", detail: "Returns inventory to the availability pool.", n8nNode: "Firestore" },
      { id: "s2", order: 2, kind: "send_email", label: "Acknowledge the guest", detail: "Template: Cancellation acknowledgement", n8nNode: "Send Email" },
      { id: "s3", order: 3, kind: "notify_user", label: "Notify the property", detail: "", n8nNode: "Webhook" },
    ],
    status: "active", runsLast30Days: 41, successRate: 100, averageDurationMs: 2400,
    lastRunAt: ts(subDays(TODAY, 2)),
    createdAt: ts(subMonths(TODAY, 10)), createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, 40)), updatedBy: systemUser.id,
  },
  {
    id: "atm-007",
    name: "Post-stay feedback",
    description: "Requests a review two days after checkout.",
    trigger: "schedule.daily",
    triggerDetail: "11:00 IST",
    conditions: ["Checked out 2 days ago", "Status is completed"],
    steps: [
      { id: "s1", order: 1, kind: "wait", label: "Wait 48 hours after checkout", detail: "", n8nNode: "Wait" },
      { id: "s2", order: 2, kind: "send_email", label: "Send the feedback request", detail: "Template: Post-stay feedback", n8nNode: "Send Email" },
    ],
    status: "paused", runsLast30Days: 0, successRate: 0, averageDurationMs: 0,
    lastRunAt: ts(subMonths(TODAY, 2)),
    createdAt: ts(subMonths(TODAY, 6)), createdBy: systemUser.id,
    updatedAt: ts(subMonths(TODAY, 2)), updatedBy: systemUser.id,
  },
  {
    id: "atm-008",
    name: "Duplicate customer detection",
    description: "Flags likely duplicate customer records for a human to merge.",
    trigger: "customer.created",
    triggerDetail: "on every new customer",
    conditions: ["Email or phone matches an existing record"],
    steps: [
      { id: "s1", order: 1, kind: "condition", label: "Match on email and phone", detail: "Normalised comparison.", n8nNode: "IF" },
      { id: "s2", order: 2, kind: "notify_user", label: "Raise a merge suggestion", detail: "Appears on /crm/merge.", n8nNode: "Webhook" },
    ],
    status: "active", runsLast30Days: 54, successRate: 100, averageDurationMs: 900,
    lastRunAt: ts(subDays(TODAY, 1)),
    createdAt: ts(subMonths(TODAY, 5)), createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, 15)), updatedBy: systemUser.id,
  },
  {
    id: "atm-009",
    name: "Daily arrivals brief",
    description: "Sends each property its arrivals and departures for the day.",
    trigger: "schedule.daily",
    triggerDetail: "06:30 IST",
    conditions: ["Hotel status is active"],
    steps: [
      { id: "s1", order: 1, kind: "update_record", label: "Build the per-property list", detail: "", n8nNode: "Function" },
      { id: "s2", order: 2, kind: "send_email", label: "Email each hotel manager", detail: "", n8nNode: "Send Email" },
    ],
    status: "active", runsLast30Days: 30, successRate: 100, averageDurationMs: 8900,
    lastRunAt: ts(subDays(TODAY, 0)),
    createdAt: ts(subMonths(TODAY, 7)), createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, 25)), updatedBy: systemUser.id,
  },
  {
    id: "atm-010",
    name: "Commission accrual",
    description: "Accrues the property commission once a stay completes.",
    trigger: "reservation.status_changed",
    triggerDetail: "status → completed",
    conditions: [],
    steps: [
      { id: "s1", order: 1, kind: "update_record", label: "Calculate the commission", detail: "roomCharges × hotel.commissionPercent", n8nNode: "Function" },
      { id: "s2", order: 2, kind: "update_record", label: "Write the accrual", detail: "", n8nNode: "Firestore" },
    ],
    status: "active", runsLast30Days: 118, successRate: 100, averageDurationMs: 700,
    lastRunAt: ts(subDays(TODAY, 0)),
    createdAt: ts(subMonths(TODAY, 8)), createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, 60)), updatedBy: systemUser.id,
  },
  {
    id: "atm-011",
    name: "Inventory low-stock alert",
    description: "Warns the revenue team when a property drops below 10% availability.",
    trigger: "inventory.updated",
    triggerDetail: "available / total < 0.10",
    conditions: ["Date is within the next 30 days"],
    steps: [
      { id: "s1", order: 1, kind: "condition", label: "Check the availability ratio", detail: "", n8nNode: "IF" },
      { id: "s2", order: 2, kind: "notify_user", label: "Alert the revenue team", detail: "", n8nNode: "Webhook" },
    ],
    status: "draft", runsLast30Days: 0, successRate: 0, averageDurationMs: 0,
    createdAt: ts(subDays(TODAY, 40)), createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, 12)), updatedBy: systemUser.id,
  },
  {
    id: "atm-012",
    name: "Monthly hotel performance digest",
    description: "Sends every property its month-end scorecard.",
    trigger: "schedule.monthly",
    triggerDetail: "1st of the month, 08:00 IST",
    conditions: [],
    steps: [
      { id: "s1", order: 1, kind: "update_record", label: "Aggregate last month", detail: "", n8nNode: "Function" },
      { id: "s2", order: 2, kind: "generate_pdf", label: "Render the scorecard", detail: "", n8nNode: "HTML → PDF" },
      { id: "s3", order: 3, kind: "send_email", label: "Email the property", detail: "", n8nNode: "Send Email" },
    ],
    status: "active", runsLast30Days: 1, successRate: 100, averageDurationMs: 42000,
    lastRunAt: ts(subDays(TODAY, 27)),
    createdAt: ts(subMonths(TODAY, 4)), createdBy: systemUser.id,
    updatedAt: ts(subDays(TODAY, 27)), updatedBy: systemUser.id,
  },
];

export const automationRuns: AutomationRun[] = [];

{
  const active = automationWorkflows.filter((w) => w.status === "active");
  let n = 0;
  for (let day = 0; day < 14; day++) {
    for (const wf of active) {
      const perDay = Math.max(1, Math.round(wf.runsLast30Days / 30));
      for (let k = 0; k < perDay; k++) {
        const failed = rng.next() * 100 > wf.successRate;
        const res = reservations[rng.int(0, reservations.length - 1)]!;
        automationRuns.push({
          id: `run-${String(++n).padStart(5, "0")}`,
          workflowId: wf.id,
          workflowName: wf.name,
          status: failed ? "failed" : "success",
          startedAt: ts(subDays(TODAY, day)),
          durationMs: Math.round(wf.averageDurationMs * (0.6 + rng.next() * 0.9)),
          trigger: wf.trigger,
          entityLabel: res.reference,
          error: failed
            ? rng.pick([
                "SMTP timeout after 30s",
                "WhatsApp API returned 429 — rate limited",
                "PDF render failed: template variable {{totalAmount}} missing",
                "Firestore write conflict, retry exhausted",
              ])
            : undefined,
          stepsCompleted: failed ? rng.int(1, Math.max(1, wf.steps.length - 1)) : wf.steps.length,
          stepsTotal: wf.steps.length,
        });
      }
    }
  }
  automationRuns.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/* ══════════════════════════════════════════════════════════════════
   INTEGRATIONS & SETTINGS
   ══════════════════════════════════════════════════════════════════ */

export const integrations: Integration[] = [
  { id: "int-001", name: "WhatsApp Business Cloud", category: "messaging", description: "Guest messaging for confirmations, reminders and support.", status: "connected", connectedAt: ts(subMonths(TODAY, 9)), lastSyncAt: ts(subDays(TODAY, 0)), viaN8n: true },
  { id: "int-002", name: "Gmail / Google Workspace", category: "messaging", description: "Transactional and sales email delivery.", status: "connected", connectedAt: ts(subMonths(TODAY, 14)), lastSyncAt: ts(subDays(TODAY, 0)), viaN8n: true },
  { id: "int-003", name: "Tally Prime", category: "accounting", description: "Posts invoices and receipts into the books.", status: "connected", connectedAt: ts(subMonths(TODAY, 6)), lastSyncAt: ts(subDays(TODAY, 1)), viaN8n: true },
  { id: "int-004", name: "Razorpay", category: "payment", description: "Payment links and settlement reconciliation.", status: "error", connectedAt: ts(subMonths(TODAY, 4)), lastSyncAt: ts(subDays(TODAY, 3)), viaN8n: false },
  { id: "int-005", name: "Google Calendar", category: "calendar", description: "Site visits and client meetings on the sales calendar.", status: "connected", connectedAt: ts(subMonths(TODAY, 3)), lastSyncAt: ts(subDays(TODAY, 0)), viaN8n: true },
  { id: "int-006", name: "OpenAI", category: "ai", description: "Powers summaries, the assistant and proposal drafting.", status: "connected", connectedAt: ts(subMonths(TODAY, 2)), lastSyncAt: ts(subDays(TODAY, 0)), viaN8n: false },
  { id: "int-007", name: "eZee Absolute PMS", category: "pms", description: "Two-way room and folio sync with partner properties.", status: "available", viaN8n: true },
  { id: "int-008", name: "STAAH Channel Manager", category: "channel_manager", description: "Rate and inventory distribution to OTAs.", status: "available", viaN8n: true },
  { id: "int-009", name: "MSG91 SMS", category: "messaging", description: "Transactional SMS for OTPs and reminders.", status: "available", viaN8n: true },
  { id: "int-010", name: "Zoho Books", category: "accounting", description: "Alternative accounting destination.", status: "available", viaN8n: true },
];

export const orgSettings: OrgSettings = {
  legalName: "Fidato Hospitality Services Pvt Ltd",
  brandName: "Fidato Hotels",
  gstin: "27AAFCF1234A1Z5",
  registeredAddress: "Fidato House, Baner Road, Pune, Maharashtra 411045",
  supportEmail: "support@fidatohotels.com",
  supportPhone: "+91 20 4890 1200",
  currency: "INR",
  timezone: "Asia/Kolkata",
  financialYearStart: "April",
  approvalThreshold: 50_000,
  defaultCommissionPercent: 12,
};

/* ══════════════════════════════════════════════════════════════════
   INVENTORY — 60 forward days per property
   ══════════════════════════════════════════════════════════════════ */

export function buildInventory(hotelId: string, days = 60) {
  const local = createRandom(
    hotelId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
  );
  const types = roomTypesByHotel.get(hotelId) ?? [];
  const out = [];
  for (const rt of types) {
    for (let d = 0; d < days; d++) {
      const date = addDays(TODAY, d);
      const dow = date.getDay();
      // Weekends run hotter than midweek at leisure properties.
      const pressure = dow === 5 || dow === 6 ? 0.82 : 0.55;
      const booked = Math.min(rt.totalRooms, Math.round(rt.totalRooms * pressure * (0.5 + local.next())));
      const blocked = local.bool(0.08) ? local.int(1, 2) : 0;
      out.push({
        id: `inv-${rt.id}-${isoDate(date)}`,
        hotelId,
        roomTypeId: rt.id,
        date: isoDate(date),
        totalRooms: rt.totalRooms,
        booked,
        blocked,
        available: Math.max(0, rt.totalRooms - booked - blocked),
        rate: Math.round((rt.baseRate * (dow === 5 || dow === 6 ? 1.15 : 1)) / 100) * 100,
      });
    }
  }
  return out;
}
