/* ══════════════════════════════════════════════════════════════════
   ROLES & PERMISSIONS
   The single source of truth consulted by navigation, page sections,
   table row actions and buttons. Switching role in the top bar
   visibly changes the product because everything reads from here.
   ══════════════════════════════════════════════════════════════════ */

export const ROLES = [
  "super_admin",
  "admin",
  "sales_manager",
  "salesperson",
  "hotel_manager",
  "finance",
  "support",
  "viewer",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  sales_manager: "Sales Manager",
  salesperson: "Salesperson",
  hotel_manager: "Hotel Manager",
  finance: "Finance",
  support: "Support",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Unrestricted. Owns roles, integrations and system settings.",
  admin: "Runs the platform day to day. No control over roles or billing.",
  sales_manager: "Sees the whole sales org, approves high-value bookings.",
  salesperson: "Own accounts only. Creates customers and reservations.",
  hotel_manager: "One property. Inventory and arrivals, never pricing.",
  finance: "Invoices, payments, commissions and financial reporting.",
  support: "Read-heavy. Can annotate records but not alter commercials.",
  viewer: "Read-only across the platform. No write access anywhere.",
};

/* ── Resources & actions ───────────────────────────────────────── */

export const RESOURCES = [
  "dashboard",
  "customer",
  "company",
  "reservation",
  "reservation_approval",
  "hotel",
  "inventory",
  "rate",
  "invoice",
  "payment",
  "commission",
  "report",
  "automation",
  "notification",
  "ai",
  "user",
  "role",
  "integration",
  "audit_log",
  "setting",
] as const;

export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = [
  "view",
  "create",
  "edit",
  "cancel",
  "approve",
  "export",
  "merge",
  "import",
] as const;

export type Action = (typeof ACTIONS)[number];

/* Display names for the permission matrix. Kept beside the tokens so a
   new resource or action cannot be added without naming it. */

export const RESOURCE_LABELS: Record<Resource, string> = {
  dashboard: "Dashboard",
  customer: "Customers",
  company: "Companies",
  reservation: "Reservations",
  reservation_approval: "Approvals",
  hotel: "Properties",
  inventory: "Inventory",
  rate: "Rate plans",
  invoice: "Invoices",
  payment: "Payments",
  commission: "Commissions",
  report: "Reports",
  automation: "Automation",
  notification: "Notifications",
  ai: "Assistant",
  user: "Users",
  role: "Roles",
  integration: "Integrations",
  audit_log: "Audit log",
  setting: "Settings",
};

export const ACTION_LABELS: Record<Action, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  cancel: "Cancel",
  approve: "Approve",
  export: "Export",
  merge: "Merge",
  import: "Import",
};

type ResourceGrants = Partial<Record<Resource, readonly Action[]>>;

const ALL: readonly Action[] = ACTIONS;
const READ: readonly Action[] = ["view"];
const READ_EXPORT: readonly Action[] = ["view", "export"];

/* ── The matrix ────────────────────────────────────────────────── */

