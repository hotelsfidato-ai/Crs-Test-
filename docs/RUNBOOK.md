← [Docs index](README.md)

# Runbook

Operational procedures. Deploy, rebuild, recover.

---

## Environment

| | |
|---|---|
| Firebase project | `crstest-9a0c5` |
| Plan | **Spark** — no Cloud Functions, no Admin SDK |
| Hosting | https://crstest-9a0c5.web.app |
| Console | https://console.firebase.google.com/project/crstest-9a0c5 |
| Repo | https://github.com/hotelsfidato-ai/Crs-Test- (public) |

### Current service state

| Service | State |
|---|---|
| Hosting | ✅ Live — still serving the Phase 1 build until the next deploy |
| Firestore | ⚠️ Rules written and role-aware, **not yet deployed** |
| Realtime Database | 🔒 Denied. Exists but unused — the project uses Firestore |
| Storage | ❌ Not provisioned. Only needed once vouchers/PDFs land |
| Authentication | ⚠️ Code complete, **provider not yet enabled in the console** |

---

## Going live with Phase 2

Four steps, in this order. Doing them out of order either locks you out
or leaves the database open.

### 1. Enable Email/Password sign-in

Console → **Authentication → Sign-in method → Email/Password → Enable**.

Leave "Email link (passwordless)" off. Nothing in the app uses it, and an
enabled provider nobody uses is an attack surface nobody watches.

### 2. Deploy the rules — before anyone signs up

```bash
firebase deploy --only firestore:rules --project crstest-9a0c5
```

⚠️ Do this *before* step 3. The rules are what stop a freshly created
account from writing whatever it likes; deploying them after the first
sign-up means there is a window where the database is open.

### 3. Bootstrap the first Owner

This is the one step that cannot be done from inside the app, and the
reason is structural: **only an Owner or Admin may create an invitation,
and at this point neither exists.** On the Spark plan there is no Admin
SDK to break the cycle from a script, so the first invitation is written
by hand from the console, which bypasses rules.

Console → **Firestore Database → Start collection**:

| | |
|---|---|
| Collection ID | `invitations` |
| Document ID | your email, **lower-cased** — e.g. `influvateseo@gmail.com` |

Fields (all type `string` unless noted):

| Field | Value |
|---|---|
| `email` | the same lower-cased address as the document ID |
| `name` | your name |
| `role` | `owner` |
| `department` | `Management` |
| `branch` | *(anything, or blank)* |
| `invitedAt` | type **timestamp**, now |
| `invitedBy` | `bootstrap` |
| `invitedByName` | `Bootstrap` |

⚠️ The document ID **must** equal the email exactly. The security rule
checks `request.auth.token.email == email` against the document ID —
a mismatch of even one character means the invitation cannot be claimed,
and the error will look like "no invitation exists".

Then open the app at `/signup`, enter that address and a password of your
choosing. The app reads the invitation, creates `users/{your-uid}` with
role `owner`, and deletes the invitation. You are in.

From that point every other account is invited from **Admin → Users**.

### 4. Load your data

**Import → Bulk import**, one entity at a time, in this order:

1. **Properties** — reservations reference them
2. **Companies** — customers attach to them
3. **Customers** — last, so the company match resolves

Download the Excel template for each. The second sheet, *Field guide*,
lists every column, whether it is required, and which alternative
headings the importer accepts. You do not need to use the exact
headings — an export from another system usually maps itself.

⚠️ The 32 real properties from the fact sheets are kept in
`scripts/hotels.reference.ts`. They are reference material, not runtime
data. Convert them to a spreadsheet and import them like anything else,
or add them from **Properties → Add property**.

### 5. The n8n service account (only when Phase 2.5 starts)

n8n signs in as a normal Firebase account whose profile carries the
`automation` role.

⚠️ It cannot be invited from the app: the invitation rule explicitly
refuses `role: automation`, so that nobody can hand a person the service
account by mistake. Create it the same way as the bootstrap Owner —
console → Authentication → Add user, then a `users/{that-uid}` document
with `role: automation` and `status: active`.

---

## First-time setup on a new machine

```bash
git clone https://github.com/hotelsfidato-ai/Crs-Test-.git
cd Crs-Test-
cp .env.example .env          # fill in from Firebase console → Project settings
```

⚠️ **Run `npm install` from PowerShell, not Git Bash.** Git Bash lacks `cmd.exe` on PATH, which
breaks npm lifecycle scripts.

If it fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, the network has a TLS-inspecting proxy.
Export the Windows root CAs to `win-ca-bundle.pem` in the project root, then copy
`.npmrc.example` to `.npmrc` and uncomment the `cafile` line.

```powershell
npm install
npm run dev                   # http://localhost:5173
```

---

## Deploy

