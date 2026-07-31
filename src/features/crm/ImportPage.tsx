import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle,
  ArrowRight, RotateCcw, FileWarning,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useActor } from "@/lib/session";
import { importRepo } from "@/data/repositories";
import { number } from "@/lib/format";
import {
  Page, PageHeader, Card, CardHeader, CardBody, CardFooter, Button, Field,
  NativeSelect, StatusPill, EmptyState, ProgressBar, Segmented, Tooltip, toast,
} from "@/components/ui";
import { DESCRIPTORS, type ImportDescriptor } from "@/features/import/descriptors";
import {
  parseFile, guessMapping, validateRows, summarise, isExcel,
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
   ══════════════════════════════════════════════════════════════════ */

type Stage = "upload" | "map" | "review" | "done";

const ENTITY_ORDER: ImportEntity[] = ["customers", "companies", "hotels"];

/** ⚠️ Mirrors importRepo.existingKeys. Quoted in the UI, so it must match. */
const EXISTING_SCAN_LIMIT = 2_000;

export default function ImportPage() {
  const actor = useActor();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [entity, setEntity] = useState<ImportEntity>("customers");
  const [stage, setStage] = useState<Stage>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const descriptor = DESCRIPTORS[entity];

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
      const good = validated.filter((r) => r.errors.length === 0);
      const documents = good.map((r) => descriptor.toDocument(r.mapped));
      setProgress({ done: 0, total: documents.length });
      return importRepo.commit(entity, documents, actor, (done, total) =>
        setProgress({ done, total }),
      );
    },
    onSuccess: (out) => {
      setResult(out);
      setStage("done");
      queryClient.invalidateQueries({ queryKey: [entity] });
      queryClient.invalidateQueries({ queryKey: ["import-existing", entity] });
      toast.success(
        "Import complete",
        `${out.created} ${descriptor.label.toLowerCase()} added.`,
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

  function reset() {
    setParsed(null);
    setMapping({});
    setParseError(null);
    setResult(null);
    setStage("upload");
  }

  const autoMapped = Object.keys(mapping).length;
  const requiredUnmapped = descriptor.fields.filter((f) => f.required && !mapping[f.key]);

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Customers", to: "/crm/customers" }, { label: "Import" }]}
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
                options={ENTITY_ORDER.map((e) => ({
                  value: e,
                  label: DESCRIPTORS[e].label,
                }))}
              />
              <p className="text-sm text-grey-600 mt-3 leading-relaxed">
                {descriptor.description}
              </p>
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
                The Excel workbook carries a second sheet — <strong>Field guide</strong> —
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
                  "flex flex-col items-center justify-center gap-3 py-12 px-6 rounded-md",
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
                      <option value="">— not in my file —</option>
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
              <Button
                loading={commit.isPending}
                disabled={summary.willImport === 0}
                onClick={() => commit.mutate()}
              >
                Import {number(summary.willImport)} {descriptor.label.toLowerCase()}
              </Button>
            </CardFooter>
          </Card>

          <p className="text-xs text-grey-400 mt-4 leading-relaxed">
            Duplicate warnings are checked against the {number(EXISTING_SCAN_LIMIT)} most
            recent stored records — enough to catch a re-uploaded file, not a full audit of
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
            title={`${number(result.created)} ${descriptor.label.toLowerCase()} imported`}
            description={
              summary.skipped > 0
                ? `${number(summary.skipped)} row${summary.skipped === 1 ? " was" : "s were"} rejected and not imported. Download them, fix them, and upload again.`
                : "Every row in the file was imported."
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => navigate(`/crm/${entity}`)}>
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
                  {f.hint ?? "—"}
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
                      {r.mapped[f.key] || <span className="text-grey-300">—</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    {r.errors.length > 0 ? (
                      <span className="text-sm text-brand-red">{r.errors.join("; ")}</span>
                    ) : r.warnings.length > 0 ? (
                      <span className="text-sm text-[#8a6300]">{r.warnings.join("; ")}</span>
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
