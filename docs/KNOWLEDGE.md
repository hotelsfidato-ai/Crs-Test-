# Fidato Platform — portable knowledge pack

**What this is.** A single self-contained file you can paste into a fresh Claude session — or
any other assistant — that has no access to this repository. It carries the domain knowledge,
the architecture, the decisions and the traps.

If the session *does* have repo access, [`../CLAUDE.md`](../CLAUDE.md) and
[`CONTEXT.md`](CONTEXT.md) are better starting points. This file exists for the case where it
does not.

**How to use it:** paste the whole file, then state your task.

---

## 1 · The business

Fidato Hotels sells room nights into **32 partner properties it does not own**. It holds
commercial agreements with those hotels and sells into them through a sales team, corporate
accounts, travel agents and its own website.

It is **not** a property management system. Each partner already runs one. Fidato needs a
**central reservation system with a CRM and a back office**: a system that knows *its own*
customers, bookings and commission across 32 properties it does not control.

### The consequence that catches everyone out

Fidato sells **a slice** of each hotel. Other channels — the hotel's own site, OTAs, walk-ins,
other agents — sell the rest.

> **Occupancy is NOT Fidato's reservations ÷ the hotel's total rooms.**

Over this portfolio that ratio comes out below 1%. Not a low number — a *meaningless* one,
because the denominator describes something Fidato does not control. Occupancy is taken from an
inventory model representing the property's true position across all channels (55–82%). The
Fidato-booked portion is labelled separately as **"Fidato room nights"**.

### Vocabulary

| Term | Meaning |
|---|---|
| EP / AP / MAP / All Inclusive | Meal plans. Room only / all meals / breakfast + one meal / all inclusive |
| Folio | The itemised charge sheet for a stay. Frozen once the stay completes |
| Room night | One room for one night — the unit of hotel inventory |
| Season | A date window with its own meal-plan combinations and cancellation policy |
| Terminal status | Completed, cancelled or no-show. Locked against edits |
| DP / RA / BTC | Payment terms: direct payment / room advance / bill to company |
| GSTIN | Indian tax registration number. Appears on invoices |
| Commission | What Fidato earns on a booking. 8–18% by property |

---

## 2 · Phases

| Phase | Scope | State |
|---|---|---|
| **1** | Full frontend, no backend, no login, simulated data | ✅ Done, deployed |
| **2** | Firebase — Auth, Firestore, Storage, rules. **Spark plan only** | 📋 Planned |
| 2.5 | n8n consumes `automationQueue` — vouchers, Drive, email | Designed |
| 3–4 | Further automation, final testing | — |

**Why frontend first**, against the conventional data-model → API → UI order:

1. The requirements were a description, not a specification. Building the screens *is* the
   fastest way to discover what the fields need to be.
2. The expensive mistake here is a wrong *flow*, not a wrong query.
3. Because the repository layer was written to Firestore's shape from line one, the simulation
   is not throwaway — it is the same interface with a different implementation behind it.

---

## 3 · Architecture

```
React UI  →  Repository layer  →  Firebase  →  automationQueue  →  n8n  →  Drive/Email/etc.
```

**Two rules that must never break:**

1. **Screens import only from `@/data/repositories`.** Never from `firestore/`
   directly. That seam is why Phase 2 swapped one folder instead of rewriting 34
   screens — `mock/` is gone and the barrel re-exports `./firestore`.
2. **The React app never talks to Drive, WhatsApp, email, AI, accounting or marketing.** It
   writes an event to `automationQueue`; n8n does the rest.

### Layers

| Layer | Path | Rule |
|---|---|---|
| Screens | `src/features/**` | May import ui, lib, repositories |
| Shell | `src/components/app/**` | Sidebar, top bar, palette |
| Primitives | `src/components/ui/**` | Never import features or repositories |
| Cross-cutting | `src/lib/**` | Imports nothing from components or features |
| Data | `src/data/**` | The seam. `repositories/index.ts` re-exports `./firestore` |

### Stack

React 19 · Vite · TypeScript strict · Tailwind v4 · React Router v7 · TanStack Query v5 ·
Zustand · Radix UI · react-hook-form + Zod · Recharts · Inter Variable

### State ownership

| Kind | Mechanism | Test |
|---|---|---|
| Server | TanStack Query | Does it come from a repository? |
| URL | `useListState` | Would you send it to a colleague? |
| Global client | Zustand | Do two distant components need it? |
| Local | `useState` | Does anything outside care? |

---

## 4 · Domain model

18 Firestore-shaped collections. The central ones:

```
companies ──< customers ──< reservations >── hotels ──< roomTypes
                                │                └──< seasons
                                ├──> invoices ──< payments
                                ├──> commissions
                                └──< auditLogs
```

