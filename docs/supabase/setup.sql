-- ══════════════════════════════════════════════════════════════════
-- FIDATO CRS → SUPABASE MIRROR
-- Run once in the Supabase SQL editor.
--
-- ⚠️ NO POLICIES ARE CREATED, AND THAT IS THE POINT.
--
-- n8n writes with the SERVICE_ROLE key, which bypasses row-level
-- security entirely. So RLS stays on and grants nothing to anyone:
-- `anon` and `authenticated` can do nothing at all, and the only thing
-- that can touch these tables is a server holding the service key.
--
-- An earlier design had the browser write with the anon key, which
-- forced an `anon INSERT` policy — and the anon key ships inside the JS
-- bundle, so anyone who opened DevTools could write unlimited rows.
-- Moving the writer to n8n is what removed that door. Do not add an
-- anon policy back "to test something"; test with the service key.
-- ══════════════════════════════════════════════════════════════════

create table if not exists public.reservations (
  id             text primary key,
  reference      text,
  status         text,
  check_in       date,
  check_out      date,
  total_amount   numeric,
  customer_name  text,
  hotel_name     text,
  owner_name     text,
  -- ⚠️ The whole record, as jsonb. The CRS schema is still moving; a
  -- column per field needs a migration every time a type gains one,
  -- and until then the mirror silently drops what it does not know.
  -- Promote what you actually query into the view below.
  data           jsonb not null,
  mirrored_at    timestamptz not null default now()
);

create index if not exists reservations_check_in_idx  on public.reservations (check_in);
create index if not exists reservations_status_idx    on public.reservations (status);
create index if not exists reservations_hotel_idx     on public.reservations (hotel_name);
-- Lets you query anything inside `data` without adding a column.
create index if not exists reservations_data_gin_idx  on public.reservations using gin (data);

-- RLS on, no policies. Default-deny for every role except service_role.
alter table public.reservations enable row level security;

-- ── Reporting ─────────────────────────────────────────────────────
-- Rooms are an array inside the booking; this unnests them so a night
-- count or a meal-plan breakdown is one query rather than jsonb
-- gymnastics.

create or replace view public.reservation_rooms as
select
  r.id                        as reservation_id,
  r.reference,
  r.check_in,
  r.hotel_name,
  room->>'roomTypeName'       as room_type,
  room->>'mealPlan'           as meal_plan,
  (room->>'quantity')::int    as quantity,
  (room->>'adults')::int      as adults,
  (room->>'sellingRate')::numeric as selling_rate
from public.reservations r,
     lateral jsonb_array_elements(r.data->'rooms') as room;

create or replace view public.reservations_summary as
select
  date_trunc('month', check_in) as month,
  hotel_name,
  count(*)                      as bookings,
  sum(total_amount)             as revenue,
  sum((data->>'nights')::int)   as room_nights
from public.reservations
where status <> 'cancelled'
group by 1, 2
order by 1 desc, 4 desc;

-- ── Verifying the mirror ──────────────────────────────────────────
-- The mirror is written after the Firestore commit and nothing retries
-- it, so it CAN fall behind. Compare this count against the
-- reservations total in the CRS periodically; a persistent gap means
-- pushes are being lost, not that a booking vanished.
--
--   select count(*), max(mirrored_at) from public.reservations;
