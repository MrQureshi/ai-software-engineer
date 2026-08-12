# Manual Test Plan — Shared Model Factory

Tests `src/lib/model.ts` (`createModel()`), the single-source-of-truth
replacement for what used to be five separate `new ChatGroq(...)` calls
across `planner.ts`/`codeAnalyst.ts`/`implementation.ts`/`debugger.ts`/
`reviewer.ts`. See
[`21-project-completion-spec.md`](../../docs/21-project-completion-spec.md) §4.

---

## 0. Prerequisites

- Dependencies installed: `npm install`.
- `GROQ_API_KEY` set in `.env` — `ChatGroq`'s own constructor validates
  the key is *present* (not that it's valid/working) as soon as it's
  instantiated, so `createModel()` itself needs it even though this
  test makes no network call.

---

## 1. Running the Automated Suite

```bash
npx tsx test/model/run-model-test.mts
```

13 checks, no network call:

| # | Check | What it proves |
|---|---|---|
| 1–3 | `createModel()` returns a real `ChatGroq` instance with `model: "openai/gpt-oss-120b"` and `temperature: 0` | The factory produces exactly what all five nodes used to construct individually |
| 4–13 | Each of the 5 node files no longer contains its own `new ChatGroq(...)`, and does import `createModel` from `../lib/model.js` | Regression guard — the exact duplication this phase removed can't silently reappear in one file without the suite catching it |

Expected final line: `13 passed, 0 failed`.

---

## 2. Full Agent Check (through the graph)

No node's actual behavior changed — this is a pure refactor. Any of the
other manual test plans (e.g.
[`test/tester/`](../tester/tester-manual-test.md),
[`test/reviewer/`](../reviewer/reviewer-manual-test.md)) already
exercise every node that now uses `createModel()`; a normal
`npm start` run passing as it did before is the real confirmation
nothing broke.

**Pass criteria:** identical behavior to before this phase — same
console output shape, same reports saved. If anything about a node's
LLM behavior changed after this refactor, that would be a real
regression (the factory should be behaviorally invisible).

---

## 3. Quick Reference

```bash
npx tsx test/model/run-model-test.mts
```
