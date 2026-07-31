import type { Role } from "@/lib/permissions";

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
  address: string;
  category: HotelCategory;
  status: HotelStatus;
  starRating: number;
  totalRooms: number;
  description: string;
  /** Free-text room mix from the fact sheet, e.g. "Deluxe Room - 115 Rooms". */
  roomMix: string[];
  features: string[];
  facilities: string[];
  amenities: string[];
  thingsToDo: string[];
  distances: HotelDistance[];
  contacts: HotelContact[];
  /** Managing user id — hotel managers are pinned to their property. */
  managerId?: string;
  commissionPercent: number;
  onboardedAt: IsoDate;
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
  baseRate: number;
  extraAdultRate: number;
  amenities: string[];
  sizeSqft: number;
}

/* ── ratePlans ─────────────────────────────────────────────────── */

export type MealPlan = "EP" | "CP" | "MAP" | "AP";

export interface RatePlan extends Auditable {
  id: string;
  hotelId: string;
  hotelName: string;
  roomTypeId: string;
  roomTypeName: string;
  name: string;
  code: string;
  mealPlan: MealPlan;
  rate: number;
  /** Season window this plan applies to. */
  validFrom: IsoDate;
  validTo: IsoDate;
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

export interface ReservationRoom {
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  ratePlanName: string;
  mealPlan: MealPlan;
  quantity: number;
  ratePerNight: number;
  adults: number;
  children: number;
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

export interface User extends Auditable {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  /** Hotel managers are pinned to one property. */
  hotelId?: string;
  hotelName?: string;
  department: string;
  isActive: boolean;
  lastSeenAt: IsoDateTime;
  avatarColor: string;
}

/* ── auditLogs ─────────────────────────────────────────────────── */

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
