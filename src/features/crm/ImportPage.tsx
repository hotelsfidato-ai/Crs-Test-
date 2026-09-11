import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle,
  ArrowRight, RotateCcw, FileWarning, UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useActor, useSession } from "@/lib/session";
import { can, canAssignOwner, assignableOwners, type Resource } from "@/lib/permissions";
import { adminRepo, importRepo } from "@/data/repositories";
import { number } from "@/lib/format";
import {
  Page, PageHeader, Card, CardHeader, CardBody, CardFooter, Button, Field,
  NativeSelect, StatusPill, EmptyState, ProgressBar, Segmented, Tooltip, toast,
} from "@/components/ui";
import { DESCRIPTORS, type ImportDescriptor } from "@/features/import/descriptors";
import {
  parseFile, guessMapping, validateRows, summarise, buildDocuments, isExcel,
  downloadCsvTemplate, downloadExcelTemplate, downloadErrorReport,
  type ParsedFile, type ValidatedRow,
} from "@/features/import/engine";
import type { ImportEntity } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   BULK IMPORT

   Upload → map → check → commit. Four steps, and the first three
   change nothing.

   ⚠️ Nothing is written until the final button. Parsing, mapping,
   validation and duplicate detection all happen in the browser,
   against a file that has not left the machine. An import that
   half-succeeds and leaves you guessing which half is worse than one
   that refuses to start — so the whole file is judged before any of
   it is committed.

   ⚠️ TAGGING A FILE TO A SALESPERSON. The CRS desk loads data on
   somebody's behalf, exactly as it books on somebody's behalf, and the
   records must land in THAT person's list rather than the desk's. The
   choice is made at step 1 and restated at the commit button, because
   once imported there is no screen that moves a customer to another
   owner — a wrong tag on 400 rows is, in practice, permanent.
   ══════════════════════════════════════════════════════════════════ */

type Stage = "upload" | "map" | "review" | "done";

const ENTITY_ORDER: ImportEntity[] = ["customers", "companies", "hotels"];

/**
 * The importer's own name for a thing, and the permission matrix's.
 *
 * ⚠️ They differ — the matrix is singular ("customer"), the collections
 * are plural ("customers"). Reconciled here rather than by renaming
 * either, because both spellings are load-bearing: one keys Firestore
 * paths, the other keys the grant table.
 */
const RESOURCE_FOR: Record<ImportEntity, Resource> = {
  customers: "customer",
  companies: "company",
  hotels: "hotel",
};

/** ⚠️ Mirrors importRepo.existingKeys. Quoted in the UI, so it must match. */
const EXISTING_SCAN_LIMIT = 2_000;

