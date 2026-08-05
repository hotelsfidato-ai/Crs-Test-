import { describe, expect, it } from "vitest";
import {
  can, canAccess, scopeConstraints, ASSIGNABLE_ROLES, DORMANT_ROLES,
  SYSTEM_ROLES, ROLES,
} from "./permissions";

/* ══════════════════════════════════════════════════════════════════
   PERMISSION MATRIX

   ⚠️ These assertions mirror rules the user stated as requirements.
   They are pinned here because the matrix is a large table, and a
   table is exactly the kind of thing that gets a row edited by
   accident. This file is the client half; firestore.rules is the half
   that actually enforces it.
   ══════════════════════════════════════════════════════════════════ */

describe("role sets", () => {
  it("never offers a dormant or system role as assignable", () => {
    for (const role of DORMANT_ROLES) expect(ASSIGNABLE_ROLES).not.toContain(role);
    for (const role of SYSTEM_ROLES) expect(ASSIGNABLE_ROLES).not.toContain(role);
  });

  it("accounts for every declared role exactly once", () => {
    const covered = [...ASSIGNABLE_ROLES, ...DORMANT_ROLES, ...SYSTEM_ROLES];
    expect(new Set(covered).size).toBe(ROLES.length);
  });
});

describe("commission is Owner and Admin only", () => {
  it("grants Owner and Admin", () => {
    expect(can("owner", "view", "commission_terms")).toBe(true);
    expect(can("admin", "view", "commission_terms")).toBe(true);
  });

  /* Finance is the interesting denial: they handle the money but not
     the terms Fidato negotiated to earn it. */
  it("denies everyone else, including Manager and Finance", () => {
    for (const role of ["manager", "salesperson", "finance", "viewer"] as const) {
      expect(can(role, "view", "commission_terms"), role).toBe(false);
    }
  });
});

describe("invoices are Owner, Admin, Manager and Finance", () => {
  it("grants the four", () => {
    for (const role of ["owner", "admin", "manager", "finance"] as const) {
      expect(canAccess(role, "invoice"), role).toBe(true);
    }
  });

  it("denies salespeople", () => {
    expect(canAccess("salesperson", "invoice")).toBe(false);
  });
});

describe("dormant roles grant nothing", () => {
  /* An empty grant map plus deny-by-default is what makes "retained
     but inert" true rather than aspirational. */
  it("denies every resource", () => {
    for (const role of DORMANT_ROLES) {
      expect(canAccess(role, "dashboard"), role).toBe(false);
      expect(canAccess(role, "reservation"), role).toBe(false);
      expect(canAccess(role, "hotel"), role).toBe(false);
    }
  });
});

