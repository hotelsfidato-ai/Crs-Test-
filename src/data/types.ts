import type { Role } from "@/lib/permissions";
import type { GstVersion } from "@/lib/tax";

/* ══════════════════════════════════════════════════════════════════
   DOMAIN TYPES
   Shaped to match the Firestore collections they will become in
   Phase 2. Denormalised display fields (e.g. hotelName on a
   reservation) are intentional — Firestore has no joins, so the
   read model carries what the list screens need.
   ══════════════════════════════════════════════════════════════════ */

/** ISO-8601 date-only string, yyyy-MM-dd. */
export type IsoDate = string;
/** ISO-8601 timestamp. Becomes a Firestore Timestamp in Phase 2. */
export type IsoDateTime = string;

export interface Auditable {
  createdAt: IsoDateTime;
  createdBy: string;
  updatedAt: IsoDateTime;
  updatedBy: string;
}

/* ── hotels ────────────────────────────────────────────────────── */

export type HotelStatus = "active" | "onboarding" | "paused";
export type HotelCategory =
  | "business"
  | "resort"
  | "heritage"
  | "beach"
  | "hill_station"
  | "banquet";

export interface HotelDistance {
  label: string;
  km: number;
}

export interface HotelContact {
  name: string;
  designation: string;
  email: string;
  phone: string;
}

export interface Hotel extends Auditable {
  id: string;
  name: string;
  /** Short display name used in tables and chips. */
  shortName: string;
  city: string;
  state: string;
  country: string;
  address: string;
  /** Primary contact, promoted out of contacts[] for the list screens. */
  contactPerson: string;
  email: string;
  phone: string;
  category: HotelCategory;
  status: HotelStatus;
  starRating: number;
  totalRooms: number;
  description: string;
  /** Free-text room mix as the property describes it, e.g. "Deluxe Room - 115 Rooms". */
  roomMix: string[];
  features: string[];
  facilities: string[];
  amenities: string[];
  thingsToDo: string[];
  distances: HotelDistance[];
  contacts: HotelContact[];
  /** Managing user id — dormant while hotel_manager has no grants. */
  managerId?: string;
  onboardedAt: IsoDate;

  /* ⚠️ commissionPercent deliberately absent. Firestore rules are
     document-level, so a field on a readable document is readable by
     everyone who can read it. Commission lives in the subcollection
     below, guarded by its own rule. */
}

/**
 * `hotels/{hotelId}/private/commercial` — a single document.
 *
 * ⚠️ Owner and Admin only. This is the ONLY place commission may live.
 * Putting it on the hotel document would expose it to every role via
 * the SDK or the REST API regardless of what the interface renders.
 */
export interface HotelCommercial {
  hotelId: string;
  commissionPercent: number;
  contractNotes: string;
  negotiatedBy: string;
  effectiveFrom: IsoDate;
  updatedAt: IsoDateTime;
  updatedBy: string;
}

/* ── roomTypes ─────────────────────────────────────────────────── */

export interface RoomType extends Auditable {
  id: string;
  hotelId: string;
  hotelName: string;
  name: string;
  code: string;
  description: string;
  totalRooms: number;
  maxOccupancy: number;
  /** Caps the extra-bed input in the reservation wizard. */
  maxExtraBeds: number;
  amenities: string[];
  sizeSqft: number;

  /* ⚠️ No pricing. Selling rates are entered per reservation by the
     salesperson — see ReservationRoom. */
}

/* ── seasons (replaces ratePlans) ──────────────────────────────── */

export type MealPlan = "EP" | "AP" | "MAP" | "ALL_INCLUSIVE";

export const MEAL_PLAN_LABELS: Record<MealPlan, string> = {
  EP: "Room only",
  AP: "All meals",
  MAP: "Breakfast and one meal",
  ALL_INCLUSIVE: "All inclusive",
};

/**
 * A date window with its own meal-plan combinations and policy.
 *
 * Carries no money — that moved to the reservation. A season defines
 * *applicability*, not price.
 */
export interface Season extends Auditable {
  id: string;
  hotelId: string;
  hotelName: string;
  name: string;
  validFrom: IsoDate;
  validTo: IsoDate;
  /** Which of the four meal plans apply in this window. */
  mealPlans: MealPlan[];
  minNights: number;
  cancellationPolicy: string;
  isActive: boolean;
}

/* ── inventory ─────────────────────────────────────────────────── */

export interface InventoryDay {
  id: string;
  hotelId: string;
  roomTypeId: string;
  date: IsoDate;
  totalRooms: number;
  booked: number;
  blocked: number;
  available: number;
  rate: number;
}

