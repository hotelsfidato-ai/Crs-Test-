import { registerDb, describeRegisterError } from "./registerClient";
import type {
  RegisterBooking, RegisterBookingRow, RegisterQuery, RegisterPage,
  FieldCoverage, EditableField,
} from "./types";

/* ══════════════════════════════════════════════════════════════════
   REGISTER QUERIES

   ⚠️ Everything is done in Postgres — filtering, sorting, paging and
   aggregation. 6,626 rows is small for a database and far too much to
   pull into a browser on every keystroke, and the charts aggregate the
   WHOLE register, not the page being viewed.

   ⚠️ Reads use the `register_bookings` view (folded status, blank-row
   flag). Writes go to the `bookings` table. The view is not updatable
   and must not become so: the folded status is derived, and writing it
   back would overwrite what the person actually typed.
   ══════════════════════════════════════════════════════════════════ */

const DEFAULT_PAGE_SIZE = 50;

/** Fields the free-text search covers. */
const SEARCH_FIELDS = [
  "guest_name", "company_or_ta", "hotel_name", "booker_name",
  "hotel_conf_no", "fidato_conf_no", "invoice_number",
  "booking_done_by", "guest_contact_number",
];

function applyFilters(builder: any, q: RegisterQuery) {
  if (q.hotel) builder = builder.eq("hotel_name", q.hotel);
  if (q.bookedBy) builder = builder.eq("booking_done_by", q.bookedBy);
  if (q.company) builder = builder.eq("company_or_ta", q.company);

  /* ⚠️ Filters on the FOLDED column, so one "Cancelled" catches the 563
     rows spelled four different ways. */
  if (q.status) builder = builder.eq("booking_status_normalised", q.status);

  if (q.hideBlank) builder = builder.eq("is_blank_row", false);

  const dateField = q.dateField ?? "check_in_date";
  if (q.from) builder = builder.gte(dateField, q.from);
  if (q.to) builder = builder.lte(dateField, q.to);

  if (q.search?.trim()) {
    /* PostgREST `or` takes one string. Commas and parens inside a term
       would break the grammar, so they are stripped rather than escaped
       — a guest name containing one is not worth a syntax error. */
    const term = q.search.trim().replace(/[,()]/g, " ");
    builder = builder.or(SEARCH_FIELDS.map((f) => `${f}.ilike.%${term}%`).join(","));
  }
  return builder;
}

