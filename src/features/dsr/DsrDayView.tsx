import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Lock, Pencil, Trash2 } from "lucide-react";
import { useActor, useSession } from "@/lib/session";
import { dsrRepo, type DsrOwner, type DsrVisitInput } from "@/data/repositories";
import {
  VISIT_TYPES, VISIT_TYPE_LABELS, VISIT_TYPE_TONES, canChangeDsr, whyLocked,
} from "@/lib/dsr";
import {
  Card, CardHeader, CardBody, CardFooter, Button, Field, Input, Textarea, NativeSelect,
  StatusPill, EmptyState, Tooltip, DataTable, toast, describeError, type Column,
} from "@/components/ui";
import { Empty } from "./DsrReportView";
import { CompanySearch, type CompanyPick } from "./CompanySearch";
import type { DsrVisit, VisitType } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   ONE DAY OF A DSR

   The sheet's table — Sr. No, company, contact person, number, email,
   area, remarks — with a visit type added, then the form that adds a
   row, then what the sheet kept outside its rows: who they went out
   with, and on a day with no visits, why and what they did instead.

   ⚠️ Whether anything here is editable comes from canChangeDsr, which
   mirrors firestore.rules. The screen hides what the database refuses;
   it does not decide it.
   ══════════════════════════════════════════════════════════════════ */

const BLANK = {
  contactPerson: "", phone: "", email: "", area: "",
  visitType: "introduction" as VisitType, remarks: "",
};

