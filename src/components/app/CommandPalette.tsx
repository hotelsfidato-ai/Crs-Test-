import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Search, CalendarCheck, Users, Building2, Hotel, Receipt,
  CornerDownLeft, ArrowUp, ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useUi, useSession, useScope } from "@/lib/session";
import { searchRepo, type SearchHit } from "@/data/repositories";
import { flatNavigationFor } from "./navigation";

/* ══════════════════════════════════════════════════════════════════
   COMMAND PALETTE (⌘K / Ctrl-K)
   Two kinds of result: places you can go, and records you can open.
   Records come from the same scoped search the top bar uses, so a
   salesperson cannot reach another rep's accounts through it.
   ══════════════════════════════════════════════════════════════════ */

const HIT_ICONS = {
  reservation: CalendarCheck,
  customer: Users,
  company: Building2,
  hotel: Hotel,
  invoice: Receipt,
};

const HIT_LABELS = {
  reservation: "Reservation",
  customer: "Customer",
  company: "Company",
  hotel: "Property",
  invoice: "Invoice",
};

interface Entry {
  id: string;
  label: string;
  sublabel?: string;
  group: string;
  icon: typeof Search;
  to: string;
}

export function CommandPalette() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const role = useSession((s) => s.role);
  const scope = useScope();
  const navigate = useNavigate();

  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState(0);

  // ⌘K / Ctrl-K from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) {
      setTerm("");
      setCursor(0);
    }
  }, [open]);

  const { data: hits = [] } = useQuery({
    queryKey: ["search", term, scope.role, scope.userId],
    queryFn: () => searchRepo.query(term, scope),
    enabled: open && term.trim().length >= 2,
  });

  const entries = useMemo<Entry[]>(() => {
    const needle = term.trim().toLowerCase();

    const pages: Entry[] = flatNavigationFor(role)
      .filter((item) => !needle || item.label.toLowerCase().includes(needle))
      .map((item) => ({
        id: `nav-${item.to}`,
        label: item.label,
        group: "Go to",
        icon: item.icon,
        to: item.to,
      }));

    const records: Entry[] = (hits as SearchHit[]).map((hit) => ({
      id: `hit-${hit.type}-${hit.id}`,
      label: hit.title,
      sublabel: hit.subtitle,
      group: HIT_LABELS[hit.type],
      icon: HIT_ICONS[hit.type],
      to: hit.link,
    }));

    return [...pages.slice(0, needle ? 6 : 8), ...records];
  }, [term, role, hits]);

  useEffect(() => setCursor(0), [term]);

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      map.set(entry.group, [...(map.get(entry.group) ?? []), entry]);
    }
    return [...map.entries()];
  }, [entries]);

  function choose(entry: Entry) {
    // Close before navigating. Unmounting the route while the modal is
    // still open can strand Radix's scroll lock on <body>, which leaves
    // the whole app pointer-dead until a full reload.
    setOpen(false);
    navigate(entry.to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = entries[cursor];
      if (entry) choose(entry);
    }
  }

  let flatIndex = -1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/25 backdrop-blur-[2px] motion-fade" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-[600px] -translate-x-1/2",
            "bg-white rounded-lg shadow-overlay border border-grey-200 overflow-hidden motion-menu",
          )}
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search reservations, customers, companies and properties, or jump to a page.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-3 px-4 h-12 border-b border-grey-200">
            <Search className="size-4 text-grey-400 shrink-0" />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search or jump to…"
              className="flex-1 min-w-0 text-md bg-transparent outline-none placeholder:text-grey-400"
            />
            <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 rounded-xs bg-grey-100 text-2xs text-grey-500 font-medium">
              ESC
            </kbd>
          </div>

          <div className="max-h-[52vh] overflow-y-auto scrollbar-quiet p-2">
            {entries.length === 0 ? (
              <p className="px-3 py-10 text-center text-base text-grey-500">
                {term.trim().length < 2
                  ? "Type at least two characters to search records."
                  : "No matches."}
              </p>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group} className="mb-2 last:mb-0">
                  <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-grey-400">
                    {group}
                  </p>
                  {items.map((entry) => {
                    flatIndex++;
                    const active = flatIndex === cursor;
                    const Icon = entry.icon;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => choose(entry)}
                        onMouseMove={() => setCursor(entries.indexOf(entry))}
                        className={cn(
                          "flex items-center gap-3 w-full px-2.5 py-2 rounded-sm text-left",
                          "transition-colors duration-150",
                          active ? "bg-grey-100" : "hover:bg-grey-50",
                        )}
                      >
                        <Icon className="size-4 text-grey-400 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-base text-ink-900 truncate">
                            {entry.label}
                          </span>
                          {entry.sublabel && (
                            <span className="block text-sm text-grey-500 truncate">
                              {entry.sublabel}
                            </span>
                          )}
                        </span>
                        {active && <CornerDownLeft className="size-3.5 text-grey-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-4 px-4 h-9 border-t border-grey-200 bg-grey-50">
            <Hint icon={<ArrowUp className="size-3" />} label="Up" />
            <Hint icon={<ArrowDown className="size-3" />} label="Down" />
            <Hint icon={<CornerDownLeft className="size-3" />} label="Open" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Hint({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-grey-500">
      <kbd className="flex items-center justify-center size-4 rounded-xs bg-white border border-grey-200 text-grey-500">
        {icon}
      </kbd>
      {label}
    </span>
  );
}
