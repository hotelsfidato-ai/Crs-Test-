import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

/* ══════════════════════════════════════════════════════════════════
   LIST STATE
   Search, filters, sort and page kept in the URL so a filtered view
   is shareable and survives a refresh — which is what people
   actually expect from an internal tool.
   ══════════════════════════════════════════════════════════════════ */

export interface ListState {
  search: string;
  setSearch: (value: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  sortBy?: string;
  sortDir: "asc" | "desc";
  toggleSort: (key: string) => void;
  page: number;
  setPage: (page: number) => void;
  clear: () => void;
  /** True when anything is narrowing the list — drives the no-results state. */
  hasFilters: boolean;
  /** Ready to hand straight to a repository. */
  query: {
    search: string;
    filters: Record<string, string>;
    sortBy?: string;
    sortDir: "asc" | "desc";
    page: number;
    pageSize: number;
  };
}

export function useListState(options?: {
  filterKeys?: string[];
  defaultSortBy?: string;
  defaultSortDir?: "asc" | "desc";
  pageSize?: number;
}): ListState {
  const {
    filterKeys = [],
    defaultSortBy,
    defaultSortDir = "desc",
    pageSize = 25,
  } = options ?? {};

  const [params, setParams] = useSearchParams();
  // Debounced search would fight the URL, so the input is uncontrolled
  // against the URL and mirrored here for instant feedback.
  const [searchDraft, setSearchDraft] = useState(params.get("q") ?? "");

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          mutate(next);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setSearch = useCallback(
    (value: string) => {
      setSearchDraft(value);
      update((next) => {
        if (value) next.set("q", value);
        else next.delete("q");
        next.delete("page");
      });
    },
    [update],
  );

  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of filterKeys) {
      const value = params.get(key);
      if (value) out[key] = value;
    }
    return out;
  }, [params, filterKeys]);

  const setFilter = useCallback(
    (key: string, value: string) => {
      update((next) => {
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
        next.delete("page");
      });
    },
    [update],
  );

  const sortBy = params.get("sort") ?? defaultSortBy;
  const sortDir = (params.get("dir") as "asc" | "desc") ?? defaultSortDir;

  const toggleSort = useCallback(
    (key: string) => {
      update((next) => {
        const currentSort = next.get("sort") ?? defaultSortBy;
        const currentDir = next.get("dir") ?? defaultSortDir;
        if (currentSort === key) {
          next.set("dir", currentDir === "asc" ? "desc" : "asc");
        } else {
          next.set("sort", key);
          next.set("dir", "asc");
        }
        next.delete("page");
      });
    },
    [update, defaultSortBy, defaultSortDir],
  );

  const page = Number(params.get("page") ?? 1);

  const setPage = useCallback(
    (value: number) => {
      update((next) => {
        if (value > 1) next.set("page", String(value));
        else next.delete("page");
      });
    },
    [update],
  );

  const clear = useCallback(() => {
    setSearchDraft("");
    update((next) => {
      next.delete("q");
      next.delete("page");
      for (const key of filterKeys) next.delete(key);
    });
  }, [update, filterKeys]);

  const search = params.get("q") ?? "";

  return {
    search: searchDraft,
    setSearch,
    filters,
    setFilter,
    sortBy,
    sortDir,
    toggleSort,
    page,
    setPage,
    clear,
    hasFilters: Boolean(search) || Object.keys(filters).length > 0,
    query: { search, filters, sortBy, sortDir, page, pageSize },
  };
}
