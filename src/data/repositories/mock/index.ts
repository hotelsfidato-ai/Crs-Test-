import { addDays, addMonths, isWithinInterval, parseISO, startOfMonth, subMonths } from "date-fns";
import { db, read, write, runQuery, nextId, nowIso } from "./store";
import { buildInventory, TODAY, defaultUserForRole } from "@/data/seed";
import { isoDate } from "@/lib/format";
import { APPROVAL_THRESHOLD } from "@/lib/rules";
import { scopeRecords, type Role, type ScopeContext } from "@/lib/permissions";
import type {
  Hotel, RoomType, RatePlan, InventoryDay, Company, Customer, Reservation,
  Invoice, Payment, Commission, User, AuditLog, AppNotification,
  NotificationTemplate, AutomationWorkflow, AutomationRun, Integration,
  OrgSettings, ListQuery, ListResult, ReservationStatus, AuditAction,
} from "@/data/types";

export { db, TODAY, defaultUserForRole };

/* ── Audit helper — every write leaves a trail ─────────────────── */

function recordAudit(entry: {
  entityType: AuditLog["entityType"];
  entityId: string;
  entityLabel: string;
  action: AuditAction;
  summary: string;
  detail?: string;
  actor: { id: string; name: string; role: Role };
}) {
  db.auditLogs.unshift({
    id: nextId("aud", 5),
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    action: entry.action,
    summary: entry.summary,
    detail: entry.detail,
    actorId: entry.actor.id,
    actorName: entry.actor.name,
    actorRole: entry.actor.role,
    at: nowIso(),
  });
}

/* ══════════════════════════════════════════════════════════════════
   OCCUPANCY
   Occupancy is deliberately NOT derived from Fidato reservations.
   Fidato is a booking layer over partner properties — it sells a
   slice of each hotel, so reservations-over-total-rooms would report
   a fraction of a percent and say nothing useful. The inventory
   model is what tracks how full a property actually is, so every
   occupancy figure in the platform reads from there.
   ══════════════════════════════════════════════════════════════════ */

const occupancyCache = new Map<string, number>();

/** Occupancy for one property over the next `days`, from the inventory model. */
function occupancyForHotel(hotelId: string, days = 30): number {
  const key = `${hotelId}:${days}`;
  const cached = occupancyCache.get(key);
  if (cached !== undefined) return cached;

  const rows = buildInventory(hotelId, days);
  const capacity = rows.reduce((s, r) => s + r.totalRooms, 0);
  const booked = rows.reduce((s, r) => s + r.booked, 0);
  const value = capacity > 0 ? (booked / capacity) * 100 : 0;

  occupancyCache.set(key, value);
  return value;
}

/** Portfolio-wide occupancy, weighted by each property's room count. */
function portfolioOccupancy(hotelIds?: string[]): number {
  const hotels = hotelIds
    ? db.hotels.filter((h) => hotelIds.includes(h.id))
    : db.hotels;
  const totalRooms = hotels.reduce((s, h) => s + h.totalRooms, 0);
  if (totalRooms === 0) return 0;
  return (
    hotels.reduce((s, h) => s + occupancyForHotel(h.id) * h.totalRooms, 0) / totalRooms
  );
}

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

/* ══════════════════════════════════════════════════════════════════
   HOTELS
   ══════════════════════════════════════════════════════════════════ */

export const hotelsRepo = {
  list: (query?: ListQuery): Promise<ListResult<Hotel>> =>
    read(() => runQuery(db.hotels, query, ["name", "shortName", "city", "state", "address"])),

  all: (): Promise<Hotel[]> => read(() => [...db.hotels]),

  get: (id: string): Promise<Hotel | null> =>
    read(() => db.hotels.find((h) => h.id === id) ?? null),

  roomTypes: (hotelId: string): Promise<RoomType[]> =>
    read(() => db.roomTypes.filter((rt) => rt.hotelId === hotelId)),

  ratePlans: (hotelId: string): Promise<RatePlan[]> =>
    read(() => db.ratePlans.filter((rp) => rp.hotelId === hotelId)),

  inventory: (hotelId: string, days = 45): Promise<InventoryDay[]> =>
    read(() => buildInventory(hotelId, days)),

  update: (id: string, patch: Partial<Hotel>, actor: Actor): Promise<Hotel> =>
    write(() => {
      const index = db.hotels.findIndex((h) => h.id === id);
      if (index < 0) throw new Error("Hotel not found");
      const updated = { ...db.hotels[index]!, ...patch, updatedAt: nowIso(), updatedBy: actor.id };
      db.hotels[index] = updated;
      recordAudit({
        entityType: "hotel", entityId: id, entityLabel: updated.name,
        action: "updated", summary: `Property details updated`, actor,
      });
      return updated;
    }),
};

/* ══════════════════════════════════════════════════════════════════
   RATE PLANS
   ══════════════════════════════════════════════════════════════════ */

export const ratePlansRepo = {
  list: (query?: ListQuery): Promise<ListResult<RatePlan>> =>
    read(() => runQuery(db.ratePlans, query, ["name", "code", "hotelName", "roomTypeName"])),

  update: (id: string, patch: Partial<RatePlan>, actor: Actor): Promise<RatePlan> =>
    write(() => {
      const index = db.ratePlans.findIndex((p) => p.id === id);
      if (index < 0) throw new Error("Rate plan not found");
      const updated = { ...db.ratePlans[index]!, ...patch, updatedAt: nowIso(), updatedBy: actor.id };
      db.ratePlans[index] = updated;
      recordAudit({
        entityType: "rate", entityId: id, entityLabel: updated.name,
        action: "updated",
        summary: `Rate changed to ₹${updated.rate.toLocaleString("en-IN")} on ${updated.hotelName}`,
        actor,
      });
      return updated;
    }),
};

