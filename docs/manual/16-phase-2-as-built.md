# Volume XVI — Phase 2 as built

Volume XIV is the Phase 2 *plan*, written before the build. This volume is what was actually
constructed, and where the two disagree, **this one is what shipped**.

Read Volume XIV for the reasoning that preceded the work and the effort estimates. Read this for
the system that exists.

---

## 16.1 The constraint that shaped everything: Spark

The project runs on the Firebase **Spark** plan. Volume XIV assumed Cloud Functions. There are
none, and there is no Admin SDK.

Four of the handover's recommendations had to be redesigned before any of them could be built:

| Volume XIV proposed | Why it is impossible | What was built |
|---|---|---|
| Cloud Function roll-up counters | No functions | Counters updated inside the client transaction that creates the booking |
| Server-side customer merge | No functions | A transactional merge in the repository layer |
| Server-issued invoice numbers | No functions | A `counters` document incremented transactionally |
| Custom claims carrying the role | Claims need the Admin SDK | The role lives in `users/{uid}.role`; every rule re-reads it |
| Immutable audit via a function | No functions | Rules permit create and refuse update and delete |

Three further consequences follow from the same constraint and appear throughout the system:

**Every Firestore read must be bounded.** Spark allows 50,000 reads a day. A report that reads
every reservation to aggregate costs one read per row *per view*. `getCountFromServer` for
counts, `limit()` everywhere else. This is Constraint 5.

**No server means no secrets.** Anything the app knows, a user can read out of the bundle. That
is why automation goes through a queue and a webhook rather than the app calling Drive or
WhatsApp directly, and why the register's publishable Supabase key grants nothing on its own.

**No server means no scheduled work.** Nothing runs unless a browser or n8n makes it run.

---

## 16.2 Identity

### The chain

```
LoginPage
  └─ signInWithEmailAndPassword           firebase/auth
       └─ onAuthStateChanged              src/lib/session.ts
            └─ getDoc(users/{uid})        ← the role lives here
                 └─ useSession.role
                      ├─ navigationFor(role)   → what the sidebar shows
                      └─ <Guard>               → what the router opens
```

⚠️ **The `users` document id must be the auth uid.** Rules resolve a role with
`get(/databases/$(db)/documents/users/$(request.auth.uid))`, and **rules cannot query** — they
can only fetch a document by a path they can construct. A `users` collection keyed by anything
else could not be read by a rule at all.

Volume XIV proposed keying users by email. That would not have worked, and the reason is worth
holding on to: it is not a preference, it is a hard property of the rules language.

### Invitations, and why they are a separate collection

An invited person has no uid until they sign up, so they cannot have a `users` document. The
invitation therefore lives in `invitations/{lowercased-email}`.

The deterministic id is also what makes the invitation readable by the person it belongs to and
nobody else:

```
allow read: if request.auth.token.email.lower() == invitationId;
```

A random id would have required a query, which rules cannot do.

### Bootstrap is a deliberate chicken-and-egg

Only an Owner or Admin may create an invitation. With no Admin SDK, no script can create the
first one. **The first Owner is written by hand in the Firebase console**, which bypasses rules
entirely. `docs/RUNBOOK.md` carries the procedure.

⚠️ Rules explicitly refuse `role: automation` on an invitation, so the service account n8n uses
can never be handed to a person by mistake.

### Claiming an invitation onto an existing account

A late addition, after a real failure. Someone could hold a Firebase Auth account with no
`users` document — signed in, and roleless, with no way forward. `claimInvitation` repairs that
state by writing the `users` document for an already-authenticated uid.

---

## 16.3 The permission model, in two halves

**Both halves exist and neither is optional.**

| Half | File | Decides | If it is wrong |
|---|---|---|---|
| Client matrix | `src/lib/permissions.ts` | What renders — navigation, buttons, routes | A screen that opens and then fails, or a capability nobody can find |
| Rules | `firestore.rules` | What returns | Actual exposure |

⚠️ **A grant in the matrix is not a permission.** `firestore.rules` is the only real boundary.
The matrix merely decides what a user is invited to try.

They cannot see each other, so they drift. `src/lib/permissions.test.ts` exists solely to assert
they agree, resource by resource, and its comments name the rule each case mirrors. Two
resources had already drifted for Finance when that test was written — the grants had been
widened without touching the rules, which bought two broken navigation entries rather than any
additional access.

### The roles

| Role | Shape |
|---|---|
| **owner** | Everything. The only role that may create, promote or demote another Owner |
| **admin** | Everything except owner-escalation. Full user administration |
| **crs_manager** | The central desk. Every account, unscoped. No commission terms, no user administration |
| **manager** | Amends the book, does not delete from it |
| **salesperson** | Raises leads and bookings; cannot amend them. Scoped to their own records |
| **finance** | Invoices and payments. ⚠️ Deliberately no commission and no audit log |
| **viewer** | Read only |
| **hotel_manager**, **support** | Dormant — empty grant maps |
| **automation** | System. n8n only. Touches the queue and its write-back fields |

