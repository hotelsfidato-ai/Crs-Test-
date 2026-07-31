← [XIV — Phase 2 handover](14-phase-2-handover.md) · [Index](README.md)

---

# Volume XV — Glossary and index

---

## 15.1 Domain terms

| Term | Meaning in this system |
|---|---|
| **ADR** | Enterprise: Average Daily Rate. In this manual: Architectural Decision Record (Volume III). Where the hotel metric is meant, it is written *average rate* |
| **AP** | American Plan — room plus all meals |
| **Blocked room** | Held out of sale — maintenance, an event hold, an owner's use. Deducted from availability but not counted as booked |
| **Channel** | How a booking arrived: direct sales, corporate, travel agent, website, phone, walk-in |
| **Commission** | What Fidato earns on a booking. 8–18% by property, on gross booking value including tax |
| **CP** | Continental Plan — room plus breakfast |
| **CRS** | Central Reservation System — books across many properties. What this system is |
| **EP** | European Plan — room only |
| **Folio** | The itemised charge sheet for a stay. Frozen once the stay completes |
| **GSTIN** | Indian tax registration number. Appears on invoices |
| **In house** | A guest currently staying: check-in ≤ today < check-out |
| **Key account** | The highest company tier — largest volume, best negotiated terms |
| **MAP** | Modified American Plan — room, breakfast and one other meal |
| **No show** | Confirmed booking, guest never arrived. Terminal status |
| **Occupancy** | ⚠️ Here: the **property's** occupancy across all channels, from the inventory model. **Not** Fidato's bookings ÷ total rooms ([ADR-19](03-decision-log.md#adr-19)) |
| **PMS** | Property Management System — runs one hotel. Each partner has their own; this is not one |
| **Rate plan** | A price for one room type, one meal plan, one season |
| **Room mix** | A property's breakdown by room type, e.g. *5 Suite / 115 Deluxe / 30 Business Class* |
| **Room night** | One room for one night. The unit of hotel inventory |
| **Fidato room nights** | The subset of room nights **this platform** booked, as opposed to all channels |
| **Season** | A date window a rate plan applies to |
| **Shoulder season** | Between peak and off-peak |
| **Terminal status** | Completed, cancelled or no-show. Locked against edits (BR-03) |
| **Voucher** | The document sent to the guest on confirmation |

---

## 15.2 Technical terms

| Term | Meaning here |
|---|---|
| **Barrel** | An index file re-exporting a folder — `src/components/ui/index.ts` |
| **Denormalisation** | Copying a field onto a related document to avoid a join. Firestore has no joins |
| **Deterministic seed** | Data generated from a fixed PRNG seed, identical on every run |
| **Guard** | The route-level permission check in `routes.tsx` |
| **Hairline** | A 1 px border used instead of a shadow ([ADR-16](03-decision-log.md#adr-16)) |
| **Invalidation** | Marking a TanStack Query cache entry stale so it refetches |
| **Query key** | The array identifying a cached query. Includes the scope, so role changes invalidate automatically |
| **Roll-up** | A counter stored on a parent document (`totalRevenue`) rather than computed |
| **Row-level scoping** | Filtering *which records* an actor sees, distinct from *what actions* they may take |
| **Scroll lock** | Radix's `pointer-events: none` on `<body>` while a modal is open. Source of [D-02](12-defect-log.md) |
| **Seam** | `repositories/index.ts` — the one file Phase 2 changes |
| **Slot** | Radix's `asChild` mechanism. Accepts exactly one child ([D-01](12-defect-log.md)) |
| **Tabular figures** | Fixed-width digits so numbers align in columns |
| **Tone** | A semantic colour role — success, warning, danger, info, accent, neutral |

---

## 15.3 The eight business rules

| # | Rule | Enforced in |
|---|---|---|
| BR-01 | A reservation is never deleted, only cancelled | `canCancelReservation()` + no delete path |
| BR-02 | Bookings ≥ ₹50,000 require approval | `requiresApproval()` |
| BR-03 | Completed / cancelled / no-show are locked | `canEditReservation()` |
| BR-04 | Hotel managers cannot edit rate plans | `canEditRates()` |
| BR-05 | A salesperson sees only their assigned accounts | `scopeRecords()` |
| BR-06 | Customer email and phone must be unique | `isDuplicateEmail()` / `isDuplicatePhone()` |
| BR-07 | Merging moves all children to the survivor | `customersRepo.merge()` |
| BR-08 | Every change is written to the audit log | `recordAudit()` |

---

## 15.4 The twenty-four decisions

| # | Decision | Cost accepted |
|---|---|---|
| 01 | Frontend before backend | Seed engine is throwaway |
| 02 | React + Vite over Next.js | No SSR |
| 03 | Tailwind v4 | Long class strings |
| 04 | Radix, not shadcn/ui | 28 components to write |
| 05 | TanStack Query with no server | A dependency doing "nothing" in Phase 1 |
| 06 | Firestore-shaped repositories | Some screens less efficient than SQL would allow |
| 07 | 120–400 ms simulated latency | The app feels slower than it is |
| 08 | Deterministic seed, resets on refresh | Work lost on reload |
| 09 | Real property data | An extraction pass over 32 PDFs |
| 10 | Role switcher, no login | Not how the real product behaves |
| 11 | Forbidden, not 404 | Reveals that a resource exists |
| 12 | Show blocked actions | More markup and copy |
| 13 | Permissions ≠ scoping | Two concepts to understand |
| 14 | Inter, not Georgia + Arial | Documented brand deviation |
| 15 | Added a success colour | Documented brand deviation |
| 16 | Hairlines, not shadows | Flatter than fashion |
| 17 | URL owns list state | Verbose query strings |
| 18 | Zustand, not Context | One more dependency |
| 19 | Occupancy from inventory | Two metrics to explain |
| 20 | Cancel, never delete | No delete anywhere |
| 21 | Duplicates warn, never block | Duplicates can exist temporarily |
| 22 | Assistant computes, not generates | Not a real model |
| 23 | Recharts | 104 kB gzipped |
| 24 | No test framework | **No regression safety net** |

---

## 15.5 The ten defects

| # | Defect | Class |
|---|---|---|
| D-01 | Radix `Slot` crash blanked the app | Integration |
| D-02 | Stranded scroll lock made the app unclickable | Integration |
| D-03 | Unbounded date range reported +757% growth | **Silent** |
| D-04 | Occupancy from the wrong denominator | **Silent** |
| D-05 | Seed too small — "today" looked dead | **Silent** |
| D-06 | Reservations created in the future | **Silent** |
| D-07 | Icon-only buttons had no accessible name | Accessibility |
| D-08 | `undefined` from missing documents | Contract |
| D-09 | Unsubstituted merge token | Data |
| D-10 | Two primary buttons on the same view | Design system |

Zero were caught by TypeScript or the build. Four produced confidently wrong answers, and one
was invisible to every structural check — it needed a rendered screenshot.

---

## 15.6 File index

### Configuration

| File | Purpose |
|---|---|
| `vite.config.ts` | Aliases, manual chunks |
| `tsconfig.app.json` | `strict`, `noUnusedLocals`, `noUncheckedIndexedAccess` |
| `.npmrc` + `win-ca-bundle.pem` | Local CA trust for this machine's TLS proxy |
| `.claude/launch.json` | Dev server definition |

### Core

| File | Lines | Purpose |
|---|---:|---|
| `src/main.tsx` | ~40 | Providers, router, query client |
| `src/routes.tsx` | ~280 | 38 routes + the permission guard |
| `src/styles/theme.css` | 359 | **Every design token** |

### Library

| File | Purpose |
|---|---|
| `src/lib/cn.ts` | clsx + tailwind-merge |
| `src/lib/format.ts` | 20 formatting functions — money, dates, text |
| `src/lib/permissions.ts` | Roles, resources, actions, matrix, scoping |
| `src/lib/rules.ts` | The 8 business rules |
| `src/lib/session.ts` | Zustand: role + UI state |

### Data

| File | Purpose |
|---|---|
| `src/data/types.ts` | 46 domain types |
| `src/data/seed/random.ts` | Deterministic PRNG |
| `src/data/seed/names.ts` | Name and copy pools |
| `src/data/seed/hotels.data.ts` | **32 real properties** — survives into Phase 2 |
| `src/data/seed/index.ts` | The generator |
| `src/data/repositories/index.ts` | **The seam** |
| `src/data/repositories/mock/store.ts` | db, latency, query pipeline |
| `src/data/repositories/mock/index.ts` | 11 repositories |

### Components

| Folder | Contents |
|---|---|
| `src/components/ui/` | 28 primitives across 13 files + barrel |
| `src/components/app/` | AppShell, Sidebar, TopBar, RoleSwitcher, CommandPalette, AiPanel, navigation |

### Features

| Folder | Screens |
|---|---:|
| `src/features/dashboard/` | 1 |
| `src/features/reservations/` | 5 |
| `src/features/crm/` | 8 |
| `src/features/hotels/` | 4 |
| `src/features/finance/` | 4 |
| `src/features/reports/` | 6 + shell |
| `src/features/automation/` | 3 |
| `src/features/notifications/` | 2 |
| `src/features/ai/` | 1 + responses |
| `src/features/admin/` | 5 |
| `src/features/design-system/` | 1 |
| `src/features/shared/` | Forbidden, NotFound, RouteFallback, useListState |

---

## 15.7 Command reference

```bash
npm install                                  # from PowerShell on this machine
npm run dev                                  # http://localhost:5173
npm run build
npx tsc --noEmit -p tsconfig.app.json
npm run dev -- --port 5174                   # if 5173 is taken
```

---

## 15.8 Constants worth knowing

| Constant | Value | Where |
|---|---|---|
| `APPROVAL_THRESHOLD` | `50_000` | `lib/rules.ts` |
| `SEED` | `20260728` | `seed/index.ts` |
| `TODAY` | `2026-07-28` | `seed/index.ts` |
| `MIN_LATENCY` / `MAX_LATENCY` | `120` / `400` ms | `mock/store.ts` |
| Default page size | `25` | `mock/store.ts` |
| GST bands | 12% below ₹7,500, 18% at or above | `reservationsRepo.quote()` |
| House radius | `10px` | `theme.css` |
| Body text | `14px` / `22px` | `theme.css` |
| Transition | `150–200 ms ease-out` | `theme.css` |
| Page max width | `1600px` | `Page` |

---

## 15.9 Where to find things

| Question | Volume |
|---|---|
| What is this system for? | [I](01-system-overview.md) |
| How is it structured? | [II](02-architecture.md) |
| Why was X chosen over Y? | [III](03-decision-log.md) |
| What colour / size / spacing should I use? | [IV](04-design-system.md) |
| How does component X work? | [V](05-component-reference.md) |
| What fields does entity X have? | [VI](06-data-model.md) |
| Where does the data come from? | [VII](07-seed-engine.md) |
| How do queries work? | [VIII](08-repository-layer.md) |
| Who can do what? | [IX](09-permissions-and-rules.md) |
| What does screen X do? | [X](10-screen-teardown.md) |
| Something is broken | [XI](11-diagnostics.md) |
| What went wrong during the build? | [XII](12-defect-log.md) |
| What was actually tested? | [XIII](13-verification-record.md) |
| How do I take this to Firebase? | [XIV](14-phase-2-handover.md) |

---

## 15.10 Open questions

Carried forward, not resolved.

| # | Question | Owner |
|---|---|---|
| 1 | Logo wordmark is `#142B3A`; the guide says `#031728`. Which is authoritative? | Brand team |
| 2 | Is the Inter substitution for Georgia + Arial approved? | Brand team |
| 3 | Is the added success green `#1F6F5C` approved? | Brand team |
| 4 | Should `/reservations` gain bulk actions, or should the copy be amended? | Product |
| 5 | Is offset pagination worth preserving via distributed counters, or is Prev/Next acceptable? | Product + engineering |
| 6 | Will the platform ever serve more than one timezone? | Product |
| 7 | Should commission be calculated on gross (current) or net of tax? | Finance |

---

*End of manual. Return to the [index](README.md).*
