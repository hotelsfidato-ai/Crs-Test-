# Rollback — the way back out

**Habit 9 of the field guide.** The confidence to let an AI make bigger changes comes from
knowing exactly how to reverse them.

[`RUNBOOK.md`](RUNBOOK.md) is how to *operate* the platform. This is how to undo the change you
just made.

---

## Know this before you need it

**Four things here roll back differently, and two of them do not roll back at all.**

| Layer | Reversible? | How |
|---|---|---|
| Application code | ✅ Fully | git — it is all committed |
| Hosting | ✅ Fully | Firebase keeps every release |
| Firestore **rules** | ✅ Fully | Re-deploy the previous file from git |
| Firestore **data** | ❌ **No.** Spark has no backups | — |
| Supabase register data | ⚠️ Only by hand | Point-in-time recovery is a paid feature |
| n8n workflow | ⚠️ Manually | Re-import the JSON from `docs/n8n/` |

⚠️ **There is no undelete.** This is the whole reason for constraint 15 — cancel, pause or
disable rather than delete. A `git revert` restores the code that deleted the records; it does
not restore the records.

---

## Rolling back code

Find the commit:

```bash
git log --oneline -15
```

Undo one commit, keeping the history honest:

```bash
git revert <sha>
```

Undo several, oldest-first:

```bash
git revert --no-commit <oldest-sha>^..<newest-sha>
git commit
```

⚠️ **Prefer `revert` over `reset`.** `main` is pushed and public. A reset plus a force-push
rewrites history other clones already have.

Then re-run [`TEST-CHECKLIST.md`](TEST-CHECKLIST.md) — a revert is a change like any other, and
reverting one of two coupled commits is how you get a state neither commit was tested in.

---

## Rolling back hosting

The fastest way back, and it needs no rebuild.

**Firebase console → Hosting → Release history → the previous release → Rollback.**

From the CLI, redeploy a known-good build instead:

```bash
git checkout <good-sha> -- .
npm run build
npx firebase deploy --only hosting --project crstest-9a0c5
```

⚠️ **Hosting and rules roll back separately.** Rolling back hosting while leaving new rules in
place leaves an old client against a new boundary — usually visible as permission errors on
screens that worked yesterday. Roll back both or neither.

---

## Rolling back rules

```bash
git checkout <good-sha> -- firestore.rules
npm run test:rules
npx firebase deploy --only firestore:rules --project crstest-9a0c5
```

⚠️ **Run the tests even on a rollback.** The old rules were correct against the old schema. If
the data has moved on, restoring them can refuse reads that now need to work — or permit ones
that no longer should.

---

## When data has already been written

Nothing restores it. What is left is limited, so reach for it in this order.

1. **`auditLogs`** — the collection records who did what and when. It will not give you the
   record back, but it tells you what was there and who removed it.
2. **`automationQueue`** — every reservation that reached n8n left a row holding its payload.
   For a deleted reservation, that payload is the closest thing to a copy that exists.
3. **The register's Supabase project** — reservations created after the register wiring exist
   there too, and that is a separate database with a separate deletion path.
4. **The original spreadsheet** — `FH Booking Register.xlsx` is the source for all 6,626
   register rows and can be re-imported.

⚠️ **Before any bulk delete, export first.** Every list screen has an export. Thirty seconds
against an unrecoverable mistake is not a trade worth thinking about.

---

## Rolling back the n8n workflow

The workflow lives in n8n, not in this repo — the JSON here is the source of truth for what it
*should* be.

1. n8n → the workflow → **⋯ → Import from File**
2. Choose `docs/n8n/fidato-reservation-meta.json`
3. Re-enter credentials — they are never in the JSON

⚠️ **Turning the webhook off is the fast stop.** `settings/webhook.enabled = false` in Firestore
halts delivery without touching n8n at all, and reservations still queue. Use it when automation
is misbehaving and you need the platform to keep working.

⚠️ **A green "Send test" proves less than it appears to.** The test path forces the webhook
enabled, so it succeeds while real bookings silently queue and never send.

---

## After any rollback

1. Re-run [`TEST-CHECKLIST.md`](TEST-CHECKLIST.md) in full.
2. Check the deployed app, not the local one.
3. Write what happened in [`DECISIONS.md`](DECISIONS.md) — a rollback is a decision, and the
   next person needs to know the reverted approach was tried and why it failed. Otherwise it
   gets attempted again.
4. Update [`HANDOVER.md`](HANDOVER.md) so the next session does not start from the wrong state.
