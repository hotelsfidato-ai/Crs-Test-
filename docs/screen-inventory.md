# Screen inventory

38 routes. Guards come from `canAccess(role, resource)` in `src/lib/permissions.ts`; a route
the role cannot reach renders **Forbidden**, not 404.

Every list screen ships **empty, loading, error and no-results** states — the last two are
distinct, because "nothing matched your filter" and "nothing exists yet" need different words
and different exits.

Search, filters, sort and page live in the **URL** (`useListState`), so a filtered view is
shareable and survives a refresh.

---

## Shell

Collapsible sidebar · top bar (global search, role switcher, notification drawer, AI panel) ·
⌘K command palette · toasts. Below `lg` the sidebar becomes a drawer.

---

| Route | Purpose | Resource |
|---|---|---|
| `/dashboard` | Role-aware. Sales sees pipeline; hotel manager sees today's arrivals/departures/in-house; finance sees receivables | `dashboard` |
| **Reservations** | | |
| `/reservations` | Data table, saved filters, bulk actions | `reservation` |
| `/reservations/calendar` | Month grid **and** per-property timeline with interval packing | `reservation` |
| `/reservations/new` | 5-step wizard: customer → property → dates & rooms → rates & extras → review. Live quote with corporate discount and the ₹50,000 threshold warning | `reservation` |
| `/reservations/:id` | Folio, guests, timeline, documents. Approve / check-in / check-out / cancel | `reservation` |
| `/reservations/approvals` | Queue of bookings ≥ ₹50,000, largest first | `reservation_approval` |
| **CRM** | | |
| `/crm/customers` | List, scoped to owner for salespeople | `customer` |
| `/crm/customers/new`, `/:id`, `/:id/edit` | Create, detail, edit. Live duplicate warning on email and phone | `customer` |
| `/crm/companies` | List with credit-utilisation bars | `company` |
| `/crm/companies/new`, `/:id`, `/:id/edit` | Create, detail (contacts, bookings, contract, credit), edit | `company` |
| `/crm/merge` | Duplicate detection by phone → email → name, with side-by-side survivor choice | `customer` |
| `/crm/import` | CSV wizard: upload → map columns → validate → review → commit. Validates against the same uniqueness rules as the form | `customer` |
| **Properties** | | |
| `/hotels` | Grid and table views of all 32 | `hotel` |
| `/hotels/:id` | Overview, rooms, bookings, location with real distances | `hotel` |
| `/hotels/:id/inventory` | Availability grid, room type × day, shaded by booking pressure | `inventory` |
| `/hotels/:id/rates` | Rate plans by season and meal plan. **Read-only for hotel managers** | `rate` |
| **Finance** | | |
| `/finance/invoices` | List with outstanding and overdue totals | `invoice` |
| `/finance/invoices/:id` | Printable tax invoice, Georgia cover. Record payment | `invoice` |
| `/finance/payments` | Receipts, reconciliation status | `payment` |
| `/finance/commissions` | What Fidato earns, ranked by commission not booking value | `commission` |
| **Reports** | | |
| `/reports` | Gallery — each entry states the question it answers | `report` |
| `/reports/revenue` | Trend, bookings, channel mix, month table | `report` |
| `/reports/sales-performance` | Leaderboard with conversion and cancellations | `report` |
| `/reports/occupancy` | Property occupancy vs Fidato room nights, by city | `report` |
| `/reports/hotel-performance` | All 32, sortable by revenue / per-room / occupancy | `report` |
| `/reports/forecast` | Six-month straight-line projection, with its limits stated on the page | `report` |
| **Automation** | | |
| `/automation` | Workflow cards, trigger → steps chain, pause/resume | `automation` |
| `/automation/:id` | Trigger, conditions, ordered steps, run history. Names the n8n node each step maps to | `automation` |
| `/automation/runs` | Full run log with failure reasons | `automation` |
| **Notifications** | | |
| `/notifications` | Inbox, all/unread | `notification` |
| `/notifications/templates` | Templates per channel, previewed with a sample booking substituted | `notification` |
| **AI** | | |
| `/ai` | Assistant workspace. Answers computed from live seed data, so figures always agree with Reports | `ai` |
| **Administration** | | |
| `/admin/users` | 24 users across 8 roles | `user` |
| `/admin/roles` | Live permission matrix + business rules | `role` |
| `/admin/integrations` | 14 integrations, mostly Phase 2/3 | `integration` |
| `/admin/audit-log` | Append-only, rows link to their record | `audit_log` |
| `/admin/settings` | Organisation details; read-only below Super Admin | `setting` |
| **Internal** | | |
| `/design-system` | Living style guide — every token and component, rendered from the real modules | — |

---

## Deliberately out of scope for Phase 1

No login or auth · no Firebase · no n8n · no real email, PDF or WhatsApp delivery (buttons
show what would happen) · no file uploads · no server. The assistant returns computed, not
generated, answers. Data resets on refresh.