/* ══════════════════════════════════════════════════════════════════
   COMPANIES
   ══════════════════════════════════════════════════════════════════ */

export const companiesRepo = {
  list: (query?: ListQuery, ctx?: ScopeContext): Promise<ListResult<Company>> =>
    read(() => {
      const scoped = ctx ? scopeRecords(ctx, db.companies) : db.companies;
      return runQuery(scoped, query, ["name", "legalName", "city", "industry", "email", "gstin"]);
    }),

  all: (ctx?: ScopeContext): Promise<Company[]> =>
    read(() => (ctx ? scopeRecords(ctx, db.companies) : [...db.companies])),

  get: (id: string): Promise<Company | null> =>
    read(() => db.companies.find((c) => c.id === id) ?? null),

  create: (input: Partial<Company>, actor: Actor): Promise<Company> =>
    write(() => {
      const now = nowIso();
      const company: Company = {
        id: nextId("cmp", 3),
        name: input.name ?? "Untitled company",
        legalName: input.legalName ?? input.name ?? "Untitled company",
        tier: input.tier ?? "sme",
        status: input.status ?? "prospect",
        industry: input.industry ?? "",
        gstin: input.gstin ?? "",
        city: input.city ?? "",
        state: input.state ?? "",
        address: input.address ?? "",
        website: input.website ?? "",
        phone: input.phone ?? "",
        email: input.email ?? "",
        ownerId: input.ownerId ?? actor.id,
        ownerName: input.ownerName ?? actor.name,
        creditLimit: input.creditLimit ?? 0,
        creditUsed: 0,
        paymentTermDays: input.paymentTermDays ?? 30,
        contractStart: input.contractStart,
        contractEnd: input.contractEnd,
        negotiatedDiscountPercent: input.negotiatedDiscountPercent ?? 0,
        totalReservations: 0,
        totalRevenue: 0,
        lastActivityAt: now,
        notes: input.notes ?? "",
        createdAt: now, createdBy: actor.id, updatedAt: now, updatedBy: actor.id,
      };
      db.companies.unshift(company);
      recordAudit({
        entityType: "company", entityId: company.id, entityLabel: company.name,
        action: "created", summary: `Company ${company.name} created`, actor,
      });
      return company;
    }),

  update: (id: string, patch: Partial<Company>, actor: Actor): Promise<Company> =>
    write(() => {
      const index = db.companies.findIndex((c) => c.id === id);
      if (index < 0) throw new Error("Company not found");
      const updated = { ...db.companies[index]!, ...patch, updatedAt: nowIso(), updatedBy: actor.id };
      db.companies[index] = updated;
      recordAudit({
        entityType: "company", entityId: id, entityLabel: updated.name,
        action: "updated", summary: `Company details updated`, actor,
      });
      return updated;
    }),
};

/* ══════════════════════════════════════════════════════════════════
   CUSTOMERS
   ══════════════════════════════════════════════════════════════════ */

export interface DuplicateGroup {
  key: string;
  reason: "email" | "phone" | "name";
  records: Customer[];
}

