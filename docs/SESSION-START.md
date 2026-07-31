← [Docs index](README.md)

# Starting a new session

Copy-paste prompts for bringing a fresh assistant up to speed. Pick the one that matches what
the session can actually see.

---

## A · The session has repo access

Claude Code loads [`../CLAUDE.md`](../CLAUDE.md) automatically, so it starts oriented. Give it
this and it will read what it needs:

```
This is the Fidato Hospitality Platform at D:\fidato crs.

Read these before doing anything:
  1. CLAUDE.md            — orientation and the trap list
  2. docs/CONTEXT.md      — current state, what is verified and what is not
  3. docs/phase-2/README.md — if the task is Phase 2

Then read the specific source files your task touches. Do not assume the
architecture from the docs alone — the docs say what the code does, the
code says how.

My task: <describe it>
```

⚠️ **Insist it reads the actual source** for anything it will modify. The knowledge files carry
decisions and traps, not signatures. A session that writes code from the docs alone will invent
plausible-looking APIs that do not exist.

---

## B · The session has no repo access

Paste the whole of [`KNOWLEDGE.md`](KNOWLEDGE.md), then:

```
That is the full context for the Fidato Hospitality Platform.

You do not have access to the codebase, so:
  - You CAN discuss architecture, review decisions, plan work, and write
    specifications.
  - You CANNOT write code against this codebase — you have never seen a
    function signature. If you write code, mark it clearly as illustrative
    and expect it to need correction.

My task: <describe it>
```

---

## C · Handing over to a person

Give them [`Fidato-Platform-Phase-1-Manual.pdf`](Fidato-Platform-Phase-1-Manual.pdf). It opens
with a "Before you start" section written for a new joiner and a six-day reading plan that pairs
each day's reading with something to do in the running app.

---

## What no handover carries

Be aware of the gap rather than surprised by it.

| Carried | Not carried |
|---|---|
| Decisions and their rejected alternatives | The conversation that produced them |
| The trap list | The hours spent finding each trap |
| Conventions | The judgement about when to break one |
| What was never verified | Which parts felt shaky while building |
| Architecture | Familiarity with the code |

A fresh session is a **competent stranger with excellent notes**, not a continuation of the last
one. Ask it to state its understanding back before it starts anything expensive — a
misunderstanding is cheapest to fix in the first message.

---

## Keeping the files honest

⚠️ Three files carry overlapping content, so they can drift apart.

Update all three when any of these change:

- A phase completes or its state changes
- A new trap is found — anything that looked correct and was not
- An architectural rule changes
- A decision is settled or reopened
- Infrastructure changes — project, hosting, rules, services

```bash
# after editing, confirm every cross-link still resolves
cd "D:\fidato crs"
for f in README.md CLAUDE.md docs/*.md docs/phase-2/*.md; do
  d=$(dirname "$f")
  grep -oh '](\([^)]*\.md\|[^)]*\.pdf\)' "$f" | sed 's/](//' | grep -v '^http' |
    while read t; do [ -f "$d/$t" ] || echo "BROKEN: $f → $t"; done
done
```
