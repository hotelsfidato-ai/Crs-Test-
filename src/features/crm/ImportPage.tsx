import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileSpreadsheet, Check, AlertTriangle, X, ArrowLeft, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useActor } from "@/lib/session";
import { customersRepo, db } from "@/data/repositories";
import { isDuplicateEmail, isDuplicatePhone } from "@/lib/rules";
import { number } from "@/lib/format";
import {
  Page, PageHeader, Card, CardHeader, CardBody, CardFooter, Button,
  NativeSelect, DataTable, EmptyState, toast, type Column,
} from "@/components/ui";

/* ══════════════════════════════════════════════════════════════════
   IMPORT WIZARD
   Upload → map columns → validate → preview → commit.
   Validation runs the same uniqueness rules the form does, so a file
   cannot introduce duplicates the UI would reject one at a time.
   ══════════════════════════════════════════════════════════════════ */

type Step = "upload" | "map" | "review";

const TARGET_FIELDS = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
] as const;

const SAMPLE_CSV = `first_name,last_name,email,phone,city,state
Rohan,Kulkarni,rohan.kulkarni@aster.com,+919812345601,Pune,Maharashtra
Meera,Nair,meera.nair@bluewave.com,+919812345602,Kochi,Kerala
Imran,Sheikh,imran.sheikh@cerulean.com,+919812345603,Hyderabad,Telangana
Ananya,Bose,ananya.bose@dynamo.com,+919812345604,Kolkata,West Bengal
Vikram,Desai,vikram.desai@everest.com,+919812345605,Surat,Gujarat
Priya,Menon,priya.menon@fortis.com,+919812345606,Chennai,Tamil Nadu
Kabir,Thakur,kabir.thakur@granite.com,+919812345607,Jaipur,Rajasthan
Divya,Shetty,divya.shetty@helios.com,+919812345608,Mangaluru,Karnataka`;

interface ParsedRow {
  index: number;
  values: Record<string, string>;
}

interface ValidatedRow extends ParsedRow {
  mapped: Record<string, string>;
  errors: string[];
  warnings: string[];
}

function parseCsv(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };

  const split = (line: string) =>
    line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));

  const headers = split(lines[0]!);
  const rows = lines.slice(1).map((line, i) => {
    const cells = split(line);
    const values: Record<string, string> = {};
    headers.forEach((h, c) => { values[h] = cells[c] ?? ""; });
    return { index: i + 2, values };
  });

  return { headers, rows };
}

/** Guesses a mapping from header names so the common case needs no work. */
function guessMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

  for (const field of TARGET_FIELDS) {
    const target = normalise(field.label);
    const alt = normalise(field.key);
    const match = headers.find((h) => {
      const n = normalise(h);
      return n === target || n === alt || n.includes(alt) || alt.includes(n);
    });
    if (match) map[field.key] = match;
  }
  return map;
}