export function DsrDayView({ day, owner }: { day: number; owner: DsrOwner }) {
  const actor = useActor();
  const role = useSession((s) => s.role);
  const queryClient = useQueryClient();
  const editable = canChangeDsr(role, actor.id, owner.id, day);

  const visits = useQuery({
    queryKey: ["dsr-day", day, owner.id],
    queryFn: () => dsrRepo.day(day, owner.id),
  });

  /* ── The visit form ── */
  const [editing, setEditing] = useState<DsrVisit | null>(null);
  const [company, setCompany] = useState<CompanyPick>({ companyName: "" });
  const [fields, setFields] = useState(BLANK);
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<typeof BLANK>) => setFields((f) => ({ ...f, ...patch }));

  const resetForm = () => {
    setEditing(null);
    setCompany({ companyName: "" });
    setFields(BLANK);
    setTried(false);
  };
  // A different day or person is a different sheet.
  useEffect(resetForm, [day, owner.id]);

  const startEdit = (v: DsrVisit) => {
    setEditing(v);
    setCompany({ companyId: v.companyId, companyName: v.companyName });
    setFields({
      contactPerson: v.contactPerson, phone: v.phone, email: v.email,
      area: v.area, visitType: v.visitType, remarks: v.remarks,
    });
    setTried(false);
  };

  const save = useMutation({
    mutationFn: () => {
      const input: DsrVisitInput = {
        id: editing?.id,
        day,
        companyId: company.companyId,
        companyName: company.companyName,
        ...fields,
      };
      return dsrRepo.saveVisit(input, owner, actor);
    },
    onSuccess: ({ createdCompany }) => {
      queryClient.invalidateQueries({ queryKey: ["dsr-day", day, owner.id] });
      queryClient.invalidateQueries({ queryKey: ["dsr-range"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(
        editing ? "Visit updated" : "Visit added",
        createdCompany ? `${createdCompany.name} was new, so it has been added to Companies.` : undefined,
      );
      resetForm();
    },
    onError: (error) => {
      const d = describeError(error);
      toast.error(d.title ?? "Could not save the visit", d.message ?? "Try again.");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => dsrRepo.removeVisit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dsr-day", day, owner.id] });
      queryClient.invalidateQueries({ queryKey: ["dsr-range"] });
      toast.success("Visit deleted");
    },
    onError: (error) => {
      const d = describeError(error);
      toast.error(d.title ?? "Could not delete", d.message ?? "Try again.");
    },
  });

  /* Picking a company offers its primary contact, if the fields are empty. */
  const pickCompany = (next: CompanyPick) => {
    setCompany(next);
    const primary = next.company?.contacts[0];
    if (primary && !fields.contactPerson && !fields.phone && !fields.email) {
      set({ contactPerson: primary.name, phone: primary.phone, email: primary.email });
    }
    if (next.company && !fields.area && next.company.address) set({ area: next.company.address });
  };

  const rows = useMemo(() => visits.data ?? [], [visits.data]);
  const counts = useMemo(() => {
    const c = new Map<VisitType, number>();
    for (const v of rows) c.set(v.visitType, (c.get(v.visitType) ?? 0) + 1);
    return c;
  }, [rows]);

  const columns: Column<DsrVisit>[] = [
    {
      key: "serial", header: "#", width: "44px", numeric: true,
      cell: (_v, i) => <span className="text-grey-500">{i + 1}</span>,
    },
    {
      key: "companyName", header: "Company", width: "26%",
      cell: (v) => (
        <div className="min-w-0">
          <Link
            to={`/crm/companies/${v.companyId}`}
            className="block font-medium text-ink-900 hover:text-brand-orange truncate"
          >
            {v.companyName}
          </Link>
          <p className="text-sm text-grey-500 truncate">
            {[v.contactPerson, v.phone].filter(Boolean).join(" · ") || "No contact recorded"}
          </p>
        </div>
      ),
    },
    {
      key: "email", header: "Email", width: "200px", hideBelow: "xl",
      cell: (v) => (v.email ? <span className="block truncate">{v.email}</span> : <Empty />),
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
    {
      key: "actions", header: "", width: "88px", numeric: true,
      cell: (v) =>
        editable ? (
          <span className="inline-flex gap-1">
            <Button variant="ghost" size="icon" aria-label={`Edit visit to ${v.companyName}`} onClick={() => startEdit(v)}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete visit to ${v.companyName}`}
              loading={remove.isPending && remove.variables === v.id}
              onClick={() => {
                if (window.confirm(`Delete the visit to ${v.companyName}?`)) remove.mutate(v.id);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </span>
        ) : (
          <Tooltip content={whyLocked(role, actor.id, owner.id)}>
            <span className="inline-flex text-grey-300" aria-label="Locked">
              <Lock className="size-4" />
            </span>
          </Tooltip>
        ),
    },
  ];

  const companyMissing = tried && !company.companyName.trim();

  return (
    <div className="space-y-6">
      {/* ── The day's visits ── the same table, column for column, as the
          Period view, so the two read as one screen. */}
      <Card>
        <CardHeader
          title="Visits"
          description={
            rows.length
              ? VISIT_TYPES.filter((t) => counts.get(t))
                  .map((t) => `${counts.get(t)} ${VISIT_TYPE_LABELS[t].toLowerCase()}`)
                  .join(" · ")
              : undefined
          }
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(v) => v.id}
          loading={visits.isLoading}
          error={visits.error}
          onRetry={() => void visits.refetch()}
          stickyHeader={false}
          empty={
            <EmptyState
              compact
              icon={<ClipboardList />}
              title="No visits logged"
              description={
                editable
                  ? "Add each company you visit below. On a day with no visits, say why in the notes."
                  : "Nothing was logged for this day."
              }
            />
          }
        />
      </Card>

      {/* ── Add or correct a visit ── */}
      {editable ? (
        <Card className={editing ? "border-brand-orange-100" : undefined}>
          <CardHeader
            title={editing ? `Correct the visit to ${editing.companyName}` : "Add a visit"}
            description={
              editing
                ? undefined
                : "The company links to one already on file, or is added to Companies if it is new."
            }
          />
          <CardBody className="space-y-4 pt-0">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name of the company" required error={companyMissing ? "Enter the company visited" : undefined}>
                {() => (
                  <CompanySearch value={company} onChange={pickCompany} ownerId={owner.id} invalid={companyMissing} />
                )}
              </Field>
              <Field label="Visit type">
                {({ id }) => (
                  <NativeSelect id={id} value={fields.visitType} onChange={(e) => set({ visitType: e.target.value as VisitType })}>
                    {VISIT_TYPES.map((t) => (
                      <option key={t} value={t}>{VISIT_TYPE_LABELS[t]}</option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Contact person">
                {({ id }) => <Input id={id} value={fields.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} />}
              </Field>
              <Field label="Contact no.">
                {({ id }) => <Input id={id} numeric value={fields.phone} onChange={(e) => set({ phone: e.target.value })} />}
              </Field>
              <Field label="Email">
                {({ id }) => <Input id={id} type="email" value={fields.email} onChange={(e) => set({ email: e.target.value })} />}
              </Field>
              <Field label="Area">
                {({ id }) => <Input id={id} placeholder="Aundh, Baner…" value={fields.area} onChange={(e) => set({ area: e.target.value })} />}
              </Field>
            </div>
            <Field label="Remarks" hint="What happened, and what was promised: rates to send, a follow-up date.">
              {({ id }) => <Textarea id={id} rows={2} value={fields.remarks} onChange={(e) => set({ remarks: e.target.value })} />}
            </Field>
          </CardBody>
          <CardFooter>
            {editing && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
            <Button
              loading={save.isPending}
              onClick={() => {
                setTried(true);
                if (!company.companyName.trim()) return;
                save.mutate();
              }}
            >
              {editing ? "Save changes" : "Add visit"}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <p className="flex items-center gap-2 text-sm text-grey-500">
          <Lock className="size-3.5" />
          {whyLocked(role, actor.id, owner.id)}
        </p>
      )}

      <DayNotes day={day} owner={owner} editable={editable} />
    </div>
  );
}

/* ── What the sheet kept outside its rows ── */
function DayNotes({ day, owner, editable }: { day: number; owner: DsrOwner; editable: boolean }) {
  const actor = useActor();
  const queryClient = useQueryClient();
  const note = useQuery({
    queryKey: ["dsr-day-note", owner.id, day],
    queryFn: () => dsrRepo.dayNote(owner.id, day),
  });

  const [accompaniedBy, setAccompaniedBy] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    setAccompaniedBy(note.data?.accompaniedBy ?? "");
    setNotes(note.data?.notes ?? "");
  }, [note.data]);

  const save = useMutation({
    mutationFn: () => dsrRepo.saveDayNote(owner, day, { accompaniedBy, notes }, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dsr-day-note", owner.id, day] });
      queryClient.invalidateQueries({ queryKey: ["dsr-range-notes"] });
      toast.success("Notes saved");
    },
    onError: (error) => {
      const d = describeError(error);
      toast.error(d.title ?? "Could not save the notes", d.message ?? "Try again.");
    },
  });

  if (!editable) {
    if (!note.data?.accompaniedBy && !note.data?.notes) return null;
    return (
      <Card>
        <CardHeader title="Notes for the day" />
        <CardBody className="pt-0 space-y-2 text-sm">
          {note.data.accompaniedBy && <p><span className="text-grey-500">Went with:</span> {note.data.accompaniedBy}</p>}
          {note.data.notes && <p className="whitespace-pre-line text-grey-700">{note.data.notes}</p>}
        </CardBody>
      </Card>
    );
  }

  const dirty = accompaniedBy !== (note.data?.accompaniedBy ?? "") || notes !== (note.data?.notes ?? "");

  return (
    <Card>
      <CardHeader title="Notes for the day" description="Anything that is not a single visit." />
      <CardBody className="space-y-4 pt-0">
        <Field label="Went with" hint="A joint visit, with a senior or a colleague who came along.">
          {({ id }) => <Input id={id} value={accompaniedBy} onChange={(e) => setAccompaniedBy(e.target.value)} className="max-w-sm" />}
        </Field>
        <Field label="Other work, or why there were no visits" hint="Follow-ups, emailers, reports. Or why there were none: 'No visits, heavy rain in the city'.">
          {({ id }) => <Textarea id={id} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </CardBody>
      <CardFooter>
        <Button variant="secondary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          Save notes
        </Button>
      </CardFooter>
    </Card>
  );
}
