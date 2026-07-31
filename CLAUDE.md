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
| Firebase | `crstest-9a0c5` · Spark plan · https://crstest-9a0c5.web.app still serves the Phase 1 build |
| Current state | **Phase 2 built and green. Not yet deployed, and the database is still empty.** |

---

## Phases

| Phase | Scope | State |
|---|---|---|
| **1** | Full frontend, no backend, no login, simulated data | ✅ Done, deployed |
| **2** | Firebase — Auth, Firestore, rules. Spark only | ✅ **Built. Typecheck, build, 31 unit + 59 rules tests green. Awaiting deploy** |
| 2.5 | n8n consumes `automationQueue` — vouchers, Drive, email | Designed, not started |
| 3 | Further automation | — |
| 4 | Final testing | — |

### ⚠️ What "built but not deployed" means

Three things are true at once, and confusing them wastes a session:

1. **The code is done.** Auth, rules, the schema change, the import path.
2. **Nothing is live.** Hosting still serves Phase 1. The Firestore rules
   in this repo have not been pushed, and Email/Password sign-in has not
   been enabled in the console.
3. **There is no data and no first user.** The seed layer is deleted;
   every screen shows an empty state until the user imports their own
   records. The first Owner cannot be created from inside the app —
   see the bootstrap section of [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

**Do not "fix" empty screens.** Empty is correct.

**Phase 2 design docs are in [`docs/phase-2/`](docs/phase-2/README.md)**; read
[`02-architecture-and-spark.md`](docs/phase-2/02-architecture-and-spark.md) before
changing the data layer. Note that the docs describe the *plan* — where
they and the code disagree, the code is what shipped.

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

**Screens import only from `@/data/repositories`.** Never from `repositories/firestore/`
directly. That seam is why Phase 2 swapped one folder instead of rewriting 34 screens —
`repositories/mock/` is gone, and the barrel now re-exports `./firestore`.

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
| **Occupancy is not reservations ÷ rooms** | Fidato books a *slice* of each partner hotel. That ratio reports <1% and means nothing. What the reports show is Fidato's share of sellable room nights, and it is labelled as such |
| **Date filters need BOTH bounds** | Reservations run months into the future. `checkIn >= monthStart` with no upper bound silently includes the whole forward book — it once reported +757% growth |
| **Every Firestore read must be bounded** | Spark allows 50k reads a day. A report that reads all reservations to aggregate costs one read per row *per view*. Use `getCountFromServer` for counts and `limit()` everywhere else |
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
npm run typecheck    # tsc -b — plain `tsc --noEmit` does nothing here
npm test             # 31 unit tests: GST bands, import mapping, permissions
npm run test:rules   # 59 rules tests in the real engine (starts the emulator)
```

⚠️ `tsconfig.json` is a solution file with `"files": []` and project
references. `npx tsc --noEmit` therefore reports **zero errors on a
broken build** — it compiles nothing. Always use `tsc -b`.

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

## Decisions taken during the Phase 2 build

Previously open, now settled in code:

| Question | Answer | Where |
|---|---|---|
| May seasons overlap? | Yes. The later `validFrom` wins, so a short specific season overrides a broad one | `roomConfigRepo.seasonFor` |
| Excel import, or CSV only? | **Both.** The user asked for Excel; `xlsx` is lazily imported so it stays out of every other route | `features/import/engine.ts` |
| Unusually low rate — warn, block, neither? | **Neither, for now.** Fidato negotiates every booking, so there is no baseline to compare against. Revisit once real rates exist | — |
| Who assigns roles? | Owner and Admin, but **only an Owner may create or promote an Owner** — otherwise an Admin escalates in two moves | `firestore.rules` |
| Does Finance have commission access? | **No.** They handle the money, not the terms Fidato negotiated to earn it | `lib/permissions.ts` + test |

Also settled: GST grandfathered via `gstVersion` · `hotel_manager` and
`support` dormant with empty grants · repo is public · the `automation`
role can never be assigned to a person.

## Still open

- **Nothing deploys these rules automatically.** `firebase deploy --only
  firestore:rules` is a manual step and must happen *before* the first
  sign-up, or there is a window where the database is open. Run
  `npm run test:rules` before every rules deploy.
- Storage is still unprovisioned. Only matters once vouchers or PDFs land.
- **Nothing has run against the live project.** Every repository method
  compiles and is covered by rules tests on the emulator; none has
  executed against real Firestore. No sign-in has ever succeeded, because
  Email/Password is not enabled in the console yet.
- The interactive flows — wizard, approve/cancel, merge, import commit —
  are unit-tested at the logic layer, never click-tested end to end.

## ⚠️ Two traps that cost time this session

- **A UTF-8 BOM breaks `firestore.rules`.** PowerShell's `Set-Content
  -Encoding utf8` writes one; the emulator then reports `token
  recognition error at: ''` on line 1, and a real deploy fails the same
  way. Edit that file with something that writes plain UTF-8.
- **A failed rules run orphans the emulator**, and the next run reports
  "port taken" instead of anything useful. Stop the `java.exe` holding
  port 8080.
