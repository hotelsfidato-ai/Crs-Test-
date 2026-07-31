import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitMerge, CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useActor } from "@/lib/session";
import { customersRepo, type DuplicateGroup } from "@/data/repositories";
import { money, dateShort, phone as formatPhone } from "@/lib/format";
import {
  Page, PageHeader, Card, CardHeader, CardBody, Button, EmptyState,
  StatusPill, Skeleton, Dialog, DialogContent, DialogTrigger, DialogClose,
  toast, Avatar,
} from "@/components/ui";
import type { Customer } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   DUPLICATE DETECTION & MERGE
   Matching runs on normalised phone first (the strongest signal in
   this market), then email, then exact name. The merge keeps one
   record and re-points every reservation and invoice at it —
   nothing is ever deleted outright.
   ══════════════════════════════════════════════════════════════════ */

const REASON_COPY = {
  phone: { label: "Same phone number", tone: "danger" as const, confidence: "High confidence" },
  email: { label: "Same email address", tone: "danger" as const, confidence: "High confidence" },
  name: { label: "Same full name", tone: "warning" as const, confidence: "Worth checking" },
};

export default function MergePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["duplicates"],
    queryFn: () => customersRepo.duplicates(),
  });

  const groups = data ?? [];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Customers", to: "/crm/customers" }, { label: "Duplicates" }]}
        title="Duplicate customers"
        description="Records that look like the same person. Merging keeps one record and moves every reservation and invoice onto it."
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 />}
            title="No duplicates found"
            description="Every customer record has a distinct phone number, email address and name. New duplicates are flagged automatically as records are created."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link to="/crm/customers">Back to customers</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <StatusPill tone="warning">
              {groups.length} group{groups.length === 1 ? "" : "s"} to review
            </StatusPill>
            <span className="text-sm text-grey-500">
              {groups.reduce((s, g) => s + g.records.length, 0)} records involved
            </span>
          </div>

          <div className="space-y-5">
            {groups.map((group) => (
              <DuplicateCard key={`${group.reason}-${group.key}`} group={group} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

function DuplicateCard({ group }: { group: DuplicateGroup }) {
  const actor = useActor();
  const queryClient = useQueryClient();
  const [survivorId, setSurvivorId] = useState(
    // Default to the record with the most history — it has the most to lose.
    [...group.records].sort(
      (a, b) => b.totalReservations - a.totalReservations || (a.createdAt < b.createdAt ? -1 : 1),
    )[0]!.id,
  );

  const reason = REASON_COPY[group.reason];
  const survivor = group.records.find((r) => r.id === survivorId)!;
  const absorbed = group.records.filter((r) => r.id !== survivorId);

  const merge = useMutation({
    mutationFn: () =>
      customersRepo.merge(
        survivorId,
        absorbed.map((r) => r.id),
        // Fill any gap on the survivor from the records being folded in.
        {
          companyId: survivor.companyId ?? absorbed.find((r) => r.companyId)?.companyId,
          companyName: survivor.companyName ?? absorbed.find((r) => r.companyName)?.companyName,
          designation: survivor.designation ?? absorbed.find((r) => r.designation)?.designation,
          notes: [survivor.notes, ...absorbed.map((r) => r.notes)].filter(Boolean).join(" · "),
        },
        actor,
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(
        "Records merged",
        `${absorbed.length} record${absorbed.length === 1 ? "" : "s"} folded into ${result.fullName}.`,
      );
    },
    onError: () => toast.error("Merge failed", "Nothing was changed. Try again."),
  });

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2.5">
            {reason.label}
            <StatusPill tone={reason.tone} dot={false}>
              {reason.confidence}
            </StatusPill>
          </span>
        }
        description={`${group.records.length} records share ${group.reason === "phone" ? formatPhone(group.key) : group.key}`}
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary" size="sm" leadingIcon={<GitMerge className="size-4" />}>
                Merge
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Merge these records?"
              description="This cannot be undone."
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      variant="primary"
                      loading={merge.isPending}
                      onClick={() => merge.mutate()}
                    >
                      Merge {absorbed.length + 1} records
                    </Button>
                  </DialogClose>
                </>
              }
            >
              <div className="space-y-4">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-2">
                    Keeping
                  </p>
                  <div className="flex items-center gap-3 p-3 rounded-md bg-success-50 border border-success-100">
                    <Avatar name={survivor.fullName} color="#1f6f5c" size="md" />
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900 truncate">{survivor.fullName}</p>
                      <p className="text-sm text-grey-600 truncate">{survivor.email}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowRight className="size-4 text-grey-300 rotate-90" />
                </div>

                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-grey-400 mb-2">
                    Folding in
                  </p>
                  <ul className="space-y-2">
                    {absorbed.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center gap-3 p-3 rounded-md bg-grey-50 border border-grey-200"
                      >
                        <Avatar name={r.fullName} color="#9aa2a9" size="md" />
                        <div className="min-w-0">
                          <p className="text-base text-ink-900 truncate">{r.fullName}</p>
                          <p className="text-sm text-grey-500 truncate">{r.email}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-sm text-grey-600 leading-relaxed pt-2 border-t border-grey-100">
                  {absorbed.reduce((s, r) => s + r.totalReservations, 0)} reservation
                  {absorbed.reduce((s, r) => s + r.totalReservations, 0) === 1 ? "" : "s"} and any
                  invoices will move onto {survivor.fullName}. Missing fields are filled from
                  the records being folded in. The merge is written to the audit trail.
                </p>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <CardBody>
        <p className="text-sm text-grey-500 mb-3">
          Choose which record to keep. The others fold into it.
        </p>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {group.records.map((record) => (
            <RecordOption
              key={record.id}
              record={record}
              selected={record.id === survivorId}
              onSelect={() => setSurvivorId(record.id)}
            />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function RecordOption({
  record, selected, onSelect,
}: {
  record: Customer;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-left p-4 rounded-md border transition-colors duration-150",
        selected
          ? "border-brand-orange bg-brand-orange-50 ring-1 ring-brand-orange"
          : "border-grey-200 bg-white hover:border-grey-300",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <Avatar name={record.fullName} color={selected ? "#df6128" : "#9aa2a9"} size="md" />
        {selected ? (
          <StatusPill tone="accent" dot={false}>
            Keeping
          </StatusPill>
        ) : (
          <span className="text-2xs text-grey-400">Will be folded in</span>
        )}
      </div>

      <p className="font-medium text-ink-900 truncate">{record.fullName}</p>
      <p className="text-sm text-grey-600 truncate mt-0.5">{record.email}</p>
      <p className="text-sm text-grey-500 tabular truncate">{formatPhone(record.phone)}</p>

      <dl className="mt-3 pt-3 border-t border-grey-200 space-y-1 text-sm">
        <Row label="Company" value={record.companyName ?? "—"} />
        <Row label="Stays" value={String(record.totalReservations)} />
        <Row label="Revenue" value={record.totalRevenue ? money(record.totalRevenue) : "—"} />
        <Row label="Created" value={dateShort(record.createdAt)} />
        <Row label="Source" value={record.source.replace("_", " ")} />
      </dl>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-grey-500">{label}</dt>
      <dd className="text-ink-900 truncate">{value}</dd>
    </div>
  );
}
