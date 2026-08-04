import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { financeRepo } from "@/data/repositories";
import { money, dateTime, humanise } from "@/lib/format";
import {
  Page, PageHeader, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, Card, Stat, type Column,
} from "@/components/ui";
import { useListState } from "@/features/shared/useListState";
import type { Payment } from "@/data/types";

const FILTER_KEYS = ["method", "reconciled"];

export default function PaymentsPage() {
  const navigate = useNavigate();
  const list = useListState({
    filterKeys: FILTER_KEYS,
    defaultSortBy: "receivedAt",
    defaultSortDir: "desc",
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["payments", list.query],
    queryFn: () => financeRepo.payments(list.query),
  });

  const totals = useQuery({
    queryKey: ["payment-totals"],
    queryFn: () => financeRepo.paymentTotals(),
  });

  const columns: Column<Payment>[] = [
    {
      key: "reference", header: "Receipt",
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 tabular">{p.reference}</p>
          <p className="text-sm text-grey-500 tabular truncate">{p.invoiceNumber}</p>
        </div>
      ),
    },
    { key: "customerName", header: "From", cell: (p) => p.customerName },
    {
      key: "method", header: "Method", hideBelow: "md",
      cell: (p) => (
        <StatusPill tone="neutral" dot={false}>
          {humanise(p.method)}
        </StatusPill>
      ),
    },
    {
      key: "receivedAt", header: "Received", sortable: true, hideBelow: "lg",
      cell: (p) => <span className="tabular text-grey-600">{dateTime(p.receivedAt)}</span>,
    },
    {
      key: "reconciled", header: "Reconciled",
      cell: (p) => (
        <StatusPill tone={p.reconciled ? "success" : "warning"}>
          {p.reconciled ? "Yes" : "Pending"}
        </StatusPill>
      ),
    },
    {
      key: "amount", header: "Amount", numeric: true, sortable: true,
      cell: (p) => <span className="font-medium">{money(p.amount)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Payments"
        description="Receipts against invoices. Unreconciled entries have not yet been matched to a bank statement."
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
        <Card className="p-5">
          <Stat
            label="Received"
            value={money(totals.data?.received ?? 0)}
            hint={`${totals.data?.count ?? 0} payments`}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Unreconciled"
            value={money(totals.data?.unreconciledValue ?? 0)}
            hint={`${totals.data?.unreconciledCount ?? 0} to match`}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Average receipt"
            value={
              totals.data?.count
                ? money(Math.round(totals.data.received / totals.data.count))
                : "—"
            }
          />
        </Card>
      </div>

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search receipt, invoice or customer…"
        filters={[
          {
            key: "method", label: "Method",
            options: [
              { value: "bank_transfer", label: "Bank transfer" },
              { value: "upi", label: "UPI" },
              { value: "card", label: "Card" },
              { value: "cheque", label: "Cheque" },
              { value: "cash", label: "Cash" },
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
        rowKey={(p) => p.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        onRowClick={(p) => navigate(`/finance/invoices/${p.invoiceId}`)}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSort={list.toggleSort}
        hasFilters={list.hasFilters}
        onClearFilters={list.clear}
        empty={
          <EmptyState
            compact
            icon={<Wallet />}
            title="No payments recorded"
            description="Payments appear here as they are received against invoices."
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
