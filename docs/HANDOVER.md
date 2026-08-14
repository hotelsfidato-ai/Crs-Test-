# Handover — where things stand right now

**Habit 1 of the field guide.** Every new session starts with amnesia. This is the difference
between "re-explain the entire project" and "here's exactly where we left off."

**Update this at the end of every session** (habit 13 — five lines, thirty seconds). It is a
*living* record of the present, not a history. History belongs in [`DECISIONS.md`](DECISIONS.md)
and in git.

**Last updated:** 2026-08-14

---

## The five-line version

1. **Wiped for launch on 2026-08-14.** Firestore holds nothing but `settings` and the one Owner.
2. Phase 2 is deployed and current — https://crstest-9a0c5.web.app
3. **The booking register is NOT yet cleared** — the app cannot do it. Run
   [`supabase/clear-register.sql`](supabase/clear-register.sql) in the Supabase dashboard.
4. Everything blocked below is a Supabase or DNS step outside this repo.
5. First job at launch: re-invite staff, then import properties → companies → customers.

---

## What is actually live

| | |
|---|---|
| Hosting | https://crstest-9a0c5.web.app — current build |
| Firestore rules | Deployed |
| Firebase project | `crstest-9a0c5` · Spark plan |
| Repo | `https://github.com/hotelsfidato-ai/Crs-Test-` — **public**, `main` pushed and current |
| Tests | 153 unit · 101 rules · typecheck and build clean |

`CLAUDE.md` carries orientation and traps only, and points here for state. **Keep it that way:**
state in a file nobody rewrites is state that goes quietly wrong.

### Live data, after the launch wipe

| Collection | Documents |
|---|---|
| `users` | **1** — `influvateseo@gmail.com`, owner. ⚠️ The only way into the app |
| `settings` | 2 — `org` (brand, GSTIN, address) and `webhook` (n8n url, secret, enabled) |
| *everything else* | **0** |

Cleared: reservations, customers, companies, hotels, roomTypes, seasons, inventory, invoices,
payments, commissions, automationQueue, automationRuns, auditLogs, notifications, counters,
importJobs, mergeJobs, and all 6 staff invitations.

⚠️ **`counters` was cleared too, so booking references restart at `FH-2026-00001`.**

⚠️ **`settings` was deliberately kept.** It is configuration, not data — deleting it would erase
the company details printed on every voucher and switch off the n8n webhook. Clear it only if
you mean to reconfigure both.

**Empty screens are correct again**, everywhere except the Owner's own account.

---

## Launch sequence

1. Run [`supabase/clear-register.sql`](supabase/clear-register.sql) — the register still holds
   its rows.
2. Clear the Supabase blockers below, or the register stays dark and vouchers keep landing in
   spam.
3. Re-invite staff from Admin → Users. All six previous invitations were removed.
4. Import in this order — **properties, then companies, then customers** — from `/import`.
   Customers reference companies by name, and reservations reference properties.
5. Raise one test booking and confirm the voucher arrives, before anyone raises a real one.

---

## Blocked, and on whom

Nothing here can be fixed from inside this repo.

| Blocked | Needs | Consequence until done |
|---|---|---|
| **The register still holds its rows** | Run [`supabase/clear-register.sql`](supabase/clear-register.sql) in the Supabase dashboard. The app cannot: RLS scopes DELETE to rows the caller can see, and the browser's key sees none | The launch wipe is incomplete |
| **The booking register returns nothing** | Supabase → Authentication → **Third-Party Auth** → register Firebase project `crstest-9a0c5`. Then the person's address in the `register_access` allowlist | The screen says "The register has no rows to show" and lists the three possible causes |
| **Email lands in spam** | SPF, DKIM and DMARC for `fidatohotels.com`, aligned to the sender | Vouchers reach guests' spam folders |
| **n8n register insert is refused** | The n8n Supabase credential holds the **publishable** key; it needs **service_role** | Reservations do not reach the register (RLS 42501) |
| **Nobody but the Owner can sign in** | Re-invite staff from Admin → Users. All six previous invitations were cleared in the launch wipe | Expected, not a fault |

---

## In flight

Nothing is half-finished in the code. The working tree is clean and every change is pushed.
**The launch wipe is half-finished** — Firestore is done, the register is not. See *Blocked*.

**Flagged but deliberately not done** — out of scope when found:

- ⚠️ **Nothing ever closes an `automationQueue` row.** The queue is empty after the wipe, so
  this is latent rather than visible — **it will reappear with the first real booking.**
  Observed before the wipe: all 6 rows sat at `pending` with `attempts: 0` while all 3
  reservations recorded `automation: sent · Delivered`. Delivery genuinely works; the queue is
  simply never written back to. Consequence: **Automation → Run history reports a 0% success
  rate and a pending count that only ever grows**, contradicting the reservations screen.
  `AutomationHealthBanner` is unaffected — it counts reservations, not the queue. The fix is a
  line in `pushToN8n`, which already knows the outcome and writes it to the reservation, or a
  write-back node in n8n. Untouched because it decides who owns the queue's lifecycle.

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
