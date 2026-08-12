# Manual Test Plan — Tester Node

This walks through testing the Tester node and its three tools
(`run_tests`, `run_typecheck`, `run_lint`) by hand. Unlike every other
node's manual test plan in this folder, **none of this needs an LLM or
an API key** — the Tester node is fully deterministic (see
[`17-tester-node-spec.md`](../../docs/17-tester-node-spec.md) §1), the
same way [`inspectRepository`](../../docs/06-inspect-repository-node-spec.md)
is. Section 3's full-graph check is the only step that touches the
model, and only because everything *upstream* of the Tester in the graph
does.

Spec reference: [`17-tester-node-spec.md`](../../docs/17-tester-node-spec.md).

---

## 0. Prerequisites

- Dependencies installed: `npm install`.
- No API key or `.env` needed for Sections 1–2 — the harness calls the
  tools and the node directly, it does not go through the graph or the
  model.
- Nothing here touches git-tracked files — every fixture project used
  for testing is created in a temporary directory and deleted
  afterward, even on failure.

---

## 1. Running the Automated Suite

```bash
npx tsx test/tester/run-tester-test.mts
```

This runs 14 checks end-to-end and prints `PASS`/`FAIL` per check, plus
a summary line, exiting non-zero if anything failed. Each check builds a
throwaway fixture project (its own `package.json`, sometimes a
`tsconfig.json`), `chdir`s into it, invokes the tool or node under test,
then restores the original working directory and deletes the fixture —
see the `withProject` helper at the top of the file for why this is
necessary: every tool here always inspects `process.cwd()` (matching how
the real Tester node always inspects the actual project root, never a
caller-supplied path), so exercising different `package.json` states
means actually changing directory, not passing a parameter.

| # | Check | What it proves |
|---|---|---|
| 1 | `run_tests` reports `SKIPPED` when `package.json` has no `"test"` script | Never assumes a script exists |
| 2–3 | `run_tests` reports `PASS`/`FAIL` matching the script's real exit code | The core pass/fail signal is trustworthy |
| 4 | `run_lint` reports `SKIPPED` when `package.json` has no `"lint"` script | Same guarantee, second tool |
| 5–6 | `run_lint` reports `PASS`/`FAIL` matching the script's real exit code | |
| 7 | `run_typecheck` reports `SKIPPED` when there's no `"typecheck"` script **and** no `tsconfig.json` | Doesn't invent a check that isn't configured |
| 8 | `run_typecheck` prefers an explicit `"typecheck"` script over falling back to `tsc`, even when a `tsconfig.json` is also present | Script beats fallback, not the other way around |
| 9 | `run_typecheck` falls back to `npx tsc --noEmit` and reports `PASS` on valid code, when no script is defined | The fallback path actually works, not just the script path |
| 10 | `run_typecheck` falls back to `tsc` and reports `FAIL` on a real type error | Fallback path catches real errors too |
| 11–12 | `testerNode()` end-to-end: `testsPassed: true` and no `Errors:` section when nothing fails | The aggregate node, not just the tools in isolation |
| 13–14 | `testerNode()` end-to-end: `testsPassed: false` and an `Errors:` section naming the failing category when one fails | |

Expected final line: `14 passed, 0 failed`.

**Note on fixture placement:** fixtures are created *inside*
`test/tester/` (via `fs.mkdtemp`), not under the OS temp directory. This
is deliberate — checks 9–10 need a real `npx tsc --noEmit` run, and `npx`
only resolves this project's locally-installed `typescript` if the
fixture is nested somewhere under this project's own directory tree.
Their `tsconfig.json` also sets `"types": []`, for the same reason this
project's own `tsconfig.json` does: without it, TypeScript
auto-acquires `@types/*` packages from this project's own ancestor
`node_modules` (since the fixture lives under it), which can pull in an
unrelated compile error that has nothing to do with the fixture itself.

---

## 2. Manual Spot-Check Against This Repo (recommended)

Because the Tester node needs no LLM, the most useful check isn't a
synthetic fixture — it's running it directly against this actual
project, from the **project root**:

```bash
npx tsx -e '
(async () => {
  const { testerNode } = await import("./src/nodes/tester.ts");
  console.log(JSON.stringify(await testerNode(), null, 2));
})();
'
```

(`tsx -e` cannot run a top-level `await` alongside a static `import` —
it fails with `Top-level await is currently not supported with the
"cjs" output format` regardless of shell. The async-IIFE-plus-dynamic-
`import()` form above sidesteps that; alternatively, save the block to
a `.mts` file and run it with `npx tsx <file>`.)