### Pre-flight

```bash
npx tsc --noEmit -p tsconfig.app.json    # must be clean
npm run build                            # must be clean
```

### Deploy the app

```bash
npm run build
firebase deploy --only hosting --project crstest-9a0c5
```

### Deploy security rules

⚠️ **Rules first, always.** If a deploy widens what the app can reach, the rules must be in
place before the code that uses them.

```bash
firebase deploy --only firestore:rules --project crstest-9a0c5
```

Storage rules will work once Storage is provisioned:

```bash
firebase deploy --only storage --project crstest-9a0c5
```

### Verify a deploy

```bash
# 1 · the app loads
curl -sI https://crstest-9a0c5.web.app | head -1        # expect 200

# 2 · deep links work (SPA rewrite)
curl -sI https://crstest-9a0c5.web.app/admin/roles | head -1   # expect 200, not 404
```

Then in a browser console, confirm the databases are still closed:

```js
await (await fetch("https://firestore.googleapis.com/v1/projects/crstest-9a0c5/databases/(default)/documents/x?key=YOUR_KEY")).status
// expect 403

await (await fetch("https://crstest-9a0c5-default-rtdb.firebaseio.com/.json")).status
// expect 401
```

⚠️ **Run this check after any rules change.** An accidentally-open database on a public project
id is the most likely serious incident on this project.

---

## Rollback

Firebase Hosting keeps previous releases.

```bash
firebase hosting:releases:list --project crstest-9a0c5
```

Or in the console: **Hosting → Release history → ⋮ → Rollback**. Takes effect in seconds.

For rules, redeploy from a known-good commit:

```bash
git show <commit>:firestore.rules > firestore.rules
firebase deploy --only firestore:rules --project crstest-9a0c5
```

---

## Rebuild the manual PDF

```bash
cd tools/pdf
npm install          # first time, from PowerShell
npm run build        # → docs/Fidato-Platform-Phase-1-Manual.pdf
```

Check the output reports `diagrams rendered: N/N`. If the numbers differ, a Mermaid diagram
failed and appears in the PDF as plain text with a red left border.

⚠️ A `;` inside a Mermaid sequence message is a statement separator and breaks the parse. Use an
em dash.

Inspect specific pages without opening the PDF:

```bash
node preview.mjs 1 6 42        # → tools/pdf/preview/*.png
```

---

## Screenshot the running app

The browser preview pane renders too small to judge UI. Use:

```bash
npm run dev                    # in one terminal
cd tools/pdf && node shots.mjs # in another → tools/pdf/shots/*.png
```

Captures 11 screens at 1440×900 @2x across several roles. Pass routes as arguments for others.

---

## Emulators

```bash
firebase emulators:start       # firestore 8080 · auth 9099 · UI 4000
```

Set `VITE_USE_FIREBASE_EMULATOR=1` in `.env` to point the app at them.

⚠️ Phase 1 uses no Firebase, so emulators are only useful from sprint S3 onward.

---

## Git

```bash
git switch -c phase-2/s03-auth
# work, commit per module
git push -u origin phase-2/s03-auth
# PR → self-review the diff → merge to main
```

Tags mark phase boundaries:

```bash
git tag -l
git show pre-phase-2
```

---

## Incident: the whole app is unclickable

**Symptom.** Nothing responds. No console error. The page looks normal.

```js
getComputedStyle(document.body).pointerEvents   // "none" → confirmed
```

**Cause.** A Radix modal unmounted while open and stranded the scroll lock.

**Recovery.** Reload, or:

```js
document.body.style.removeProperty("pointer-events");
document.body.removeAttribute("data-scroll-locked");
```

A guard in `AppShell` clears this on route change. If it recurs, a new modal is navigating
before closing. See [`manual/11-diagnostics.md` §11.1](manual/11-diagnostics.md).

---

## Incident: a database is open

**Symptom.** The verification fetch returns 200 instead of 403/401.

**Immediate action:**

```bash
git checkout firestore.rules       # restore deny-all
firebase deploy --only firestore:rules --project crstest-9a0c5
```

Then check the console's **Firestore → Usage** tab for unexpected reads or writes, and review
what was exposed. The project id and web API key are public, so an open database is reachable by
anyone.

---

## Quota watch

Spark daily limits: **50k reads · 20k writes · 20k deletes · 1 GiB stored.**

Monitor at **Firebase console → Firestore → Usage**.

⚠️ The read quota is the one to watch. Two habits protect it:

- Never fetch a collection to count it — use `getCountFromServer()` or a stored counter.
- Keep TanStack Query's `staleTime` at 30s so tab-switching does not refetch.

A report that reads all 1,100 reservations to aggregate costs 1,100 reads *per view*. Ten views
is a fifth of the daily quota.
