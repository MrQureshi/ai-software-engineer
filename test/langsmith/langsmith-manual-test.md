# Manual Test Plan — LangSmith Tracing & Evaluation

This walks through testing tracing (`src/lib/langsmith.ts`) and
evaluation (`src/evaluate.ts`, `src/lib/evaluators.ts`) — see
[`20-langsmith-spec.md`](../../docs/20-langsmith-spec.md).

Unlike tracing, evaluation is real code with real logic — the pure
evaluator functions are fully testable with no LangSmith account and no
LLM call (Section 1). Actually running tracing end-to-end or evaluation
end-to-end needs a live LangSmith account and, for evaluation, real
Groq calls (Section 2/3).

---

## 0. Prerequisites

- Dependencies installed: `npm install` (this pulls in `langsmith` as a
  new devDependency).
- No API key of any kind needed for Section 1.
- For Section 2: nothing beyond what `npm start` already needs — this
  just verifies tracing's on/off *messaging*, not an actual trace
  landing in LangSmith.
- For Section 3: a LangSmith account and `LANGSMITH_API_KEY` in `.env`,
  plus `GROQ_API_KEY` (the eval script runs the real graph).

---

## 1. Running the Automated Suite

```bash
npx tsx test/langsmith/run-langsmith-test.mts
```

18 checks, no network, no LLM:

| # | Check | What it proves |
|---|---|---|
| 1–3 | `hasPlanEvaluator` scores 1/0 correctly for a non-empty/empty/missing `plan` | The simplest evaluator's logic is right |
| 4–6 | `changedFilesEvaluator` scores correctly and its comment names the actual files | |
| 7–9 | `testerRanEvaluator` scores correctly for a present/empty/missing `testReport` | |
| 10–13 | `isTracingEnabled()` reads all four supported env var names correctly, and treats `"false"` as off (not just "unset") | Matches `@langchain/core`'s own `isTracingEnabled` check exactly — see spec §3 |
| 14–15 | `getTracingProject()` defaults to `"default"` and reads `LANGSMITH_PROJECT` when set | |
| 16–18 | `.env.example` actually documents `LANGSMITH_TRACING`/`LANGSMITH_API_KEY`/`LANGSMITH_PROJECT` | Docs and code don't drift apart |

Expected final line: `18 passed, 0 failed`.

---

## 2. Tracing On/Off Messaging (no LangSmith account needed)

This only checks the startup message and the (harmless) SDK warning —
not that a trace actually reaches LangSmith, which needs a real account
(Section 3 covers a fuller check via evaluation instead, since
`evaluate()` inherently produces traces too).

```bash
# Tracing disabled (the default — no env vars set)
npm start
# Watch for, before the "What would you like to build?" prompt:
#   [LangSmith] Tracing disabled (set LANGSMITH_TRACING=true and LANGSMITH_API_KEY in .env to enable).
# Then Ctrl+C — no need to let a full request run for this check.
```

```bash
# Tracing "enabled" from the app's own point of view (fake project name,
# no real key needed just to see the message — but see the note below)
LANGSMITH_TRACING=true LANGSMITH_PROJECT=test-project npm start
# Watch for:
#   [LangSmith] Tracing enabled — project "test-project".
# Then Ctrl+C.
```

**A real SDK warning you'll also see in the second case:**

```text
[WARN]: You have enabled LangSmith tracing without backgrounding callbacks.
[WARN]: If you are not using a serverless environment where you must wait for tracing calls to finish,
[WARN]: we suggest setting "process.env.LANGCHAIN_CALLBACKS_BACKGROUND=true" to avoid additional latency.
```

**This is expected and not fixable from within this codebase** — see
spec §6 for the investigation. Setting the variable in code or in
`.env` does not suppress it (both were tried and confirmed not to
work); only exporting it in the actual shell before the process starts
does, which doesn't fit this project's `.env`-based configuration
convention. It's informational only.

**Pass criteria:** the correct `[LangSmith] Tracing ...` line appears in
each case, before the prompt.

---

## 3. Running Evaluation (needs LangSmith + Groq)

```bash
npm run evaluate
```

**First run:** creates the `"ai-software-engineer"` dataset in your
LangSmith account with the 2 built-in examples
(`src/evaluate.ts`'s `EXAMPLES`), then runs the real graph against both
and scores each with the 3 evaluators.

**Watch the terminal for:**
```text
[Evaluate] Creating dataset "ai-software-engineer" with 2 example(s)...
...
[Evaluate] Done — see the LangSmith UI for results.
```

**Verify in the LangSmith UI:** a new experiment under the
`"ai-software-engineer"` dataset, with 2 runs, each scored on
`has_plan`, `changed_files`, and `tester_ran`.

**Re-running:** `npm run evaluate` again does **not** recreate the
dataset (`client.hasDataset()` short-circuits it — see spec §4) but
does run a brand-new experiment against the existing one.

**Pass criteria:** the script exits 0; both examples produced a
non-empty plan (this should score 1 essentially always, since even a
failed run still produces a plan in the first stage); `changed_files`
and `tester_ran` scores depend on whether the Implementation Agent and
Tester actually got to run without hitting a rate limit — a `0` here
from a genuine Groq failure is a correct, honest score, not a bug in
the evaluator (see spec §6, "Evaluation makes real LLM calls").

**If `LANGSMITH_API_KEY` is missing:**

```bash
npm run evaluate
```

should print a clear message and exit 1 — not a stack trace:

```text
LANGSMITH_API_KEY (or LANGCHAIN_API_KEY) is not set. Evaluation requires a LangSmith account — see docs/20-langsmith-spec.md. Set it in .env and try again.
```

---

## 4. Known, Expected Behaviors (not bugs)

From [`20-langsmith-spec.md`](../../docs/20-langsmith-spec.md) §6:

- **The backgrounding-callbacks SDK warning** (Section 2 above) is
  expected and not something this codebase can suppress.
- **Structural, not semantic, grading.** A wrong-but-structurally-complete
  change (a real plan, a real file change, a real test run) scores well
  on all three evaluators regardless of whether the change was actually
  correct.
- **`npm start` needs no LangSmith account at all** — only
  `npm run evaluate` hard-requires `LANGSMITH_API_KEY`.

---

## 5. Quick Reference — All Commands

```bash
# Automated suite (safe, no network, no LLM)
npx tsx test/langsmith/run-langsmith-test.mts

# Tracing messaging check (no LangSmith account needed — Ctrl+C after the message)
npm start
LANGSMITH_TRACING=true LANGSMITH_PROJECT=test-project npm start

# Full evaluation run (needs LANGSMITH_API_KEY and GROQ_API_KEY in .env)
npm run evaluate
```
