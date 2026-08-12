# Manual Test Plan — `search_code` Tool

This walks through testing the `search_code` tool (`src/tools/searchCode.ts`)
by hand, without needing to invoke the LLM. Every step runs the tool
directly against a fixed set of fixture files under
`test/search-code/fixtures/sample-project/`, so results are deterministic and don't
depend on the state of `src/` or a Groq API call.

Spec reference: [`docs/10-search-code-spec.md`](../../docs/10-search-code-spec.md).

---

## 0. Prerequisites

- Dependencies installed: `npm install` (already required to run the
  project at all).
- No API key or `.env` needed for these tests — the harness calls the
  tool function directly, it does not go through the graph or the model.

Run every command below from the project root.

---

## 1. Fixture Layout

```text
test/search-code/fixtures/sample-project/
├── src/
│   ├── store/index.ts        → contains "createStore" (x1) and "store" (x2)
│   ├── hooks/useAuth.ts      → contains "store" (x2, different casing context)
│   ├── components/Button.tsx → contains "export" (x1), no "store" text
│   ├── many-matches.ts       → 60 lines containing "MATCHME" (tests the 50-match cap)
│   └── oversized.ts          → >1MB file containing "createStore" once (tests the 1MB size skip)
├── node_modules/some-dep/index.js → contains "createStore" (must be ignored — ignored directory)
├── dist/bundle.js                 → contains "createStore" (must be ignored — ignored directory)
├── package-lock.json              → contains "createStore" (must be ignored — ignored filename)
└── assets/logo.png                → contains "createStore" (must be ignored — binary extension)
```

Every "must be ignored" file deliberately contains a matching keyword. If
a test below ever shows one of these files in the results, that's a real
regression in the ignore/skip logic — not a fixture problem.

---

## 2. The Test Harness

`test/search-code/run-search-code.mts` calls `searchCodeTool` directly:

```bash
npx tsx test/search-code/run-search-code.mts <query> <directory> [filePattern] [caseSensitive:true|false]
```

- `filePattern` and `caseSensitive` are optional. Pass `""` for
  `filePattern` if you need to skip it but still set `caseSensitive`.

---

## 3. Test Steps

### Step 1 — Basic match, and confirm ignored files/dirs are excluded

```bash
npx tsx test/search-code/run-search-code.mts "createStore" test/search-code/fixtures/sample-project
```

**Expected output:**

```text
test/search-code/fixtures/sample-project/src/store/index.ts
  3:   export const store = createStore(rootReducer);
```

**Pass criteria:** only `src/store/index.ts` appears. Nothing from
`node_modules/`, `dist/`, `package-lock.json`, or `assets/logo.png` shows
up, even though all of them contain the word `createStore`.

---

### Step 2 — `filePattern` filter

```bash
npx tsx test/search-code/run-search-code.mts "export" test/search-code/fixtures/sample-project .tsx
```

**Expected output:**

```text
test/search-code/fixtures/sample-project/src/components/Button.tsx
  1:   export function Button({ label }: { label: string }) {
```

**Pass criteria:** only the `.tsx` file matches, even though
`src/store/index.ts` also contains the word `export` — it's a `.ts` file,
so the `.tsx` filter correctly excludes it.

---

### Step 3 — Case sensitivity

**3a — case-sensitive, should find nothing** (fixtures use lowercase `store`):

```bash
npx tsx test/search-code/run-search-code.mts "STORE" test/search-code/fixtures/sample-project "" true
```

**Expected output:**

```text
No matches found for "STORE" in test/search-code/fixtures/sample-project.
```

**3b — case-insensitive (default), should find matches:**

```bash
npx tsx test/search-code/run-search-code.mts "STORE" test/search-code/fixtures/sample-project
```

**Expected output:**

```text
test/search-code/fixtures/sample-project/src/hooks/useAuth.ts
  1:   import { store } from "../store";
  4:   return store.getState().auth;

test/search-code/fixtures/sample-project/src/store/index.ts
  3:   export const store = createStore(rootReducer);
  5:   export type RootState = ReturnType<typeof store.getState>;
```

**Pass criteria:** 3a returns zero matches, 3b returns four matches across
two files, grouped by file.

---

### Step 4 — No matches

```bash
npx tsx test/search-code/run-search-code.mts "nonexistent_symbol_xyz" test/search-code/fixtures/sample-project
```

**Expected output:**

```text
No matches found for "nonexistent_symbol_xyz" in test/search-code/fixtures/sample-project.
```

