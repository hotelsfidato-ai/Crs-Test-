# Plan — September 2026

Started 2026-09-10. Owner's brief: import the company list properly, and fix everything the
2026-09-10 audit found. **Every phase is built and tested in the local sandbox first**
(`npm run emulator:local` → `npm run seed:local` → `npm run dev:local`), and is committed and
deployed only when the owner confirms it works.

Tick items as they land. Rewrite, do not append — this is a working document.

---

## Where the owner's data goes

The company list the owner holds has these columns. This is what each one becomes.

| Their column | Becomes | Seen on |
|---|---|---|
| SR. NO. | Nothing — a row counter, not data | — |
| **COMPANY NAME** | The company's name. **The only required field** | Companies list, company page |
| CITY | The company's city | Companies list, company page |
| CONTACT PERSON | The company's contact person | Companies list, company page → Contact persons |
| DESIGNATION | That person's designation | Company page → Contact persons |
| CONTACT NUMBER | That person's phone | Companies list, company page → Contact persons |
| EMAIL ID | That person's email | Company page → Contact persons |
| STATUS | Company status — see the status note in Phase 1 | Companies list, company page |

**A company's contact person is not a customer.** Customers are guests and bookers — the people
a room is booked *for* — and they need a unique email and phone. A contact person on a lead list
often has neither. They live on the company. Turning a contact into a bookable customer is a
separate, later step (Phase 5).

---

## Phase 1 — Import the company list properly

**Why first:** it is the owner's data, and today it would lose most of it. Contact persons are
written to a list no screen shows, CONTACT NUMBER is not recognised, DESIGNATION has nowhere to
go, a blank CITY rejects the row, and any STATUS word other than active/prospect/dormant rejects
the row.

- [x] 1.1 Recognise the owner's exact headers automatically, including `SR. NO.`, `CONTACT NUMBER`, `EMAIL ID`
- [x] 1.2 Company name is the only required column. City, contact, phone, email all optional
- [x] 1.3 Contact persons become a real, visible part of a company — name, designation, phone, email
- [x] 1.4 Shown on the Companies list (contact and phone) and on the company page; added and edited in the company form
- [x] 1.5 A malformed phone, malformed email or unfamiliar status **warns instead of rejecting** — the company still imports, the value is kept as typed, and the warning says what to check
- [x] 1.6 The same company on several rows becomes **one company with several contact persons**, not a rejected duplicate
- [x] 1.7 The company form requires only the trading name; legal name defaults to it
- [x] 1.8 Tag the file to a salesperson — **built, uncommitted**, awaiting the owner's sandbox test
- [x] 1.9a Tests — 12 new, pinned to the owner's exact headers; a sample sheet dry-run gives 8 rows -> 6 companies, 1 combined, 1 rejected
- [ ] 1.9b The owner tries a copy of their real file in the sandbox

**Done alongside Phase 1, at the owner's request (2026-09-10):**

- [x] **The CRS Manager can add, edit and import properties** — not delete them, and never
      commission. `firestore.rules` already allowed it; only the client grant was missing, so the
      database accepted what the interface never offered. 2 unit + 2 rules tests.
- [x] **Import page no longer throws the whole app off-screen.** The hidden file input was
      `sr-only` (absolute) with no positioned ancestor, so it anchored to the document at y=1,580
      and made a 680px window scroll 901px when "Choose file" focused it — shoving the shell up and
      leaving a blank band. `<main>` is now `relative`, which fixes it for every page. Reproduced in
      the running app with the fix removed, and confirmed gone with it restored.

- [x] **Companies can be filtered by salesperson**, and the salesperson is the third column
      (it was ninth and hidden on narrower screens) and a tag on the company page. Uses the indexes
      that already scope a salesperson's own list, so **no new indexes to deploy**. Hidden for
      salespeople, who only ever see their own. Checked in the sandbox as the desk (filter shows
      exactly Haider's 2 companies) and as Haider (sees only his 2, no filter, no column).

- [x] **Companies can be filtered by which details they have** — has / no contact person,
      contact number, email, city. For working a list through ("has a contact number") and
      cleaning one up ("no email"). Each company carries derived `detailTags`, set on create, edit
      and import from one function (`lib/companyDetails.ts`); the filter is one `array-contains`.
      Checked in the sandbox: every option returns exactly the right companies, combined with the
      salesperson filter too, and an edit re-tags the company. 9 tests.
      ⚠️ **At go-live this needs two extra steps**, both listed under *Shipping* below.

### The Daily Sales Report — built 2026-09-11

Replaces each salesperson's monthly DSR workbook (one sheet per day, one row per visit — see
`D:\fidato data\DSR_Haider-_July_2026.xlsx`). The owner decided three things on 2026-09-10:

| Decision | Chosen |
|---|---|
| Visits and Companies | **Link, and add new companies** — a first visit creates the company as a lead in that salesperson's book, with the contact person |
| Editing | **Same day only** for a salesperson; the CRS desk, Admin and Owner correct any day |
| Old workbooks | **Not imported** — start fresh |

- [x] `dsrVisits` (one per visit) and `dsrDays` (who they went with; other work, or why no visits)
- [x] Visit type — Introduction, Courtesy / brand recall, Follow-up, Meeting, Contract / proposal,
      Could not meet — drawn from the remarks in the real workbook