⚠️ **Finance is excluded from commission on purpose.** They handle what Fidato *bills*;
commission is what Fidato *earns*, and that is a negotiated commercial term. Granting it in the
matrix would not have widened access — the rules refuse it — it would have produced a menu entry
that opened and failed.

⚠️ **Only an Owner may create or promote an Owner.** Without that, an Admin escalates in two
moves: invite an Owner at an address they control, then claim it.

### Row-level scoping

A salesperson sees their own book. The rule and the query must agree exactly:
`scopeConstraints` narrows the query to `ownerId == me`, and the rule permits the same. A rule
and a query that disagree do not return a subset — **the query fails outright**.

---

## 16.4 Data, and the shapes Firestore refuses

### `undefined` is not a value

Firestore rejects a document containing `undefined` anywhere, and the error does not name the
field. This surfaced as *"Could not create / Nothing was saved"* on reservation creation.

Every denormalised field is now coalesced at the call site:

```ts
customerId: customer.id,
customerName: customer.fullName ?? "",
hotelId: hotel.id,
hotelName: hotel.name ?? "",
hotelCity: hotel.city ?? "",
```

`toDoc()` strips `undefined` as a second line of defence, and the collection defaults were
backfilled so a document that predates a field still reads.

### Transactions: all reads before all writes

Firestore aborts a transaction the moment it reads after writing — it must, because the write
was based on a snapshot and a later read could not be given a consistent view of it.

```ts
const snap  = await tx.get(customerRef);              // ─┐ every read
const cSnap = companyRef ? await tx.get(companyRef) : null; // ─┘ first
tx.set(ref, reservation);                             // ─┐ then every
tx.update(customerRef, { …rollups });                 // ─┤ write
if (companyRef) tx.update(companyRef, { …rollups });  // ─┘
```

⚠️ **The bug this replaced was intermittent by data shape, not by luck.** The company read sat
below `tx.set`. A booking for an unattached customer has only one read, so the ordering happens
to be legal and it worked. A booking for a company-linked customer threw. `tests/rules/
transactions.test.ts` pins both orderings against the real engine.

### Queries silently exclude documents missing the sort field

A Firestore `orderBy` drops any document that lacks the field. A queue sorted by a field the
queue rows did not carry returned nothing at all — no error, an empty list.

### Composite index direction must match exactly

An index built ASC does not serve a DESC query. Both are generated from the code by
`scripts/build-indexes.mjs`, so the index set cannot drift from the queries.

---

## 16.5 Commission, and why it is a subcollection

⚠️ **Firestore has no field-level read security.** A field on a document is readable by
everyone who can read that document, whatever the interface renders.

Commission therefore cannot live on `hotels/{id}`. It lives in
`hotels/{id}/private/commercial`, guarded by its own rule admitting only Owner and Admin.

Hiding it in the UI would have done nothing at all — the SDK and the REST API do not consult
the interface. This is Constraint 3, and it is the clearest example in the system of the
difference between *not shown* and *not readable*.

---

## 16.6 Import

CSV and Excel, both, with the descriptor as the single source of truth.

```
parse → guessMapping → validateRows → commit
```

⚠️ **Nothing is written until the final button.** Parsing, mapping, validation and duplicate
detection all happen in the browser against a file that never leaves the machine. An import that
half-succeeds and leaves you guessing which half is worse than one that refuses to start.

**The template is generated from the descriptor**, so it cannot drift out of date — a change to
the validation changes the template in the same commit.

Validation runs in two passes: per-field, and then `checkRow` for constraints that span
columns. The second exists because a bank branch with no account number is two individually
valid cells that are jointly useless — the voucher prints a bank block only when it has both an
account name and a number, so a half-filled row imports cleanly and then silently prints
nothing.

`xlsx` is lazily imported, so a 424 kB parser stays out of every other route.

---

## 16.7 Where the build differs from Volume XIV

| Volume XIV | As built | Why |
|---|---|---|
| Users keyed by email | Keyed by auth uid | Rules cannot query; they can only fetch by a constructible path |
| Cloud Functions for roll-ups, merge, numbering | All client-side and transactional | Spark |
| Custom claims for roles | Firestore document read by rules | No Admin SDK |
| CSV import | CSV **and** Excel | Requested during the build |
| Approvals workflow | Dropped | It modelled a step Fidato does not perform |
| — | CRS Manager role added | A central desk that works every account, unscoped |
| — | Hotel confirmation number, all five meal plans | Real operational requirements |

---

## 16.8 What Phase 2 verified

| | |
|---|---|
| Rules tests | 101, against the real rules engine in the emulator |
| Unit tests | 153 |
| Mutation check | Weakening the commission rule fails exactly three tests |

⚠️ **What none of it proves:** that a client sends the query a rule expects. The rules tests
exercise the engine; the unit tests exercise pure logic. The interactive flows — wizard,
approve/cancel, merge, import commit — remain click-tested by hand only.

---

Next: [Volume XVII — Automation and n8n](17-automation-and-n8n.md)
