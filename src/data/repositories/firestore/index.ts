import {
  collection, doc, getDocs, query, where, orderBy, limit,
  addDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { computeTax, CURRENT_GST_VERSION } from "@/lib/tax";
import { ASSIGNABLE_ROLES, type ScopeContext } from "@/lib/permissions";
import { postWebhook, shouldSend } from "@/lib/webhook";

const ROLE_KEYS = ASSIGNABLE_ROLES;
import type {
  Hotel, HotelCommercial, RoomType, Season, Company, Customer, Reservation,
  ReservationRoom, Invoice, Payment, Commission, User, AuditLog, AppNotification,
  NotificationTemplate, AutomationEvent, AutomationEventType, Integration, OrgSettings,
  ListQuery, ListResult, ReservationStatus, ImportEntity,
  InventoryDay, AutomationWorkflow, AutomationRun, AutomationStatus, Invitation,
  WebhookConfig,
} from "@/data/types";
import {
  type Actor, fromDoc, toDoc, getOne, listAll, runQuery, countWhere,
  recordAudit, queueEvent, now,
} from "./helpers";
import {
  HOTEL_DEFAULTS, COMPANY_DEFAULTS, CUSTOMER_DEFAULTS,
} from "./defaults";
import {
  buildVoucher, renderVoucherHtml, renderVoucherEmail,
} from "@/features/reservations/voucher";

export type { Actor };

/* ── The n8n push ──────────────────────────────────────────────────
   See src/lib/webhook.ts for why this is best-effort and why the
   queue, not this call, is the source of truth.                     */

async function pushToN8n(
  event: AutomationEventType,
  entityId: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const config = await getOne<WebhookConfig>("settings", "webhook");
    if (!shouldSend(config, event)) return;

    await postWebhook(config!, {
      event,
      sentAt: new Date().toISOString(),
      source: "fidato-crs",
      eventId: entityId,
      data,
    });
  } catch {
    /* Swallowed on purpose. The automationQueue entry survives, so n8n
       still collects this on its next poll. Surfacing a webhook error
       to someone who just saved a booking would be reporting a failure
       that did not happen. */
  }
}

/* ══════════════════════════════════════════════════════════════════
   FIRESTORE REPOSITORIES

   The Phase 2 implementation behind src/data/repositories/index.ts.
   Method signatures match the Phase 1 mock exactly, which is what
   allows the 34 screens above to be untouched.
   ══════════════════════════════════════════════════════════════════ */

/* ── Hotels ────────────────────────────────────────────────────── */


