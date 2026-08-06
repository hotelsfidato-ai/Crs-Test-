/* ══════════════════════════════════════════════════════════════════
   THE BOOKING REGISTER

   Typed from the live schema of `public.bookings`. Every column is
   nullable except the identity ones, because the source is a
   spreadsheet — 1,657 of the 6,626 rows are entirely blank, and most
   of the rest have gaps.

   ⚠️ Nothing here imports from @/data/types. This module shares no
   domain model with the CRS: a `booking` here is a historical register
   entry, not a `Reservation`, and the two must not be conflated because
   they will disagree.
   ══════════════════════════════════════════════════════════════════ */

export interface RegisterBooking {
  id: string;

  /* Who took it */
  booking_done_by: string | null;
  booker_name: string | null;
  booker_contact_no: string | null;
  booker_email: string | null;

  /* Guest */
  guest_name: string | null;
  guest_contact_number: string | null;
  company_or_ta: string | null;

  /* References */
  hotel_conf_no: string | null;
  fidato_conf_no: string | null;

  /* Dates */
  booking_date: string | null;
  check_in_date: string | null;
  check_out_date: string | null;

  /* Stay */
  hotel_name: string | null;
  num_rooms: number | null;
  num_nights: number | null;
  room_nights: number | null;
  occupancy_type: string | null;
  meal_plan: string | null;

  /* Money */
  room_rate: number | null;
  total_revenue: number | null;
  amount_received: number | null;
  commission_amount: number | null;

  /* Status — free text, as typed. See the note on RegisterFilters. */
  booking_status: string | null;
  amendment_notes: string | null;
  payment_type: string | null;
  payment_status: string | null;
  invoice_status: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_sent_status: string | null;
  tac_status: string | null;

  /* Provenance from the spreadsheet */
  sheet_name: string;
  excel_row_num: number;
  created_at: string;
  updated_at: string;
}

/**
 * The view the screen reads. Adds a folded status and a blank-row flag.
 *
 * ⚠️ Reads come from `register_bookings`, writes go to `bookings`. The
 * view is not updatable and never should be — `booking_status_normalised`
 * is derived, and writing to it would silently discard what was typed.
 */
export interface RegisterBookingRow extends RegisterBooking {
  /** "CAncelled", "Cancellec" and "cancelled" all fold to "Cancelled". */
  booking_status_normalised: string | null;
  /** No guest, no hotel, no dates. 1,657 of them. */
  is_blank_row: boolean;
}

/** One row of `register_field_coverage`. Drives which reports exist. */
export interface FieldCoverage {
  field: string;
  filled: number;
  distinct_values: number;
  total: number;
  pct_filled: number;
}

export interface RegisterQuery {
  search?: string;
  hotel?: string;
  bookedBy?: string;
  company?: string;
  status?: string;
  /** Which date the range applies to — the calendar toggles this too. */
  dateField?: "check_in_date" | "booking_date";
  from?: string;
  to?: string;
  /** Blank spreadsheet rows are shown by default, as asked. */
  hideBlank?: boolean;
  sortBy?: keyof RegisterBooking;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface RegisterPage {
  rows: RegisterBookingRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Editable columns.
 *
 * ⚠️ Deliberately excludes `sheet_name`, `excel_row_num`, `id` and the
 * timestamps. Those tie a row back to its line in the spreadsheet, and
 * losing that link means the next import cannot tell an edited row from
 * a new one.
 */
export const EDITABLE_FIELDS = [
  "booking_done_by", "booker_name", "booker_contact_no", "booker_email",
  "guest_name", "guest_contact_number", "company_or_ta",
  "hotel_conf_no", "fidato_conf_no",
  "booking_date", "check_in_date", "check_out_date",
  "hotel_name", "num_rooms", "num_nights", "room_nights",
  "occupancy_type", "meal_plan",
  "room_rate", "total_revenue", "amount_received", "commission_amount",
  "booking_status", "amendment_notes",
  "payment_type", "payment_status",
  "invoice_status", "invoice_number", "invoice_amount", "invoice_sent_status",
  "tac_status",
] as const satisfies readonly (keyof RegisterBooking)[];

export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** Which editable fields are numeric, so the input can coerce properly. */
export const NUMERIC_FIELDS: ReadonlySet<string> = new Set([
  "num_rooms", "num_nights", "room_nights",
  "room_rate", "total_revenue", "amount_received",
  "commission_amount", "invoice_amount",
]);

export const DATE_FIELDS: ReadonlySet<string> = new Set([
  "booking_date", "check_in_date", "check_out_date",
]);

export const FIELD_LABELS: Record<string, string> = {
  booking_done_by: "Booked by",
  booker_name: "Booker",
  booker_contact_no: "Booker phone",
  booker_email: "Booker email",
  guest_name: "Guest",
  guest_contact_number: "Guest phone",
  company_or_ta: "Company / TA",
  hotel_conf_no: "Hotel conf. no.",
  fidato_conf_no: "Fidato conf. no.",
  booking_date: "Booked on",
  check_in_date: "Check in",
  check_out_date: "Check out",
  hotel_name: "Hotel",
  num_rooms: "Rooms",
  num_nights: "Nights",
  room_nights: "Room nights",
  occupancy_type: "Occupancy",
  meal_plan: "Meal plan",
  room_rate: "Room rate",
  total_revenue: "Revenue",
  amount_received: "Received",
  commission_amount: "Commission",
  booking_status: "Status",
  amendment_notes: "Amendments",
  payment_type: "Payment type",
  payment_status: "Payment notes",
  invoice_status: "Invoice notes",
  invoice_number: "Invoice no.",
  invoice_amount: "Invoice amount",
  invoice_sent_status: "Invoice sent",
  tac_status: "TAC",
  sheet_name: "Sheet",
  excel_row_num: "Excel row",
};
