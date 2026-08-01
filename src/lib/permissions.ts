/* ══════════════════════════════════════════════════════════════════
   ROLES & PERMISSIONS
   The single source of truth consulted by navigation, page sections,
   table row actions and buttons. Switching role in the top bar
   visibly changes the product because everything reads from here.
   ══════════════════════════════════════════════════════════════════ */

export const ROLES = [
  "owner",
  "admin",
  /**
   * CRS Manager — sees the whole book.
   *
   * Unlike a salesperson they are not scoped to their own records, and
   * unlike a sales manager their job includes raising a booking *on
   * behalf of* a salesperson: they pick who owns it, and it then shows
   * up in that person's list and against their name.
   */
  "crs_manager",
  "manager",
  "salesperson",
  "finance",
  "viewer",
  /* Dormant — defined with no grants. See DORMANT_ROLES below. */
  "hotel_manager",
  "support",
  /* System — the n8n service account. Never assigned to a person. */
  "automation",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Retained with **no grants**. `canAccess` denies by default, so an
 * empty grant map is genuinely closed — a dormant role reaches nothing.
 *
 * Kept because the row-level scoping they drive is built and tested,
 * and property staff seeing their own arrivals is a plausible return
 * once a live inventory feed exists. Re-enable by restoring grants;
 * no other code changes.
 */
export const DORMANT_ROLES: Role[] = ["hotel_manager", "support"];

/** Non-human roles. Never offered in a picker. */
export const SYSTEM_ROLES: Role[] = ["automation"];

/**
 * The only roles that may be assigned to a person.
 *
 * ⚠️ If `automation` ever becomes selectable, someone can grant a person
 * the n8n service account's write access to automationQueue.
 */
export const ASSIGNABLE_ROLES: Role[] = ROLES.filter(
  (r) => !DORMANT_ROLES.includes(r) && !SYSTEM_ROLES.includes(r),
);

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  crs_manager: "CRS Manager",
  manager: "Manager",
  salesperson: "Salesperson",
  finance: "Finance",
  viewer: "Viewer",
  hotel_manager: "Hotel Manager",
  support: "Support",
  automation: "Automation",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Unrestricted. Sole authority over roles, commission and settings.",
  admin: "Runs the platform day to day. Cannot assign roles.",
  crs_manager:
    "Every customer, company and booking. Can raise a reservation on behalf of a salesperson.",
  manager: "Sales leadership. Sees invoices and the whole book.",
  salesperson: "Own leads only. Creates customers, companies and reservations.",
  finance: "Invoices, payments, commissions and financial reporting.",
  viewer: "Read-only across the platform. No write access anywhere.",
  hotel_manager: "Dormant. One property, arrivals and inventory, never pricing.",
  support: "Dormant. Read-heavy, annotates records without altering commercials.",
  automation: "Service account for n8n. Not a person.",
};

/* ── Resources & actions ───────────────────────────────────────── */

