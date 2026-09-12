import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Building2 } from "lucide-react";
import { useActor, useSession, useScope } from "@/lib/session";
import { can, ROLE_LABELS, OWNER_ROLES, type Role } from "@/lib/permissions";
import { adminRepo, companiesRepo } from "@/data/repositories";
import { COMPANY_DETAIL_OPTIONS } from "@/lib/companyDetails";
import { money, number, percent, humanise, relative } from "@/lib/format";
import {
  Page, PageHeader, Button, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, COMPANY_TONES, ProgressBar, Tooltip, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import { OwnerTag } from "@/features/shared/OwnerTag";
import type { Company } from "@/data/types";

const FILTER_KEYS = ["status", "tier", "ownerId", "detailTags"];

/**
 * Everyone whose name a company can sit under.
 *
 * ⚠️ Wider than who can be TAGGED (assignableOwners). An Owner or Admin
 * who imports without choosing someone owns those records themselves,
 * and a disabled salesperson's leads still exist and still need finding
 * — so both appear here, the disabled ones labelled, where the
 * assignment picker leaves them out.
 */
const BOOK_ROLES: readonly Role[] = ["owner", "admin", ...OWNER_ROLES];

const TIER_TONES = {
  key_account: "accent",
  corporate: "info",
  sme: "neutral",
  travel_agent: "warning",
} as const;

export default function CompaniesPage() {
  const role = useSession((s) => s.role);
  const scope = useScope();
  const navigate = useNavigate();
  const list = useListState({
    filterKeys: FILTER_KEYS,
    defaultSortBy: "totalRevenue",
    defaultSortDir: "desc",
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["companies", list.query, scope.role, scope.userId],
    queryFn: () => companiesRepo.list(list.query, scope),
  });

  /* ⚠️ No salesperson filter FOR a salesperson — they only ever see their
     own book, so the control could only offer "me" or an empty list. */
  const actor = useActor();
  const showOwnerFilter = role !== "salesperson";
  const staff = useQuery({
    queryKey: ["staff-directory"],
    queryFn: () => adminRepo.allUsers(),
    enabled: showOwnerFilter,
    staleTime: 5 * 60_000,
  });
  const ownerOptions = useMemo(() => {
    const people = (staff.data ?? [])
      .filter((u) => BOOK_ROLES.includes(u.role) && u.id !== actor.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({
        value: u.id,
        label: u.status === "disabled" ? `${u.name} (disabled)` : u.name,
      }));
    return [{ value: actor.id, label: `${actor.name} (me)` }, ...people];
  }, [staff.data, actor.id, actor.name]);

  const columns: Column<Company>[] = [
    {
      key: "name", header: "Company", sortable: true,
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 truncate">{c.name}</p>
          {/* An imported lead usually has no industry — the city is the
              next most useful thing to tell two similar names apart. */}
          <p className="text-sm text-grey-500 truncate">{c.industry || c.city}</p>
        </div>
      ),
    },
    {
      /* The first contact person is the primary one. A lead list is worked
         by phone, so the number sits right under the name. */
      key: "contacts", header: "Contact",
      cell: (c) => {
        const primary = c.contacts[0];
        if (!primary) return <span className="text-grey-400">-</span>;
        const more = c.contacts.length - 1;
        return (
          <div className="min-w-0">
            <p className="text-ink-900 truncate">
              {primary.name}
              {more > 0 && <span className="text-grey-400"> +{more}</span>}
            </p>
            {primary.phone && (
              <p className="text-sm text-grey-500 tabular truncate">{primary.phone}</p>
            )}
          </div>
        );
      },
    },
    {
      /* Whose lead this is — third column, visible at every width. It sat
         ninth, behind five money columns that are all zero on a new lead,
         and hid below the lg breakpoint. For a salesperson it is always
         themselves, so it is dropped rather than repeated on every row. */
      key: "ownerName", header: "Salesperson",
      cell: (c) => <OwnerTag ownerId={c.ownerId} ownerName={c.ownerName} />,
    },
    {
      key: "tier", header: "Tier", hideBelow: "md",
      cell: (c) => (
        <StatusPill tone={TIER_TONES[c.tier]} dot={false}>
          {humanise(c.tier)}
        </StatusPill>
      ),
    },
    { key: "city", header: "City", hideBelow: "lg", cell: (c) => c.city },
    {
      key: "status", header: "Status", hideBelow: "md",
      cell: (c) => (
        <StatusPill tone={COMPANY_TONES[c.status] ?? "neutral"}>{c.status}</StatusPill>
      ),
    },
    {
      key: "creditUsed", header: "Credit used", numeric: true, hideBelow: "xl",
      cell: (c) => {
        const utilisation = c.creditLimit > 0 ? (c.creditUsed / c.creditLimit) * 100 : 0;
        return (
          <Tooltip content={`${money(c.creditUsed)} of ${money(c.creditLimit)}`}>
            <div className="min-w-[92px] inline-block">
              <p className="tabular">{percent(utilisation, 0)}</p>
              <ProgressBar
                value={utilisation}
                tone={utilisation > 80 ? "danger" : utilisation > 60 ? "warning" : "success"}
                className="mt-1.5"
              />
            </div>
          </Tooltip>
        );
      },
    },
    {
      key: "totalReservations", header: "Bookings", numeric: true, hideBelow: "md",
      cell: (c) => number(c.totalReservations),
    },
    {
      key: "totalRevenue", header: "Revenue", numeric: true, sortable: true,
      cell: (c) =>
        c.totalRevenue ? (
          <span className="font-medium">{money(c.totalRevenue)}</span>
        ) : (
          <span className="text-grey-400">-</span>
        ),
    },
    {
      key: "lastActivityAt", header: "Last activity", sortable: true, hideBelow: "xl",
      cell: (c) => <span className="text-grey-500">{relative(c.lastActivityAt)}</span>,
    },
  ];

  const shownColumns = showOwnerFilter
    ? columns
    : columns.filter((col) => col.key !== "ownerName");

  return (
    <Page>
      <PageHeader
        title="Companies"
        description={
          role === "salesperson"
            ? `Corporate accounts assigned to you, scoped to ${ROLE_LABELS[role]}`
            : "Corporate accounts, travel agents and their negotiated terms"
        }
        actions={
          can(role, "create", "company") && (
            <Button asChild variant="primary" leadingIcon={<Plus className="size-4" />}>
              <Link to="/crm/companies/new">New company</Link>
            </Button>
          )
        }
      />

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search name, industry or GSTIN…"
        filters={[
          {
            key: "status", label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "prospect", label: "Prospect" },
              { value: "dormant", label: "Dormant" },
            ],
          },
          {
            key: "tier", label: "Tier",
            options: [
              { value: "key_account", label: "Key account" },
              { value: "corporate", label: "Corporate" },
              { value: "sme", label: "SME" },
              { value: "travel_agent", label: "Travel agent" },
            ],
          },
          ...(showOwnerFilter
            ? [{ key: "ownerId", label: "Salesperson", options: ownerOptions }]
            : []),
          /* Which details a company has — work a list through ("has a
             contact number") or clean it up ("no email"). */
          { key: "detailTags", label: "Details", options: COMPANY_DETAIL_OPTIONS },
        ]}
        values={list.filters}
        onFilterChange={list.setFilter}
        onClear={list.clear}
      />

      <DataTable
        columns={shownColumns}
        rows={data?.items ?? []}
        rowKey={(c) => c.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        onRowClick={(c) => navigate(`/crm/companies/${c.id}`)}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            compact
            icon={<Building2 />}
            title={
              role === "salesperson"
                ? "No accounts assigned to you"
                : "No companies yet"
            }
            description={
              role === "salesperson"
                ? "A sales manager assigns accounts. Switch role in the top bar to see the full list."
                : "Corporate accounts carry negotiated rates, credit limits and payment terms."
            }
            action={
              can(role, "create", "company") && (
                <Button asChild variant="primary" size="sm">
                  <Link to="/crm/companies/new">Add a company</Link>
                </Button>
              )
            }
          />
        }
      />

      {data && data.total > 0 && (
        <Pagination
          className="mt-4"
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={list.setPage}
        />
      )}

      {data?.searchCapped && (
        <p className="text-xs text-grey-500 mt-3 leading-relaxed">
          Search looked through the first {number(data.searchCapped)} companies in this order. If the
          one you want is not here, narrow the list with a filter (salesperson, status or tier) and
          search again.
        </p>
      )}
    </Page>
  );
}