/* ── companies ─────────────────────────────────────────────────── */

export type CompanyTier = "key_account" | "corporate" | "sme" | "travel_agent";
export type CompanyStatus = "active" | "prospect" | "dormant";

export interface Company extends Auditable {
  id: string;
  name: string;
  legalName: string;
  tier: CompanyTier;
  status: CompanyStatus;
  industry: string;
  gstin: string;
  city: string;
  state: string;
  address: string;
  website: string;
  phone: string;
  email: string;
  /** Assigned salesperson. Drives row-level scoping. */
  ownerId: string;
  ownerName: string;
  creditLimit: number;
  creditUsed: number;
  paymentTermDays: number;
  contractStart?: IsoDate;
  contractEnd?: IsoDate;
  negotiatedDiscountPercent: number;
  /** Rolled-up figures kept on the document, Firestore-style. */
  totalReservations: number;
  totalRevenue: number;
  lastActivityAt: IsoDateTime;
  notes: string;
}

/* ── customers ─────────────────────────────────────────────────── */

export type CustomerStatus = "active" | "lead" | "inactive";
export type CustomerSource =
  | "direct"
  | "referral"
  | "website"
  | "ota"
  | "corporate"
  | "walk_in"
  | "campaign";

export interface Customer extends Auditable {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  /** Unique across the platform — enforced by rules.isDuplicateEmail. */
  email: string;
  /** Unique across the platform — enforced by rules.isDuplicatePhone. */
  phone: string;
  status: CustomerStatus;
  source: CustomerSource;
  companyId?: string;
  companyName?: string;
  designation?: string;
  city: string;
  state: string;
  ownerId: string;
  ownerName: string;
  /** Guest preferences surfaced on the reservation wizard. */
  preferences: string[];
  vip: boolean;
  totalReservations: number;
  totalRevenue: number;
  lastStayAt?: IsoDateTime;
  lastActivityAt: IsoDateTime;
  notes: string;
  /**
   * Set when this record was folded into another during a merge.
   * The row is kept, not deleted — an absorbed record still has to be
   * findable when someone asks why a reservation moved.
   */
  mergedIntoId?: string;
}

/* ── reservations ──────────────────────────────────────────────── */

export type ReservationStatus =
  | "draft"
  | "pending_approval"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show";

export type BookingChannel =
  | "direct_sales"
  | "corporate"
  | "travel_agent"
  | "website"
  | "phone"
  | "walk_in";

/** How the booking is settled. Distinct from PaymentMethod, which is
    how money physically arrived against an invoice. */
export type PaymentTerm = "DP" | "RA" | "BTC";

export const PAYMENT_TERM_LABELS: Record<PaymentTerm, string> = {
  DP: "Direct payment",
  RA: "Room advance",
  BTC: "Bill to company",
};

export interface ReservationRoom {
  roomTypeId: string;
  roomTypeName: string;
  mealPlan: MealPlan;
  /** Resolved from the check-in date. Absent when no season matches. */
  seasonId?: string;
  seasonName?: string;
  quantity: number;
  adults: number;
  children: number;
  /** ⚠️ Per line, not per room. Label this clearly in the UI. */
  extraBeds: number;

  /* Entered by the salesperson at booking time and frozen thereafter.
     A later rate change never alters an existing folio. */
  sellingRate: number;
  extraBedRate: number;
  childRate: number;
}

export interface ReservationGuest {
  name: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
}

export interface Reservation extends Auditable {
  id: string;
  /** Human-readable, auto-generated: FH-2026-04821. */
  reference: string;
  status: ReservationStatus;
  channel: BookingChannel;

  customerId: string;
  customerName: string;
  companyId?: string;
  companyName?: string;

  hotelId: string;
  hotelName: string;
  hotelCity: string;

  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;

  rooms: ReservationRoom[];
  guests: ReservationGuest[];
  totalRooms: number;
  totalAdults: number;
  totalChildren: number;

  roomCharges: number;
  extrasCharges: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;

  /** Assigned salesperson — drives row-level scoping. */
  ownerId: string;
  ownerName: string;

  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: IsoDateTime;
  approvalNote?: string;

  cancelledAt?: IsoDateTime;
  cancelledBy?: string;
  cancellationReason?: string;

  specialRequests: string;
  internalNotes: string;
  invoiceId?: string;

  /* ── Commercial terms ── */
  paymentTerm: PaymentTerm;

  /* ── Hotel confirmation, recorded after the property confirms ── */
  hotelConfirmationNumber?: string;
  hotelRepName?: string;
  confirmedAt?: IsoDateTime;

