import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runTestsTool } from "../../src/tools/runTests.js";
import { runLintTool } from "../../src/tools/runLint.js";
import { runTypecheckTool } from "../../src/tools/runTypecheck.js";
import { testerNode } from "../../src/nodes/tester.js";

const TESTER_DIR = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`PASS - ${label}`);
    passed++;
  } else {
    console.log(`FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failed++;
  }
}

/**
 * Every tool under test resolves paths off process.cwd() (matching how
 * the Tester node itself always inspects the real project root, not a
 * caller-supplied directory), so exercising different package.json/
 * tsconfig.json scenarios means actually chdir-ing into a fixture
 * project — not just passing a directory argument.
 *
 * The fixture is created under test/tester/ itself (not os.tmpdir())
 * so `npx tsc` resolves this project's own local `typescript` via
 * ancestor node_modules resolution, instead of trying to install one
 * from the network for an isolated temp directory.
 */
async function withProject(
  files: Record<string, string>,
  fn: () => Promise<void>,
) {
  const dir = await fs.mkdtemp(path.join(TESTER_DIR, ".tmp-fixture-"));
  const originalCwd = process.cwd();

  try {
    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(dir, relPath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf-8");
    }

    process.chdir(dir);
    await fn();
  } finally {
    process.chdir(originalCwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function pkg(scripts: Record<string, string>): string {
  return JSON.stringify(
    { name: "fixture", version: "1.0.0", scripts },
    null,
    2,
  );
}

async function main() {
  // --- run_tests ---

  await withProject({ "package.json": pkg({}) }, async () => {
    const r = await runTestsTool.invoke({});
    check("run_tests: SKIPPED when no test script", String(r).startsWith("SKIPPED"), String(r));
  });

  await withProject({ "package.json": pkg({ test: "exit 0" }) }, async () => {
    const r = await runTestsTool.invoke({});
    check("run_tests: PASS when test script exits 0", String(r) === "PASS: npm test", String(r));
  });

  await withProject({ "package.json": pkg({ test: "exit 1" }) }, async () => {
    const r = String(await runTestsTool.invoke({}));
    check("run_tests: FAIL when test script exits non-zero", r.startsWith("FAIL: npm test (exit code 1)"), r);
  });

  // --- run_lint ---

  await withProject({ "package.json": pkg({}) }, async () => {
    const r = await runLintTool.invoke({});
    check("run_lint: SKIPPED when no lint script", String(r).startsWith("SKIPPED"), String(r));
  });

  await withProject({ "package.json": pkg({ lint: "exit 0" }) }, async () => {
    const r = await runLintTool.invoke({});
    check("run_lint: PASS when lint script exits 0", String(r) === "PASS: npm run lint", String(r));
  });

  await withProject({ "package.json": pkg({ lint: "exit 1" }) }, async () => {
    const r = String(await runLintTool.invoke({}));
    check("run_lint: FAIL when lint script exits non-zero", r.startsWith("FAIL: npm run lint (exit code 1)"), r);
  });

  // --- run_typecheck ---

  await withProject({ "package.json": pkg({}) }, async () => {
    const r = await runTypecheckTool.invoke({});
    check(
      "run_typecheck: SKIPPED when no typecheck script and no tsconfig.json",
      String(r).startsWith("SKIPPED"),
      String(r),
    );
  });

  await withProject(
    {
      "package.json": pkg({ typecheck: "exit 0" }),
      "tsconfig.json": "{}",
    },
    async () => {
      const r = await runTypecheckTool.invoke({});
      check(
        "run_typecheck: prefers the typecheck script over tsconfig.json",
        String(r) === "PASS: npm run typecheck",
        String(r),
      );
    },
  );

  // "types": [] keeps TS from auto-acquiring @types packages from this
  // *project's own* ancestor node_modules (the fixture lives nested
  // under test/tester/ on purpose, so npx tsc resolves this project's
  // local `typescript` instead of trying to install one) — matching
  // why this repo's own tsconfig.json sets the same option.
  const isolatedTsconfig = JSON.stringify({
    compilerOptions: { strict: true, types: [] },
  });

  await withProject(
    {
      "package.json": pkg({}),
      "tsconfig.json": isolatedTsconfig,
      "index.ts": "const x = 1;\n",
    },
    async () => {
      const r = await runTypecheckTool.invoke({});
      check(
        "run_typecheck: falls back to tsc --noEmit when valid",
        String(r) === "PASS: npx tsc --noEmit",
        String(r),
      );
    },
  );

  await withProject(
    {
      "package.json": pkg({}),
      "tsconfig.json": isolatedTsconfig,
      "index.ts": 'const x: number = "not a number";\n',
    },
    async () => {
      const r = String(await runTypecheckTool.invoke({}));
      check(
        "run_typecheck: FAIL via tsc fallback on a real type error",
        r.startsWith("FAIL: npx tsc --noEmit"),
        r,
      );
    },
  );

  // --- testerNode (aggregate, still no LLM) ---

  await withProject(
    { "package.json": pkg({ test: "exit 0" }) },
    async () => {
      const result = await testerNode();
      check("testerNode: testsPassed true when nothing fails", result.testsPassed === true);
      check(
        "testerNode: report has no Errors section when nothing fails",
        !result.testReport.includes("Errors:"),
        result.testReport,
      );
    },
  );

  await withProject(
    { "package.json": pkg({ test: "exit 1" }) },
    async () => {
      const result = await testerNode();
      check("testerNode: testsPassed false when a category fails", result.testsPassed === false);
      check(
        "testerNode: report includes an Errors section for the failing category",
        result.testReport.includes("Errors:") && result.testReport.includes("Tests:\nFAIL"),
        result.testReport,
      );
    },
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
