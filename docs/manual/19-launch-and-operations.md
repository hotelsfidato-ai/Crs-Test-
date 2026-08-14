# Volume XIX — Launch and operations

Taking the platform live, and running it afterwards.

Volume XI is the repair section — symptom to cause to fix. This volume is the procedures: what
to do on purpose, in what order, and what cannot be undone.

---

## 19.1 State at the point of launch

**14 August 2026.** Every business collection cleared at the owner's instruction so the platform
starts on real data.

| Collection | Documents |
|---|---|
| `users` | **1** — the Owner. ⚠️ The only way into the application |
| `settings` | 2 — `org` and `webhook` |
| *everything else* | 0 |

Cleared: reservations, customers, companies, hotels, roomTypes, seasons, inventory, invoices,
payments, commissions, automationQueue, automationRuns, auditLogs, notifications, counters,
importJobs, mergeJobs, and all pending invitations.

⚠️ **`counters` went with the rest, so booking references restart at `FH-2026-00001`.**

⚠️ **`settings` was deliberately kept.** It is configuration, not data: `org` holds the company
details printed on every voucher — brand name, legal name, GSTIN, registered address, support
email and phone — and `webhook` holds the n8n URL, secret and enabled flag. Deleting it would
have erased the letterhead and disarmed the automation on launch day.

⚠️ **The Owner account was kept for a reason that is not sentiment.** It was the only `users`
document. Deleting it locks the product out of itself: with no Admin SDK on Spark, the way back
in is hand-writing a document in the Firebase console.

---

## 19.2 The launch sequence

Order matters. Each step depends on the one before it.

### 1 — Clear the register

The launch wipe covered Firestore only. The register still holds its rows.

Run `docs/supabase/clear-register.sql` from the Supabase SQL editor: it counts first, offers a
backup table, then truncates.

⚠️ **The application cannot do this.** RLS scopes `DELETE` to rows the caller can see, and the
browser's publishable key sees none. That is the lockdown working correctly.

### 2 — Clear the external blockers

None of these are code, and none can be fixed from the repository.

| Blocker | Where | Until then |
|---|---|---|
| Firebase not trusted by Supabase | Supabase → Authentication → Third-Party Auth → project `crstest-9a0c5` | The register returns nothing for everyone |
| Address not on the allowlist | `register_access` in Supabase | That person sees an empty register |
| No SPF / DKIM / DMARC | DNS for `fidatohotels.com` | Vouchers land in spam |
| n8n holds the publishable key | The n8n Supabase credential needs `service_role` | New bookings are refused by the register with error 42501 |

### 3 — Invite the team

Admin → Users. Every previous invitation was cleared in the wipe.

⚠️ **Only an Owner may invite an Owner.** Rules refuse any write that sets or clears that role
from anyone else — this is what stops an Admin escalating in two moves.

⚠️ **`role: automation` cannot be invited at all.** It exists for n8n.

### 4 — Import the data, in this order

From **Import** in the sidebar. **Properties → Companies → Customers.**

The order is not cosmetic: customers reference companies by name, and reservations reference
properties. Loading customers first leaves them unlinked.

Download the template for each — it is generated from the same descriptor the importer validates
against, so it cannot drift out of date.

⚠️ **Nothing is written until the final button.** The whole file is judged before any of it is
committed.

### 5 — Raise one booking and watch it land

Before anyone raises a real one.

| Check | Where |
|---|---|
| The reservation saved | Reservations |
| Automation reported `sent` | The reservation's own page |
| The voucher arrived | The guest address you used — **check spam** |
| The PDF is right | Open it. ⚠️ No `₹` — currency prints as `INR` |
| It reached the register | The Register screen |

⚠️ **Use a customer that belongs to a company.** A customer with no company exercises only one
read inside the transaction, and the ordering bug that shape hides was a real defect.

---

## 19.3 Day-two operations

### The webhook kill switch

`settings/webhook.enabled = false` stops delivery immediately without touching n8n. Reservations
still queue.

Use it when automation misbehaves and the platform must keep working.

⚠️ **A green "Send test" proves less than it appears to** — the test path forces the webhook
enabled, so it succeeds while real bookings queue and never send. A standing banner reports the
configured-but-disabled state.