export const hotelsRepo = {
  list: (q?: ListQuery): Promise<ListResult<Hotel>> =>
    runQuery<Hotel>("hotels", q, {
      filterFields: ["status", "category", "state"],
      searchFields: ["name", "shortName", "city", "state", "address"],
      defaultSort: { field: "name", dir: "asc" },
    }),

  all: (): Promise<Hotel[]> => listAll<Hotel>("hotels", orderBy("name")),

  get: (id: string): Promise<Hotel | null> => getOne<Hotel>("hotels", id),

  /**
   * ⚠️ Commission. Owner and Admin only, enforced by rules on the
   * subcollection. A denied read is EXPECTED for other roles — callers
   * must treat null as "not available", never as an error, or every
   * non-admin sees a failure toast.
   */
  commercial: async (hotelId: string): Promise<HotelCommercial | null> => {
    try {
      return await getOne<HotelCommercial>(`hotels/${hotelId}/private`, "commercial");
    } catch {
      return null;
    }
  },

  setCommercial: async (
    hotelId: string,
    patch: Partial<HotelCommercial>,
    actor: Actor,
  ): Promise<void> => {
    await setDoc(
      doc(db, `hotels/${hotelId}/private`, "commercial"),
      { ...toDoc(patch), hotelId, updatedAt: serverTimestamp(), updatedBy: actor.id },
      { merge: true },
    );
    await recordAudit({
      entityType: "hotel", entityId: hotelId, entityLabel: hotelId,
      action: "updated", summary: "Commercial terms updated", actor,
    });
  },

  roomTypes: (hotelId: string): Promise<RoomType[]> =>
    listAll<RoomType>("roomTypes", where("hotelId", "==", hotelId), orderBy("name")),

  seasons: (hotelId: string): Promise<Season[]> =>
    listAll<Season>("seasons", where("hotelId", "==", hotelId), orderBy("validFrom", "desc")),

  /**
   * Availability grid.
   *
   * ⚠️ Fidato does not own these properties, so this is Fidato's own
   * allotment — not the hotel's true availability. The screen is
   * hidden in Phase 2 (see routes.tsx) because nothing writes to this
   * collection yet; the code is kept so turning it on later is a route
   * change rather than a rebuild.
   */
  inventory: (hotelId: string, from: string, to: string): Promise<InventoryDay[]> =>
    listAll<InventoryDay>(
      "inventory",
      where("hotelId", "==", hotelId),
      where("date", ">=", from),
      where("date", "<=", to),
      orderBy("date"),
    ),

  create: async (input: Partial<Hotel>, actor: Actor): Promise<Hotel> => {
    const ref = await addDoc(collection(db, "hotels"), {
      ...HOTEL_DEFAULTS,
      ...toDoc(input),
      createdAt: serverTimestamp(), createdBy: actor.id,
      updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    await recordAudit({
      entityType: "hotel", entityId: ref.id, entityLabel: input.name ?? ref.id,
      action: "created", summary: `Property ${input.name} onboarded`, actor,
    });
    await queueEvent({
      type: "hotel.created", entityType: "hotel", entityId: ref.id,
      entityLabel: input.name ?? ref.id, actor,
    });
    return (await getOne<Hotel>("hotels", ref.id))!;
  },

  update: async (id: string, patch: Partial<Hotel>, actor: Actor): Promise<Hotel> => {
    await updateDoc(doc(db, "hotels", id), {
      ...toDoc(patch), updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    const updated = (await getOne<Hotel>("hotels", id))!;
    await recordAudit({
      entityType: "hotel", entityId: id, entityLabel: updated.name,
      action: "updated", summary: "Property details updated", actor,
    });
    return updated;
  },
};

/* ── Room configuration ────────────────────────────────────────── */

export const roomConfigRepo = {
  createRoomType: async (input: Partial<RoomType>, actor: Actor): Promise<RoomType> => {
    const ref = await addDoc(collection(db, "roomTypes"), {
      ...toDoc(input),
      createdAt: serverTimestamp(), createdBy: actor.id,
      updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    return (await getOne<RoomType>("roomTypes", ref.id))!;
  },

  updateRoomType: async (id: string, patch: Partial<RoomType>, actor: Actor): Promise<void> => {
    await updateDoc(doc(db, "roomTypes", id), {
      ...toDoc(patch), updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
  },

  deleteRoomType: (id: string) => deleteDoc(doc(db, "roomTypes", id)),

  createSeason: async (input: Partial<Season>, actor: Actor): Promise<Season> => {
    const ref = await addDoc(collection(db, "seasons"), {
      ...toDoc(input),
      createdAt: serverTimestamp(), createdBy: actor.id,
      updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    return (await getOne<Season>("seasons", ref.id))!;
  },

  updateSeason: async (id: string, patch: Partial<Season>, actor: Actor): Promise<void> => {
    await updateDoc(doc(db, "seasons", id), {
      ...toDoc(patch), updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
  },

  deleteSeason: (id: string) => deleteDoc(doc(db, "seasons", id)),

  /**
   * The season applying to a date. Newest `validFrom` first, so a
   * specific short season overrides a broad one where they overlap.
   */
  seasonFor: async (hotelId: string, date: string): Promise<Season | null> => {
    const seasons = await listAll<Season>(
      "seasons",
      where("hotelId", "==", hotelId),
      orderBy("validFrom", "desc"),
    );
    return (
      seasons.find((s) => s.isActive && s.validFrom <= date && s.validTo >= date) ?? null
    );
  },
};

/* ── Companies ─────────────────────────────────────────────────── */


export const companiesRepo = {
  list: (q?: ListQuery, ctx?: ScopeContext): Promise<ListResult<Company>> =>
    runQuery<Company>("companies", q, {
      filterFields: ["status", "tier"],
      searchFields: ["name", "legalName", "city", "industry", "email", "gstin"],
      defaultSort: { field: "name", dir: "asc" },
      scope: ctx,
    }),

  all: (ctx?: ScopeContext): Promise<Company[]> =>
    ctx?.role === "salesperson"
      ? listAll<Company>("companies", where("ownerId", "==", ctx.userId), orderBy("name"))
      : listAll<Company>("companies", orderBy("name")),

  get: (id: string): Promise<Company | null> => getOne<Company>("companies", id),

  create: async (input: Partial<Company>, actor: Actor): Promise<Company> => {
    const ref = await addDoc(collection(db, "companies"), {
      ...COMPANY_DEFAULTS,
      ...toDoc(input),
      ownerId: input.ownerId ?? actor.id,
      ownerName: input.ownerName ?? actor.name,
      creditUsed: 0, totalReservations: 0, totalRevenue: 0,
      lastActivityAt: serverTimestamp(),
      createdAt: serverTimestamp(), createdBy: actor.id,
      updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    await recordAudit({
      entityType: "company", entityId: ref.id, entityLabel: input.name ?? ref.id,
      action: "created", summary: `Company ${input.name} created`, actor,
    });
    await queueEvent({
      type: "company.created", entityType: "company", entityId: ref.id,
      entityLabel: input.name ?? ref.id, actor,
    });
    return (await getOne<Company>("companies", ref.id))!;
  },

  update: async (id: string, patch: Partial<Company>, actor: Actor): Promise<Company> => {
    await updateDoc(doc(db, "companies", id), {
      ...toDoc(patch), updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    const updated = (await getOne<Company>("companies", id))!;
    await recordAudit({
      entityType: "company", entityId: id, entityLabel: updated.name,
      action: "updated", summary: "Company updated", actor,
    });
    return updated;
  },
};

/* ── Customers ─────────────────────────────────────────────────── */


export const customersRepo = {
  list: (q?: ListQuery, ctx?: ScopeContext): Promise<ListResult<Customer>> =>
    runQuery<Customer>("customers", q, {
      filterFields: ["status", "source"],
      searchFields: ["fullName", "email", "phone", "city", "companyName"],
      defaultSort: { field: "fullName", dir: "asc" },
      scope: ctx,
    }),

  all: (ctx?: ScopeContext): Promise<Customer[]> =>
    ctx?.role === "salesperson"
      ? listAll<Customer>("customers", where("ownerId", "==", ctx.userId), orderBy("fullName"))
      : listAll<Customer>("customers", orderBy("fullName")),

  get: (id: string): Promise<Customer | null> => getOne<Customer>("customers", id),

  reservations: (customerId: string): Promise<Reservation[]> =>
    listAll<Reservation>(
      "reservations",
      where("customerId", "==", customerId),
      orderBy("checkIn", "desc"),
      limit(100),
    ),

  /** Contacts belonging to a company — the company detail screen. */
  forCompany: (companyId: string): Promise<Customer[]> =>
    listAll<Customer>(
      "customers",
      where("companyId", "==", companyId),
      orderBy("fullName"),
      limit(100),
    ),

  /**
   * Uniqueness check (BR-06). Uses normalised fields, which exist
   * precisely because Firestore cannot index a computed value.
   */
  findDuplicate: async (
    email: string,
    phone: string,
    ignoreId?: string,
  ): Promise<{ byEmail?: Customer; byPhone?: Customer }> => {
    const emailKey = email.trim().toLowerCase();
    const phoneKey = phone.replace(/\D/g, "").slice(-10);
    const out: { byEmail?: Customer; byPhone?: Customer } = {};

    if (emailKey) {
      const snap = await getDocs(
        query(collection(db, "customers"), where("emailNormalised", "==", emailKey), limit(2)),
      );
      const hit = snap.docs.map((d) => fromDoc<Customer>(d)).find((c) => c.id !== ignoreId);
      if (hit) out.byEmail = hit;
    }
    if (phoneKey.length === 10) {
      const snap = await getDocs(
        query(collection(db, "customers"), where("phoneNormalised", "==", phoneKey), limit(2)),
      );
      const hit = snap.docs.map((d) => fromDoc<Customer>(d)).find((c) => c.id !== ignoreId);
      if (hit) out.byPhone = hit;
    }
    return out;
  },

  create: async (input: Partial<Customer>, actor: Actor): Promise<Customer> => {
    const fullName = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
    const ref = await addDoc(collection(db, "customers"), {
      ...CUSTOMER_DEFAULTS,
      ...toDoc(input),
      fullName,
      emailNormalised: (input.email ?? "").trim().toLowerCase(),
      phoneNormalised: (input.phone ?? "").replace(/\D/g, "").slice(-10),
      ownerId: input.ownerId ?? actor.id,
      ownerName: input.ownerName ?? actor.name,
      totalReservations: 0, totalRevenue: 0,
      lastActivityAt: serverTimestamp(),
      createdAt: serverTimestamp(), createdBy: actor.id,
      updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    await recordAudit({
      entityType: "customer", entityId: ref.id, entityLabel: fullName,
      action: "created", summary: `Customer ${fullName} created`, actor,
    });
    await queueEvent({
      type: "customer.created", entityType: "customer", entityId: ref.id,
      entityLabel: fullName, actor,
    });
    return (await getOne<Customer>("customers", ref.id))!;
  },

  update: async (id: string, patch: Partial<Customer>, actor: Actor): Promise<Customer> => {
    const fullName =
      patch.firstName || patch.lastName
        ? `${patch.firstName ?? ""} ${patch.lastName ?? ""}`.trim()
        : undefined;
    await updateDoc(doc(db, "customers", id), {
      ...toDoc(patch),
      ...(fullName ? { fullName } : {}),
      ...(patch.email ? { emailNormalised: patch.email.trim().toLowerCase() } : {}),
      ...(patch.phone ? { phoneNormalised: patch.phone.replace(/\D/g, "").slice(-10) } : {}),
      updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    const updated = (await getOne<Customer>("customers", id))!;
    await recordAudit({
      entityType: "customer", entityId: id, entityLabel: updated.fullName,
      action: "updated", summary: "Customer updated", actor,
    });
    return updated;
  },

  /**
   * Groups records that look like the same person.
   *
   * ⚠️ Bounded to the most recent 1,000 customers. Firestore cannot
   * group server-side without an aggregation pipeline, so this is a
   * client-side pass over a window. It is a review tool, not a
   * guarantee that the whole book is clean — the uniqueness rule at
   * write time is what actually prevents duplicates.
   */
  duplicates: async (ctx?: ScopeContext): Promise<DuplicateGroup[]> => {
    const rows = await listAll<Customer>(
      "customers",
      orderBy("createdAt", "desc"),
      limit(DUPLICATE_SCAN_LIMIT),
    );
    const scoped =
      ctx?.role === "salesperson" ? rows.filter((c) => c.ownerId === ctx.userId) : rows;
    const live = scoped.filter((c) => !c.mergedIntoId);

    const groups: DuplicateGroup[] = [];
    // Strongest signal first. A record already claimed by a stronger
    // reason is not offered again under a weaker one, or the same pair
    // appears three times.
    const claimed = new Set<string>();

    const collect = (
      reason: DuplicateGroup["reason"],
      keyOf: (c: Customer) => string,
    ) => {
      const buckets = new Map<string, Customer[]>();
      for (const c of live) {
        if (claimed.has(c.id)) continue;
        const key = keyOf(c);
        if (!key) continue;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(c);
        else buckets.set(key, [c]);
      }
      for (const [key, records] of buckets) {
        if (records.length < 2) continue;
        records.forEach((r) => claimed.add(r.id));
        groups.push({ reason, key, records });
      }
    };

    collect("phone", (c) => (c.phone ?? "").replace(/\D/g, "").slice(-10).padStart(10, "").trim());
    collect("email", (c) => (c.email ?? "").trim().toLowerCase());
    collect("name", (c) => (c.fullName ?? "").trim().toLowerCase());

    return groups.filter((g) => g.key.length > 2);
  },

  /**
   * Folds records into one.
   *
   * ⚠️ Absorbed records are marked, never deleted. Reservations and
   * invoices are re-pointed at the survivor so history follows the
   * person rather than the row that happened to be typed first.
   */
  merge: async (
    survivorId: string,
    absorbedIds: string[],
    patch: Partial<Customer>,
    actor: Actor,
  ): Promise<Customer> => {
    const survivor = await getOne<Customer>("customers", survivorId);
    if (!survivor) throw new Error("Survivor record not found");

    for (const absorbedId of absorbedIds) {
      const [reservations, invoices] = await Promise.all([
        listAll<Reservation>("reservations", where("customerId", "==", absorbedId), limit(400)),
        listAll<Invoice>("invoices", where("customerId", "==", absorbedId), limit(400)),
      ]);

      const batch = writeBatch(db);
      for (const r of reservations) {
        batch.update(doc(db, "reservations", r.id), {
          customerId: survivorId, customerName: survivor.fullName,
        });
      }
      for (const i of invoices) {
        batch.update(doc(db, "invoices", i.id), {
          customerId: survivorId, customerName: survivor.fullName,
        });
      }
      batch.update(doc(db, "customers", absorbedId), {
        mergedIntoId: survivorId,
        status: "inactive",
        updatedAt: serverTimestamp(), updatedBy: actor.id,
      });
      await batch.commit();
    }

    await updateDoc(doc(db, "customers", survivorId), {
      ...toDoc(patch),
      updatedAt: serverTimestamp(), updatedBy: actor.id,
    });

    const updated = (await getOne<Customer>("customers", survivorId))!;
    await recordAudit({
      entityType: "customer", entityId: survivorId, entityLabel: updated.fullName,
      action: "merged",
      summary: `${absorbedIds.length} record${absorbedIds.length === 1 ? "" : "s"} merged in`,
      detail: absorbedIds.join(", "),
      actor,
    });
    return updated;
  },
};

/** A set of customer records that look like the same person. */
export interface DuplicateGroup {
  reason: "phone" | "email" | "name";
  /** The value they share — shown so the reviewer sees *why*. */
  key: string;
  records: Customer[];
}

const DUPLICATE_SCAN_LIMIT = 1_000;

/* ── Reservations ──────────────────────────────────────────────── */

export interface CreateReservationInput {
  customerId: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  rooms: ReservationRoom[];
  paymentTerm: Reservation["paymentTerm"];
  channel?: Reservation["channel"];
  specialRequests?: string;
  internalNotes?: string;

  /* At least one of these is required — see hasHotelConfirmation. */
  hotelConfirmationNumber?: string;
  hotelRepName?: string;
  confirmedAt?: string;

  /**
   * Who the booking belongs to. Defaults to whoever is creating it.
   *
   * ⚠️ A CRS Manager books on behalf of a salesperson, so the owner is
   * not always the author. `ownerId` drives the salesperson's list, the
   * row-level scoping and commission attribution; `createdBy` still
   * records who actually typed it, and the audit entry names them.
   */
  ownerId?: string;
  ownerName?: string;
}

/**
 * A booking must carry proof the property accepted it.
 *
 * ⚠️ Any one of the three is enough, but not none. Fidato does not own
 * these hotels — without a confirmation number, a name, or at minimum a
 * time, there is nothing to quote back to the property when a guest
 * arrives and reception has no record.
 */
export function hasHotelConfirmation(input: {
  hotelConfirmationNumber?: string;
  hotelRepName?: string;
  confirmedAt?: string;
}): boolean {
  return Boolean(
    input.hotelConfirmationNumber?.trim() ||
      input.hotelRepName?.trim() ||
      input.confirmedAt?.trim(),
  );
}

/** Pre-tax value of one room line across all rooms and nights. */
export function lineTotal(room: ReservationRoom, nights: number): number {
  return (
    (room.sellingRate * room.quantity + room.extraBedRate * room.extraBeds +
      room.childRate * room.children) * nights
  );
}

export const reservationsRepo = {
  list: (q?: ListQuery, ctx?: ScopeContext): Promise<ListResult<Reservation>> =>
    runQuery<Reservation>("reservations", q, {
      filterFields: ["status", "channel", "paymentTerm"],
      searchFields: ["reference", "customerName", "companyName", "hotelName", "hotelCity"],
      defaultSort: { field: "checkIn", dir: "desc" },
      scope: ctx,
    }),

  get: (id: string): Promise<Reservation | null> => getOne<Reservation>("reservations", id),


  daySheet: async (date: string, ctx?: ScopeContext) => {
    const live = ["confirmed", "checked_in"];
    const [arrivals, departures] = await Promise.all([
      listAll<Reservation>("reservations", where("checkIn", "==", date), limit(50)),
      listAll<Reservation>("reservations", where("checkOut", "==", date), limit(50)),
    ]);
    const scope = (rows: Reservation[]) =>
      ctx?.role === "salesperson" ? rows.filter((r) => r.ownerId === ctx.userId) : rows;
    return {
      arrivals: scope(arrivals.filter((r) => live.includes(r.status))),
      departures: scope(departures.filter((r) => live.includes(r.status))),
      inHouse: scope(
        await listAll<Reservation>("reservations", where("status", "==", "checked_in"), limit(100)),
      ),
    };
  },

  inRange: (from: string, to: string, ctx?: ScopeContext): Promise<Reservation[]> =>
    listAll<Reservation>(
      "reservations",
      where("checkIn", ">=", from),
      where("checkIn", "<=", to),
      orderBy("checkIn"),
      limit(500),
    ).then((rows) =>
      ctx?.role === "salesperson" ? rows.filter((r) => r.ownerId === ctx.userId) : rows,
    ),

  forHotel: (hotelId: string): Promise<Reservation[]> =>
    listAll<Reservation>(
      "reservations",
      where("hotelId", "==", hotelId),
      orderBy("checkIn", "desc"),
      limit(100),
    ),

  forCompany: (companyId: string): Promise<Reservation[]> =>
    listAll<Reservation>(
      "reservations",
      where("companyId", "==", companyId),
      orderBy("checkIn", "desc"),
      limit(100),
    ),

  audit: (reservationId: string): Promise<AuditLog[]> =>
    listAll<AuditLog>(
      "auditLogs",
      where("entityType", "==", "reservation"),
      where("entityId", "==", reservationId),
      orderBy("at", "desc"),
      limit(50),
    ),

  /**
   * Prices a booking without committing it. The wizard calls this on
   * every change; `create` calls the same function, so a confirmed
   * price can never differ from the quoted one.
   *
   * ⚠️ Tax is computed PER LINE and summed. A reservation may contain
   * both GST bands — a ₹6,000 Deluxe and a ₹9,000 Suite. Computing on
   * the total is a tax error, not a rounding difference.
   */
  quote: (rooms: ReservationRoom[], nights: number, company?: Company | null) => {
    const roomCharges = rooms.reduce((s, r) => s + lineTotal(r, nights), 0);
    const discountPercent = company?.negotiatedDiscountPercent ?? 0;
    const discountAmount = Math.round((roomCharges * discountPercent) / 100);

    // The discount reduces each line proportionally, so the band each
    // line falls into is unaffected — the band follows the tariff.
    const factor = roomCharges > 0 ? (roomCharges - discountAmount) / roomCharges : 1;
    const tax = computeTax(
      rooms.map((r) => ({
        sellingRate: r.sellingRate,
        taxableAmount: lineTotal(r, nights) * factor,
      })),
    );

    const taxable = roomCharges - discountAmount;
    const totalAmount = taxable + tax.taxAmount;

    return {
      roomCharges,
      discountPercent,
      discountAmount,
      taxAmount: tax.taxAmount,
      taxByBand: tax.byBand,
      gstRate: tax.effectiveRate,
      totalAmount,
      companyName: company?.name,
    };
  },

  create: async (input: CreateReservationInput, actor: Actor): Promise<Reservation> => {
    const [customer, hotel] = await Promise.all([
      getOne<Customer>("customers", input.customerId),
      getOne<Hotel>("hotels", input.hotelId),
    ]);
    if (!customer) throw new Error("Customer not found");
    if (!hotel) throw new Error("Hotel not found");

    // BR-10 — bill to company requires a company.
    if (input.paymentTerm === "BTC" && !customer.companyId) {
      throw new Error("Bill to company requires the customer to belong to a company");
    }

    /* ⚠️ Enforced here, not only in the wizard. The form is one caller;
       the import and n8n are others, and a booking with no proof the
       property accepted it is unusable at the front desk. */
    if (!hasHotelConfirmation(input)) {
      throw new Error(
        "A booking needs the hotel's confirmation number, the name of who confirmed it, or the time it was confirmed",
      );
    }

    const company = customer.companyId
      ? await getOne<Company>("companies", customer.companyId)
      : null;

    const nights = Math.max(
      1,
      Math.round(
        (new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / 86_400_000,
      ),
    );
    const quote = reservationsRepo.quote(input.rooms, nights, company);

    const reference = await nextReference();

    const reservation = {
      reference,
      /* ⚠️ Confirms immediately. The approval queue was removed —
         a booking is the salesperson's to make. */
      status: "confirmed" as ReservationStatus,
      channel: input.channel ?? "direct_sales",
      paymentTerm: input.paymentTerm,

      /* ⚠️ Every denormalised field is coalesced, and it is not
         defensive noise. Firestore rejects a write containing ANY
         undefined value — the whole transaction aborts, nothing is
         saved, and the wizard can only say "could not create".

         A customer with no phone, or a property typed into the console
         without a city, is enough to do it. `toDoc()` strips undefined
         elsewhere, but it is shallow and this object nests `guests`,
         so the fallbacks have to live here. */
      customerId: customer.id, customerName: customer.fullName ?? "",
      ...(company ? { companyId: company.id, companyName: company.name ?? "" } : {}),
      hotelId: hotel.id, hotelName: hotel.name ?? "", hotelCity: hotel.city ?? "",

      checkIn: input.checkIn, checkOut: input.checkOut, nights,
      rooms: input.rooms,
      guests: [{
        name: customer.fullName ?? "", email: customer.email ?? "",
        phone: customer.phone ?? "", isPrimary: true,
      }],
      totalRooms: input.rooms.reduce((s, r) => s + r.quantity, 0),
      totalAdults: input.rooms.reduce((s, r) => s + r.adults * r.quantity, 0),
      totalChildren: input.rooms.reduce((s, r) => s + r.children, 0),

      roomCharges: quote.roomCharges,
      extrasCharges: 0,
      discountAmount: quote.discountAmount,
      taxAmount: quote.taxAmount,
      totalAmount: quote.totalAmount,
      gstVersion: CURRENT_GST_VERSION,
      gstRate: quote.gstRate,

      ownerId: input.ownerId ?? actor.id,
      ownerName: input.ownerName ?? actor.name,

      ...(input.hotelConfirmationNumber
        ? { hotelConfirmationNumber: input.hotelConfirmationNumber.trim() }
        : {}),
      ...(input.hotelRepName ? { hotelRepName: input.hotelRepName.trim() } : {}),
      confirmedAt: input.confirmedAt || new Date().toISOString(),
      specialRequests: input.specialRequests ?? "",
      internalNotes: input.internalNotes ?? "",

      createdAt: serverTimestamp(), createdBy: actor.id,
      updatedAt: serverTimestamp(), updatedBy: actor.id,
    };

    /* Reservation and its roll-ups in one transaction, so a partial
       write can never leave a customer's totals disagreeing with their
       bookings. */
    const ref = doc(collection(db, "reservations"));
    await runTransaction(db, async (tx) => {
      const customerRef = doc(db, "customers", customer.id);
      const snap = await tx.get(customerRef);
      tx.set(ref, reservation);
      tx.update(customerRef, {
        totalReservations: (snap.data()?.totalReservations ?? 0) + 1,
        totalRevenue: (snap.data()?.totalRevenue ?? 0) + quote.totalAmount,
        lastActivityAt: serverTimestamp(),
      });
      if (company) {
        const companyRef = doc(db, "companies", company.id);
        const cSnap = await tx.get(companyRef);
        tx.update(companyRef, {
          totalReservations: (cSnap.data()?.totalReservations ?? 0) + 1,
          totalRevenue: (cSnap.data()?.totalRevenue ?? 0) + quote.totalAmount,
          lastActivityAt: serverTimestamp(),
        });
      }
    });

    await recordAudit({
      entityType: "reservation", entityId: ref.id, entityLabel: reference,
      action: "created",
      summary: `Reservation created for ${customer.fullName} at ${hotel.name}`,
      detail: `${reservation.totalRooms} room(s), ${nights} night(s), check-in ${input.checkIn}`,
      actor,
    });
    await queueEvent({
      type: "reservation.created", entityType: "reservation", entityId: ref.id,
      entityLabel: reference, actor,
    });

    const created = (await getOne<Reservation>("reservations", ref.id))!;

    /* ⚠️ Best-effort push so n8n acts now rather than on its next poll.
       Deliberately NOT awaited into the caller's success path: the
       booking is already committed and the queued event above is the
       durable record. A failed webhook must never make a saved
       reservation look like it failed. */
    /* ⚠️ The rendered voucher travels WITH the event, rather than n8n
       rebuilding it. Two reasons, both learned the expensive way:

         · n8n cannot read Firestore on Spark without credentials this
           architecture deliberately does not hand out, and
         · a second implementation of the voucher in n8n would drift
           from this one the first time a rate or a policy changed, and
           the guest's copy would stop matching the folio.

       So the app renders once and n8n only delivers. `email.html` is
       the body to send; `voucher.html` is the A4 sheet to turn into
       the PDF for Drive; `to` is where it goes. */
    const voucher = buildVoucher({
      reservation: created,
      hotel,
      customer,
      company,
      org: await adminRepo.settings().catch(() => null),
    });
    const mail = renderVoucherEmail(voucher);

    void pushToN8n("reservation.created", ref.id, {
      reservation: created,
      customer,
      company,
      hotel,
      /* Everything the delivery side needs, pre-rendered. */
      to: customer.email ?? "",
      guestPhone: customer.phone ?? "",
      email: { subject: mail.subject, html: mail.html, text: mail.text },
      voucher: {
        reference: created.reference,
        html: renderVoucherHtml(voucher),
        filename: `Voucher-${created.reference}.pdf`,
        model: voucher,
      },
    });

    return created;
  },

  setStatus: async (
    id: string,
    status: ReservationStatus,
    actor: Actor,
    extra?: { reason?: string; note?: string },
  ): Promise<Reservation> => {
    const current = await getOne<Reservation>("reservations", id);
    if (!current) throw new Error("Reservation not found");

    await updateDoc(doc(db, "reservations", id), {
      status,
      ...(status === "cancelled" && {
        cancelledAt: serverTimestamp(),
        cancelledBy: actor.name,
        cancellationReason: extra?.reason ?? "No reason recorded",
      }),
      updatedAt: serverTimestamp(), updatedBy: actor.id,
    });

    await recordAudit({
      entityType: "reservation", entityId: id, entityLabel: current.reference,
      action: status === "cancelled" ? "cancelled"
        : "status_changed",
      summary: `Status changed to ${status}`,
      ...(extra?.reason ? { detail: extra.reason } : {}),
      actor,
    });

    const eventType =
      status === "cancelled" ? "reservation.cancelled"
      : status === "checked_in" ? "reservation.checked_in"
      : status === "completed" ? "reservation.checked_out"
      : "reservation.confirmed";
    await queueEvent({
      type: eventType, entityType: "reservation", entityId: id,
      entityLabel: current.reference, actor,
    });

    return (await getOne<Reservation>("reservations", id))!;
  },

  /** Records the property's own confirmation, after the fact. */
  recordHotelConfirmation: async (
    id: string,
    input: { hotelConfirmationNumber: string; hotelRepName: string; confirmedAt: string },
    actor: Actor,
  ): Promise<Reservation> => {
    await updateDoc(doc(db, "reservations", id), {
      ...input, updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    const updated = (await getOne<Reservation>("reservations", id))!;
    await recordAudit({
      entityType: "reservation", entityId: id, entityLabel: updated.reference,
      action: "updated",
      summary: `Hotel confirmation ${input.hotelConfirmationNumber} recorded`,
      detail: `Confirmed by ${input.hotelRepName}`,
      actor,
    });
    return updated;
  },
};

/** Monotonic reference, from a counter document. */
async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  return runTransaction(db, async (tx) => {
    const ref = doc(db, "counters", "reservations");
    const snap = await tx.get(ref);
    const period = String(year);
    const next = snap.exists() && snap.data().period === period ? snap.data().next + 1 : 1;
    tx.set(ref, { period, next });
    return `FH-${year}-${String(next).padStart(5, "0")}`;
  });
}

/* ── Finance ───────────────────────────────────────────────────── */

export const financeRepo = {
  invoices: (q?: ListQuery): Promise<ListResult<Invoice>> =>
    runQuery<Invoice>("invoices", q, {
      filterFields: ["status"],
      searchFields: ["number", "reservationReference", "customerName", "companyName", "hotelName"],
      defaultSort: { field: "issueDate", dir: "desc" },
    }),

  invoice: (id: string): Promise<Invoice | null> => getOne<Invoice>("invoices", id),

  payments: (q?: ListQuery): Promise<ListResult<Payment>> =>
    runQuery<Payment>("payments", q, {
      filterFields: ["method"],
      searchFields: ["reference", "invoiceNumber", "customerName"],
      defaultSort: { field: "receivedAt", dir: "desc" },
    }),

  paymentsForInvoice: (invoiceId: string): Promise<Payment[]> =>
    listAll<Payment>("payments", where("invoiceId", "==", invoiceId), orderBy("receivedAt", "desc")),

  commissions: (q?: ListQuery): Promise<ListResult<Commission>> =>
    runQuery<Commission>("commissions", q, {
      filterFields: ["status"],
      searchFields: ["reservationReference", "hotelName", "ownerName"],
      defaultSort: { field: "periodMonth", dir: "desc" },
    }),

  /**
   * Totals for the invoices list strip.
   *
   * ⚠️ Bounded. Reading every invoice to sum it costs one read per
   * document per view, which on Spark's 50k daily budget is how a
   * dashboard quietly exhausts the quota.
   */
  invoiceTotals: async () => {
    const [count, overdue] = await Promise.all([
      countWhere("invoices"),
      listAll<Invoice>("invoices", where("status", "==", "overdue"), limit(200)),
    ]);
    const recent = await listAll<Invoice>("invoices", orderBy("issueDate", "desc"), limit(200));
    return {
      count,
      collected: recent.reduce((s, i) => s + (i.amountPaid ?? 0), 0),
      outstanding: recent.reduce((s, i) => s + (i.amountDue ?? 0), 0),
      overdueCount: overdue.length,
      overdueValue: overdue.reduce((s, i) => s + i.amountDue, 0),
    };
  },

  paymentTotals: async () => {
    const recent = await listAll<Payment>("payments", orderBy("receivedAt", "desc"), limit(200));
    const unreconciled = recent.filter((p) => !p.reconciled);
    return {
      count: recent.length,
      received: recent.reduce((s, p) => s + p.amount, 0),
      unreconciledCount: unreconciled.length,
      unreconciledValue: unreconciled.reduce((s, p) => s + p.amount, 0),
    };
  },

  recordPayment: async (
    invoiceId: string,
    amount: number,
    method: Payment["method"],
    actor: Actor,
  ): Promise<Payment> => {
    const paymentRef = doc(collection(db, "payments"));

    await runTransaction(db, async (tx) => {
      const invoiceRef = doc(db, "invoices", invoiceId);
      const snap = await tx.get(invoiceRef);
      if (!snap.exists()) throw new Error("Invoice not found");
      const invoice = snap.data() as Invoice;

      const amountPaid = (invoice.amountPaid ?? 0) + amount;
      const amountDue = invoice.totalAmount - amountPaid;

      tx.set(paymentRef, {
        reference: `RCP-${Date.now().toString(36).toUpperCase()}`,
        invoiceId, invoiceNumber: invoice.number,
        customerId: invoice.customerId, customerName: invoice.customerName,
        amount, method, receivedAt: serverTimestamp(), reconciled: false, note: "",
        createdAt: serverTimestamp(), createdBy: actor.id,
        updatedAt: serverTimestamp(), updatedBy: actor.id,
      });
      tx.update(invoiceRef, {
        amountPaid, amountDue,
        status: amountDue <= 0 ? "paid" : "partially_paid",
        updatedAt: serverTimestamp(), updatedBy: actor.id,
      });
    });

    await recordAudit({
      entityType: "invoice", entityId: invoiceId, entityLabel: invoiceId,
      action: "updated", summary: `Payment of ${amount} recorded`, actor,
    });
    await queueEvent({
      type: "payment.recorded", entityType: "payment", entityId: paymentRef.id,
      entityLabel: String(amount), actor,
    });

    return (await getOne<Payment>("payments", paymentRef.id))!;
  },
};

/* ── Admin ─────────────────────────────────────────────────────── */

export const adminRepo = {
  users: (q?: ListQuery): Promise<ListResult<User>> =>
    runQuery<User>("users", q, {
      filterFields: ["role", "status"],
      searchFields: ["name", "email", "department", "branch"],
      defaultSort: { field: "name", dir: "asc" },
    }),

  user: (id: string): Promise<User | null> => getOne<User>("users", id),

  allUsers: (): Promise<User[]> => listAll<User>("users", orderBy("name")),

  /**
   * Creates the invitation. The person completes sign-up themselves.
   *
   * ⚠️ Writes to `invitations/{email}`, not to `users`. The user
   * document cannot exist until the person has an auth uid, because
   * the security rules find a profile at `users/{uid}` — see the note
   * on the Invitation type. Re-inviting the same address overwrites
   * the pending invitation rather than creating a second one.
   */
  invite: async (input: Partial<Invitation>, actor: Actor): Promise<Invitation> => {
    const email = (input.email ?? "").trim().toLowerCase();
    if (!email) throw new Error("An email address is required to invite someone.");

    await setDoc(doc(db, "invitations", email), {
      ...toDoc(input),
      email,
      invitedAt: serverTimestamp(),
      invitedBy: actor.id,
      invitedByName: actor.name,
    });

    await recordAudit({
      entityType: "user", entityId: email, entityLabel: input.name ?? email,
      action: "created", summary: `${input.name} invited as ${input.role}`, actor,
    });
    await queueEvent({
      type: "user.invited", entityType: "user", entityId: email,
      entityLabel: email, actor,
    });
    return (await getOne<Invitation>("invitations", email))!;
  },

  /** Invitations nobody has claimed yet. */
  invitations: (): Promise<Invitation[]> =>
    listAll<Invitation>("invitations", orderBy("invitedAt", "desc"), limit(100)),

  /** Withdraws an unclaimed invitation. */
  revokeInvitation: async (email: string, actor: Actor): Promise<void> => {
    await deleteDoc(doc(db, "invitations", email.trim().toLowerCase()));
    await recordAudit({
      entityType: "user", entityId: email, entityLabel: email,
      action: "deleted", summary: "Invitation withdrawn", actor,
    });
  },

  updateUser: async (id: string, patch: Partial<User>, actor: Actor): Promise<User> => {
    await updateDoc(doc(db, "users", id), {
      ...toDoc(patch), updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    const updated = (await getOne<User>("users", id))!;
    await recordAudit({
      entityType: "user", entityId: id, entityLabel: updated.name,
      action: "updated", summary: "User record updated", actor,
    });
    return updated;
  },

  auditLog: (q?: ListQuery): Promise<ListResult<AuditLog>> =>
    runQuery<AuditLog>("auditLogs", q, {
      filterFields: ["entityType", "action"],
      searchFields: ["entityLabel", "summary", "actorName", "detail"],
      defaultSort: { field: "at", dir: "desc" },
    }),

  /** Counts for the users and roles screens. One read each. */
  userStats: async () => {
    const [total, active, ...byRole] = await Promise.all([
      countWhere("users"),
      countWhere("users", where("status", "==", "active")),
      ...ROLE_KEYS.map((r) => countWhere("users", where("role", "==", r))),
    ]);
    return {
      total,
      active,
      byRole: Object.fromEntries(ROLE_KEYS.map((r, i) => [r, byRole[i] ?? 0])),
    };
  },

  auditStats: async () => {
    const recent = await listAll<AuditLog>("auditLogs", orderBy("at", "desc"), limit(200));
    return {
      total: recent.length,
      actors: new Set(recent.map((a) => a.actorId)).size,
      cancellations: recent.filter((a) => a.action === "cancelled").length,
    };
  },

  integrations: (): Promise<Integration[]> => listAll<Integration>("integrations"),

  settings: async (): Promise<OrgSettings> =>
    (await getOne<OrgSettings>("settings", "org")) ?? ({} as OrgSettings),

  updateSettings: async (patch: Partial<OrgSettings>): Promise<OrgSettings> => {
    await setDoc(doc(db, "settings", "org"), toDoc(patch), { merge: true });
    return (await getOne<OrgSettings>("settings", "org"))!;
  },

  /**
   * The n8n webhook configuration.
   *
   * ⚠️ Lives in `settings`, which every active user can read. See the
   * note on WebhookConfig — the URL is a destination, not a credential.
   */
  webhook: async (): Promise<WebhookConfig | null> =>
    getOne<WebhookConfig>("settings", "webhook"),

  saveWebhook: async (patch: Partial<WebhookConfig>, actor: Actor): Promise<WebhookConfig> => {
    await setDoc(
      doc(db, "settings", "webhook"),
      { ...toDoc(patch), updatedAt: serverTimestamp(), updatedBy: actor.id },
      { merge: true },
    );
    await recordAudit({
      entityType: "integration", entityId: "webhook", entityLabel: "n8n webhook",
      action: "updated",
      summary: patch.enabled === false ? "Webhook disabled" : "Webhook configuration saved",
      actor,
    });
    return (await getOne<WebhookConfig>("settings", "webhook"))!;
  },

  /** The queue viewer. Read-only in Phase 2. */
  automationQueue: (q?: ListQuery): Promise<ListResult<AutomationEvent>> =>
    runQuery<AutomationEvent>("automationQueue", q, {
      filterFields: ["status", "type"],
      searchFields: ["entityLabel", "type"],
      defaultSort: { field: "createdAt", dir: "desc" },
    }),
};

/* ── Automation ────────────────────────────────────────────────────
   Phase 2 writes events and shows the queue. It does not process
   anything — n8n does that in Phase 2.5.                            */

export const automationRepo = {
  queue: (q?: ListQuery): Promise<ListResult<AutomationEvent>> =>
    runQuery<AutomationEvent>("automationQueue", q, {
      filterFields: ["status", "type", "entityType"],
      searchFields: ["entityLabel", "type"],
      defaultSort: { field: "createdAt", dir: "desc" },
    }),

  queueStats: async () => {
    const [pending, failed, done] = await Promise.all([
      countWhere("automationQueue", where("status", "==", "pending")),
      countWhere("automationQueue", where("status", "==", "failed")),
      countWhere("automationQueue", where("status", "==", "done")),
    ]);
    const total = pending + failed + done;
    return {
      pending, failed, done, total,
      successRate: total > 0 ? (done / total) * 100 : 100,
    };
  },

  /** Requeues a dead-lettered event. Owner and Admin only. */
  retry: async (id: string): Promise<void> => {
    await updateDoc(doc(db, "automationQueue", id), {
      status: "pending", attempts: 0, lastError: null,
    });
  },

  /**
   * The workflow registry.
   *
   * ⚠️ These documents DESCRIBE the n8n workflows; they do not contain
   * them. n8n owns the logic and writes its catalogue here so the app
   * can show what is running without ever calling n8n directly. Empty
   * until Phase 2.5 populates it — which is why the screen leads with
   * an empty state rather than a spinner.
   */
  workflows: (): Promise<AutomationWorkflow[]> =>
    listAll<AutomationWorkflow>("automationWorkflows", orderBy("name")),

  workflow: (id: string): Promise<AutomationWorkflow | null> =>
    getOne<AutomationWorkflow>("automationWorkflows", id),

  runsForWorkflow: (workflowId: string): Promise<AutomationRun[]> =>
    listAll<AutomationRun>(
      "automationRuns",
      where("workflowId", "==", workflowId),
      orderBy("startedAt", "desc"),
      limit(50),
    ),

  /**
   * Pauses or resumes a workflow.
   *
   * ⚠️ This flips a flag the n8n side reads on its next poll. It does
   * not stop a run already in flight — the UI says "will pause", not
   * "paused", for exactly that reason.
   */
  setStatus: async (
    id: string,
    status: AutomationStatus,
    actor: Actor,
  ): Promise<AutomationWorkflow> => {
    await updateDoc(doc(db, "automationWorkflows", id), {
      status, updatedAt: serverTimestamp(), updatedBy: actor.id,
    });
    const updated = (await getOne<AutomationWorkflow>("automationWorkflows", id))!;
    await recordAudit({
      entityType: "automation", entityId: id, entityLabel: updated.name,
      action: "updated", summary: `Workflow ${status}`, actor,
    });
    return updated;
  },
};

/* ── Notifications ─────────────────────────────────────────────── */

export const notificationsRepo = {
  list: (): Promise<AppNotification[]> =>
    listAll<AppNotification>("notifications", orderBy("at", "desc"), limit(100)),

  unreadCount: () => countWhere("notifications", where("isRead", "==", false)),

  markRead: (id: string) => updateDoc(doc(db, "notifications", id), { isRead: true }),

  markAllRead: async () => {
    const snap = await getDocs(
      query(collection(db, "notifications"), where("isRead", "==", false), limit(400)),
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
    await batch.commit();
  },

  templates: (): Promise<NotificationTemplate[]> =>
    listAll<NotificationTemplate>("notificationTemplates", orderBy("name")),

  template: (id: string): Promise<NotificationTemplate | null> =>
    getOne<NotificationTemplate>("notificationTemplates", id),
};

/* ── Import ────────────────────────────────────────────────────── */

/** One place, so a new importable entity cannot forget its defaults. */
const DEFAULTS_FOR: Record<ImportEntity, Record<string, unknown>> = {
  customers: CUSTOMER_DEFAULTS,
  companies: COMPANY_DEFAULTS,
  hotels: HOTEL_DEFAULTS,
};

export const importRepo = {
  /**
   * The normalised values already stored, for collision warnings.
   *
   * ⚠️ Bounded to 2,000 records. Firestore cannot answer "does any of
   * these 500 emails exist" in one query, and 500 individual lookups
   * would be 500 reads. So this reads a window and warns; the real
   * guarantee is the uniqueness rule at write time, not this check.
   * The screen says so rather than implying the file was fully vetted.
   */
  existingKeys: async (
    entity: ImportEntity,
    fields: { field: string; normalise: (v: string) => string }[],
  ): Promise<Record<string, Set<string>>> => {
    if (!fields.length) return {};
    const rows = await listAll<Record<string, unknown>>(
      entity,
      limit(EXISTING_SCAN_LIMIT),
    );
    const out: Record<string, Set<string>> = {};
    for (const { field, normalise } of fields) {
      out[field] = new Set(
        rows
          .map((r) => String(r[field] ?? ""))
          .filter(Boolean)
          .map(normalise)
          .filter(Boolean),
      );
    }
    return out;
  },

  /**
   * Commits validated rows in batches.
   *
   * ⚠️ 500 is Firestore's batch limit and each row is one write, so
   * chunks are 400 to leave headroom. Progress is reported so a large
   * file shows movement rather than appearing frozen.
   */
  commit: async (
    entity: ImportEntity,
    rows: Record<string, unknown>[],
    actor: Actor,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ created: number }> => {
    const collectionName = entity;
    let created = 0;

    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const batch = writeBatch(db);

      for (const row of chunk) {
        const ref = doc(collection(db, collectionName));
        batch.set(ref, {
          /* ⚠️ Same defaults the single-record create applies. A
             spreadsheet has no column for `roomMix`, so without these an
             imported hotel is missing the arrays its list screen
             dereferences — and 200 rows all render as a blank page. */
          ...DEFAULTS_FOR[entity],
          ...row,
          ownerId: actor.id,
          ownerName: actor.name,
          totalReservations: 0,
          totalRevenue: 0,
          lastActivityAt: serverTimestamp(),
          createdAt: serverTimestamp(), createdBy: actor.id,
          updatedAt: serverTimestamp(), updatedBy: actor.id,
        });
      }
      await batch.commit();
      created += chunk.length;
      onProgress?.(created, rows.length);
    }

    await recordAudit({
      entityType: entity, entityId: "bulk", entityLabel: `${created} ${entity}`,
      action: "imported", summary: `Imported ${created} ${entity}`, actor,
    });
    return { created };
  },
};

const EXISTING_SCAN_LIMIT = 2_000;

/* ── Reports ───────────────────────────────────────────────────────
   ⚠️ Bounded queries only. On Spark a report that reads all
   reservations to aggregate costs one document read per row, per view.
   Every function here limits its window.                            */

export const reportsRepo = {
  kpis: async (ctx?: ScopeContext) => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + "01";
    const nextMonth = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1))
      .toISOString().slice(0, 10);

    const scoped = (extra: Parameters<typeof where>[]) => extra;
    void scoped;

    const [thisMonth, overdue] = await Promise.all([
      listAll<Reservation>(
        "reservations",
        where("checkIn", ">=", monthStart),
        where("checkIn", "<", nextMonth),   // ⚠️ BOTH bounds — see D-03
        limit(500),
      ),
      listAll<Invoice>("invoices", where("status", "==", "overdue"), limit(200)),
    ]);

    const mine = (rows: Reservation[]) =>
      ctx?.role === "salesperson" ? rows.filter((r) => r.ownerId === ctx.userId) : rows;

    const live = mine(thisMonth).filter((r) => r.status !== "cancelled" && r.status !== "draft");
    const cancelled = mine(thisMonth).filter((r) => r.status === "cancelled");

    return {
      revenueThisMonth: live.reduce((s, r) => s + r.totalAmount, 0),
      revenueChangePercent: 0,
      reservationsThisMonth: live.length,
      reservationsChangePercent: 0,
      arrivalsToday: 0,
      departuresToday: 0,
      inHouse: 0,
      occupancyPercent: 0,
      roomNightsThisMonth: live.reduce((s, r) => s + r.totalRooms * r.nights, 0),
      averageBookingValue: live.length
        ? live.reduce((s, r) => s + r.totalAmount, 0) / live.length
        : 0,
      cancellationRate: mine(thisMonth).length
        ? (cancelled.length / mine(thisMonth).length) * 100
        : 0,
      overdueInvoices: overdue.length,
      overdueValue: overdue.reduce((s, i) => s + i.amountDue, 0),
    };
  },

  /**
   * Revenue, bookings and room nights by month.
   *
   * ⚠️ One window, aggregated in the client. Firestore has no GROUP BY,
   * so the alternative is a roll-up collection written on every
   * reservation — which needs a trigger, which needs Blaze. Until then
   * this reads a capped window and says so.
   */
  revenueSeries: async (months = 12, ctx?: ScopeContext): Promise<MonthPoint[]> => {
    const buckets = monthBuckets(months);
    const rows = await scopedReservations(buckets[0]!.start, ctx);

    return buckets.map(({ start, end, label, month }) => {
      const inMonth = rows.filter((r) => r.checkIn >= start && r.checkIn < end);
      return {
        month,
        label,
        revenue: inMonth.reduce((s, r) => s + r.totalAmount, 0),
        bookings: inMonth.length,
        roomNights: inMonth.reduce((s, r) => s + r.totalRooms * r.nights, 0),
      };
    });
  },

  /** Where the business came from, over the same capped window. */
  channelMix: async (ctx?: ScopeContext) => {
    const rows = await scopedReservations(monthBuckets(12)[0]!.start, ctx);
    const byChannel = new Map<string, { revenue: number; bookings: number }>();
    for (const r of rows) {
      const key = r.channel ?? "direct";
      const acc = byChannel.get(key) ?? { revenue: 0, bookings: 0 };
      acc.revenue += r.totalAmount;
      acc.bookings += 1;
      byChannel.set(key, acc);
    }
    const total = rows.reduce((s, r) => s + r.totalAmount, 0);
    return {
      total,
      rows: [...byChannel.entries()]
        .map(([channel, v]) => ({
          channel,
          label: humaniseKey(channel),
          revenue: v.revenue,
          bookings: v.bookings,
          share: total > 0 ? (v.revenue / total) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  },

  /** Per-salesperson totals. Joined against the user list for names. */
  salesPerformance: async () => {
    const [rows, users] = await Promise.all([
      scopedReservations(monthBuckets(12)[0]!.start),
      listAll<User>("users", orderBy("name")),
    ]);

    return users
      .filter((u) => u.role === "salesperson" || u.role === "manager")
      .map((u) => {
        const mine = rows.filter((r) => r.ownerId === u.id);
        const won = mine.filter((r) => r.status !== "cancelled" && r.status !== "draft");
        const revenue = won.reduce((s, r) => s + r.totalAmount, 0);
        return {
          userId: u.id,
          name: u.name,
          role: u.role,
          revenue,
          bookings: won.length,
          accounts: new Set(mine.map((r) => r.companyId).filter(Boolean)).size,
          averageBookingValue: won.length ? revenue / won.length : 0,
          cancellations: mine.filter((r) => r.status === "cancelled").length,
          conversionPercent: mine.length ? (won.length / mine.length) * 100 : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  },

  /**
   * Room nights and revenue rolled up by city.
   *
   * ⚠️ `occupancyPercent` is Fidato's share of sellable room nights in
   * that city, not the hotels' occupancy. Fidato does not own these
   * properties and cannot see their house count — labelling this
   * "occupancy" without the qualifier would be a number nobody can act on.
   */
  occupancyByCity: async () => {
    const [rows, hotels] = await Promise.all([
      scopedReservations(monthBuckets(12)[0]!.start),
      listAll<Hotel>("hotels", orderBy("name")),
    ]);

    const byCity = new Map<string, { rooms: number; roomNights: number; revenue: number }>();
    for (const h of hotels) {
      const acc = byCity.get(h.city) ?? { rooms: 0, roomNights: 0, revenue: 0 };
      acc.rooms += h.totalRooms ?? 0;
      byCity.set(h.city, acc);
    }
    const cityOf = new Map(hotels.map((h) => [h.id, h.city]));
    for (const r of rows) {
      const city = cityOf.get(r.hotelId);
      if (!city) continue;
      const acc = byCity.get(city)!;
      acc.roomNights += r.totalRooms * r.nights;
      acc.revenue += r.totalAmount;
    }

    const days = 365;
    return [...byCity.entries()]
      .map(([city, v]) => ({
        city,
        label: city,
        rooms: v.rooms,
        roomNights: v.roomNights,
        revenue: v.revenue,
        occupancyPercent: v.rooms > 0 ? (v.roomNights / (v.rooms * days)) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  },

  /**
   * Per-property performance.
   *
   * ⚠️ `commissionPercent` comes from the private subcollection, so it
   * is 0 for anyone who is not Owner or Admin — a denied read, not a
   * missing hotel. Screens that show money against it must be gated on
   * the `commission_terms` permission, not on this value.
   */
  hotelPerformance: async () => {
    const [rows, hotels] = await Promise.all([
      scopedReservations(monthBuckets(12)[0]!.start),
      listAll<Hotel>("hotels", orderBy("name")),
    ]);

    const terms = await Promise.all(hotels.map((h) => hotelsRepo.commercial(h.id)));

    return hotels
      .map((h, i) => {
        const mine = rows.filter(
          (r) => r.hotelId === h.id && r.status !== "cancelled" && r.status !== "draft",
        );
        const revenue = mine.reduce((s, r) => s + r.totalAmount, 0);
        const roomNights = mine.reduce((s, r) => s + r.totalRooms * r.nights, 0);
        return {
          hotelId: h.id,
          hotelName: h.name,
          city: h.city,
          category: h.category,
          totalRooms: h.totalRooms ?? 0,
          bookings: mine.length,
          revenue,
          averageRate: roomNights ? revenue / roomNights : 0,
          occupancyPercent:
            h.totalRooms > 0 ? (roomNights / (h.totalRooms * 365)) * 100 : 0,
          commissionPercent: terms[i]?.commissionPercent ?? 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  },

  /**
   * Naive forward projection.
   *
   * ⚠️ Straight-line growth off the trailing average. It is a planning
   * aid, not a forecast — labelled as such on the screen. A real model
   * needs seasonality, which needs more history than this platform has.
   */
  forecast: async (months = 6, ctx?: ScopeContext) => {
    const history = await reportsRepo.revenueSeries(12, ctx);
    const recent = history.slice(-6);
    const earlier = history.slice(-12, -6);

    const avg = (xs: MonthPoint[]) =>
      xs.length ? xs.reduce((s, m) => s + m.revenue, 0) / xs.length : 0;

    const recentAvg = avg(recent);
    const earlierAvg = avg(earlier);
    const growthRate = earlierAvg > 0 ? ((recentAvg - earlierAvg) / earlierAvg) * 100 : 0;

    const projection: MonthPoint[] = [];
    let running = recentAvg;
    const monthly = growthRate / 100 / 6;
    for (const b of futureBuckets(months)) {
      running = running * (1 + monthly);
      projection.push({
        month: b.month,
        label: b.label,
        revenue: Math.max(0, Math.round(running)),
        bookings: 0,
        roomNights: 0,
      });
    }

    return {
      history,
      projection,
      growthRate,
      averageMonthlyRevenue: recentAvg,
    };
  },
};

/* ── Report plumbing ───────────────────────────────────────────────
   Shared by every function above so the window and the scoping rule
   are defined once.                                                 */

export interface MonthPoint {
  /** `yyyy-MM`, for stable sorting and query keys. */
  month: string;
  /** `MMM yy`, for axes. */
  label: string;
  revenue: number;
  bookings: number;
  roomNights: number;
}

/** ⚠️ The cap that keeps a report from eating the daily read quota. */
const REPORT_WINDOW_LIMIT = 1_000;

async function scopedReservations(from: string, ctx?: ScopeContext): Promise<Reservation[]> {
  const rows = await listAll<Reservation>(
    "reservations",
    where("checkIn", ">=", from),
    orderBy("checkIn", "desc"),
    limit(REPORT_WINDOW_LIMIT),
  );
  return ctx?.role === "salesperson" ? rows.filter((r) => r.ownerId === ctx.userId) : rows;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function bucketFor(year: number, monthIndex: number) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    month: iso(start).slice(0, 7),
    label: `${MONTH_LABELS[start.getUTCMonth()]} ${String(start.getUTCFullYear()).slice(2)}`,
    start: iso(start),
    end: iso(end),
  };
}

/** The trailing `count` months, oldest first, ending with the current one. */
function monthBuckets(count: number) {
  const today = new Date();
  return Array.from({ length: count }, (_, i) =>
    bucketFor(today.getUTCFullYear(), today.getUTCMonth() - (count - 1 - i)),
  );
}

/** The next `count` months, starting with the one after this. */
function futureBuckets(count: number) {
  const today = new Date();
  return Array.from({ length: count }, (_, i) =>
    bucketFor(today.getUTCFullYear(), today.getUTCMonth() + 1 + i),
  );
}

function humaniseKey(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ── Search ────────────────────────────────────────────────────── */

export interface SearchHit {
  id: string;
  type: "reservation" | "customer" | "company" | "hotel" | "invoice";
  title: string;
  subtitle: string;
  link: string;
}

export const searchRepo = {
  query: async (term: string, ctx?: ScopeContext): Promise<SearchHit[]> => {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return [];

    const [reservations, customers, hotels] = await Promise.all([
      reservationsRepo.list({ search: term, pageSize: 5 }, ctx),
      customersRepo.list({ search: term, pageSize: 5 }, ctx),
      hotelsRepo.list({ search: term, pageSize: 5 }),
    ]);

    return [
      ...reservations.items.map((r) => ({
        id: r.id, type: "reservation" as const, title: r.reference,
        subtitle: `${r.customerName} · ${r.hotelName}`, link: `/reservations/${r.id}`,
      })),
      ...customers.items.map((c) => ({
        id: c.id, type: "customer" as const, title: c.fullName,
        subtitle: c.email, link: `/crm/customers/${c.id}`,
      })),
      ...hotels.items.map((h) => ({
        id: h.id, type: "hotel" as const, title: h.name,
        subtitle: `${h.city}, ${h.state}`, link: `/hotels/${h.id}`,
      })),
    ];
  },
};

/**
 * The app's "today".
 *
 * Phase 1 froze this to a fixed date so screenshots were reproducible
 * against seeded data. With real data it is the actual clock.
 *
 * ⚠️ Evaluated once, when the module loads. A tab left open across
 * midnight keeps yesterday's date until it reloads — acceptable for an
 * internal back office, and far cheaper than re-deriving it on every
 * render and re-running every date-keyed query.
 */
export const TODAY = new Date();

export { now };
