import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, X, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Card, CardBody, Button, Input, Pagination, Skeleton, EmptyState,
  StatusPill, toast, Dialog, DialogContent, DialogClose, Field,
} from "@/components/ui";
import { money } from "@/lib/format";
import { fetchRegister, updateBooking } from "./registerRepo";
import {
  EDITABLE_FIELDS, NUMERIC_FIELDS, DATE_FIELDS, FIELD_LABELS,
  type RegisterQuery, type RegisterBookingRow,
} from "./types";

/* ══════════════════════════════════════════════════════════════════
   THE REGISTER TABLE

   ⚠️ Server-paged. 6,626 rows with 36 columns is far too much to hold
   in a browser, and every filter change re-queries rather than
   re-filtering in memory.

   ⚠️ Edits write to `bookings`, never to the view that is read. The
   folded status column is derived — writing it back would overwrite
   what somebody actually typed with our tidied version of it.
   ══════════════════════════════════════════════════════════════════ */

/** The columns worth showing inline. The rest live in the row editor. */
const COLUMNS: { field: keyof RegisterBookingRow; align?: "right" }[] = [
  { field: "check_in_date" },
  { field: "guest_name" },
  { field: "hotel_name" },
  { field: "company_or_ta" },
  { field: "booking_done_by" },
  { field: "num_rooms", align: "right" },
  { field: "room_nights", align: "right" },
  { field: "total_revenue", align: "right" },
  { field: "booking_status" },
];

export function RegisterTable({
  query, onChange, mayEdit, filled,
}: {
  query: RegisterQuery;
  onChange: (q: RegisterQuery) => void;
  mayEdit: boolean;
  filled: Set<string>;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RegisterBookingRow | null>(null);

  const page = useQuery({
    queryKey: ["register-rows", query],
    queryFn: () => fetchRegister(query),
  });

  const columns = COLUMNS.filter((c) => filled.has(c.field as string) || c.field === "check_in_date");

  const sortBy = (field: keyof RegisterBookingRow) => {
    const same = query.sortBy === field;
    onChange({
      ...query,
      sortBy: field as RegisterQuery["sortBy"],
      sortDir: same && query.sortDir === "desc" ? "asc" : "desc",
      page: 1,
    });
  };

  if (page.isLoading) return <Skeleton className="h-96 w-full mt-4" />;

  if (page.error) {
    return (
      <Card className="mt-4 border-brand-red-100 bg-brand-red-50">
        <CardBody>
          <p className="text-base font-medium text-brand-red">Could not load the register</p>
          <p className="text-sm text-brand-red mt-1 leading-relaxed">
            {(page.error as Error).message}
          </p>
        </CardBody>
      </Card>
    );
  }

  const rows = page.data?.rows ?? [];

  return (
    <>
      <Card className="mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet />}
            title="Nothing matches"
            description="No entries match the current filters. Widen them, or clear them to see the whole register."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-grey-50 border-b border-grey-200">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.field}
                      onClick={() => sortBy(c.field)}
                      className={cn(
                        "px-3 py-2.5 font-semibold text-2xs uppercase tracking-wide text-grey-500",
                        "cursor-pointer select-none hover:text-ink-900 whitespace-nowrap",
                        c.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {FIELD_LABELS[c.field as string] ?? c.field}
                      {query.sortBy === c.field && (query.sortDir === "asc" ? " ↑" : " ↓")}
                    </th>
                  ))}
                  {mayEdit && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-grey-100 last:border-b-0 hover:bg-grey-50",
                      /* A blank spreadsheet row is shown, as asked, but
                         muted so it cannot be mistaken for a booking. */
                      row.is_blank_row && "opacity-40",
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.field}
                        className={cn(
                          "px-3 py-2.5 text-ink-900",
                          c.align === "right" ? "text-right tabular" : "text-left",
                        )}
                      >
                        {renderCell(row, c.field)}
                      </td>
                    ))}
                    {mayEdit && (
                      <td className="px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(row)}
                          aria-label={`Edit ${row.guest_name ?? "row"}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {page.data && page.data.total > 0 && (
        <Pagination
          className="mt-4"
          page={page.data.page}
          pageSize={page.data.pageSize}
          total={page.data.total}
          onPageChange={(p) => onChange({ ...query, page: p })}
        />
      )}

      {editing && (
        <RowEditor
          row={editing}
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["register-rows"] });
            void queryClient.invalidateQueries({ queryKey: ["register-totals"] });
            /* Coverage can change on the first edit of an empty column
               — filling one commission turns its chart on. */
            void queryClient.invalidateQueries({ queryKey: ["register-coverage"] });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function renderCell(row: RegisterBookingRow, field: keyof RegisterBookingRow) {
  const value = row[field];
  if (value === null || value === undefined || value === "") {
    return <span className="text-grey-300">—</span>;
  }
  if (field === "total_revenue") return money(Number(value));
  if (field === "booking_status") {
    const folded = row.booking_status_normalised;
    return (
      <StatusPill tone={folded === "Cancelled" ? "danger" : "success"} dot={false}>
        {String(value)}
      </StatusPill>
    );
  }
  return String(value);
}

/* ── Row editor ────────────────────────────────────────────────────
   36 columns will not fit inline, so editing happens here. Saves the
   whole patch at once rather than field-by-field: a register entry is
   corrected as a unit, and one request beats thirty.                */

function RowEditor({
  row, open, onClose, onSaved,
}: {
  row: RegisterBookingRow;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      EDITABLE_FIELDS.map((f) => [f, row[f] === null || row[f] === undefined ? "" : String(row[f])]),
    ),
  );

  const save = useMutation({
    mutationFn: () => {
      /* ⚠️ Only what changed. Sending every field would rewrite all 31
         columns on each save, stamping updated_at and clobbering any
         edit somebody else made to a field this person never touched. */
      const patch: Record<string, string | number | null> = {};
      for (const f of EDITABLE_FIELDS) {
        const before = row[f] === null || row[f] === undefined ? "" : String(row[f]);
        const after = draft[f] ?? "";
        if (before === after) continue;

        patch[f] =
          after === ""
            ? null
            : NUMERIC_FIELDS.has(f)
              ? Number(after)
              : after;
      }
      if (Object.keys(patch).length === 0) return Promise.resolve(null as never);
      return updateBooking(row.id, patch as never);
    },
    onSuccess: (result) => {
      toast.success(result ? "Entry updated" : "Nothing changed", row.guest_name ?? row.id);
      onSaved();
    },
    onError: (error) =>
      toast.error("Could not save", (error as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={row.guest_name || "Register entry"}
        description={`${row.sheet_name} · row ${row.excel_row_num}`}
        size="xl"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost" leadingIcon={<X className="size-4" />}>Cancel</Button>
            </DialogClose>
            <Button
              leadingIcon={<Check className="size-4" />}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
          {EDITABLE_FIELDS.map((f) => (
            <Field key={f} label={FIELD_LABELS[f] ?? f}>
              {({ id }) => (
                <Input
                  id={id}
                  type={DATE_FIELDS.has(f) ? "date" : NUMERIC_FIELDS.has(f) ? "number" : "text"}
                  value={draft[f] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                />
              )}
            </Field>
          ))}
        </div>

        <p className="text-xs text-grey-500 mt-4 leading-relaxed">
          Saves only the fields you changed. The entry keeps its link to
          {" "}<strong>{row.sheet_name}</strong> row {row.excel_row_num}, so the next
          import can still match it.
        </p>
      </DialogContent>
    </Dialog>
  );
}
