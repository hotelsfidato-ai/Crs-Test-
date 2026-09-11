import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Papa from "papaparse";
import { ClipboardList, Download } from "lucide-react";
import { dsrRepo } from "@/data/repositories";
import { VISIT_TYPE_LABELS, VISIT_TYPE_TONES, isoOfDay } from "@/lib/dsr";
import { dateShort, number } from "@/lib/format";
import { triggerDownload } from "@/features/import/engine";
import {
  Card, CardHeader, CardBody, Button, StatusPill, EmptyState, Stat, DataTable, type Column,
} from "@/components/ui";
import type { DsrVisit } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   THE DSR OVER A PERIOD

   What the monthly workbook was: every visit between two dates, for
   one salesperson or the whole team, and a download in the workbook's
   own columns.

   ⚠️ ONE table, not a card per day. Separate tables each sized their
   own columns, so the visit type and the remarks started at a different
   place on every day and nothing lined up down the page. The date is a
   column instead, and the day's notes have a card of their own.

   ⚠️ Bounded by dsrRepo (1,500 visits). A month of the whole team sits
   far below that; if a range ever reaches it, the screen says so rather
   than presenting part of a month as the whole.
   ══════════════════════════════════════════════════════════════════ */

const RANGE_LIMIT = 1500;

export function DsrReportView({
  from, to, ownerId, showOwner, note,
}: {
  from: number;
  to: number;
  /** Undefined means everyone. */
  ownerId?: string;
  /** A Salesperson column, when the report spans more than one person. */
  showOwner: boolean;
  /** A line above the figures, when the view needs explaining. */
  note?: string;
}) {
  const navigate = useNavigate();
  const valid = from > 0 && to > 0 && from <= to;

  const visits = useQuery({
    queryKey: ["dsr-range", from, to, ownerId ?? "all"],
    queryFn: () => dsrRepo.range(from, to, ownerId),
    enabled: valid,
  });
  const notes = useQuery({
    queryKey: ["dsr-range-notes", from, to, ownerId ?? "all"],
    queryFn: () => dsrRepo.dayNotes(from, to, ownerId),
    enabled: valid,
  });

  const rows = useMemo(() => visits.data ?? [], [visits.data]);
  const dayNotes = useMemo(
    () => (notes.data ?? []).filter((n) => n.accompaniedBy || n.notes),
    [notes.data],
  );

  const figures = useMemo(() => {
    const companies = new Set(rows.map((v) => v.companyId)).size;
    const days = new Set(rows.map((v) => `${v.day}|${v.ownerId}`)).size;
    const count = (t: DsrVisit["visitType"]) => rows.filter((v) => v.visitType === t).length;
    return {
      companies,
      days,
      introductions: count("introduction"),
      courtesy: count("courtesy"),
      notMet: count("not_met"),
    };
  }, [rows]);

  /* Sr. No. restarts each day and each person, as on the sheet. */
  const serial = useMemo(() => {
    const seq = new Map<string, number>();
    const out = new Map<string, number>();
    for (const v of rows) {
      const k = `${v.day}|${v.ownerId}`;
      const n = (seq.get(k) ?? 0) + 1;
      seq.set(k, n);
      out.set(v.id, n);
    }
    return out;
  }, [rows]);

  const columns: Column<DsrVisit>[] = [
    {
      key: "day", header: "Date", width: "112px",
      cell: (v) => <span className="tabular whitespace-nowrap">{dateShort(isoOfDay(v.day))}</span>,
    },
    ...(showOwner
      ? [{ key: "ownerName", header: "Salesperson", width: "150px", cell: (v: DsrVisit) => v.ownerName }]
      : []),
    {
      key: "serial", header: "#", width: "44px", numeric: true,
      cell: (v) => <span className="text-grey-500">{serial.get(v.id)}</span>,
    },
    {
      key: "companyName", header: "Company", width: "26%",
      cell: (v) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 truncate">{v.companyName}</p>
          <p className="text-sm text-grey-500 truncate">
            {[v.contactPerson, v.phone].filter(Boolean).join(" · ") || "No contact recorded"}
          </p>
        </div>
      ),
    },
    { key: "area", header: "Area", width: "110px", hideBelow: "lg", cell: (v) => v.area || <Empty /> },
    {
      key: "visitType", header: "Visit", width: "170px",
      cell: (v) => (
        <StatusPill tone={VISIT_TYPE_TONES[v.visitType]} dot={false}>
          {VISIT_TYPE_LABELS[v.visitType]}
        </StatusPill>
      ),
    },
    {
      key: "remarks", header: "Remarks",
      cell: (v) => <span className="text-grey-700">{v.remarks || <Empty />}</span>,
    },
  ];

  const exportCsv = () => {
    /* The workbook's own columns, plus the two the system adds. */
    const csv = Papa.unparse({
      fields: [
        "Date", ...(showOwner ? ["Salesperson"] : []), "Sr. No", "Name of the Company",
        "Contact Person", "Contact no.", "Email.Id", "Area", "Visit type", "Remarks",
      ],
      data: rows.map((v) => [
        isoOfDay(v.day), ...(showOwner ? [v.ownerName] : []), serial.get(v.id), v.companyName,
        v.contactPerson, v.phone, v.email, v.area, VISIT_TYPE_LABELS[v.visitType], v.remarks,
      ]),
    });
    const who = ownerId ? (rows[0]?.ownerName ?? "salesperson") : "team";
    triggerDownload(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
      `DSR-${who.replace(/[^A-Za-z0-9]+/g, "-")}-${isoOfDay(from)}-to-${isoOfDay(to)}.csv`,
    );
  };

  if (!valid) {
    return <p className="text-sm text-brand-red">Choose a start date on or before the end date.</p>;
  }

  return (
    <>
      {note && <p className="text-sm text-grey-500 mb-4">{note}</p>}

      {/* The figures, as Stat cards like every other report. */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat
            label="Visits"
            value={visits.isLoading ? "…" : number(rows.length)}
            hint={`${number(figures.days)} working day${figures.days === 1 ? "" : "s"}`}
          />
        </Card>
        <Card className="p-5">
          <Stat label="Companies" value={visits.isLoading ? "…" : number(figures.companies)} />
        </Card>
        <Card className="p-5">
          <Stat label="Introductions" value={visits.isLoading ? "…" : number(figures.introductions)} hint="New contacts" />
        </Card>
        <Card className="p-5">
          <Stat
            label="Courtesy visits"
            value={visits.isLoading ? "…" : number(figures.courtesy)}
            hint={figures.notMet ? `${number(figures.notMet)} could not meet` : "Brand recall"}
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Visits"
          description={`${dateShort(isoOfDay(from))} to ${dateShort(isoOfDay(to))}`}
          actions={
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Download className="size-3.5" />}
              disabled={!rows.length}
              onClick={exportCsv}
            >
              Download
            </Button>
          }
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(v) => v.id}
          loading={visits.isLoading}
          error={visits.error}
          onRetry={() => void visits.refetch()}
          onRowClick={(v) => navigate(`/crm/companies/${v.companyId}`)}
          stickyHeader={false}
          empty={
            <EmptyState
              compact
              icon={<ClipboardList />}
              title="No visits logged"
              description="Nothing was logged in this period."
            />
          }
        />
        {rows.length >= RANGE_LIMIT && (
          <CardBody className="border-t border-grey-200">
            <p className="text-sm text-[#8a6300]">
              This period holds more than {number(RANGE_LIMIT)} visits, so only the first{" "}
              {number(RANGE_LIMIT)} are shown. Narrow the dates or choose one salesperson.
            </p>
          </CardBody>
        )}
      </Card>

      {dayNotes.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Notes for the day" description="Joint visits, other work, and days without visits." />
          <CardBody className="pt-0">
            <ul className="divide-y divide-grey-100">
              {dayNotes.map((n) => (
                <li key={n.id} className="py-3 first:pt-0 last:pb-0 grid gap-1 sm:grid-cols-[112px_1fr] sm:gap-4">
                  <p className="text-sm text-grey-500 tabular">
                    {dateShort(isoOfDay(n.day))}
                    {showOwner && <span className="block">{n.ownerName}</span>}
                  </p>
                  <div className="text-base text-grey-700 space-y-1">
                    {n.accompaniedBy && (
                      <p><span className="text-grey-500">Went with</span> {n.accompaniedBy}</p>
                    )}
                    {n.notes && <p className="whitespace-pre-line">{n.notes}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}

/** An empty cell. A hyphen, in the tertiary grey — not an em dash. */
export function Empty() {
  return <span className="text-grey-300">-</span>;
}
