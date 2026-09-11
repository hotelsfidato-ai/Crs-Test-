/* ══════════════════════════════════════════════════════════════════
   SEED THE LOCAL EMULATOR

   Creates throwaway accounts in the Auth and Firestore EMULATORS so the
   app can be signed into and exercised locally without touching the
   live project.

     npm run emulator:local      # terminal 1 — leave running
     npm run seed:local          # terminal 2 — once per emulator start
     npm run dev:local           # terminal 3 — http://localhost:5173

   ⚠️ WHY THIS EXISTS. Plain `npm run dev` talks to PRODUCTION. .env
   leaves VITE_USE_FIREBASE_EMULATOR empty, so a "local" test import
   writes real records into the live database — and customers and
   companies can never be deleted there (`allow delete: if false`). A
   test file imported from localhost would be permanent.

   ⚠️ Emulator only, by construction. Every request goes to 127.0.0.1,
   and it refuses to run if the emulator is not answering, rather than
   falling through to anything real. The emulator keeps nothing between
   restarts, so re-run this each time it starts.

   Needs no Admin SDK: the Auth emulator accepts sign-ups over REST with
   any API key, and the Firestore emulator lets `Bearer owner` bypass the
   rules — which is what writing the first Owner requires, exactly as it
   does in the console for the real project.
   ══════════════════════════════════════════════════════════════════ */

const PROJECT = "crstest-9a0c5";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

/* Emulator-only. Never valid against the real project, and never meant
   to be — the Auth emulator accepts any key and any password. */
const KEY = "local-emulator-key";
const PASSWORD = "local-only-123";

const PEOPLE = [
  { email: "owner@fidato.local",  name: "Owner (local)",  role: "owner",       department: "Management" },
  { email: "desk@fidato.local",   name: "Desk (local)",   role: "crs_manager", department: "CRS Desk" },
  { email: "haider@fidato.local", name: "Haider (local)", role: "salesperson", department: "Corporate Sales" },
  { email: "pijush@fidato.local", name: "Pijush (local)", role: "salesperson", department: "Travel Trade" },
];

async function emulatorUp() {
  try {
    const auth = await fetch("http://127.0.0.1:9099/");
    const fs = await fetch("http://127.0.0.1:8080/");
    return auth.ok && fs.ok;
  } catch {
    return false;
  }
}

async function uidFor(email) {
  const body = JSON.stringify({ email, password: PASSWORD, returnSecureToken: true });
  const headers = { "content-type": "application/json" };

  let res = await fetch(`${AUTH}/accounts:signUp?key=${KEY}`, { method: "POST", headers, body });
  let json = await res.json();
  if (json.localId) return json.localId;

  // Already there from an earlier run — the emulator kept it.
  if (json.error?.message === "EMAIL_EXISTS") {
    res = await fetch(`${AUTH}/accounts:signInWithPassword?key=${KEY}`, { method: "POST", headers, body });
    json = await res.json();
    if (json.localId) return json.localId;
  }
  throw new Error(`Could not create ${email}: ${JSON.stringify(json.error ?? json)}`);
}

/** Firestore REST wants every value typed. */
function toFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Date) out[k] = { timestampValue: v.toISOString() };
    else if (typeof v === "number") out[k] = { integerValue: String(v) };
    else if (typeof v === "boolean") out[k] = { booleanValue: v };
    else out[k] = { stringValue: String(v) };
  }
  return out;
}

async function writeDoc(path, data) {
  const res = await fetch(`${FIRESTORE}/${path}`, {
    method: "PATCH",
    /* ⚠️ Bypasses the security rules. Only the emulator honours it. */
    headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`Writing ${path}: ${res.status} ${await res.text()}`);
}

async function main() {
  if (!(await emulatorUp())) {
    console.error(
      "✗ The emulator is not running on 127.0.0.1 (auth 9099, firestore 8080).\n" +
        "  Start it first:  npm run emulator:local",
    );
    process.exit(1);
  }

  const now = new Date();
  console.log(`Seeding the local emulator (project ${PROJECT})\n`);

  for (const p of PEOPLE) {
    const uid = await uidFor(p.email);
    await writeDoc(`users/${uid}`, {
      name: p.name,
      email: p.email,
      phone: "",
      role: p.role,
      status: "active",
      branch: "Local",
      department: p.department,
      authUid: uid,
      /* ⚠️ Present on purpose. A missing date once blanked the whole
         Users screen, so a seed without them tests less than production. */
      invitedAt: now, lastSeenAt: now,
      createdAt: now, createdBy: "seed", updatedAt: now, updatedBy: "seed",
    });
    console.log(`  ✓ ${p.role.padEnd(12)} ${p.email}`);
  }

  console.log(`\nPassword for all four: ${PASSWORD}`);
  console.log("These exist only in the emulator and vanish when it stops.\n");
  console.log("Next:  npm run dev:local   →   http://localhost:5173");
  console.log("Emulator UI, to inspect what an import wrote:  http://127.0.0.1:4000/firestore");
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
