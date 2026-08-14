# Volume XVIII — The booking register

The historical record: 6,626 rows carried across from `FH Booking Register.xlsx`, in their own
database, behind their own access control.

---

## 18.1 What it is, and what it is not

The register is the spreadsheet Fidato ran on before this platform existed — years of bookings,
maintained by hand by whoever took them.

It was digitised rather than abandoned because it is the one thing a new system cannot replace
by going forward. Rates, corporate relationships and seasonal patterns all live in it.

⚠️ **It is a separate Supabase project and shares no domain model with the CRS.**

| | Register entry | CRS Reservation |
|---|---|---|
| Is | A historical record of something that happened | A live booking under management |
| Lives in | Postgres, Supabase project `vghughipfjltjmelumdo` | Firestore, `crstest-9a0c5` |
| Shape | 33 columns, all nullable but two | A typed domain object with rules |
| Edited | To correct the past | To manage the present |

Conflating them would produce two systems that disagree about the same stay. The register module
in `src/features/register/` imports nothing from `@/data/types` for exactly this reason.

**Access:** Owner and CRS Manager only.

---

## 18.2 The data, honestly described

The source is a hand-maintained spreadsheet, and the schema reflects that: **every column is
nullable except `sheet_name` and `excel_row_num`.**

| Fact | Consequence |
|---|---|
| 1,657 of 6,626 rows are entirely blank | Spreadsheet padding. Shown by default, with an opt-out, because the row count is expected to match the file |
| 563 cancellations spelled four ways | "CAncelled", "Cancellec", "cancelled"… A folded column normalises them for filtering while preserving what was typed |
| `payment_status` holds 868 distinct values | Free text — *"Payment Received on 02 April (RTGS-…)"*. Not a status. Deliberately **not** a dropdown; the search box covers it |
| `commission_amount` empty on all 6,626 rows | Never tracked. Filled in by hand through this screen |
| A quarter have no check-in date | Sorting puts nulls last, always |

### The column that is not money

⚠️ **`amount_received` holds bank and UTR reference numbers alongside real payments.**

Summing it produced **1.37 quadrillion** against 7.2 crore of revenue. 143 values exceed a
crore; 302 are more than five times their own booking's revenue; the same number repeats down
several rows where the spreadsheet was filled down.

It is never presented as money. Values larger than the booking they belong to — with 5% slack
for rounding and small overpayments — are counted as *suspect* and surfaced as a data-quality
warning that disappears as the column is corrected. The fourth totals card shows **Cancelled**
instead, from a clean column.

This is Constraint 10.

---

## 18.3 Access, decided twice

⚠️ **Two independent systems decide whether you see this screen and whether it has anything on
it, and they cannot see each other.**

| Decides | Where | If you are missing from it |
|---|---|---|
| Whether the screen renders | `src/lib/permissions.ts` | No navigation entry, no route |
| Whether rows come back | `register_access` in Supabase | A working screen over an empty table |

Somebody named in one and not the other gets no error — just nothing. `docs/supabase/
register-security.md` documents the model.

### How a Firebase user authenticates to Postgres

```ts
createClient(url, publishableKey, {
  accessToken: async () => (await auth.currentUser?.getIdToken()) ?? null,
})
```

⚠️ **The token authorises, not the key.** The publishable key ships in the browser bundle and
grants nothing on its own — every policy requires a valid Firebase ID token *and* an allowlist
entry.

⚠️ **`accessToken` is called before every request, not once at startup.** Firebase ID tokens
expire after an hour and `getIdToken()` refreshes on demand. Caching the string would work for
an hour and then fail with an empty table until a reload.

⚠️ **Policies target `anon`, not `authenticated`.** Supabase's `authenticated` role requires a
`role: "authenticated"` claim in the JWT, which Firebase does not mint and which — with no
Admin SDK on Spark — nothing can add. The policies therefore attach to `anon` and authorise on
the contents of `auth.jwt()`.

⚠️ **A `SECURITY DEFINER` function is required to read the allowlist from inside a policy**,
since `register_access` is itself RLS-protected and a policy cannot read a table it is not
permitted to read.

### The Supabase-side step nothing in this repository can do

Supabase must be told to trust the Firebase project: **Authentication → Third-Party Auth →
Firebase, project `crstest-9a0c5`.** Until that exists, Supabase rejects the token before RLS
runs and everything returns nothing.

---

## 18.4 The finding that generalises: views bypass RLS

> **A Postgres view runs as its *owner*, not its caller, and bypasses RLS entirely — unless it
> is created with `security_invoker = true`.**

The lockdown was tested by querying the `bookings` **table** in SQL. It was correctly protected.
The test passed.

The browser queries the **view**. Signed out, it received all 6,626 rows.

Both views now set `security_invoker = true`, re-verified end to end from a signed-out browser
rather than from SQL. It is Constraint 12, and it must be applied to any future view over
register data.

