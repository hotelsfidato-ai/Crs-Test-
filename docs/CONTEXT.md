# Project context — session handover

**Purpose.** Bring a fresh session (human or agent) to the same level of context as someone who
has been on this project throughout. Read alongside [`../CLAUDE.md`](../CLAUDE.md), which is
loaded automatically and holds the short version.

**Last updated:** 31 July 2026, after the Phase 2 build.

---

## 1 · Where the project stands

| | |
|---|---|
| **Phase 1** | Complete, verified, deployed. **Superseded** — the seed layer it ran on has been deleted |
| **Phase 2** | **Built.** Typecheck, production build, 31 unit tests and 59 rules tests all green. **Not deployed, no data, no users yet** |
| **Phase 2.5** | Designed in [`phase-2/07-phase-2.5-n8n.md`](phase-2/07-phase-2.5-n8n.md). n8n is self-hosted on a VPS via Hostinger; the owner is building workflows separately |

### ⚠️ Read this before touching anything

The three states below are easy to conflate, and doing so wastes a session:

| | |
|---|---|
| **Code** | Phase 2. Auth, Firestore repositories, real security rules, bulk import |
| **What is live** | Still the Phase 1 build. Rules not pushed. Email/Password sign-in not enabled in the console |
| **What is in the database** | Nothing. No records, no users, not even a first Owner |

So: **every screen showing an empty state is behaving correctly.** That
is not a bug to chase. The path from here is in the "Going live with
Phase 2" section of [`RUNBOOK.md`](RUNBOOK.md), and its first
irreducible step is creating the bootstrap Owner invitation by hand in
the Firebase console — because only an Owner or Admin may create an
invitation, and at first run neither exists.

### Commits on `main`

```
0585179  test: pin the GST bands, the import mapping and the permission matrix
229884b  feat(hotels): property form, commission editor, and the go-live runbook
7972d7b  feat(auth): Firebase Auth, invitations, and the real security rules
78c69ce  feat(phase-2): swap to Firestore, drop all seed data, apply schema changes
66a214e  feat(import): CSV and Excel engine with auto-mapping and templates
b80a1d9  feat(phase-2): Firebase client, GST bands and shared vocabulary
5f268f9  docs: add session handover prompts and state the knowledge gap honestly
2a8ef70  chore(firebase): deploy Phase 1 to hosting and lock both databases
d441fb9  docs(phase2): record settled decisions on GST, dormant roles and visibility
d95de4b  docs(phase2): engineering sprint plan for the production backend
220f20e  feat(phase-1): complete frontend prototype with simulated data
```

---

## 1b · What changed in Phase 2

The seven changes the owner asked for, and where each landed:

| # | Change | Where |
|---|---|---|
| 1 | GST 5% below ₹7,500, 18% at or above; no prices on rooms | `src/lib/tax.ts`, `RoomType` lost `baseRate` |
| 2 | Create a hotel, a salesperson, a company | `HotelFormPage`, `InviteUserDialog`, existing `CompanyFormPage` |
| 3 | Commission set by and visible only to Owner and Admin | `hotels/{id}/private/commercial` + `CommissionDialog` |
| 4 | Invoices visible only to Manager, Owner, Admin (plus Finance) | `permissions.ts` matrix + `firestore.rules` |
| 5 | Hotel confirmation no., rep name, confirmation time | `Reservation` fields |
| 6 | Rate plans per season with EP / AP / MAP / All Inclusive | `Season` replaces `RatePlan`; `RatesPage` rebuilt |
| 7 | DP / RA / BTC payment terms, plus CSV/Excel bulk import | `PaymentTerm`, `features/import/**`, `ImportPage` |

Two structural consequences worth carrying forward:

- **Rooms carry no price.** Fidato negotiates every booking, so the
  salesperson types the selling rate in the wizard and it is frozen onto
  the folio. A published rate would be a number nobody is bound by — and
  the moment one exists, the wizard starts defaulting to it, which is how
  last year's price gets quoted without anyone noticing.
