# The booking register — access model

Project `Fidatoregisterdump` (`vghughipfjltjmelumdo`), table `public.bookings`.
6,626 rows digitised from *FH Booking Register.xlsx*.

## What it looked like before

```
SELECT  using (true)        → PUBLIC
INSERT  with check (true)   → PUBLIC
UPDATE  using (true)        → PUBLIC
```

`PUBLIC` includes `anon`. Anyone holding the publishable key could read
and rewrite every record — guest names, phone numbers, room rates,
revenue, invoice numbers. The key ships inside any browser bundle that
talks to Supabase, so this was a matter of opening DevTools.

## What replaced it

Access needs **a valid Firebase ID token from the Fidato project** *and*
**an entry in `public.register_access`**. Verified against four cases:

| Caller | Rows visible |
|---|---|
| Publishable key, no token | 0 |
| Valid token, different Firebase project | 0 |
| Right project, not on the allowlist | 0 |
| Allowlisted, right project | 6,626 |

### Why the policies target `anon`, not `authenticated`

The documented Supabase path expects a `role: 'authenticated'` custom
claim on the Firebase user. Setting custom claims needs the Admin SDK,
which needs a server, which needs the Blaze plan. On Spark that claim
cannot exist, so Supabase maps these callers to the `anon` Postgres
role.

It still exposes the Firebase claims to `auth.jwt()`, so the policies
authorise on **the token**, not the role. Same guarantee, no Blaze —
but it is off the documented path, and worth knowing before anyone
"tidies" the policies to target `authenticated` and locks everyone out.

### Why the checks are `SECURITY DEFINER` functions

The policies must consult `register_access`, which has RLS enabled and
no policies of its own — nothing reachable from a browser may read the
allowlist, or someone could add themselves. A plain subquery would hit
that RLS and always return nothing. Running as the owner is what makes
an allowlist check possible at all.

### Why the issuer is checked

Firebase signs every project's tokens with one shared key set. Without
the `iss`/`aud` check, a token minted by **any** Firebase project would
validate. That is the "wrong Firebase project" row in the table above.

## ⚠️ Views bypass RLS unless told not to

A Postgres view runs as its **owner** unless `security_invoker = true`
is set. `register_bookings` and `register_field_coverage` were created
without it, so they executed as `postgres` and read straight through
the row-level security on `bookings`.

Locking the table therefore did nothing for the application, because
the application queries the view. A direct `select` on `bookings` as
`anon` returned 0 — the same query through the view returned all 6,626
rows to a signed-out browser.

Both views now set `security_invoker = true`. **Any future view over
`bookings` must set it too**, or it reopens the hole silently. Test
through the view, never only against the table.

## Deliberately absent

**No INSERT or DELETE policy.** The register is synchronised from the
spreadsheet; rows created or removed in the app would silently diverge
from it. Corrections are edits. Adding an insert policy needs a decision
about what the next import does with app-created rows.

## Two lists, and why both matter

Access to the Register is decided in **two separate places**, and they
are not connected:

| Where | Controls | Source of truth |
|---|---|---|
| Firestore `users/{uid}.role` | whether the **screen** appears | the CRS |
| Supabase `register_access` | whether the **data** comes back | this project |

Owner and CRS Manager get the screen, both with edit rights. But the
Supabase policies cannot see a Firestore role — a Firebase ID token
carries no custom claims on the Spark plan — so the allowlist has to
name the same people again.

⚠️ **When they diverge, the failure is silent and misleading.** Someone
who is `crs_manager` in Firestore but missing from `register_access`
sees the Register in the navigation, opens it, and gets an empty table
with no error — the rules did their job and returned nothing. Anyone
debugging that will look at the code first.

**So: adding or removing a CRS Manager is two operations.** Invite them
in the CRS, and add them here.

## Maintaining the allowlist

Supabase dashboard → Table editor → `register_access`, or SQL:

```sql
insert into public.register_access (email, can_edit, note)
values ('someone@fidatohotels.com', true, 'CRS desk')
on conflict (email) do update set can_edit = excluded.can_edit;
```

`can_edit = false` grants read-only. Removing a row revokes access at
once — the policies read it on every query.

⚠️ The address must match the **Firebase account** they sign in with,
lower-cased. It is matched on email, not uid, so that access can be
granted before someone has claimed their invitation.

## Required dashboard step

None of this works until the Firebase integration is registered:

**Supabase → Authentication → Third-Party Auth → Add Firebase**, project
ID `crstest-9a0c5`.

Without it Supabase rejects the token before RLS runs, and every query
returns nothing — which looks exactly like a broken allowlist.

## Reporting views

- `register_field_coverage` — which columns hold data. The interface
  renders a chart or filter only where `filled > 0`, so categories
  appear as the register is completed rather than being fixed in code.
  `commission_amount` and `tac_status` are at 0 today.
- `register_bookings` — `bookings` plus a folded `booking_status`
  (`Cancelled`/`CAncelled`/`cancelled`/`Cancellec` → `Cancelled`) and an
  `is_blank_row` flag for the 1,657 empty spreadsheet rows. A view, not
  an `UPDATE`: the register records what people typed, and correcting it
  silently would destroy that.
