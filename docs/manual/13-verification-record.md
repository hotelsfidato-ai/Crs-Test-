← [XII — Defect log](12-defect-log.md) · [Index](README.md) · Next: [XIV — Phase 2 handover](14-phase-2-handover.md)

---

# Volume XIII — Verification record

What was tested, how, what passed — and, stated plainly, **what was not tested**.

A verification record that only lists passes is a marketing document. The gaps in §13.4 and
§13.7 are the part of this volume that matters.

---

## 13.1 Summary

| Category | Result |
|---|---|
| TypeScript strict typecheck | ✅ Clean |
| Production build | ✅ Clean — 2,959 modules |
| Route reachability (38) | ✅ All resolve |
| Screen rendering (sampled) | ✅ Verified |
| Role model | ✅ Verified across 3 roles |
| Business rules | ⚠️ Partially — see §13.3 |
| Interactive flows | ❌ **Not verified** — see §13.4 |
| Accessibility | ⚠️ Partially — see §13.6 |

---

## 13.2 Automated checks

### Typecheck

```bash
npx tsc --noEmit -p tsconfig.app.json
```

**Result:** clean, no output.

Configuration: `strict: true`, `noUnusedLocals`, `noUnusedParameters`,
`noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`.

`noUncheckedIndexedAccess` caught a genuine bug during the build — the calendar's interval
packing assumed a non-empty array, which would have thrown on a month with no bookings.

### Build

```bash
npm run build
```

```
✓ 2959 modules transformed.
✓ built in 8.95s
```

| Chunk | Raw | Gzipped |
|---|---:|---:|
| `index` | 390.6 kB | 120.4 kB |
| `BarChart` (Recharts) | 359.1 kB | 103.9 kB |
| `ui` (Radix + library) | 257.6 kB | 81.4 kB |
| `schemas` (Zod + RHF) | 100.4 kB | 29.4 kB |
| Largest screen chunk | 37.0 kB | 11.3 kB |

All 34 feature screens code-split as intended.

### Route reachability

All 38 routes fetched — every one returned 200:

```
/dashboard /reservations /reservations/calendar /reservations/approvals
/crm/customers /crm/companies /crm/merge /crm/import /hotels
/finance/invoices /finance/payments /finance/commissions
/reports /reports/revenue /reports/sales-performance
/reports/hotel-performance /reports/forecast
/automation /automation/runs /notifications /notifications/templates
/ai /admin/users /admin/roles /admin/integrations /admin/audit-log
/admin/settings /design-system
```

⚠️ This proves the SPA shell serves; it does not prove each screen renders. §13.3 covers that.

---

## 13.3 Screen rendering — verified individually

Each screen below was loaded and its rendered text inspected.

### Dashboard — as Sales Manager

```
Portfolio overview · 28 Jul 2026 · Viewing as Sales Manager
REVENUE THIS MONTH   ₹33.2L    −11.2% vs last month
RESERVATIONS         65        −14.5% vs last month
AWAITING APPROVAL    66        ₹87.3L
CANCELLATION RATE    12.3%
Arrivals 2 · Departures 0 · In house 4
```

✅ Plausible figures, populated day panel, approval queue with real bookings.

### Occupancy report

```
TOTAL ROOMS 1,969 (24 cities) · FIDATO ROOM NIGHTS 6,983
PROPERTY OCCUPANCY 61% (all channels, next 30 days) · REVENUE ₹6.26Cr

Goa   192 rooms  770 nights  ₹9,234  60%  ₹71,10,547
Pune  332 rooms  808 nights  ₹5,939  62%  ₹47,98,437
…
```

