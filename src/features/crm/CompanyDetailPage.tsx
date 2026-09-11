import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Mail, Phone, Globe, MapPin, Sparkles, Users, UserRound } from "lucide-react";
import { useActor, useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { companiesRepo, customersRepo, dsrRepo, reservationsRepo } from "@/data/repositories";
import { VISIT_TYPE_LABELS, VISIT_TYPE_TONES, isoOfDay } from "@/lib/dsr";
import { money, percent, humanise, dateShort, phone as formatPhone } from "@/lib/format";
import { labelFor } from "@/lib/rules";
import { summariseCompany } from "@/features/ai/responses";
import {
  Page, PageHeader, Button, Card, CardHeader, CardBody, DetailList, DetailRow,
  StatusPill, COMPANY_TONES, RESERVATION_TONES, Skeleton, EmptyState, ProgressBar,
  Tabs, TabsList, TabsTrigger, TabsContent, DataTable, Stat, Avatar, type Column,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import { OwnerTag } from "@/features/shared/OwnerTag";
import type { Customer, DsrVisit, Reservation } from "@/data/types";

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

  /* The company's DSR history. ⚠️ A salesperson may read only their own
     visits, so their query must say so or it is refused whole. */
  const actor = useActor();
  const canSeeVisits = can(role, "view", "dsr");
  const visitsQuery = useQuery({
    queryKey: ["company-visits", id, role === "salesperson" ? actor.id : "all"],
    queryFn: () => dsrRepo.forCompany(id, role === "salesperson" ? actor.id : undefined),
    enabled: Boolean(id) && canSeeVisits,
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
  const visits = visitsQuery.data ?? [];

  const utilisation = c.creditLimit > 0 ? (c.creditUsed / c.creditLimit) * 100 : 0;

  const contactColumns: Column<Customer>[] = [
    {
      key: "fullName", header: "Contact",
      cell: (x) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={x.fullName} color="#9aa2a9" size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-ink-900 truncate">{x.fullName}</p>
            <p className="text-sm text-grey-500 truncate">{x.designation ?? "-"}</p>
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

  const visitColumns: Column<DsrVisit>[] = [
    {
      key: "day", header: "Date",
      cell: (v) => <span className="tabular whitespace-nowrap">{dateShort(isoOfDay(v.day))}</span>,
    },
    { key: "ownerName", header: "Salesperson", hideBelow: "md", cell: (v) => v.ownerName },
    {
      key: "visitType", header: "Visit",
      cell: (v) => (
        <StatusPill tone={VISIT_TYPE_TONES[v.visitType]} dot={false}>
          {VISIT_TYPE_LABELS[v.visitType]}
        </StatusPill>
      ),
    },
    { key: "contactPerson", header: "Met", hideBelow: "lg", cell: (v) => v.contactPerson || "-" },
    { key: "remarks", header: "Remarks", cell: (v) => <span className="text-grey-700">{v.remarks}</span> },
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
            {/* Whose lead this is, where the eye lands first — it used to be
                a hint under a stat card. */}
            <OwnerTag ownerId={c.ownerId} ownerName={c.ownerName} />
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
          <Stat label="Contact persons" value={c.contacts.length} hint={`Owner: ${c.ownerName}`} />
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
              {canSeeVisits && (
                <TabsTrigger value="visits" count={visits.length}>
                  Visits
                </TabsTrigger>
              )}
              {/* ⚠️ Customers linked by companyId — guests and bookers — not
                  the contact persons shown beside this. Both used to be
                  called "Contacts". */}
              <TabsTrigger value="contacts" count={contacts.length}>
                Linked customers
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

            {canSeeVisits && (
              <TabsContent value="visits">
                <DataTable
                  columns={visitColumns}
                  rows={visits}
                  rowKey={(v) => v.id}
                  loading={visitsQuery.isLoading}
                  error={visitsQuery.error}
                  stickyHeader={false}
                  empty={
                    <EmptyState
                      compact
                      title="No visits logged"
                      description={`Visits to ${c.name} logged in a daily sales report appear here.`}
                    />
                  }
                />
              </TabsContent>
            )}

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
                    title="No customers linked"
                    description="Guests and bookers you raise reservations for appear here once their customer record names this company."
                  />
                }
              />
            </TabsContent>

            <TabsContent value="contract">
              <Card>
                <CardBody>
                  <DetailList>
                    <DetailRow label="Contract start">
                      {c.contractStart ? dateShort(c.contractStart) : "-"}
                    </DetailRow>
                    <DetailRow label="Contract end">
                      {c.contractEnd ? dateShort(c.contractEnd) : "-"}
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
            <CardHeader
              title="Contact persons"
              description={c.contacts.length > 1 ? "The first is the primary contact." : undefined}
            />
            <CardBody className="pt-0">
              {c.contacts.length === 0 ? (
                <p className="text-sm text-grey-500 leading-relaxed">
                  Nobody recorded yet.
                  {can(role, "edit", "company") && (
                    <>
                      {" "}
                      <Link
                        to={`/crm/companies/${c.id}/edit`}
                        className="text-brand-orange hover:underline"
                      >
                        Add a contact person
                      </Link>
                    </>
                  )}
                </p>
              ) : (
                <ul className="divide-y divide-grey-100 -my-2">
                  {c.contacts.map((p, i) => (
                    <li key={`${p.name}-${i}`} className="py-3 first:pt-2 last:pb-2">
                      <p className="flex items-center gap-2 font-medium text-ink-900">
                        <UserRound className="size-3.5 text-grey-400 shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </p>
                      {p.designation && (
                        <p className="text-sm text-grey-500 pl-5.5 truncate">{p.designation}</p>
                      )}
                      {p.phone && (
                        <a
                          href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}
                          className="flex items-center gap-2 text-sm tabular text-ink-900 hover:text-brand-orange mt-1"
                        >
                          <Phone className="size-3.5 text-grey-400 shrink-0" />
                          {p.phone}
                        </a>
                      )}
                      {p.email && (
                        <a
                          href={`mailto:${p.email}`}
                          className="flex items-center gap-2 text-sm text-brand-orange hover:underline break-all mt-1"
                        >
                          <Mail className="size-3.5 shrink-0" />
                          {p.email}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

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
                {/* ⚠️ The company's OWN line and inbox. An imported lead usually
                    has neither — its numbers belong to the contact person — so a
                    blank shows as a dash, not an empty mailto link. */}
                <DetailRow label="Company email">
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-2 text-brand-orange hover:underline break-all"
                    >
                      <Mail className="size-3.5 shrink-0" />
                      {c.email}
                    </a>
                  ) : (
                    <span className="text-grey-400">-</span>
                  )}
                </DetailRow>
                <DetailRow label="Company phone">
                  {c.phone ? (
                    <span className="flex items-center gap-2 tabular">
                      <Phone className="size-3.5 text-grey-400 shrink-0" />
                      {formatPhone(c.phone)}
                    </span>
                  ) : (
                    <span className="text-grey-400">-</span>
                  )}
                </DetailRow>
                <DetailRow label="Website">
                  {c.website ? (
                    <span className="flex items-center gap-2 break-all">
                      <Globe className="size-3.5 text-grey-400 shrink-0" />
                      {c.website}
                    </span>
                  ) : (
                    <span className="text-grey-400">-</span>
                  )}
                </DetailRow>
                <DetailRow label="Address">
                  {c.address || c.city || c.state ? (
                    <span className="flex items-start gap-2">
                      <MapPin className="size-3.5 text-grey-400 shrink-0 mt-0.5" />
                      <span>
                        {c.address}
                        {c.address && (c.city || c.state) && <br />}
                        {[c.city, c.state].filter(Boolean).join(", ")}
                      </span>
                    </span>
                  ) : (
                    <span className="text-grey-400">-</span>
                  )}
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
