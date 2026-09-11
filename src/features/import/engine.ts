import Papa from "papaparse";
import type { ImportContext, ImportDescriptor, ImportField } from "./descriptors";
import { duplicateValue } from "@/lib/duplicateKey";

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

/**
 * Reads a CSV or workbook. For a workbook with several sheets, `descriptor`
 * picks the sheet whose headings match its columns best.
 *
 * ⚠️ Not simply the first sheet. A workbook that opens on a "Read me" or
 * a summary tab would otherwise have its instructions validated as data:
 * every line rejected, nothing imported, and no hint that the rows were
 * one tab over.
 */
export async function parseFile(
  file: File,
  sheetName?: string,
  descriptor?: ImportDescriptor,
): Promise<ParsedFile> {
  return isExcel(file.name) ? parseExcel(file, sheetName, descriptor) : parseCsv(file);
}

/** How many of the descriptor's columns a heading row names outright (label, key or alias). */
function headingMatches(headers: string[], descriptor: ImportDescriptor): number {
  const names = new Set(headers.map(squash));
  return descriptor.fields.filter((f) =>
    [f.label, f.key, ...f.aliases].some((n) => names.has(squash(n))),
  ).length;
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

async function parseExcel(
  file: File,
  sheetName?: string,
  descriptor?: ImportDescriptor,
): Promise<ParsedFile> {
  // Lazy — keeps ~400 kB out of every other route.
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });

  const sheets = book.SheetNames;
  let active = sheetName && sheets.includes(sheetName) ? sheetName : sheets[0];
  if (!sheetName && descriptor && sheets.length > 1) {
    let best = 0;
    for (const name of sheets) {
      const [heading] = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name]!, {
        header: 1, blankrows: false,
      });
      const score = headingMatches((heading ?? []).map((h) => String(h ?? "").trim()), descriptor);
      // Strictly better only, so a tie keeps the earlier sheet.
      if (score > best) {
        best = score;
        active = name;
      }
    }
  }
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

/** One file row as the descriptor's fields, straight from the mapped columns. */
export function mapRow(
  raw: Record<string, string>,
  mapping: Record<string, string>,
  descriptor: ImportDescriptor,
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const field of descriptor.fields) {
    const source = mapping[field.key];
    mapped[field.key] = source ? (raw[source] ?? "").trim() : "";
  }
  return mapped;
}

export interface ValidatedRow {
  /** 1-based spreadsheet row, counting the header. */
  rowNumber: number;
  raw: Record<string, string>;
  mapped: Record<string, string>;
  errors: string[];
  warnings: string[];
  /** Neutral information — nothing to fix. "Added to row 4 as another contact." */
  notes: string[];
  /** Normalised grouping value, when the descriptor groups rows. */
  groupKey?: string;
  /** The row this one was combined into, when it is not the first of its group. */
  mergedInto?: number;
  /**
   * The problem with each field, keyed by field. What the row editor
   * highlights, so the person fixing row 23 is taken to the cell at fault
   * rather than handed a sentence to decode.
   */
  fieldErrors: Record<string, string>;
  /** Fields whose value was typed on the review screen, not read from the file. */
  edited: string[];
}

/**
 * Corrections typed on the review screen, by spreadsheet row, then field.
 *
 * ⚠️ Applied OVER the file, never written back into it. The parsed file
 * stays exactly as uploaded, so "Reset to file" is always possible and a
 * re-mapped column cannot silently discard someone's correction.
 */
export type RowEdits = Record<number, Record<string, string>>;

export interface ExistingKeys {
  /** Normalised values already stored, per duplicate-key field. */
  [field: string]: Set<string>;
}

