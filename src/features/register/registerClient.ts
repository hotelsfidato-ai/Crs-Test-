import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@/lib/firebase";

/* ══════════════════════════════════════════════════════════════════
   THE REGISTER'S OWN DATABASE

   A separate Supabase project holding the digitised booking register —
   6,626 rows from FH Booking Register.xlsx. Nothing to do with the CRS
   data in Firestore, and deliberately not joined to it.

   ⚠️ THE TOKEN IS WHAT AUTHORISES, NOT THE KEY. The publishable key
   below ships in the bundle and grants nothing on its own: every policy
   on `bookings` requires a valid Firebase ID token from this project
   AND an entry in the `register_access` allowlist. A bare key returns
   zero rows — verified.

   That is why `accessToken` is wired to Firebase. Without it the
   request arrives unauthenticated and every query comes back empty,
   which looks exactly like a permissions bug.

   ⚠️ REQUIRES A DASHBOARD STEP. Supabase must be told to trust this
   Firebase project: Authentication → Third-Party Auth → Firebase,
   project id `crstest-9a0c5`. Until that exists Supabase rejects the
   token before RLS runs and everything returns nothing.

   See docs/supabase/register-security.md.
   ══════════════════════════════════════════════════════════════════ */

const url = import.meta.env.VITE_REGISTER_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_REGISTER_SUPABASE_KEY as string | undefined;

/** False when the register is not configured, so the screen can say so. */
export const registerConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function registerDb(): SupabaseClient {
  if (!registerConfigured) {
    throw new Error(
      "The booking register is not configured. Set VITE_REGISTER_SUPABASE_URL " +
        "and VITE_REGISTER_SUPABASE_KEY, then rebuild.",
    );
  }
  if (client) return client;

  client = createClient(url!, key!, {
    /* ⚠️ Called before every request, not once at startup. Firebase ID
       tokens expire after an hour, and `getIdToken()` refreshes when
       needed — caching the string here would work for an hour and then
       fail with an empty table until a reload. */
    accessToken: async () => (await auth.currentUser?.getIdToken()) ?? null,

    auth: {
      /* Firebase owns identity. A second library persisting its own
         session to localStorage would be a second answer to "who is
         signed in", and they would drift. */
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return client;
}

/**
 * Turns the two failures that actually happen into something actionable.
 *
 * ⚠️ Both of them surface as an empty result or an opaque message, and
 * both send people to read application code that is working correctly.
 */
export function describeRegisterError(error: unknown): string {
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error);

  if (/JWT|InvalidJWT|invalid claim|missing sub/i.test(raw)) {
    return (
      "Supabase rejected the sign-in token. The Firebase project is probably not " +
      "registered under Authentication → Third-Party Auth in Supabase."
    );
  }
  if (/permission denied|row-level security/i.test(raw)) {
    return (
      "The register refused the request. Your address needs an entry in the " +
      "register_access allowlist — being a CRS Manager in this app is not enough, " +
      "the two lists are separate."
    );
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return (
      "Could not reach the register database. Check the connection, and that the " +
      "Supabase project is not paused — free projects pause after a week idle."
    );
  }
  return raw;
}
