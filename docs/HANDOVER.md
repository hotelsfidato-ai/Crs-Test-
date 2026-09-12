# Handover — where things stand right now

**Habit 1 of the field guide.** Every new session starts with amnesia. This is the difference
between "re-explain the entire project" and "here's exactly where we left off."

**Update this at the end of every session** (habit 13 — five lines, thirty seconds). It is a
*living* record of the present, not a history. History belongs in [`DECISIONS.md`](DECISIONS.md)
and in git.

**Last updated:** 2026-09-11

---

## The five-line version

1. **v1.2.0 live 2026-09-12** (tag `v1.2.0`): the booking wizard takes occupancy and rates per
   room (each room is its own line), and has "Rates include GST" for negotiated inclusive rates
   (GST taken out per room, no corporate discount on top). v1.1.0 brought the room types import
   and fixing rows on the review screen; v1.0.0 the Daily sales report.
2. **The 28 properties and 105 room types are LIVE** (1,340 rooms), loaded from the checked
   spreadsheets in `D:\fidato data\`. Room counts are still missing for 5 properties and
   Grand Majestic has no room types; see *In flight*.
3. **Phase 2 of [`PLAN.md`](PLAN.md) (real paging, true totals, database search, bounded
   pickers) must land before the real company and customer lists are imported.**
4. **The booking register is NOT yet cleared**, and everything blocked below is a Supabase or
   DNS step outside this repo.
5. Test new data flows in the local sandbox first: `npm run emulator:local`, `npm run seed:local`,
   `npm run dev:local`. Plain `npm run dev` talks to PRODUCTION.

---

## What is actually live

| | |
|---|---|
| Hosting | https://crstest-9a0c5.web.app · v1.2.0 |
| Firestore rules | Deployed with v1.0.0 (adds `dsrVisits`, `dsrDays`) |
| Firestore indexes | 181 of the 200 Spark allows, generated from `src/data/queryPlan.ts` |
| Firebase project | `crstest-9a0c5` · Spark plan |
| Repo | `https://github.com/hotelsfidato-ai/Crs-Test-` · **public**, `main` and tags `v1.0.0`, `v1.1.0`, `v1.2.0` pushed |
| Tests | 222 unit · 122 rules · typecheck and build clean |

`CLAUDE.md` carries orientation and traps only, and points here for state. **Keep it that way:**
state in a file nobody rewrites is state that goes quietly wrong.

### Live data, as of 2026-09-11

| Collection | Documents |
|---|---|
| `users` | **7** — the team has been invited and has signed in |
| `customers` | 1 |
| `companies` | 1 |
| `settings` | 2 — `org` (brand, GSTIN, address) and `webhook` (n8n url, secret, enabled) |
| `automationQueue` | 8 — ⚠️ all will sit at `pending`; nothing closes them |
| `auditLogs` | 10 (two record the property and room type load) |
| `hotels` | **28**, loaded 2026-09-11 from `fidato-hotels-template (2) (1).xlsx` with the four review-screen corrections (Silvanus IFSC cleared, Khandela 4 stars, Kala Sagar and Sadanand account numbers without "A/c No.") |
| `roomTypes` | **105** (1,340 rooms after the Silvanus and Durgapur correction): 93 from the fact sheets (`Fidato room types - verified.xlsx`), 11 from the rate sheet with no counts (`Fidato room types - rate sheet only.xlsx`) |
| `reservations`, `invoices` | **0**, bookings can now be raised against the 27 properties with room types |

Cleared: reservations, customers, companies, hotels, roomTypes, seasons, inventory, invoices,
payments, commissions, automationQueue, automationRuns, auditLogs, notifications, counters,
importJobs, mergeJobs, and all 6 staff invitations.

⚠️ **`counters` was cleared too, so booking references restart at `FH-2026-00001`.**

⚠️ **`settings` was deliberately kept.** It is configuration, not data — deleting it would erase
the company details printed on every voucher and switch off the n8n webhook. Clear it only if
you mean to reconfigure both.

**Most screens are still correctly near-empty** — check these counts before calling one broken.

---

## Launch sequence

1. Run [`supabase/clear-register.sql`](supabase/clear-register.sql) — the register still holds
   its rows.
