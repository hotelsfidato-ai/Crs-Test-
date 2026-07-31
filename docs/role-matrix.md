# Roles, permissions and business rules

The live version of this document is **`/admin/roles`** in the running app. It is generated
from `src/lib/permissions.ts` and `src/lib/rules.ts` — the same modules the navigation, route
guards and every action button consult. It is not a diagram of the permission model; it *is*
the permission model.

---

## No login in Phase 1

There is no sign-in screen. The top bar carries a **"Viewing as…" role switcher** that assumes
the identity of a seeded user for the chosen role. Switching genuinely re-renders navigation,
the dashboard, row-level scoping and every available action.

This is the single control that makes the permission model reviewable without auth. In Phase 2
the store behind it is fed by Firebase Auth and the switcher becomes a dev-only affordance.

Observable difference, as an example: **Super Admin sees 16 navigation items; Hotel Manager
sees 7.**

---

## The eight roles

| Role | What they are for |
|---|---|
| Super Admin | Everything, including users, roles and org settings |
| Admin | Operational administration; no role editing |
| Sales Manager | Owns the sales team; approves bookings over the threshold |
| Salesperson | Sells. Sees only their own accounts |
| Hotel Manager | Runs one property. Reads rates, never edits them |
| Finance | Invoices, payments, commissions, approvals visibility |
| Support | Reads most things, changes almost nothing |
| Viewer | Read-only |

Resources (20) × actions (8) are enumerated in `permissions.ts`. `can(role, action, resource)`
is the only way anything asks.

---

## Business rules

Encoded in `src/lib/rules.ts` as `BUSINESS_RULES`, each naming the function that enforces it.

| # | Rule | Why | Enforced in |
|---|---|---|---|
| BR-01 | A reservation is never deleted, only cancelled | The commercial history has to outlive the booking — disputes, commission reconciliation, cancellation reporting | `canCancelReservation()` |
| BR-02 | Bookings ≥ ₹50,000 require approval before confirming | Large bookings carry the most discount risk; a second pair of eyes before the guest is committed to | `requiresApproval()` |
| BR-03 | Completed, cancelled and no-show reservations are locked | Once a stay resolves, its folio is the basis for invoicing and commission | `canEditReservation()` |
| BR-04 | Hotel managers cannot edit rate plans | Pricing is negotiated centrally; a property changing its own rates breaks corporate contracts | `canEditRates()` |
| BR-05 | A salesperson sees only their assigned accounts | Ownership drives commission, so visibility must match accountability | `scopeRecords()` |
| BR-06 | Customer email and phone must be unique | Duplicates split stay history, corrupt lifetime value, and send guests conflicting messages | `isDuplicateEmail()` / `isDuplicatePhone()` |
| BR-07 | Merging moves all reservations and invoices to the survivor | A merge must never orphan history | `customersRepo.merge()` |
| BR-08 | Every change is written to the append-only audit log | The only reliable way to settle a disagreement between property, client and sales | `recordAudit()` |

---

## How restrictions are presented

A blocked action is **shown and explained**, not hidden. Hiding it makes the product look
broken and teaches nobody the rule.

- **Rate plans, as Hotel Manager** — a "Read-only for your role" banner explains that pricing
  is owned by the revenue team, and every row shows *Locked* where the Edit button would be.
  Verified: 12 Edit buttons as Super Admin, 12 Locked markers as Hotel Manager.
- **Cancel on a completed reservation** — the button stays visible but disabled, with a
  tooltip giving the reason.
- **A route the role cannot reach** — renders *Forbidden*, not 404. "You can't see this" and
  "this doesn't exist" are different statements.
- **Nowhere in the product is there a delete control for a reservation.** BR-01 is enforced by
  absence, not by a confirmation dialog.