  /* ── Tax provenance ──
     Which band table produced taxAmount. Historical folios are never
     recomputed, so this is how an old figure stays explainable. */
  gstVersion: GstVersion;
  /** Effective blended rate, for display. Tax is computed per line. */
  gstRate: number;

  /* ── Phase 2.5 write-back. Written by n8n, never by the app. ──
     voucherUrl doubles as the idempotency check: a retry must not
     send a second voucher. */
  voucherUrl?: string;
  voucherSentAt?: IsoDateTime;
}

/* ── invoices & payments ───────────────────────────────────────── */

export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "void";

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxPercent: number;
}

export interface Invoice extends Auditable {
  id: string;
  number: string;
  status: InvoiceStatus;
  reservationId: string;
  reservationReference: string;
  customerId: string;
  customerName: string;
  companyId?: string;
  companyName?: string;
  hotelId: string;
  hotelName: string;
  issueDate: IsoDate;
  dueDate: IsoDate;
  lines: InvoiceLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  notes: string;

  /** Which band table produced taxAmount. */
  gstVersion: GstVersion;
  createdFrom: "reservation" | "manual";

  /* Phase 2.5 write-back. */
  invoicePdfUrl?: string;
  invoiceSentAt?: IsoDateTime;
}

export type PaymentMethod = "bank_transfer" | "upi" | "card" | "cash" | "cheque";

export interface Payment extends Auditable {
  id: string;
  reference: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: PaymentMethod;
  receivedAt: IsoDateTime;
  reconciled: boolean;
  note: string;
}

export type CommissionStatus = "accrued" | "approved" | "paid";

export interface Commission extends Auditable {
  id: string;
  reservationId: string;
  reservationReference: string;
  hotelId: string;
  hotelName: string;
  ownerId: string;
  ownerName: string;
  bookingValue: number;
  percent: number;
  amount: number;
  status: CommissionStatus;
  periodMonth: string;
}

/* ── users ─────────────────────────────────────────────────────── */

export type UserStatus = "invited" | "active" | "disabled";

export interface User extends Auditable {
  /** Equals the Firebase Auth uid once the invitation is claimed. */
  id: string;
  /** Absent until claimed. Its presence is what makes a record live. */
  authUid?: string;
  name: string;
  /** The invitation key. Immutable after claiming. */
  email: string;
  phone: string;

  /* ⚠️ The two most dangerous fields in the system. A user able to
     write either can promote themselves to Owner. Security rules must
     forbid self-modification — see docs/phase-2/04. */
  role: Role;
  status: UserStatus;

  branch: string;
  department: string;
  /** Dormant, retained for the hotel_manager role. */
  hotelId?: string;
  hotelName?: string;
  invitedAt?: IsoDateTime;
  lastSeenAt: IsoDateTime;
  avatarColor: string;
}

/* ── auditLogs ─────────────────────────────────────────────────── */

/**
 * A pending invitation.
 *
 * ⚠️ A separate collection, keyed by the lower-cased email — NOT a
 * `users` row with status "invited". The security rules find the
 * caller's profile at `users/{authUid}`, which only exists once the
 * person has signed up. An invitation has no uid yet, so it cannot
 * live there without making the role lookup a query, and rules cannot
 * query.
 *
 * The deterministic id is also what lets a rule check "this signed-in
 * account is claiming the invitation addressed to its own email".
 */
export interface Invitation {
  /** The document id: the invited email, lower-cased. */
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string;
  branch: string;
  hotelId?: string;
  hotelName?: string;
  invitedAt: IsoDateTime;
  invitedBy: string;
  invitedByName: string;
}

export type AuditAction =
  | "created"
  | "updated"
  | "status_changed"
  | "cancelled"
  | "approved"
  | "merged"
  | "exported"
  | "viewed"
  | "note_added"
  | "email_sent";

export interface AuditLog {
  id: string;
  entityType: "reservation" | "customer" | "company" | "hotel" | "invoice" | "user" | "rate";
  entityId: string;
  entityLabel: string;
  action: AuditAction;
  summary: string;
  detail?: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  at: IsoDateTime;
}

/* ── notifications ─────────────────────────────────────────────── */

export type NotificationChannel = "in_app" | "email" | "whatsapp" | "sms" | "push";
export type NotificationCategory =
  | "reservation"
  | "approval"
  | "payment"
  | "system"
  | "customer"
  | "automation";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  isRead: boolean;
  actorName?: string;
  link?: string;
  at: IsoDateTime;
}

export interface NotificationTemplate extends Auditable {
  id: string;
  name: string;
  event: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  isActive: boolean;
  variables: string[];
}

/* ── automationJobs ────────────────────────────────────────────── */