2. Clear the Supabase blockers below, or the register stays dark and vouchers keep landing in
   spam.
3. Re-invite staff from Admin → Users. All six previous invitations were removed.
4. Import in this order — **properties, then companies, then customers** — from `/import`.
   Customers reference companies by name, and reservations reference properties.
5. Raise one test booking and confirm the voucher arrives, before anyone raises a real one.

---

## Blocked, and on whom

Nothing here can be fixed from inside this repo.

| Blocked | Needs | Consequence until done |
|---|---|---|
| **The register still holds its rows** | Run [`supabase/clear-register.sql`](supabase/clear-register.sql) in the Supabase dashboard. The app cannot: RLS scopes DELETE to rows the caller can see, and the browser's key sees none | The launch wipe is incomplete |
| **The booking register returns nothing** | Supabase → Authentication → **Third-Party Auth** → register Firebase project `crstest-9a0c5`. Then the person's address in the `register_access` allowlist | The screen says "The register has no rows to show" and lists the three possible causes |
| **Email lands in spam** | SPF, DKIM and DMARC for `fidatohotels.com`, aligned to the sender | Vouchers reach guests' spam folders |
| **n8n register insert is refused** | The n8n Supabase credential holds the **publishable** key; it needs **service_role** | Reservations do not reach the register (RLS 42501) |
| **Nobody but the Owner can sign in** | Re-invite staff from Admin → Users. All six previous invitations were cleared in the launch wipe | Expected, not a fault |

---

## In flight

**Next: Phase 2 of [`PLAN.md`](PLAN.md)**, before any real import. Phases 3 and 4 (the audit's
security items below, Finance invoicing, commissions) are not started. The manual in
`docs/manual/` does not yet describe the Daily sales report or owner-tagged import.

**Known with v1.0.0:** a salesperson only searches their own book, so two salespeople can each
create the same company from a DSR visit. The desk sees both; merging companies is not built.

**Room data still owed by the hotels** (the audit is `D:\fidato data\Fidato room audit - 28
properties.xlsx`):
- Counts for Stone Leaf, Winway, Grand Lucent, De-Lush and Patria (room types are live with 0,
  which the booking wizard reads as "Room count not set" and does not cap).
- Grand Majestic (Shimla): no room types in any file, so it cannot be booked.
- Property totals all match the blue sheet (1,727 for these 28; its 1,785 adds Hills and Lakes 34 and
  Silver Crest 24, which are not in the system). Room-type splits still disagree for Taj Pearl
  24/40, Fiori 57/58, Ayati 30/33 and BLVD 64/62. Silvanus (website, 74) and Durgapur (directory,
  108) were corrected on 2026-09-11; Durgapur's old "Executive Premium Room" is set to 0 and should
  be removed from its Rooms tab.
- Two rate-sheet categories are on no fact sheet and so not in the system: Peerless Kolkata
  "Club Room" and Centre Point "Studio (4 pax)".
Fix them in the spreadsheet and upload it from Import → Room types: an existing room type is
updated, never duplicated.

**Loaded outside the app:** the 2026-09-11 property and room type load went straight to
Firestore through the Firebase CLI's login, not through the Import screen, because the in-app
browser cannot sign in to production. The documents were built by the app's own import code
(`HOTEL_IMPORT`, `ROOM_TYPE_IMPORT`, `HOTEL_DEFAULTS`), written create-only, and read back and
compared field by field.

**The launch wipe is half-finished** — Firestore is done, the register is not. See *Blocked*.

### Audit, 2026-09-10 — ranked, each verified against the code

1. ⚠️ **HIGH — any staff account can send branded email and WhatsApp to anyone.** `settings`
   is `allow read: if active()`, so every role can read `settings/webhook` including its
   `secret`. n8n takes the recipient (`voucher.to`), subject and WhatsApp number straight from
   the payload and never checks them against a real reservation. Fix is in n8n: treat the POST
   as a trigger only — read the reservation by id with the automation account and build the
   message from that. The secret keeps the public out; it cannot keep staff out, because the
   browser must hold it.