export async function fetchRegister(q: RegisterQuery = {}): Promise<RegisterPage> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = q.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let builder = registerDb()
    .from("register_bookings")
    .select("*", { count: "exact" });

  builder = applyFilters(builder, q);

  /* ⚠️ nullsFirst: false throughout. A quarter of the register has no
     check-in date; sorting by it with nulls first buries every real
     booking under 1,657 blank rows. */
  const sortBy = q.sortBy ?? "check_in_date";
  builder = builder
    .order(sortBy, { ascending: q.sortDir === "asc", nullsFirst: false })
    /* A stable tiebreak. Without it Postgres may return a different
       order for equal keys between pages, so rows appear twice or not
       at all while paging. */
    .order("excel_row_num", { ascending: true })
    .range(from, from + pageSize - 1);

  const { data, error, count } = await builder;
  if (error) throw new Error(describeRegisterError(error));

  return {
    rows: (data ?? []) as RegisterBookingRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Which columns hold data.
 *
 * ⚠️ This is what stops the interface hardcoding its own report list.
 * `commission_amount` is empty on all 6,626 rows today and is filled in
 * by hand through this very screen — a fixed chart list would show an
 * empty chart forever, or omit it forever. Charts and filters render
 * only where `filled > 0`, so a category appears the moment its column
 * starts being used.
 */
export async function fetchCoverage(): Promise<FieldCoverage[]> {
  const { data, error } = await registerDb()
    .from("register_field_coverage")
    .select("*");
  if (error) throw new Error(describeRegisterError(error));
  return (data ?? []) as FieldCoverage[];
}

/* ══════════════════════════════════════════════════════════════════
   READING MORE ROWS THAN THE SERVER WILL SEND AT ONCE

   ⚠️ PostgREST caps every response. Supabase's "Max rows" setting is
   1,000 out of the box, and it is applied SILENTLY — ask for 10,000
   and you get 1,000 with a 200 and no warning. Nothing about the
   response says it was cut.

   Every dropdown and every chart here is built by reducing rows in the
   browser, because PostgREST has no DISTINCT and no SUM. So a cap does
   not just shorten a list, it makes every figure wrong: a "total
   revenue" over the first 1,000 of 6,626 rows is not a total, and a
   properties dropdown built from them lists whichever properties
   happened to appear.

   Hence paging. The row count comes from the Content-Range header,
   which reports the TRUE total even when the body was capped, so the
   loop knows how many rows it is owed and cannot mistake a capped page
   for the last one.
   ══════════════════════════════════════════════════════════════════ */

/** Requested page size. The server may send fewer; the loop adapts. */
const PAGE = 1000;

/**
 * A ceiling, so a mis-set filter cannot walk a million-row table and
 * hang the browser. Comfortably above the register's 6,626.
 */
const MAX_ROWS = 60_000;

export interface AllRows {
  rows: Record<string, unknown>[];
  /** True when MAX_ROWS stopped the loop — anything derived is partial. */
  truncated: boolean;
  /** The register's true row count for these filters, per the server. */
  total: number;
}

/**
 * Every row matching the filters, paged past the server's cap.
 *
 * ⚠️ Ordered by `excel_row_num`. Paging without an ORDER BY is not a
 * smaller version of the right answer — Postgres may order two pages
 * differently, so rows come back twice or never. The column is unique
 * and never null, which is what makes it usable as the page key.
 */
async function fetchAllRows(select: string, q: RegisterQuery): Promise<AllRows> {
  const rows: Record<string, unknown>[] = [];
  let total = 0;
  let offset = 0;

  for (;;) {
    let builder = registerDb()
      .from("register_bookings")
      .select(select, { count: offset === 0 ? "exact" : undefined })
      .order("excel_row_num", { ascending: true });
    builder = applyFilters(builder, q);

    const { data, error, count } = await builder.range(offset, offset + PAGE - 1);
    if (error) throw new Error(describeRegisterError(error));

    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    if (offset === 0) total = count ?? batch.length;
    rows.push(...batch);

    /* An empty page means the end regardless of what the count said —
       rows can be deleted between requests. */
    if (!batch.length) break;
    offset += batch.length;
    if (rows.length >= total) break;
    if (rows.length >= MAX_ROWS) return { rows, truncated: true, total };
  }

  return { rows, truncated: false, total };
}

/** Distinct values in a column, most frequent first. */
export function distinctValues(
  rows: Record<string, unknown>[], field: string, limit: number,
): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[field] ?? "").trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

export interface FilterOptions {
  hotels: string[];
  bookers: string[];
  companies: string[];
}

/**
 * Everything the three dropdowns offer, in one pass over the register.
 *
 * ⚠️ Deliberately UNFILTERED. These are the choices available, not the
 * choices consistent with the current selection — narrowing them by the
 * active filter is how a dropdown loses the option you are trying to
 * switch to.
 *
 * ⚠️ One paged scan for all three, not three. Each is a walk over 6,626
 * rows, and the columns are cheap to carry together; separately this was
 * three times the requests for the same data.
 *
 * Reduced in the browser because PostgREST has no DISTINCT. Built from a
 * single capped page, as it was, the properties dropdown listed a
 * fraction of the 82 properties and companies a fraction of the 533 —
 * and a different fraction each load, there being no ORDER BY either.
 */
export async function fetchFilterOptions(): Promise<FilterOptions> {
  const { rows } = await fetchAllRows("hotel_name,booking_done_by,company_or_ta", {});
  return {
    hotels: distinctValues(rows, "hotel_name", 200),
    bookers: distinctValues(rows, "booking_done_by", 200),
    companies: distinctValues(rows, "company_or_ta", 600),
  };
}

/**
 * Saves one edit.
 *
 * ⚠️ Writes to `bookings`, never the view. `updated_at` is stamped by
 * the existing trigger, so nothing here sets it — doing so would fight
 * the database for the timestamp.
 */
export async function updateBooking(
  id: string,
  patch: Partial<Record<EditableField, string | number | null>>,
): Promise<RegisterBooking> {
  const { data, error } = await registerDb()
    .from("bookings")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(describeRegisterError(error));
  return data as RegisterBooking;
}

/* ── Reporting ─────────────────────────────────────────────────────
   Aggregated in Postgres over the WHOLE filtered register, not the
   page on screen. A chart of the current 50 rows would be a lie.     */

export interface Totals {
  bookings: number;
  revenue: number;
  roomNights: number;
  commission: number;
  cancelled: number;
  /**
   * ⚠️ NOT a money figure, and deliberately not summed.
   *
   * `amount_received` holds bank and UTR reference numbers alongside
   * real payments — 143 values exceed a crore and 302 are more than
   * five times their own booking's revenue, with the same number
   * repeated down several rows where the spreadsheet was filled down.
   * Summing it produced 1.37 QUADRILLION against 7.2 crore of revenue.
   *
   * Only the plausible ones are counted here, and only so the interface
   * can say how much of the column is unusable. Do not present this as
   * "money received".
   */
  receivedPlausible: number;
  receivedSuspect: number;
}

