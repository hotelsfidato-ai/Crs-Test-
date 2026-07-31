import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, BedDouble, Phone, Mail, CalendarRange, IndianRupee, Navigation,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { hotelsRepo, reservationsRepo } from "@/data/repositories";
import { money, number, humanise, dateShort, phone as formatPhone } from "@/lib/format";
import { labelFor, canEditRates } from "@/lib/rules";
import {
  Page, PageHeader, Button, Card, CardHeader, CardBody, DetailList, DetailRow,
  StatusPill, HOTEL_TONES, RESERVATION_TONES, StarRating, Skeleton, Stat,
  Tabs, TabsList, TabsTrigger, TabsContent, DataTable, EmptyState, Tooltip,
  type Column,
} from "@/components/ui";
import { NotFound } from "@/features/shared/NotFound";
import { CommissionDialog } from "./CommissionDialog";
import { RoomTypeDialog, DeleteRoomTypeButton } from "./RoomTypeDialog";
import type { RoomType, Reservation } from "@/data/types";

export default function HotelDetailPage() {
  const { id = "" } = useParams();
  const role = useSession((s) => s.role);
  const navigate = useNavigate();

  const hotel = useQuery({
    queryKey: ["hotel", id],
    queryFn: () => hotelsRepo.get(id),
  });

  const roomTypes = useQuery({
    queryKey: ["hotel-room-types", id],
    queryFn: () => hotelsRepo.roomTypes(id),
  });

  const bookingsQuery = useQuery({
    queryKey: ["hotel-reservations", id],
    queryFn: () => reservationsRepo.forHotel(id),
    enabled: Boolean(id),
  });

  /* ⚠️ Commercial terms live in a subcollection, not on the hotel, so
     that "Owner and Admin only" is enforced by rules rather than by
     this component choosing not to render them. The query is only
     issued for roles that may read it — for anyone else Firestore
     would deny it, which is correct but produces console noise. */
  const canSeeCommission = can(role, "view", "commission_terms");
  const commercial = useQuery({
    queryKey: ["hotel-commercial", id],
    queryFn: () => hotelsRepo.commercial(id),
    enabled: Boolean(id) && canSeeCommission,
  });

  if (hotel.isLoading) return <DetailSkeleton />;
  if (!hotel.data) return <NotFound />;

  const h = hotel.data;
  const rateAccess = canEditRates(role);
  const canConfigureRooms = can(role, "create", "room_config");

  const bookings = bookingsQuery.data ?? [];
  const live = bookings.filter((r) => r.status !== "cancelled" && r.status !== "draft");
  const revenue = live.reduce((s, r) => s + r.totalAmount, 0);

  const roomColumns: Column<RoomType>[] = [
    {
      key: "name", header: "Room type",
      cell: (rt) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900">{rt.name}</p>
          <p className="text-sm text-grey-500">
            {rt.code} · sleeps {rt.maxOccupancy} · {rt.sizeSqft} sq ft
          </p>
        </div>
      ),
    },
    { key: "totalRooms", header: "Rooms", numeric: true, cell: (rt) => number(rt.totalRooms) },
    {
      /* No rate column. Rooms carry no price — the salesperson enters
         the selling rate on each reservation, because Fidato negotiates
         per booking rather than publishing a rack rate. */
      key: "maxExtraBeds", header: "Extra beds", numeric: true,
      cell: (rt) => <span className="tabular text-grey-600">{rt.maxExtraBeds || "—"}</span>,
    },
    {
      key: "amenities", header: "Amenities", hideBelow: "lg",
      cell: (rt) => (
        <span className="text-sm text-grey-500">{rt.amenities.slice(0, 3).join(", ")}</span>
      ),
    },
    ...(canConfigureRooms
      ? [{
          key: "actions", header: "", width: "w-44",
          cell: (rt: RoomType) => (
            <div className="flex items-center justify-end gap-1">
              <RoomTypeDialog hotelId={h.id} hotelName={h.name} roomType={rt} />
              <DeleteRoomTypeButton hotelId={h.id} roomType={rt} />
            </div>
          ),
        } satisfies Column<RoomType>]
      : []),
  ];

  const bookingColumns: Column<Reservation>[] = [
    {
      key: "reference", header: "Reference",
      cell: (r) => <span className="font-medium tabular">{r.reference}</span>,
    },
    { key: "customerName", header: "Guest", cell: (r) => r.customerName },
    {
      key: "checkIn", header: "Stay", hideBelow: "md",
      cell: (r) => (
        <span className="tabular text-grey-600">
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
        breadcrumbs={[{ label: "Properties", to: "/hotels" }, { label: h.shortName }]}
        title={h.name}
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <StarRating value={h.starRating} />
            <span className="text-grey-400">·</span>
            <span>{humanise(h.category)}</span>
            <span className="text-grey-400">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {h.city}, {h.state}
            </span>
          </span>
        }
        badge={<StatusPill tone={HOTEL_TONES[h.status] ?? "neutral"}>{h.status}</StatusPill>}
        actions={
          <>
            {can(role, "view", "inventory") && (
              <Button asChild variant="secondary" leadingIcon={<CalendarRange className="size-4" />}>
                <Link to={`/hotels/${h.id}/inventory`}>Inventory</Link>
              </Button>
            )}
            {can(role, "view", "rate") &&
              (rateAccess.allowed ? (
                <Button asChild variant="primary" leadingIcon={<IndianRupee className="size-4" />}>
                  <Link to={`/hotels/${h.id}/rates`}>Rate plans</Link>
                </Button>
              ) : (
                <Tooltip content={rateAccess.reason}>
                  <span>
                    <Button asChild variant="secondary" leadingIcon={<IndianRupee className="size-4" />}>
                      <Link to={`/hotels/${h.id}/rates`}>View rates</Link>
                    </Button>
                  </span>
                </Tooltip>
              ))}
          </>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <Stat
            label="Rooms"
            value={number(h.totalRooms)}
            hint={`${h.roomMix.length} room type${h.roomMix.length === 1 ? "" : "s"}`}
          />
        </Card>
        <Card className="p-5">
          <Stat label="Bookings" value={number(live.length)} hint="Live and completed" />
        </Card>
        <Card className="p-5">
          <Stat label="Revenue" value={money(revenue)} />
        </Card>
        <Card className="p-5">
          {canSeeCommission ? (
            <Stat
              label="Commission"
              value={commercial.data ? `${commercial.data.commissionPercent}%` : "Not set"}
              hint={`Onboarded ${dateShort(h.onboardedAt)}`}
            />
          ) : (
            <Stat
              label="Onboarded"
              value={dateShort(h.onboardedAt)}
              hint={humanise(h.category)}
            />
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="rooms" count={roomTypes.data?.length}>
                Rooms
              </TabsTrigger>
              <TabsTrigger value="bookings" count={bookings.length}>
                Bookings
              </TabsTrigger>
              <TabsTrigger value="location">Location</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardBody className="space-y-6">
                  <p className="text-base text-ink-900 leading-relaxed">{h.description}</p>

                  {h.features.length > 0 && (
                    <ChipSection title="Features" items={h.features} />
                  )}
                  {h.facilities.length > 0 && (
                    <ChipSection title="Facilities" items={h.facilities} />
                  )}
                  {h.amenities.length > 0 && (
                    <ChipSection title="Amenities" items={h.amenities} />
                  )}
                </CardBody>
              </Card>
            </TabsContent>

            <TabsContent value="rooms">
              <Card>
                <CardHeader
                  title="Room types"
                  description="What this property can sell. A property with none cannot be booked."
                  actions={
                    canConfigureRooms ? (
                      <RoomTypeDialog hotelId={h.id} hotelName={h.name} />
                    ) : undefined
                  }
                />
                <DataTable
                  columns={roomColumns}
                  rows={roomTypes.data ?? []}
                  rowKey={(rt) => rt.id}
                  loading={roomTypes.isLoading}
                  className="border-0 rounded-none rounded-b-md"
                  stickyHeader={false}
                  empty={
                    <EmptyState
                      compact
                      icon={<BedDouble />}
                      title="No room types yet"
                      description={
                        canConfigureRooms
                          ? "Add at least one room type before taking a booking here — the reservation wizard has nothing to offer until you do."
                          : "Nobody has configured room types for this property yet."
                      }
                      action={
                        canConfigureRooms ? (
                          <RoomTypeDialog hotelId={h.id} hotelName={h.name} />
                        ) : undefined
                      }
                    />
                  }
                />
              </Card>

              {canConfigureRooms && (roomTypes.data?.length ?? 0) > 0 && (
                <p className="text-xs text-grey-400 mt-3 leading-relaxed">
                  Room types carry no price. Selling rates are entered per booking, and
                  meal plans and stay rules come from{" "}
                  <Link to={`/hotels/${h.id}/rates`} className="text-brand-orange hover:underline">
                    seasons
                  </Link>
                  .
                </p>
              )}
            </TabsContent>

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
                    title="No bookings yet"
                    description={`Nothing has been booked at ${h.shortName} so far.`}
                  />
                }
              />
            </TabsContent>

            <TabsContent value="location">
              <Card>
                <CardHeader title="Getting there" description="Distances from the property" />
                <CardBody className="pt-0">
                  <p className="flex items-start gap-2 text-base text-ink-900 mb-5 leading-relaxed">
                    <MapPin className="size-4 text-grey-400 shrink-0 mt-0.5" />
                    {h.address}
                  </p>

                  {h.distances.length > 0 ? (
                    <ul className="divide-y divide-grey-100">
                      {h.distances.map((d, i) => (
                        <li key={i} className="flex items-center justify-between gap-4 py-2.5">
                          <span className="flex items-center gap-2 text-base text-grey-700 min-w-0">
                            <Navigation className="size-3.5 text-grey-400 shrink-0" />
                            <span className="truncate">{d.label}</span>
                          </span>
                          <span className="text-base text-ink-900 tabular shrink-0">
                            {d.km} km
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-base text-grey-500">No distances recorded.</p>
                  )}

                  {h.thingsToDo.length > 0 && (
                    <div className="mt-6 pt-5 border-t border-grey-100">
                      <ChipSection title="Things to do nearby" items={h.thingsToDo} />
                    </div>
                  )}
                </CardBody>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Property contacts" />
            <CardBody className="pt-0">
              <ul className="divide-y divide-grey-100">
                {h.contacts.map((contact, i) => (
                  <li key={i} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-base text-ink-900">{contact.name}</p>
                    <p className="text-sm text-grey-500">{contact.designation}</p>
                    <div className="flex flex-col gap-1 mt-1.5">
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-2 text-sm text-brand-orange hover:underline break-all"
                      >
                        <Mail className="size-3 shrink-0" />
                        {contact.email}
                      </a>
                      <span className="flex items-center gap-2 text-sm text-grey-600 tabular">
                        <Phone className="size-3 shrink-0 text-grey-400" />
                        {formatPhone(contact.phone)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Room mix" />
            <CardBody className="pt-0">
              <DetailList>
                {h.roomMix.map((mix, i) => {
                  const [name, count] = mix.split(" - ");
                  return (
                    <DetailRow key={i} label={name ?? mix}>
                      <span className="tabular">{count ?? "—"}</span>
                    </DetailRow>
                  );
                })}
              </DetailList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Commercial" />
            <CardBody className="pt-0">
              <DetailList>
                {canSeeCommission && (
                  <>
                    <DetailRow label="Commission">
                      <span className="flex items-center gap-2.5">
                        <span className="tabular">
                          {commercial.data
                            ? `${commercial.data.commissionPercent}%`
                            : "Not set"}
                        </span>
                        {can(role, "edit", "commission_terms") && (
                          <CommissionDialog
                            hotelId={h.id}
                            hotelName={h.name}
                            current={commercial.data}
                          />
                        )}
                      </span>
                    </DetailRow>
                    {commercial.data?.negotiatedBy && (
                      <DetailRow label="Negotiated by">{commercial.data.negotiatedBy}</DetailRow>
                    )}
                  </>
                )}
                <DetailRow label="Status">
                  <StatusPill tone={HOTEL_TONES[h.status] ?? "neutral"}>{h.status}</StatusPill>
                </DetailRow>
                <DetailRow label="Onboarded">{dateShort(h.onboardedAt)}</DetailRow>
                <DetailRow label="Category">{humanise(h.category)}</DetailRow>
              </DetailList>
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function ChipSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-2.5">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center px-2.5 py-1 rounded-full bg-grey-100 text-sm text-grey-700"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="h-3 w-48 mb-3" />
      <Skeleton className="h-8 w-80 mb-2" />
      <Skeleton className="h-3.5 w-64 mb-8" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </Page>
  );
}