export const customersRepo = {
  list: (query?: ListQuery, ctx?: ScopeContext): Promise<ListResult<Customer>> =>
    read(() => {
      const scoped = ctx ? scopeRecords(ctx, db.customers) : db.customers;
      return runQuery(scoped, query, ["fullName", "email", "phone", "companyName", "city"]);
    }),

  all: (): Promise<Customer[]> => read(() => [...db.customers]),

  get: (id: string): Promise<Customer | null> =>
    read(() => db.customers.find((c) => c.id === id) ?? null),

  reservations: (customerId: string): Promise<Reservation[]> =>
    read(() =>
      db.reservations
        .filter((r) => r.customerId === customerId)
        .sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1)),
    ),

  create: (input: Partial<Customer>, actor: Actor): Promise<Customer> =>
    write(() => {
      const now = nowIso();
      const first = input.firstName ?? "";
      const last = input.lastName ?? "";
      const company = input.companyId ? db.companies.find((c) => c.id === input.companyId) : undefined;
      const customer: Customer = {
        id: nextId("cus", 3),
        firstName: first,
        lastName: last,
        fullName: `${first} ${last}`.trim(),
        email: input.email ?? "",
        phone: input.phone ?? "",
        status: input.status ?? "lead",
        source: input.source ?? "direct",
        companyId: company?.id,
        companyName: company?.name,
        designation: input.designation,
        city: input.city ?? "",
        state: input.state ?? "",
        ownerId: input.ownerId ?? actor.id,
        ownerName: input.ownerName ?? actor.name,
        preferences: input.preferences ?? [],
        vip: input.vip ?? false,
        totalReservations: 0,
        totalRevenue: 0,
        lastActivityAt: now,
        notes: input.notes ?? "",
        createdAt: now, createdBy: actor.id, updatedAt: now, updatedBy: actor.id,
      };
      db.customers.unshift(customer);
      recordAudit({
        entityType: "customer", entityId: customer.id, entityLabel: customer.fullName,
        action: "created", summary: `Customer ${customer.fullName} created`,
        detail: company ? `Linked to ${company.name}` : undefined, actor,
      });
      return customer;
    }),

  update: (id: string, patch: Partial<Customer>, actor: Actor): Promise<Customer> =>
    write(() => {
      const index = db.customers.findIndex((c) => c.id === id);
      if (index < 0) throw new Error("Customer not found");
      const base = db.customers[index]!;
      const merged = { ...base, ...patch };
      if (patch.firstName || patch.lastName) {
        merged.fullName = `${merged.firstName} ${merged.lastName}`.trim();
      }
      if (patch.companyId !== undefined) {
        const company = db.companies.find((c) => c.id === patch.companyId);
        merged.companyName = company?.name;
      }
      const updated = { ...merged, updatedAt: nowIso(), updatedBy: actor.id };
      db.customers[index] = updated;
      recordAudit({
        entityType: "customer", entityId: id, entityLabel: updated.fullName,
        action: "updated", summary: `Customer details updated`, actor,
      });
      return updated;
    }),

  /** Finds likely duplicates on normalised phone, then email, then name. */
  duplicates: (): Promise<DuplicateGroup[]> =>
    read(() => {
      const groups: DuplicateGroup[] = [];

      const byPhone = new Map<string, Customer[]>();
      const byEmail = new Map<string, Customer[]>();
      const byName = new Map<string, Customer[]>();

      for (const c of db.customers) {
        const digits = c.phone.replace(/\D/g, "").slice(-10);
        if (digits.length === 10) {
          byPhone.set(digits, [...(byPhone.get(digits) ?? []), c]);
        }
        const email = c.email.trim().toLowerCase();
        if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), c]);
        const name = c.fullName.trim().toLowerCase();
        if (name) byName.set(name, [...(byName.get(name) ?? []), c]);
      }

      const claimed = new Set<string>();

      for (const [key, records] of byPhone) {
        if (records.length > 1) {
          groups.push({ key, reason: "phone", records });
          records.forEach((r) => claimed.add(r.id));
        }
      }
      for (const [key, records] of byEmail) {
        if (records.length > 1 && !records.every((r) => claimed.has(r.id))) {
          groups.push({ key, reason: "email", records });
          records.forEach((r) => claimed.add(r.id));
        }
      }
      for (const [key, records] of byName) {
        if (records.length > 1 && !records.some((r) => claimed.has(r.id))) {
          groups.push({ key, reason: "name", records });
          records.forEach((r) => claimed.add(r.id));
        }
      }

      return groups;
    }),

  /** Keeps `survivorId`, folds the others in, and re-points their reservations. */
  merge: (survivorId: string, mergedIds: string[], patch: Partial<Customer>, actor: Actor): Promise<Customer> =>
    write(() => {
      const index = db.customers.findIndex((c) => c.id === survivorId);
      if (index < 0) throw new Error("Survivor not found");
      const survivor = { ...db.customers[index]!, ...patch };

      const absorbed = db.customers.filter((c) => mergedIds.includes(c.id));

      // Re-point every reservation and invoice at the survivor.
      for (const r of db.reservations) {
        if (mergedIds.includes(r.customerId)) {
          r.customerId = survivor.id;
          r.customerName = survivor.fullName;
        }
      }
      for (const inv of db.invoices) {
        if (mergedIds.includes(inv.customerId)) {
          inv.customerId = survivor.id;
          inv.customerName = survivor.fullName;
        }
      }

      survivor.totalReservations += absorbed.reduce((s, c) => s + c.totalReservations, 0);
      survivor.totalRevenue += absorbed.reduce((s, c) => s + c.totalRevenue, 0);
      survivor.preferences = [...new Set([...survivor.preferences, ...absorbed.flatMap((c) => c.preferences)])];
      survivor.updatedAt = nowIso();
      survivor.updatedBy = actor.id;

      db.customers[index] = survivor;
      db.customers = db.customers.filter((c) => !mergedIds.includes(c.id));

      recordAudit({
        entityType: "customer", entityId: survivor.id, entityLabel: survivor.fullName,
        action: "merged",
        summary: `Merged ${absorbed.length} duplicate record${absorbed.length === 1 ? "" : "s"} into ${survivor.fullName}`,
        detail: absorbed.map((c) => `${c.fullName} (${c.email})`).join(", "),
        actor,
      });

      return survivor;
    }),

  /** Bulk create from the import wizard. */
  importMany: (rows: Partial<Customer>[], actor: Actor): Promise<{ created: number }> =>
    write(() => {
      let created = 0;
      const now = nowIso();
      for (const row of rows) {
        const first = row.firstName ?? "";
        const last = row.lastName ?? "";
        db.customers.unshift({
          id: nextId("cus", 3),
          firstName: first, lastName: last, fullName: `${first} ${last}`.trim(),
          email: row.email ?? "", phone: row.phone ?? "",
          status: "lead", source: "campaign",
          companyId: undefined, companyName: undefined, designation: undefined,
          city: row.city ?? "", state: row.state ?? "",
          ownerId: actor.id, ownerName: actor.name,
          preferences: [], vip: false,
          totalReservations: 0, totalRevenue: 0,
          lastActivityAt: now, notes: "Imported via CSV.",
          createdAt: now, createdBy: actor.id, updatedAt: now, updatedBy: actor.id,
        });
        created++;
      }
      recordAudit({
        entityType: "customer", entityId: "bulk", entityLabel: `${created} customers`,
        action: "created", summary: `Imported ${created} customers from file`, actor,
      });
      return { created };
    }),
};