2. ⚠️ **HIGH at launch — two pickers read every customer/company, unbounded.**
   `customersRepo.all()` (booking wizard) and `companiesRepo.all()` (customer form), for every
   non-sales role. One read per record per open, cached 30 s. At 2,000 imported customers,
   ~25 wizard opens exhaust Spark's 50,000 reads/day — and then every screen fails for
   everyone until the quota resets. Needs search-as-you-type with `limit()`.
3. **The Finance section cannot be used.** Nothing creates an invoice; payments are recorded
   only from an invoice; nothing writes a commission. Spec 05 §5.7 — "create from a
   reservation", numbered from `counters/invoices` — was never built. Every acceptance box is
   unticked.
4. **`counters` is writable by any active user.** A Viewer can reset `counters/reservations`
   and cause duplicate booking references. Latent GST risk once invoicing uses
   `counters/invoices`. A rule can require `next == resource.data.next + 1` — that compares
   against the existing document and needs no extra read, so the comment's deadlock concern
   does not apply.
5. **`xlsx` 0.18.5 has prototype-pollution and ReDoS advisories, and parses every uploaded
   spreadsheet.** The npm release is abandoned; SheetJS ships fixed 0.20.x from its own CDN.
   Uploaders are trusted staff, but the files often come from outside.
6. **Customer import's Company column is never linked.** The template promises "Matched to an
   existing company by name"; the code stores the name as text and sets no `companyId`.
7. `react-router` 7.18.1 advisory — **does not apply**: it affects RSC mode, and this app uses
   declarative routing. Upgrade for hygiene.
8. Dead code: `if (false)` approval branch in `features/ai/responses.ts`.

Checked and clean: no secrets in the tree or anywhere in git history; `.env` never committed;
typecheck clean; lint shows only dev-time Fast Refresh warnings.

**Flagged but deliberately not done** — out of scope when found:

- ⚠️ **Nothing ever closes an `automationQueue` row.** The queue is empty after the wipe, so
  this is latent rather than visible — **it will reappear with the first real booking.**
  Observed before the wipe: all 6 rows sat at `pending` with `attempts: 0` while all 3
  reservations recorded `automation: sent · Delivered`. Delivery genuinely works; the queue is
  simply never written back to. Consequence: **Automation → Run history reports a 0% success
  rate and a pending count that only ever grows**, contradicting the reservations screen.
  `AutomationHealthBanner` is unaffected — it counts reservations, not the queue. The fix is a
  line in `pushToN8n`, which already knows the outcome and writes it to the reservation, or a
  write-back node in n8n. Untouched because it decides who owns the queue's lifecycle.

- **"Duplicates" in the sidebar has the same permission bug Import had.** It is gated on
  `canAccess(role, "customer")` but the screen needs the `merge` action, so a salesperson is
  shown a link to a screen they cannot use. `NavItem.canSee` and `Guard.allow` already exist;
  it is a two-line fix plus a test.
- **Register aggregation would be better in Postgres.** The client now pages correctly, which
  is right whatever the row cap is, but views or an RPC with `security_invoker = true` would
  do it in one request. Needs DDL access.

---

## What to read next

| You want | Read |
|---|---|
| Orientation, the trap list | [`../CLAUDE.md`](../CLAUDE.md) — auto-loaded |
| What must never happen | [`CONSTRAINTS.md`](CONSTRAINTS.md) |
| What calls what | [`FLOW.md`](FLOW.md) |
| Why something is the way it is | [`DECISIONS.md`](DECISIONS.md) |
| What "done" means | [`TEST-CHECKLIST.md`](TEST-CHECKLIST.md) |
| How to undo it | [`ROLLBACK.md`](ROLLBACK.md) |
| Full project state and history | [`CONTEXT.md`](CONTEXT.md) |

---

## How to update this file

At the end of a session, rewrite — do not append:

1. **The five-line version** — what was done, what is left, what to watch out for.
2. **Live data** — if it changed.
3. **Blocked** — add what is newly blocked, remove what was cleared.
4. **In flight** — what is genuinely half-finished, and what was flagged and skipped.
5. **The date.**

⚠️ **Delete what is no longer true rather than adding a note beside it.** A handover that
accumulates is a handover nobody reads — which is how `CLAUDE.md` came to describe a state that
had not been current for weeks.
