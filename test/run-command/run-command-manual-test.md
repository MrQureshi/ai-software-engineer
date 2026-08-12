# Manual Test Plan — `run_command` Tool

This walks through testing `run_command` (`src/tools/runCommand.ts`) by
hand, without needing to invoke the LLM.

There is no dedicated tool spec doc for `run_command` yet — see the
"Hard dependency" note in
[`16-debugger-node-spec.md`](../../docs/16-debugger-node-spec.md) §6, which
flagged this tool as needing one. This test plan is the closest thing to
a contract in the meantime: exit code + stdout/stderr, a timeout, and
output truncation.

---

## 0. Prerequisites

- Dependencies installed: `npm install`.
- No API key or `.env` needed — the harness calls the tool directly, it
  does not go through the graph or the model.
- Nothing here writes files or touches git state — `run_command` only
  executes shell commands, it doesn't modify the repository by itself.

---

## 1. Running the Automated Suite

```bash
npx tsx test/run-command/run-command-test.mts
```

This runs 8 checks end-to-end and prints `PASS`/`FAIL` per check, plus a
summary line, exiting non-zero if anything failed:

| # | Check | What it proves |
|---|---|---|
| 1–2 | A successful command reports `Exit code: 0` and its stdout is captured | The success path works |
| 3 | A failing command reports its actual non-zero exit code (not just "failed") | The model can tell *how* it failed, not just that it did |
| 4 | stderr is captured on failure | Error messages (e.g. a compiler error) reach the model |
| 5 | A nonexistent command fails gracefully — a descriptive string, not a thrown exception | The tool node never crashes the graph on a bad command |
| 6 | Commands run in the repository root (`process.cwd()`) | The Debugger can't be tricked into running commands outside the repo via `cwd` |
| 7 | Output past 8,000 characters is truncated, not returned unbounded | A runaway command (e.g. a verbose test run) can't blow up the context window |

Expected final line: `8 passed, 0 failed`.

---

## 2. Manual Spot-Check (optional)

To see the tool's output shape yourself, run this from the **project
root** (not from inside `test/run-command/`) — the import path below is
relative to the root:

```bash
npx tsx -e '
(async () => {
  const { runCommandTool } = await import("./src/tools/runCommand.ts");

  console.log(await runCommandTool.invoke({ command: "npx tsc --noEmit" }));
  console.log("---");
  console.log(await runCommandTool.invoke({ command: "npm run lint" }));
})();
'
```

(`tsx -e` cannot run a top-level `await` alongside a static `import` —
it fails with `Top-level await is currently not supported with the
"cjs" output format` regardless of shell. The async-IIFE-plus-dynamic-
`import()` form above sidesteps that; alternatively, save the block to
a `.mts` file and run it with `npx tsx <file>` — see
`test/run-command/run-command-test.mts` for the working import style.)

Expected: the `tsc` call returns `Exit code: 0` with no output (a clean
build), and the `lint` call returns a non-zero exit code with stderr
explaining there's no `lint` script — this is the exact "don't assume a
script exists" failure mode the Debugger's system prompt is instructed
to check `package.json` before hitting.

---

## 3. Known, Untested Edge Case — the timeout

`COMMAND_TIMEOUT_MS` (120s) is not covered by the automated suite —
waiting two minutes on every test run isn't worth it for one check. If
you want to verify it by hand, again from the **project root**:

```bash
npx tsx -e '
(async () => {
  const { runCommandTool } = await import("./src/tools/runCommand.ts");
  console.log(await runCommandTool.invoke({ command: "sleep 130" }));
})();
'
```

**Pass criteria:** after ~120s, a `Command timed out after 120s: sleep
130` message — not a hang, not a crash.

---

## 4. Quick Reference — All Commands

```bash
# Automated suite (safe, no filesystem or git side effects)
npx tsx test/run-command/run-command-test.mts
```