export default function ImportPage() {
  const navigate = useNavigate();
  const actor = useActor();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  function loadText(text: string, name: string) {
    const parsed = parseCsv(text);
    if (!parsed.rows.length) {
      toast.error("Nothing to import", "That file has a header row but no data.");
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(guessMapping(parsed.headers));
    setFileName(name);
    setStep("map");
  }

  async function handleFile(file: File) {
    const text = await file.text();
    loadText(text, file.name);
  }

  const validated = useMemo<ValidatedRow[]>(() => {
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();

    return rows.map((row) => {
      const mapped: Record<string, string> = {};
      for (const field of TARGET_FIELDS) {
        const source = mapping[field.key];
        mapped[field.key] = source ? (row.values[source] ?? "").trim() : "";
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      for (const field of TARGET_FIELDS) {
        if (field.required && !mapped[field.key]) {
          errors.push(`${field.label} is missing`);
        }
      }

      if (mapped.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mapped.email)) {
        errors.push("Email is not valid");
      }
      if (mapped.phone && mapped.phone.replace(/\D/g, "").length < 10) {
        errors.push("Phone is too short");
      }

      // Within the file itself
      const emailKey = mapped.email?.toLowerCase();
      if (emailKey) {
        if (seenEmail.has(emailKey)) errors.push("Duplicated inside this file");
        seenEmail.add(emailKey);
      }
      const phoneKey = mapped.phone?.replace(/\D/g, "").slice(-10);
      if (phoneKey && phoneKey.length === 10) {
        if (seenPhone.has(phoneKey)) errors.push("Phone duplicated inside this file");
        seenPhone.add(phoneKey);
      }

      // Against what is already stored
      if (mapped.email && isDuplicateEmail(mapped.email, db.customers)) {
        warnings.push("A customer already has this email");
      }
      if (mapped.phone && isDuplicatePhone(mapped.phone, db.customers)) {
        warnings.push("A customer already has this phone number");
      }

      return { ...row, mapped, errors, warnings };
    });
  }, [rows, mapping]);

  const valid = validated.filter((r) => r.errors.length === 0);
  const invalid = validated.filter((r) => r.errors.length > 0);
  const warned = valid.filter((r) => r.warnings.length > 0);

  const missingRequired = TARGET_FIELDS.filter((f) => f.required && !mapping[f.key]);

  const commit = useMutation({
    mutationFn: () => customersRepo.importMany(valid.map((r) => r.mapped), actor),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["duplicates"] });
      toast.success(
        "Import complete",
        `${result.created} customer${result.created === 1 ? "" : "s"} created.`,
      );
      navigate("/crm/customers");
    },
    onError: () => toast.error("Import failed", "No records were created."),
  });

  const columns: Column<ValidatedRow>[] = [
    {
      key: "status", header: "", width: "w-10",
      cell: (r) =>
        r.errors.length ? (
          <X className="size-4 text-brand-red" />
        ) : r.warnings.length ? (
          <AlertTriangle className="size-4 text-brand-yellow" />
        ) : (
          <Check className="size-4 text-success" />
        ),
    },
    { key: "row", header: "Row", numeric: true, width: "w-16", cell: (r) => r.index },
    {
      key: "name", header: "Name",
      cell: (r) => (
        <span className="font-medium text-ink-900">
          {[r.mapped.firstName, r.mapped.lastName].filter(Boolean).join(" ") || (
            <span className="text-grey-400">—</span>
          )}
        </span>
      ),
    },
    { key: "email", header: "Email", cell: (r) => r.mapped.email || <span className="text-grey-400">—</span> },
    {
      key: "phone", header: "Phone", hideBelow: "md",
      cell: (r) => <span className="tabular">{r.mapped.phone || "—"}</span>,
    },
    { key: "city", header: "City", hideBelow: "lg", cell: (r) => r.mapped.city || "—" },
    {
      key: "issues", header: "Issues",
      cell: (r) =>
        r.errors.length ? (
          <span className="text-sm text-brand-red">{r.errors.join(", ")}</span>
        ) : r.warnings.length ? (
          <span className="text-sm text-[#8a6300]">{r.warnings.join(", ")}</span>
        ) : (
          <span className="text-sm text-grey-400">None</span>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Customers", to: "/crm/customers" }, { label: "Import" }]}
        title="Import customers"
        description="Upload a CSV, map its columns, then review what will be created before anything is written."
      />

      <Stepper step={step} />

      {step === "upload" && (
        <Card className="max-w-2xl">
          <CardBody>
            <label
              className={cn(
                "flex flex-col items-center justify-center text-center",
                "border-2 border-dashed border-grey-300 rounded-md py-14 px-6 cursor-pointer",
                "hover:border-brand-orange hover:bg-brand-orange-50/40 transition-colors duration-150",
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void handleFile(file);
              }}
            >
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <span className="flex items-center justify-center size-11 rounded-full bg-grey-100 text-grey-400 mb-4">
                <Upload className="size-5" />
              </span>
              <span className="text-md font-semibold text-ink-900">
                Drop a CSV here, or browse
              </span>
              <span className="text-base text-grey-500 mt-1.5 max-w-sm leading-relaxed">
                The first row must be a header. Columns are matched automatically where
                the names are recognisable.
              </span>
            </label>

            <div className="flex items-center gap-3 mt-5">
              <div className="h-px bg-grey-200 flex-1" />
              <span className="text-xs text-grey-400">or</span>
              <div className="h-px bg-grey-200 flex-1" />
            </div>

            <Button
              variant="secondary"
              className="w-full mt-5"
              leadingIcon={<FileSpreadsheet className="size-4" />}
              onClick={() => loadText(SAMPLE_CSV, "sample-customers.csv")}
            >
              Use a sample file (8 rows)
            </Button>
            <p className="text-xs text-grey-400 text-center mt-2">
              Two rows in the sample collide with existing records, so you can see how
              warnings behave.
            </p>
          </CardBody>
        </Card>
      )}

      {step === "map" && (
        <Card className="max-w-2xl">
          <CardHeader
            title="Map the columns"
            description={`${fileName} · ${number(rows.length)} rows · ${headers.length} columns`}
          />
          <CardBody className="space-y-4">
            {TARGET_FIELDS.map((field) => (
              <div key={field.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div>
                  <p className="text-base text-ink-900">
                    {field.label}
                    {field.required && <span className="text-brand-red ml-0.5">*</span>}
                  </p>
                  <p className="text-sm text-grey-500">
                    {field.required ? "Required" : "Optional"}
                  </p>
                </div>
                <ArrowLeft className="size-4 text-grey-300" />
                <NativeSelect
                  value={mapping[field.key] ?? ""}
                  invalid={field.required && !mapping[field.key]}
                  onChange={(e) =>
                    setMapping((m) => {
                      const next = { ...m };
                      if (e.target.value) next[field.key] = e.target.value;
                      else delete next[field.key];
                      return next;
                    })
                  }
                  aria-label={`Source column for ${field.label}`}
                >
                  <option value="">Not mapped</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </NativeSelect>
              </div>
            ))}

            {missingRequired.length > 0 && (
              <p className="flex items-start gap-2 text-sm text-brand-red pt-2">
                <AlertTriangle className="size-4 shrink-0 mt-px" />
                Map {missingRequired.map((f) => f.label.toLowerCase()).join(", ")} before
                continuing.
              </p>
            )}
          </CardBody>
          <CardFooter>
            <Button variant="ghost" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button
              variant="primary"
              disabled={missingRequired.length > 0}
              trailingIcon={<ArrowRight className="size-4" />}
              onClick={() => setStep("review")}
            >
              Review {number(rows.length)} rows
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "review" && (
        <>
          <div className="grid gap-4 grid-cols-3 mb-5 max-w-2xl">
            <Card className="p-4">
              <p className="text-2xs font-medium uppercase tracking-wide text-grey-400">
                Will import
              </p>
              <p className="text-2xl font-semibold text-success tabular mt-1.5">
                {valid.length}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-2xs font-medium uppercase tracking-wide text-grey-400">
                With warnings
              </p>
              <p className="text-2xl font-semibold text-[#8a6300] tabular mt-1.5">
                {warned.length}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-2xs font-medium uppercase tracking-wide text-grey-400">
                Skipped
              </p>
              <p className="text-2xl font-semibold text-brand-red tabular mt-1.5">
                {invalid.length}
              </p>
            </Card>
          </div>

          <DataTable
            columns={columns}
            rows={validated}
            rowKey={(r) => String(r.index)}
            stickyHeader={false}
            empty={<EmptyState compact title="Nothing to review" />}
          />

          <div className="flex items-center justify-between gap-4 mt-5 flex-wrap">
            <p className="text-sm text-grey-500 max-w-lg leading-relaxed">
              Rows with errors are skipped. Rows with warnings still import — resolve
              them afterwards on the{" "}
              <Link to="/crm/merge" className="text-brand-orange hover:underline">
                duplicates
              </Link>{" "}
              screen. Imported customers arrive as leads owned by you.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setStep("map")}>
                Back
              </Button>
              <Button
                variant="primary"
                disabled={valid.length === 0}
                loading={commit.isPending}
                onClick={() => commit.mutate()}
              >
                Import {valid.length} customer{valid.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map columns" },
    { key: "review", label: "Review & import" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);

  return (
    <ol className="flex items-center gap-2 mb-6 flex-wrap">
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center justify-center size-6 rounded-full text-2xs font-semibold tabular",
                done
                  ? "bg-success text-white"
                  : active
                    ? "bg-brand-orange text-white"
                    : "bg-grey-100 text-grey-400",
              )}
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-base",
                active ? "text-ink-900 font-medium" : "text-grey-500",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="w-8 h-px bg-grey-200 mx-1" />}
          </li>
        );
      })}
    </ol>
  );
}