### Deploying

```bash
npm run build
npx firebase deploy --only hosting --project crstest-9a0c5
```

With rules, when rules changed:

```bash
npx firebase deploy --only hosting,firestore:rules --project crstest-9a0c5
```

⚠️ **Never deploy rules without `npm run test:rules` passing first.** Nothing deploys them
automatically, and the window between a schema change and a rules deploy is a window in which
the database is open. Constraint 6.

⚠️ **Never edit `firestore.rules` with anything that writes a BOM.** The emulator reports
`token recognition error at: ''` on line 1 and a real deploy fails the same way.

### Watching for trouble

| Signal | Means |
|---|---|
| The red banner on Reservations | Bookings did not reach n8n. Those guests have no voucher |
| Automation → Run history, 0% success | ⚠️ **Expected and misleading** — see §19.5 |
| The register says it has no rows | Genuinely empty, or you are not admitted. It cannot tell which |
| Screens empty after launch | Correct until data is imported |

---

## 19.4 What cannot be undone

⚠️ **Four things here roll back differently, and two do not roll back at all.**

| Layer | Reversible | How |
|---|---|---|
| Application code | ✅ | `git revert` |
| Hosting | ✅ | Firebase console → Hosting → Release history |
| Firestore **rules** | ✅ | Redeploy the previous file from git |
| Firestore **data** | ❌ **No** | Spark has no backups |
| Register data | ⚠️ By hand only | Point-in-time recovery is a paid feature |

**This is why Constraint 15 says cancel, pause or disable rather than delete.** A `git revert`
restores the code that deleted the records; it does not restore the records.

⚠️ **Roll hosting and rules back together or not at all.** An old client against new rules shows
as permission errors on screens that worked yesterday.

When data is already gone, what remains is limited: `auditLogs` says what was there and who
removed it; `automationQueue` holds the payload of anything that reached n8n; the register holds
reservations created since the wiring; and `FH Booking Register.xlsx` is the source for the
historical rows.

⚠️ **Export before any bulk delete.** Every list screen has one.

Full procedures: `docs/ROLLBACK.md`.

---

## 19.5 Known issues at launch

Recorded so they are recognised rather than diagnosed from scratch.

### Automation → Run history reports 0% success

⚠️ **Expected. It is not measuring what it appears to measure.**

Nothing ever writes back to an `automationQueue` row. Rows stay at `pending` with `attempts: 0`
while the reservations they belong to correctly record `sent · Delivered`. Delivery works; the
queue is write-only from the application's side.

**Trust the reservation, and the health banner** — which counts reservations, not the queue.
Volume XVII §7 has the fix and why it was not taken.

### "Duplicates" is offered to people who cannot use it

The navigation entry is gated on customer access but the screen needs the `merge` action, so a
salesperson is shown a link to a screen they cannot use. The same fault was found and fixed for
Import; the mechanism to fix it — `NavItem.canSee` and `Guard.allow` — already exists.

### Interactive flows are not click-tested

The wizard, approve/cancel, merge and import commit are covered at the logic layer and have
never been driven end to end by an automated browser. Verify them by hand after any change that
touches them.

---

## 19.6 The operating documents

The manual is the reference. These are the working files, and they are kept current.

| File | Answers |
|---|---|
| `docs/HANDOVER.md` | **Where things stand right now.** Rewritten every session |
| `docs/CONSTRAINTS.md` | What must never happen, and what is settled |
| `docs/FLOW.md` | What calls what, in what order |
| `docs/DECISIONS.md` | Why, not just what |
| `docs/TEST-CHECKLIST.md` | What "done" means — commands and expected output |
| `docs/ROLLBACK.md` | How to undo a change |
| `docs/traces/` | One file per bug, start to finish |
| `docs/RUNBOOK.md` | Deploy, rebuild, recover, and the Owner bootstrap |

`docs/FIELD-GUIDE.md` indexes them.

⚠️ **Documentation that is trusted and wrong is worse than none.** `CLAUDE.md` described an
undeployed project for weeks after it shipped. State now lives in one file that is rewritten
every session, and `CLAUDE.md` keeps only what ages slowly.

---

Next: [Volume XV — Glossary](15-glossary.md)