**Denormalised deliberately** — Firestore has no joins. A reservation carries `customerName`,
`companyName`, `hotelName`, `hotelCity` and `ownerName` so a list renders without lookups.

### Two foreign keys drive all scoping

| Field | Purpose |
|---|---|
| `ownerId` | Row-level scoping for salespeople; commission attribution |
| `hotelId` | Row-level scoping for property staff |

### Reservation lifecycle

```
draft ──┬─> pending_approval ──> confirmed ──> checked_in ──> completed
        └─> confirmed                    └──> cancelled / no_show
```

`completed`, `cancelled` and `no_show` are **terminal and locked**.

---

## 5 · The business rules

| # | Rule | Why |
|---|---|---|
| BR-01 | A reservation is never deleted, only cancelled | Commercial history must outlive the booking — disputes, commission reconciliation, cancellation reporting |
| BR-02 | Bookings ≥ ₹50,000 require approval | Large bookings carry the most discount risk |
| BR-03 | Completed / cancelled / no-show are locked | The folio is the basis for invoicing and commission |
| BR-04 | Room configuration is set centrally; salespeople enter selling rates per reservation | Pricing is a central commercial decision |
| BR-05 | A salesperson sees only their assigned accounts | Ownership drives commission |
| BR-06 | Customer email and phone must be unique | Duplicates split stay history and corrupt lifetime value |
| BR-07 | Merging moves all children to the survivor | A merge must never orphan history |
| BR-08 | Every change is written to an append-only audit log | The only way to settle a dispute |
| BR-09 | Commission is visible only to Owner and Admin | Negotiated commercial term |
| BR-10 | BTC payment term requires a company | Cannot bill a company that is not set |
| BR-11 | Roles are assigned by the Owner alone | Prevents privilege escalation |

### GST

**5%** below ₹7,500 per room per night · **18%** at or above.

⚠️ The band follows the **per-room per-night rate**, not the booking total. A ten-night booking
of a ₹4,000 room totals ₹40,000 and is still 5%.

⚠️ **Compute tax per room line and sum.** A reservation can legitimately contain both bands.
Computing on the total is a tax error, not a rounding difference.

---

## 6 · Roles

| Role | Purpose |
|---|---|
| Owner | Unrestricted. Sole authority over roles, commission, settings |
| Admin | Runs the platform; cannot assign roles |
| Manager | Sales leadership. Approvals and invoices |
| Salesperson | Sells. Own accounts only |
| Finance | Invoices, payments, commissions |
| Viewer | Read-only |

Dormant (defined, no grants): `hotel_manager`, `support`.
System (never assigned to a person): `automation` — the n8n service account.

**Two concepts, deliberately separate:**

```ts
can(role, action, resource)     // may this role touch this kind of thing?  → rendering
scopeRecords(ctx, records)      // which records?                          → data
```

---

## 7 · ⚠️ Traps

Every one of these was a real defect. They are the highest-value part of this document.

### Occupancy is not reservations ÷ rooms
Covered in §1. Reports <1% and means nothing.

### Date filters need BOTH bounds
```ts
r.checkIn >= monthStart                              // ✗ absorbs the whole forward book
r.checkIn >= monthStart && r.checkIn < nextMonth     // ✓
```
The one-sided version reported **+757% growth** and nothing threw.

### Radix `Slot` accepts exactly one child
`Button asChild` with icons crashes the whole app. Fold icons *inside* the child element with
`cloneElement`. Do not forward `disabled` onto an anchor.

### Radix scroll lock leaks
A modal that unmounts while open strands `pointer-events: none` on `<body>` and the entire app
goes dead **with no console error**. Close before navigating; add a route-change guard.

### Repositories return `null`, never `undefined`
TanStack Query throws on `undefined`. `null` means "looked, found nothing".

### Hiding a field in the UI is not security
Firestore rules are **document-level**. Anyone who can read a document reads every field, via
SDK or REST. Sensitive fields need a subcollection with its own rule.

### Structural checks miss visual bugs
Two identical primary buttons appear as two normal entries in an accessibility tree. Look at a
rendered screenshot.

### Derived dates need clamping
A booking cannot be created after today. Deriving `createdAt` from check-in without a clamp
produced future creation dates that rendered as *"in about 1 month"*.

### Seed volume was a design parameter
320 reservations over 480 days is 0.67 arrivals/day across 32 properties — the dashboard looked
dead. Choose volume from the real-world rate the data represents.

⚠️ Historical. The seed layer is deleted; the database is empty and stays
that way until the owner imports real records. A dashboard reading zero is
now correct, not a symptom.

