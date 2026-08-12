# Manual Test Plan — Debugger ↔ Tester Loop

This walks through testing the retry loop between the Debugger and
Tester nodes — not either node's own internal behavior (see
[`test/debugger/`](../debugger/debugger-manual-test.md) and
[`test/tester/`](../tester/tester-manual-test.md) for those), but the
**wiring change** this phase adds: when the Tester fails, the graph now
routes back to the Debugger for another attempt instead of ending.

Spec reference: [`18-debugger-tester-loop-spec.md`](../../docs/18-debugger-tester-loop-spec.md).

---

## 0. Prerequisites

- Dependencies installed: `npm install`.
- No API key or `.env` needed for Section 1 — it drives `testerNode`
  directly and inspects the compiled graph's structure, neither of
  which touches the model.
- Section 2 (the live scenario) needs `GROQ_API_KEY` in `.env`, same as
  every other full-graph check in this project.

---

## 1. Running the Automated Suite

```bash
npx tsx test/debugger-tester-loop/run-debugger-tester-loop-test.mts
```

This runs 10 checks end-to-end, no LLM involved:

| # | Check | What it proves |
|---|---|---|
| 1–2 | The compiled graph has a conditional edge `tester → debugger` (retry) and `tester → END` (passed, or out of attempts) | The new wiring actually exists on the real graph object, not just in the source |
| 3–4 | `debugger → tester` and `debugger → debugTools` still exist, unchanged | This phase didn't accidentally touch the Debugger's own existing loop |
| 5 | Driving `testerNode` against a fixture whose `"test"` script always fails takes exactly `1 + MAX_DEBUG_ATTEMPTS` (4) passes before it would stop retrying | The retry cap is exactly right, not off-by-one in either direction |
| 6 | `debugIterations` is `0` on every one of those failing passes | Every retry gets a full fresh Debugger tool-calling budget, not a shrinking one |
| 7 | The final `debugAttempts` exceeds `MAX_DEBUG_ATTEMPTS` | This is the exact condition the graph's `shouldRetryAfterTests` routing function checks to give up |
| 8–10 | A pass that finally succeeds reports `testsPassed: true` and leaves `debugAttempts`/`debugIterations` untouched, regardless of how many prior failures there were | Recovery isn't just "count down to zero" — a real pass ends the loop immediately, cleanly |

Expected final line: `10 passed, 0 failed`.

**How the fixture works:** same `withProject` pattern as
[`test/tester/`](../tester/tester-manual-test.md) — a throwaway
`package.json` with `"test": "exit 1"` (or `"exit 0"` for the recovery
checks), `chdir`'d into for the duration of each check. This is
deliberately **not** relying on this actual repository's own `npm test`
always failing (see `tester-manual-test.md` §2) — the fixture makes the
failure controlled and intentional, so this test stays correct even if
someone later fixes this project's own `package.json`.

---

## 2. Live Scenario (through the graph, needs `GROQ_API_KEY`)

This project's own `npm test` conveniently **always fails** — its
`package.json` still has the unmodified `npm init` placeholder — which
makes it a genuinely useful, reproducible way to force the real loop to
fire, no seeded bug required:

```bash
npm start
# When prompted, enter any harmless request, e.g.:
#   "Add a one-line comment above the formatBytes function in
#    src/tools/formatBytes.ts explaining what unit system it uses."
```

**Watch the terminal for a repeating pattern** like this, up to 4 times:

```text
[Debugger] Tool calls: [...]           (or a graceful failure message)
...
[Tool] run_tests
[Tool] run_typecheck
[Tool] run_lint

[Tester]
Tests: FAIL
...
```

each `[Tester]` block after the first means the graph looped back to
the Debugger. After at most 4 such cycles (1 initial + 3 retries), the
run ends normally — no hang, no crash — with the final `TEST RESULTS`
section reflecting only the last attempt (see §6 of the spec for why
only the last one is saved to `reports/05-testing/`).

**Observed during validation (worth knowing, not a defect):** a live
run with Groq's daily rate limit fully exhausted the entire time still
completed all 4 cycles and reached `END` cleanly, because a `429` isn't
a "malformed tool call" (`describeToolCallError` in
`src/lib/invokeWithRetry.ts` only recognizes HTTP 400s), so it fails
**immediately**, with no backoff wait, rather than hanging around
waiting for the rate limit to clear. If you see this exact pattern —
every `[Debugger]` line reads `Failed after retries: 429 ...` — that's
this behavior, not a hang; the loop is still doing real work (real
`npm test`/`tsc`/lint invocations each pass) even though the Debugger
itself can't fix anything without a working model call. `CHANGED FILES`
will correctly read `(none)` in this case, since the Implementation
Agent never got to run either.

**Pass criteria:** the process exits cleanly (exit code 0) regardless of
whether the underlying bug ever actually gets fixed; the number of
`[Tester]` blocks is at most 4; `reports/05-testing/<NN>-<slug>.md` is
saved with the same number as the other four stages.

**If tests genuinely pass on the first try** (e.g. you've since fixed
`package.json`'s `"test"` script, or `TypeScript`/`Lint` are the only
categories and both happen to be clean already), you'll see exactly one
`[Tester]` block and no retry — also correct, just a less interesting
run to watch.

---

## 3. Known, Expected Behaviors (not bugs)

From [`18-debugger-tester-loop-spec.md`](../../docs/18-debugger-tester-loop-spec.md)
§6 — worth knowing before mistaking any of these for a regression:

- **Only the final attempt's `DEBUGGING`/`TEST RESULTS` reports are
  saved.** `debugReport`/`testReport` are last-write-wins state fields;
  earlier attempts are visible in the console log during the run, not
  in `reports/`.
- **The "tests passed" branch reaches `END`, not a Reviewer.** Phase 8
  doesn't exist yet — same provisional-terminal-branch pattern used at
  every prior phase boundary in this project.
- **No wall-clock timeout.** Only iteration/attempt caps bound this
  loop; nothing tracks elapsed time at the graph level.
- **`MAX_DEBUG_ATTEMPTS` is 3**, on top of the Debugger's own existing
  `MAX_DEBUG_ITERATIONS` (10) per-attempt tool-calling cap — two
  distinct knobs, not one shared counter. Worst case is
  `(1 + MAX_DEBUG_ATTEMPTS) × MAX_DEBUG_ITERATIONS` = 40 Debugger
  tool-calling passes before giving up, which is exactly why
  `RECURSION_LIMIT` in `src/graph.ts` had to grow accordingly (see the
  comment there).

---

## 4. Quick Reference — All Commands

```bash
# Automated suite (safe, no LLM, no filesystem or git side effects)
npx tsx test/debugger-tester-loop/run-debugger-tester-loop-test.mts

# Live scenario (through the graph, needs GROQ_API_KEY in .env) —
# this project's own npm test always fails, so this reliably exercises
# the real retry loop with no setup required
npm start
# → any harmless request, e.g. "Add a one-line comment above the
#    formatBytes function in src/tools/formatBytes.ts explaining what
#    unit system it uses."

# Verify after every run
npx tsc --noEmit
git status --short
ls reports/05-testing/
```