export function validateRows(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  descriptor: ImportDescriptor,
  existing: ExistingKeys = {},
  edits: RowEdits = {},
  ctx?: ImportContext,
): ValidatedRow[] {
  /* Duplicates *within the file* are errors — a file containing the
     same person twice is a mistake in the file. Collisions with stored
     records are warnings, resolved afterwards on the merge screen.

     ⚠️ EXCEPT within a group. When the descriptor groups rows, two rows
     sharing the grouping key are one record described twice — the same
     company with a second contact — and flagging them would reject the
     very rows grouping exists to keep. */
  const seen: Record<string, Map<string, { row: number; group?: string }>> = {};
  for (const key of descriptor.duplicateKeys) seen[key.field] = new Map();
  const grouping = descriptor.groupBy;

  const validated = rows.map((raw, index): ValidatedRow => {
    const rowNumber = index + 2;
    const mapped = mapRow(raw, mapping, descriptor);
    const edit = edits[rowNumber] ?? {};
    const edited: string[] = [];
    for (const [key, value] of Object.entries(edit)) {
      if (!(key in mapped)) continue;
      mapped[key] = value.trim();
      edited.push(key);
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const fieldErrors: Record<string, string> = {};
    const groupValue = grouping ? grouping.normalise(mapped[grouping.field] ?? "") : "";
    const groupKey = groupValue || undefined;

    for (const field of descriptor.fields) {
      const value = mapped[field.key] ?? "";
      if (field.required && !value) {
        errors.push(`${field.label} is required`);
        fieldErrors[field.key] = "Required";
        continue;
      }
      const message = field.validate?.(value);
      if (!message) continue;
      if (field.lenient) warnings.push(`${field.label}: ${message}`);
      else {
        errors.push(`${field.label}: ${message}`);
        fieldErrors[field.key] = message;
      }
    }

    /* ⚠️ Only once the cells are individually sound. Told that a row is
       half a bank block while the account number is also unreadable,
       the operator fixes the wrong thing. */
    const notes: string[] = [];
    if (!errors.length) {
      const row = descriptor.checkRow?.(mapped, ctx);
      if (row?.errors) errors.push(...row.errors);
      if (row?.warnings) warnings.push(...row.warnings);
      if (row?.notes) notes.push(...row.notes);
      for (const [key, message] of Object.entries(row?.fieldErrors ?? {})) {
        fieldErrors[key] ??= message;
      }
    }

    for (const key of descriptor.duplicateKeys) {
      const normalised = duplicateValue(key, (f) => mapped[f]);
      if (!normalised) continue;

      const firstSeen = seen[key.field]!.get(normalised);
      if (firstSeen !== undefined) {
        const sameGroup = groupKey !== undefined && firstSeen.group === groupKey;
        if (!sameGroup) {
          const message = `Same ${key.label} as row ${firstSeen.row}`;
          errors.push(message);
          for (const f of [key.field, ...(key.with ?? [])]) fieldErrors[f] ??= message;
        }
      } else {
        seen[key.field]!.set(normalised, { row: rowNumber, group: groupKey });
      }

      if (existing[key.field]?.has(normalised)) {
        warnings.push(`A record already exists with this ${key.label}`);
      }
    }

    return { rowNumber, raw, mapped, errors, warnings, notes, groupKey, fieldErrors, edited };
  });

  if (grouping) markGroups(validated, descriptor);
  return validated;
}

/**
 * Second pass: which valid rows join an earlier one.
 *
 * ⚠️ Only rows that will actually import take part. If the first "Tata
 * Motors" row is rejected, the second becomes the company rather than
 * being folded into a row that is never written.
 */
function markGroups(rows: ValidatedRow[], descriptor: ImportDescriptor): void {
  const grouping = descriptor.groupBy!;
  const first = new Map<string, ValidatedRow>();
  const labelOf = (key: string) => descriptor.fields.find((f) => f.key === key)?.label ?? key;

  for (const row of rows) {
    if (row.errors.length || !row.groupKey) continue;
    const head = first.get(row.groupKey);
    if (!head) {
      first.set(row.groupKey, row);
      continue;
    }

    row.mergedInto = head.rowNumber;
    row.notes.push(`Combined with row ${head.rowNumber}, same ${labelOf(grouping.field).toLowerCase()}`);

    /* Same company, different city — probably two branches, possibly two
       companies that share a name. Combined, but said out loud. */
    for (const field of grouping.shouldAgree ?? []) {
      const a = (head.mapped[field] ?? "").trim();
      const b = (row.mapped[field] ?? "").trim();
      if (a && b && a.toLowerCase() !== b.toLowerCase()) {
        row.warnings.push(
          `${labelOf(field)} differs from row ${head.rowNumber} ("${a}" vs "${b}"). ` +
          `combined into one; check it is the same company`,
        );
      }
    }
  }
}

/**
 * The documents an import will write — one per row, or one per group.
 *
 * ⚠️ The ONLY path from validated rows to documents, so the count on
 * the button, the summary and what is actually written cannot disagree.
 */
export function buildDocuments(
  rows: ValidatedRow[],
  descriptor: ImportDescriptor,
  ctx?: ImportContext,
): Record<string, unknown>[] {
  const valid = rows.filter((r) => r.errors.length === 0);
  if (!descriptor.groupBy || !descriptor.toDocumentGroup) {
    return valid.map((r) => descriptor.toDocument(r.mapped, ctx));
  }

  const groups = new Map<string, Record<string, string>[]>();
  for (const r of valid) {
    const key = r.groupKey ?? `row:${r.rowNumber}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r.mapped);
    else groups.set(key, [r.mapped]);
  }
  return [...groups.values()].map((group) => descriptor.toDocumentGroup!(group));
}

export interface ValidationSummary {
  total: number;
  /** RECORDS that will be written — fewer than valid rows when rows combine. */
  willImport: number;
  withWarnings: number;
  skipped: number;
  /** Valid rows folded into an earlier row's record. */
  combined: number;
}

export function summarise(rows: ValidatedRow[]): ValidationSummary {
  const valid = rows.filter((r) => r.errors.length === 0);
  const combined = valid.filter((r) => r.mergedInto !== undefined).length;
  return {
    total: rows.length,
    willImport: valid.length - combined,
    withWarnings: valid.filter((r) => r.warnings.length > 0).length,
    skipped: rows.length - valid.length,
    combined,
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

/** Saves a Blob as a file. Shared by the importer and the DSR export. */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