### On Spark, every unbounded read is a bug
50k reads a day, shared across everything. A report that reads all
reservations to aggregate costs one read per row **per view**. Use
`getCountFromServer` for counts — one read regardless of how many
documents match — and `limit()` on everything else. Firestore has no
GROUP BY; the alternative is a roll-up collection maintained by a
trigger, which needs Blaze.

---

## 8 · Design system

| Token | Value | Use |
|---|---|---|
| `ink-900` | `#031728` | Fidato Black — text, sidebar |
| `brand-orange` | `#DF6128` | Primary action, active nav |
| `brand-tangerine` | `#EB8C00` | Secondary accent |
| `brand-yellow` | `#FFB600` | Pending, warning |
| `brand-rose` | `#DB536A` | Attention, no-show |
| `brand-red` | `#E0301E` | Destructive, error, overdue |
| `success` | `#1F6F5C` | **Added** — the guide has no success colour |
| `info` | `#2B6CB0` | **Added** — in progress, checked in |

Grey ramp `#354552 · #67737E · #9AA2A9 · #CCD0D4` · page `#F7F8F9` · borders `#E2E5E8`.

Typography: **Inter Variable**, 14px body / 22px line height. Georgia for printed documents only.
Radius 10px. Transitions 150–200ms ease-out. **Tabular figures on every comparable number.**

### Conventions

- **Show blocked actions, never hide them.** Disabled + tooltip explaining why. Makes permission
  bugs self-reporting.
- **Forbidden, not 404**, for a route a role cannot reach.
- **Empty ≠ no-results.** Different words, different exits.
- **One primary button per view.**
- **Hairline borders, not shadows.** Shadows only on things that float.

---

## 9 · Phase 2 — the Spark constraints

**No Cloud Functions, no Admin SDK, no custom claims, no server-side triggers.**

The consequence: **there is no trusted server.** Every write comes from a browser the user
controls, so **security rules are the only real enforcement.** Everything in the client is a
convenience.

| Problem | Spark solution | Residual risk |
|---|---|---|
| Roles | Firestore `users/{uid}` doc, read by rules via `get()` | ⚠️ A user who could write their own `role` becomes Owner. Needs `affectedKeys().hasOnly(...)` **and a test** |
| Roll-up counters | Client transactions + a manual recompute tool | A client could write a false total. Invoices compute from source instead |
| Merge | A resumable job document, batched | Tab can close; job is resumable |
| Invoice numbering | Counter document + transaction | ~1/sec ceiling |
| Audit immutability | Rules make entries un-editable | ⚠️ Tamper-**evident**, not tamper-proof — a client can simply not write one |
| n8n integration | n8n **polls** Firestore REST | Up to 60s latency |
| Pagination | Cursor-based, Prev/Next | Numbered pages disappear |

### The most dangerous rule in the system

```js
match /users/{uid} {
  allow update: if request.auth.uid == uid
                && request.resource.data.role   == resource.data.role
                && request.resource.data.status == resource.data.status
                && request.resource.data.diff(resource.data)
                     .affectedKeys().hasOnly(['name','phone','avatarColor','updatedAt']);
}
```

Without it, **any signed-in user can promote themselves to Owner from the browser console.**

---

## 10 · Phase 2 scope — all built

| # | Change | State |
|---|---|---|
| C-1 | GST 5% / 18%, per line | ✅ `src/lib/tax.ts`, unit-tested |
| C-2 | **Pricing moves from hotel config to the reservation** | ✅ `RoomType` and `Season` carry no money |
| C-3 | Meal plans → EP / AP / MAP / All Inclusive | ✅ CP retired |
| C-4 | Seasons carry meal-plan combinations | ✅ `RatesPage` rebuilt as a seasons editor |
| C-5 | Hotel confirmation no., rep name, time, payment term | ✅ on `Reservation` |
| C-6 | Create hotel / user / company | ✅ `HotelFormPage`, `InviteUserDialog`, `CompanyFormPage` |
| C-7 | Bulk import ×3 | ✅ **CSV *and* Excel**, with templates and auto-mapping |
| C-8 | Commission → Owner/Admin only (subcollection) | ✅ + `CommissionDialog` |
| C-9 | Invoices → Owner/Admin/Manager/Finance | ✅ matrix + rules |
| C-10 | 8 roles → 6 active | ✅ 6 assignable, 2 dormant, 1 system |
| C-11 | Inventory hidden, code preserved | ✅ repo method kept, nothing writes to it |

**C-2 consequence, unresolved:** with no configured price, nothing constrains
what a salesperson charges. The ₹50,000 approval threshold is currently the
only commercial control. The planned soft guard — flag anything well below the
trailing median for that room type — was **not built**, because with an empty
database there is no trailing median yet. Revisit once real bookings exist.

