import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Mail, Phone, Globe, MapPin, Sparkles, Users } from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { companiesRepo, customersRepo, reservationsRepo } from "@/data/repositories";
import { money, percent, humanise, dateShort, phone as formatPhone } from "@/lib/format";
import { labelFor } from "@/lib/rules";
import { summariseCompany } from "@/features/ai/responses";
import {
  Page, PageHeader, Button, Card, CardHeader, CardBody, DetailList, DetailRow,
  StatusPill, COMPANY_TONES, RESERVATION_TONES, Skeleton, EmptyState, ProgressBar,
  Tabs, TabsList, TabsTrigger, TabsContent, DataTable, Stat, Avatar, type Column,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import type { Customer, Reservation } from "@/data/types";

export default function CompanyDetailPage() {
  const { id = "" } = useParams();
  const role = useSession((s) => s.role);
  const navigate = useNavigate();

  const company = useQuery({
    queryKey: ["company", id],
    queryFn: () => companiesRepo.get(id),
  });

  const contactsQuery = useQuery({
    queryKey: ["company-contacts", id],
    queryFn: () => customersRepo.forCompany(id),
    enabled: Boolean(id),
  });

  const bookingsQuery = useQuery({
    queryKey: ["company-reservations", id],
    queryFn: () => reservationsRepo.forCompany(id),
    enabled: Boolean(id),
  });

  if (company.isLoading) return <DetailSkeleton />;
  if (!company.data) return <NotFound />;

  const c = company.data;
  const contacts = contactsQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];

  const utilisation = c.creditLimit > 0 ? (c.creditUsed / c.creditLimit) * 100 : 0;

  const contactColumns: Column<Customer>[] = [
    {
      key: "fullName", header: "Contact",
      cell: (x) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={x.fullName} color="#9aa2a9" size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-ink-900 truncate">{x.fullName}</p>
            <p className="text-sm text-grey-500 truncate">{x.designation ?? "—"}</p>
          </div>
        </div>
      ),
    },
    { key: "email", header: "Email", hideBelow: "md", cell: (x) => x.email },
    {
      key: "phone", header: "Phone", hideBelow: "lg",
      cell: (x) => <span className="tabular">{formatPhone(x.phone)}</span>,
    },
    {
      key: "totalReservations", header: "Stays", numeric: true,
      cell: (x) => x.totalReservations,
    },
  ];

  const bookingColumns: Column<Reservation>[] = [
    {
      key: "reference", header: "Reference",
      cell: (r) => <span className="font-medium tabular">{r.reference}</span>,
    },
    { key: "customerName", header: "Guest", cell: (r) => r.customerName },
    { key: "hotelName", header: "Property", hideBelow: "md", cell: (r) => r.hotelName },
    {
      key: "checkIn", header: "Check-in", hideBelow: "lg",
      cell: (r) => <span className="tabular">{dateShort(r.checkIn)}</span>,
    },
    {
      key: "status", header: "Status",
      cell: (r) => (
        <StatusPill tone={RESERVATION_TONES[r.status] ?? "neutral"}>
          {labelFor(r.status)}
        </StatusPill>
      ),
    },
    {
      key: "totalAmount", header: "Value", numeric: true,
      cell: (r) => <span className="font-medium">{money(r.totalAmount)}</span>,
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Companies", to: "/crm/companies" }, { label: c.name }]}
        title={c.name}
        description={c.legalName}
        badge={
          <div className="flex items-center gap-2">
            <StatusPill tone={COMPANY_TONES[c.status] ?? "neutral"}>{c.status}</StatusPill>
            <StatusPill tone="neutral" dot={false}>
              {humanise(c.tier)}
            </StatusPill>
          </div>
        }
        actions={
          can(role, "edit", "company") && (
            <Button asChild variant="primary" leadingIcon={<Pencil className="size-4" />}>
              <Link to={`/crm/companies/${c.id}/edit`}>Edit</Link>
            </Button>
          )
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Reservations" value={c.totalReservations} />
        </Card>
        <Card className="p-5">
          <Stat label="Total revenue" value={money(c.totalRevenue)} />
        </Card>
        <Card className="p-5">
          <Stat label="Contacts" value={contacts.length} hint={`Owner: ${c.ownerName}`} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Negotiated discount"
            value={c.negotiatedDiscountPercent ? `${c.negotiatedDiscountPercent}%` : "None"}
            hint={`${c.paymentTermDays}-day terms`}
          />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="bookings">
            <TabsList>
              <TabsTrigger value="bookings" count={bookings.length}>
                Reservations
              </TabsTrigger>
              <TabsTrigger value="contacts" count={contacts.length}>
                Contacts
              </TabsTrigger>
              <TabsTrigger value="contract">Contract</TabsTrigger>
            </TabsList>

            <TabsContent value="bookings">
              <DataTable
                columns={bookingColumns}
                rows={bookings.slice(0, 25)}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/reservations/${r.id}`)}
                stickyHeader={false}
                empty={
                  <EmptyState
                    compact
                    title="No reservations"
                    description={`${c.name} has not booked with Fidato yet.`}
                  />
                }
              />
            </TabsContent>

            <TabsContent value="contacts">
              <DataTable
                columns={contactColumns}
                rows={contacts}
                rowKey={(x) => x.id}
                onRowClick={(x) => navigate(`/crm/customers/${x.id}`)}
                stickyHeader={false}
                empty={
                  <EmptyState
                    compact
                    icon={<Users />}
                    title="No contacts linked"
                    description="Link a customer to this company from the customer record."
                  />
                }
              />
            </TabsContent>

            <TabsContent value="contract">
              <Card>
                <CardBody>
                  <DetailList>
                    <DetailRow label="Contract start">
                      {c.contractStart ? dateShort(c.contractStart) : "—"}
                    </DetailRow>
                    <DetailRow label="Contract end">
                      {c.contractEnd ? dateShort(c.contractEnd) : "—"}
                    </DetailRow>
                    <DetailRow label="Payment terms">{c.paymentTermDays} days</DetailRow>
                    <DetailRow label="Negotiated discount">
                      {c.negotiatedDiscountPercent
                        ? `${c.negotiatedDiscountPercent}% off room charges`
                        : "None"}
                    </DetailRow>
                    <DetailRow label="GSTIN">
                      <span className="tabular">{c.gstin}</span>
                    </DetailRow>
                    <DetailRow label="Notes">
                      {c.notes || <span className="text-grey-400">No notes</span>}
                    </DetailRow>
                  </DetailList>
                </CardBody>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Credit" />
            <CardBody className="pt-0">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-semibold text-ink-900 tabular">
                  {percent(utilisation, 0)}
                </span>
                <span className="text-sm text-grey-500 tabular">
                  {money(c.creditUsed)} / {money(c.creditLimit)}
                </span>
              </div>
              <ProgressBar
                value={utilisation}
                tone={utilisation > 80 ? "danger" : utilisation > 60 ? "warning" : "success"}
              />
              {utilisation > 70 && (
                <p className="text-xs text-[#8a6300] mt-3 leading-relaxed">
                  Utilisation is high. Worth a conversation with finance before the next
                  large booking.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody className="pt-0">
              <DetailList>
                <DetailRow label="Email">
                  <a
                    href={`mailto:${c.email}`}
                    className="flex items-center gap-2 text-brand-orange hover:underline break-all"
                  >
                    <Mail className="size-3.5 shrink-0" />
                    {c.email}
                  </a>
                </DetailRow>
                <DetailRow label="Phone">
                  <span className="flex items-center gap-2 tabular">
                    <Phone className="size-3.5 text-grey-400 shrink-0" />
                    {formatPhone(c.phone)}
                  </span>
                </DetailRow>
                <DetailRow label="Website">
                  <span className="flex items-center gap-2 break-all">
                    <Globe className="size-3.5 text-grey-400 shrink-0" />
                    {c.website}
                  </span>
                </DetailRow>
                <DetailRow label="Address">
                  <span className="flex items-start gap-2">
                    <MapPin className="size-3.5 text-grey-400 shrink-0 mt-0.5" />
                    <span>
                      {c.address}
                      <br />
                      {c.city}, {c.state}
                    </span>
                  </span>
                </DetailRow>
              </DetailList>
            </CardBody>
          </Card>

          {can(role, "view", "ai") && (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Sparkles className="size-4 text-brand-orange" />
                    Summary
                  </span>
                }
              />
              <CardBody className="pt-0">
                <p className="text-base text-grey-600 leading-relaxed">
                  {summariseCompany(c)}
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="h-3 w-48 mb-3" />
      <Skeleton className="h-8 w-72 mb-2" />
      <Skeleton className="h-3.5 w-96 mb-8" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </Page>
  );
}
