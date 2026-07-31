import Papa from "papaparse";
import type { ImportDescriptor, ImportField } from "./descriptors";

/* ══════════════════════════════════════════════════════════════════
   IMPORT ENGINE

   Parses CSV and Excel, guesses the column mapping, validates, and
   detects duplicates both inside the file and against what is already
   stored.

   ⚠️ Excel support is lazy-loaded. The xlsx parser is ~400 kB and only
   this screen needs it, so it must never enter the main bundle.
   ══════════════════════════════════════════════════════════════════ */

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
  /** Sheet names, when the source was a workbook with more than one. */
  sheets?: string[];
  activeSheet?: string;
}

const EXCEL_EXTENSIONS = /\.(xlsx|xlsm|xlsb|xls)$/i;

export function isExcel(fileName: string): boolean {
  return EXCEL_EXTENSIONS.test(fileName);
}

/* ── Parsing ───────────────────────────────────────────────────── */

export async function parseFile(file: File, sheetName?: string): Promise<ParsedFile> {
  return isExcel(file.name) ? parseExcel(file, sheetName) : parseCsv(file);
}

async function parseCsv(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    // Everything is read as text; the descriptor's transform decides
    // the real type. Letting Papa guess turns "007" into 7 and a GSTIN
    // into scientific notation.
    dynamicTyping: false,
  });

  if (result.errors.length) {
    const first = result.errors[0]!;
    throw new Error(`Could not read the file: ${first.message} (row ${first.row ?? "?"})`);
  }

  return {
    headers: (result.meta.fields ?? []).filter(Boolean),
    rows: result.data.map(normaliseRow),
    fileName: file.name,
  };
}

async function parseExcel(file: File, sheetName?: string): Promise<ParsedFile> {
  // Lazy — keeps ~400 kB out of every other route.
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });

  const sheets = book.SheetNames;
  const active = sheetName && sheets.includes(sheetName) ? sheetName : sheets[0];
  if (!active) throw new Error("The workbook has no sheets.");

  const sheet = book.Sheets[active]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,      // formatted strings, so dates and numbers arrive as displayed
    blankrows: false,
  });

  const headers = Object.keys(rows[0] ?? {}).map((h) => h.trim()).filter(Boolean);

  return {
    headers,
    rows: rows.map((r) =>
      normaliseRow(
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), String(v ?? "")])),
      ),
    ),
    fileName: file.name,
    sheets,
    activeSheet: active,
  };
}

function normaliseRow(row: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.trim(), String(v ?? "").trim()]),
  );
}

/* ── Auto-mapping ──────────────────────────────────────────────────
   Matches a spreadsheet's headers to the descriptor's fields so the
   common case needs no manual work. Exact match first, then aliases,
   then a loose contains match.                                       */

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function guessMapping(
  headers: string[],
  descriptor: ImportDescriptor,
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const taken = new Set<string>();

  const tryMatch = (field: ImportField, test: (header: string) => boolean) => {
    if (mapping[field.key]) return;
    const hit = headers.find((h) => !taken.has(h) && test(h));
    if (hit) {
      mapping[field.key] = hit;
      taken.add(hit);
    }
  };

  // Pass 1 — exact label or key.
  for (const field of descriptor.fields) {
    const label = squash(field.label);
    const key = squash(field.key);
    tryMatch(field, (h) => squash(h) === label || squash(h) === key);
  }
  // Pass 2 — declared aliases.
  for (const field of descriptor.fields) {
    const aliases = field.aliases.map(squash);
    tryMatch(field, (h) => aliases.includes(squash(h)));
  }
  // Pass 3 — loose contains, longest header first so "email address"
  // wins over "email" when both are present.
  const byLength = [...headers].sort((a, b) => b.length - a.length);
  for (const field of descriptor.fields) {
    const key = squash(field.key);
    const label = squash(field.label);
    tryMatch(field, (h) => {
      const s = squash(h);
      if (s.length < 3) return false;
      return s.includes(key) || key.includes(s) || s.includes(label) || label.includes(s);
    });
    void byLength;
  }

  return mapping;
}

/* ── Validation ────────────────────────────────────────────────── */

