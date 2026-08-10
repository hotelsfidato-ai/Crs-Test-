import { describe, expect, it } from "vitest";
import { navigationFor, flatNavigationFor } from "./navigation";
import { canImportAnything, ROLES, type Role } from "@/lib/permissions";

/* ══════════════════════════════════════════════════════════════════
   NAVIGATION

   The sidebar is the only map of the product most people ever see, so
   its failures are quiet ones: an entry that opens onto a refusal, an
   entry that exists twice, or a screen with no way to reach it.

   ⚠️ Every assertion here is about the sidebar AGREEING with something
   else — the permission matrix, or the router. A sidebar tested only
   against itself is a sidebar that renders whatever it renders.
   ══════════════════════════════════════════════════════════════════ */

const items = (role: Role) => navigationFor(role).flatMap((s) => s.items);
const labels = (role: Role) => items(role).map((i) => i.label);
const find = (role: Role, label: string) => items(role).find((i) => i.label === label);

describe("the Import entry", () => {
  /* It loads customers, companies AND properties. Filed under
     Customers it was reachable only by way of a different entity, and
     gated on a grant that has nothing to do with importing. */
  it("sits at the top level, not inside Customers", () => {
    expect(labels("owner")).toContain("Import");

    const customers = find("owner", "Customers");
    expect(customers?.children?.map((c) => c.label) ?? []).not.toContain("Import");
  });

  it("points at its own route", () => {
    expect(find("owner", "Import")?.to).toBe("/import");
  });

  /**
   * ⚠️ The bug this replaced. The entry was gated on `customer` — any
   * grant at all — so a salesperson, who may VIEW customers and import
   * nothing, was shown Import, allowed through the guard, and offered
   * a screen whose every action they lacked.
   */
  it("is hidden from roles that may view records but import none", () => {
    for (const role of ["salesperson", "finance", "viewer"] as const) {
      expect(canImportAnything(role), `${role} should import nothing`).toBe(false);
      expect(labels(role), role).not.toContain("Import");
    }
  });

  it("is shown to every role that may import something", () => {
    for (const role of ["owner", "admin", "crs_manager", "manager"] as const) {
      expect(canImportAnything(role), role).toBe(true);
      expect(labels(role), role).toContain("Import");
    }
  });

  /* ⚠️ The sidebar and the route guard read the same predicate. If they
     ever diverge, the failure is an entry that navigates to Forbidden —
     which reads as a broken app rather than a closed door. */
  it("appears exactly when canImportAnything says it should", () => {
    for (const role of ROLES) {
      expect(labels(role).includes("Import"), role).toBe(canImportAnything(role));
    }
  });
});

describe("the sidebar as a whole", () => {
  /**
   * Two entries on one route light up together and read as a fault.
   * Import was briefly both a child of Customers and a top-level item
   * while it was being moved.
   *
   * ⚠️ A child repeating its PARENT's route is the deliberate index
   * link — "All reservations" under Reservations — so the uniqueness
   * that matters is across parents, and among siblings.
   */
  it("never lists one route twice", () => {
    for (const role of ROLES) {
      const parents = items(role).map((i) => i.to);
      expect(new Set(parents).size, `${role}: ${parents.join(", ")}`).toBe(parents.length);

      for (const item of items(role)) {
        const kids = item.children?.map((c) => c.to) ?? [];
        expect(new Set(kids).size, `${role} / ${item.label}`).toBe(kids.length);

        /* A child may repeat its own parent and nothing else. */
        for (const kid of kids) {
          if (kid === item.to) continue;
          expect(parents, `${role}: ${kid} is both a child and a top-level entry`)
            .not.toContain(kid);
        }
      }
    }
  });

  /* A section header over nothing. */
  it("drops a section once its last item is filtered out", () => {
    for (const role of ROLES) {
      for (const section of navigationFor(role)) {
        expect(section.items.length, `${role} / ${section.label}`).toBeGreaterThan(0);
      }
    }
  });

  /* Dormant roles hold an empty grant map, so there is nothing to show
     and nothing that should slip through a canSee predicate. */
  it("shows a dormant role nothing at all", () => {
    for (const role of ["hotel_manager", "support"] as const) {
      expect(navigationFor(role), role).toEqual([]);
    }
  });

  /* Feeds the command palette, so anything reachable must appear and
     nothing may appear twice. */
  it("flattens without duplicates, and includes the top-level entries", () => {
    for (const role of ROLES) {
      const flat = flatNavigationFor(role).map((i) => i.to);
      expect(new Set(flat).size, role).toBe(flat.length);
    }
    expect(flatNavigationFor("owner").map((i) => i.to)).toContain("/import");
  });
});
