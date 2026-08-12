# Manual Test Plan — Debugger Node

This walks through testing the Debugger node end-to-end — the full
graph, not just `run_command` in isolation. For a tool-level test of
`run_command` on its own (no LLM, no graph), see
[`run-command-manual-test.md`](../run-command/run-command-manual-test.md)
first; this doc assumes that one already passes. For the stage before
this one, see
[`implementation-agent-manual-test.md`](../implementation-agent/implementation-agent-manual-test.md).

Spec reference:
[`16-debugger-node-spec.md`](../../docs/16-debugger-node-spec.md).
For what happens when the Tester sends a run back here for a retry —
including the Debugger's prompt now folding in the Tester's own failure
report as grounding — see
[`test/debugger-tester-loop/`](../debugger-tester-loop/debugger-tester-loop-manual-test.md)
and [`18-debugger-tester-loop-spec.md`](../../docs/18-debugger-tester-loop-spec.md);
this doc only covers a single Debugger pass in isolation.

---

## 0. Prerequisites

- Dependencies installed: `npm install`.
- `GROQ_API_KEY` set in `.env` — every step below goes through the real
  graph and the real model.
- Run `git status` before you start, and prefer a clean working tree —
  this node edits real files with no confirmation step (same as the
  Implementation Agent), so you want to be able to tell your own changes
  apart from the agent's afterward.

---

## 1. What "passing" looks like

Since this goes through a live model, exact output will vary between
runs. What should hold true every time:

- The process does not crash.
- A `DEBUGGING` section appears in the terminal output, after
  `IMPLEMENTATION` and before `CHANGED FILES`.
- `reports/04-debugging/` gets a new file with the **same** number and
  topic slug as the corresponding plan/analysis/implementation reports
  for that run.
- `changedFiles` (the `CHANGED FILES` section) only ever grows relative
  to what the Implementation Agent alone produced — the Debugger unions
  onto it, it never drops an entry (see spec §5).

---

## 2. Step-by-Step Scenarios

### Step 1 — Nothing to fix (the common case)

