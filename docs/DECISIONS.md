# Decisions

**Habit 2 of the field guide.** Code shows what changed. This shows why.

A running log, newest first. Phase 1's 24 decisions are frozen in `manual/03-decision-log.md`
and are not repeated here; this picks up from Phase 2.

**Add a record when a decision would be expensive to re-derive** — when an option that looks
obvious was rejected for a reason the code cannot show. Not for every commit.

---

### Template

```markdown
## YYYY-MM-DD — <the decision, as a statement>

**Context** — what forced a choice.
**Options** — what lost, and why it lost.
**Decision** — what was chosen.
**Consequence** — what this now costs or constrains.
**Model** — which AI, if one was involved. (Habit 14.)
```

---

## 2026-08-14 — Register reporting pages every scan instead of trusting `.limit()`

**Context** — The Properties, Booker and Companies filters were incomplete and the report
figures were wrong. PostgREST caps every response — Supabase ships with "Max rows" at 1,000 —
and applies it silently: asking for 10,000 returns 1,000 with a 200 and nothing saying it was
cut. Because PostgREST has no `DISTINCT` and no `SUM`, every dropdown and chart is folded in
the browser, so the cap did not shorten a list, it made the numbers wrong.

**Options**
- *Raise "Max rows" in the Supabase dashboard.* Rejected: fixes this project and silently breaks
  again on any project where it is not raised, and there is no cap high enough to be a guarantee.
- *Aggregate in Postgres with views or an RPC.* Correct, and still the better long-term answer,
  but it needs DDL access this session did not have.
- *Page client-side until the rows run out.* Chosen.

**Decision** — Page with `.range()`, ordered by `excel_row_num`, using the true count from the
`Content-Range` header so a capped page cannot be mistaken for the last one. Six independent
scans on the Reports tab collapsed into one, folded six ways.

**Consequence** — Correct whatever the cap is, and it reveals the cap rather than hiding it. Costs
seven round trips for 6,626 rows. ⚠️ The `ORDER BY` is load-bearing: paging without one lets
Postgres order two pages differently, so rows arrive twice or never.

**Model** — Claude Opus 5.

---

## 2026-08-14 — "No rows visible" is stated, not inferred as "no data"

**Context** — `register_field_coverage` runs with `security_invoker`, so it counts what the
*caller* can see. A caller the register has not admitted gets a successful response listing all
18 fields with `filled: 0` — which the client could not tell apart from genuinely empty columns.
Every filter and chart is gated on that, so an access failure silently removed every dropdown
and every chart, and the Reports tab then explained that nothing had been entered in any column.

**Options**
- *Stop gating on coverage.* Rejected: the gating is right, and it is what stops the interface
  hardcoding its own report list.
- *Use `total` as a discriminator.* Chosen — 0 rows visible is never a statement about columns.

**Decision** — When `total` is 0, say so, and name the two Supabase-side causes.

**Consequence** — The screen can now distinguish "your register is empty" from "you are not
admitted", which are the same picture and completely different problems.

**Model** — Claude Opus 5.

---

## 2026-08-14 — Import moved to the top level and gated on what it can import

**Context** — Import was a child of Customers, gated on `canAccess(role, "customer")`.

**Options**
- *Leave it and widen the gate.* Rejected: the screen loads customers, companies **and**
  properties, so no single resource is the right gate, and filing it under one hid it from
  the other two.

**Decision** — Top level at `/import`, gated on `canImportAnything`, with `/crm/import`
redirecting. `NavItem.canSee` and `Guard.allow` added for entries spanning several resources.

**Consequence** — Closed an open door: a salesperson holds `customer` view access and no import
grant, so they were shown Import, admitted by the guard, and offered a screen on which they could
import nothing. The entity picker now offers only what the role may actually import.

⚠️ Left in place deliberately: **Duplicates has the identical bug** and is flagged, not fixed,
because it was outside what was asked.

**Model** — Claude Opus 5.

---

