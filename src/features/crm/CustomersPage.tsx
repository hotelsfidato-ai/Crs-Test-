import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users, GitMerge, Upload, Star } from "lucide-react";
import { useSession, useScope } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { customersRepo } from "@/data/repositories";
import { money, number, phone as formatPhone, relative } from "@/lib/format";
import {
  Page, PageHeader, Button, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, CUSTOMER_TONES, Avatar, Tooltip, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import type { Customer } from "@/data/types";

const FILTER_KEYS = ["status", "source"];

export default function CustomersPage() {
  const role = useSession((s) => s.role);
  const scope = useScope();
  const navigate = useNavigate();
  const list = useListState({
    filterKeys: FILTER_KEYS,
    defaultSortBy: "lastActivityAt",
    defaultSortDir: "desc",
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customers", list.query, scope.role, scope.userId],
    queryFn: () => customersRepo.list(list.query, scope),
  });

  const columns: Column<Customer>[] = [
    {
      key: "fullName",
      header: "Customer",
      sortable: true,
      cell: (c) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={c.fullName} color={c.vip ? "#df6128" : "#9aa2a9"} size="md" />
          <div className="min-w-0">
            <p className="font-medium text-ink-900 truncate flex items-center gap-1.5">
              {c.fullName}
              {c.vip && (
                <Tooltip content="VIP — notify the property before arrival">
                  <Star className="size-3 fill-brand-yellow text-brand-yellow shrink-0" />
                </Tooltip>
              )}
            </p>
            <p className="text-sm text-grey-500 truncate">{c.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "companyName", header: "Company", hideBelow: "md",
      cell: (c) =>
        c.companyName ? (
          <span className="text-grey-700">{c.companyName}</span>
        ) : (
          <span className="text-grey-400">Individual</span>
        ),
    },
    {
      key: "phone", header: "Phone", hideBelow: "xl",
      cell: (c) => <span className="text-grey-600 tabular">{formatPhone(c.phone)}</span>,
    },
    { key: "city", header: "City", hideBelow: "lg", cell: (c) => c.city },
    {
      key: "status", header: "Status", sortable: true,
      cell: (c) => (
        <StatusPill tone={CUSTOMER_TONES[c.status] ?? "neutral"}>{c.status}</StatusPill>
      ),
    },
    {
      key: "totalReservations", header: "Stays", numeric: true, sortable: true, hideBelow: "md",
      cell: (c) => number(c.totalReservations),
    },
    {
      key: "totalRevenue", header: "Revenue", numeric: true, sortable: true,
      cell: (c) => (c.totalRevenue ? money(c.totalRevenue) : <span className="text-grey-400">—</span>),
    },
    {
      key: "ownerName", header: "Owner", hideBelow: "xl",
      cell: (c) => <span className="text-grey-600">{c.ownerName}</span>,
    },
    {
      key: "lastActivityAt", header: "Last activity", sortable: true, hideBelow: "xl",
      cell: (c) => <span className="text-grey-500">{relative(c.lastActivityAt)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Customers"
        description={
          role === "salesperson"
            ? `Guests and contacts on your accounts — scoped to ${ROLE_LABELS[role]}`
            : "Every guest and booking contact across the platform"
        }
        actions={
          <>
            {can(role, "merge", "customer") && (
              <Button asChild variant="secondary" leadingIcon={<GitMerge className="size-4" />}>
                <Link to="/crm/merge">Duplicates</Link>
              </Button>
            )}
            {can(role, "import", "customer") && (
              <Button asChild variant="secondary" leadingIcon={<Upload className="size-4" />}>
                <Link to="/crm/import">Import</Link>
              </Button>
            )}
            {can(role, "create", "customer") && (
              <Button asChild variant="primary" leadingIcon={<Plus className="size-4" />}>
                <Link to="/crm/customers/new">New customer</Link>
              </Button>
            )}
          </>
        }
      />

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search name, email or phone…"
        filters={[
          {
            key: "status", label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "lead", label: "Lead" },
              { value: "inactive", label: "Inactive" },
            ],
          },
          {
            key: "source", label: "Source",
            options: [
              { value: "direct", label: "Direct" },
              { value: "corporate", label: "Corporate" },
              { value: "referral", label: "Referral" },
              { value: "website", label: "Website" },
              { value: "ota", label: "OTA" },
              { value: "walk_in", label: "Walk-in" },
              { value: "campaign", label: "Campaign" },
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
        onRowClick={(c) => navigate(`/crm/customers/${c.id}`)}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            compact
            icon={<Users />}
            title="No customers yet"
            description="Customers are created here, imported from a file, or captured automatically when a booking comes in from the website."
            action={
              can(role, "create", "customer") && (
                <Button asChild variant="primary" size="sm">
                  <Link to="/crm/customers/new">Add the first customer</Link>
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
