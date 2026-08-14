# Volume 0 — Programme roadmap

Where this started, what was built, where it stands, and what is left.

Every other volume in this manual describes a *part* of the system. This one describes the
*programme* — the sequence of decisions and builds that produced it, in the order they
happened, with the dates they happened on.

**Record date:** 14 August 2026 · **Commits:** 62 · **Elapsed:** 31 July – 14 August 2026

---

## 0.1 The problem this exists to solve

Fidato Hotels sells room nights into **32 partner properties it does not own**.

That sentence is the origin of almost every design decision in this manual, so it is worth
stating what it rules out. Fidato is not a hotel chain and this is not a property management
system — every partner already runs one. Fidato is a distributor: it negotiates rates, holds
corporate relationships, takes bookings, issues vouchers, invoices the corporate account and
earns a commission from the property.

Before this platform, that ran on spreadsheets. The booking register was one of them — a file
called `FH Booking Register.xlsx` with 6,626 rows accumulated over years, maintained by hand
by whoever took the booking.

The consequences of that were the brief:

| Problem | What it caused |
|---|---|
| One spreadsheet, many editors | 563 cancellations spelled four different ways; 868 distinct values in a column that should hold about five |
| No enforced structure | Bank and UTR reference numbers typed into a money column. Summing it gives 1.37 **quadrillion** against 7.2 crore of real revenue |
| No permissions | Everyone who could open the file could see the commission Fidato negotiated with each property |
| No record of *why* | A rate, once changed, had no history and no author |
| Nothing automatic | Every voucher hand-made, every confirmation hand-sent |

⚠️ **The register was not merely untidy — it was actively misleading.** A system that produces
a confident wrong number is worse than one that produces none, and that principle recurs
throughout this manual because it was learned here first.

---

## 0.2 The phase plan as originally drawn

Four phases, decided before any code was written.

| Phase | Scope | Reason for the boundary |
|---|---|---|
| **1** | The entire frontend, with simulated data. No backend, no login | Prove the product is *right* before making it *real*. A wrong screen is cheap to change with no database behind it |
| **2** | Firebase — authentication, Firestore, security rules | Make it real |
| **2.5** | n8n consumes an event queue — vouchers, email, Drive, WhatsApp | Automate the delivery that was done by hand |
| **3** | Further automation | — |
| **4** | Final testing and launch | — |

The single most consequential decision in the programme was made at this point and is recorded
as ADR-1 in Volume III: **build the whole frontend against a repository interface first, with
simulated data behind it, and swap the implementation in Phase 2.**

That is why Phase 2 changed *one file* rather than 34 screens. Volume VIII documents the seam;
§0.4 below records what it actually cost when the time came.

---

## 0.3 Phase 1 — the frontend, 31 July 2026

**Delivered:** every screen of the product, working, against a deterministic seed engine that
generated 1,100 reservations across the 32 real properties.

| | |
|---|---|
| Routes | 38 |
| Roles | 8 (6 active, 2 dormant) |
| UI primitives | 28 |
| Collections modelled | 18 |
| Backend | None |
| Authentication | None — a role switcher stood in for identity |

The properties were real, extracted from the partner fact sheets. The commercial figures were
simulated, and labelled as such on every page of the record.

**What this phase bought:** nine defects found and fixed before a database existed, four of
them *silent* — screens that rendered perfectly and reported wrong answers. Volume XII is the
full account. Zero of the nine were caught by TypeScript or by the build, which is the origin
of the verification discipline in Volume XIII and in `docs/TEST-CHECKLIST.md`.

The most instructive was **occupancy**. Computing it as reservations ÷ total rooms produced a
figure under 1% and looked like a data problem. It was not: Fidato books a *slice* of each
partner hotel, so that ratio is meaningless by construction. The reports now show Fidato's
share of sellable room nights and say so on the label.

---

## 0.4 Phase 2 — Firebase, 31 July – 1 August 2026

**Delivered:** authentication, Firestore, real security rules, and the removal of every trace
of simulated data.

The phase opened with a finding that contradicted its own plan. Volume XIV had been written
assuming Cloud Functions; the project runs on the Firebase **Spark** plan, which has none. Four
of the handover's recommendations had to be redesigned:

| Assumed | Spark reality | What was built instead |
|---|---|---|
| Cloud Function roll-up counters | No functions | Counters updated inside the client transaction |
| Server-side merge | No functions | Transactional merge in the repository |
| Server-issued invoice numbers | No functions | A `counters` document, incremented transactionally |
| Custom claims for roles | No Admin SDK | The role lives in `users/{uid}` and every rule re-reads it |

⚠️ **That last row is load-bearing and appears throughout this manual.** A role in a Firestore
document, not a token claim, means the rules perform a document read to authorise a document
read. It also means the `users` document id **must** be the auth uid, which in turn is why
invitations are a separate collection keyed by email — an invited person has no uid yet.

**The seam held.** Swapping `repositories/mock/` for `repositories/firestore/` changed the
barrel file in `src/data/repositories/index.ts` and nothing above it. That was the wager of
Phase 1 and it paid.

**The bootstrap problem** was discovered here and is by design: only an Owner or Admin may
create an invitation, and Spark has no Admin SDK to break the cycle from a script. The first
Owner is written by hand in the Firebase console, which bypasses rules. `docs/RUNBOOK.md`
carries the procedure.

Phase 2 closed with **59 security-rules tests executing against the real rules engine** in the
emulator — not assertions about a permission table, but the engine itself refusing what it
should refuse.

---

## 0.5 Phase 2.5 — automation, 1 – 5 August 2026

**Delivered:** a booking raises an event; n8n turns that event into a voucher in a guest's
inbox.

The architectural rule was set first and has not been broken since:

```
React UI → repository layer → Firestore → automationQueue → n8n → the outside world
```

**The React app never talks to Drive, WhatsApp, email or accounting.** It cannot: Spark has no
server, and a credential in a browser bundle is a published credential. It writes a row to
`automationQueue` and posts a webhook; n8n does everything else. Volume XVII is the full
account.

This phase was the longest and the most rewritten, because it kept meeting the outside world:

| Attempt | Why it was abandoned |
|---|---|
| Voucher as HTML in the email body | Gmail strips `<svg>` and blocks `data:` URIs, so the logo vanished |
| PDF rendered by a Gotenberg container | The n8n host had no Docker access |
| Base64 PDF over the webhook | Payload size, and n8n handling it badly |
| Interakt for WhatsApp | Superseded when a Meta Cloud API app with an approved template became available |

**What settled:** the app generates a real vector PDF with jsPDF, the email is itself a
branded voucher rather than a covering note, and WhatsApp goes through the Meta Cloud API by
uploading the PDF to obtain a media id — which avoids publishing a guest's voucher at a public
URL.

⚠️ **jsPDF's built-in fonts are WinAnsi only.** No `₹`, no en dash, no middot. They are
stripped at render, because a blank box on a document about money reads as a broken system.

Two defects from this phase are worth carrying forward because both were *intermittent by data
shape*, which is the hardest kind to see:

- **A reservation for a customer linked to a company failed; one without a company worked.**
  The company read sat below the write inside the transaction, and Firestore aborts a
  transaction that reads after writing. With no company there is only one read and the
  ordering happens to be legal. Now pinned by an emulator test.
- **A `undefined` field anywhere in the document was rejected outright by Firestore**, which
  surfaced as "Could not create / Nothing was saved" with no indication of which field.

---

## 0.6 The booking register — 6 August 2026

**Delivered:** the 6,626-row spreadsheet, digitised, queryable, filterable and editable, in its
own database.

This was not in the original plan. It was added because the historical record was the one thing
the new platform could not replace by going forward — it had to be carried across.

⚠️ **It is a separate Supabase project and shares no domain model with the CRS.** A register
entry is a historical record; a Reservation is a live booking. Conflating them would produce
two systems that disagree about the same stay. Volume XVIII is the full account.

The phase produced the single most instructive security finding in the programme:

> **A Postgres view runs as its owner and bypasses RLS entirely unless `security_invoker = true`.**

The SQL test queried the *table*, which was correctly protected, and passed. The browser queried
the *view* and received all 6,626 rows while signed out. It is now Constraint 12, and the
lesson generalises: **a test that exercises a different path from production proves nothing
about production.**

---

## 0.7 Hardening and launch preparation — 8 – 14 August 2026

Not a phase in the original plan; the work that turns a built system into an operable one.