---

### Step 5 — Oversized file is skipped

```bash
npx tsx test/search-code/run-search-code.mts "createStore" test/search-code/fixtures/sample-project/src .ts
```

**Expected output:**

```text
test/search-code/fixtures/sample-project/src/store/index.ts
  3:   export const store = createStore(rootReducer);
```

**Pass criteria:** only `store/index.ts` appears. `oversized.ts` also
contains `createStore` and matches the `.ts` filter, but is over the 1MB
size cap, so it must **not** appear in the results.

---

### Step 6 — Truncation cap (50 matches)

```bash
npx tsx test/search-code/run-search-code.mts "MATCHME" test/search-code/fixtures/sample-project
```

**Expected output:** exactly 50 numbered match lines (line `1` through
line `50` of `many-matches.ts`), followed by:

```text
...50+ matches found, remaining matches omitted
```

**Pass criteria:** the file has 60 matching lines total, but only 50 are
returned, and the truncation notice is present. Lines 51–60 must not
appear.

---

## 4. Optional — Test Through the Full Graph

To confirm the Code Analyst node actually chooses to call `search_code`
(rather than testing the tool function in isolation), run the CLI against
the real project and give it a request whose answer requires finding a
symbol rather than reading an obvious file path:

```bash
npm start
# When prompted, enter a request like:
# "Where is the Groq model configured?"
```

Watch the console log lines prefixed `[Code Analyst] Tool calls:` — you
should see a `search_code` call appear alongside or instead of
`list_files`/`read_file` calls.

**Note:** the model occasionally supplies parameters the tool schema
doesn't accept (e.g. extra fields). This no longer crashes the process —
the analysis node catches the resulting error, feeds a correction back to
the model, and retries (see the "Known Issues" section of
[`04-graph-spec.md`](../../docs/04-graph-spec.md)). If you see a console line
like `[Code Analyst] Invalid tool call from model (attempt 1/2): ...`
followed by a successful retry, that's this recovery working as intended
— not a defect in the fixture tests above.

---

## 5. Quick Reference — All Commands

Every command from this guide in one place, for copy-paste testing.

### Fixture tests (deterministic — matches Section 3 exactly)

```bash
# Step 1 — basic match, ignore list (node_modules/dist/lockfile/binary excluded)
npx tsx test/search-code/run-search-code.mts "createStore" test/search-code/fixtures/sample-project

# Step 2 — filePattern filter (.tsx only)
npx tsx test/search-code/run-search-code.mts "export" test/search-code/fixtures/sample-project .tsx

# Step 3a — case-sensitive, expect no matches
npx tsx test/search-code/run-search-code.mts "STORE" test/search-code/fixtures/sample-project "" true

# Step 3b — case-insensitive (default), expect matches
npx tsx test/search-code/run-search-code.mts "STORE" test/search-code/fixtures/sample-project

# Step 4 — no matches
npx tsx test/search-code/run-search-code.mts "nonexistent_symbol_xyz" test/search-code/fixtures/sample-project

# Step 5 — oversized file (>1MB) skipped
npx tsx test/search-code/run-search-code.mts "createStore" test/search-code/fixtures/sample-project/src .ts

# Step 6 — truncation cap (50 of 60 matches returned)
npx tsx test/search-code/run-search-code.mts "MATCHME" test/search-code/fixtures/sample-project
```

### Real-project usage (against this repo's actual `src/`, not fixtures)

Results here will change as `src/` evolves — these are examples of shape,
not fixed pass/fail assertions like the fixture tests above.

```bash
# Find where a symbol/class is used or configured
npx tsx test/search-code/run-search-code.mts "ChatGroq" src

# Restrict to a specific file extension
npx tsx test/search-code/run-search-code.mts "ChatGroq" src .ts

# Case-sensitive search
npx tsx test/search-code/run-search-code.mts "SystemMessage" src "" true

# Search within a specific subdirectory only
npx tsx test/search-code/run-search-code.mts "tool" src/tools
```

### Full agent check (through the graph — needs `GROQ_API_KEY` in `.env`)

```bash
npm start
# When prompted, enter a request such as:
#   "Where is the Groq model configured?"
# Watch for a line like:
#   [Code Analyst] Tool calls: [{ name: 'search_code', ... }]
```

---

## 6. Cleanup

The fixtures in `test/search-code/fixtures/` are static and version-controlled test
data — do not delete them after testing. Only remove them if you are
intentionally retiring this test plan.