export default function ImportPage() {
  const actor = useActor();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const role = useSession((s) => s.role);

  /**
   * ⚠️ Only what this role may actually import. A Manager can import
   * customers and companies but not properties, and offering Properties
   * anyway let them upload a file, map every column and review 300 rows
   * before the commit was refused — all the work, then the refusal. The
   * route guard admits anyone who can import something, so the picker
   * is where the per-entity grant lands.
   */
  const allowed = useMemo(
    () => ENTITY_ORDER.filter((e) => can(role, "import", RESOURCE_FOR[e])),
    [role],
  );

  const [entity, setEntity] = useState<ImportEntity>(() => allowed[0] ?? "customers");
  const [stage, setStage] = useState<Stage>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  /* Empty means "me" — the same convention as the booking wizard. */
  const [ownerId, setOwnerId] = useState("");

  const descriptor = DESCRIPTORS[entity];

  /* Whether this import can be tagged at all: the role must be one that
     books for others, and the records must be the kind that belong to a
     person's book. Properties never do. */
  const mayAssign = canAssignOwner(role);
  const tagging = mayAssign && descriptor.ownable;

  const staff = useQuery({
    queryKey: ["assignable-owners"],
    queryFn: () => adminRepo.allUsers(),
    enabled: tagging,
    staleTime: 60_000,
  });
  const owners = useMemo(
    () => assignableOwners(staff.data ?? [], actor.id),
    [staff.data, actor.id],
  );
  const assignedOwner = owners.find((u) => u.id === ownerId);

  /**
   * ⚠️ A selection that no longer resolves — the person was disabled, or
   * the list reloaded without them. Falling back to "me" would silently
   * put the whole file in the importer's name instead, so the import is
   * refused until somebody chooses again.
   */
  const ownerMissing = tagging && Boolean(ownerId) && staff.isSuccess && !assignedOwner;

  /** " for Haider", or nothing — appended wherever the count is stated. */
  const forWhom = tagging && assignedOwner ? ` for ${assignedOwner.name}` : "";

  /* Collision check against what is already stored. Fetched once a file
     is in, not on page load — most visits here are to grab a template,
     and that should cost nothing. */
  const existing = useQuery({
    queryKey: ["import-existing", entity],
    queryFn: () => importRepo.existingKeys(entity, descriptor.duplicateKeys),
    enabled: stage === "map" || stage === "review",
    staleTime: 60_000,
  });

  const validated: ValidatedRow[] = useMemo(() => {
    if (!parsed) return [];
    return validateRows(parsed.rows, mapping, descriptor, existing.data ?? {});
  }, [parsed, mapping, descriptor, existing.data]);

  const summary = useMemo(() => summarise(validated), [validated]);

  const commit = useMutation({
    mutationFn: () => {
      /* ⚠️ Through buildDocuments, not a map over rows — for companies,
         several rows become one company, and the count on the button is
         the count of documents it builds. */
      const documents = buildDocuments(validated, descriptor);
      setProgress({ done: 0, total: documents.length });
      return importRepo.commit(
        entity,
        documents,
        actor,
        (done, total) => setProgress({ done, total }),
        tagging && assignedOwner
          ? { id: assignedOwner.id, name: assignedOwner.name }
          : undefined,
      );
    },
    onSuccess: (out) => {
      setResult(out);
      setStage("done");
      queryClient.invalidateQueries({ queryKey: [entity] });
      queryClient.invalidateQueries({ queryKey: ["import-existing", entity] });
      toast.success(
        "Import complete",
        `${out.created} ${descriptor.label.toLowerCase()} added${forWhom}.`,
      );
    },
    onError: () =>
      toast.error(
        "Import failed",
        "Some rows may have been written. Check the list before retrying.",
      ),
  });

  async function handleFile(file: File) {
    setParseError(null);
    try {
      const next = await parseFile(file);
      if (!next.rows.length) {
        setParseError("That file has headings but no rows.");
        return;
      }
      setParsed(next);
      setMapping(guessMapping(next.headers, descriptor));
      setStage("map");
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Could not read that file.");
    }
  }

  /* ⚠️ Clears the tag with everything else. "Import another file" after
     loading Haider's leads must not quietly carry Haider over to a file
     that belongs to somebody else. */
  function reset() {
    setOwnerId("");
    setParsed(null);
    setMapping({});
    setParseError(null);
    setResult(null);
    setStage("upload");
  }

  const autoMapped = Object.keys(mapping).length;
  const requiredUnmapped = descriptor.fields.filter((f) => f.required && !mapping[f.key]);

  /* One control, rendered at step 1 and again beside the commit button,
     bound to the same state — decided up front, confirmed at the point
     of no return. */
  const ownerPicker = (
    <Field
      label="These records belong to"
      hint={
        staff.isError
          ? "The staff list could not be loaded, so only you are offered. Reload to try again."
          : "They appear in that person's list and against their name, as if they had entered them. You stay recorded as the one who imported them."
      }
    >
      {({ id }) => (
        <NativeSelect id={id} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">{actor.name} (me)</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.department ? ` · ${u.department}` : ` · ${u.role.replace("_", " ")}`}
            </option>
          ))}
        </NativeSelect>
      )}
    </Field>
  );

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Import" }]}
        title="Bulk import"
        description="Upload a CSV or Excel file. Columns are matched automatically, every row is checked, and nothing is saved until you confirm."
        actions={
          stage !== "upload" ? (
            <Button
              variant="secondary"
              leadingIcon={<RotateCcw className="size-4" />}
              onClick={reset}
            >
              Start over
            </Button>
          ) : undefined
        }
      />

      {/* ── Upload ── */}
      {stage === "upload" && (
        <>
          <Card className="mb-6">
            <CardHeader
              title="1. Choose what to import"
              description="Each type has its own template and its own rules."
            />
            <CardBody>
              <Segmented
                value={entity}
                onChange={(next: ImportEntity) => {
                  setEntity(next);
                  reset();
                }}
                options={allowed.map((e) => ({
                  value: e,
                  label: DESCRIPTORS[e].label,
                }))}
              />
              <p className="text-sm text-grey-600 mt-3 leading-relaxed">
                {descriptor.description}
              </p>
              {tagging && <div className="mt-5 max-w-md">{ownerPicker}</div>}
            </CardBody>
          </Card>

          <Card className="mb-6">
            <CardHeader
              title="2. Start from the template"
              description="Generated from the same rules the importer validates against, so it cannot drift out of date."
            />
            <CardBody>
              <div className="flex flex-wrap gap-2 mb-5">
                <Button
                  variant="secondary"
                  leadingIcon={<Download className="size-4" />}
                  onClick={() => downloadCsvTemplate(descriptor)}
                >
                  Download CSV template
                </Button>
                <Button
                  variant="secondary"
                  leadingIcon={<Download className="size-4" />}
                  onClick={() => void downloadExcelTemplate(descriptor)}
                >
                  Download Excel template
                </Button>
              </div>

              <p className="text-sm text-grey-600 mb-3 leading-relaxed">
                The Excel workbook carries a second sheet, <strong>Field guide</strong>,
                listing every column, whether it is required, an example, and the
                alternative headings that are accepted. You do not have to use these exact
                headings: an export from another system usually maps itself.
              </p>

              <FieldReference descriptor={descriptor} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="3. Upload your file" description="CSV, XLSX or XLS." />
            <CardBody>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) void handleFile(file);
                }}
                className={cn(
                  /* `relative` anchors the sr-only file input below to this box
                     rather than the document — see the note on <main>. */
                  "relative flex flex-col items-center justify-center gap-3 py-12 px-6 rounded-md",
                  "border-2 border-dashed transition-colors duration-150 text-center",
                  dragging
                    ? "border-brand-orange bg-brand-orange-50/50"
                    : "border-grey-300 bg-grey-50",
                )}
              >
                <FileSpreadsheet className="size-8 text-grey-400" />
                <div>
                  <p className="text-base font-medium text-ink-900">Drop your file here</p>
                  <p className="text-sm text-grey-500 mt-1">
                    or choose one from your computer
                  </p>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.xlsx,.xls,.xlsm,.xlsb,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="secondary"
                  leadingIcon={<Upload className="size-4" />}
                  onClick={() => fileInput.current?.click()}
                >
                  Choose file
                </Button>
              </div>

              {parseError && (
                <div className="flex items-start gap-3 mt-4 p-4 rounded-md bg-brand-red-50 border border-brand-red-100">
                  <FileWarning className="size-4 text-brand-red shrink-0 mt-0.5" />
                  <p className="text-sm text-brand-red leading-relaxed">{parseError}</p>
                </div>
              )}

              <p className="text-xs text-grey-400 mt-4 leading-relaxed">
                Your file is read in this browser. Nothing is sent anywhere until you
                confirm the import two screens from now.
              </p>
            </CardBody>
          </Card>
        </>
      )}

      {/* ── Mapping ── */}
      {stage === "map" && parsed && (
        <Card>
          <CardHeader
            title="Check the column mapping"
            description={`${parsed.fileName} · ${number(parsed.rows.length)} row${parsed.rows.length === 1 ? "" : "s"} · ${autoMapped} of ${descriptor.fields.length} columns matched automatically`}
            actions={
              isExcel(parsed.fileName) && parsed.sheets && parsed.sheets.length > 1 ? (
                <StatusPill tone="neutral" dot={false}>
                  Sheet: {parsed.activeSheet}
                </StatusPill>
              ) : undefined
            }
          />
          <CardBody className="space-y-4">
            {requiredUnmapped.length > 0 && (
              <div className="flex items-start gap-3 p-4 rounded-md bg-brand-yellow-50 border border-brand-yellow-100">
                <AlertTriangle className="size-4 text-[#8a6300] shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-medium text-[#8a6300]">
                    {requiredUnmapped.length} required column
                    {requiredUnmapped.length === 1 ? "" : "s"} not matched
                  </p>
                  <p className="text-sm text-[#8a6300] mt-1 leading-relaxed">
                    Pick the right column for{" "}
                    {requiredUnmapped.map((f) => f.label).join(", ")}. Every row will be
                    rejected without them.
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {descriptor.fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  hint={field.hint ?? `e.g. ${field.example}`}
                >
                  {({ id }) => (
                    <NativeSelect
                      id={id}
                      value={mapping[field.key] ?? ""}
                      onChange={(e) =>
                        setMapping((prev) => {
                          const next = { ...prev };
                          if (e.target.value) next[field.key] = e.target.value;
                          else delete next[field.key];
                          return next;
                        })
                      }
                    >
                      <option value="">Not in my file</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
              ))}
            </div>
          </CardBody>
          <CardFooter>
            <Button variant="ghost" onClick={reset}>Back</Button>
            <Button
              trailingIcon={<ArrowRight className="size-4" />}
              onClick={() => setStage("review")}
            >
              Check {number(parsed.rows.length)} row{parsed.rows.length === 1 ? "" : "s"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ── Review ── */}
      {stage === "review" && parsed && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
            <Card className="p-5">
              <p className="text-sm text-grey-500">Rows in file</p>
              <p className="text-2xl font-semibold text-ink-900 tabular mt-1">
                {number(summary.total)}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-grey-500">Will import</p>
              <p className="text-2xl font-semibold text-success tabular mt-1">
                {number(summary.willImport)}
              </p>
              {summary.combined > 0 && (
                <p className="text-xs text-grey-500 mt-1 leading-snug">
                  {number(summary.combined)} more row{summary.combined === 1 ? "" : "s"} added as
                  extra contacts to a company above
                </p>
              )}
            </Card>
            <Card className="p-5">
              <p className="text-sm text-grey-500">With warnings</p>
              <p className="text-2xl font-semibold text-[#8a6300] tabular mt-1">
                {number(summary.withWarnings)}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-grey-500">Rejected</p>
              <p className="text-2xl font-semibold text-brand-red tabular mt-1">
                {number(summary.skipped)}
              </p>
            </Card>
          </div>

          {tagging && (
            <Card className={cn("mb-6", assignedOwner && "border-brand-orange-100 bg-brand-orange-50")}>
              <CardBody className="flex flex-col gap-4 md:flex-row md:items-start">
                <UserRound
                  className={cn(
                    "size-4 shrink-0 mt-0.5",
                    assignedOwner ? "text-brand-orange" : "text-grey-400",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-ink-900">
                    {assignedOwner
                      ? `${number(summary.willImport)} ${descriptor.label.toLowerCase()} will belong to ${assignedOwner.name}`
                      : `${number(summary.willImport)} ${descriptor.label.toLowerCase()} will belong to you`}
                  </p>
                  <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                    {assignedOwner
                      ? assignedOwner.role === "salesperson"
                        /* ⚠️ Only salespeople are scoped — every other role reads
                           every customer (firestore.rules, ownsOrUnscoped). An
                           earlier draft named only the desk, Admin and Owner. */
                        ? `They go into ${assignedOwner.name}'s list. Other salespeople will not see them; every non-sales role will. `
                        : `They go into ${assignedOwner.name}'s list, against their name. `
                      : "If this file is someone else's, choose them now. They will not see these records otherwise. "}
                    <strong className="font-medium text-ink-900">
                      Check this before importing: there is no screen that moves them to
                      another person afterwards.
                    </strong>
                  </p>
                </div>
                <div className="md:w-72 shrink-0">{ownerPicker}</div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Row by row"
              description="Rejected rows are skipped; the rest are imported. Warnings do not block anything."
              actions={
                summary.skipped > 0 ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    leadingIcon={<Download className="size-3.5" />}
                    onClick={() => downloadErrorReport(validated, descriptor)}
                  >
                    Download rejected rows
                  </Button>
                ) : undefined
              }
            />
            <CardBody className="pt-0">
              {commit.isPending && (
                <div className="mb-5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-sm text-grey-600">
                      Writing {number(progress.done)} of {number(progress.total)}…
                    </p>
                    <p className="text-sm tabular text-grey-500">
                      {progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%
                    </p>
                  </div>
                  <ProgressBar
                    value={progress.total ? (progress.done / progress.total) * 100 : 0}
                    tone="accent"
                  />
                </div>
              )}

              <RowPreview rows={validated} descriptor={descriptor} />
            </CardBody>
            <CardFooter>
              <Button variant="ghost" onClick={() => setStage("map")}>
                Back to mapping
              </Button>
              {ownerMissing && (
                <p className="flex items-center gap-1.5 text-sm text-brand-red mr-auto">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  The person chosen is no longer available. Choose again.
                </p>
              )}
              <Button
                loading={commit.isPending}
                disabled={summary.willImport === 0 || ownerMissing}
                onClick={() => commit.mutate()}
              >
                Import {number(summary.willImport)} {descriptor.label.toLowerCase()}
                {forWhom}
              </Button>
            </CardFooter>
          </Card>

          <p className="text-xs text-grey-400 mt-4 leading-relaxed">
            Duplicate warnings are checked against the {number(EXISTING_SCAN_LIMIT)} most
            recent stored records. That is enough to catch a re-uploaded file, not a full audit of
            the book. The uniqueness rule at save time is what actually prevents
            duplicates, and the duplicates screen is where any that slip through get
            merged.
          </p>
        </>
      )}

      {/* ── Done ── */}
      {stage === "done" && result && (
        <Card>
          <EmptyState
            icon={<CheckCircle2 />}
            title={`${number(result.created)} ${descriptor.label.toLowerCase()} imported${forWhom}`}
            description={
              summary.skipped > 0
                ? `${number(summary.skipped)} row${summary.skipped === 1 ? " was" : "s were"} rejected and not imported. Download them, fix them, and upload again.`
                : "Every row in the file was imported."
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {/* ⚠️ Properties live at /hotels, not /crm/hotels — the old
                    `/crm/${entity}` sent every property import to NotFound. */}
                <Button onClick={() => navigate(entity === "hotels" ? "/hotels" : `/crm/${entity}`)}>
                  View {descriptor.label.toLowerCase()}
                </Button>
                {summary.skipped > 0 && (
                  <Button
                    variant="secondary"
                    leadingIcon={<Download className="size-4" />}
                    onClick={() => downloadErrorReport(validated, descriptor)}
                  >
                    Download rejected rows
                  </Button>
                )}
                <Button variant="ghost" onClick={reset}>
                  Import another file
                </Button>
              </div>
            }
          />
        </Card>
      )}
    </Page>
  );
}

/* ── Pieces ────────────────────────────────────────────────────── */

function FieldReference({ descriptor }: { descriptor: ImportDescriptor }) {
  return (
    <div className="rounded-md border border-grey-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-grey-50 border-b border-grey-200">
            <tr>
              <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9">
                Column
              </th>
              <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9">
                Required
              </th>
              <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9">
                Example
              </th>
              <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9 hidden lg:table-cell">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {descriptor.fields.map((f) => (
              <tr key={f.key} className="border-b border-grey-100 last:border-b-0">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-ink-900">{f.label}</span>
                  {f.aliases.length > 0 && (
                    <Tooltip content={`Also accepts: ${f.aliases.join(", ")}`}>
                      <span className="ml-1.5 text-2xs text-grey-400 cursor-help">
                        +{f.aliases.length} aliases
                      </span>
                    </Tooltip>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {f.required ? (
                    <StatusPill tone="danger" dot={false}>Required</StatusPill>
                  ) : (
                    <span className="text-sm text-grey-400">Optional</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-sm text-grey-600">{f.example}</td>
                <td className="px-4 py-2.5 text-sm text-grey-500 hidden lg:table-cell">
                  {f.hint ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** ⚠️ Capped. A 5,000-row file would otherwise render 5,000 DOM rows. */
const PREVIEW_LIMIT = 100;

function RowPreview({
  rows, descriptor,
}: {
  rows: ValidatedRow[];
  descriptor: ImportDescriptor;
}) {
  // Problems first — they are the reason anyone reads this table.
  const ordered = [...rows].sort(
    (a, b) =>
      b.errors.length - a.errors.length ||
      b.warnings.length - a.warnings.length ||
      a.rowNumber - b.rowNumber,
  );
  const shown = ordered.slice(0, PREVIEW_LIMIT);
  const primary = descriptor.fields.slice(0, 3);

  return (
    <>
      <div className="rounded-md border border-grey-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-base">
            <thead className="bg-grey-50 border-b border-grey-200 sticky top-0">
              <tr>
                <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9 w-16">
                  Row
                </th>
                {primary.map((f) => (
                  <th
                    key={f.key}
                    className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9"
                  >
                    {f.label}
                  </th>
                ))}
                <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 px-4 h-9">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.rowNumber}
                  className={cn(
                    "border-b border-grey-100 last:border-b-0",
                    r.errors.length > 0 && "bg-brand-red-50/40",
                  )}
                >
                  <td className="px-4 py-2.5 tabular text-grey-500">{r.rowNumber}</td>
                  {primary.map((f) => (
                    <td
                      key={f.key}
                      className="px-4 py-2.5 text-ink-900 truncate max-w-[220px]"
                    >
                      {r.mapped[f.key] || <span className="text-grey-300">-</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    {r.errors.length > 0 ? (
                      <span className="text-sm text-brand-red">{r.errors.join("; ")}</span>
                    ) : r.warnings.length > 0 ? (
                      <span className="text-sm text-[#8a6300]">
                        {[...r.warnings, ...r.notes].join("; ")}
                      </span>
                    ) : r.notes.length > 0 ? (
                      <span className="text-sm text-grey-500">{r.notes.join("; ")}</span>
                    ) : (
                      <span className="text-sm text-grey-400">Ready</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length > PREVIEW_LIMIT && (
        <p className="text-xs text-grey-400 mt-3">
          Showing the first {PREVIEW_LIMIT} of {number(rows.length)} rows, problems first.
          All {number(rows.length)} were checked.
        </p>
      )}
    </>
  );
}
