# Manual Test Plan — `write_file` / `edit_file` Tools

This walks through testing `write_file` and `edit_file`
(`src/tools/writeFile.ts`, `src/tools/editFile.ts`) by hand, without
needing to invoke the LLM.

Spec references:
[`13-write-file-tool-spec.md`](../docs/13-write-file-tool-spec.md),
[`14-edit-file-tool-spec.md`](../docs/14-edit-file-tool-spec.md).

---

## 0. Prerequisites

- Dependencies installed: `npm install`.
- No API key or `.env` needed for the automated checks below — the
  harness calls the tools directly, it does not go through the graph or
  the model.

---

## 1. Automated Check (Section 2) vs. Fixtures (search_code)

Unlike `search_code`'s manual test, this one does **not** use committed
fixture files under `test/fixtures/` — `write_file`/`edit_file` mutate
whatever they touch, so a fixed, version-controlled fixture would get
overwritten by the very test that's supposed to verify it. Instead,
`test/run-write-edit-test.mts` creates a **fresh temporary directory**
(via `fs.mkdtemp`, outside the project entirely) for every run, and
deletes it afterward — so the test is both deterministic and leaves
nothing behind to clean up manually.

---

## 2. Running the Automated Suite

```bash
npx tsx test/run-write-edit-test.mts
```

This runs 11 checks end-to-end and prints `PASS`/`FAIL` per check, plus a
summary line, exiting non-zero if anything failed:

| # | Check | What it proves |
|---|---|---|
| 1–2 | `write_file` creates a new file, including missing parent directories, with exact content | New-file + nested-directory creation works |
| 3–4 | `write_file` overwrites an existing file | Overwrite path works, not just create |
| 5–6 | `edit_file` succeeds on a unique match | The core edit path works |
| 7–8 | `edit_file` on a **zero-match** `oldString` reports the failure and leaves the file untouched | The "do not write anything" guarantee holds even on failure |
| 9–10 | `edit_file` on an **ambiguous** (3x) match refuses and leaves the file untouched | The uniqueness safety check actually blocks a write, doesn't guess |
| 11 | `edit_file` on a nonexistent file reports the failure clearly | File-not-found is handled as a normal result, not a crash |

Expected final line: `11 passed, 0 failed`.

---

## 3. Manual Spot-Check (optional)

If you want to see the tools' output shape yourself rather than just
trusting the automated checks, run this from the project root — it
writes into `/tmp`, not the project, so it's safe to run repeatedly:

```bash
npx tsx -e '
import { writeFileTool } from "./src/tools/writeFile.ts";
import { editFileTool } from "./src/tools/editFile.ts";

const p = "/tmp/manual-write-edit-check.txt";
console.log(await writeFileTool.invoke({ path: p, content: "hello\n" }));
console.log(await editFileTool.invoke({ path: p, oldString: "hello", newString: "hello world" }));
'
```
(If your shell rejects multi-line `-e` strings, save the block to a
`.mts` file and run it with `npx tsx <file>` instead — see
`test/run-write-edit-test.mts` for the working import style.)

Expected output: a `Wrote <n> bytes to /tmp/manual-write-edit-check.txt`
line, then an `Edited /tmp/manual-write-edit-check.txt` line.

---

## 4. Full Agent Check (through the graph)

To confirm the Implementation Agent actually calls these tools and
modifies a real file, run the CLI against this project and give it a
request that requires creating something new and self-contained — safest
as a brand-new file, so there's nothing existing to accidentally break:

```bash
npm start
# When prompted, enter a request like:
#   "Create a new utility file src/tools/formatBytes.ts that exports a
#    formatBytes function converting a byte count to a human-readable
#    string (e.g. 1536 -> '1.5 KB')."
```

Watch for:
- `[Implementation Agent] Tool calls:` lines showing `write_file`/
  `edit_file` calls.
- The `CHANGED FILES` section in the terminal output listing the new
  file's path.
- `reports/03-implementation/<NN>-<topic>.md` saved with the same number
  as the corresponding plan/analysis reports.

Then verify directly:

```bash
npx tsc --noEmit         # confirm the new file doesn't break the build
cat src/tools/formatBytes.ts
```

**Known limitation:** as with `search_code`, the model occasionally
supplies invalid tool-call arguments. This is caught and retried rather
than crashing the process (see
[`04-graph-spec.md`](../docs/04-graph-spec.md) §6) — a console line like
`[Implementation Agent] Invalid tool call from model (attempt 1/2): ...`
followed by a successful retry is this recovery working as intended, not
a defect.

**If you don't want to keep the test file**, delete it afterward:
`rm src/tools/formatBytes.ts` (and remove any import of it, if the model
happened to also add one — check `git diff` / `git status` after running
to see everything it touched).

---

## 5. Quick Reference — All Commands

```bash
# Automated suite (safe, uses a temp directory, cleans up after itself)
npx tsx test/run-write-edit-test.mts

# Full agent check (writes real files in this repo — review with git status/git diff after)
npm start
```
