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
