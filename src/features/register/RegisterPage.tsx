import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table2, CalendarDays, BarChart3, BookOpen, AlertTriangle } from "lucide-react";
import {
  Page, PageHeader, Card, CardBody, Tabs, TabsList, TabsTrigger, TabsContent,
  Skeleton, Stat, StatusPill,
} from "@/components/ui";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { money, number } from "@/lib/format";
import { registerConfigured } from "./registerClient";
import { fetchCoverage, fetchTotals } from "./registerRepo";
import type { RegisterQuery } from "./types";
import { RegisterFilters } from "./RegisterFilters";
import { RegisterTable } from "./RegisterTable";
import { RegisterCalendar } from "./RegisterCalendar";
import { RegisterCharts } from "./RegisterCharts";

/* ══════════════════════════════════════════════════════════════════
   THE BOOKING REGISTER

   A self-contained module over its own Supabase project. It reads no
   Firestore data and shares no domain model with the CRS — a register
   entry is a historical record from a spreadsheet, not a Reservation.

   ⚠️ It is not fully disconnected, and cannot be. It uses the session
   to obtain the Firebase token that authorises every query, and the
   permission matrix to decide whether the screen renders at all.
   Access without identity is not a thing that exists.

   ⚠️ ACCESS IS DECIDED TWICE. The matrix decides whether this screen
   appears; the allowlist in the register's own project decides whether
   data comes back. They cannot see each other. Somebody named in one
   and not the other gets a working screen over an empty table, with no
   error — which is why the empty state below says so explicitly rather
   than showing a shrug.
   ══════════════════════════════════════════════════════════════════ */

export default function RegisterPage() {
  const role = useSession((s) => s.role);
  const mayEdit = can(role, "edit", "register");

  const [query, setQuery] = useState<RegisterQuery>({
    dateField: "check_in_date",
    sortBy: "check_in_date",
    sortDir: "desc",
    page: 1,
    pageSize: 50,
  });

  /* Which columns hold data. Everything downstream reads this rather
     than assuming a fixed set of reports. */
  const coverage = useQuery({
    queryKey: ["register-coverage"],
    queryFn: fetchCoverage,
    enabled: registerConfigured,
    staleTime: 5 * 60_000,
  });

  const totals = useQuery({
    queryKey: ["register-totals", query],
    queryFn: () => fetchTotals(query),
    enabled: registerConfigured,
  });

  /** A column with nothing in it gets no chart and no filter. */
  const filled = useMemo(() => {
    const set = new Set<string>();
    for (const row of coverage.data ?? []) if (row.filled > 0) set.add(row.field);
    return set;
  }, [coverage.data]);

  if (!registerConfigured) {
    return (
      <Page>
        <PageHeader title="Booking register" />
        <Card>
          <CardBody className="flex items-start gap-3">
            <AlertTriangle className="size-4 text-brand-orange shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-medium text-ink-900">Not configured</p>
              <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                Set <code>VITE_REGISTER_SUPABASE_URL</code> and{" "}
                <code>VITE_REGISTER_SUPABASE_KEY</code>, then rebuild.
              </p>
            </div>
          </CardBody>
        </Card>
      </Page>
    );
  }

  const t = totals.data;

  return (
    <Page>
      <PageHeader
        title="Booking register"
        description="The digitised booking register. Separate from CRS reservations — this is the historical record."
        badge={
          <StatusPill tone={mayEdit ? "success" : "neutral"} dot={false}>
            {mayEdit ? "Editable" : "Read only"}
          </StatusPill>
        }
      />

      {/* ⚠️ Totals reflect the FILTERS, not the page on screen. A figure
          that silently described 50 of 6,626 rows would be worse than
          no figure. */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat
            label="Bookings"
            value={totals.isLoading ? "…" : number(t?.bookings ?? 0)}
            hint="Matching the filters"
          />
        </Card>
        <Card className="p-5">
          <Stat label="Revenue" value={totals.isLoading ? "…" : money(t?.revenue ?? 0)} />
        </Card>
        <Card className="p-5">
          <Stat label="Room nights" value={totals.isLoading ? "…" : number(t?.roomNights ?? 0)} />
        </Card>
        <Card className="p-5">
          {/* ⚠️ Falls back to Cancelled, NOT to amount_received.
              Commission is empty on every row, and a ₹0 would read as
              "we earned nothing" rather than "not recorded yet".

              The obvious substitute — money received — is unusable:
              that column holds bank and UTR reference numbers mixed in
              with real payments, and summing it gave 1.37 quadrillion
              against 7.2 crore of revenue. Cancellations come from a
              clean column and are worth an owner's attention anyway. */}
          <Stat
            label={filled.has("commission_amount") ? "Commission" : "Cancelled"}
            value={
              totals.isLoading
                ? "…"
                : filled.has("commission_amount")
                  ? money(t?.commission ?? 0)
                  : number(t?.cancelled ?? 0)
            }
            hint={
              filled.has("commission_amount")
                ? undefined
                : t && t.bookings > 0
                  ? `${Math.round((t.cancelled / t.bookings) * 100)}% of these bookings`
                  : "Commission not recorded yet"
            }
          />
        </Card>
      </div>

      <RegisterFilters query={query} onChange={setQuery} filled={filled} />

      <Tabs defaultValue="table" className="mt-6">
        <TabsList>
          <TabsTrigger value="table">
            <Table2 className="size-3.5 mr-1.5" />
            Table
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarDays className="size-3.5 mr-1.5" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="charts">
            <BarChart3 className="size-3.5 mr-1.5" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table">
          <RegisterTable query={query} onChange={setQuery} mayEdit={mayEdit} />
        </TabsContent>

        <TabsContent value="calendar">
          <RegisterCalendar query={query} onChange={setQuery} />
        </TabsContent>

        <TabsContent value="charts">
          {coverage.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <RegisterCharts query={query} filled={filled} coverage={coverage.data ?? []} />
          )}
        </TabsContent>
      </Tabs>

      <p className="flex items-start gap-2 text-xs text-grey-400 mt-6 leading-relaxed">
        <BookOpen className="size-3.5 shrink-0 mt-px" />
        Held in a separate database from the rest of the platform and not linked to CRS
        reservations. Reports appear for a column once it holds data, so filling one in
        adds its chart without a change here.
      </p>
    </Page>
  );
}