- **The `users` document id is the auth uid.** The security rules resolve
  a caller's role with `get(users/$(request.auth.uid))`, and rules cannot
  query. That is why invitations are a separate collection keyed by
  email: an invited person has no uid yet.

---

## 2 · What Phase 1 actually is

A React application that behaves exactly like the finished product, backed by a **deterministic
simulation of the database rather than a database**. No backend, no login.

This was deliberate. The expensive mistake in this project is a wrong *flow*, not a wrong query.
Rewriting a Firestore query is an afternoon; rewriting a reservation wizard after the sales team
has been trained on it is a quarter. Phase 1 put the reversible work first.

**The risk of that order** — a UI that assumes data the backend cannot cheaply provide — was
managed by writing the repository layer to Firestore's capabilities from the first line. There
are no joins anywhere, because Firestore has none.

### What exists

| | |
|---|---|
| Routes | 38, all built, no stubs |
| Screens | 34 feature screens + design system + Forbidden/NotFound |
| UI primitives | 28, on Radix, hand-styled to the brand |
| Collections | 18, Firestore-shaped |
| Roles | 8 defined; 6 active in Phase 2, 2 dormant |
| Business rules | 8, encoded once in `src/lib/rules.ts` |
| Seed | 1,100 reservations, 32 **real** properties, 180 customers, 40 companies |

### Data is simulated, and resets on refresh

By design. Every review starts from identical data, so a bug reported on "the Peerless Inn
booking" is reproducible by anyone. Fixed PRNG seed `20260728`, fixed "today" of 28 July 2026.

**The 32 properties are real** — names, cities, room counts, room mixes, amenities and landmark
distances extracted from the fact sheets in `D:\Fidato Assets\Hotel Fact Sheets`. Commercial
figures (commission, tariffs) are simulated and the seed file says so.

---

## 3 · The ten defects, and what they teach

Full write-ups: [`manual/12-defect-log.md`](manual/12-defect-log.md). This is the most
instructive document in the project.

**Zero were caught by TypeScript or the build.** Both ran clean throughout.

| Found by | Count | Defects |
|---|---:|---|
| Looking at real data and finding it implausible | 4 | D-03 (+757% growth), D-04 (1% occupancy), D-05 (dead "today"), D-06 (future creation dates) |
| Rendering the page in a browser | 2 | D-01 (Slot crash), D-02 (scroll-lock leak) |
| A full-resolution screenshot | 1 | D-10 (two primary buttons) |
| Console error | 1 | D-08 (`undefined` from repos) |
| Accessibility tree | 1 | D-07 (unnamed icon buttons) |
| Reading the screen | 1 | D-09 (unsubstituted token) |

**Four were silent** — the software rendered, did not throw, typechecked, built, and reported
wrong answers confidently. None would have been found by tests written against the same wrong
assumptions. All four were found by generating realistic data and looking at it critically:

- +757% is not a growth rate.
- 1% is not an occupancy.
- 0 arrivals is not a 32-property portfolio.
- "in about 1 month" is not a creation date.

This is the strongest argument for the realistic-seed decision, and the reason the Phase 2 plan
insists on hand-verification at the end of every sprint.

---

## 4 · What was never verified

Stated plainly because the manual does too — [`manual/13-verification-record.md` §13.4](manual/13-verification-record.md).

**Twelve interactive flows are built and typechecked but never click-tested**: the reservation
wizard end-to-end, approve/decline dialogs, cancel, check-in/out, customer create/edit, merge
execution, CSV import commit, record payment, rate edit, command-palette navigation, and role
switching via the dropdown.

**Why:** the automated browser used for verification does not deliver trusted input events to
the React root. Proven, not assumed — invoking the same handlers directly worked; real clicks
did not; Escape did not close an open dialog.

**What to do:** walk those twelve flows by hand in a real browser before Phase 2 sign-off.

Also missing: a screen-reader pass, full keyboard traversal, and a skip-to-content link.

---

## 5 · The decisions that shape everything

Full log with rejected alternatives: [`manual/03-decision-log.md`](manual/03-decision-log.md) —
24 records.