The Debugger runs after *every* Implementation Agent pass right now
(there's no Tester yet to gate it — see spec §6), so the most common
case by far is: the change was fine, and the Debugger should say so
without inventing a fix.

```bash
npm start
# When prompted:
#   Add a one-line comment above the formatBytes function in
#   src/tools/formatBytes.ts explaining what unit system it uses.
```

(Create `src/tools/formatBytes.ts` first via the Implementation Agent's
own test scenario in
[`implementation-agent-manual-test.md`](../implementation-agent/implementation-agent-manual-test.md#step-1--new-self-contained-file-lowest-risk)
if it doesn't already exist.)

**Watch the terminal for, in order:**
1. `[Implementation Agent] Tool calls: [{ name: 'edit_file', ... }]`.
2. `[Debugger] Tool calls: [{ name: 'run_command', ... }]` — should be a
   narrow check like `npx tsc --noEmit`, not the full test suite.
3. `[Debugger] Tool calls: []` — no further tool calls, meaning it
   concluded there was nothing to fix.
4. A `DEBUGGING` section whose text says the check passed / nothing was
   wrong, not a fabricated fix.

**Pass criteria:** `changedFiles` still lists only
`src/tools/formatBytes.ts` (the Debugger added nothing), and `npx tsc
--noEmit` run by hand afterward is clean.

---

### Step 2 — An actual error for the Debugger to find and fix

This is the scenario that exercises the real loop: read → search → edit
→ run_command → still failing? → repeat. Since asking the model to
*introduce* a bug on purpose isn't reliable, this seeds a real,
deterministic TypeScript error into the repo first — `npx tsc --noEmit`
type-checks the whole project (see `tsconfig.json`, no `include` filter
beyond excluding `test/search-code/fixtures/**`), so a broken file
anywhere under `src/` will surface regardless of what the Implementation
Agent touches.

```bash
# 1. Seed a deliberate, obvious type error in a scratch file:
cat > src/tools/__debuggerTestBroken.ts <<'EOF'
const shouldBeANumber: number = "this is a string, not a number";
export { shouldBeANumber };
EOF

# 2. Confirm the break is real before involving the agent at all:
npx tsc --noEmit
# Expect: an error pointing at src/tools/__debuggerTestBroken.ts

# 3. Now run the agent with an unrelated, harmless request:
npm start
# When prompted:
#   Add a one-line comment above the formatBytes function in
#   src/tools/formatBytes.ts explaining what unit system it uses.
```

**Watch the terminal for:**
1. `[Debugger] Tool calls: [{ name: 'run_command', ... }]` — the first
   check should fail (the seeded error is still there).
2. `[Debugger] Tool calls: [{ name: 'read_file', ... }]` or
   `search_code` — locating `__debuggerTestBroken.ts`. `run_command`'s
   own error output names the exact file and line, so this should be
   findable even though it isn't in `changedFiles`.
3. `[Debugger] Tool calls: [{ name: 'edit_file', ... }]` — a fix
   attempt.
4. Another `run_command` call re-verifying, then `[Debugger] Tool
   calls: []` once it passes (or the iteration cap message if it
   doesn't — see Step 3 below).

**Verify afterward:**

```bash
npx tsc --noEmit                          # should be clean now
cat src/tools/__debuggerTestBroken.ts     # see what the model actually did
```

**Pass criteria:** `tsc` is clean, `__debuggerTestBroken.ts` appears in
`CHANGED FILES` alongside `formatBytes.ts`, and the fix is a real,
type-correct edit (not just deleting the file's contents — check the
diff makes sense, e.g. quoting the string or changing the declared
type).

**Cleanup:** `rm src/tools/__debuggerTestBroken.ts` — this file only
ever exists to give the Debugger something real to fix; it isn't part of
the feature.

---

### Step 3 — Observe the iteration cap (opportunistic)

Not reliably on-demand, but if the model can't converge on a fix for the
seeded error in Step 2 (or oscillates between two broken states), you'll
see:

```text
[Debugger] Reached max iterations (10) without confirming the code is error-free; stopping.
```

**Pass criteria:** the process does **not** hang or crash — the graph
still reaches `END` cleanly with whatever `debugReport`/`changedFiles`
it had accumulated so far. This mirrors the Analysis Node's and
Implementation Agent's own iteration caps (see
[`04-graph-spec.md`](../../docs/04-graph-spec.md) §6).

**Observed during test-plan validation:** with an earlier, lower cap
(6), a real run seeded exactly the Step 2 error, found it, applied a
*correct* fix, and re-ran `run_command` to confirm — but the cap was
reached processing that confirmation's result, one iteration short of
reporting success. `npx tsc --noEmit` run by hand afterward showed the
fix had, in fact, worked. This is why the cap is 10, not something
lower: `cat package.json` (or equivalent inspection), the initial check,
locating the error, reading for context, the edit, and the re-check can
easily consume 5–6 iterations on a single-file fix even when everything
goes right the first time — there needs to be headroom left to report
it. If you see the cap message immediately after what looks like a
successful fix in the tool-call log above it, check `npx tsc --noEmit`
by hand before assuming the Debugger actually failed — the fix may have
worked despite the capped-out report.

---

### Step 4 — Skipped debugging when analysis was capped (opportunistic)

If the Code Analyst hits its own iteration cap first (see
`implementation-agent-manual-test.md` Step 4), the Implementation Agent
already skips real work — and the Debugger should skip too, rather than
trying to verify a change that was never made:

```text
Debugging skipped: code analysis hit its iteration cap and implementation was never carried out, so there is nothing to verify or fix.
```

**Pass criteria:** no `run_command` call at all in this case — the
Debugger returns immediately, same short-circuit shape as the
Implementation Agent's `analysisCapped` check (spec §6, `debugger.ts`).

---

## 3. Cleanup

Step 2 both edits `src/tools/formatBytes.ts` and adds (then hopefully
fixes) `src/tools/__debuggerTestBroken.ts`. After testing:

```bash
git status --short          # review everything the agent touched
git diff                    # review the actual changes
```

Then either keep the changes, or discard them:

```bash
git checkout -- src/tools/formatBytes.ts    # revert a specific file
rm -f src/tools/__debuggerTestBroken.ts     # remove the scratch file entirely
```

`reports/04-debugging/` files from your test runs are harmless to keep —
delete them only if you want to reset the numbering sequence back down.

---

## 4. Quick Reference — All Commands

```bash
# Tool-level test first (no LLM, no graph) — see run-command-manual-test.md
npx tsx test/run-command/run-command-test.mts

# Step 1 — nothing to fix
npm start
# → "Add a one-line comment above the formatBytes function in
#    src/tools/formatBytes.ts explaining what unit system it uses."

# Step 2 — a real error to find and fix
cat > src/tools/__debuggerTestBroken.ts <<'EOF'
const shouldBeANumber: number = "this is a string, not a number";
export { shouldBeANumber };
EOF
npx tsc --noEmit    # confirm it's actually broken first
npm start
# → same request as Step 1

# Verify after every run
npx tsc --noEmit
git status --short
git diff

# Cleanup
rm -f src/tools/__debuggerTestBroken.ts
```
