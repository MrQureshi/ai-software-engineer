import path from "node:path";
import { fileURLToPath } from "node:url";

import { runTestsTool } from "../../src/tools/runTests.js";
import { runLintTool } from "../../src/tools/runLint.js";
import { runTypecheckTool } from "../../src/tools/runTypecheck.js";
import { testerNode } from "../../src/nodes/tester.js";
import type { SoftwareEngineerStateType } from "../../src/agents/softwareEngineer.js";
import { createChecker } from "../support/checker.js";
import { packageJson, withProject } from "../support/withProject.js";

function fakeState(overrides: Partial<SoftwareEngineerStateType>): SoftwareEngineerStateType {
  return overrides as SoftwareEngineerStateType;
}

const TESTER_DIR = path.dirname(fileURLToPath(import.meta.url));
const { check, finish } = createChecker();
const project = (files: Record<string, string>, fn: () => Promise<void>) =>
  withProject(TESTER_DIR, files, fn);

async function main() {
  // --- run_tests ---

  await project({ "package.json": packageJson({}) }, async () => {
    const r = await runTestsTool.invoke({});
    check("run_tests: SKIPPED when no test script", String(r).startsWith("SKIPPED"), String(r));
  });

  await project({ "package.json": packageJson({ test: "exit 0" }) }, async () => {
    const r = await runTestsTool.invoke({});
    check("run_tests: PASS when test script exits 0", String(r) === "PASS: npm test", String(r));
  });

  await project({ "package.json": packageJson({ test: "exit 1" }) }, async () => {
    const r = String(await runTestsTool.invoke({}));
    check("run_tests: FAIL when test script exits non-zero", r.startsWith("FAIL: npm test (exit code 1)"), r);
  });

  // --- run_lint ---

  await project({ "package.json": packageJson({}) }, async () => {
    const r = await runLintTool.invoke({});
    check("run_lint: SKIPPED when no lint script", String(r).startsWith("SKIPPED"), String(r));
  });

  await project({ "package.json": packageJson({ lint: "exit 0" }) }, async () => {
    const r = await runLintTool.invoke({});
    check("run_lint: PASS when lint script exits 0", String(r) === "PASS: npm run lint", String(r));
  });

  await project({ "package.json": packageJson({ lint: "exit 1" }) }, async () => {
    const r = String(await runLintTool.invoke({}));
    check("run_lint: FAIL when lint script exits non-zero", r.startsWith("FAIL: npm run lint (exit code 1)"), r);
  });

  // --- run_typecheck ---

  await project({ "package.json": packageJson({}) }, async () => {
    const r = await runTypecheckTool.invoke({});
    check(
      "run_typecheck: SKIPPED when no typecheck script and no tsconfig.json",
      String(r).startsWith("SKIPPED"),
      String(r),
    );
  });

  await project(
    {
      "package.json": packageJson({ typecheck: "exit 0" }),
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

  await project(
    {
      "package.json": packageJson({}),
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

  await project(
    {
      "package.json": packageJson({}),
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

  await project(
    { "package.json": packageJson({ test: "exit 0" }) },
    async () => {
      const result = await testerNode(fakeState({ debugAttempts: 2 }));
      check("testerNode: testsPassed true when nothing fails", result.testsPassed === true);
      check(
        "testerNode: report has no Errors section when nothing fails",
        !result.testReport.includes("Errors:"),
        result.testReport,
      );
      check(
        "testerNode: does not touch debugAttempts/debugIterations when passing (no attempt used)",
        !("debugAttempts" in result) && !("debugIterations" in result),
        JSON.stringify(result),
      );
    },
  );

  await project(
    { "package.json": packageJson({ test: "exit 1" }) },
    async () => {
      const result = await testerNode(fakeState({ debugAttempts: 1, debugIterations: 7 }));
      check("testerNode: testsPassed false when a category fails", result.testsPassed === false);
      check(
        "testerNode: report includes an Errors section for the failing category",
        result.testReport.includes("Errors:") && result.testReport.includes("Tests:\nFAIL"),
        result.testReport,
      );
      check(
        "testerNode: increments debugAttempts on failure (loop bookkeeping)",
        result.debugAttempts === 2,
        String(result.debugAttempts),
      );
      check(
        "testerNode: resets debugIterations to 0 on failure (fresh budget for the retry)",
        result.debugIterations === 0,
        String(result.debugIterations),
      );
    },
  );

  finish();
}

main();