/* ══════════════════════════════════════════════════════════════════
   RESERVATIONS
   ══════════════════════════════════════════════════════════════════ */

export interface CreateReservationInput {
  customerId: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  rooms: Reservation["rooms"];
  specialRequests?: string;
  internalNotes?: string;
  channel?: Reservation["channel"];
}

export const reservationsRepo = {
  list: (query?: ListQuery, ctx?: ScopeContext): Promise<ListResult<Reservation>> =>
    read(() => {
      const scoped = ctx ? scopeRecords(ctx, db.reservations) : db.reservations;
      return runQuery(
        scoped,
        { sortBy: "checkIn", sortDir: "desc", ...query },
        ["reference", "customerName", "hotelName", "companyName", "hotelCity"],
      );
    }),

  get: (id: string): Promise<Reservation | null> =>
    read(() => db.reservations.find((r) => r.id === id) ?? null),

  /** The approval queue — bookings at or above the threshold, still waiting. */
  pendingApprovals: (ctx?: ScopeContext): Promise<Reservation[]> =>
    read(() => {
      const scoped = ctx ? scopeRecords(ctx, db.reservations) : db.reservations;
      return scoped
        .filter((r) => r.status === "pending_approval")
        .sort((a, b) => b.totalAmount - a.totalAmount);
    }),

  /** Arrivals, departures and in-house for a given day. */
  daySheet: (date: string, ctx?: ScopeContext) =>
    read(() => {
      const scoped = ctx ? scopeRecords(ctx, db.reservations) : db.reservations;
      const live = scoped.filter((r) => r.status === "confirmed" || r.status === "checked_in");
      return {
        arrivals: live.filter((r) => r.checkIn === date),
        departures: live.filter((r) => r.checkOut === date),
        inHouse: live.filter((r) => r.checkIn < date && r.checkOut > date),
      };
    }),

  /** Reservations overlapping a date window — powers the calendar. */
  inRange: (from: string, to: string, ctx?: ScopeContext): Promise<Reservation[]> =>
    read(() => {
      const scoped = ctx ? scopeRecords(ctx, db.reservations) : db.reservations;
      const start = parseISO(from);
      const end = parseISO(to);
      return scoped.filter((r) => {
        const ci = parseISO(r.checkIn);
        const co = parseISO(r.checkOut);
        return (
          isWithinInterval(ci, { start, end }) ||
          isWithinInterval(co, { start, end }) ||
          (ci < start && co > end)
        );
      });
    }),

  audit: (reservationId: string): Promise<AuditLog[]> =>
    read(() =>
      db.auditLogs
        .filter((a) => a.entityType === "reservation" && a.entityId === reservationId)
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    ),

  /** Quotes a booking without committing it — used live by the wizard. */
  quote: (rooms: Reservation["rooms"], nights: number, companyId?: string) => {
    const roomCharges = rooms.reduce((s, r) => s + r.ratePerNight * r.quantity * nights, 0);
    const company = companyId ? db.companies.find((c) => c.id === companyId) : undefined;
    const discountPercent = company?.negotiatedDiscountPercent ?? 0;
    const discountAmount = Math.round((roomCharges * discountPercent) / 100);
    const totalRooms = rooms.reduce((s, r) => s + r.quantity, 0);
    const perNight = totalRooms > 0 && nights > 0 ? roomCharges / totalRooms / nights : 0;
    const taxable = roomCharges - discountAmount;
    const taxRate = perNight >= 7500 ? 0.18 : 0.12;
    const taxAmount = Math.round(taxable * taxRate);
    const totalAmount = taxable + taxAmount;
    return {
      roomCharges, discountPercent, discountAmount, taxRate, taxAmount, totalAmount,
      requiresApproval: totalAmount >= APPROVAL_THRESHOLD,
      companyName: company?.name,
    };
  },

  create: (input: CreateReservationInput, actor: Actor): Promise<Reservation> =>
    write(() => {
      const customer = db.customers.find((c) => c.id === input.customerId);
      if (!customer) throw new Error("Customer not found");
      const hotel = db.hotels.find((h) => h.id === input.hotelId);
      if (!hotel) throw new Error("Hotel not found");

      const nights = Math.max(
        1,
        Math.round(
          (parseISO(input.checkOut).getTime() - parseISO(input.checkIn).getTime()) / 86_400_000,
        ),
      );

      const quote = reservationsRepo.quote(input.rooms, nights, customer.companyId);
      const now = nowIso();
      const company = customer.companyId
        ? db.companies.find((c) => c.id === customer.companyId)
        : undefined;

      const reservation: Reservation = {
        id: nextId("res", 4),
        reference: `FH-2026-${String(8000 + db.reservations.length).padStart(5, "0")}`,
        status: quote.requiresApproval ? "pending_approval" : "confirmed",
        channel: input.channel ?? "direct_sales",
        customerId: customer.id,
        customerName: customer.fullName,
        companyId: company?.id,
        companyName: company?.name,
        hotelId: hotel.id,
        hotelName: hotel.name,
        hotelCity: hotel.city,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights,
        rooms: input.rooms,
        guests: [{
          name: customer.fullName, email: customer.email,
          phone: customer.phone, isPrimary: true,
        }],
        totalRooms: input.rooms.reduce((s, r) => s + r.quantity, 0),
        totalAdults: input.rooms.reduce((s, r) => s + r.adults * r.quantity, 0),
        totalChildren: input.rooms.reduce((s, r) => s + r.children * r.quantity, 0),
        roomCharges: quote.roomCharges,
        extrasCharges: 0,
        discountAmount: quote.discountAmount,
        taxAmount: quote.taxAmount,
        totalAmount: quote.totalAmount,
        ownerId: actor.id,
        ownerName: actor.name,
        requiresApproval: quote.requiresApproval,
        specialRequests: input.specialRequests ?? "",
        internalNotes: input.internalNotes ?? "",
        createdAt: now, createdBy: actor.id, updatedAt: now, updatedBy: actor.id,
      };

      db.reservations.unshift(reservation);

      recordAudit({
        entityType: "reservation", entityId: reservation.id, entityLabel: reservation.reference,
        action: "created",
        summary: `Reservation created for ${customer.fullName} at ${hotel.name}`,
        detail: `${reservation.totalRooms} room(s), ${nights} night(s), ₹${quote.totalAmount.toLocaleString("en-IN")}`,
        actor,
      });

      if (quote.requiresApproval) {
        recordAudit({
          entityType: "reservation", entityId: reservation.id, entityLabel: reservation.reference,
          action: "status_changed",
          summary: "Routed to approval — booking value is at or above ₹50,000",
          actor: { id: "system", name: "Automation", role: "super_admin" },
        });
      }

      customer.totalReservations += 1;
      customer.lastActivityAt = now;

      return reservation;
    }),

  setStatus: (
    id: string,
    status: ReservationStatus,
    actor: Actor,
    meta?: { reason?: string; note?: string },
  ): Promise<Reservation> =>
    write(() => {
      const index = db.reservations.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("Reservation not found");
      const current = db.reservations[index]!;
      const now = nowIso();

      const updated: Reservation = {
        ...current,
        status,
        updatedAt: now,
        updatedBy: actor.id,
        ...(status === "cancelled"
          ? { cancelledAt: now, cancelledBy: actor.name, cancellationReason: meta?.reason ?? "" }
          : {}),
        ...(status === "confirmed" && current.status === "pending_approval"
          ? { approvedBy: actor.name, approvedAt: now, approvalNote: meta?.note ?? "" }
          : {}),
      };

      db.reservations[index] = updated;

      if (status === "cancelled") {
        recordAudit({
          entityType: "reservation", entityId: id, entityLabel: updated.reference,
          action: "cancelled",
          summary: `Cancelled — ${meta?.reason || "no reason given"}`, actor,
        });
      } else if (current.status === "pending_approval" && status === "confirmed") {
        recordAudit({
          entityType: "reservation", entityId: id, entityLabel: updated.reference,
          action: "approved",
          summary: `Approved by ${actor.name}`, detail: meta?.note, actor,
        });
      } else {
        recordAudit({
          entityType: "reservation", entityId: id, entityLabel: updated.reference,
          action: "status_changed",
          summary: `Status changed from ${current.status} to ${status}`, actor,
        });
      }

      return updated;
    }),

  update: (id: string, patch: Partial<Reservation>, actor: Actor): Promise<Reservation> =>
    write(() => {
      const index = db.reservations.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("Reservation not found");
      const updated = { ...db.reservations[index]!, ...patch, updatedAt: nowIso(), updatedBy: actor.id };
      db.reservations[index] = updated;
      recordAudit({
        entityType: "reservation", entityId: id, entityLabel: updated.reference,
        action: "updated", summary: "Reservation details updated", actor,
      });
      return updated;
    }),
};

