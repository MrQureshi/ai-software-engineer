# Manual Test Plan — Reviewer Node

This walks through testing the Reviewer node end-to-end — the full
graph, not just `git_diff` in isolation. For the stage before this one,
see [`test/debugger-tester-loop/`](../debugger-tester-loop/debugger-tester-loop-manual-test.md).

Spec reference: [`19-reviewer-node-spec.md`](../../docs/19-reviewer-node-spec.md).

---

## 0. Prerequisites

- Dependencies installed: `npm install`.
- No API key needed for Section 1 (the automated suite) — it drives
  `git_diff` and the pure `parseVerdict` parser directly, and inspects
  the compiled graph's structure, none of which touch the model.
- `GROQ_API_KEY` set in `.env` for Section 2 — the Reviewer itself is a
  model-loop node (unlike the Tester), so a live check genuinely needs
  the LLM.
- Run `git status` before you start — Section 1's `git_diff` checks run
  in throwaway fixture repos, but Section 2 goes through the real graph
  and will read (not modify) this actual repository's real diff.

---

## 1. Running the Automated Suite

```bash
npx tsx test/reviewer/run-reviewer-test.mts
```

This runs 13 checks end-to-end, no LLM involved:

| # | Check | What it proves |
|---|---|---|
| 1–4 | The compiled graph has `tester → reviewer`, `reviewer → reviewTools`, `reviewer → END`, and `reviewTools → reviewer` edges | The new wiring actually exists on the real graph object |
| 5–8 | `parseVerdict` correctly reads `CHANGES_REQUIRED`/`APPROVE`/neither (fail-closed)/both-present (`CHANGES_REQUIRED` wins) | The verdict parser — the one piece of this node's logic that isn't just prompting — is correct on its own |
| 9 | `git_diff` fails gracefully (a message, not a thrown exception) outside any git repository | The tool node never crashes the graph on an unexpected environment |
| 10 | `git_diff` reports no changes immediately after a fresh commit | Baseline: a clean tree really does read as clean |
| 11 | `git_diff` shows a real uncommitted change, with the actual diff lines | The core "show me what changed" path works |
| 12 | Scoping `git_diff` to the changed file shows the same diff | The `path` parameter actually narrows the diff, not just cosmetically |
| 13 | Scoping `git_diff` to an untouched/untracked path reports no changes for it specifically | Doesn't leak the whole repo's diff when asked about one file |

Expected final line: `13 passed, 0 failed`.

**A real bug this suite caught during development, not just a
hypothetical:** wiring the Reviewer in required changing the Tester's
own conditional edge (`shouldRetryAfterTests` in `src/graph.ts`), and
the first pass at that edit replaced the existing `[END]: END` fallback
with the new `reviewer` mapping instead of adding both. That silently
dropped the "give up after `MAX_DEBUG_ATTEMPTS` retries" path from the
compiled graph entirely — check 3 in the loop suite
(`test/debugger-tester-loop/run-debugger-tester-loop-test.mts`) failed
immediately, before this was ever run live. Worth knowing as a concrete
example of why the graph-structure checks in these suites matter: a
routing map with a silently missing branch doesn't show up as a
TypeScript error, only as a graph that would throw *at the exact moment*
that branch is needed.

**Why `git_diff`'s fixtures work differently from `run_typecheck`'s:**
unlike the `tsc` fixtures in `test/tester/`, these are **not** nested
under this project's own directory tree for most checks (they use the
same `test/reviewer/` nesting convention for consistency, since `git
init` makes each fixture fully self-contained) — except the "outside
any git repository" check, which deliberately uses `os.tmpdir()`
instead. Nesting that one under `test/reviewer/` would have made it
falsely pass, because `git diff` walks up to the *nearest* ancestor
`.git` directory when the fixture has none of its own — and this
project's own `.git` is right there, three directories up. That's not
hypothetical either: it's exactly what happened the first time this
check was written, before it was moved to `os.tmpdir()`.

---

## 2. Full Agent Check (through the graph)

To confirm the Reviewer actually runs at its place in the graph — after
the Tester reports a pass — and produces a verdict:

