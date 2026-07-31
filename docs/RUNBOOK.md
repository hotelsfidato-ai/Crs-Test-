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
| Hosting | ✅ Live — Phase 1, **no authentication** |
| Firestore | 🔒 **Deny-all.** Phase 1 uses none |
| Realtime Database | 🔒 Denied. Exists but unused — the project uses Firestore |
| Storage | ❌ Not provisioned. Needed in Phase 2 |
| Authentication | ❌ Not configured. Sprint S3 |

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