export function deriveTotals(rows: Record<string, unknown>[]): Totals {
  const totals: Totals = {
    bookings: 0, revenue: 0, roomNights: 0, commission: 0,
    cancelled: 0, receivedPlausible: 0, receivedSuspect: 0,
  };

  for (const r of rows) {
    const revenue = Number(r.total_revenue ?? 0);
    totals.bookings += 1;
    totals.revenue += revenue;
    totals.roomNights += Number(r.room_nights ?? 0);
    totals.commission += Number(r.commission_amount ?? 0);
    if (r.booking_status_normalised === "Cancelled") totals.cancelled += 1;

    /* A payment cannot sensibly exceed what the booking was worth. The
       ones that do are reference numbers, so they are counted, not
       added. 5% of slack covers rounding and small overpayments. */
    const received = r.amount_received === null ? null : Number(r.amount_received);
    if (received !== null && received > 0) {
      if (revenue > 0 && received <= revenue * 1.05) totals.receivedPlausible += received;
      else totals.receivedSuspect += 1;
    }
  }
  return totals;
}

export interface GroupedRow {
  label: string;
  bookings: number;
  revenue: number;
  roomNights: number;
}

/** Groups the filtered register by a column, for the bar charts. */
export function deriveGrouped(
  rows: Record<string, unknown>[],
  field: "hotel_name" | "booking_done_by" | "company_or_ta" | "meal_plan" | "occupancy_type",
  limit = 12,
): GroupedRow[] {
  const groups = new Map<string, GroupedRow>();
  for (const row of rows) {
    const label = String(row[field] ?? "").trim();
    if (!label) continue;
    const g = groups.get(label) ?? { label, bookings: 0, revenue: 0, roomNights: 0 };
    g.bookings += 1;
    g.revenue += Number(row.total_revenue ?? 0);
    g.roomNights += Number(row.room_nights ?? 0);
    groups.set(label, g);
  }
  return [...groups.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export interface MonthlyRow {
  month: string;
  bookings: number;
  revenue: number;
  roomNights: number;
}

export function deriveMonthly(
  rows: Record<string, unknown>[],
  dateField: "check_in_date" | "booking_date" = "check_in_date",
): MonthlyRow[] {
  const months = new Map<string, MonthlyRow>();
  for (const row of rows) {
    const raw = String(row[dateField] ?? "");
    if (raw.length < 7) continue;
    const month = raw.slice(0, 7);
    const m = months.get(month) ?? { month, bookings: 0, revenue: 0, roomNights: 0 };
    m.bookings += 1;
    m.revenue += Number(row.total_revenue ?? 0);
    m.roomNights += Number(row.room_nights ?? 0);
    months.set(month, m);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/* ══════════════════════════════════════════════════════════════════
   ONE SCAN, EVERY REPORT

   ⚠️ The Reports tab used to issue six independent full scans — totals,
   monthly, and one per bar chart — each capped at whatever the server
   would send. Six scans of the same rows to answer six questions about
   them, and paging each separately would have made that forty-two
   requests. It reads the filtered register once and folds it six ways.

   ⚠️ Shared with the totals cards above the tabs, on the same query
   key, so switching to Reports fetches nothing new.
   ══════════════════════════════════════════════════════════════════ */

/** The columns every report is built from. */
const REPORT_COLUMNS = [
  "total_revenue", "room_nights", "amount_received", "commission_amount",
  "booking_status_normalised",
  "hotel_name", "booking_done_by", "company_or_ta", "meal_plan", "occupancy_type",
  "check_in_date", "booking_date",
].join(",");

export interface RegisterReport {
  totals: Totals;
  rows: Record<string, unknown>[];
  /**
   * ⚠️ True when MAX_ROWS stopped the scan, so every figure below is
   * computed from part of the register. Surfaced, never swallowed: a
   * total that quietly describes some of the rows is worse than no
   * total, because it looks like an answer.
   */
  truncated: boolean;
  /** Rows matching the filters, per the server rather than per the fold. */
  total: number;
}

export async function fetchReport(q: RegisterQuery = {}): Promise<RegisterReport> {
  const { rows, truncated, total } = await fetchAllRows(REPORT_COLUMNS, q);
  return { totals: deriveTotals(rows), rows, truncated, total };
}
