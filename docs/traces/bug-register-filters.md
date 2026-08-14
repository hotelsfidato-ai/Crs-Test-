# Bug: register filters incomplete and report figures wrong

**Status** — fixed, deployed 2026-08-14 (`cedbe9d`)
**Found** — 2026-08-14. Reported as "the filters are not working… not showing all the data…
check the properties and person and companies filters in the reports section"
**Files** — `src/features/register/registerRepo.ts`, `RegisterPage.tsx`, `RegisterFilters.tsx`,
`RegisterCharts.tsx`, `registerRepo.test.ts`

---

## Symptom

On the booking register's Reports tab, the Properties, Booker and Companies filters were not
behaving. Data appeared to be missing.

⚠️ The report deliberately mixed two things — "filters not working" and "not showing all the
data" — and they turned out to be two different faults. Taking either phrasing as *the* problem
would have fixed half of it and looked like a complete job.

---

## What it was NOT

| Hypothesis | Ruled out by |
|---|---|
| The filters were not wired to the queries | Read `RegisterFilters` → `applyFilters`; the wiring is correct and every filter reaches PostgREST |
| The dropdowns were querying the wrong column | Column names match the view; the `eq` filters are right |
| RLS was blocking the register outright | A direct anonymous probe: `register_bookings` → HTTP 200, **0 rows**. Correct, and it means the lockdown holds |
| `register_field_coverage` was leaking data publicly | It returns 18 rows anonymously — but every one has `filled: 0`, so it is not leaking. It is `security_invoker` behaving exactly as designed |
| The charts were aggregating only the visible page | They are not; they aggregate the filtered set. The bug was one level down, in how much of the filtered set arrived |

The decisive step was **probing the live REST API directly** rather than reading more code. Both
faults are invisible in the source and obvious in a response.

---

## Cause

**Two independent faults.**

### 1. An access failure was rendered as "your columns are empty"

`register_field_coverage` runs with `security_invoker = true`, so it counts what the *caller*
can see. A caller the register has not admitted gets a fully successful response listing all 18
fields with `filled: 0`.

Every filter and chart is gated on `filled`:

```ts
for (const row of coverage.data ?? []) if (row.filled > 0) set.add(row.field);
```

So zero visible rows silently removed the Properties, Booker and Companies dropdowns and all
four charts — and the Reports tab then displayed a card explaining that nothing had been entered
in any of the 18 columns yet. Confident, and wrong.

Proven directly:

```
register_bookings        → HTTP 200, 0 rows      ← RLS working
register_field_coverage  → HTTP 200, 18 rows, all filled: 0
```

### 2. Every figure was folded from the first page

PostgREST caps every response and applies the cap silently — Supabase ships with "Max rows" at
1,000. `fetchDistinct` asked for 7,000 and the aggregations for 10,000; both got at most 1,000
with a 200, and nothing in the response says it was cut.

Because PostgREST has no `DISTINCT` and no `SUM`, all of this is folded in the browser. So the
cap did not merely shorten a list — it made the numbers wrong. Revenue was the sum of 1,000 of
6,626 rows. The Properties dropdown listed whichever of the 82 properties fell inside that page,
Companies whichever of the 533 — and a **different set each load**, because there was no
`ORDER BY` either.

---

## Fix

1. **`total` as the discriminator.** 0 visible rows is never a statement about columns. The
   screen now says "No rows are visible to you" and names the two Supabase-side causes.
2. **Page every scan.** `.range()`, ordered by `excel_row_num`, using the true count from
   `Content-Range` so a capped page cannot be mistaken for the last one.
3. **One scan, six folds.** Reports was issuing six independent full scans; paging each would
   have made that 42 requests. It now reads the filtered register once. The three dropdowns
   share one scan instead of three.

**Rejected:** raising "Max rows" in the Supabase dashboard — it fixes this project and breaks
silently on any other, and no cap is high enough to be a guarantee. **Deferred:** aggregating in
Postgres via views or an RPC, which is the better long-term answer but needs DDL access.

⚠️ The `ORDER BY` is load-bearing, not tidiness. Paging without one lets Postgres order two
pages differently, so rows arrive twice or never.

---

## Verification

19 new tests against a fake PostgREST that caps its responses the way the real one does:

```
npx vitest run
  Test Files  12 passed (12)
  Tests      153 passed (153)
```

Specifically pinned — a complete result at cap **1000, 400 and 250**, contiguous ranges, all 82
properties and 15 bookers recovered, and the counter-test showing what a single unpaged request
would have returned.

```
npx tsc -b --pretty false     → clean
npm run build                 → ✓ built in 15.53s
firebase deploy --only hosting → Deploy complete
```

⚠️ **Not verified:** the project's actual "Max rows" value. RLS correctly refuses the rows
needed to measure it. The fix works whatever it is, so this does not block — but it means
nobody knows how wrong the old figures were.

---

## Left behind

- **Which fault the user actually had is still unknown.** After the deploy, "No rows are visible
  to you" means fault 1 and it is a Supabase dashboard step; a working screen with complete
  dropdowns means it was fault 2 and it is fixed.
- **`RegisterCalendar` still fetches with `pageSize: 1000`.** One month of bookings is far
  below any cap, so it is correct today and would be wrong for a busy year. Left alone.
