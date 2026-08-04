/* ══════════════════════════════════════════════════════════════════
   PRUNE STALE FIRESTORE INDEXES

       node --experimental-strip-types scripts/prune-indexes.mjs <projectId> [--apply]

   Deletes composite indexes that exist on the project but are NOT in
   firestore.indexes.json.

   ⚠️ Why this script has to exist. `firebase deploy --only
   firestore:indexes` only ADDS. Indexes removed from the file stay on
   the project forever, and Firestore allows 200 per database — so a
   couple of regenerations of the index file exhaust the budget and the
   next deploy fails with HTTP 429. That is exactly what happened.

   ⚠️ Dry run by default. Pass --apply to actually delete. An index is
   cheap to recreate from firestore.indexes.json and expensive to lose
   silently, so nothing is destroyed without asking.

   Authentication reuses the Firebase CLI's own stored refresh token —
   the same credentials `firebase deploy` uses, on the same machine,
   for the same project. Nothing new is granted.
   ══════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const projectId = process.argv[2];
const apply = process.argv.includes("--apply");

if (!projectId) {
  console.error("Usage: node scripts/prune-indexes.mjs <projectId> [--apply]");
  process.exit(1);
}

/* ── Access token from the Firebase CLI's stored credentials ────── */

const CLI_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLI_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

function refreshToken() {
  const file = path.join(homedir(), ".config", "configstore", "firebase-tools.json");
  const config = JSON.parse(readFileSync(file, "utf8"));
  const token = config?.tokens?.refresh_token ?? config?.user?.refresh_token;
  if (!token) throw new Error("No refresh token in the Firebase CLI config. Run `firebase login`.");
  return token;
}

async function accessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLI_CLIENT_ID,
      client_secret: CLI_CLIENT_SECRET,
      refresh_token: refreshToken(),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  return (await response.json()).access_token;
}

/* ── Compare live against the file ──────────────────────────────── */

/** Ignores __name__, which Firestore appends to every index itself. */
const signature = (index) =>
  `${index.collectionGroup ?? collectionOf(index)}:` +
  (index.fields ?? [])
    .filter((f) => f.fieldPath !== "__name__")
    .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`)
    .join(",");

const collectionOf = (index) =>
  index.name?.match(/collectionGroups\/([^/]+)\/indexes/)?.[1] ?? "";

const token = await accessToken();
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;

const wanted = new Set(
  JSON.parse(readFileSync("firestore.indexes.json", "utf8")).indexes.map(signature),
);

/* The API lists per collection group; `-` means all of them.
   ⚠️ No pageSize — this endpoint rejects anything but the default. */
const live = [];
let pageToken;
do {
  const url = new URL(`${base}/collectionGroups/-/indexes`);
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`List failed: ${response.status} ${await response.text()}`);
  const page = await response.json();
  live.push(...(page.indexes ?? []));
  pageToken = page.nextPageToken;
} while (pageToken);

const stale = live.filter((index) => !wanted.has(signature(index)));

console.log(`live: ${live.length}   in file: ${wanted.size}   stale: ${stale.length}`);

if (!stale.length) {
  console.log("Nothing to prune.");
  process.exit(0);
}

if (!apply) {
  console.log("\nDry run. These would be deleted:\n");
  for (const index of stale.slice(0, 15)) console.log("  " + signature(index));
  if (stale.length > 15) console.log(`  … and ${stale.length - 15} more`);
  console.log("\nRe-run with --apply to delete them.");
  process.exit(0);
}

let deleted = 0;
for (const index of stale) {
  const response = await fetch(`https://firestore.googleapis.com/v1/${index.name}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok) {
    deleted += 1;
    if (deleted % 25 === 0) console.log(`  deleted ${deleted}/${stale.length}`);
  } else {
    console.error(`  failed: ${signature(index)} — ${response.status}`);
  }
}
console.log(`\nDeleted ${deleted} stale indexes. ${live.length - deleted} remain.`);
