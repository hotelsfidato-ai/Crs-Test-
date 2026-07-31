# Fidato Hospitality Platform — agent context

**Read this first. It is loaded automatically at the start of every session.**

If you need more than this file gives you, the next two are
[`docs/CONTEXT.md`](docs/CONTEXT.md) (project state and history) and
[`docs/manual/README.md`](docs/manual/README.md) (the 148-page service manual).

---

## What this is

An internal CRS/ERP for **Fidato Hotels**, a company that sells room nights into **32 partner
properties it does not own**. Not a property management system — each partner already has one.

That single fact explains most of the design decisions. In particular it is why **occupancy is
not computed from reservations** (see the trap list below).

| | |
|---|---|
| Location | `D:\fidato crs` |
| Repo | `https://github.com/hotelsfidato-ai/Crs-Test-` — **public** |
| Firebase | `crstest-9a0c5` · Spark plan · live at https://crstest-9a0c5.web.app |
| Current state | **Phase 1 complete and deployed. Phase 2 planned, not started.** |

---

## Phases

| Phase | Scope | State |
|---|---|---|
| **1** | Full frontend, no backend, no login, simulated data | ✅ **Done, deployed** |
| **2** | Firebase — Auth, Firestore, Storage, rules. Spark only | 📋 **Planned, not started** |
| 2.5 | n8n consumes `automationQueue` — vouchers, Drive, email | Designed |
| 3 | Further automation | — |
| 4 | Final testing | — |

**Phase 2 is fully specified in [`docs/phase-2/`](docs/phase-2/README.md).** Read
[`docs/phase-2/README.md`](docs/phase-2/README.md) and
[`02-architecture-and-spark.md`](docs/phase-2/02-architecture-and-spark.md) before writing any
Phase 2 code.

---

## Stack

React 19 · Vite · TypeScript strict · Tailwind v4 · React Router v7 · TanStack Query v5 ·
Zustand · Radix UI · react-hook-form + Zod · Recharts · Inter Variable

38 routes · 8 roles (6 active, 2 dormant) · 28 UI primitives · 18 Firestore-shaped collections

---

## Architecture — the rule that must not break

```
React UI → Repository layer → Firebase → automationQueue → n8n
```

**Screens import only from `@/data/repositories`.** Never from `repositories/mock/` or
`repositories/firestore/` directly. That seam is why Phase 2 replaces one folder instead of
rewriting 34 screens.

**The React app never talks to Drive, WhatsApp, email, AI, accounting or marketing.** It writes
an event to `automationQueue`; n8n does the rest.

| Layer | Path |
|---|---|
| Screens | `src/features/**` |
| Shell | `src/components/app/**` |
| Primitives | `src/components/ui/**` |
| Rules and helpers | `src/lib/**` |
| Data | `src/data/**` |

---

## ⚠️ Traps — things that look correct and are not

Each of these was a real defect. Full write-ups in
[`docs/manual/12-defect-log.md`](docs/manual/12-defect-log.md).

| Trap | Why |
|---|---|
| **Occupancy is not reservations ÷ rooms** | Fidato books a *slice* of each partner hotel. That ratio reports <1% and means nothing. Occupancy comes from `buildInventory()`; the Fidato share is labelled "Fidato room nights" |
| **Date filters need BOTH bounds** | Seed data runs 150 days into the future. `checkIn >= monthStart` with no upper bound silently included the whole forward book and reported +757% growth |
| **`Button asChild` takes exactly one child** | Radix `Slot` crashes on more. Icons must be folded *inside* the child element |
| **Radix scroll lock leaks** | A modal that unmounts while open strands `pointer-events: none` on `<body>` and the whole app goes dead with no error. Close before navigating |
| **Repos return `null`, never `undefined`** | TanStack Query throws on `undefined` |
| **GST is per room line, not per reservation** | A booking can legitimately contain both bands. Computing on the total is a tax error |
| **Hiding a field in the UI is not security** | Firestore rules are document-level. Commission must live in `hotels/{id}/private/commercial` |
| **Structural checks miss visual bugs** | Two identical primary buttons read as two normal entries in the accessibility tree. Look at a rendered screenshot |

---

## Conventions

- **Show blocked actions, never hide them.** A disabled control with a tooltip explaining why,
  not an absent one. The `{ allowed, reason }` shape in `src/lib/rules.ts` exists for this.
- **Forbidden, not 404**, for a route a role cannot reach.
- **Empty ≠ no-results.** Different words, different exits. `DataTable` handles both.
- **One primary button per view.**
- **Tabular figures on every number** a user might compare.
- **Hairline borders, not shadows.** Shadows only on things that float.
- **150–200 ms ease-out.** Nothing bounces.
- Business rules live only in `src/lib/rules.ts`. A rule duplicated in a component will drift.

---

## Commands

```bash
npm run dev          # http://localhost:5173
npm run build
npx tsc --noEmit -p tsconfig.app.json
```

```bash
cd tools/pdf && npm run build      # rebuild the manual PDF
cd tools/pdf && node shots.mjs     # screenshot the running app
```

```bash
firebase deploy --only hosting --project crstest-9a0c5
```

⚠️ **Run `npm install` from PowerShell, not Git Bash** — this machine sits behind a
TLS-inspecting proxy. See `.npmrc.example`.

---

## Git

Commit per module, conventional format:

```
feat(auth): Firebase Authentication
fix(reservations): GST computed per line
docs(phase2): update the sprint plan
```

Branch per sprint: `phase-2/s03-auth`. `main` stays deployable.

---

## Current open questions

Answer before building the affected module — [`docs/phase-2/01-scope-and-changes.md`](docs/phase-2/01-scope-and-changes.md):

1. May seasons overlap?
2. Excel import, or CSV only?
3. Should an unusually low rate warn, block, or neither?
4. Who assigns roles — Owner only, or Owner + Admin?
5. Does Finance genuinely have no commission access?

Settled: GST grandfathered · `hotel_manager` and `support` dormant · repo is public.
