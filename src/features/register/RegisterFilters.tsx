import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Card, CardBody, Input, NativeSelect, Button, Checkbox } from "@/components/ui";
import { fetchFilterOptions } from "./registerRepo";
import type { RegisterQuery } from "./types";

/* ══════════════════════════════════════════════════════════════════
   FILTERS

   ⚠️ A filter appears only if its column holds data — `filled` comes
   from register_field_coverage. Offering a "TAC status" dropdown over
   a column that is null on all 6,626 rows would be a control that
   silently returns nothing.

   ⚠️ payment_status and invoice_status are deliberately NOT dropdowns.
   They read like statuses but hold free text — 868 and 733 distinct
   values, things like "Payment Received on 02 April (RTGS-…)". A
   dropdown of 868 sentences is not a filter. The search box covers
   them instead.
   ══════════════════════════════════════════════════════════════════ */

export function RegisterFilters({
  query, onChange, filled,
}: {
  query: RegisterQuery;
  onChange: (q: RegisterQuery) => void;
  filled: Set<string>;
}) {
  const set = (patch: Partial<RegisterQuery>) =>
    onChange({ ...query, ...patch, page: 1 });

  /* Low-cardinality columns only — 82 hotels, 15 bookers, 533
     companies. Cached hard: they change when the register is
     re-imported, not while somebody is looking at it.

     ⚠️ One query for all three. They come from a single scan of the
     register, so splitting them into three react-query entries meant
     three scans of the same rows. */
  const options = useQuery({
    queryKey: ["register-filter-options"],
    queryFn: fetchFilterOptions,
    staleTime: 10 * 60_000,
  });
  const hotels = options.data?.hotels ?? [];
  const bookers = options.data?.bookers ?? [];
  const companies = options.data?.companies ?? [];

  const active =
    query.search || query.hotel || query.bookedBy || query.company ||
    query.status || query.from || query.to || query.hideBlank;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search guest, company, hotel, reference…"
            value={query.search ?? ""}
            onChange={(e) => set({ search: e.target.value })}
          />

          {filled.has("hotel_name") && (
            <NativeSelect
              value={query.hotel ?? ""}
              onChange={(e) => set({ hotel: e.target.value || undefined })}
            >
              <option value="">All properties</option>
              {hotels.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </NativeSelect>
          )}

          {filled.has("booking_done_by") && (
            <NativeSelect
              value={query.bookedBy ?? ""}
              onChange={(e) => set({ bookedBy: e.target.value || undefined })}
            >
              <option value="">Anyone</option>
              {bookers.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </NativeSelect>
          )}

          {filled.has("company_or_ta") && (
            <NativeSelect
              value={query.company ?? ""}
              onChange={(e) => set({ company: e.target.value || undefined })}
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </NativeSelect>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 items-center">
          {filled.has("booking_status") && (
            <NativeSelect
              value={query.status ?? ""}
              onChange={(e) => set({ status: e.target.value || undefined })}
            >
              {/* Reads the folded column, so one option catches the 563
                  rows spelled four different ways. */}
              <option value="">Any status</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Cancelled">Cancelled</option>
            </NativeSelect>
          )}

          <NativeSelect
            value={query.dateField ?? "check_in_date"}
            onChange={(e) =>
              set({ dateField: e.target.value as RegisterQuery["dateField"] })
            }
          >
            <option value="check_in_date">Dates: check-in</option>
            <option value="booking_date">Dates: booked on</option>
          </NativeSelect>

          <Input
            type="date"
            value={query.from ?? ""}
            onChange={(e) => set({ from: e.target.value || undefined })}
          />
          <Input
            type="date"
            value={query.to ?? ""}
            onChange={(e) => set({ to: e.target.value || undefined })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          {/* ⚠️ Shown, not hidden, by default — 1,657 rows are entirely
              blank and the row count is expected to match the
              spreadsheet. This is the opt-out. */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <Checkbox
              checked={Boolean(query.hideBlank)}
              onCheckedChange={(v) => set({ hideBlank: Boolean(v) || undefined })}
            />
            <span className="text-sm text-grey-600">
              Hide the 1,657 blank spreadsheet rows
            </span>
          </label>

          {active && (
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<X className="size-3.5" />}
              onClick={() =>
                onChange({
                  dateField: query.dateField,
                  sortBy: query.sortBy,
                  sortDir: query.sortDir,
                  page: 1,
                  pageSize: query.pageSize,
                })
              }
            >
              Clear filters
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