The five that matter most day to day:

| # | Decision | Why it matters now |
|---|---|---|
| ADR-06 | Repository interface shaped to Firestore from line one | The whole Phase 2 estimate depends on this holding. If a repo method acquires a capability Firestore lacks, the estimate is fiction |
| ADR-12 | Show blocked actions, never hide them | Makes permission bugs self-reporting. A hidden restriction is never reported when wrong |
| ADR-19 | Occupancy from the inventory model, not reservations | The most misunderstood number in the product |
| ADR-08 | Deterministic seed, resets on refresh | Reproducibility beats persistence in a review build |
| ADR-24 | No test framework in Phase 1 | **The weakest decision in the log**, and flagged as such. Phase 2 sprint S0 fixes it |

### Two documented brand-guide departures

Both flagged for brand review in [`design-system.md`](design-system.md):

1. **Inter replaces Georgia + Arial** in the interface. Georgia is kept for printed invoices and
   report covers. The guide's pairing reads as an Office document in a dense UI.
2. **A success green `#1F6F5C` was added.** The five-colour warm palette has no colour for
   "this went well", and an ERP cannot render *confirmed* and *pending* in the same orange.

**Unresolved:** the supplied logo SVG draws the wordmark `#142B3A`; the guide specifies
`#031728`. The logo is used untouched; `#031728` is used for UI ink. Someone needs to say which
is authoritative.

---

## 6 · Phase 2 — the three findings that changed the approach

These contradict the Phase 1 handover (manual Volume XIV), which assumed Cloud Functions.
Details in [`phase-2/02-architecture-and-spark.md`](phase-2/02-architecture-and-spark.md).

**1 — Custom claims are impossible on Spark.** `setCustomUserClaims()` needs the Admin SDK.
Roles live in a Firestore document read by rules via `get()`. This makes one rule the most
safety-critical code in the project:

> Without an `affectedKeys().hasOnly(...)` clause on `users/{uid}`, **any signed-in user can
> promote themselves to Owner from the browser console.**

Rule tests 7, 8 and 9 are mandatory before sprint S5.

**2 — Firestore has no field-level read security.** Hiding commission in the UI does nothing;
anyone who can read the hotel document can read the commission via the SDK or REST. It must move
to `hotels/{hotelId}/private/commercial`.

**3 — Four handover recommendations need Spark replacements:** roll-up counters (client
transactions + a manual recompute tool), merge (a resumable job document), invoice numbering (a
counter document + transaction), audit immutability (rules make it tamper-*evident*, not
tamper-proof).

That last one deserves stating to anyone who relies on the audit log: on Spark, a client can
simply not write the entry. Guaranteeing it needs a trusted server, which is a Blaze decision.

---

## 7 · Phase 2 scope — the seven requested changes

Full detail: [`phase-2/01-scope-and-changes.md`](phase-2/01-scope-and-changes.md).

| # | Change | Size |
|---|---|---|
| C-1 | GST becomes 5% below ₹7,500, 18% at or above | S |
| C-2 | **Pricing moves from the hotel to the reservation** | **L** |
| C-3 | Meal plans → EP / AP / MAP / All Inclusive (`CP` retired) | S |
| C-4 | Seasons carry the meal-plan combinations | M |
| C-5 | Hotel confirmation number, rep name, confirmation time, payment term | S |
| C-6 | Create hotel / user / company | **L** |
| C-7 | CSV import for customers, companies, hotels | M |
| C-8 | Commission visible only to Owner and Admin | M |
| C-9 | Invoices visible only to Owner, Admin, Manager, Finance | S |
| C-10 | 8 roles → 6 active, 2 dormant | M |
| C-11 | Inventory hidden, code preserved | S |

**C-2 is the one to understand.** It removes `RoomType.baseRate`, `RatePlan.rate` and the whole
rate-plan pricing model. Salespeople enter selling rate, extra-bed rate and child rate per
reservation.