**The general lesson is larger than Postgres:** a test that exercises a different path from
production proves nothing about production. The same shape appears three more times in this
manual — `tsc --noEmit` compiling nothing, "Send test" forcing the webhook enabled, and the
fixture that lied about the voucher payload.

---

## 18.5 Reporting, and the row cap

### Coverage-driven, not a fixed list

Charts and filters render for a column only where `filled > 0`, read from
`register_field_coverage`.

`commission_amount` is empty on every row today and is filled in by hand through this very
screen. A hardcoded chart list would show an empty commission chart forever, or omit it forever.
Enter one figure and the chart appears, with no code change and no deploy.

⚠️ **This is also what produced the worst failure on the screen.** The coverage view runs with
`security_invoker`, so it counts what the *caller* can see. A caller the register has not
admitted receives a perfectly successful response listing all 18 fields with `filled: 0` —
indistinguishable, to the client, from genuinely empty columns.

Every filter and chart being gated on that, an access failure silently removed the Properties,
Booker and Companies dropdowns and all four charts, and the Reports tab then explained that
nothing had been entered in any of the 18 columns yet. Confident, and wrong.

The screen now reports that it has no rows to show and names all three possible causes —
genuinely empty, project not trusted, address not on the allowlist — **without claiming which**,
because from the client they are indistinguishable. An earlier version asserted an access
problem and would have accused the owner of one the moment they cleared the register on purpose.

### PostgREST caps every response, silently

⚠️ **Supabase ships with "Max rows" at 1,000. Ask for 10,000 and you receive 1,000, with a 200,
and nothing in the response says it was cut.**

PostgREST has no `DISTINCT` and no `SUM`, so every dropdown and every chart here is folded in
the browser. A cap therefore does not shorten a list — **it makes the numbers wrong.**

| Before | Symptom |
|---|---|
| `fetchDistinct` asked for 7,000 | The properties dropdown listed a fraction of the 82; companies a fraction of the 533 |
| No `ORDER BY` | A *different* fraction each load |
| Aggregations asked for 10,000 | Revenue was the sum of the first 1,000 of 6,626 rows |

Now every scan pages with `.range()`, ordered by `excel_row_num`, using the true count from the
`Content-Range` header — which reports the real total even when the body was capped, so a capped
page cannot be mistaken for the last one.

⚠️ **The `ORDER BY` is load-bearing, not tidiness.** Paging without one lets Postgres order two
pages differently, so rows arrive twice or never.

**Consolidated at the same time.** The Reports tab issued six independent full scans — totals,
monthly, and one per bar chart — which paging would have turned into forty-two requests. It now
reads the filtered register once and folds it six ways, on the same query key as the totals
cards. The three dropdowns share one scan instead of three.

The folds are pure functions, so `registerRepo.test.ts` tests them directly and runs the paging
against a fake PostgREST that caps its responses the way the real one does — asserting a
complete result at caps of 1,000, 400 and 250, with contiguous ranges.

**The better fix, not yet done:** aggregate in Postgres with views or an RPC, `security_invoker`
set. It needs DDL access.

---

## 18.6 Reads and writes go to different objects

| Operation | Target |
|---|---|
| Read | `register_bookings` — the view: folded status, blank-row flag |
| Write | `bookings` — the table |

⚠️ **The view is not updatable and must never become so.** `booking_status_normalised` is
derived; writing it back would silently discard what a person actually typed.

`updated_at` is maintained by a trigger. Nothing in the client sets it — doing so would fight
the database for the timestamp.

---

## 18.7 New bookings file into the register

A reservation created in the CRS is inserted into the register by n8n, so the historical record
continues rather than stopping at the platform's launch date.

⚠️ **The idempotency guard uses a plain unique index, not a partial one.** `ON CONFLICT` cannot
infer a partial index — Postgres raises error 42P10. The partial clause proved unnecessary in
any case, because NULLs are distinct in a unique index. Retrying a delivery is now a no-op that
preserves any manual edits made in between.

---

## 18.8 Operating it

| Task | How |
|---|---|
| Load data | Supabase → Table Editor → `bookings` → Insert → Import data from CSV. Template: `docs/supabase/register-import-template.csv` |
| Clear it | `docs/supabase/clear-register.sql`, from the SQL editor. ⚠️ The app cannot: RLS scopes DELETE to rows the caller can see, and the browser key sees none |
| Grant access | Add the address to `register_access` **and** confirm the role in `permissions.ts` |

⚠️ **Only `sheet_name` and `excel_row_num` are NOT NULL.** Dates must be `YYYY-MM-DD`; money
must be bare numbers; `id`, `created_at` and `updated_at` are filled by the database.

⚠️ **There is no undo.** Point-in-time recovery is a paid Supabase feature and is not enabled.
Take a backup table first.

---

Next: [Volume XIX — Launch and operations](19-launch-and-operations.md)
