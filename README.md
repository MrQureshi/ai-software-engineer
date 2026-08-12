# AI Software Engineer

An autonomous, multi-stage coding agent built from scratch with
[LangChain](https://js.langchain.com/), [LangGraph](https://langchain-ai.github.io/langgraphjs/),
and [LangSmith](https://smith.langchain.com/) — no third-party agent
framework hiding the orchestration. Give it a plain-English feature
request; it plans, grounds itself in your actual repository, makes the
change, verifies it, and reviews it — end to end, in one run.

```text
"Add dark mode to my React Native application."
```

## Status

**All 10 planned phases are complete** — Planner through Reviewer, the
Debugger ↔ Tester retry loop, and LangSmith tracing/evaluation are all
built and wired exactly as the project's own Final Goal describes.
90 automated checks pass across every feature's test suite, and every
stage has been exercised live through the real graph.

Deliberately **not** built — documented as a choice, not a gap someone
forgot about:

- The Reviewer's own `CHANGES_REQUIRED` verdict doesn't loop back to
  the Implementation Agent/Debugger yet — only the Tester's failures
  trigger a retry.
- No wall-clock timeout — per-node iteration caps and LangGraph's
  recursion limit bound every run, but nothing tracks elapsed time.
- No git-commit or PR automation (the plan explicitly deferred this).

See [`docs/21-project-completion-spec.md`](docs/21-project-completion-spec.md)
for the full completion audit, and
[`docs/01-ai-software-engineer-plan.md`](docs/01-ai-software-engineer-plan.md)
§27 for the phase-by-phase build history.

## How it works

The whole system is one LangGraph state graph
(`src/graph.ts`, state shape in `src/agents/softwareEngineer.ts`):

```text
Planner
  → Repository Inspector
    → Code Analyst ⇄ tools               (grounds itself in your actual code)
      → Implementation Agent ⇄ tools     (makes the change)
        → Debugger ⇄ tools               (verifies, fixes if something broke)
          ⇄ Tester                       (deterministic: runs your real npm scripts)
            → Reviewer ⇄ tools           (once tests pass — final quality gate)
              → done
```

| Stage | What it does |
|---|---|
| **Planner** | Turns the request into a numbered implementation plan. |
| **Repository Inspector** | Deterministic top-level `list_files` scan — no model call. |
| **Code Analyst** | Loops with `list_files`/`read_file`/`search_code` until it has a grounded, repo-specific analysis — not generic advice. |
| **Implementation Agent** | Loops with `read_file`/`search_code`/`write_file`/`edit_file` to actually make the change. |
| **Debugger** | Loops with `read_file`/`search_code`/`edit_file`/`run_command` to catch and fix anything the change broke. |
| **Tester** | Deterministic — runs whatever `test`/`typecheck`/`lint` scripts your `package.json` actually defines (inspects it first, never assumes). No model call. |
| **Debugger ↔ Tester loop** | If tests fail, the run goes back to the Debugger for another attempt — up to 3 retries — before giving up. |
| **Reviewer** | Once tests pass: loops with `git_diff`/`read_file`/`search_code`, reads the real diff (not just the other stages' self-reported summaries), and renders an `APPROVE`/`CHANGES_REQUIRED` verdict. |

Every stage that loops has its own bounded iteration cap and retries
gracefully on a malformed tool call instead of crashing — see
[`docs/04-graph-spec.md`](docs/04-graph-spec.md) for the full
error-handling story.

## Prerequisites

- Node.js 20+
- A [Groq](https://console.groq.com/) API key (the LLM provider used
  throughout)
- Optional: a [LangSmith](https://smith.langchain.com/) account, for
  tracing and evaluation

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
GROQ_API_KEY=your_actual_key_here

# Optional — see docs/20-langsmith-spec.md
# LANGSMITH_TRACING=true
# LANGSMITH_API_KEY=
# LANGSMITH_PROJECT=ai-software-engineer
```

## Usage

```bash
npm start
```

You'll be prompted:

```text
What would you like to build?
```

Type a request and press Enter. The full pipeline runs, printing each
stage's output as it goes, and finishes with a summary of every file it
changed and its final test/review verdict.

### Evaluation

```bash
npm run evaluate
```

Runs the real graph against a small built-in example set and grades
each run structurally (produced a plan? changed a file? did the Tester
run?) in your LangSmith account — creates the dataset itself on first
run. Requires `LANGSMITH_API_KEY`. See
[`docs/20-langsmith-spec.md`](docs/20-langsmith-spec.md).

## Output

Every run saves one markdown report per stage, numbered and slugged
from your request, so a single run's reports all share a name:

```text
reports/
  01-plan/            # Planner
  02-codeAnalysis/    # Code Analyst
  03-implementation/  # Implementation Agent (includes the changed-files list)
  04-debugging/       # Debugger (only the final attempt, if it retried)
  05-testing/         # Tester (only the final attempt, if it retried)
  06-review/          # Reviewer
```

**Writes happen immediately, with no confirmation step** — the
Implementation Agent and Debugger both modify files in your working
tree directly. Review `git status`/`git diff` after every run; nothing
in this graph runs `git commit` on your behalf.

## Project structure

```text
src/
  agents/
    softwareEngineer.ts     # shared LangGraph state definition
  nodes/                    # one file per graph stage (see table above)
  tools/                    # list_files, read_file, search_code, write_file,
                             # edit_file, run_command, run_tests, run_typecheck,
                             # run_lint, git_diff
  lib/                      # shared helpers: model construction, retry logic,
                             # shell-exec, evaluators, LangSmith config
  graph.ts                  # wires everything together, computes RECURSION_LIMIT
  index.ts                  # interactive CLI entry point
  evaluate.ts                # LangSmith evaluation entry point
```

## Testing

Every feature has its own folder under `test/`, each with an automated
suite (no LLM where the feature allows it) and a manual test plan:

```text
test/
  search-code/  write-edit/  implementation-agent/  run-command/
  debugger/     tester/      debugger-tester-loop/   reviewer/
  langsmith/    model/       support/ (shared test helpers)
```

```bash
npx tsc --noEmit                              # 0 errors
npx tsx test/<feature>/run-<feature>-test.mts # each feature's automated suite
```

## Documentation

Every component (state, graph, each node, each tool) has its own
generic spec doc under [`docs/`](docs/), indexed at
[`docs/02-implemented-components-spec.md`](docs/02-implemented-components-spec.md).
The full roadmap, architecture decisions, and current project status
live in
[`docs/01-ai-software-engineer-plan.md`](docs/01-ai-software-engineer-plan.md) —
including what's still deliberately deferred (the Reviewer's own
retry loop, a wall-clock timeout, git-commit automation) rather than
built, and why.

## Tech stack

- [LangGraph](https://langchain-ai.github.io/langgraphjs/) / [LangChain](https://js.langchain.com/) — agent orchestration, built directly (not wrapped by another agent framework)
- [LangSmith](https://smith.langchain.com/) — tracing, debugging, and evaluation
- [Groq](https://groq.com/) (`@langchain/groq`) — LLM inference
- [Zod](https://zod.dev/) — tool schema validation
- [tsx](https://github.com/privatenumber/tsx) — TypeScript execution
- [marked](https://marked.js.org/) / [marked-terminal](https://github.com/mikaelbr/marked-terminal) — markdown rendering in the terminal