⚠️ **Consequence:** nothing then constrains what a salesperson charges. The ₹50,000 approval
threshold becomes the only commercial control. Two soft guards are specified — show the last
three rates charged for that room type at that property, and flag anything 40% below the
trailing median. Neither blocks.

⚠️ **GST must be computed per room line, not on the reservation total.** A booking can
legitimately contain both bands. Getting this wrong is a tax error.

### Settled

- Historical reservations are **grandfathered** at 12%; `gstVersion` records the era.
- `hotel_manager` and `support` stay **dormant** — defined, no grants, scoping retained.
- The repository is **public**.

### Still open

Seasons overlapping · Excel vs CSV · low-rate guard · who assigns roles · whether Finance
genuinely has no commission access.

---

## 8 · Infrastructure

| | |
|---|---|
| Firebase project | `crstest-9a0c5` — **Spark plan** |
| Hosting | https://crstest-9a0c5.web.app — Phase 1 is live |
| Firestore | **Locked: deny-all.** Phase 1 uses none |
| Realtime Database | Exists, denied. **Not used** — the project uses Firestore |
| Storage | Not provisioned yet. Needed in Phase 2 |
| Auth | Not configured yet |
| n8n | Self-hosted on a VPS via Hostinger. Owner is building workflows |

⚠️ **The deployed app has no login.** Anyone with the URL sees the whole system, including the
32 real property records. Phase 2 adds authentication. Until then, treat the URL as
semi-public — it carries `X-Robots-Tag: noindex` but that only stops search engines, not people.

⚠️ **Do not relax `firestore.rules` until Phase 2 sprint S4.** The project id and web API key
are public. The deny-all rules are the only thing standing between the database and the
internet.

---

## 9 · Machine-specific gotchas

| Gotcha | Fix |
|---|---|
| `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | TLS-inspecting proxy. Copy `win-ca-bundle.pem`, add `.npmrc` with `cafile=`. See `.npmrc.example` |
| `ENOENT spawn cmd.exe` | Run npm from **PowerShell**, not Git Bash |
| `'C:\Program' is not recognized` | A launcher not quoting the Node path. Run `npm run dev` directly |
| Browser-pane screenshots render tiny | Use `tools/pdf/shots.mjs` for real screenshots |
| Automated clicks do nothing | Known — §4 above. Verify by hand |

---

## 10 · Where to find things

| Need | Go to |
|---|---|
| Quick orientation | [`../CLAUDE.md`](../CLAUDE.md) |
| Everything about Phase 1 | [`manual/README.md`](manual/README.md) — 15 volumes, 148-page PDF |
| Why a decision was made | [`manual/03-decision-log.md`](manual/03-decision-log.md) |
| What a screen does | [`manual/10-screen-teardown.md`](manual/10-screen-teardown.md) |
| Something is broken | [`manual/11-diagnostics.md`](manual/11-diagnostics.md) — symptom-first |
| Field reference | [`manual/A1-data-dictionary.md`](manual/A1-data-dictionary.md) |
| Component props | [`manual/A2-component-props.md`](manual/A2-component-props.md) |
| Phase 2 plan | [`phase-2/README.md`](phase-2/README.md) |
| n8n design | [`phase-2/07-phase-2.5-n8n.md`](phase-2/07-phase-2.5-n8n.md) |

---

## 11 · If you are starting Phase 2

Start at **sprint S0** — Vitest over `src/lib/permissions.ts` and `src/lib/rules.ts`. Roughly
160 assertions over code that is now stable, and the safety net for everything after it.

Then S1 through S14 in the order given in
[`phase-2/06-sprint-and-commits.md`](phase-2/06-sprint-and-commits.md). The order is not
arbitrary:

- **Rules (S4) before repositories (S5)** — otherwise you develop against open rules and
  discover at lockdown that half the queries violate them.
- **S5 is reads only, and is a checkpoint.** If all 38 screens render against Firestore before
  any mutation exists, the repository seam held. If screens need changing for reasons not in
  `01-scope-and-changes.md`, stop and fix the interface rather than patching screens.

Estimate: 26 days, one engineer.
