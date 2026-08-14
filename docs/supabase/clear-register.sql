-- ═══════════════════════════════════════════════════════════════════
-- CLEAR THE BOOKING REGISTER
--
-- ⚠️ THERE IS NO UNDO. Point-in-time recovery is a paid Supabase
-- feature and is not enabled on this project.
--
-- ⚠️ This removes ALL rows, including the ~6,626 digitised from
-- FH Booking Register.xlsx — the historical record, not just the
-- bookings this app created. Re-importing means re-running the
-- spreadsheet import by hand.
--
-- The app cannot do this itself: RLS scopes DELETE to rows the caller
-- can see, and the publishable key that ships in the browser bundle
-- sees none. That is working as intended.
--
-- WHERE: Supabase dashboard → SQL Editor, on project
--        vghughipfjltjmelumdo (Fidatoregisterdump)
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Look before you delete ──────────────────────────────────────
-- Run this first, on its own, and check the number is what you expect.

select count(*) as rows_now from public.bookings;


-- ── 2. Optional: keep a copy ───────────────────────────────────────
-- Thirty seconds against something unrecoverable. Drop the table later
-- with `drop table public.bookings_backup_2026_08_14;` once you are
-- certain you do not want it.

create table public.bookings_backup_2026_08_14 as
  select * from public.bookings;


-- ── 3. Empty it ────────────────────────────────────────────────────
-- TRUNCATE rather than DELETE: it is far faster on 6,626 rows and
-- reclaims the space immediately. RESTART IDENTITY resets any
-- sequence, so a fresh import starts numbering from the beginning.

truncate table public.bookings restart identity;


-- ── 4. Confirm ─────────────────────────────────────────────────────
-- Expect 0 from all three. The two views are derived from `bookings`,
-- so they need no separate action and will report empty on their own.

select count(*) as bookings          from public.bookings;
select count(*) as register_bookings from public.register_bookings;
select sum(filled) as any_field_filled from public.register_field_coverage;


-- ═══════════════════════════════════════════════════════════════════
-- AFTERWARDS
--
-- The Register screen will say "The register has no rows to show" and
-- list three possible causes, the first being that it is genuinely
-- empty. That is correct and expected — it cannot tell an empty
-- register apart from one that will not admit you, because both return
-- zero rows with a 200.
--
-- ⚠️ Do NOT drop or recreate the views. If you ever do, they MUST be
-- recreated with `security_invoker = true` — a Postgres view runs as
-- its OWNER by default and bypasses RLS entirely. That mistake once
-- served all 6,626 rows to a signed-out browser. See
-- docs/supabase/register-security.md.
-- ═══════════════════════════════════════════════════════════════════
