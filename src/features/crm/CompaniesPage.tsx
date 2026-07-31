import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Building2 } from "lucide-react";
import { useSession, useScope } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { companiesRepo } from "@/data/repositories";
import { money, number, percent, humanise, relative } from "@/lib/format";
import {
  Page, PageHeader, Button, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, COMPANY_TONES, ProgressBar, Tooltip, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import { OwnerTag } from "@/features/shared/OwnerTag";
import type { Company } from "@/data/types";

const FILTER_KEYS = ["status", "tier"];

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

  const columns: Column<Company>[] = [
    {
      key: "name", header: "Company", sortable: true,
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 truncate">{c.name}</p>
          <p className="text-sm text-grey-500 truncate">{c.industry}</p>
        </div>
      ),
    },
    {
      key: "tier", header: "Tier", sortable: true,
      cell: (c) => (
        <StatusPill tone={TIER_TONES[c.tier]} dot={false}>
          {humanise(c.tier)}
        </StatusPill>
      ),
    },
    { key: "city", header: "City", hideBelow: "lg", cell: (c) => c.city },
    {
      key: "status", header: "Status", sortable: true, hideBelow: "md",
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
      key: "totalReservations", header: "Bookings", numeric: true, sortable: true, hideBelow: "md",
      cell: (c) => number(c.totalReservations),
    },
    {
      key: "totalRevenue", header: "Revenue", numeric: true, sortable: true,
      cell: (c) =>
        c.totalRevenue ? (
          <span className="font-medium">{money(c.totalRevenue)}</span>
        ) : (
          <span className="text-grey-400">—</span>
        ),
    },
    {
      key: "ownerName", header: "Lead owner", sortable: true, hideBelow: "lg",
      cell: (c) => <OwnerTag ownerId={c.ownerId} ownerName={c.ownerName} />,
    },
    {
      key: "lastActivityAt", header: "Last activity", sortable: true, hideBelow: "xl",
      cell: (c) => <span className="text-grey-500">{relative(c.lastActivityAt)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Companies"
        description={
          role === "salesperson"
            ? `Corporate accounts assigned to you — scoped to ${ROLE_LABELS[role]}`
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
        ]}
        values={list.filters}
        onFilterChange={list.setFilter}
        onClear={list.clear}
      />

      <DataTable
        columns={columns}
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
    </Page>
  );
}
