# Handover — where things stand right now

**Habit 1 of the field guide.** Every new session starts with amnesia. This is the difference
between "re-explain the entire project" and "here's exactly where we left off."

**Update this at the end of every session** (habit 13 — five lines, thirty seconds). It is a
*living* record of the present, not a history. History belongs in [`DECISIONS.md`](DECISIONS.md)
and in git.

**Last updated:** 2026-08-14

---

## The five-line version

1. Phase 2 is **deployed and in real use** — https://crstest-9a0c5.web.app
2. Today: property delete, optional GSTIN, bank details in the property import, Import promoted
   to its own sidebar entry, and the booking register's filters and reports fixed.
3. The register is **blocked on a Supabase dashboard step** that only the account owner can do.
4. Email deliverability is **blocked on DNS** for `fidatohotels.com`.
5. Six invitations are still pending, one of them Owner-level.

**Verified 2026-08-14:** typecheck clean · 153 unit + 101 rules tests green · build clean ·
working tree clean and pushed · the deployed bundle matches this build · vouchers are actually
reaching guests (3 of 3 delivered with PDF). One real gap found — see *In flight*.

---

## What is actually live

| | |
|---|---|
| Hosting | https://crstest-9a0c5.web.app — **current build, deployed today** |
| Firestore rules | Deployed today |
| Firebase project | `crstest-9a0c5` · Spark plan |
| Repo | `https://github.com/hotelsfidato-ai/Crs-Test-` — **public**, `main` pushed and current |
| Tests | 153 unit · 101 rules · typecheck and build clean |

⚠️ **`CLAUDE.md` still says Phase 2 is "built but not deployed" and quotes 31/59 tests.** That
was true when written and is not now. Trust this file for state.

### Live data, as of 2026-08-14

| Collection | Documents |
|---|---|
| `users` | 1 (the Owner) |
| `invitations` | **6 pending** — including `owner` for `dheeraj@fidatohotels.com` |
| `hotels` | 1 |
| `reservations` | 3 |
| `customers` | 1 |
| `companies` | 0 |
| `settings` | 2 |
| `roomTypes` | 5 |
| `automationQueue` | 6 — ⚠️ all `pending`, see *In flight* |
| `auditLogs` | 9 |

The database was wiped earlier today at the user's request — every record and every user except
the Owner. What is there now is real use since then, so **empty screens are no longer
automatically correct**. Check the counts above before concluding a screen is broken.

---

## Blocked, and on whom

Nothing here can be fixed from inside this repo.

| Blocked | Needs | Consequence until done |
|---|---|---|
| **The booking register returns nothing** | Supabase → Authentication → **Third-Party Auth** → register Firebase project `crstest-9a0c5`. Then the person's address in the `register_access` allowlist | The screen now says "No rows are visible to you" instead of showing a register with no filters |
| **Email lands in spam** | SPF, DKIM and DMARC for `fidatohotels.com`, aligned to the sender | Vouchers reach guests' spam folders |
| **n8n register insert is refused** | The n8n Supabase credential holds the **publishable** key; it needs **service_role** | Reservations do not reach the register (RLS 42501) |
| **6 pending invitations** | A decision from the Owner — including one Owner-level invite | Anyone claiming them gets the role in the invite |

---

## In flight

Nothing is half-finished. The working tree is clean and every change is committed and pushed.

**Flagged but deliberately not done** — out of scope when found:

- ⚠️ **Nothing ever closes an `automationQueue` row.** All 6 rows sit at `pending` with
  `attempts: 0`, while all 3 reservations record `automation: sent · Delivered`. Delivery is
  genuinely working — the queue is simply never written back to. Consequence:
  **Automation → Run history reports a 0% success rate and a pending count that only ever
  grows**, which contradicts the reservations screen. `AutomationHealthBanner` is unaffected
  because it counts reservations, not the queue, and correctly shows nothing. The fix is a line
  in `pushToN8n` — it already knows the outcome and writes it to the reservation, so it can
  write it to the queue row too — or a write-back node in n8n. Not touched because it changes
  who owns the queue's lifecycle.

- **"Duplicates" in the sidebar has the same permission bug Import had.** It is gated on
  `canAccess(role, "customer")` but the screen needs the `merge` action, so a salesperson is
  shown a link to a screen they cannot use. `NavItem.canSee` and `Guard.allow` already exist;
  it is a two-line fix plus a test.
- **Register aggregation would be better in Postgres.** The client now pages correctly, which
  is right whatever the row cap is, but views or an RPC with `security_invoker = true` would
  do it in one request. Needs DDL access.

---

## What to read next

| You want | Read |
|---|---|
| Orientation, the trap list | [`../CLAUDE.md`](../CLAUDE.md) — auto-loaded |
| What must never happen | [`CONSTRAINTS.md`](CONSTRAINTS.md) |
| What calls what | [`FLOW.md`](FLOW.md) |
| Why something is the way it is | [`DECISIONS.md`](DECISIONS.md) |
| What "done" means | [`TEST-CHECKLIST.md`](TEST-CHECKLIST.md) |
| How to undo it | [`ROLLBACK.md`](ROLLBACK.md) |
| Full project state and history | [`CONTEXT.md`](CONTEXT.md) |

---

## How to update this file

At the end of a session, rewrite — do not append:

1. **The five-line version** — what was done, what is left, what to watch out for.
2. **Live data** — if it changed.
3. **Blocked** — add what is newly blocked, remove what was cleared.
4. **In flight** — what is genuinely half-finished, and what was flagged and skipped.
5. **The date.**

⚠️ **Delete what is no longer true rather than adding a note beside it.** A handover that
accumulates is a handover nobody reads — which is how `CLAUDE.md` came to describe a state that
had not been current for weeks.
