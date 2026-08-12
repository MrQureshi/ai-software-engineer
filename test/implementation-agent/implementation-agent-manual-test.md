# Manual Test Plan — Implementation Agent (Code Modification Feature)

This walks through testing the Implementation Agent end-to-end — the
full graph, not just the individual tools. For tool-level tests of
`write_file`/`edit_file` in isolation (no LLM, no graph), see
[`write-edit-manual-test.md`](../write-edit/write-edit-manual-test.md) first; this
doc assumes those already pass.

Spec references:
[`12-code-modification-spec.md`](../../docs/12-code-modification-spec.md),
[`15-implementation-agent-node-spec.md`](../../docs/15-implementation-agent-node-spec.md),
[`04-graph-spec.md`](../../docs/04-graph-spec.md).

---

## 0. Prerequisites

- Dependencies installed: `npm install`.
- `GROQ_API_KEY` set in `.env` — every step below goes through the real
  graph and the real model, unlike the tool-level tests.
- Run `git status` before you start, and prefer a clean working tree (or
  at least know what's already modified) — this feature writes real
  files with no confirmation step, so you want to be able to tell your
  own changes apart from the agent's afterward.

---

## 1. What "passing" looks like

Since this goes through a live model, exact output will vary between
runs. What should hold true every time:

- The process does not crash.
- `npx tsc --noEmit` stays clean after the run (new/changed files don't
  break the build).
- Every file listed under `CHANGED FILES` in the terminal output
  actually exists and actually changed (check with `git status`/`git
  diff`).
- `reports/01-plan/`, `reports/02-codeAnalysis/`, and
  `reports/03-implementation/` each get a new file with the **same**
  number and topic slug.

---

## 2. Step-by-Step Scenarios

### Step 1 — New, self-contained file (lowest risk)

The safest first test: a request that only requires creating a new file,
so there's nothing existing to accidentally break.

```bash
npm start
# When prompted:
#   Create a new utility file src/tools/formatBytes.ts that exports a
#   formatBytes function converting a byte count to a human-readable
#   string (e.g. 1536 -> "1.5 KB").
```

**Watch the terminal for, in order:**
1. `[Code Analyst] Tool calls: ...` — grounding itself in the repo.
2. `[Implementation Agent] Tool calls: [{ name: 'write_file', ... }]`.
3. An `IMPLEMENTATION` section with a plain-text summary.
4. A `CHANGED FILES` section listing exactly the one new file.
5. `Reports saved:` with matching `NN-` numbers across all three folders.

**Verify afterward:**

```bash
npx tsc --noEmit                        # new file must not break the build
cat src/tools/formatBytes.ts            # sanity-check the actual code
git status --short                      # confirm ONLY the expected file is new
```

**Pass criteria:** the file exists, is valid TypeScript, `tsc` is clean,
and `git status` shows no unexpected files touched.

---

### Step 2 — Targeted edit to an existing file

Tests `edit_file` (not just `write_file`) through the real graph. Pick
something small and easily reversible, e.g.:

```bash
npm start
# When prompted:
#   Add a one-line comment above the formatBytes function in
#   src/tools/formatBytes.ts explaining what unit system it uses.
```

**Verify afterward:**

```bash
git diff src/tools/formatBytes.ts       # should show a small, targeted diff
npx tsc --noEmit
```

**Pass criteria:** the diff is a small, targeted insertion — not a full
file rewrite — and `CHANGED FILES` correctly lists
`src/tools/formatBytes.ts`.

---

### Step 3 — Observe the retry-on-invalid-tool-call recovery (opportunistic)

This isn't reliably reproducible on demand — it depends on the model
occasionally supplying a malformed tool call — but if you run enough
requests you'll likely see it. When you do, it's a **pass**, not a bug:

```text
[Implementation Agent] Invalid tool call from model (attempt 1/2): ...
```

followed by a successful tool call on the next line. **Fail** would be
the process crashing instead — if that happens, it's a regression in
`src/lib/invokeWithRetry.ts`, not expected behavior. See
[`04-graph-spec.md`](../../docs/04-graph-spec.md) §6.

---

### Step 4 — Observe the iteration cap (opportunistic)

Also not reliably on-demand, but if you give a request vague enough that
either loop struggles to converge, you may see:

```text
[Code Analyst] Reached max iterations (8) without a final answer; stopping.
```

or the equivalent Implementation Agent line at its own cap (10). **Pass**
criteria: the process does **not** hang or crash — the capped node
returns a "stopped early" message and the graph moves on (Analysis Node
hitting its cap still hands off to the Implementation Agent; the
Implementation Agent hitting its cap still ends the graph cleanly). This
is a real, observed behavior — it happened during initial development
when the Code Analyst kept re-searching for a nonexistent barrel file
instead of concluding there wasn't one — so it's worth understanding
rather than treating as an anomaly if you see it.

---

## 3. Cleanup

Steps 1–2 write real files into this repository. After testing:

```bash
git status --short          # review everything the agent touched
git diff                    # review the actual changes
```

Then either keep the changes, or discard them:

```bash
git checkout -- src/tools/formatBytes.ts    # revert a specific file
rm src/tools/formatBytes.ts                 # or delete a new file entirely
```

The `reports/01-plan/`, `reports/02-codeAnalysis/`,
`reports/03-implementation/` files from your test runs are harmless to
keep (they're just saved output, not part of the source tree) — delete
them only if you want to reset the numbering sequence back down.

---

## 4. Quick Reference — All Commands

```bash
# Tool-level tests first (no LLM, no graph) — see write-edit-manual-test.md
npx tsx test/write-edit/run-write-edit-test.mts

# Full feature test (real model, real graph, real file writes)
npm start
# → "Create a new utility file src/tools/formatBytes.ts that exports a
#    formatBytes function converting a byte count to a human-readable
#    string (e.g. 1536 -> '1.5 KB')."

# Verify after every run
npx tsc --noEmit
git status --short
git diff
```