describe("scopeConstraints", () => {
  it("pins a salesperson to their own records", () => {
    expect(scopeConstraints({ role: "salesperson", userId: "u1" })).toEqual([
      { field: "ownerId", value: "u1" },
    ]);
  });

  /* ⚠️ Stricter than scopeRecords, which also admits unowned records.
     An equality query cannot express "mine or unowned", so the query
     narrows and the rule agrees with it. A rule and a query that
     disagree do not return a subset — the query fails outright. */
  it("leaves every other role unconstrained", () => {
    for (const role of ["owner", "admin", "manager", "finance", "viewer"] as const) {
      expect(scopeConstraints({ role, userId: "u1" }), role).toEqual([]);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════
   THE MATRIX MUST NOT PROMISE WHAT THE RULES REFUSE

   ⚠️ A grant here is not a permission — firestore.rules is the only
   real boundary. When the two disagree the navigation shows an entry,
   the route guard opens it, and the first query fails: a page that
   exists solely to display a permission error.

   Finance drifted this way on two resources at once. These cases are
   pinned to the roles firestore.rules actually admits, so reopening
   one without touching the rules fails here instead of in front of a
   user. If you are changing one of these, change firestore.rules in
   the same commit.
   ══════════════════════════════════════════════════════════════════ */

describe("the matrix agrees with firestore.rules", () => {
  /* rules: match /commissions — allow read, write: if isOwnerOrAdmin() */
  it("offers commission rows only to owner and admin", () => {
    expect(canAccess("owner", "commission")).toBe(true);
    expect(canAccess("admin", "commission")).toBe(true);
    for (const role of ["finance", "crs_manager", "manager", "salesperson", "viewer"] as const) {
      expect(canAccess(role, "commission"), role).toBe(false);
    }
  });

  /* rules: match /auditLogs — read: owner, admin, crs_manager, manager */
  it("offers the audit log only to the roles the rules admit", () => {
    for (const role of ["owner", "admin", "crs_manager", "manager"] as const) {
      expect(canAccess(role, "audit_log"), role).toBe(true);
    }
    for (const role of ["finance", "salesperson", "viewer"] as const) {
      expect(canAccess(role, "audit_log"), role).toBe(false);
    }
  });

  /* rules: match /hotels/{id}/private — read, write: if isOwnerOrAdmin().
     The negotiated rate itself, distinct from the commission rows. */
  it("keeps commission terms to owner and admin", () => {
    expect(canAccess("owner", "commission_terms")).toBe(true);
    expect(canAccess("admin", "commission_terms")).toBe(true);
    for (const role of ["finance", "crs_manager", "manager", "salesperson", "viewer"] as const) {
      expect(canAccess(role, "commission_terms"), role).toBe(false);
    }
  });

  /* rules: match /users — update and delete: if isOwnerOrAdmin(), with
     an owner-escalation guard the matrix cannot express. */
  it("gives user administration to owner and admin, and nobody else", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(can(role, "edit", "user"), role).toBe(true);
      expect(can(role, "delete", "user"), role).toBe(true);
    }
    for (const role of ["crs_manager", "manager", "finance", "salesperson", "viewer"] as const) {
      expect(can(role, "edit", "user"), role).toBe(false);
      expect(can(role, "delete", "user"), role).toBe(false);
    }
  });

  /* rules: customers, companies and reservations all allow update via
     amendsAccounts() — owner, admin, crs_manager, manager. */
  it("lets the desk roles amend accounts but not a salesperson", () => {
    for (const role of ["owner", "admin", "crs_manager", "manager"] as const) {
      expect(can(role, "edit", "customer"), role).toBe(true);
      expect(can(role, "edit", "company"), role).toBe(true);
    }
    expect(can("salesperson", "create", "customer")).toBe(true);
    expect(can("salesperson", "edit", "customer")).toBe(false);
    expect(can("salesperson", "edit", "company")).toBe(false);
  });

  /**
   * ⚠️ The salesperson raises bookings and does not amend them. A
   * confirmed reservation is what an invoice, a commission and a
   * voucher already in the guest's hands hang off.
   */
  it("lets the desk amend and remove bookings, while a salesperson only raises them", () => {
    expect(can("salesperson", "create", "reservation")).toBe(true);
    expect(can("salesperson", "edit", "reservation")).toBe(false);
    expect(can("salesperson", "cancel", "reservation")).toBe(false);
    expect(can("salesperson", "delete", "reservation")).toBe(false);

    for (const role of ["owner", "admin", "crs_manager"] as const) {
      expect(can(role, "edit", "reservation"), role).toBe(true);
      expect(can(role, "delete", "reservation"), role).toBe(true);
    }
  });

  /* rules: match /payments — create, update: owner, admin, finance */
  it("offers payments only to owner, admin and finance", () => {
    for (const role of ["owner", "admin", "finance"] as const) {
      expect(canAccess(role, "payment"), role).toBe(true);
    }
    for (const role of ["crs_manager", "manager", "salesperson", "viewer"] as const) {
      expect(canAccess(role, "payment"), role).toBe(false);
    }
  });
});
