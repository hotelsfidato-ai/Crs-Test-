import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseConfig } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   THE SUPABASE MIRROR

   Firestore stays the system of record. Every write is ALSO copied
   here, so there is a queryable SQL copy of the book — for reporting,
   for a future migration, and as something closer to a backup than
   nothing.

   ⚠️ THE MIRROR IS BEST-EFFORT AND WILL DRIFT. It is written from the
   browser after the Firestore write commits. If the tab closes
   mid-flight, the network drops, or Supabase is down, that row is
   simply missing and nothing retries it. There is no transaction
   spanning the two databases and there cannot be one from a browser.

   So: never read a figure from the mirror and present it as the truth.
   It is for analysis and recovery, not for the folio. Reconciling
   properly needs a Cloud Function on Firestore triggers, which needs
   the Blaze plan.

   ⚠️ THE ANON KEY IS PUBLIC. It ships inside the JS bundle, so
   whatever the browser may do, anyone reading DevTools may do. The RLS
   policy must therefore grant INSERT only — never SELECT. That caps
   the damage at junk rows instead of the entire guest book being
   readable by anyone who views source. See docs/supabase/README.md.
   ══════════════════════════════════════════════════════════════════ */

export interface MirrorResult {
  ok: boolean;
  detail: string;
  durationMs: number;
}

/** Rebuilt only when the configuration actually changes. */
let cached: { url: string; key: string; client: SupabaseClient } | null = null;

function clientFor(config: SupabaseConfig): SupabaseClient {
  const url = config.url.trim();
  const key = config.anonKey.trim();
  if (cached && cached.url === url && cached.key === key) return cached.client;

  const client = createClient(url, key, {
    auth: {
      /* ⚠️ No session handling. Firebase Auth owns identity; a second
         library persisting its own tokens to localStorage would be a
         second source of truth about who is signed in. */
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  cached = { url, key, client };
  return client;
}

export function shouldMirror(
  config: SupabaseConfig | null | undefined,
  collection: string,
): boolean {
  if (!config?.enabled || !config.url || !config.anonKey) return false;
  // An empty list means everything, matching the webhook's behaviour.
  if (!config.collections?.length) return true;
  return config.collections.includes(collection);
}

/**
 * Copies one document into the mirror.
 *
 * ⚠️ `upsert` on the Firestore id, not `insert`. A record written then
 * edited would otherwise appear twice, and a retried write would
 * collide on the primary key. The mirror should converge on the
 * current state of a document, not accumulate every attempt.
 */
export async function mirrorRow(
  config: SupabaseConfig,
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<MirrorResult> {
  const started = performance.now();
  try {
    const { error } = await clientFor(config)
      .from(tableFor(config, collection))
      .upsert(
        {
          id,
          data,
          mirrored_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    const durationMs = Math.round(performance.now() - started);
    if (error) {
      return { ok: false, detail: describeSupabaseError(error.message), durationMs };
    }
    return { ok: true, detail: "Mirrored", durationMs };
  } catch (error) {
    /* ⚠️ A wrong project URL and a network failure are indistinguishable
       from a browser — both arrive as an opaque "Failed to fetch". Say
       what to check instead of repeating the exception, because the two
       fixes are completely different. */
    const raw = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      detail: /failed to fetch|networkerror|load failed/i.test(raw)
        ? "Could not reach that project. Check the URL is exactly the one in " +
          "Supabase → Project Settings → Data API, and that the project is not paused."
        : raw,
      durationMs: Math.round(performance.now() - started),
    };
  }
}

/**
 * Firestore collections and Postgres tables are named the same by
 * default. `tablePrefix` exists for a project that already has a
 * `reservations` table it does not want a mirror writing into.
 */
export function tableFor(config: SupabaseConfig, collection: string): string {
  return `${config.tablePrefix?.trim() ?? ""}${collection}`;
}

/**
 * Supabase reports the two failures that actually happen here in terms
 * that mean nothing to whoever configured it.
 */
function describeSupabaseError(message: string): string {
  /* ⚠️ supabase-js RETURNS this rather than throwing, so it has to be
     handled here as well as in the catch. A wrong project URL and a
     paused project are indistinguishable from a browser — both surface
     as an opaque "Failed to fetch" — and the raw text sends people
     looking at their key, which is never the cause. */
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return (
      "Could not reach that project. Check the URL is exactly the one in " +
      "Supabase → Project Settings → Data API, and that the project is not paused. " +
      "Free projects pause after a week of inactivity."
    );
  }
  if (/row-level security|violates row-level/i.test(message)) {
    return (
      "Blocked by row-level security. The table needs a policy granting INSERT " +
      "to the anon role — see the SQL in docs/supabase/README.md."
    );
  }
  if (/relation .* does not exist|Could not find the table/i.test(message)) {
    return "That table does not exist yet. Run the setup SQL first.";
  }
  if (/Invalid API key|JWT/i.test(message)) {
    return "Supabase rejected the key. Check you pasted the anon (public) key.";
  }
  return message;
}

/** A representative row, so a test exercises the real shape. */
export function sampleMirrorRow(): Record<string, unknown> {
  return {
    note: "Test from Fidato CRS. No record was created.",
    reference: "FH-2026-00000",
    status: "confirmed",
    totalAmount: 24_150,
  };
}