/* ══════════════════════════════════════════════════════════════════
   FINANCE
   ══════════════════════════════════════════════════════════════════ */

export const financeRepo = {
  invoices: (query?: ListQuery): Promise<ListResult<Invoice>> =>
    read(() =>
      runQuery(
        db.invoices,
        { sortBy: "issueDate", sortDir: "desc", ...query },
        ["number", "customerName", "companyName", "hotelName", "reservationReference"],
      ),
    ),

  invoice: (id: string): Promise<Invoice | null> =>
    read(() => db.invoices.find((i) => i.id === id) ?? null),

  payments: (query?: ListQuery): Promise<ListResult<Payment>> =>
    read(() =>
      runQuery(
        db.payments,
        { sortBy: "receivedAt", sortDir: "desc", ...query },
        ["reference", "invoiceNumber", "customerName"],
      ),
    ),

  paymentsForInvoice: (invoiceId: string): Promise<Payment[]> =>
    read(() => db.payments.filter((p) => p.invoiceId === invoiceId)),

  commissions: (query?: ListQuery): Promise<ListResult<Commission>> =>
    read(() =>
      runQuery(
        db.commissions,
        { sortBy: "periodMonth", sortDir: "desc", ...query },
        ["reservationReference", "hotelName", "ownerName"],
      ),
    ),

  recordPayment: (
    invoiceId: string,
    amount: number,
    method: Payment["method"],
    actor: Actor,
  ): Promise<Payment> =>
    write(() => {
      const invoice = db.invoices.find((i) => i.id === invoiceId);
      if (!invoice) throw new Error("Invoice not found");
      const now = nowIso();

      const payment: Payment = {
        id: nextId("pay", 4),
        reference: `RCPT-${60000 + db.payments.length}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        amount, method, receivedAt: now, reconciled: false, note: "",
        createdAt: now, createdBy: actor.id, updatedAt: now, updatedBy: actor.id,
      };
      db.payments.unshift(payment);

      invoice.amountPaid += amount;
      invoice.amountDue = Math.max(0, invoice.totalAmount - invoice.amountPaid);
      invoice.status = invoice.amountDue === 0 ? "paid" : "partially_paid";
      invoice.updatedAt = now;

      recordAudit({
        entityType: "invoice", entityId: invoice.id, entityLabel: invoice.number,
        action: "updated",
        summary: `Payment of ₹${amount.toLocaleString("en-IN")} recorded`, actor,
      });

      return payment;
    }),
};

/* ══════════════════════════════════════════════════════════════════
   REPORTS
   ══════════════════════════════════════════════════════════════════ */

function revenueOf(r: Reservation): number {
  return r.status === "cancelled" || r.status === "draft" ? 0 : r.totalAmount;
}

export const reportsRepo = {
  /** Headline KPIs for the dashboard, scoped to the actor. */
  kpis: (ctx?: ScopeContext) =>
    read(() => {
      const scoped = ctx ? scopeRecords(ctx, db.reservations) : db.reservations;
      const today = isoDate(TODAY);
      const monthStart = isoDate(startOfMonth(TODAY));
      const lastMonthStart = isoDate(startOfMonth(subMonths(TODAY, 1)));
      // Upper bound matters: without it "this month" silently absorbs the
      // entire forward book and every growth figure becomes nonsense.
      const nextMonthStart = isoDate(startOfMonth(addMonths(TODAY, 1)));

      const thisMonth = scoped.filter(
        (r) => r.checkIn >= monthStart && r.checkIn < nextMonthStart,
      );
      const lastMonth = scoped.filter(
        (r) => r.checkIn >= lastMonthStart && r.checkIn < monthStart,
      );

      const revenueThis = thisMonth.reduce((s, r) => s + revenueOf(r), 0);
      const revenueLast = lastMonth.reduce((s, r) => s + revenueOf(r), 0);

      const live = scoped.filter((r) => r.status === "confirmed" || r.status === "checked_in");
      const roomNights = thisMonth.reduce((s, r) => s + r.totalRooms * r.nights, 0);

      // A hotel manager sees their own property's occupancy, not the portfolio's.
      const occupancy = portfolioOccupancy(
        ctx?.hotelId ? [ctx.hotelId] : undefined,
      );

      const cancelled = thisMonth.filter((r) => r.status === "cancelled").length;

      return {
        revenueThisMonth: revenueThis,
        revenueChangePercent: revenueLast > 0 ? ((revenueThis - revenueLast) / revenueLast) * 100 : 0,
        reservationsThisMonth: thisMonth.length,
        reservationsChangePercent:
          lastMonth.length > 0 ? ((thisMonth.length - lastMonth.length) / lastMonth.length) * 100 : 0,
        arrivalsToday: live.filter((r) => r.checkIn === today).length,
        departuresToday: live.filter((r) => r.checkOut === today).length,
        inHouse: live.filter((r) => r.checkIn <= today && r.checkOut > today).length,
        pendingApprovals: scoped.filter((r) => r.status === "pending_approval").length,
        pendingApprovalValue: scoped
          .filter((r) => r.status === "pending_approval")
          .reduce((s, r) => s + r.totalAmount, 0),
        occupancyPercent: occupancy,
        roomNightsThisMonth: roomNights,
        averageBookingValue: thisMonth.length > 0 ? revenueThis / thisMonth.length : 0,
        cancellationRate: thisMonth.length > 0 ? (cancelled / thisMonth.length) * 100 : 0,
        overdueInvoices: db.invoices.filter((i) => i.status === "overdue").length,
        overdueValue: db.invoices
          .filter((i) => i.status === "overdue")
          .reduce((s, i) => s + i.amountDue, 0),
      };
    }),

  /** Monthly revenue and booking counts for the last `months`. */
  revenueSeries: (months = 12, ctx?: ScopeContext) =>
    read(() => {
      const scoped = ctx ? scopeRecords(ctx, db.reservations) : db.reservations;
      const out: { month: string; label: string; revenue: number; bookings: number; roomNights: number }[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const monthDate = subMonths(TODAY, i);
        const key = isoDate(startOfMonth(monthDate)).slice(0, 7);
        const rows = scoped.filter((r) => r.checkIn.slice(0, 7) === key);
        out.push({
          month: key,
          label: monthDate.toLocaleDateString("en-IN", { month: "short" }),
          revenue: rows.reduce((s, r) => s + revenueOf(r), 0),
          bookings: rows.filter((r) => r.status !== "cancelled").length,
          roomNights: rows.reduce((s, r) => s + r.totalRooms * r.nights, 0),
        });
      }
      return out;
    }),

  /** Per-property performance table. */
  hotelPerformance: () =>
    read(() =>
      db.hotels
        .map((h) => {
          const rows = db.reservations.filter((r) => r.hotelId === h.id);
          const live = rows.filter((r) => r.status !== "cancelled" && r.status !== "draft");
          const revenue = live.reduce((s, r) => s + r.totalAmount, 0);
          const roomNights = live.reduce((s, r) => s + r.totalRooms * r.nights, 0);
          return {
            hotelId: h.id,
            hotelName: h.name,
            city: h.city,
            category: h.category,
            totalRooms: h.totalRooms,
            bookings: live.length,
            revenue,
            roomNights,
            averageRate: roomNights > 0 ? revenue / roomNights : 0,
            occupancyPercent: occupancyForHotel(h.id),
            cancellations: rows.filter((r) => r.status === "cancelled").length,
            commissionPercent: h.commissionPercent,
          };
        })
        .sort((a, b) => b.revenue - a.revenue),
    ),

  /** Salesperson leaderboard. */
  salesPerformance: () =>
    read(() =>
      db.users
        .filter((u) => u.role === "salesperson" || u.role === "sales_manager")
        .map((u) => {
          const rows = db.reservations.filter((r) => r.ownerId === u.id);
          const live = rows.filter((r) => r.status !== "cancelled" && r.status !== "draft");
          const revenue = live.reduce((s, r) => s + r.totalAmount, 0);
          return {
            userId: u.id,
            name: u.name,
            role: u.role,
            bookings: live.length,
            revenue,
            averageBookingValue: live.length > 0 ? revenue / live.length : 0,
            cancellations: rows.filter((r) => r.status === "cancelled").length,
            conversionPercent: rows.length > 0 ? (live.length / rows.length) * 100 : 0,
            accounts: db.companies.filter((c) => c.ownerId === u.id).length,
          };
        })
        .sort((a, b) => b.revenue - a.revenue),
    ),

  /** Occupancy by city, for the occupancy report. */
  occupancyByCity: () =>
    read(() => {
      const byCity = new Map<
        string,
        { city: string; rooms: number; roomNights: number; revenue: number; hotelIds: string[] }
      >();
      for (const h of db.hotels) {
        const entry =
          byCity.get(h.city) ?? { city: h.city, rooms: 0, roomNights: 0, revenue: 0, hotelIds: [] };
        entry.rooms += h.totalRooms;
        entry.hotelIds.push(h.id);
        byCity.set(h.city, entry);
      }
      for (const r of db.reservations) {
        if (r.status === "cancelled" || r.status === "draft") continue;
        const entry = byCity.get(r.hotelCity);
        if (entry) {
          entry.roomNights += r.totalRooms * r.nights;
          entry.revenue += r.totalAmount;
        }
      }
      return [...byCity.values()]
        .map(({ hotelIds, ...e }) => ({
          ...e,
          occupancyPercent: portfolioOccupancy(hotelIds),
        }))
        .sort((a, b) => b.revenue - a.revenue);
    }),

  /** Channel mix for the sales report. */
  channelMix: () =>
    read(() => {
      const counts = new Map<string, { channel: string; bookings: number; revenue: number }>();
      for (const r of db.reservations) {
        if (r.status === "cancelled" || r.status === "draft") continue;
        const entry = counts.get(r.channel) ?? { channel: r.channel, bookings: 0, revenue: 0 };
        entry.bookings += 1;
        entry.revenue += r.totalAmount;
        counts.set(r.channel, entry);
      }
      return [...counts.values()].sort((a, b) => b.revenue - a.revenue);
    }),

  /** Naive forward projection from the last six months' trend. */
  forecast: (monthsAhead = 6) =>
    read(() => {
      const history: { month: string; label: string; revenue: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = subMonths(TODAY, i);
        const key = isoDate(startOfMonth(d)).slice(0, 7);
        history.push({
          month: key,
          label: d.toLocaleDateString("en-IN", { month: "short" }),
          revenue: db.reservations
            .filter((r) => r.checkIn.slice(0, 7) === key)
            .reduce((s, r) => s + revenueOf(r), 0),
        });
      }
      const recent = history.slice(-6);
      const average = recent.reduce((s, m) => s + m.revenue, 0) / Math.max(1, recent.length);
      const growth =
        recent.length > 1 && recent[0]!.revenue > 0
          ? (recent[recent.length - 1]!.revenue - recent[0]!.revenue) / recent[0]!.revenue / recent.length
          : 0.02;

      const projection = Array.from({ length: monthsAhead }, (_, i) => {
        const d = addDays(startOfMonth(TODAY), 31 * (i + 1));
        return {
          month: isoDate(startOfMonth(d)).slice(0, 7),
          label: d.toLocaleDateString("en-IN", { month: "short" }),
          revenue: Math.round(average * (1 + growth * (i + 1))),
          projected: true,
        };
      });

      return {
        history: history.map((h) => ({ ...h, projected: false })),
        projection,
        averageMonthlyRevenue: average,
        growthRate: growth * 100,
      };
    }),
};

/* ══════════════════════════════════════════════════════════════════
   AUTOMATION, NOTIFICATIONS, ADMIN
   ══════════════════════════════════════════════════════════════════ */

export const automationRepo = {
  workflows: (): Promise<AutomationWorkflow[]> => read(() => [...db.automationWorkflows]),

  workflow: (id: string): Promise<AutomationWorkflow | null> =>
    read(() => db.automationWorkflows.find((w) => w.id === id) ?? null),

  runs: (query?: ListQuery): Promise<ListResult<AutomationRun>> =>
    read(() => runQuery(db.automationRuns, query, ["workflowName", "entityLabel", "trigger"])),

  runsForWorkflow: (workflowId: string): Promise<AutomationRun[]> =>
    read(() => db.automationRuns.filter((r) => r.workflowId === workflowId).slice(0, 40)),

  setStatus: (id: string, status: AutomationWorkflow["status"], actor: Actor): Promise<AutomationWorkflow> =>
    write(() => {
      const index = db.automationWorkflows.findIndex((w) => w.id === id);
      if (index < 0) throw new Error("Workflow not found");
      const updated = { ...db.automationWorkflows[index]!, status, updatedAt: nowIso(), updatedBy: actor.id };
      db.automationWorkflows[index] = updated;
      return updated;
    }),
};

export const notificationsRepo = {
  list: (): Promise<AppNotification[]> => read(() => [...db.notifications]),

  unreadCount: (): Promise<number> => read(() => db.notifications.filter((n) => !n.isRead).length),

  markRead: (id: string): Promise<void> =>
    write(() => {
      const n = db.notifications.find((x) => x.id === id);
      if (n) n.isRead = true;
    }),

  markAllRead: (): Promise<void> =>
    write(() => {
      db.notifications.forEach((n) => { n.isRead = true; });
    }),

  templates: (): Promise<NotificationTemplate[]> => read(() => [...db.notificationTemplates]),

  template: (id: string): Promise<NotificationTemplate | null> =>
    read(() => db.notificationTemplates.find((t) => t.id === id) ?? null),
};

export const adminRepo = {
  users: (query?: ListQuery): Promise<ListResult<User>> =>
    read(() => runQuery(db.users, query, ["name", "email", "department", "hotelName"])),

  user: (id: string): Promise<User | null> => read(() => db.users.find((u) => u.id === id) ?? null),

  allUsers: (): Promise<User[]> => read(() => [...db.users]),

  updateUser: (id: string, patch: Partial<User>, actor: Actor): Promise<User> =>
    write(() => {
      const index = db.users.findIndex((u) => u.id === id);
      if (index < 0) throw new Error("User not found");
      const updated = { ...db.users[index]!, ...patch, updatedAt: nowIso(), updatedBy: actor.id };
      db.users[index] = updated;
      recordAudit({
        entityType: "user", entityId: id, entityLabel: updated.name,
        action: "updated", summary: `User record updated`, actor,
      });
      return updated;
    }),

  auditLog: (query?: ListQuery): Promise<ListResult<AuditLog>> =>
    read(() => runQuery(db.auditLogs, query, ["entityLabel", "summary", "actorName", "detail"])),

  integrations: (): Promise<Integration[]> => read(() => [...db.integrations]),

  settings: (): Promise<OrgSettings> => read(() => ({ ...db.orgSettings })),

  updateSettings: (patch: Partial<OrgSettings>): Promise<OrgSettings> =>
    write(() => {
      db.orgSettings = { ...db.orgSettings, ...patch };
      return { ...db.orgSettings };
    }),
};

/* ══════════════════════════════════════════════════════════════════
   GLOBAL SEARCH — powers the command palette
   ══════════════════════════════════════════════════════════════════ */

export interface SearchHit {
  id: string;
  type: "reservation" | "customer" | "company" | "hotel" | "invoice";
  title: string;
  subtitle: string;
  link: string;
}

export const searchRepo = {
  query: (term: string, ctx?: ScopeContext): Promise<SearchHit[]> =>
    read(() => {
      const needle = term.trim().toLowerCase();
      if (needle.length < 2) return [];
      const hits: SearchHit[] = [];

      const reservations = ctx ? scopeRecords(ctx, db.reservations) : db.reservations;
      for (const r of reservations) {
        if (
          r.reference.toLowerCase().includes(needle) ||
          r.customerName.toLowerCase().includes(needle) ||
          r.hotelName.toLowerCase().includes(needle)
        ) {
          hits.push({
            id: r.id, type: "reservation", title: r.reference,
            subtitle: `${r.customerName} · ${r.hotelName} · ${r.checkIn}`,
            link: `/reservations/${r.id}`,
          });
        }
        if (hits.length > 40) break;
      }

      const customers = ctx ? scopeRecords(ctx, db.customers) : db.customers;
      for (const c of customers) {
        if (
          c.fullName.toLowerCase().includes(needle) ||
          c.email.toLowerCase().includes(needle) ||
          c.phone.includes(needle)
        ) {
          hits.push({
            id: c.id, type: "customer", title: c.fullName,
            subtitle: `${c.email}${c.companyName ? ` · ${c.companyName}` : ""}`,
            link: `/crm/customers/${c.id}`,
          });
        }
        if (hits.length > 60) break;
      }

      for (const c of db.companies) {
        if (c.name.toLowerCase().includes(needle) || c.legalName.toLowerCase().includes(needle)) {
          hits.push({
            id: c.id, type: "company", title: c.name,
            subtitle: `${c.industry} · ${c.city}`,
            link: `/crm/companies/${c.id}`,
          });
        }
      }

      for (const h of db.hotels) {
        if (h.name.toLowerCase().includes(needle) || h.city.toLowerCase().includes(needle)) {
          hits.push({
            id: h.id, type: "hotel", title: h.name,
            subtitle: `${h.city}, ${h.state} · ${h.totalRooms} rooms`,
            link: `/hotels/${h.id}`,
          });
        }
      }

      for (const inv of db.invoices) {
        if (inv.number.toLowerCase().includes(needle)) {
          hits.push({
            id: inv.id, type: "invoice", title: inv.number,
            subtitle: `${inv.customerName} · ${inv.status}`,
            link: `/finance/invoices/${inv.id}`,
          });
        }
      }

      return hits.slice(0, 24);
    }),
};
