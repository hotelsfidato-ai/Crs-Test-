# Documentation

---

## Start here

| If you are… | Read |
|---|---|
| An **agent** starting a session | [`../CLAUDE.md`](../CLAUDE.md) — loaded automatically |
| **Picking up the project** | [`CONTEXT.md`](CONTEXT.md) — state, history, what is verified and what is not |
| Working **without repo access** | [`KNOWLEDGE.md`](KNOWLEDGE.md) — one self-contained file to paste anywhere |
| A **new engineer or trainee** | [`Fidato-Platform-Phase-1-Manual.pdf`](Fidato-Platform-Phase-1-Manual.pdf) — 148 pages, with a six-day reading plan |
| **Building Phase 2** | [`phase-2/README.md`](phase-2/README.md) |

### The three knowledge files, and why there are three

They serve different situations and overlap on purpose.

| File | Length | For |
|---|---:|---|
| [`../CLAUDE.md`](../CLAUDE.md) | ~2 pp | Auto-loaded every session. Orientation and the trap list. Keep it short — it is read every time |
| [`CONTEXT.md`](CONTEXT.md) | ~6 pp | Full project state: what is done, what is planned, what was never verified, which decisions are settled |
| [`KNOWLEDGE.md`](KNOWLEDGE.md) | ~10 pp | Self-contained. Domain, architecture, rules, traps, Phase 2 scope — everything, assuming no file access |

**[`SESSION-START.md`](SESSION-START.md)** has copy-paste prompts for handing the project to a
fresh session or a new person.

### What these files do and do not carry

They answer every question about **judgement** — why occupancy works the way it does, the GST
banding, the Spark constraints, what broke before, what was never tested.

They answer **no** question about **code specifics** — component props, repository signatures,
which file holds which screen. That is deliberate: including them would make the files too long
to read every session, and they already exist in [`manual/`](manual/README.md).

| Session | Can it work from these alone? |
|---|---|
| With repo access | ✅ Yes — it reads the manual and source on demand |
| Without repo access | ⚠️ Can discuss, plan and review. **Cannot write correct code** |

⚠️ **When something material changes, update all three.** They are deliberately redundant, which
means they can also drift apart. A quarterly read-through is cheaper than acting on a stale one.

---

## Reference

| Document | Contents |
|---|---|
| [`design-system.md`](design-system.md) | Tokens, type scale, the two brand-guide departures |
| [`data-model.md`](data-model.md) | Firestore-shaped collections, the Phase 2 swap point |
| [`screen-inventory.md`](screen-inventory.md) | All 38 routes |
| [`role-matrix.md`](role-matrix.md) | 8 roles, permission matrix, business rules |
| [`RUNBOOK.md`](RUNBOOK.md) | Deploy, rebuild, recover |

---

## The service manual

**[`manual/`](manual/README.md)** — 15 volumes plus 2 appendices, written the way a service
manual for an engine is written. Also built as a single PDF.

| Volume | Contents |
|---|---|
| I–II | System overview · Architecture |
| **III** | **Decision log** — 24 records, each with the options that lost |
| IV–V | Design system · Component reference |
| VI–VIII | Data model · Seed engine · Repository layer |
| IX | Permissions and business rules |
| **X** | **Screen teardown** — all 38 routes |
| **XI** | **Diagnostics** — symptom → cause → fix |
| **XII** | **Defect log** — the 10 defects. The most instructive volume |
| XIII–XV | Verification record · Phase 2 handover · Glossary |
| A–B | Data dictionary · Component props |

Rebuild the PDF after editing:

```bash
cd tools/pdf && npm run build
```

---

## Phase 2

**[`phase-2/`](phase-2/README.md)** — 8 documents, ~43 pages, 26-day sprint.

Read [`02-architecture-and-spark.md`](phase-2/02-architecture-and-spark.md) before designing
anything. Three findings there contradict the Phase 1 handover, because Spark has no Cloud
Functions.