✅ Occupancy 58–66%, the two metrics clearly distinguished ([ADR-19](03-decision-log.md#adr-19)).

### Rate plans — the permission test

| Role | Banner | Edit buttons | Locked markers |
|---|---|---:|---:|
| Hotel Manager | "Read-only for your role" | 0 | **12** |
| Super Admin | none | **12** | 0 |

✅ **BR-04 verified end to end.**

### Permission matrix

```js
{ hasMatrix: true, hasRules: true, rows: 20, cols: 9 }
```

✅ 20 resources × 8 roles + label column, with the business rules rendered.

### Calendar

```
Calendar · July 2026 · All properties · 110 interactive elements
```

✅ Month grid renders with bookings positioned.

### Inventory grid

```
Turtle Beach Resort · next 30 days
ROOM NIGHTS 3,330 (111 rooms × 30 days) · BOOKED 2,017
AVAILABLE 1,295 (18 blocked) · OCCUPANCY 61%
```

✅ Arithmetic consistent: 2,017 + 1,295 + 18 = 3,330.

### Duplicate merge

```
4 groups to review · 8 records involved
Same phone number · High confidence · 2 records share +91 98975 04652
```

✅ Detection working across all three strategies.

### Assistant

```
Across the portfolio you are holding 932 live reservations worth ₹5,94,79,298.
• Room nights sold: 6,655
• Average booking value: ₹63,819
• Cancellation rate: 12.3%
• Properties live: 29 of 32
```

✅ Figures reconcile with the dashboard and reports — they read the same store.

### Not-found handling

`/hotels/does-not-exist` → *"Page not found"*, no console error. ✅ ([D-08](12-defect-log.md))

---

## 13.4 ❌ What was NOT verified — interactive flows

**This is the most important section in this volume.**

### The limitation

The automated browser used for verification **does not deliver trusted input events to the
React root.** Real clicks landed on the correct elements and did nothing; Escape did not close
an open dialog.

### The evidence it is the harness, not the app

```js
// 1 · React's handler IS attached to the DOM node
const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Open dialog");
const key = Object.keys(b).find(k => k.startsWith("__reactProps"));
Object.keys(b[key]);
// → ["ref","disabled","className","type","aria-haspopup","aria-expanded",
//    "aria-controls","data-state","onClick","children"]

// 2 · Invoking it directly works perfectly
b[key].onClick({ type: "click", currentTarget: b, target: b,
                 preventDefault(){}, stopPropagation(){} });
// → { dialogs: 1, expanded: "true", bodyStyle: "pointer-events: none;" }
```

The dialog opened, `aria-expanded` flipped, and Radix applied its scroll lock correctly. The
component is sound; the harness is not dispatching trusted events.

A control test confirmed React delegation itself works for plain buttons — `.click()` on the
sidebar toggle successfully flipped the persisted state. Radix menus additionally open on
`pointerdown` rather than `click`, so `.click()` legitimately does not open them.

### What this leaves unverified

| Flow | Built | Typechecked | Click-tested |
|---|:---:|:---:|:---:|
| Reservation wizard, end to end | ✅ | ✅ | ❌ |
| Create a booking ≥ ₹50,000 → approval queue | ✅ | ✅ | ❌ |
| Approve / decline dialogs | ✅ | ✅ | ❌ |
| Cancel dialog with reason | ✅ | ✅ | ❌ |
| Check-in / check-out transitions | ✅ | ✅ | ❌ |
| Customer create / edit submission | ✅ | ✅ | ❌ |
| Merge execution | ✅ | ✅ | ❌ |
| CSV import commit | ✅ | ✅ | ❌ |
| Record payment | ✅ | ✅ | ❌ |
| Rate plan edit | ✅ | ✅ | ❌ |
| Command palette navigation | ✅ | ✅ | ❌ |
| Role switching **via the dropdown** | ✅ | ✅ | ❌ |

### What was verified instead

- **Role switching via the persisted store**, which exercises the same code path the dropdown
  triggers. Confirmed across Sales Manager, Hotel Manager and Super Admin.
- **Step gating** — `Continue` is `disabled` until a customer is chosen:
  ```js
  { step1ContinueDisabled: true }
  ```
  This is the actual guard; a real user cannot bypass it. Synthetic handler invocation *can*
  bypass a `disabled` attribute, which is why driving the wizard that way proved nothing about
  gating.
- **The rules layer**, by inspection against the code and against seeded outcomes: 66
  reservations ≥ ₹50,000 correctly sit in `pending_approval`.

### Required before Phase 2 sign-off

**A manual click-through of the twelve flows above, in a real browser.** They are built and
typechecked; they are not behaviourally verified, and this manual should not be read as
claiming otherwise.

---

## 13.5 Role model verification

Performed by setting the persisted session and reloading.

| Observation | Super Admin | Hotel Manager |
|---|---:|---:|
| Navigation items | 16 | 7 |
| Dashboard title | "Portfolio overview" | "Agra Hotel Taj Pearl today" |
| KPI row | Revenue / Reservations / Approvals / Cancellations | Arrivals / Departures / In house / Occupancy |
| "New reservation" button | present | absent |
| Rate plan Edit buttons | 12 | 0 |
| Rate plan Locked markers | 0 | 12 |
| Read-only banner | absent | present |

✅ The permission model demonstrably drives the interface.

One copy defect was found and fixed during this pass: the hotel-manager dashboard's recent-
bookings panel still read *"Latest bookings across the portfolio"* while showing correctly
scoped data. Now reads *"Latest bookings at {property}"*.

---

## 13.6 Accessibility

### Verified

| Check | Result |
|---|---|
| All interactive elements have accessible names | ✅ after [D-07](12-defect-log.md) |
| Focus visible on all focusable elements | ✅ global `:focus-visible` |
| Form fields labelled and described | ✅ via `Field` |
| Error state announced | ✅ `aria-invalid` + `aria-describedby` |
| Combobox exposes listbox semantics | ✅ after fix |
| Reduced motion respected | ✅ global media query |
| Contrast ratios | ✅ audited — Volume IV §4.3 |

### Not verified

| Gap | Status |
|---|---|
| Screen reader pass (NVDA / JAWS / VoiceOver) | ❌ Not performed |
| Full keyboard-only traversal of every screen | ❌ Not performed |
| Clickable `<tr>` announced as interactive | ⚠️ Known limitation — no valid ARIA role exists; every such row has an alternative path |
| Charts have no text alternative | ⚠️ Open — mitigated by the underlying table being present on every report |
| Skip-to-content link | ❌ Missing — keyboard users tab the sidebar on every navigation |

🔧 The skip link is a small, high-value addition for Phase 2.

---

## 13.7 Known gaps in the build

Stated so they are not discovered as surprises.

| Gap | Where | Impact |
|---|---|---|
| **Bulk actions not implemented** | `/reservations` describes them; no row selection exists | The description overstates the build. Either implement selection or amend the copy |
| Charts lack text alternatives | All report screens | Accessibility |
| No skip-to-content link | App shell | Accessibility |
| Offset pagination | Repository layer | Must become cursor-based in Phase 2 — Volume XIV §14.3 |
| 11 direct `db` reads in screens | Listed in Volume XIV §14.4 | Each becomes a real aggregate in Phase 2 |
| Roll-up counters maintained client-side | `customers`, `companies` | Must move to a Cloud Function — Volume XIV §14.5 |
| No test framework | Whole project | [ADR-24](03-decision-log.md#adr-24) — the weakest decision in the log |

---

## 13.8 Performance

Measured on the dev server, Chromium, desktop.

| Measure | Value |
|---|---|
| Dev server cold start | ~600 ms |
| Production build | 8.9 s |
| Route chunk (median) | ~2.2 kB gzipped |
| Seed generation on load | ~40 ms |
| Repository call (simulated) | 120–400 ms by design |
| Heaviest screen | `/reports/revenue` — 11.3 kB gzipped |

Not measured: Lighthouse, real-device performance, memory over a long session. 🔧 Phase 4.

---

## 13.9 Reproducing this verification

```bash
cd "D:\fidato crs"
npm install          # from PowerShell — see Volume XI §11.11
npx tsc --noEmit -p tsconfig.app.json
npm run build
npm run dev
```

Then, in a **real browser** at `http://localhost:5173`:

1. **Role switching** — Sales Manager → Hotel Manager → Finance → Super Admin. Nav, dashboard
   and available actions should each change.
2. **Reservation flow** — `/reservations/new`, build a booking over ₹50,000, confirm the amber
   banner and the "Submit for approval" label, submit, find it in `/reservations/approvals`,
   approve it, confirm the audit timeline updates.
3. **CRM flow** — create a customer, attach a company, trigger a duplicate warning, merge two
   records on `/crm/merge`.
4. **Restrictions** — as Hotel Manager confirm rate editing is blocked; as Salesperson confirm
   only assigned companies appear; confirm a completed reservation is read-only; confirm no
   delete control exists anywhere.
5. **States** — filter a list to zero results and confirm the no-results state (not the empty
   state); throttle the network and confirm skeletons.
6. **Brand** — `/design-system` renders every token and component; the logo is unaltered; ⌘K
   opens the palette.

Steps 2–4 are the ones §13.4 could not cover.

---

Next: [Volume XIV — Phase 2 handover](14-phase-2-handover.md)
