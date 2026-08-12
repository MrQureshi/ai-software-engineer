# Manual Test Plan — Full Project, End to End (A to Z)

This is the master walkthrough: everything a brand-new user needs, in
order, to install this project, run it for the first time, understand
what each feature does, and manually verify every part of it works.

For deep-dive tests of individual pieces, this doc links out to:
- [`search-code-manual-test.md`](./search-code-manual-test.md) — `search_code` tool
- [`write-edit-manual-test.md`](./write-edit-manual-test.md) — `write_file`/`edit_file` tools
- [`implementation-agent-manual-test.md`](./implementation-agent-manual-test.md) — the Implementation Agent through the full graph

Architecture reference: [`docs/01-ai-software-engineer-plan.md`](../docs/01-ai-software-engineer-plan.md)
and [`docs/02-implemented-components-spec.md`](../docs/02-implemented-components-spec.md)
(index of every component's individual spec).

---

## Part 1 — Installation

### Step 1.1 — Prerequisites

- Node.js 20 or newer:
  ```bash
  node --version
  ```
- A Groq API key (free at [console.groq.com](https://console.groq.com)) —
  this project uses `openai/gpt-oss-120b` via Groq for every LLM call.

### Step 1.2 — Install dependencies

From the project root:

```bash
npm install
```

### Step 1.3 — Configure your API key

Copy the example env file and fill in your key:

```bash
cp .env.example .env
```

Edit `.env` so it contains:

```
GROQ_API_KEY=your_actual_key_here
```

**Verify:**

```bash
grep GROQ_API_KEY .env
```

Should print your key, not an empty value.

### Step 1.4 — Confirm the project builds

```bash
npx tsc --noEmit
```

**Pass criteria:** no output, exit code 0. This should be your baseline
check before and after every test run below.

---

## Part 2 — First Run (the whole pipeline, feature by feature)

Run:

```bash
npm start
```

You'll be prompted:

```
What would you like to build?
```

Type a request and press Enter, e.g.:

```
Add input validation to the calculator tool
```

The request now flows through **five** stages in order — watch the
terminal for each one:

### Feature 1 — Planner

Turns your request into a numbered task list, purely from the request
text (no repository access yet).

**Look for:** the `IMPLEMENTATION PLAN` section near the end of the
output, a numbered list.

### Feature 2 — Repository Inspector

A deterministic (non-LLM) step that lists the project's top-level files
and directories into shared state, giving the next stage a starting
point.

**Look for:** a `[Repository Inspector]` block early in the output,
listing entries like `file: package.json`, `directory: src`.

### Feature 3 — Code Analyst (grounded analysis)

Loops between the model and three tools — `list_files`, `search_code`,
`read_file` — to actually understand your repository before writing an
analysis. Capped at 8 passes; retries automatically if the model sends a
malformed tool call.

**Look for:** repeated `[Code Analyst] Tool calls: [...]` blocks, then a
`CODE ANALYSIS` section referencing real file paths from this project
(not generic advice).

Manual test for the tool this stage relies on most:
[`search-code-manual-test.md`](./search-code-manual-test.md).

### Feature 4 — Implementation Agent (real file changes)

Takes over once the Code Analyst finishes (or hits its cap), and loops
between the model and four tools — `read_file`, `search_code`,
`write_file`, `edit_file` — to actually modify files. Capped at 10
passes; same retry behavior as the Code Analyst. **Writes immediately,
with no confirmation step.**

**Look for:** `[Implementation Agent] Tool calls: [...]` blocks
(`write_file`/`edit_file` calls), then `IMPLEMENTATION` (a plain-text
summary) and `CHANGED FILES` (the actual paths it touched) sections.

Manual tests for this stage:
[`write-edit-manual-test.md`](./write-edit-manual-test.md) (tools in
isolation) and
[`implementation-agent-manual-test.md`](./implementation-agent-manual-test.md)
(through the real graph).

### Feature 5 — Reports

Every run saves three markdown files with a shared, auto-incrementing
number and a slug derived from your request:

```
reports/01-plan/<NN>-<slug>.md
reports/02-codeAnalysis/<NN>-<slug>.md
reports/03-implementation/<NN>-<slug>.md
```

**Verify:**

```bash
ls -la reports/01-plan/ reports/02-codeAnalysis/ reports/03-implementation/
```

All three folders should have a file with the **same** `<NN>-<slug>`
name from your run.

---

## Part 3 — Verify Nothing Broke

After every run, since Feature 4 writes real files with no review step:

```bash
npx tsc --noEmit          # confirm the build is still clean
git status --short        # see every file the agent touched
git diff                  # review the actual changes
```

**Pass criteria:** `tsc` is clean, and every file in `git status` is one
you expected based on the `CHANGED FILES` section printed in the
terminal — nothing extra, nothing missing.

If you don't want to keep what the agent wrote:

```bash
git checkout -- <file>    # revert a tracked file
rm <file>                 # remove a new file it created
```

---

## Part 4 — Feature-by-Feature Manual Tests (no LLM needed)

These test individual tools directly, without going through the model or
the graph — fast, free, deterministic. Run all of them:

```bash
# search_code — 6 fixture-based checks (see search-code-manual-test.md for details)
npx tsx test/run-search-code.mts "createStore" test/fixtures/sample-project

# write_file / edit_file — 11 automated checks in a temp directory
npx tsx test/run-write-edit-test.mts
```

**Pass criteria:** the `write_file`/`edit_file` suite ends with
`11 passed, 0 failed`. For `search_code`, walk through all 6 steps in
[`search-code-manual-test.md`](./search-code-manual-test.md) — each has
its own expected output documented there.

---

## Part 5 — Full Command Reference

Everything in this doc, in one place:

```bash
# --- Part 1: Install ---
node --version
npm install
cp .env.example .env
# (edit .env to set GROQ_API_KEY)
npx tsc --noEmit

# --- Part 2: First run ---
npm start
# → type any request, e.g. "Add input validation to the calculator tool"

# --- Part 3: Verify ---
npx tsc --noEmit
git status --short
git diff

# --- Part 4: Tool-level tests (no LLM) ---
npx tsx test/run-search-code.mts "createStore" test/fixtures/sample-project
npx tsx test/run-write-edit-test.mts
```

---

## Part 6 — Where to Go Next

- Full architecture and roadmap: [`docs/01-ai-software-engineer-plan.md`](../docs/01-ai-software-engineer-plan.md)
- Every component's individual spec (state, graph, each node, each tool): [`docs/02-implemented-components-spec.md`](../docs/02-implemented-components-spec.md)
- What's built vs. still planned: check the `Status:` line at the top of
  each numbered doc in `docs/`.
