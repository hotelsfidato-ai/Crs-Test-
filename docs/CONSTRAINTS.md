# Constraints — what must never happen

**Habit 7 of the field guide.** "Allow" should never mean "allow anything."

This is not the trap list. [`../CLAUDE.md`](../CLAUDE.md) lists things that *look correct and
are not* — knowledge. This lists things that are *not permitted*, whoever is asking and however
reasonable it sounds in the moment. If a change requires breaking one of these, that is a
conversation, not a commit.

---

## Never, without asking

| # | Constraint | Why |
|---|---|---|
| 1 | **Never import from `repositories/firestore/` in a component.** Only from `@/data/repositories` | That seam is why swapping the backend moved one file instead of 34 screens. Every direct import welds a screen to Firebase |
| 2 | **Never let the React app call Drive, WhatsApp, email, AI or accounting directly.** Write to `automationQueue` | Spark has no Cloud Functions. A key in the browser bundle is a published key |
| 3 | **Never put commission on the `hotels` document.** It lives in `hotels/{id}/private/commercial` | Firestore rules are document-level. A field on a readable document is readable by everyone who can read that document, whatever the UI renders |
| 4 | **Never widen a grant in `lib/permissions.ts` without changing `firestore.rules` in the same commit** | The matrix decides what renders; the rules decide what returns. A grant alone buys a screen that opens and then fails |
| 5 | **Never add a Firestore read that is not bounded** | Spark allows 50k reads a day. One unbounded report can spend the day's budget in a session. `getCountFromServer` for counts, `limit()` everywhere else |
| 6 | **Never deploy rules without running `npm run test:rules` first** | Nothing deploys them automatically, and the window between a schema change and a rules deploy is a window where the database is open |
| 7 | **Never edit `firestore.rules` with anything that writes a BOM** | The emulator reports `token recognition error at: ''` on line 1 and a real deploy fails the same way |
| 8 | **Never round-trip a file through Windows PowerShell 5.1** | `Get-Content` without `-Encoding` decodes as the ANSI codepage. It corrupted nine files here and survived a typecheck, a build and 103 tests, because the damage was inside comments |
| 9 | **Never write business rules into a component.** They live in `src/lib/rules.ts` | A rule duplicated in a component will drift, and the copy nobody remembers is the one that runs |
| 10 | **Never present `amount_received` from the register as money** | The column holds bank and UTR reference numbers mixed with real payments. Summing it gives 1.37 quadrillion against 7.2 crore of revenue |
| 11 | **Never make the `register_bookings` view updatable** | Its folded status is derived. Writing it back overwrites what a person actually typed |
| 12 | **Never create a Postgres view over register data without `security_invoker = true`** | A view runs as its *owner* by default and bypasses RLS entirely. This exact mistake served all 6,626 rows to a signed-out browser |
| 13 | **Never assign the `automation` role to a person** | It exists for n8n and touches only the queue and its write-back fields |
| 14 | **Never let a non-Owner create or promote an Owner** | Otherwise an Admin escalates to Owner in two moves. The rules refuse any write that sets or clears that role unless the caller is already an Owner |
| 15 | **Never delete a record to fix it.** Cancel, pause or disable | Firestore has no undelete. Deleting a hotel with reservations against it leaves `hotelId` pointing at nothing; deleting a user detaches every audit row from a name |

---

## Scope constraints

- **One logical change per commit.** Habit 12. A large diff is a diff nobody reviews properly.
- **Explain the plan before writing the code** for anything touching rules, permissions,
  money or the data layer. Habit 11. Correcting a paragraph is cheaper than unwinding 200 lines.
- **Do not "fix" an empty screen.** Empty is frequently correct — the database genuinely has no
  records, or the filters genuinely match nothing.

---

## Things that are settled — do not re-litigate

Reopening one of these needs a reason that did not exist when it was decided. The reasoning is
in [`DECISIONS.md`](DECISIONS.md) and, for Phase 1, `manual/03-decision-log.md`.

| Settled | Answer |
|---|---|
| Occupancy from reservations ÷ rooms? | **No.** Fidato books a slice of each partner hotel. That ratio reports under 1% and means nothing |
| Finance sees commission? | **No.** They handle what Fidato bills, not what Fidato negotiated to earn |
| GST on the reservation total? | **No.** Per room line — one booking can legitimately hold both bands |
| Hide a field to secure it? | **No.** Hiding is not security; the rule is the boundary |
| Seasons may overlap? | **Yes.** The later `validFrom` wins |
| Excel import or CSV? | **Both** |

---

## When a constraint is wrong

Constraints rot. If one is genuinely blocking correct work:

1. Say which one and why, in the session.
2. Change it here, in the same commit as the code.
3. Note it in [`DECISIONS.md`](DECISIONS.md) with the reasoning.

A constraint silently worked around is worse than no constraint, because the next person still
believes it holds.
