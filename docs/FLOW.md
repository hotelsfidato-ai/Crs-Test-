# Flow — how execution actually travels

**Habit 4 of the field guide.** Bugs live in the gaps between files. This is the map of what
calls what, in what order, for the paths that have actually broken.

Not an architecture diagram — [`phase-2/02-architecture-and-spark.md`](phase-2/02-architecture-and-spark.md)
is the shape of the system. This is the *sequence*.

---

## The one rule the whole thing hangs off

```
React UI  →  @/data/repositories  →  Firebase  →  automationQueue  →  n8n  →  the outside world
```

Screens import from `@/data/repositories` and never from `repositories/firestore/` directly.
That seam is one line in [`src/data/repositories/index.ts`](../src/data/repositories/index.ts),
and it is why swapping the Phase 1 mock layer for Firestore moved one file instead of 34 screens.

**The React app never talks to Drive, WhatsApp, email or accounting.** It writes a row to
`automationQueue`; n8n does the rest. Anything that appears to break that rule is a bug.

---

## 1. Signing in, and where a role comes from

```
LoginPage
  └─ signInWithEmailAndPassword          firebase/auth
       └─ onAuthStateChanged             src/lib/session.ts  (useAuthListener)
            └─ getDoc(users/{uid})       ← the role lives HERE
                 └─ useSession.role
                      ├─ navigationFor(role)   src/components/app/navigation.ts   → the sidebar
                      └─ <Guard>               src/routes.tsx                     → the route
```

⚠️ **The role is a Firestore document field, not a custom claim.** Spark has no Cloud Functions
and no Admin SDK, so nothing can mint a claim. Every rule in `firestore.rules` re-reads
`users/{uid}` to find out who is asking.

⚠️ **The client half decides nothing.** `navigationFor` and `Guard` decide what *renders*;
`firestore.rules` decides what *returns*. When the two disagree you get a menu entry that opens
onto a permission error — see [`CONSTRAINTS.md`](CONSTRAINTS.md).

**The document is keyed by `uid`, not by email.** An Auth account with no matching `users`
document is signed in and roleless — the state `claimInvitation` exists to repair.

---

## 2. Creating a reservation

The path with the most moving parts, and the one that has broken twice.

```
NewReservationPage.tsx:194
  └─ reservationsRepo.create(...)              repositories/firestore/index.ts
       │
       ├─ toDoc(...)                           strips undefined  ⚠️ see below
       │
       ├─ runTransaction                                        (index.ts:883)
       │    ├─ tx.get(customerRef)             ─┐ ALL READS
       │    ├─ tx.get(companyRef)  (if linked) ─┘ FIRST
       │    ├─ tx.set(reservationRef)          ─┐ THEN ALL
       │    ├─ tx.update(customerRef, rollups) ─┤ WRITES
       │    └─ tx.update(companyRef,  rollups) ─┘
       │
       ├─ recordAudit(...)                     auditLogs/
       │
       └─ void pushToN8n("reservation.created", …)              (index.ts:1000)
            ├─ writes automationQueue/{id}     ← the durable record
            ├─ POSTs the webhook               ← fire and forget
            └─ .then(outcome => updateDoc(...)) writes the result back onto the reservation
```

⚠️ **Reads before writes, without exception.** Firestore aborts a transaction the moment it
reads after writing. The company `tx.get` used to sit below `tx.set`, so a booking for a
company-linked customer threw and a booking for an unattached customer worked — intermittent by
*data shape*, not by luck. Pinned by `tests/rules/transactions.test.ts`.

⚠️ **`undefined` is not a value Firestore accepts.** Every denormalised field is coalesced at
the call site (`?? ""`). This is what "Could not create / Nothing was saved" was.

⚠️ **`pushToN8n` is deliberately not awaited.** A booking must not fail because a webhook is
slow. The queue row is the durable record; the webhook is the optimistic path.

---

## 3. A voucher reaching a guest

```
reservation created
  └─ automationQueue row + webhook POST
       └─ n8n  (docs/n8n/fidato-reservation-meta.json)
            ├─ email        crs@fidatohotels.com
            ├─ Google Drive
            ├─ WhatsApp     Meta Cloud API
            └─ HTTP insert → the register's Supabase project
```

Two payload bodies go over the webhook, and they are not interchangeable:

| Body | Holds | Used for |
|---|---|---|
| `data.voucher` | The rendered voucher | Delivery — email, Drive, WhatsApp |
| `data.reservation` | The booking record | Storage — the register insert |

In-app rendering:

```
buildVoucher(reservation, hotel, org)      features/reservations/voucher.ts
  ├─ renderVoucherHtml(...)  → email body and the on-screen preview
  └─ buildVoucherPdf(...)    → features/reservations/voucherPdf.ts   (jsPDF, vector)
```

⚠️ **The PDF is WinAnsi only.** No `₹`, no en dash, no middot — `ascii()` strips them. A rupee
sign renders as a blank box on a document about money.

⚠️ **Gmail strips `<svg>` and blocks `data:` URIs.** The logo in the email is a hosted PNG; the
inline SVG is for the screen only.

---

## 4. The booking register — a second database

Entirely separate from Firestore, with its own identity check.

```
RegisterPage.tsx
  ├─ fetchCoverage()          register_field_coverage   → which columns hold data
  ├─ fetchReport(query)       register_bookings         → ONE paged scan
  │    └─ deriveTotals / deriveGrouped / deriveMonthly  ← folded in the browser
  └─ fetchFilterOptions()     register_bookings         → all three dropdowns, one scan

        every request ↓
   registerClient.ts  accessToken: () => auth.currentUser.getIdToken()
        │
        ├─ Supabase must trust the Firebase project   (Third-Party Auth)
        └─ the caller must be in register_access      (the allowlist)
```

⚠️ **Access is decided twice and the two lists cannot see each other.** `lib/permissions.ts`
decides whether the screen renders; `register_access` in Supabase decides whether rows come
back. Somebody in one and not the other gets a working screen over an empty table.

⚠️ **Reads use the `register_bookings` view; writes go to the `bookings` table.** The view's
folded status is derived, and writing it back would overwrite what someone actually typed.

⚠️ **PostgREST caps every response and says nothing.** Ask for 10,000 rows, get 1,000 and a 200.
Every figure here is folded in the browser, so a cap does not shorten a list — it makes the
numbers wrong. All scans page, ordered by `excel_row_num`, using the true count from
`Content-Range`.

⚠️ **Paging without an `ORDER BY` is not a smaller version of the right answer.** Postgres may
order two pages differently, so rows arrive twice or never.

---

## 5. Importing

```
ImportPage  (/import)
  parse → guessMapping → validateRows → commit
     │        │              │              └─ importRepo, one entity at a time
     │        │              └─ per-field validate, then descriptor.checkRow (cross-field)
     │        └─ header aliases from the descriptor
     └─ features/import/engine.ts + descriptors.ts
```

⚠️ **Nothing is written until the final button.** Parsing, mapping, validation and duplicate
detection all happen in the browser against a file that never leaves the machine. An import that
half-succeeds is worse than one that refuses to start.

---

## Where each flow is pinned

| Flow | Test |
|---|---|
| Transaction ordering | `tests/rules/transactions.test.ts` |
| Who may read and write what | `tests/rules/firestore.rules.test.ts` |
| Sidebar agrees with the guards | `src/components/app/navigation.test.ts` |
| Register paging past the row cap | `src/features/register/registerRepo.test.ts` |
| Permission matrix agrees with the rules | `src/lib/permissions.test.ts` |
