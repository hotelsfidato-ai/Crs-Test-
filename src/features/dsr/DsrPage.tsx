import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useActor, useSession } from "@/lib/session";
import { adminRepo } from "@/data/repositories";
import { DSR_FIELD_ROLES, dayOfIso, isoOfDay, todayKey } from "@/lib/dsr";
import {
  Page, PageHeader, Button, NativeSelect, Segmented, DatePicker, DateRangePicker,
} from "@/components/ui";
import { DsrDayView } from "./DsrDayView";
import { DsrReportView } from "./DsrReportView";

/* ══════════════════════════════════════════════════════════════════
   DAILY SALES REPORT

   Replaces the DSR workbook — one per salesperson per month, a sheet a
   day, a row a visit. A salesperson opens it on today and logs as they
   go; the desk and managers pick a person and a day, or read a period.

   Laid out the way every other list screen is: the view switch and its
   controls as a toolbar inside the page header, then the figures as Stat
   cards, then the table. An earlier version put underline tabs beside
   boxed date inputs, which sat on different baselines and grew a
   scrollbar inside the tab strip.

   ⚠️ A salesperson only ever sees their own report. That is enforced by
   firestore.rules; the screen simply never offers anyone else, because a
   query for a colleague's report would be refused outright.

   The view, the day, the period and the person live in the address, so
   a manager can send "Haider, 14 July" as a link and Back behaves.
   ══════════════════════════════════════════════════════════════════ */

const ALL = "all";

type View = "day" | "period";

export default function DsrPage() {
  const actor = useActor();
  const role = useSession((s) => s.role);
  const [params, setParams] = useSearchParams();

  /* Anyone who is not a salesperson reads the whole team's reports. */
  const seesTeam = role !== "salesperson";
  const keepsOwn = DSR_FIELD_ROLES.includes(role);

  const staff = useQuery({
    queryKey: ["staff-directory"],
    queryFn: () => adminRepo.allUsers(),
    enabled: seesTeam,
    staleTime: 5 * 60_000,
  });

  const people = useMemo(
    () => (staff.data ?? [])
      .filter((u) => DSR_FIELD_ROLES.includes(u.role) && u.id !== actor.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [staff.data, actor.id],
  );

  const today = todayKey();
  const readDay = (key: string, fallback: number) => {
    const d = dayOfIso(params.get(key) ?? "");
    return Number.isNaN(d) ? fallback : d;
  };
  const day = readDay("day", today);
  const from = readDay("from", Math.floor(today / 100) * 100 + 1);
  const to = readDay("to", today);
  const view: View = params.get("view") === "period" ? "period" : "day";

  /* Whose report. A salesperson: always their own. Otherwise the address,
     defaulting to their own if they keep one, else the whole team. */
  const personId = !seesTeam ? actor.id : params.get("person") ?? (keepsOwn ? actor.id : ALL);
  const owner = personId === ALL
    ? null
    : personId === actor.id
      ? { id: actor.id, name: actor.name }
      : (() => {
          const u = people.find((p) => p.id === personId);
          return u ? { id: u.id, name: u.name } : null;
        })();

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  };

  const shiftDay = (by: number) => {
    const d = new Date(`${isoOfDay(day)}T12:00:00`);
    d.setDate(d.getDate() + by);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    update({ day: dayOfIso(iso) === today ? null : iso });
  };

  return (
    <Page>
      <PageHeader
        title="Daily sales report"
        description={
          seesTeam
            ? "Each salesperson's visits, day by day. Pick a person and a day, or read a period."
            : "Log each company you visit today. Entries lock when the day ends, and the CRS desk corrects past days."
        }
      >
        {/* The toolbar, as on every other list screen. */}
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={view}
            onChange={(v: View) => update({ view: v === "period" ? "period" : null })}
            options={[
              { value: "day", label: "Day" },
              { value: "period", label: "Period" },
            ]}
          />

          {view === "day" ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => shiftDay(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <DatePicker
                value={isoOfDay(day)}
                onChange={(v) => update({ day: dayOfIso(v) === today ? null : v })}
                className="w-44"
              />
              <Button variant="ghost" size="icon" aria-label="Next day" onClick={() => shiftDay(1)}>
                <ChevronRight className="size-4" />
              </Button>
              {day !== today && (
                <Button variant="ghost" size="sm" onClick={() => update({ day: null })}>
                  Today
                </Button>
              )}
            </div>
          ) : (
            <DateRangePicker
              from={isoOfDay(from)}
              to={isoOfDay(to)}
              onChange={(r) => update({ from: r.from ?? null, to: r.to ?? null })}
              className="w-72"
            />
          )}

          {seesTeam && (
            <NativeSelect
              aria-label="Whose report"
              value={personId}
              onChange={(e) => update({ person: e.target.value })}
              className="w-56"
            >
              <option value={ALL}>Everyone</option>
              {keepsOwn && <option value={actor.id}>{actor.name} (me)</option>}
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.status === "disabled" ? " (disabled)" : ""}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
      </PageHeader>

      {view === "period" ? (
        <DsrReportView
          from={from}
          to={to}
          ownerId={personId === ALL ? undefined : personId}
          showOwner={personId === ALL}
        />
      ) : owner ? (
        <DsrDayView day={day} owner={owner} />
      ) : personId === ALL ? (
        <DsrReportView
          from={day}
          to={day}
          showOwner
          note="Everyone's visits for this day. Choose a salesperson to add or correct entries."
        />
      ) : null}
    </Page>
  );
}
