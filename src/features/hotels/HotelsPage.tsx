import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, BedDouble, Hotel as HotelIcon, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { humanise, number } from "@/lib/format";
import {
  Page, PageHeader, Card, Button, FilterBar, DataTable, Pagination, EmptyState,
  StatusPill, HOTEL_TONES, StarRating, Segmented, SkeletonCards, type Column,
} from "@/components/ui";
import { hotelsRepo } from "@/data/repositories";
import { useListState } from "@/features/shared/useListState";
import type { Hotel } from "@/data/types";

const FILTER_KEYS = ["status", "category", "state"];

type View = "grid" | "table";

export default function HotelsPage() {
  const role = useSession((s) => s.role);
  const navigate = useNavigate();
  const [view, setView] = useState<View>("grid");
  const list = useListState({
    filterKeys: FILTER_KEYS,
    defaultSortBy: "name",
    defaultSortDir: "asc",
    pageSize: view === "grid" ? 24 : 25,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["hotels", list.query],
    queryFn: () => hotelsRepo.list(list.query),
  });

  const columns: Column<Hotel>[] = [
    {
      key: "name", header: "Property", sortable: true,
      cell: (h) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-900 truncate">{h.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <StarRating value={h.starRating} />
            <span className="text-sm text-grey-500">{humanise(h.category)}</span>
          </div>
        </div>
      ),
    },
    {
      key: "city", header: "Location", sortable: true,
      cell: (h) => (
        <div className="min-w-0">
          <p className="text-ink-900">{h.city}</p>
          <p className="text-sm text-grey-500 truncate">{h.state}</p>
        </div>
      ),
    },
    {
      key: "totalRooms", header: "Rooms", numeric: true, sortable: true,
      cell: (h) => number(h.totalRooms),
    },
    {
      key: "roomMix", header: "Room mix", hideBelow: "xl",
      cell: (h) => (
        <span className="text-sm text-grey-500">
          {h.roomMix.length} type{h.roomMix.length === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      /* Commission is deliberately absent from the list. It lives in a
         per-hotel private subcollection readable only by Owner and
         Admin, and a list of 32 properties cannot fetch 32 of those
         without spending 32 reads to render a column most roles are
         not allowed to see. It appears on the detail page instead. */
      key: "city", header: "Location", sortable: true, hideBelow: "lg",
      cell: (h) => (
        <span className="text-grey-600">
          {h.city}, {h.state}
        </span>
      ),
    },
    {
      key: "status", header: "Status", sortable: true,
      cell: (h) => (
        <StatusPill tone={HOTEL_TONES[h.status] ?? "neutral"}>{h.status}</StatusPill>
      ),
    },
  ];

  const hotels = data?.items ?? [];

  return (
    <Page>
      <PageHeader
        title="Properties"
        description="Partner properties Fidato sells into. Fidato does not own these."
        actions={
          can(role, "create", "hotel") ? (
            <Button asChild leadingIcon={<Plus className="size-4" />}>
              <Link to="/hotels/new">Add property</Link>
            </Button>
          ) : undefined
        }
      >
        <div className="flex items-center justify-end">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: "Grid" },
              { value: "table", label: "Table" },
            ]}
          />
        </div>
      </PageHeader>

      <FilterBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search property, city or state…"
        filters={[
          {
            key: "status", label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "onboarding", label: "Onboarding" },
              { value: "paused", label: "Paused" },
            ],
          },
          {
            key: "category", label: "Type",
            options: [
              { value: "business", label: "Business" },
              { value: "resort", label: "Resort" },
              { value: "heritage", label: "Heritage" },
              { value: "beach", label: "Beach" },
              { value: "hill_station", label: "Hill station" },
              { value: "banquet", label: "Banquet" },
            ],
          },
        ]}
        values={list.filters}
        onFilterChange={list.setFilter}
        onClear={list.clear}
      />

      {view === "table" ? (
        <DataTable
          columns={columns}
          rows={hotels}
          rowKey={(h) => h.id}
          loading={isLoading}
          error={error}
          onRetry={refetch}
          onRowClick={(h) => navigate(`/hotels/${h.id}`)}
          sortBy={list.sortBy}
          sortDir={list.sortDir}
          onSort={list.toggleSort}
          hasFilters={list.hasFilters}
          onClearFilters={list.clear}
          empty={<PortfolioEmpty />}
        />
      ) : isLoading ? (
        <SkeletonCards count={9} />
      ) : hotels.length === 0 ? (
        <Card>
          {list.hasFilters ? (
            <EmptyState
              compact
              title="No matches"
              description="No property matches the current search and filters."
            />
          ) : (
            <PortfolioEmpty />
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {hotels.map((h) => (
            <HotelCard key={h.id} hotel={h} />
          ))}
        </div>
      )}

      {data && data.total > 0 && (
        <Pagination
          className="mt-5"
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={list.setPage}
        />
      )}
    </Page>
  );
}

function HotelCard({ hotel: h }: { hotel: Hotel }) {
  return (
    <Link to={`/hotels/${h.id}`} className="group">
      <Card className="h-full flex flex-col transition-colors duration-150 hover:border-grey-300">
        {/* Brand-gradient band stands in for property photography in Phase 1. */}
        <div className="h-1 brand-gradient rounded-t-md" aria-hidden />

        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-ink-900 truncate group-hover:text-brand-orange transition-colors duration-150">
                {h.shortName}
              </h2>
              <p className="flex items-center gap-1.5 text-sm text-grey-500 mt-1">
                <MapPin className="size-3.5 shrink-0" />
                {h.city}, {h.state}
              </p>
            </div>
            <StatusPill tone={HOTEL_TONES[h.status] ?? "neutral"}>{h.status}</StatusPill>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <StarRating value={h.starRating} />
            <span className="text-sm text-grey-400">·</span>
            <span className="text-sm text-grey-500">{humanise(h.category)}</span>
          </div>

          <p className="text-sm text-grey-600 mt-3 leading-relaxed line-clamp-3 flex-1">
            {h.description}
          </p>

          <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-grey-100">
            <span className="flex items-center gap-1.5 text-sm text-grey-600">
              <BedDouble className="size-3.5 text-grey-400" />
              <span className="tabular">{h.totalRooms}</span> rooms
            </span>
            <span className="text-sm text-grey-500 tabular">
              {h.roomMix.length} room type{h.roomMix.length === 1 ? "" : "s"}
            </span>
          </div>

          {h.roomMix.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {h.roomMix.slice(0, 3).map((mix) => (
                <span
                  key={mix}
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full",
                    "bg-grey-100 text-2xs text-grey-600",
                  )}
                >
                  {mix}
                </span>
              ))}
              {h.roomMix.length > 3 && (
                <span className="text-2xs text-grey-400 self-center">
                  +{h.roomMix.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

function PortfolioEmpty() {
  return (
    <EmptyState
      compact
      icon={<HotelIcon />}
      title="No properties"
      description="Partner properties are onboarded by the operations team. Once live they can take bookings."
    />
  );
}
