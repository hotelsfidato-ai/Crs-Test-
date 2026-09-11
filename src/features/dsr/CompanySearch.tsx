import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Link2, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { companiesRepo } from "@/data/repositories";
import { companyNameKey } from "@/lib/companyName";
import { Input } from "@/components/ui";
import type { Company } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   COMPANY SEARCH — the DSR's "Name of the Company" cell

   Type a name: companies already in this salesperson's book are listed
   as you type. Pick one and the visit links to it; keep typing a name
   that is not there and saving creates it as a new lead.

   ⚠️ Searches in the database, a handful at a time — never by loading
   every company into the browser, which is the read-budget risk in
   docs/PLAN.md Phase 2. The list is scoped to `ownerId`'s book, so a
   visit never links onto a colleague's account.
   ══════════════════════════════════════════════════════════════════ */

export interface CompanyPick {
  companyId?: string;
  companyName: string;
  /** Set when a company is picked — lets the form prefill its contact. */
  company?: Company;
}

export function CompanySearch({
  value, onChange, ownerId, invalid, autoFocus,
}: {
  value: CompanyPick;
  onChange: (next: CompanyPick) => void;
  ownerId: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(value.companyName);
  const [debounced, setDebounced] = useState(value.companyName);
  const box = useRef<HTMLDivElement>(null);

  // The form resets after a save; follow it.
  useEffect(() => {
    setTyped(value.companyName);
    setDebounced(value.companyName);
  }, [value.companyName]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(typed), 250);
    return () => clearTimeout(t);
  }, [typed]);

  const results = useQuery({
    queryKey: ["company-search", ownerId, companyNameKey(debounced)],
    queryFn: () => companiesRepo.search(debounced, ownerId),
    enabled: companyNameKey(debounced).length >= 2,
    staleTime: 30_000,
  });

  // Close on a click anywhere else.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const hits = results.data ?? [];
  const exact = hits.find((c) => c.nameKey === companyNameKey(typed));
  const trimmed = typed.trim();

  return (
    <div ref={box} className="relative">
      <Input
        value={typed}
        invalid={invalid}
        autoFocus={autoFocus}
        placeholder="Start typing a company…"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setTyped(e.target.value);
          setOpen(true);
          // Editing the text breaks a previous pick.
          onChange({ companyName: e.target.value });
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />

      {open && trimmed.length >= 2 && (
        <ul
          id={listId}
          role="listbox"
          /* The design system's popover surface and list, as in Combobox. */
          className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto scrollbar-quiet p-1 rounded-md border border-grey-200 bg-white shadow-popover motion-menu"
        >
          {results.isLoading && <li className="px-3 py-6 text-center text-sm text-grey-500">Searching…</li>}
          {results.isError && (
            <li className="px-3 py-5 text-center text-sm text-brand-red">Could not search. Keep typing to add a new company.</li>
          )}
          {hits.map((c) => (
            <li key={c.id} role="option" aria-selected={value.companyId === c.id}>
              <button
                type="button"
                className="flex items-start gap-2.5 w-full px-2.5 py-2 rounded-sm text-left transition-colors duration-150 hover:bg-grey-100 focus:bg-grey-100 outline-none"
                onClick={() => {
                  setTyped(c.name);
                  setOpen(false);
                  onChange({ companyId: c.id, companyName: c.name, company: c });
                }}
              >
                <Building2 className="size-4 text-grey-400 mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base text-ink-900 truncate">{c.name}</span>
                  <span className="block text-sm text-grey-500 truncate">
                    {[c.contacts[0]?.name, c.city || c.address].filter(Boolean).join(" · ") || "No details yet"}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!results.isLoading && !exact && (
            <li className="mt-1 px-2.5 py-2 text-sm text-grey-500 flex items-center gap-2 border-t border-grey-100">
              <Plus className="size-4 shrink-0" />
              Not listed. Saving adds <strong className="font-medium text-ink-900">{trimmed}</strong> as a new company
            </li>
          )}
        </ul>
      )}

      {/* What saving will do, said before it happens. */}
      {trimmed.length > 0 && (
        <p
          className={cn(
            "mt-1.5 text-xs flex items-center gap-1.5",
            value.companyId ? "text-success-600" : "text-grey-500",
          )}
        >
          {value.companyId ? (
            <>
              <Link2 className="size-3" /> Linked to the company already on file
            </>
          ) : exact ? (
            <>
              <Link2 className="size-3" /> Matches <strong className="font-medium">{exact.name}</strong>, so it will link to that
            </>
          ) : (
            <>
              <Plus className="size-3" /> New, so it will be added to Companies as a lead
            </>
          )}
        </p>
      )}
    </div>
  );
}