- [x] Same-day lock enforced in `firestore.rules` (India time), mirrored in `lib/dsr.ts`; checked
      before anything is written, so a refused visit cannot leave a stray company behind
- [x] Company box searches the salesperson's book as you type — bounded, in the database, via
      `nameKey`. "ABB INDIA LIMITED" links to "ABB India Ltd"; a *typo* does not, but the search
      lists both so the salesperson picks
- [x] Day view (the sheet), Period view (the month, counts by visit type, Download in the
      workbook's columns), and a Visits tab on every company
- [x] 13 unit + 14 rules tests. Checked in the sandbox as Haider, the desk and Pijush

⚠️ **Known consequence of "each salesperson's own book":** two salespeople visiting the same
company each get their own record of it — Pijush cannot see Haider's ABB, so his first visit
creates a second one. There is no company-merge screen yet (Duplicates covers customers only).

**Status words.** The sheet's STATUS column may use words the system does not (interested,
follow up, not interested…). Recognised words map to active / prospect / dormant; anything else
imports as **prospect** with the original word kept in the notes and a warning on the row. Once
the owner's real values are known, add them to the mapping.

## Phase 2 — Lists that work past 25 records  *(audit #2, plus a worse one found 2026-09-10)*

⚠️ **Phases 1 and 2 ship together. The real import must not run before Phase 2.**

**Found while planning Phase 1:** every list in the app — companies, customers, reservations,
properties, invoices — **shows at most 25 records and can never reach page 2.** `runQuery` in
`repositories/firestore/helpers.ts` fetches the first page, never uses the page number, and
reports `total` as the number it just fetched, so the pager always computes one page.
`startAfter` is imported and never called. Search filters the first 100 records in the browser,
so anything beyond them is reported as not found. Invisible today because production holds one
customer; an import of 500 companies would show 25 of them and look like data loss.

**Also:** the booking wizard's customer picker and the customer form's company picker read every
record on every open. At 2,000 customers, ~25 opens exhaust Spark's 50,000 reads a day, and then
every screen fails for everyone until the quota resets.

- [ ] 2.1 Real paging — Firestore cursors, one page read per page viewed
- [ ] 2.2 A true total from `getCountFromServer` — one read per 1,000 records, not per record
- [ ] 2.3 A search key on every customer and company (lower-cased name, plus contact names for
      companies), set on create, edit and import; backfilled on existing records
- [ ] 2.4 Search runs in the database as a prefix match, so it finds records on any page
- [ ] 2.5 Both pickers search as you type, 20 results at most
- [ ] 2.6 Indexes for the scoped (salesperson) and unscoped queries

## Phase 3 — Security and integrity  *(audit #1, #4, #5, #6)*

- [ ] 3.1 `counters` may only move forward by one, and only for roles that raise bookings *(#4)*
- [ ] 3.2 Replace `xlsx` 0.18.5 with SheetJS 0.20.x from the vendor's CDN *(#5)*
- [ ] 3.3 A customer import's Company column links to the actual company record *(#6)*
- [ ] 3.4 **n8n checks every message against the real booking before sending** *(#1)*. The POST
      becomes a trigger carrying an id; n8n reads the reservation itself with the `automation`
      account and builds the email and WhatsApp from that. ⚠️ Needs the owner to create the
      automation login and give it to n8n — steps will be written out
- [ ] 3.5 Housekeeping: "Duplicates" gated on the `merge` permission; close `automationQueue`
      rows once delivered; upgrade `react-router`; remove the dead approval branch

## Phase 4 — Build Finance  *(audit #3)*

Nothing can create an invoice today, so Invoices, Payments and Commissions are permanently empty.

- [ ] 4.1 Raise an invoice from a completed or checked-out reservation — lines copied, totals recomputed from source
- [ ] 4.2 Numbering from `counters/invoices`, unique and sequential per financial year — relies on 3.1
- [ ] 4.3 GST per line, both bands shown separately
- [ ] 4.4 Printable invoice; payments recorded against it
- [ ] 4.5 Commissions — **needs the owner's rules first**: which rate, earned when, paid how

## Phase 5 — Later, once the above is live

- [ ] 5.1 Turn a company's contact person into a bookable customer, in one click
- [ ] 5.2 Register aggregation moved into Postgres

## Shipping each phase

1. Sandbox test by the owner
2. `npx vitest run` · `npm run test:rules` · `npx tsc -b` · `npm run build`
3. Commit, deploy hosting (and rules when they changed)
4. Update `HANDOVER.md`, `DECISIONS.md`, and the manual

**For the Phase 1 release specifically:**

- ⚠️ **Deploy the rules** — the DSR adds `dsrVisits` and `dsrDays`; without the rules deployed,
  every DSR read and write is refused. `npm run test:rules` first (122 passing on 2026-09-11).
- ⚠️ **Deploy the indexes** — `npx firebase deploy --only firestore:indexes --project crstest-9a0c5`.
  181 of 200 now: the Details filter added 12, the DSR 5, company search 1. Without them the
  Details filter, the DSR day/period views and the company search fail in production with
  "The query requires an index". They take minutes to build after deploying.
- ⚠️ **Backfill companies saved before this release** —
  `npm run backfill:tags -- --production` (dry run: read the list), then add `--apply`. Writes
  `detailTags` and `nameKey`; without `nameKey` an old company is invisible to the DSR's company
  search and to matching. Production held 1 company on 2026-09-10. Anything saved or imported
  after the release carries both on the way in.
