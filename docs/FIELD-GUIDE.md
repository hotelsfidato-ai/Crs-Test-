# The AI collaboration field guide, mapped to this repo

15 habits from *Don't Just Trust the AI. Trace It.* — and where each one actually lives here.

**Several were already in place before the guide arrived**, under different names. Those are
marked *existing*; building a second copy would have created exactly the drift
[`README.md`](README.md) already warns about. Only the genuine gaps are new files.

---

## The core five

| # | Habit | Where it lives | |
|---|---|---|---|
| 1 | Handover file — continuity | [`HANDOVER.md`](HANDOVER.md) | **new** |
| 2 | Decisions — rationale | [`DECISIONS.md`](DECISIONS.md) · Phase 1's 24 in `manual/03-decision-log.md` | **new** |
| 3 | Explicit comments — readability | The source itself | *existing* |
| 4 | Flow — traceability | [`FLOW.md`](FLOW.md) | **new** |
| 5 | Bug / feature traces | [`traces/`](traces/README.md) · Phase 1's 10 in `manual/12-defect-log.md` | **new** |

## Guardrails

| # | Habit | Where it lives | |
|---|---|---|---|
| 6 | Architecture — the big picture | [`phase-2/02-architecture-and-spark.md`](phase-2/02-architecture-and-spark.md) · `manual/02-*` · the layer rule in [`../CLAUDE.md`](../CLAUDE.md) | *existing* |
| 7 | Constraints — boundaries | [`CONSTRAINTS.md`](CONSTRAINTS.md) | **new** |
| 8 | Test checklist — verification | [`TEST-CHECKLIST.md`](TEST-CHECKLIST.md) | **new** |
| 9 | Rollback — the safety net | [`ROLLBACK.md`](ROLLBACK.md) · operations in [`RUNBOOK.md`](RUNBOOK.md) | **new** |

## Review discipline — habits, not files

| # | Habit | How it applies here |
|---|---|---|
| 10 | Read the diff, every time | No file can enforce this. It is the one that catches what everything else misses |
| 11 | Ask "why" before "what" | Required for rules, permissions, money and the data layer — [`CONSTRAINTS.md`](CONSTRAINTS.md) |
| 12 | Small requests only | One logical change per commit. See the git log for the intended granularity |

## Meta

| # | Habit | How it applies here |
|---|---|---|
| 13 | Session handoff summary | Rewrite the five-line block in [`HANDOVER.md`](HANDOVER.md). Thirty seconds |
| 14 | Version-pin your context | Every [`DECISIONS.md`](DECISIONS.md) record carries a **Model** line |
| 15 | Own the mental model | Not a file. If you cannot explain the change in your own words, it is not ready to accept |

---

## Comment style — habit 3, and why it already existed

The house style is that a comment explains **what would go wrong without the code**, not what
the code says. Load-bearing warnings are marked `⚠️` so they survive a skim:

```ts
/* ⚠️ nullsFirst: false throughout. A quarter of the register has no
   check-in date; sorting by it with nulls first buries every real
   booking under 1,657 blank rows. */
```

That comment exists because someone would otherwise "tidy" the flag away. A comment restating
`.order(...)` would not have saved anyone.

Match the density of the surrounding file. New code in a heavily commented module that carries
no comments reads as unfinished.

---

## The reading order for a cold start

1. [`../CLAUDE.md`](../CLAUDE.md) — auto-loaded. Orientation and the traps.
2. [`HANDOVER.md`](HANDOVER.md) — **where things actually stand**, which is the thing most
   likely to have changed since anything else was written.
3. [`CONSTRAINTS.md`](CONSTRAINTS.md) — before proposing anything.
4. [`FLOW.md`](FLOW.md) — before changing anything that spans files.

Then [`TEST-CHECKLIST.md`](TEST-CHECKLIST.md) before claiming it is done.

---

## Keeping these honest

⚠️ **Documentation that describes a state which stopped being true is worse than none**, because
it is trusted. `CLAUDE.md` spent weeks saying Phase 2 was built-but-not-deployed after it had
been deployed — that is the failure mode these files are prone to, not incompleteness.

| File | Update when |
|---|---|
| [`HANDOVER.md`](HANDOVER.md) | **Every session.** Rewrite, do not append |
| [`DECISIONS.md`](DECISIONS.md) | A choice was made that would be expensive to re-derive |
| [`CONSTRAINTS.md`](CONSTRAINTS.md) | A boundary is added, or one turns out to be wrong — in the same commit as the code |
| [`FLOW.md`](FLOW.md) | A call path changes shape |
| [`TEST-CHECKLIST.md`](TEST-CHECKLIST.md) | Test counts move, or a new check earns its place |
| [`traces/`](traces/README.md) | A bug outlives its first obvious fix |