| Date | Work |
|---|---|
| 8 Aug | GSTIN made optional; properties can be deleted, with a guard that refuses while any reservation references them |
| 10 Aug | Bank details added to the property import; Import promoted to its own place in the navigation |
| 14 Aug | The register's filters and reports fixed; the documentation set built; the launch wipe |

Two permission faults were found and closed in this period, both of the same shape: **a
navigation entry gated on a grant that had nothing to do with what the screen does.** A
salesperson was shown Import — a screen on which they could import nothing — because the entry
was gated on "can view customers". The sidebar and the route guard now read one shared
predicate, and a test asserts they agree for every role.

⚠️ **One more of the same kind is known and not yet fixed**: "Duplicates" is gated on customer
access but needs the `merge` action. It is recorded in `docs/HANDOVER.md`.

The register fix on 14 August is worth recording in full because it was two faults wearing one
symptom — see Volume XVIII §5 and `docs/traces/bug-register-filters.md`.

---

## 0.8 Where the programme stands today

**14 August 2026. Deployed, verified, and wiped clean for launch.**

| | |
|---|---|
| Live | https://crstest-9a0c5.web.app — current build |
| Firestore rules | Deployed |
| Tests | 153 unit · 101 rules · typecheck and build clean |
| Repository | `github.com/hotelsfidato-ai/Crs-Test-` — public, `main` current |
| Routes | 51 |
| Firestore contents | The Owner account and two settings documents. Nothing else |

Every business collection was cleared on 14 August at the owner's instruction so the platform
starts on real data. Booking references restart at `FH-2026-00001`.

`settings` was deliberately kept: it holds the company details printed on every voucher and the
n8n webhook configuration. Deleting it would have silently disarmed the automation on launch
day.

### Verified, and not

| Verified | How |
|---|---|
| The permission model | 101 rules tests against the real engine |
| Business logic | 153 unit tests — GST bands, import mapping, permissions, register folds, navigation |
| Voucher delivery | Three real bookings, all recorded `sent · Delivered` with the PDF |
| The deployed build | Bundle hash compared against the local build |

| Not verified | Why |
|---|---|
| The interactive flows end to end | Wizard, approve/cancel, merge and import commit are tested at the logic layer, never click-tested |
| The register under a real token | Blocked on a Supabase configuration step |
| Email deliverability | Blocked on DNS |

---

## 0.9 What is left

**Blocked on configuration outside this repository — none of it is code:**

| Item | Needs |
|---|---|
| The register returns nothing | Supabase → Authentication → Third-Party Auth → trust Firebase project `crstest-9a0c5`, then the person's address in `register_access` |
| Register still holds its rows | `docs/supabase/clear-register.sql`, run from the Supabase dashboard |
| Email lands in spam | SPF, DKIM and DMARC for `fidatohotels.com`, aligned to the sender |
| n8n register insert refused | The n8n Supabase credential holds the publishable key; it needs `service_role` |

**Known and deliberately not fixed:**

- Nothing ever closes an `automationQueue` row, so Automation → Run history will report a 0%
  success rate while vouchers deliver correctly. The fix is one line but decides whether the
  app or n8n owns the queue's lifecycle.
- "Duplicates" is gated on the wrong permission.
- Register aggregation would be better done in Postgres than folded in the browser.

**The launch sequence** is in Volume XIX and in `docs/HANDOVER.md`.

---

## 0.10 What this programme learned

Recorded here because each one cost something and each one generalises beyond this codebase.

1. **A confident wrong number is worse than no number.** Occupancy, the +757% growth report,
   and 1.37 quadrillion of "money received" were all systems answering fluently and wrongly.
   Every one is now either corrected or labelled.
2. **Test the path production uses.** The RLS view, the `--noEmit` typecheck that compiles
   nothing, and the "Send test" button that forced the webhook enabled were all green signals
   from a path nobody actually took.
3. **The seam paid for itself.** One file changed at the Phase 1 → 2 boundary.
4. **Silent defects outnumber loud ones.** Four of Phase 1's nine rendered perfectly.
5. **Two permission systems will drift.** The client matrix and `firestore.rules` cannot see
   each other; only tests asserting they agree keep them together.
6. **Documentation that is trusted and wrong is worse than none.** `CLAUDE.md` described an
   undeployed project for weeks after it shipped. State now lives in one file that is rewritten
   every session.

---

Next: [Volume I — System overview](01-system-overview.md)
