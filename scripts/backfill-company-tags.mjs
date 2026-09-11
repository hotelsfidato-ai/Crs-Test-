/* ══════════════════════════════════════════════════════════════════
   BACKFILL COMPANY DETAIL TAGS

   Writes the two derived fields every company now carries, onto any
   company saved before they existed or whose values are stale:

     detailTags  "has:phone", "no:email"… — the Companies Details filter
     nameKey     normalised name — search as you type, and matching a
                 DSR visit to a company already on file

   A company without them is invisible to that filter, that search and
   that matching, which is why this must run once at release.

     npm run backfill:tags                        # local emulator, dry run
     npm run backfill:tags -- --apply             # local emulator, write
     npm run backfill:tags -- --production        # LIVE project, dry run
     npm run backfill:tags -- --production --apply

   ⚠️ DRY RUN BY DEFAULT. It lists what it would change and writes
   nothing until --apply is given. Against production that is the whole
   point: read the list, then decide.

   ⚠️ Uses the SAME function the app uses — lib/companyDetails.ts — so a
   backfilled company and a freshly saved one cannot be tagged
   differently — likewise lib/companyName.ts for the key. Only those two
   fields are written (an update mask), so nothing else on the document
   can be touched even by mistake.

   Production authenticates as whoever is signed in to the Firebase CLI
   (`firebase login`), which bypasses security rules — the same power the
   console has. The emulator uses its own `Bearer owner` bypass.
   ══════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { companyDetailTags } from "../src/lib/companyDetails.ts";
import { companyNameKey } from "../src/lib/companyName.ts";

const PROJECT = "crstest-9a0c5";
const args = new Set(process.argv.slice(2));
const PRODUCTION = args.has("--production");
const APPLY = args.has("--apply");

const BASE = PRODUCTION
  ? `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
  : `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

async function bearer() {
  if (!PRODUCTION) return "owner";
  /* The Firebase CLI's own stored login. Its OAuth client is the public
     installed-app client firebase-tools ships with — not a secret. */
  const store = JSON.parse(
    readFileSync(path.join(homedir(), ".config", "configstore", "firebase-tools.json"), "utf8"),
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
      refresh_token: store.tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Not signed in to the Firebase CLI. Run: firebase login");
  return json.access_token;
}

/* Firestore REST values → plain JS, for just the fields the tags read. */
const str = (f) => f?.stringValue ?? "";
const contactsOf = (f) =>
  (f?.arrayValue?.values ?? []).map((v) => {
    const c = v.mapValue?.fields ?? {};
    return { name: str(c.name), phone: str(c.phone), email: str(c.email) };
  });

async function main() {
  const token = await bearer();
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

  console.log(
    `${PRODUCTION ? "⚠️  PRODUCTION" : "Local emulator"} · project ${PROJECT} · ` +
      `${APPLY ? "WRITING" : "dry run — nothing will be written"}\n`,
  );

  let pageToken = "";
  let seen = 0;
  let changed = 0;
  do {
    const url = `${BASE}/companies?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Listing companies: ${res.status} ${await res.text()}`);
    const page = await res.json();

    for (const d of page.documents ?? []) {
      seen += 1;
      const f = d.fields ?? {};
      const want = companyDetailTags({
        city: str(f.city), phone: str(f.phone), email: str(f.email), contacts: contactsOf(f.contacts),
      });
      const have = (f.detailTags?.arrayValue?.values ?? []).map((v) => v.stringValue);
      const tagsOk = have.length === want.length && have.every((t, i) => t === want[i]);
      const wantKey = companyNameKey(str(f.name));
      const keyOk = str(f.nameKey) === wantKey;
      if (tagsOk && keyOk) continue;

      changed += 1;
      const what = [
        tagsOk ? null : `tags ${have.length ? have.join(",") : "(none)"} → ${want.join(",")}`,
        keyOk ? null : `nameKey "${str(f.nameKey)}" → "${wantKey}"`,
      ].filter(Boolean).join("; ");
      console.log(`  ${str(f.name).padEnd(34)} ${what}`);
      if (!APPLY) continue;

      /* ⚠️ An update mask: only these two fields can change, even by mistake. */
      const mask = "updateMask.fieldPaths=detailTags&updateMask.fieldPaths=nameKey";
      const patch = await fetch(`${d.name.replace(/^.*?\/documents/, BASE)}?${mask}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          fields: {
            detailTags: { arrayValue: { values: want.map((t) => ({ stringValue: t })) } },
            nameKey: { stringValue: wantKey },
          },
        }),
      });
      if (!patch.ok) throw new Error(`Updating ${str(f.name)}: ${patch.status} ${await patch.text()}`);
    }
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);

  console.log(`\n${seen} companies checked, ${changed} ${APPLY ? "updated" : "would be updated"}.`);
  if (!APPLY && changed) console.log("Re-run with --apply to write.");
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
