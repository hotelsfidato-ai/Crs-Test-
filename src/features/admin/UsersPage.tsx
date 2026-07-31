import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users, ShieldCheck } from "lucide-react";
import { adminRepo } from "@/data/repositories";
import { useActor } from "@/lib/session";
import { ASSIGNABLE_ROLES, ROLE_LABELS, type Role } from "@/lib/permissions";
import { dateShort, relative, humanise } from "@/lib/format";
import {
  Page, PageHeader, Button, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, Card, CardHeader, CardBody, Stat, Avatar, toast, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import { InviteUserDialog } from "./InviteUserDialog";
import type { User, UserStatus } from "@/data/types";

const FILTER_KEYS = ["role", "status"];

const STATUS_TONE: Record<UserStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  invited: "warning",
  disabled: "neutral",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  active: "Active",
  invited: "Invited",
  disabled: "Disabled",
};

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

  /* Counted server-side. Reading every user just to length-check them
     costs a document read each, and this strip renders on every visit. */
  const stats = useQuery({
    queryKey: ["user-stats"],
    queryFn: () => adminRepo.userStats(),
  });

  const byRole = stats.data?.byRole ?? {};
  const rolesInUse = Object.values(byRole).filter((n) => n > 0).length;

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
        <StatusPill tone={u.role === "owner" ? "accent" : "neutral"} dot={false}>
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
      key: "status", header: "Status", sortable: true,
      cell: (u) => (
        <StatusPill tone={STATUS_TONE[u.status] ?? "neutral"}>
          {STATUS_LABEL[u.status] ?? humanise(u.status)}
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
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary" leadingIcon={<ShieldCheck className="size-4" />}>
              <Link to="/admin/roles">Roles &amp; permissions</Link>
            </Button>
            <InviteUserDialog />
          </div>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat
            label="Users"
            value={stats.data?.total ?? 0}
            hint={`${stats.data?.active ?? 0} active`}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Roles in use"
            value={rolesInUse}
            hint={`Of ${ASSIGNABLE_ROLES.length} assignable`}
          />
        </Card>
        <Card className="p-5">
          <Stat label="Sales team" value={byRole.salesperson ?? 0} />
        </Card>
        <Card className="p-5">
          <Stat label="Finance" value={byRole.finance ?? 0} />
        </Card>
      </div>

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search name, email or department…"
        filters={[
          {
            key: "role", label: "Role",
            // ⚠️ Assignable roles only. `automation` is the n8n service
            // account and the two dormant roles grant nothing — offering
            // them here would imply they can be handed to a person.
            options: ASSIGNABLE_ROLES.map((r: Role) => ({
              value: r,
              label: ROLE_LABELS[r],
            })),
          },
          {
            key: "status", label: "Status",
            options: (["active", "invited", "disabled"] as UserStatus[]).map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
            })),
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

      <PendingInvitations />

      <p className="text-xs text-grey-400 mt-4 leading-relaxed">
        Inviting someone records the role they will get. They create their own account and
        password at the sign-up screen using the invited address — no one, including an
        administrator, ever handles someone else's password. Until they do, they have no
        access at all.
      </p>
    </Page>
  );
}

/* ── Pending invitations ───────────────────────────────────────────
   Kept separate from the users table because an invitation is not a
   user. Merging them into one list makes it look as though somebody
   already has access when they do not.                              */

function PendingInvitations() {
  const actor = useActor();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["invitations"],
    queryFn: () => adminRepo.invitations(),
  });

  const revoke = useMutation({
    mutationFn: (email: string) => adminRepo.revokeInvitation(email, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation withdrawn", "That address can no longer claim a role.");
    },
    onError: () => toast.error("Could not withdraw", "Nothing was changed."),
  });

  const invitations = data ?? [];
  if (isLoading || invitations.length === 0) return null;

  return (
    <Card className="mt-8">
      <CardHeader
        title="Pending invitations"
        description="Nobody here has access yet. Access begins when they complete sign-up."
      />
      <CardBody className="pt-0 space-y-2">
        {invitations.map((invite) => (
          <div
            key={invite.id}
            className="flex items-center justify-between gap-4 py-2.5 border-b border-grey-100 last:border-b-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={invite.name || invite.email} color="#ccd0d4" size="md" />
              <div className="min-w-0">
                <p className="font-medium text-ink-900 truncate">
                  {invite.name || invite.email}
                </p>
                <p className="text-sm text-grey-500 truncate">
                  {invite.email} · invited by {invite.invitedByName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <StatusPill tone="warning">{ROLE_LABELS[invite.role]}</StatusPill>
              <Button
                variant="ghost"
                size="sm"
                loading={revoke.isPending && revoke.variables === invite.email}
                onClick={() => revoke.mutate(invite.email)}
              >
                Withdraw
              </Button>
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