## 2026-08-14 — Deleting a property refuses when reservations reference it

**Context** — Properties could be created and edited but never removed, so one added in error
sat in the booking wizard forever.

**Options**
- *Cascade the delete to reservations.* Rejected outright — that is data loss to tidy a list.
- *Allow the delete and leave bookings pointing at nothing.* Rejected: a hotel's name is copied
  onto every booking, invoice and voucher raised against it, so the rows outlive the property.
- *Refuse while anything references it.* Chosen.

**Decision** — `hotelsRepo.remove` counts reservations first and refuses with the count, pointing
at Paused instead. Room types and seasons cascade. Deleting is owner and admin only, narrower
than who may edit.

**Consequence** — ⚠️ A Firestore rule cannot run a query, so the guard lives in the repo and
protects against a mistake, not against a console. Confining deletion to the two roles trusted
with the whole tenancy is what covers the rest. `countWhere` has no catch, so a refused count
aborts the delete rather than reading as zero — it fails closed.

**Model** — Claude Opus 5.

---

## 2026-08-14 — GSTIN is optional on a company

**Context** — Bulk imports were rejecting whole rows over a missing GSTIN.

**Decision** — Optional in the import descriptor, which was the only place still requiring it —
the form already had it optional. The format check still runs on whatever *is* supplied.

**Consequence** — Companies can be imported with a gap where there was no number to begin with.
Duplicate detection still uses GSTIN when present and falls back to the name.

**Model** — Claude Opus 5.

---

## 2026-08-14 — The Supabase mirror of CRS data was removed

**Context** — A Postgres mirror of Firestore reservations was built and then reconsidered.

**Decision** — Removed from the app entirely. n8n writes to Supabase; the browser does not.

**Consequence** — One less credential in a bundle that ships to users, and one less path into
the data. The register remains, because it is a separate database the browser genuinely reads —
and it is locked behind an allowlist for exactly that reason.

**Model** — Claude Opus 5.

---

## 2026-08-14 — Register views must set `security_invoker = true`

**Context** — A signed-out browser received all 6,626 register rows. The SQL test had queried
the *table*, which was correctly protected; the browser queried the *view*.

**Decision** — `security_invoker = true` on every view over register data, verified end to end
from a signed-out browser rather than from SQL.

**Consequence** — ⚠️ Now constraint 12. A Postgres view runs as its **owner** by default and
bypasses RLS completely. Testing the table proves nothing about the view.

**Model** — Claude Opus 5.

---

## 2026-08-14 — The register's reporting is driven by column coverage, not a fixed list

**Context** — `commission_amount` is empty on all 6,626 rows and is filled in by hand through
this very screen.

**Decision** — Charts and filters render where `filled > 0`, read from
`register_field_coverage`.

**Consequence** — A category appears the moment its column starts being used, with no deploy.
⚠️ And it created the "no rows visible" failure above, which is the cost of the approach and the
reason for the discriminator.

**Model** — Claude Opus 5.

---

## 2026-08-14 — `amount_received` is never presented as money

**Context** — Summing the column gave 1.37 quadrillion against 7.2 crore of revenue. It holds
bank and UTR reference numbers alongside real payments, filled down over rows in the original
spreadsheet.

**Decision** — Not summed. Values larger than the booking they belong to (plus 5% slack) are
counted as suspect and surfaced as a data-quality warning. The fourth totals card shows
Cancelled instead.

**Consequence** — Now constraint 10. The warning disappears on its own as the column is
corrected through the table.

**Model** — Claude Opus 5.

---

## 2026-08-14 — Reservation writes never block on the webhook

**Context** — `pushToN8n` runs on every reservation.

**Decision** — Not awaited. The `automationQueue` row is the durable record; the webhook is the
optimistic path, and its outcome is written back onto the reservation afterwards.

**Consequence** — A booking cannot fail because n8n is slow or down. ⚠️ It also means a
successful save says nothing about delivery, which is why the reservation carries a visible
automation status.

**Model** — Claude Opus 5.
