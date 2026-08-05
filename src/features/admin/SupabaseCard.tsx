import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, CheckCircle2, XCircle, ShieldAlert, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { adminRepo } from "@/data/repositories";
import { useActor, useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { relative } from "@/lib/format";
import {
  Card, CardHeader, CardBody, CardFooter, Button, Field, Input,
  Checkbox, StatusPill, Skeleton, fieldProps, toast, describeError,
} from "@/components/ui";
import { mirrorRow, sampleMirrorRow, type MirrorResult } from "@/lib/supabase";
import type { SupabaseConfig } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   SUPABASE MIRROR

   ⚠️ This card has to be honest about two things a settings screen
   would normally leave implicit, because getting either wrong is
   expensive and neither is discoverable:

     · the mirror is lossy, so nothing here should be read as the
       truth, and
     · the anon key is public, so the table's RLS policy — not this
       field — is what protects the data.
   ══════════════════════════════════════════════════════════════════ */

const COLLECTIONS = [
  { value: "reservations", label: "Reservations" },
  { value: "customers", label: "Customers" },
  { value: "companies", label: "Companies" },
  { value: "hotels", label: "Properties" },
];

export function SupabaseCard() {
  const actor = useActor();
  const role = useSession((s) => s.role);
  const queryClient = useQueryClient();
  const mayEdit = can(role, "edit", "integration");

  const { data, isLoading } = useQuery({
    queryKey: ["supabase-config"],
    queryFn: () => adminRepo.supabase(),
  });

  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [collections, setCollections] = useState<string[]>([]);
  const [test, setTest] = useState<MirrorResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setUrl(data.url ?? "");
    setAnonKey(data.anonKey ?? "");
    setEnabled(Boolean(data.enabled));
    setCollections(data.collections ?? []);
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<SupabaseConfig>) => adminRepo.saveSupabase(patch, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supabase-config"] });
      toast.success(
        "Mirror saved",
        enabled ? "New records will be copied to Supabase." : "Saved, but switched off.",
      );
    },
    onError: (error) => {
      const detail = describeError(error);
      toast.error(detail.title ?? "Could not save", detail.message ?? "Nothing was changed.");
    },
  });

  const looksLikeUrl = /^https:\/\/.+\.supabase\.(co|in)$/i.test(url.trim());

  async function runTest() {
    setTesting(true);
    setTest(null);
    /* ⚠️ Writes a real row into `reservations`, with a reserved id, so
       the test exercises the actual RLS policy rather than a fiction.
       Delete it afterwards with the SQL in the docs. */
    const result = await mirrorRow(
      { url: url.trim(), anonKey: anonKey.trim(), enabled: true, collections: [] },
      "reservations",
      "__fidato_test__",
      sampleMirrorRow(),
    );
    setTest(result);
    setTesting(false);

    save.mutate({
      lastTestAt: new Date().toISOString(),
      lastTestStatus: result.ok ? "ok" : "failed",
      lastTestDetail: result.detail,
    });
  }

  const dirty =
    url.trim() !== (data?.url ?? "") ||
    anonKey.trim() !== (data?.anonKey ?? "") ||
    enabled !== Boolean(data?.enabled) ||
    collections.join(",") !== (data?.collections ?? []).join(",");

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Database className="size-4 text-grey-400" />
            Supabase mirror
          </span>
        }
        description="A queryable SQL copy of the book. Firestore remains the system of record."
        actions={
          <StatusPill tone={data?.enabled ? "success" : "neutral"}>
            {data?.enabled ? "Mirroring" : "Off"}
          </StatusPill>
        }
      />

      <CardBody className="space-y-5">
        {data?.url && !data.enabled && (
          <div className="flex items-start gap-3 p-4 rounded-md border bg-brand-orange-50 border-brand-orange-100">
            <XCircle className="size-4 text-brand-orange shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-base font-medium text-ink-900">Saved, but not mirroring</p>
              <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                A project is configured but copying is unticked, so nothing has been sent.
              </p>
            </div>
          </div>
        )}

        {/* ⚠️ Stated up front. Someone who believes the mirror is
            authoritative will eventually quote a figure from it. */}
        <div className="flex items-start gap-2.5 p-3 rounded-md bg-grey-50 border border-grey-200">
          <ShieldAlert className="size-4 text-grey-400 shrink-0 mt-0.5" />
          <p className="text-xs text-grey-600 leading-relaxed">
            The copy is written from the browser after each save and <strong>nothing
            retries it</strong> — a closed tab or a dropped connection loses that row
            silently. Treat the mirror as a reporting and recovery copy, never as the
            figure of record. Making it reliable needs a Cloud Function on Firestore
            triggers, which needs the Blaze plan.
          </p>
        </div>

        <Field
          label="Project URL"
          required
          hint="Supabase → Project Settings → Data API"
          error={url && !looksLikeUrl ? "Should look like https://xxxx.supabase.co" : undefined}
        >
          {(p) => (
            <Input
              {...fieldProps(p)}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://abcdefgh.supabase.co"
              disabled={!mayEdit}
            />
          )}
        </Field>

        <Field
          label="Anon (public) key"
          required
          hint="The anon key, NOT the service_role key."
        >
          {(p) => (
            <Input
              {...fieldProps(p)}
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOi…"
              disabled={!mayEdit}
            />
          )}
        </Field>

        {/* ⚠️ The mistake that turns a mirror into a breach. */}
        <div className="flex items-start gap-2.5 p-3 rounded-md bg-brand-red-50 border border-brand-red-100">
          <ShieldAlert className="size-4 text-brand-red shrink-0 mt-0.5" />
          <p className="text-xs text-brand-red leading-relaxed">
            Never paste the <strong>service_role</strong> key here. It bypasses row-level
            security and this value is delivered to every browser — it would hand anyone
            who views source full control of the database. The anon key is safe here
            precisely because it is already public; what protects the data is the RLS
            policy, which must grant <strong>INSERT only, never SELECT</strong>.
          </p>
        </div>

        <div>
          <p className="text-sm text-ink-900 mb-2">What to copy</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {COLLECTIONS.map((c) => (
              <label key={c.value} className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox
                  checked={collections.length === 0 || collections.includes(c.value)}
                  disabled={!mayEdit}
                  onCheckedChange={(v) =>
                    setCollections((prev) => {
                      const base = prev.length === 0 ? COLLECTIONS.map((x) => x.value) : prev;
                      return v ? [...new Set([...base, c.value])] : base.filter((x) => x !== c.value);
                    })
                  }
                />
                <span className="text-sm text-ink-900">{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            checked={enabled}
            disabled={!mayEdit}
            onCheckedChange={(v) => setEnabled(Boolean(v))}
          />
          <span>
            <span className="block text-sm text-ink-900">Copy new records to Supabase</span>
            <span className="block text-xs text-grey-500 mt-0.5">
              Applies to records created from now on. Existing ones are not backfilled.
            </span>
          </span>
        </label>

        {test && (
          <div
            className={cn(
              "flex items-start gap-3 p-4 rounded-md border",
              test.ok ? "bg-success-50 border-success-100" : "bg-brand-red-50 border-brand-red-100",
            )}
          >
            {test.ok ? (
              <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-4 text-brand-red shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className={cn("text-base font-medium", test.ok ? "text-success" : "text-brand-red")}>
                {test.ok
                  ? `Supabase accepted the row in ${test.durationMs} ms`
                  : "The row was rejected"}
              </p>
              <p className={cn("text-sm mt-1 leading-relaxed", test.ok ? "text-success" : "text-brand-red")}>
                {test.detail}
              </p>
              {test.ok && (
                <p className="text-xs text-grey-600 mt-2 leading-relaxed">
                  A row with id <code className="px-1 rounded-xs bg-white border border-grey-200">
                  __fidato_test__</code> now exists in your reservations table. The test
                  writes a real row on purpose, so it exercises the real policy — delete
                  it when you are done.
                </p>
              )}
              {test.ok && !enabled && (
                <p className="text-xs text-brand-red mt-2 leading-relaxed font-medium">
                  The test ignored the setting below — real records are not copied until
                  “Copy new records to Supabase” is ticked and saved.
                </p>
              )}
            </div>
          </div>
        )}

        {data?.lastTestAt && !test && (
          <p className="text-xs text-grey-500">
            Last tested {relative(data.lastTestAt)} —{" "}
            <span className={data.lastTestStatus === "ok" ? "text-success" : "text-brand-red"}>
              {data.lastTestStatus === "ok" ? "succeeded" : "failed"}
            </span>
            {data.lastTestDetail ? `. ${data.lastTestDetail}` : ""}
          </p>
        )}
      </CardBody>

      {mayEdit && (
        <CardFooter>
          <Button
            variant="secondary"
            leadingIcon={<Copy className="size-4" />}
            onClick={() => {
              void navigator.clipboard?.writeText(SETUP_SQL);
              toast.success("SQL copied", "Run it in the Supabase SQL editor.");
            }}
          >
            Copy setup SQL
          </Button>
          <Button
            variant="secondary"
            loading={testing}
            disabled={!looksLikeUrl || !anonKey.trim()}
            onClick={() => void runTest()}
          >
            Send test row
          </Button>
          <Button
            loading={save.isPending}
            disabled={!dirty || (enabled && !looksLikeUrl)}
            onClick={() =>
              save.mutate({ url: url.trim(), anonKey: anonKey.trim(), enabled, collections })
            }
          >
            Save configuration
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * ⚠️ INSERT and UPDATE only. No SELECT policy is created on purpose:
 * the anon key is in the JS bundle, so a SELECT policy would publish
 * the entire guest book to anyone who views source. Read the mirror
 * with the service_role key from your own tooling, never the browser.
 */
const SETUP_SQL = `-- Fidato CRS → Supabase mirror
-- Run in the Supabase SQL editor.

create table if not exists public.reservations (
  id           text primary key,
  data         jsonb       not null,
  mirrored_at  timestamptz not null default now()
);
create table if not exists public.customers (
  id           text primary key,
  data         jsonb       not null,
  mirrored_at  timestamptz not null default now()
);
create table if not exists public.companies (
  id           text primary key,
  data         jsonb       not null,
  mirrored_at  timestamptz not null default now()
);
create table if not exists public.hotels (
  id           text primary key,
  data         jsonb       not null,
  mirrored_at  timestamptz not null default now()
);

alter table public.reservations enable row level security;
alter table public.customers    enable row level security;
alter table public.companies    enable row level security;
alter table public.hotels       enable row level security;

-- ⚠️ INSERT and UPDATE only, and deliberately NO select policy.
-- The anon key ships in the browser bundle, so a select policy would
-- make every guest record readable by anyone who views source.
-- Read the mirror with the service_role key from your own tooling.
do $$
declare t text;
begin
  foreach t in array array['reservations','customers','companies','hotels'] loop
    execute format('drop policy if exists mirror_insert on public.%I', t);
    execute format('drop policy if exists mirror_update on public.%I', t);
    execute format(
      'create policy mirror_insert on public.%I for insert to anon with check (true)', t);
    execute format(
      'create policy mirror_update on public.%I for update to anon using (true) with check (true)', t);
  end loop;
end $$;

-- Useful views over the jsonb.
create or replace view public.reservations_flat as
select
  id,
  data->>'reference'    as reference,
  data->>'status'       as status,
  data->>'customerName' as customer,
  data->>'hotelName'    as hotel,
  (data->>'checkIn')::date    as check_in,
  (data->>'checkOut')::date   as check_out,
  (data->>'totalAmount')::numeric as total_amount,
  mirrored_at
from public.reservations;

-- After testing:
-- delete from public.reservations where id = '__fidato_test__';
`;
