# Data model

Types: **`src/data/types.ts`** · Seed: **`src/data/seed/`** · Access: **`src/data/repositories/`**

Every collection name, document id and field below is shaped the way it will exist in
Firestore, so Phase 2 is a swap of the repository implementation rather than a reshaping of
the app.

---

## The Phase 2 swap point

```
src/data/repositories/
├─ index.ts          ← re-exports; the only thing components import
└─ mock/
    ├─ store.ts      ← in-memory db, query runner, simulated latency
    └─ index.ts      ← the repositories themselves
```

Components never import from `mock/`. They import `@/data/repositories`. Phase 2 adds
`firestore/` beside `mock/` and changes one line in `index.ts`.

Reads are `async` with **120–400 ms simulated latency**, so loading skeletons, optimistic
updates and error states are exercised rather than decorative. Writes mutate the in-memory
store and the calling screen invalidates the matching React Query keys.

Data resets on refresh, by design — every review starts from the same state.

---

## Collections

| Collection | Count | Notes |
|---|---:|---|
| `hotels` | 32 | Real Fidato properties, mined from the fact-sheet PDFs |
| `roomTypes` | ~120 | Per property, with real room-mix breakdowns |
| `ratePlans` | ~370 | Room type × meal plan × season |
| `inventory` | derived | Generated per property on demand, 30–60 days forward |
| `companies` | 40 | Corporate accounts, travel agents |
| `customers` | 180 | Guests and booking contacts |
| `reservations` | 1,100 | −330 to +150 days around the demo date |
| `invoices` | ~450 | Raised for completed and in-house stays |
| `payments` | ~380 | Against invoices, some unreconciled |
| `commissions` | ~800 | What Fidato earns per booking |
| `users` | 24 | Across all 8 roles |
| `auditLogs` | ~2,600 | Append-only |
| `notifications` | 40 | Across 5 channels |
| `notificationTemplates` | 12 | Email, WhatsApp, SMS, in-app |
| `automationWorkflows` | 12 | Trigger → conditions → steps |
| `automationRuns` | ~340 | Simulated history |
| `integrations` | 14 | Mostly Phase 2/3 |
| `settings` | 1 | Organisation record |

---

## Where the property data comes from

The 32 properties are **not invented**. Name, city, state, star rating, room count, room-mix
breakdown, features, facilities, amenities, nearby attractions and road distances were
extracted from the fact sheets in `D:\Fidato Assets\Hotel Fact Sheets\*.pdf` into
`src/data/seed/hotels.data.ts`.

So *Marigold Banquets 'n' Conventions, Pune* really is 150 rooms split 5 Suite / 115 Deluxe /
30 Business Class, and Shaniwar Wada really is 11.4 km away. Reviewing the hotel screens means
reviewing real inventory.

Everything else — people, companies, bookings, money — is generated from a **fixed seed**, so
the data is identical on every reload and screenshots stay comparable.

---

## Key relationships

```
company ──< customer ──< reservation >── hotel ──< roomType ──< ratePlan
                             │                        │
                             │                        └──< inventory (by date)
                             ├──> invoice ──< payment
                             ├──> commission
                             └──< auditLog
```

Denormalised for read performance, exactly as Firestore wants: a `reservation` carries
`customerName`, `companyName`, `hotelName`, `hotelCity` and `ownerName` so a list renders
without joins.

---

## Two modelling decisions worth knowing

**1. Occupancy does not come from reservations.**
Fidato is a booking layer over partner hotels — it sells a slice of each property, not the
whole thing. Reservations ÷ total rooms would report a fraction of a percent and mean nothing.
Every occupancy figure in the platform therefore reads from the **inventory model**
(`buildInventory`), which represents the property's true position across all channels, and
runs at a realistic 55–82%. The reservation-derived figure is labelled **"Fidato room
nights"** wherever both appear, so the two are never confused.

**2. `createdAt` is clamped to today.**
A forward booking was necessarily raised on or before the current date. Deriving lead time
from check-in without clamping produced reservations "created" a month in the future.

---

## Scoping

`scopeRecords(ctx, rows)` in `src/lib/permissions.ts` applies row-level visibility before
anything reaches a screen:

- **Salesperson** — only records they own.
- **Hotel manager** — only their property's records.
- **Everyone else** — unscoped.

Every repository read takes an optional `ScopeContext`. In Phase 2 the same rules are
restated as Firestore security rules, so the client and the database cannot disagree.
