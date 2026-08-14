# Traces — one file per bug or feature, start to finish

**Habit 5 of the field guide.** Anyone — human or AI — should be able to read one of these cold
and know exactly how to pick up where it left off.

One file per item. Name it `bug-<slug>.md` or `feature-<slug>.md`. Keep it while the work is
live; keep it afterwards too, because **what was tried and did not work is the expensive half**
and it is the half git does not record.

Phase 1's ten defects are written up in `../manual/12-defect-log.md` and are not repeated here.

---

## When to start one

- A bug that survives the first obvious fix.
- Anything touching rules, permissions, money or the data layer.
- A feature spanning more than one session.

Not for a typo, and not for a change you finished in ten minutes. A trace nobody needed is
clutter; the judgement is whether *the next person* would want it.

---

## The shape

```markdown
# <Bug|Feature>: <one line>

**Status** — open / fixed / abandoned
**Found** — YYYY-MM-DD, how it surfaced
**Files** — the ones actually touched

## Symptom
What was observed. The user's words, not a diagnosis.

## What it was NOT
Every hypothesis ruled out, and the evidence that ruled it out.
⚠️ The most valuable section. It is what stops the next person re-walking the same dead ends.

## Cause
The actual mechanism. Not "the filter was broken" — why it was broken.

## Fix
What changed, and what was rejected.

## Verification
The commands run and their output. Not "tested and working".

## Left behind
Anything knowingly not fixed, and why.
```

---

## Worked example

[`bug-register-filters.md`](bug-register-filters.md) — the one that turned out to be two
separate faults wearing the same symptom. Read it for the shape, particularly **What it was
NOT**: the wrong diagnosis was available and plausible, and only a direct probe against the live
API separated the two.