export interface ValidatedRow {
  /** 1-based spreadsheet row, counting the header. */
  rowNumber: number;
  raw: Record<string, string>;
  mapped: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export interface ExistingKeys {
  /** Normalised values already stored, per duplicate-key field. */
  [field: string]: Set<string>;
}

export function validateRows(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  descriptor: ImportDescriptor,
  existing: ExistingKeys = {},
): ValidatedRow[] {
  /* Duplicates *within the file* are errors — a file containing the
     same person twice is a mistake in the file. Collisions with stored
     records are warnings, resolved afterwards on the merge screen. */
  const seen: Record<string, Map<string, number>> = {};
  for (const key of descriptor.duplicateKeys) seen[key.field] = new Map();

  return rows.map((raw, index) => {
    const rowNumber = index + 2;
    const mapped: Record<string, string> = {};
    for (const field of descriptor.fields) {
      const source = mapping[field.key];
      mapped[field.key] = source ? (raw[source] ?? "").trim() : "";
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    for (const field of descriptor.fields) {
      const value = mapped[field.key] ?? "";
      if (field.required && !value) {
        errors.push(`${field.label} is required`);
        continue;
      }
      const message = field.validate?.(value);
      if (message) errors.push(`${field.label}: ${message}`);
    }

    for (const key of descriptor.duplicateKeys) {
      const value = mapped[key.field] ?? "";
      if (!value) continue;
      const normalised = key.normalise(value);
      if (!normalised) continue;

      const firstSeen = seen[key.field]!.get(normalised);
      if (firstSeen !== undefined) {
        errors.push(`Same ${key.label} as row ${firstSeen}`);
      } else {
        seen[key.field]!.set(normalised, rowNumber);
      }

      if (existing[key.field]?.has(normalised)) {
        warnings.push(`A record already exists with this ${key.label}`);
      }
    }

    return { rowNumber, raw, mapped, errors, warnings };
  });
}

export interface ValidationSummary {
  total: number;
  willImport: number;
  withWarnings: number;
  skipped: number;
}

export function summarise(rows: ValidatedRow[]): ValidationSummary {
  const valid = rows.filter((r) => r.errors.length === 0);
  return {
    total: rows.length,
    willImport: valid.length,
    withWarnings: valid.filter((r) => r.warnings.length > 0).length,
    skipped: rows.length - valid.length,
  };
}

/* ── Template generation ───────────────────────────────────────────
   The user asked for a starter template. Generating it from the same
   descriptor the importer validates against means the template can
   never drift from what the import accepts.                          */

export function templateCsv(descriptor: ImportDescriptor): string {
  const headers = descriptor.fields.map((f) => f.label);
  return Papa.unparse({
    fields: headers,
    data: descriptor.samples.map((sample) => headers.map((h) => sample[h] ?? "")),
  });
}

export function downloadCsvTemplate(descriptor: ImportDescriptor): void {
  // The BOM makes Excel open UTF-8 correctly — without it, ₹ and
  // accented names arrive mangled.
  const blob = new Blob(["﻿" + templateCsv(descriptor)], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, `fidato-${descriptor.entity}-template.csv`);
}

/** A workbook with the template plus a field guide on a second sheet. */
export async function downloadExcelTemplate(descriptor: ImportDescriptor): Promise<void> {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();

  const headers = descriptor.fields.map((f) => f.label);
  const dataSheet = XLSX.utils.json_to_sheet(
    descriptor.samples.map((sample) =>
      Object.fromEntries(headers.map((h) => [h, sample[h] ?? ""])),
    ),
    { header: headers },
  );
  dataSheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  XLSX.utils.book_append_sheet(book, dataSheet, descriptor.label);

  const guide = XLSX.utils.json_to_sheet(
    descriptor.fields.map((f) => ({
      Column: f.label,
      Required: f.required ? "Yes" : "No",
      Example: f.example,
      Notes: f.hint ?? "",
      "Also accepts these headings": f.aliases.join(", "),
    })),
  );
  guide["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 60 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(book, guide, "Field guide");

  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  triggerDownload(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `fidato-${descriptor.entity}-template.xlsx`,
  );
}

/** Rows the import rejected, so they can be corrected and re-uploaded. */
export function downloadErrorReport(
  rows: ValidatedRow[],
  descriptor: ImportDescriptor,
): void {
  const failed = rows.filter((r) => r.errors.length > 0);
  if (!failed.length) return;

  const csv = Papa.unparse({
    fields: ["Row", "Problem", ...descriptor.fields.map((f) => f.label)],
    data: failed.map((r) => [
      r.rowNumber,
      r.errors.join("; "),
      ...descriptor.fields.map((f) => r.mapped[f.key] ?? ""),
    ]),
  });
  triggerDownload(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
    `fidato-${descriptor.entity}-errors.csv`,
  );
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