export type AutomationStatus = "active" | "paused" | "draft";
export type AutomationStepKind =
  | "generate_pdf"
  | "send_email"
  | "send_whatsapp"
  | "update_record"
  | "notify_user"
  | "webhook"
  | "wait"
  | "condition";

export interface AutomationStep {
  id: string;
  order: number;
  kind: AutomationStepKind;
  label: string;
  detail: string;
  /** Which n8n node this maps to in Phase 3. */
  n8nNode?: string;
}

export interface AutomationWorkflow extends Auditable {
  id: string;
  name: string;
  description: string;
  trigger: string;
  triggerDetail: string;
  conditions: string[];
  steps: AutomationStep[];
  status: AutomationStatus;
  runsLast30Days: number;
  successRate: number;
  averageDurationMs: number;
  lastRunAt?: IsoDateTime;
}

export type RunStatus = "success" | "failed" | "running";

export interface AutomationRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  startedAt: IsoDateTime;
  durationMs: number;
  trigger: string;
  entityLabel: string;
  error?: string;
  stepsCompleted: number;
  stepsTotal: number;
}

/* ── settings ──────────────────────────────────────────────────── */

export interface Integration {
  id: string;
  name: string;
  category: "pms" | "channel_manager" | "messaging" | "accounting" | "ai" | "calendar" | "payment";
  description: string;
  status: "connected" | "available" | "error";
  connectedAt?: IsoDateTime;
  lastSyncAt?: IsoDateTime;
  /** Phase 3 marks the n8n-backed ones. */
  viaN8n: boolean;
}

export interface OrgSettings {
  legalName: string;
  brandName: string;
  gstin: string;
  registeredAddress: string;
  supportEmail: string;
  supportPhone: string;
  currency: string;
  timezone: string;
  financialYearStart: string;
  approvalThreshold: number;
  defaultCommissionPercent: number;
}

/* ── automationQueue ───────────────────────────────────────────────
   Business events are written here and NOT processed. Phase 2.5 has
   n8n poll this collection. Written in the same transaction as the
   entity, so an event can never describe a document that does not
   exist.                                                            */

export type AutomationEventType =
  | "reservation.created"
  | "reservation.confirmed"
  | "reservation.approved"
  | "reservation.cancelled"
  | "reservation.checked_in"
  | "reservation.checked_out"
  | "invoice.created"
  | "payment.recorded"
  | "customer.created"
  | "company.created"
  | "hotel.created"
  | "user.invited";

export type AutomationEventStatus = "pending" | "processing" | "done" | "failed";

export interface AutomationEvent {
  id: string;
  type: AutomationEventType;
  entityType: "reservation" | "invoice" | "payment" | "customer" | "company" | "hotel" | "user";
  entityId: string;
  /** Denormalised so the queue viewer renders without extra reads. */
  entityLabel: string;
  /** ⚠️ Minimal — ids, not copies. n8n re-reads the document. */
  payload: Record<string, unknown>;

  status: AutomationEventStatus;
  attempts: number;
  lastError?: string;

  /* Lease fields. Firestore has no atomic claim over REST, so a worker
     takes a lease and an expired lease is reclaimable. */
  lockedBy?: string;
  lockedAt?: IsoDateTime;
  leaseExpiresAt?: IsoDateTime;

  createdAt: IsoDateTime;
  createdBy: string;
  processedAt?: IsoDateTime;
}

/* ── Resumable jobs ────────────────────────────────────────────────
   Merge and import can exceed a single write batch, and the tab can
   close mid-run. Both are therefore jobs with a visible phase and a
   cursor, not fire-and-forget operations.                           */

export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface MergeJob {
  id: string;
  survivorId: string;
  absorbedIds: string[];
  status: JobStatus;
  phase: "repointing_reservations" | "repointing_invoices" | "patching_survivor" | "removing_absorbed" | "done";
  cursor?: string;
  processed: number;
  total: number;
  error?: string;
  startedAt: IsoDateTime;
  actorId: string;
}

export type ImportEntity = "customers" | "companies" | "hotels";

export interface ImportIssue {
  row: number;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ImportJob {
  id: string;
  entity: ImportEntity;
  fileName: string;
  status: JobStatus;
  cursor: number;
  total: number;
  created: number;
  skipped: number;
  issues: ImportIssue[];
  startedAt: IsoDateTime;
  actorId: string;
}

/* ── Query helpers (Firestore-shaped) ──────────────────────────── */

export type SortDirection = "asc" | "desc";

export interface ListQuery {
  search?: string;
  /** Field equality filters, mirroring Firestore where() clauses. */
  filters?: Record<string, string | number | boolean | undefined>;
  sortBy?: string;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
