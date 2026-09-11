import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, DialogClose, DialogContent, Field, Input, fieldProps } from "@/components/ui";
import type { ImportDescriptor, ImportField } from "./descriptors";
import type { ValidatedRow } from "./engine";

/* ══════════════════════════════════════════════════════════════════
   ROW EDITOR

   Fix a rejected row on the review screen instead of editing the
   spreadsheet and uploading it again.

   ⚠️ The row is re-checked against the WHOLE file as it is typed, not
   field by field. A property renamed to match another in the same city
   is only a duplicate in the context of every other row, and a check
   that passed here but failed on save would be worse than no check.
   ══════════════════════════════════════════════════════════════════ */

export interface RowEditorProps {
  row: ValidatedRow;
  descriptor: ImportDescriptor;
  /** The row's values as read from the file, before any correction. */
  fileValues: Record<string, string>;
  /** Re-validates this row with a draft applied, in the context of the file. */
  check: (draft: Record<string, string>) => ValidatedRow | undefined;
  /**
   * Only the fields that differ from the file (empty means "back to the
   * file"), and whether the row now passes.
   */
  onSave: (changes: Record<string, string>, fixed: boolean) => void;
}

export function RowEditor({ row, descriptor, fileValues, check, onSave }: RowEditorProps) {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...row.mapped }));
  const preview = useMemo(() => check(draft) ?? row, [check, draft, row]);

  /* Fixed when the editor opens and never re-sorted while typing: a field
     that jumped to the other section the moment it became valid would
     take the cursor with it. */
  const [problemKeys] = useState(() => new Set(Object.keys(row.fieldErrors)));
  const problems = descriptor.fields.filter((f) => problemKeys.has(f.key));
  const others = descriptor.fields.filter((f) => !problemKeys.has(f.key));

  const changes = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of descriptor.fields) {
      const value = (draft[f.key] ?? "").trim();
      if (value !== (fileValues[f.key] ?? "")) out[f.key] = value;
    }
    return out;
  }, [draft, fileValues, descriptor.fields]);
  const changed = Object.keys(changes).length > 0;
  const fixed = preview.errors.length === 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(changes, fixed);
  }

  const renderField = (f: ImportField, autoFocus: boolean) => {
    const original = fileValues[f.key] ?? "";
    const differs = (draft[f.key] ?? "").trim() !== original;
    return (
      <Field
        key={f.key}
        label={f.label}
        required={f.required}
        error={preview.fieldErrors[f.key]}
        hint={differs ? `In the file: ${original || "blank"}` : f.hint}
      >
        {(p) => (
          <Input
            {...fieldProps(p)}
            autoFocus={autoFocus}
            value={draft[f.key] ?? ""}
            placeholder={f.example}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        )}
      </Field>
    );
  };

  const name = preview.mapped[descriptor.fields[0]!.key] || `Row ${row.rowNumber}`;

  return (
    <DialogContent
      size="lg"
      title={row.errors.length ? `Fix row ${row.rowNumber}` : `Edit row ${row.rowNumber}`}
      description={`${name}. Changes apply to this import only; your file is not changed.`}
      footer={
        <>
          {changed && (
            <Button
              variant="ghost"
              className="mr-auto"
              leadingIcon={<RotateCcw className="size-4" />}
              onClick={() => setDraft({ ...fileValues })}
            >
              Reset to file
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="import-row-editor" variant="primary">
            Save changes
          </Button>
        </>
      }
    >
      <form id="import-row-editor" onSubmit={submit} className="space-y-6">
        <div
          role="status"
          className={cn(
            "flex items-start gap-3 p-4 rounded-md border",
            fixed ? "bg-success-50 border-success-100" : "bg-brand-red-50 border-brand-red-100",
          )}
        >
          {fixed ? (
            <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="size-4 text-brand-red shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className={cn("text-base font-medium", fixed ? "text-success" : "text-brand-red")}>
              {fixed ? "This row will be imported" : "This row is still rejected"}
            </p>
            {fixed ? (
              preview.warnings.length > 0 && (
                <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                  {preview.warnings.join("; ")}
                </p>
              )
            ) : (
              <p className="text-sm text-brand-red mt-1 leading-relaxed">
                {preview.errors.join("; ")}
              </p>
            )}
          </div>
        </div>

        {problems.length > 0 && (
          <section>
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-grey-500 mb-3">
              Needs fixing
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {problems.map((f, i) => renderField(f, i === 0))}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-2xs font-semibold uppercase tracking-wide text-grey-500 mb-3">
            {problems.length > 0 ? "Other fields" : "Fields"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {others.map((f, i) => renderField(f, problems.length === 0 && i === 0))}
          </div>
        </section>
      </form>
    </DialogContent>
  );
}
