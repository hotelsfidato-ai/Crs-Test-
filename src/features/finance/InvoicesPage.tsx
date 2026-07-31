import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Receipt, Download } from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { financeRepo, db } from "@/data/repositories";
import { money, dateShort, humanise } from "@/lib/format";
import {
  Page, PageHeader, Button, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, INVOICE_TONES, Card, Stat, toast, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import type { Invoice } from "@/data/types";

const FILTER_KEYS = ["status"];

export default function InvoicesPage() {
  const role = useSession((s) => s.role);
  const navigate = useNavigate();
  const list = useListState({
    filterKeys: FILTER_KEYS,
    defaultSortBy: "issueDate",
    defaultSortDir: "desc",
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["invoices", list.query],
    queryFn: () => financeRepo.invoices(list.query),
  });

  const outstanding = db.invoices.reduce((s, i) => s + i.amountDue, 0);
  const overdue = db.invoices.filter((i) => i.status === "overdue");
  const overdueValue = overdue.reduce((s, i) => s + i.amountDue, 0);
  const collected = db.invoices.reduce((s, i) => s + i.amountPaid, 0);

  const columns: Column<Invoice>[] = [
    {
      key: "number", header: "Invoice", sortable: true,
      cell: (i) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 tabular truncate">{i.number}</p>
          <p className="text-sm text-grey-500 tabular">{i.reservationReference}</p>
        </div>
      ),
    },
    {
      key: "customerName", header: "Billed to",
      cell: (i) => (
        <div className="min-w-0">
          <p className="text-ink-900 truncate">{i.companyName ?? i.customerName}</p>
          {i.companyName && (
            <p className="text-sm text-grey-500 truncate">{i.customerName}</p>
          )}
        </div>
      ),
    },
    { key: "hotelName", header: "Property", hideBelow: "xl", cell: (i) => i.hotelName },
    {
      key: "issueDate", header: "Issued", sortable: true, hideBelow: "md",
      cell: (i) => <span className="tabular text-grey-600">{dateShort(i.issueDate)}</span>,
    },
    {
      key: "dueDate", header: "Due", sortable: true, hideBelow: "lg",
      cell: (i) => (
        <span
          className={
            i.status === "overdue" ? "tabular text-brand-red" : "tabular text-grey-600"
          }
        >
          {dateShort(i.dueDate)}
        </span>
      ),
    },
    {
      key: "status", header: "Status", sortable: true,
      cell: (i) => (
        <StatusPill tone={INVOICE_TONES[i.status] ?? "neutral"}>
          {humanise(i.status)}
        </StatusPill>
      ),
    },
    {
      key: "amountDue", header: "Due", numeric: true, sortable: true, hideBelow: "md",
      cell: (i) =>
        i.amountDue > 0 ? (
          <span className={i.status === "overdue" ? "text-brand-red font-medium" : ""}>
            {money(i.amountDue)}
          </span>
        ) : (
          <span className="text-grey-400">—</span>
        ),
    },
    {
      key: "totalAmount", header: "Total", numeric: true, sortable: true,
      cell: (i) => <span className="font-medium">{money(i.totalAmount)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Invoices"
        description="Raised automatically when a stay completes, then sent to the billing contact."
        actions={
          can(role, "export", "invoice") && (
            <Button
              variant="secondary"
              leadingIcon={<Download className="size-4" />}
              onClick={() =>
                toast.success("Export queued", "In Phase 2 this produces a CSV for the ledger.")
              }
            >
              Export
            </Button>
          )
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Invoices" value={db.invoices.length} />
        </Card>
        <Card className="p-5">
          <Stat label="Collected" value={money(collected)} />
        </Card>
        <Card className="p-5">
          <Stat label="Outstanding" value={money(outstanding)} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Overdue"
            value={money(overdueValue)}
            hint={`${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`}
          />
        </Card>
      </div>

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search invoice number, company or reference…"
        filters={[
          {
            key: "status", label: "Status",
            options: [
              { value: "draft", label: "Draft" },
              { value: "sent", label: "Sent" },
              { value: "partially_paid", label: "Partially paid" },
              { value: "paid", label: "Paid" },
              { value: "overdue", label: "Overdue" },
              { value: "void", label: "Void" },
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
        rowKey={(i) => i.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        onRowClick={(i) => navigate(`/finance/invoices/${i.id}`)}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            compact
            icon={<Receipt />}
            title="No invoices yet"
            description="An invoice is raised automatically when a reservation completes."
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