```bash
npm start
# When prompted, enter any request that's likely to actually succeed,
# e.g.:
#   "Add a one-line comment above the formatBytes function in
#    src/tools/formatBytes.ts explaining what unit system it uses."
```

Since `Tests: FAIL` is this project's *normal* state right now (its
`package.json`'s `"test"` script is still the `npm init` placeholder —
see [`test/tester/tester-manual-test.md`](../tester/tester-manual-test.md)
§2), a request through this real repo will very likely exhaust the
Debugger ↔ Tester retry loop and reach `END` **without** ever reaching
the Reviewer — that's correct, not a bug (the Reviewer, per spec §2,
only ever runs once `testsPassed` is `true`). To reliably see the
Reviewer actually execute, either:

- **(a)** temporarily give `package.json` a real, passing `"test"`
  script (e.g. `"test": "exit 0"`) before running `npm start`, then
  revert it afterward, or
- **(b)** watch for it opportunistically — if `TypeScript: PASS` and
  `Lint: SKIPPED` (both already true for this repo) happen to be the
  only categories that matter for your specific request, and the
  request doesn't touch anything `npm test` would exercise, the loop
  can still reach the Reviewer if `Tests` doesn't factor into
  `testsPassed`'s failure — but since `Tests: FAIL` alone is already
  enough to keep `testsPassed` false, in practice **(a)** is the
  reliable option.

**Watch the terminal for, in order:** the usual `IMPLEMENTATION PLAN` /
`CODE ANALYSIS` / `IMPLEMENTATION` / `DEBUGGING` / `CHANGED FILES` /
`TEST RESULTS` sections, then:

```text
[Reviewer] Tool calls: [{ name: 'git_diff', ... }]
...
====================
REVIEW
====================

REVIEW

Architecture: PASS
Type safety: PASS
Tests: PASS
Code quality: PASS

Issues:
None

Recommendation:
APPROVE
```

**Verify afterward:**

```bash
ls reports/06-review/     # a new report with the same NN-slug as the other five stages
cat reports/06-review/<NN>-<slug>.md
```

**Pass criteria:** `[Reviewer] Tool calls:` shows at least one
`git_diff` call before the final verdict; the `REVIEW` section appears
exactly once, after `TEST RESULTS`; `reports/06-review/` has a new file
whose number and slug match the other five stages from the same run.

**If you see `Status: CHANGES_REQUIRED` instead of `APPROVE`:** also a
pass, not a failure of this test — it means the Reviewer found (or
believed it found) a real issue. Read the `Issues:` list; if it's
pointing at something genuinely wrong with the change, the Reviewer did
its job. Remember: `CHANGES_REQUIRED` currently still routes to `END`,
not back to the Implementation Agent (spec §6) — there's no loop yet to
watch for here.

---

## 3. Known, Expected Behaviors (not bugs)

From [`19-reviewer-node-spec.md`](../../docs/19-reviewer-node-spec.md) §6:

- **Not wired into a loop.** Both `APPROVE` and `CHANGES_REQUIRED`
  reach `END`. A rejected review does not currently send anything back
  to the Implementation Agent or Debugger — that's explicitly deferred,
  the same way Phase 7 was split out from Phase 6.
- **Verdict parsing is a plain substring check**, not structured output.
  `CHANGES_REQUIRED` is checked first specifically because it's far
  less likely to appear by accident than the bare word "approve."
- **`git_diff` shows the working tree, not a commit range.** If you had
  uncommitted changes of your own before running the agent, they're
  indistinguishable from the agent's own changes in this diff.
- **No re-running of tests.** The Reviewer reads `state.testReport`
  from the Tester; it does not have `run_tests`/`run_typecheck`/
  `run_lint` itself.

---

## 4. Quick Reference — All Commands

```bash
# Automated suite (safe, no LLM, no filesystem or git side effects
# on this actual repo — all fixtures are throwaway)
npx tsx test/reviewer/run-reviewer-test.mts

# Full agent check (through the graph, needs GROQ_API_KEY in .env) —
# give package.json a passing "test" script first if you want to
# reliably see the Reviewer actually run (see Section 2)
npm start

# Verify after every run
npx tsc --noEmit
git status --short
ls reports/06-review/
```
