# Test checklist — what "done" means

**Habit 8 of the field guide.** An AI claiming success and code actually working are two
different facts. This is how they stop being confused.

Not a vibe check. Actual commands, actual expected output.

---

## Before any change counts as done

Run in this order. Each one catches something the next cannot.

### 1. Typecheck

```bash
npx tsc -b --pretty false
```

**Expect:** no output at all. Any output is a failure.

⚠️ **`npx tsc --noEmit` is useless here and reports zero errors on a broken build.**
`tsconfig.json` is a solution file with `"files": []` and project references, so `--noEmit`
compiles nothing. Always `-b`.

### 2. Unit tests

```bash
npx vitest run
```

**Expect:** `Test Files 12 passed (12)` · `Tests 153 passed (153)`

If the count *dropped*, a test file failed to load — vitest reports that as a pass of the files
that did load. Check the file count, not just the word "passed".

### 3. Rules tests — whenever `firestore.rules` or `lib/permissions.ts` changed

```bash
npm run test:rules
```

**Expect:** `Test Files 2 passed (2)` · `Tests 101 passed (101)`

⚠️ **A failed run orphans the emulator** and the next run reports "port taken" instead of
anything useful. Stop the process holding 8080:

```bash
netstat -ano | grep ":8080"
```

⚠️ **Never deploy rules without this passing.** Constraint 6.

### 4. Build

```bash
npm run build
```

**Expect:** `✓ built in …`. The chunk-size warning over 500 kB is known and not a failure.

### 5. Look at it

For anything with a visual result, open the app and look at a rendered screen.

```bash
npm run dev      # http://localhost:5173
```

⚠️ **Structural checks miss visual bugs.** Two identical primary buttons read as two perfectly
ordinary entries in the accessibility tree. A screenshot is not optional for UI work.

---

## What each layer can and cannot prove

Knowing this stops "the tests pass" from meaning more than it does.

| Layer | Proves | Cannot prove |
|---|---|---|
| `tsc -b` | The types line up | That the logic is right |
| `vitest run` | Pure logic — GST bands, permissions, import mapping, register folds, navigation | Anything involving Firestore, the network, or the DOM |
| `test:rules` | What the real rules engine allows, in the emulator | That the client sends the query the rule expects |
| `npm run build` | It compiles and bundles | That it runs |
| Opening it | It renders, and it looks right | Anything you did not click |

⚠️ **Nothing in this list touches the live Firebase project.** Repository methods are covered
against the emulator. A green suite is not evidence that a thing worked in production.

---

## Deploying

```bash
npm run build
npx firebase deploy --only hosting --project crstest-9a0c5
```

Rules and hosting together, when rules changed:

```bash
npx firebase deploy --only hosting,firestore:rules --project crstest-9a0c5
```

**Expect:** `+ Deploy complete!` and a Hosting URL. If rules were included, also
`+ firestore: released rules firestore.rules to cloud.firestore`.

Then check the deployed thing, not the local one.

---

## Change-specific checks

Things worth verifying that no automated test covers.

| If you touched | Also check |
|---|---|
| `firestore.rules` | Rules tests, then sign in as a role that should be refused and confirm it is |
| `lib/permissions.ts` | The sidebar changes for that role — the matrix and the rules must agree |
| The reservation transaction | Create a booking for a customer **with a company**. Without one, only a single read happens and the ordering bug hides |
| Anything on the voucher | Download the PDF and open it. WinAnsi only — no `₹`, no en dash |
| The register | Reload with a filter applied and confirm dropdowns are complete, not truncated |
| An import descriptor | Download the template and re-import it. It is generated from the descriptor, so a broken descriptor produces a template that fails its own import |
| `npm install` | Run it **from PowerShell, not Git Bash** — this machine sits behind a TLS-inspecting proxy |

---

## The honesty rule

If a step was skipped, say which and why. If a test failed and the failure looks unrelated, say
that too, with the output. A checklist that gets reported as passed when it was not run is worse
than no checklist — it converts an unknown into a false certainty.