**Expected output right now, for this repository specifically:**

```text
Tests: FAIL
TypeScript: PASS
Lint: SKIPPED — no "lint" script in package.json.
```

This is **not a bug** — it's this project's actual current state, and a
direct demonstration of the "inspect `package.json`, don't assume a
command exists" behavior the spec requires:

- **`Tests: FAIL`** — this project's `package.json` has the `npm init`
  placeholder (`"test": "echo \"Error: no test specified\" && exit 1"`),
  which is a real script that always exits non-zero. `run_tests` has no
  way to distinguish that from a genuine failing suite, so it correctly
  reports `FAIL`. This project's actual tests are the manual/automated
  plans under `test/`, run directly via `npx tsx` — not wired to `npm
  test`.
- **`TypeScript: PASS`** — no `"typecheck"` script exists, so it fell
  back to `npx tsc --noEmit`, which is genuinely clean.
- **`Lint: SKIPPED`** — no `"lint"` script exists in `package.json` at
  all, so nothing was invented or assumed.

**Pass criteria:** you see this exact shape (statuses may drift if
`package.json` or the code changes later, but the reasoning — real
placeholder script, real tsc fallback, real absence of a lint script —
should still hold).

---

## 3. Full Agent Check (through the graph)

To confirm the Tester node actually runs at its place in the graph —
after the Debugger, right before `END` — and that its output reaches the
terminal and a saved report:

```bash
npm start
# When prompted, enter any request, e.g.:
#   "Add a one-line comment above the formatBytes function in
#    src/tools/formatBytes.ts explaining what unit system it uses."
```

**Watch the terminal for, in order:** the usual `IMPLEMENTATION PLAN` /
`CODE ANALYSIS` / `IMPLEMENTATION` / `DEBUGGING` / `CHANGED FILES`
sections, then:

```text
====================
TEST RESULTS
====================

Tests: FAIL
TypeScript: PASS
Lint: SKIPPED — no "lint" script in package.json.

Errors:

Tests:
FAIL: npm test (exit code 1)
...
```

(exact `Tests`/`TypeScript` statuses depend on the state of the repo at
run time — see Section 2 for why `FAIL`/`PASS`/`SKIPPED` here are all
individually correct, not a sign anything is broken)

**Verify afterward:**

```bash
ls reports/05-testing/     # a new report with the same NN-slug as the other four stages
cat reports/05-testing/<NN>-<slug>.md
```

**Pass criteria:** the `TEST RESULTS` section appears exactly once,
after `CHANGED FILES`; `reports/05-testing/` has a new file whose number
and slug match `reports/01-plan/`, `02-codeAnalysis/`,
`03-implementation/`, and `04-debugging/` from the same run.

**Robustness note, observed during validation:** because the Tester node
makes no model call, it still runs correctly and produces a valid
`TEST RESULTS` section even when every *earlier* stage in that same run
failed outright (e.g. a Groq rate limit causing the Code Analyst,
Implementation Agent, and Debugger to all fall back to their
"could not be completed" messages). The Tester's output doesn't depend
on anything those stages produced — it only ever inspects the real
`package.json`/`tsconfig.json` on disk — so a bad LLM day upstream
doesn't take it down too.

---

## 4. Known, Expected Behaviors (not bugs)

From [`17-tester-node-spec.md`](../../docs/17-tester-node-spec.md) §6 —
worth knowing before mistaking any of these for a regression:

- **A project with nothing configured trivially "passes."** If every
  category is `SKIPPED`, `testsPassed` is still `true` — `SKIPPED`
  never counts as a failure. The boolean alone can't tell "verified
  working" apart from "nothing was checked"; read `testReport` for that.
- **Not wired into a loop.** The Tester always runs exactly once, after
  the Debugger, and the graph always ends after it regardless of
  `testsPassed`. There's no retry-on-failure yet — that's Phase 7
  (`01-ai-software-engineer-plan.md` §20), separate future work.
- **`npm test` runs whatever script is there, placeholder or not.** See
  Section 2 above.

---

## 5. Quick Reference — All Commands

```bash
# Automated suite (safe, no filesystem or git side effects)
npx tsx test/tester/run-tester-test.mts

# Manual spot-check against this actual repo (no LLM)
npx tsx -e '
(async () => {
  const { testerNode } = await import("./src/nodes/tester.ts");
  console.log(JSON.stringify(await testerNode(), null, 2));
})();
'

# Full agent check (through the graph, needs GROQ_API_KEY in .env)
npm start
```