const MATRIX: Record<Role, ResourceGrants> = {
  super_admin: Object.fromEntries(RESOURCES.map((r) => [r, ALL])) as ResourceGrants,

  admin: {
    dashboard: READ,
    customer: ["view", "create", "edit", "merge", "import", "export"],
    company: ["view", "create", "edit", "merge", "import", "export"],
    reservation: ["view", "create", "edit", "cancel", "export"],
    reservation_approval: ["view", "approve"],
    hotel: ["view", "create", "edit", "export"],
    inventory: ["view", "edit"],
    rate: ["view", "create", "edit"],
    invoice: ["view", "create", "edit", "export"],
    payment: ["view", "create", "edit", "export"],
    commission: READ_EXPORT,
    report: READ_EXPORT,
    automation: ["view", "create", "edit"],
    notification: ["view", "create", "edit"],
    ai: READ,
    user: ["view", "create", "edit"],
    audit_log: READ_EXPORT,
    setting: ["view", "edit"],
  },

  sales_manager: {
    dashboard: READ,
    customer: ["view", "create", "edit", "merge", "import", "export"],
    company: ["view", "create", "edit", "merge", "import", "export"],
    reservation: ["view", "create", "edit", "cancel", "export"],
    reservation_approval: ["view", "approve"],
    hotel: READ_EXPORT,
    inventory: READ,
    rate: READ,
    invoice: READ_EXPORT,
    commission: READ_EXPORT,
    report: READ_EXPORT,
    automation: READ,
    notification: READ,
    ai: READ,
    user: READ,
    audit_log: READ,
  },

  salesperson: {
    dashboard: READ,
    // Scoped further by ownership — see scope() below.
    customer: ["view", "create", "edit", "export"],
    company: ["view", "create", "edit", "export"],
    reservation: ["view", "create", "edit", "cancel", "export"],
    hotel: READ,
    inventory: READ,
    rate: READ,
    invoice: READ,
    commission: READ,
    report: READ,
    notification: READ,
    ai: READ,
  },

  hotel_manager: {
    dashboard: READ,
    reservation: ["view", "export"],
    // One property only — scoped by hotelId. Pricing is deliberately absent.
    hotel: ["view", "edit"],
    inventory: ["view", "edit"],
    rate: READ,
    report: READ,
    notification: READ,
    ai: READ,
  },

  finance: {
    dashboard: READ,
    customer: READ,
    company: READ,
    reservation: READ_EXPORT,
    hotel: READ,
    invoice: ["view", "create", "edit", "approve", "export"],
    payment: ["view", "create", "edit", "export"],
    commission: ["view", "edit", "approve", "export"],
    report: READ_EXPORT,
    notification: READ,
    ai: READ,
    audit_log: READ,
  },

  support: {
    dashboard: READ,
    customer: ["view", "edit"],
    company: READ,
    reservation: ["view", "edit"],
    hotel: READ,
    inventory: READ,
    invoice: READ,
    report: READ,
    notification: ["view", "create"],
    ai: READ,
  },

  viewer: {
    dashboard: READ,
    customer: READ,
    company: READ,
    reservation: READ,
    hotel: READ,
    inventory: READ,
    rate: READ,
    invoice: READ,
    report: READ,
    notification: READ,
  },
};

/* ── Public API ────────────────────────────────────────────────── */

/** Can this role perform `action` on `resource`? */
export function can(role: Role, action: Action, resource: Resource): boolean {
  return MATRIX[role]?.[resource]?.includes(action) ?? false;
}

/** Does this role have any access at all to `resource`? Drives nav visibility. */
export function canAccess(role: Role, resource: Resource): boolean {
  return (MATRIX[role]?.[resource]?.length ?? 0) > 0;
}

/** Every action a role holds on a resource — used by the admin matrix screen. */
export function grantsFor(role: Role, resource: Resource): readonly Action[] {
  return MATRIX[role]?.[resource] ?? [];
}

/** Whole matrix, for the /admin/roles screen. */
export function permissionMatrix() {
  return ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    resources: RESOURCES.map((resource) => ({
      resource,
      actions: grantsFor(role, resource),
    })),
  }));
}

/* ── Row-level scoping ─────────────────────────────────────────────
   Permissions answer "may this role touch this kind of thing?".
   Scope answers "which records?". The two are separate on purpose:
   a salesperson may edit customers, but only their own.           */

export interface ScopeContext {
  role: Role;
  /** The signed-in user's id — in Phase 1 this comes from the role switcher. */
  userId: string;
  /** Hotel managers are pinned to one property. */
  hotelId?: string;
}

/** Restricts a list to what the current actor is allowed to see. */
export function scopeRecords<T extends { ownerId?: string; hotelId?: string }>(
  ctx: ScopeContext,
  records: T[],
): T[] {
  if (ctx.role === "salesperson") {
    return records.filter((r) => !r.ownerId || r.ownerId === ctx.userId);
  }
  if (ctx.role === "hotel_manager" && ctx.hotelId) {
    return records.filter((r) => !r.hotelId || r.hotelId === ctx.hotelId);
  }
  return records;
}
