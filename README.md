# Fidato Hospitality Platform

Internal CRS/ERP for Fidato Hotels — CRM, reservations across 32 partner properties,
inventory, rates, finance, reporting, automation and administration.

**This is Phase 1: the complete frontend, with no backend.** Every screen is built, every
interaction works, and the whole flow runs on simulated data. The purpose is to lock the
UI/UX and the flow so that Phases 2–4 are plumbing rather than redesign.

**Live:** <https://crstest-9a0c5.web.app> — Phase 1, no authentication.

```bash
npm install     # from PowerShell — see docs/RUNBOOK.md
npm run dev
```

Then open <http://localhost:5173>. There is **no login** — use the "Viewing as…" switcher in
the top bar to move between the eight roles.

---

## Where to start

| If you are… | Read |
|---|---|
| An **agent** or AI assistant | [`CLAUDE.md`](CLAUDE.md) — loaded automatically |
| **Picking the project up** | [`docs/CONTEXT.md`](docs/CONTEXT.md) |
| Working **without repo access** | [`docs/KNOWLEDGE.md`](docs/KNOWLEDGE.md) — paste it anywhere |
| A **new engineer or trainee** | [`docs/Fidato-Platform-Phase-1-Manual.pdf`](docs/Fidato-Platform-Phase-1-Manual.pdf) — 148 pp |
| **Deploying or recovering** | [`docs/RUNBOOK.md`](docs/RUNBOOK.md) |
| **Building Phase 2** | [`docs/phase-2/README.md`](docs/phase-2/README.md) |

---

## Phases

| Phase | Scope | State |
|---|---|---|
| **1** | Full frontend, no backend, no login, simulated data | **This build** |
| 2 | Firebase — Firestore, Auth, Functions, Storage. Real login | Next |
| 3 | n8n automation wiring | |
| 4 | Final testing | |

---

## Stack

Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · React Router v7 ·
TanStack Query v5 · Zustand · Radix UI · react-hook-form + Zod · Recharts · Inter Variable

---

## Documentation

### The service manual

**[`docs/manual/`](docs/manual/README.md)** — the full Phase 1 manual, written the way a
service manual for an engine is written. 15 volumes plus 2 reference appendices, ~146 pages:
what every part is, how it works, why it was built this way rather than another way, and how
to diagnose it when it misbehaves.

Start at [`docs/manual/README.md`](docs/manual/README.md), which has reading paths for
different purposes.

**As a single PDF for handing to someone:**
[`docs/Fidato-Platform-Phase-1-Manual.pdf`](docs/Fidato-Platform-Phase-1-Manual.pdf) — 148
pages, all diagrams rendered, with a cover, a "Before you start" section written for new joiners
and a six-day reading plan. Rebuild it after editing the manual with:

```bash
cd tools/pdf && npm run build
```

### Quick reference

| Document | Contents |
|---|---|
| [`docs/design-system.md`](docs/design-system.md) | Tokens, type scale, the two documented departures from the brand guide |
| [`docs/data-model.md`](docs/data-model.md) | The Firestore-shaped collections and the Phase 2 swap point |
| [`docs/screen-inventory.md`](docs/screen-inventory.md) | All 38 routes and what each is for |
| [`docs/role-matrix.md`](docs/role-matrix.md) | 8 roles, the permission matrix, and the 8 business rules |

Two screens document themselves at runtime: **`/design-system`** renders every token and
component from the real modules, and **`/admin/roles`** renders the live permission matrix.

---

## Worth knowing before you review

**The 32 properties are real.** Names, cities, room counts, room-mix breakdowns, amenities and
road distances were extracted from the fact sheets in `D:\Fidato Assets\Hotel Fact Sheets`.
Everything else — people, companies, bookings, money — is generated from a fixed seed, so it is
identical on every reload.

**Occupancy is not derived from reservations.** Fidato books a slice of each partner hotel, so
reservations ÷ total rooms would report a fraction of a percent. Occupancy comes from the
inventory model and reflects all channels; the Fidato-booked share is labelled separately as
"Fidato room nights".

**Data resets on refresh.** By design — every review starts from the same state.

**Two brand-guide departures are deliberate and documented**: Inter replaces Georgia + Arial in
the interface (Georgia is kept for printed documents), and a success green was added because the
palette has no colour for "this went well". Both are flagged for brand review in
`docs/design-system.md`.

---

## Notes for this machine

`npm install` needs the local CA bundle — `win-ca-bundle.pem` and `.npmrc` are present for that
reason, and installs should be run from **PowerShell**, not Git Bash.