**C-6, as actually built:** creating another person's Auth account needs the
Admin SDK, which Spark does not have. So sign-up is open and the *invitation*
is the gate. ⚠️ The plan said "a `users` doc with status: invited"; that is
**not** what shipped. Rules resolve a caller's role with
`get(users/$(request.auth.uid))` and cannot query, so an invited person — who
has no uid yet — cannot have a `users` row. Invitations are a separate
collection keyed by lower-cased email. The document id being the email is what
lets a rule check `request.auth.token.email == email`.

### Sprint order — as planned vs. as executed

The 26-day plan below was compressed. Rules were still written before the
repositories were pointed at live data, which was the important ordering
constraint — developing against open rules and discovering at lockdown that
half the queries violate them is the failure this avoids.

```
S0 rules tests → S1 Firebase config → S2 schema → S3 auth → S4 security rules
→ S5 read repos [CHECKPOINT] → S6 write repos → S7 users → S8 hotels
→ S9 reservations → S10 invoices → S11 import → S12 dashboard → S13 queue → S14 cleanup
```

⚠️ **S0 was not done as specified.** The rules-unit tests against the emulator
were never written; what exists is a client-side permission-matrix test, which
proves nothing about what the SDK will actually allow. That is the largest
outstanding gap.

⚠️ **Rules filter documents, not queries.** A query that *could* return a forbidden document
fails entirely rather than returning a subset. The client must constrain the query too:
```ts
if (ctx.role === "salesperson") q = query(q, where("ownerId", "==", ctx.userId));
```
This is the most common Firestore rules mistake.

---

## 11 · Infrastructure

| | |
|---|---|
| Repo | `github.com/hotelsfidato-ai/Crs-Test-` — **public** |
| Firebase | `crstest-9a0c5` — **Spark** |
| Hosting | `https://crstest-9a0c5.web.app` — **still the Phase 1 build**, no login |
| Firestore | Role-aware rules written and committed, **not yet deployed** |
| Realtime DB | Exists, denied, unused |
| Storage | Not provisioned. Only needed once vouchers/PDFs land |
| Auth | Code complete; **Email/Password not yet enabled in the console** |
| n8n | Self-hosted VPS via Hostinger |

⚠️ **The database is empty and has no users.** The seed layer is deleted,
so every screen shows an empty state until real data is imported. The
first Owner cannot be created from inside the app — only an Owner or
Admin may create an invitation, and at first run neither exists. The
bootstrap invitation is written by hand in the Firebase console, which
bypasses rules. Full procedure in `RUNBOOK.md`.

⚠️ Firebase **web** API keys are not secrets — Google documents them as safe to expose. Security
comes entirely from rules. That is why the rules file is the most important file in Phase 2.

---

## 12 · Working conventions

```bash
npm run dev                                   # localhost:5173
npm run typecheck                             # tsc -b
npm test                                      # 31 tests
npm run build
firebase deploy --only firestore:rules --project crstest-9a0c5
firebase deploy --only hosting --project crstest-9a0c5
```

⚠️ `tsconfig.json` is a solution file with `"files": []`. A bare
`npx tsc --noEmit` compiles **nothing** and reports zero errors on a
broken build. Use `tsc -b`.

- `npm install` from **PowerShell**, not Git Bash (TLS-inspecting proxy on this machine).
- Commit per module: `feat(auth): Firebase Authentication`.
- Branch per sprint: `phase-2/s03-auth`. `main` stays deployable.
- **Verify by hand in a real browser** at the end of every sprint. Automated harnesses have
  missed both visual duplication and interaction failures on this project.

---

## 13 · Honest limitations

- **Nothing has been exercised against a real Firestore.** Every repository
  method compiles and none has executed against the live database. Auth is
  not enabled in the console, so no sign-in has ever succeeded.
- **`firestore.rules` has never been run.** The permission matrix is tested
  on the client side, but the rules file itself has not been executed
  against the emulator. Client-side permission tests prove nothing about
  what the SDK will actually allow — that needs
  `@firebase/rules-unit-testing`. This is the largest remaining gap.
- **The interactive flows were never click-tested end to end** — the
  reservation wizard, approve/cancel, merge, import commit. They compile
  and are unit-tested at the logic layer, not behaviourally verified.
- **31 unit tests exist**, covering GST bands, import mapping and the
  permission matrix. No component tests, no integration tests.
- **No screen-reader pass**, no full keyboard traversal, no skip-to-content link.
- **The audit trail is tamper-evident, not tamper-proof** on Spark. Rules
  stop a row being altered or removed; nothing can guarantee one was
  written at all, because the client writes it.
- **The deployed app is still Phase 1 and still has no authentication.**
  Anyone with the URL sees the simulated build.
