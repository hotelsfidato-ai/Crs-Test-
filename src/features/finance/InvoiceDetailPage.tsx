import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Send, Wallet, Building2 } from "lucide-react";
import { useSession, useActor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { financeRepo, db } from "@/data/repositories";
import { money, moneyPrecise, dateShort, dateTime, humanise } from "@/lib/format";
import {
  Page, PageHeader, Button, Card, CardHeader, CardBody, StatusPill,
  INVOICE_TONES, Skeleton, Stat, Dialog, DialogContent, DialogTrigger,
  DialogClose, Field, Input, NativeSelect, toast, DetailList, DetailRow,
  EmptyState,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import type { Payment } from "@/data/types";

export default function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const role = useSession((s) => s.role);

  const invoice = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => financeRepo.invoice(id),
  });

  const payments = useQuery({
    queryKey: ["invoice-payments", id],
    queryFn: () => financeRepo.paymentsForInvoice(id),
  });

  if (invoice.isLoading) return <DetailSkeleton />;
  if (!invoice.data) return <NotFound />;

  const inv = invoice.data;
  const org = db.orgSettings;
  const company = inv.companyId ? db.companies.find((c) => c.id === inv.companyId) : undefined;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Invoices", to: "/finance/invoices" }, { label: inv.number }]}
        title={inv.number}
        description={`${inv.companyName ?? inv.customerName} · ${inv.hotelName}`}
        badge={
          <StatusPill tone={INVOICE_TONES[inv.status] ?? "neutral"}>
            {humanise(inv.status)}
          </StatusPill>
        }
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<Printer className="size-4" />}
              onClick={() => window.print()}
              className="no-print"
            >
              Print
            </Button>
            <Button
              variant="secondary"
              leadingIcon={<Send className="size-4" />}
              className="no-print"
              onClick={() =>
                toast.success(
                  "Invoice sent",
                  `In Phase 2 this emails ${inv.companyName ?? inv.customerName}.`,
                )
              }
            >
              Send
            </Button>
            {can(role, "edit", "payment") && inv.amountDue > 0 && (
              <RecordPaymentDialog invoiceId={inv.id} amountDue={inv.amountDue} />
            )}
          </>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6 no-print">
        <Card className="p-5">
          <Stat label="Total" value={money(inv.totalAmount)} hint="Including GST" />
        </Card>
        <Card className="p-5">
          <Stat label="Paid" value={money(inv.amountPaid)} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Outstanding"
            value={money(inv.amountDue)}
            hint={inv.amountDue > 0 ? `Due ${dateShort(inv.dueDate)}` : "Settled"}
          />
        </Card>
        <Card className="p-5">
          <Stat label="Issued" value={dateShort(inv.issueDate)} hint={inv.reservationReference} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── The invoice document itself ── */}
        <Card className="lg:col-span-2">
          <CardBody className="p-6 sm:p-8">
            {/* Georgia is retained here — printed documents are the one
                place the brand serif still belongs. */}
            <div className="flex items-start justify-between gap-6 pb-6 border-b border-grey-200">
              <div>
                <p className="print-serif text-2xl text-ink-900">{org.brandName}</p>
                <p className="text-sm text-grey-500 mt-1.5 leading-relaxed max-w-xs">
                  {org.legalName}
                  <br />
                  {org.registeredAddress}
                </p>
                <p className="text-sm text-grey-500 mt-1.5 tabular">GSTIN {org.gstin}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="print-serif text-xl text-ink-900">Tax Invoice</p>
                <p className="text-base text-grey-600 tabular mt-1.5">{inv.number}</p>
                <p className="text-sm text-grey-500 tabular mt-0.5">
                  Issued {dateShort(inv.issueDate)}
                </p>
                <p className="text-sm text-grey-500 tabular">Due {dateShort(inv.dueDate)}</p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 py-6 border-b border-grey-200">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-2">
                  Billed to
                </p>
                <p className="text-base text-ink-900">{inv.companyName ?? inv.customerName}</p>
                {company && (
                  <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                    {company.legalName}
                    <br />
                    {company.address}
                    <br />
                    {company.city}, {company.state}
                    <br />
                    <span className="tabular">GSTIN {company.gstin}</span>
                  </p>
                )}
                {!company && <p className="text-sm text-grey-600 mt-1">{inv.customerName}</p>}
              </div>

              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-2">
                  Stay
                </p>
                <p className="text-base text-ink-900">{inv.hotelName}</p>
                <p className="text-sm text-grey-600 mt-1 tabular">
                  Reservation {inv.reservationReference}
                </p>
                <Link
                  to={`/reservations/${inv.reservationId}`}
                  className="text-sm text-brand-orange hover:underline no-print"
                >
                  Open reservation
                </Link>
              </div>
            </div>

            <table className="w-full text-base mt-6">
              <thead>
                <tr className="border-b border-grey-200">
                  <th className="text-left text-2xs font-semibold uppercase tracking-wide text-grey-500 pb-2">
                    Description
                  </th>
                  <th className="text-right text-2xs font-semibold uppercase tracking-wide text-grey-500 pb-2">
                    Qty
                  </th>
                  <th className="text-right text-2xs font-semibold uppercase tracking-wide text-grey-500 pb-2">
                    Rate
                  </th>
                  <th className="text-right text-2xs font-semibold uppercase tracking-wide text-grey-500 pb-2">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((line, i) => (
                  <tr key={i} className="border-b border-grey-100">
                    <td className="py-3 text-ink-900">{line.description}</td>
                    <td className="py-3 text-right tabular text-grey-600">{line.quantity}</td>
                    <td className="py-3 text-right tabular text-grey-600">
                      {money(line.unitPrice)}
                    </td>
                    <td className="py-3 text-right tabular">{moneyPrecise(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto max-w-xs mt-6 space-y-2">
              <Row label="Subtotal" value={moneyPrecise(inv.subtotal)} />
              <Row label="GST" value={moneyPrecise(inv.taxAmount)} />
              <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-grey-300">
                <span className="text-base font-medium text-ink-900">Total</span>
                <span className="text-lg font-semibold text-ink-900 tabular">
                  {moneyPrecise(inv.totalAmount)}
                </span>
              </div>
              {inv.amountPaid > 0 && (
                <>
                  <Row label="Paid" value={`− ${moneyPrecise(inv.amountPaid)}`} tone="success" />
                  <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-grey-200">
                    <span className="text-base font-medium text-ink-900">Amount due</span>
                    <span className="text-base font-semibold text-ink-900 tabular">
                      {moneyPrecise(inv.amountDue)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {inv.notes && (
              <p className="text-sm text-grey-500 mt-8 pt-4 border-t border-grey-100 leading-relaxed">
                {inv.notes}
              </p>
            )}

            <p className="text-xs text-grey-400 mt-6 leading-relaxed">
              Payment due within {company?.paymentTermDays ?? 15} days of the invoice date.
              Queries to {org.supportEmail} or {org.supportPhone}.
            </p>
          </CardBody>
        </Card>

        {/* ── Side rail ── */}
        <div className="space-y-6 no-print">
          <Card>
            <CardHeader title="Payments" description={`${payments.data?.length ?? 0} recorded`} />
            {payments.isLoading ? (
              <CardBody className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </CardBody>
            ) : !payments.data?.length ? (
              <EmptyState
                compact
                icon={<Wallet />}
                title="No payments"
                description="Nothing has been received against this invoice."
              />
            ) : (
              <ul className="divide-y divide-grey-100">
                {payments.data.map((p: Payment) => (
                  <li key={p.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-base text-ink-900 tabular">{money(p.amount)}</span>
                      <StatusPill tone={p.reconciled ? "success" : "warning"} dot={false}>
                        {p.reconciled ? "Reconciled" : "Unreconciled"}
                      </StatusPill>
                    </div>
                    <p className="text-sm text-grey-500 mt-0.5">
                      {humanise(p.method)} · {p.reference}
                    </p>
                    <p className="text-xs text-grey-400 mt-0.5">{dateTime(p.receivedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Account" />
            <CardBody className="pt-0">
              <DetailList>
                <DetailRow label="Customer">
                  <Link
                    to={`/crm/customers/${inv.customerId}`}
                    className="text-brand-orange hover:underline"
                  >
                    {inv.customerName}
                  </Link>
                </DetailRow>
                {inv.companyName && (
                  <DetailRow label="Company">
                    <Link
                      to={`/crm/companies/${inv.companyId}`}
                      className="flex items-center gap-1.5 text-brand-orange hover:underline"
                    >
                      <Building2 className="size-3.5 shrink-0" />
                      {inv.companyName}
                    </Link>
                  </DetailRow>
                )}
                <DetailRow label="Property">
                  <Link to={`/hotels/${inv.hotelId}`} className="text-brand-orange hover:underline">
                    {inv.hotelName}
                  </Link>
                </DetailRow>
                <DetailRow label="Terms">
                  {company ? `${company.paymentTermDays} days` : "15 days"}
                </DetailRow>
              </DetailList>
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Row({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-base text-grey-600">{label}</span>
      <span className={`text-base tabular ${tone === "success" ? "text-success" : "text-ink-900"}`}>
        {value}
      </span>
    </div>
  );
}

function RecordPaymentDialog({
  invoiceId, amountDue,
}: {
  invoiceId: string;
  amountDue: number;
}) {
  const actor = useActor();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(amountDue));
  const [method, setMethod] = useState<Payment["method"]>("bank_transfer");

  const record = useMutation({
    mutationFn: () => financeRepo.recordPayment(invoiceId, Number(amount), method, actor),
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoice-payments", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payment recorded", `${money(payment.amount)} received.`);
    },
    onError: () => toast.error("Could not record", "Nothing was saved."),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="primary" leadingIcon={<Wallet className="size-4" />}>
          Record payment
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Record a payment"
        description={`${money(amountDue)} outstanding on this invoice.`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="primary" loading={record.isPending} onClick={() => record.mutate()}>
                Record payment
              </Button>
            </DialogClose>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Amount received" required>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                numeric
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>

          <Field label="Method">
            {({ id }) => (
              <NativeSelect
                id={id}
                value={method}
                onChange={(e) => setMethod(e.target.value as Payment["method"])}
              >
                <option value="bank_transfer">Bank transfer</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </NativeSelect>
            )}
          </Field>

          <p className="text-sm text-grey-500 leading-relaxed">
            The invoice status updates automatically — partially paid if some remains, paid
            once it is settled in full.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="h-3 w-48 mb-3" />
      <Skeleton className="h-8 w-64 mb-8" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-[600px] w-full" />
    </Page>
  );
}
