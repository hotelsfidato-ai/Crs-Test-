import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Pencil, Mail, Phone, MapPin, Building2, Star, Sparkles, Plus,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { customersRepo } from "@/data/repositories";
import {
  money, dateShort, dateTime, phone as formatPhone, relative, humanise,
} from "@/lib/format";
import { labelFor } from "@/lib/rules";
import { summariseCustomer } from "@/features/ai/responses";
import {
  Page, PageHeader, Button, Card, CardHeader, CardBody, DetailList, DetailRow,
  StatusPill, CUSTOMER_TONES, RESERVATION_TONES, Avatar, Skeleton, EmptyState,
  Tabs, TabsList, TabsTrigger, TabsContent, DataTable, Stat, type Column,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import type { Reservation } from "@/data/types";

export default function CustomerDetailPage() {
  const { id = "" } = useParams();
  const role = useSession((s) => s.role);
  const navigate = useNavigate();

  const customer = useQuery({
    queryKey: ["customer", id],
    queryFn: () => customersRepo.get(id),
  });

  const reservations = useQuery({
    queryKey: ["customer-reservations", id],
    queryFn: () => customersRepo.reservations(id),
  });

  if (customer.isLoading) return <DetailSkeleton />;
  if (!customer.data) return <NotFound />;

  const c = customer.data;
  const rows = reservations.data ?? [];

  const columns: Column<Reservation>[] = [
    {
      key: "reference", header: "Reference",
      cell: (r) => <span className="font-medium text-ink-900 tabular">{r.reference}</span>,
    },
    { key: "hotelName", header: "Property", cell: (r) => r.hotelName },
    {
      key: "checkIn", header: "Dates", hideBelow: "md",
      cell: (r) => (
        <span className="text-grey-600 tabular">
          {dateShort(r.checkIn)} → {dateShort(r.checkOut)}
        </span>
      ),
    },
    { key: "totalRooms", header: "Rooms", numeric: true, hideBelow: "lg", cell: (r) => r.totalRooms },
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
        breadcrumbs={[
          { label: "Customers", to: "/crm/customers" },
          { label: c.fullName },
        ]}
        title={
          <span className="flex items-center gap-2.5">
            <Avatar name={c.fullName} color={c.vip ? "#df6128" : "#9aa2a9"} size="lg" />
            {c.fullName}
          </span>
        }
        badge={
          <div className="flex items-center gap-2">
            <StatusPill tone={CUSTOMER_TONES[c.status] ?? "neutral"}>{c.status}</StatusPill>
            {c.vip && (
              <StatusPill tone="accent" dot={false}>
                <Star className="size-2.5 fill-current" /> VIP
              </StatusPill>
            )}
          </div>
        }
        actions={
          <>
            {can(role, "create", "reservation") && (
              <Button
                variant="secondary"
                leadingIcon={<Plus className="size-4" />}
                onClick={() => navigate(`/reservations/new?customer=${c.id}`)}
              >
                New reservation
              </Button>
            )}
            {can(role, "edit", "customer") && (
              <Button asChild variant="primary" leadingIcon={<Pencil className="size-4" />}>
                <Link to={`/crm/customers/${c.id}/edit`}>Edit</Link>
              </Button>
            )}
          </>
        }
      />

      {/* ── Summary strip ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat label="Reservations" value={c.totalReservations} />
        </Card>
        <Card className="p-5">
          <Stat label="Lifetime value" value={money(c.totalRevenue)} />
        </Card>
        <Card className="p-5">
          <Stat
            label="Last stay"
            value={c.lastStayAt ? dateShort(c.lastStayAt) : "—"}
            hint={c.lastStayAt ? relative(c.lastStayAt) : "No completed stays"}
          />
        </Card>
        <Card className="p-5">
          <Stat label="Source" value={humanise(c.source)} hint={`Owner: ${c.ownerName}`} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="reservations">
            <TabsList>
              <TabsTrigger value="reservations" count={rows.length}>
                Reservations
              </TabsTrigger>
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="reservations">
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                loading={reservations.isLoading}
                onRowClick={(r) => navigate(`/reservations/${r.id}`)}
                stickyHeader={false}
                empty={
                  <EmptyState
                    compact
                    title="No reservations yet"
                    description={`${c.fullName} has not booked with Fidato so far.`}
                    action={
                      can(role, "create", "reservation") && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => navigate(`/reservations/new?customer=${c.id}`)}
                        >
                          Create one
                        </Button>
                      )
                    }
                  />
                }
              />
            </TabsContent>

            <TabsContent value="preferences">
              <Card>
                <CardBody>
                  {c.preferences.length ? (
                    <div className="flex flex-wrap gap-2">
                      {c.preferences.map((p) => (
                        <StatusPill key={p} tone="neutral" dot={false}>
                          {p}
                        </StatusPill>
                      ))}
                    </div>
                  ) : (
                    <p className="text-base text-grey-500">
                      No stay preferences recorded. These are passed to the property with
                      every booking.
                    </p>
                  )}
                </CardBody>
              </Card>
            </TabsContent>

            <TabsContent value="notes">
              <Card>
                <CardBody>
                  {c.notes ? (
                    <p className="text-base text-ink-900 leading-relaxed">{c.notes}</p>
                  ) : (
                    <p className="text-base text-grey-500">No internal notes on this record.</p>
                  )}
                  <p className="text-xs text-grey-400 mt-4 pt-4 border-t border-grey-100">
                    Created {dateTime(c.createdAt)} · Last updated {dateTime(c.updatedAt)}
                  </p>
                </CardBody>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Side rail ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
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
                <DetailRow label="Location">
                  <span className="flex items-center gap-2">
                    <MapPin className="size-3.5 text-grey-400 shrink-0" />
                    {c.city}
                    {c.state ? `, ${c.state}` : ""}
                  </span>
                </DetailRow>
                {c.companyName && (
                  <DetailRow label="Company">
                    <Link
                      to={`/crm/companies/${c.companyId}`}
                      className="flex items-center gap-2 text-brand-orange hover:underline"
                    >
                      <Building2 className="size-3.5 shrink-0" />
                      {c.companyName}
                    </Link>
                  </DetailRow>
                )}
                {c.designation && <DetailRow label="Role">{c.designation}</DetailRow>}
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
                  {summariseCustomer(c.id)}
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