export const RESOURCES = [
  "dashboard",
  "customer",
  "company",
  "reservation",
  "hotel",
  "inventory",
  /* Room types, meal plans and seasons. Carries no pricing — selling
     rates are entered per reservation. */
  "room_config",
  /* ⚠️ Commission lives in hotels/{id}/private/commercial, not on the
     hotel document. Firestore rules are document-level, so a field on a
     readable document is readable by everyone who can read it. */
  "commission_terms",
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
  hotel: "Properties",
  inventory: "Inventory",
  room_config: "Room configuration",
  commission_terms: "Commission terms",
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

/* ══════════════════════════════════════════════════════════════════
   THE MATRIX

   Seven assignable roles, two dormant, one system account.

   ⚠️ Two cells decide the sensitive requirements:
     · commission_terms — Owner and Admin only. Finance is deliberately
       excluded: commission is a negotiated commercial term, not an
       accounting figure.
     · role — Owner alone. Without this an admin can promote themselves.
   ══════════════════════════════════════════════════════════════════ */

const MATRIX: Record<Role, ResourceGrants> = {
  owner: Object.fromEntries(RESOURCES.map((r) => [r, ALL])) as ResourceGrants,

  admin: {
    dashboard: READ,
    customer: ["view", "create", "edit", "merge", "import", "export"],
    company: ["view", "create", "edit", "merge", "import", "export"],
    reservation: ["view", "create", "edit", "cancel", "export"],
    hotel: ["view", "create", "edit", "import", "export"],
    room_config: ["view", "create", "edit"],
    commission_terms: ["view", "edit"],
    invoice: ["view", "create", "edit", "export"],
    payment: ["view", "create", "edit", "export"],
    commission: READ_EXPORT,
    report: READ_EXPORT,
    automation: ["view", "edit"],
    notification: ["view", "create", "edit"],
    ai: READ,
    user: ["view", "create", "edit"],
    audit_log: READ_EXPORT,
    setting: READ,
  },

  /**
   * ⚠️ Unscoped by design — see scopeConstraints. The whole point of
   * this role is a central desk that works every account, so scoping
   * it to its own records would make it useless.
   *
   * No commission_terms and no user administration: seeing every
   * booking is not the same as setting what Fidato earns on one, or
   * deciding who else gets in.
   */
  crs_manager: {
    dashboard: READ,
    customer: ["view", "create", "edit", "merge", "import", "export"],
    company: ["view", "create", "edit", "merge", "import", "export"],
    reservation: ["view", "create", "edit", "cancel", "export"],
    hotel: READ_EXPORT,
    room_config: ["view", "create", "edit"],
    invoice: ["view", "create", "export"],
    report: READ_EXPORT,
    notification: ["view", "create"],
    ai: READ,
    user: READ,
    audit_log: READ,
  },

  manager: {
    dashboard: READ,
    customer: ["view", "create", "edit", "merge", "import", "export"],
    company: ["view", "create", "edit", "merge", "import", "export"],
    reservation: ["view", "create", "edit", "cancel", "export"],
    hotel: READ_EXPORT,
    room_config: READ,
    invoice: ["view", "create", "export"],
    report: READ_EXPORT,
    notification: READ,
    ai: READ,
    user: READ,
    audit_log: READ,
  },

  /**
   * ⚠️ Create but not edit.
   *
   * A salesperson adds their own leads and cannot alter them
   * afterwards. The reason is that a customer record is what an
   * invoice and a commission are attached to: changing an email or a
   * company after a booking exists silently redirects a voucher, or
   * moves a stay onto a different account. Corrections go through the
   * CRS desk, Admin or Owner, who see the whole book and can tell
   * whether an edit is a fix or a reassignment.
   *
   * Nothing is deletable by anyone — see firestore.rules.
   */
  salesperson: {
    dashboard: READ,
    // Scoped further by ownership — see scopeRecords().
    customer: ["view", "create", "export"],
    company: ["view", "create", "export"],
    reservation: ["view", "create", "edit", "cancel", "export"],
    hotel: READ,
    room_config: READ,
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
    // Invoices and payments, but NOT commission_terms. Deliberate.
    invoice: ["view", "create", "edit", "approve", "export"],
    payment: ["view", "create", "edit", "export"],
    commission: ["view", "edit", "approve", "export"],
    report: READ_EXPORT,
    notification: READ,
    ai: READ,
    audit_log: READ,
  },

  viewer: {
    dashboard: READ,
    customer: READ,
    company: READ,
    reservation: READ,
    hotel: READ,
    room_config: READ,
    report: READ,
    notification: READ,
  },

  /* ── Dormant. Empty maps are genuinely closed. ── */
  hotel_manager: {},
  support: {},

  /* ── System. n8n only touches the queue and its write-back fields. ── */
  automation: {
    automation: ["view", "edit"],
    notification: ["view", "create"],
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

/** Restricts an in-memory list to what the current actor may see. */
export function scopeRecords<T extends { ownerId?: string; hotelId?: string }>(
  ctx: ScopeContext,
  records: T[],
): T[] {
  /* ⚠️ Only the salesperson is scoped. Owner, Admin, CRS Manager,
     Manager, Finance and Viewer all see the whole book — a central desk
     that could only see its own records would be useless. */
  if (ctx.role === "salesperson") {
    return records.filter((r) => !r.ownerId || r.ownerId === ctx.userId);
  }
  if (ctx.role === "hotel_manager" && ctx.hotelId) {
    return records.filter((r) => !r.hotelId || r.hotelId === ctx.hotelId);
  }
  return records;
}

export interface ScopeConstraint {
  field: "ownerId" | "hotelId";
  value: string;
}

/**
 * The same scoping expressed as Firestore query constraints.
 *
 * ⚠️ This is not an optimisation — it is required. Firestore security
 * rules filter documents one at a time; a query that *could* return a
 * document the rules would reject fails entirely rather than returning
 * a subset. So the query must narrow to what the rules allow, and the
 * two must agree exactly.
 *
 * ⚠️ Note this is stricter than `scopeRecords`, which also admits
 * records with no owner. An equality query cannot express "mine or
 * unowned", so unowned records are invisible to a salesperson in a
 * list. They remain reachable by direct id, which the rules permit.
 * If unassigned leads must appear in lists, give them a sentinel
 * ownerId rather than leaving the field absent.
 */
export function scopeConstraints(ctx: ScopeContext): ScopeConstraint[] {
  if (ctx.role === "salesperson") {
    return [{ field: "ownerId", value: ctx.userId }];
  }
  if (ctx.role === "hotel_manager" && ctx.hotelId) {
    return [{ field: "hotelId", value: ctx.hotelId }];
  }
  return [];
}
