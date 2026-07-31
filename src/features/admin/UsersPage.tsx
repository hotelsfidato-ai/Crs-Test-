import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users, ShieldCheck } from "lucide-react";
import { adminRepo, db } from "@/data/repositories";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { dateShort, relative, humanise } from "@/lib/format";
import {
  Page, PageHeader, Button, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, Card, Stat, Avatar, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import type { User } from "@/data/types";

const FILTER_KEYS = ["role", "isActive"];

export default function UsersPage() {
  const list = useListState({
    filterKeys: FILTER_KEYS,
    defaultSortBy: "name",
    defaultSortDir: "asc",
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["users", list.query],
    queryFn: () => adminRepo.users(list.query),
  });

  const active = db.users.filter((u) => u.isActive);
  const roleCount = new Set(db.users.map((u) => u.role)).size;

  const columns: Column<User>[] = [
    {
      key: "name", header: "Person", sortable: true,
      cell: (u) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={u.name} color="#9aa2a9" size="md" />
          <div className="min-w-0">
            <p className="font-medium text-ink-900 truncate">{u.name}</p>
            <p className="text-sm text-grey-500 truncate">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role", header: "Role", sortable: true,
      cell: (u) => (
        <StatusPill tone={u.role === "super_admin" ? "accent" : "neutral"} dot={false}>
          {ROLE_LABELS[u.role as Role] ?? humanise(u.role)}
        </StatusPill>
      ),
    },
    { key: "department", header: "Department", hideBelow: "lg", cell: (u) => u.department },
    {
      key: "hotelName", header: "Property", hideBelow: "xl",
      cell: (u) =>
        u.hotelName ? (
          <Link
            to={`/hotels/${u.hotelId}`}
            className="text-brand-orange hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {u.hotelName}
          </Link>
        ) : (
          <span className="text-grey-400">All properties</span>
        ),
    },
    {
      key: "lastSeenAt", header: "Last active", sortable: true, hideBelow: "md",
      cell: (u) => <span className="text-grey-500">{relative(u.lastSeenAt)}</span>,
    },
    {
      key: "isActive", header: "Status", sortable: true,
      cell: (u) => (
        <StatusPill tone={u.isActive ? "success" : "neutral"}>
          {u.isActive ? "Active" : "Suspended"}
        </StatusPill>
      ),
    },
    {
      key: "createdAt", header: "Joined", sortable: true, hideBelow: "xl",
      cell: (u) => <span className="tabular text-grey-500">{dateShort(u.createdAt)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Users"
        description="Everyone with access to the platform, and what each of them can do."
        actions={
          <Button asChild variant="secondary" leadingIcon={<ShieldCheck className="size-4" />}>
            <Link to="/admin/roles">Roles &amp; permissions</Link>
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Users" value={db.users.length} hint={`${active.length} active`} />
        </Card>
        <Card className="p-5">
          <Stat label="Roles in use" value={roleCount} hint="Of 8 defined" />
        </Card>
        <Card className="p-5">
          <Stat
            label="Property staff"
            value={db.users.filter((u) => u.role === "hotel_manager").length}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Sales team"
            value={
              db.users.filter((u) => u.role === "salesperson" || u.role === "sales_manager").length
            }
          />
        </Card>
      </div>

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search name, email or department…"
        filters={[
          {
            key: "role", label: "Role",
            options: (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({
              value: r,
              label: ROLE_LABELS[r],
            })),
          },
          {
            key: "isActive", label: "Status",
            options: [
              { value: "true", label: "Active" },
              { value: "false", label: "Suspended" },
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
        rowKey={(u) => u.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            compact
            icon={<Users />}
            title="No users"
            description="Invite colleagues and assign them a role to give them access."
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

      <p className="text-xs text-grey-400 mt-4">
        There is no login in Phase 1 — use the role switcher in the top bar to view the
        platform as any of these roles. Real accounts and sign-in arrive with Firebase
        Auth in Phase 2.
      </p>
    </Page>
  );
}
