import fs from "node:fs/promises";

import {
  changedFilesEvaluator,
  hasPlanEvaluator,
  testerRanEvaluator,
} from "../../src/lib/evaluators.js";
import { getTracingProject, isTracingEnabled } from "../../src/lib/langsmith.js";
import { createChecker } from "../support/checker.js";

const { check, finish } = createChecker();

const TRACING_ENV_VARS = [
  "LANGSMITH_TRACING_V2",
  "LANGCHAIN_TRACING_V2",
  "LANGSMITH_TRACING",
  "LANGCHAIN_TRACING",
];

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const originals = new Map<string, string | undefined>();

  for (const key of Object.keys(vars)) {
    originals.set(key, process.env[key]);
  }

  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    fn();
  } finally {
    for (const [key, value] of originals) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function main() {
  // --- hasPlanEvaluator ---

  check(
    "hasPlanEvaluator: score 1 for a non-empty plan",
    hasPlanEvaluator({ outputs: { plan: ["step one", "step two"] } }).score === 1,
  );
  check(
    "hasPlanEvaluator: score 0 for an empty plan",
    hasPlanEvaluator({ outputs: { plan: [] } }).score === 0,
  );
  check(
    "hasPlanEvaluator: score 0 when plan is missing entirely",
    hasPlanEvaluator({ outputs: {} }).score === 0,
  );

  // --- changedFilesEvaluator ---

  check(
    "changedFilesEvaluator: score 1 when files were changed",
    changedFilesEvaluator({ outputs: { changedFiles: ["src/a.ts"] } }).score === 1,
  );
  check(
    "changedFilesEvaluator: score 0 when changedFiles is empty",
    changedFilesEvaluator({ outputs: { changedFiles: [] } }).score === 0,
  );
  check(
    "changedFilesEvaluator: comment lists the actual changed files",
    changedFilesEvaluator({ outputs: { changedFiles: ["src/a.ts", "src/b.ts"] } }).comment ===
      "Changed 2 file(s): src/a.ts, src/b.ts",
  );

  // --- testerRanEvaluator ---

  check(
    "testerRanEvaluator: score 1 when a test report exists",
    testerRanEvaluator({ outputs: { testReport: "Tests: PASS" } }).score === 1,
  );
  check(
    "testerRanEvaluator: score 0 when testReport is an empty string",
    testerRanEvaluator({ outputs: { testReport: "" } }).score === 0,
  );
  check(
    "testerRanEvaluator: score 0 when testReport is missing",
    testerRanEvaluator({ outputs: {} }).score === 0,
  );

  // --- isTracingEnabled / getTracingProject ---

  withEnv(
    Object.fromEntries(TRACING_ENV_VARS.map((v) => [v, undefined])),
    () => {
      check("isTracingEnabled: false when no tracing env vars are set", isTracingEnabled() === false);
    },
  );

  withEnv({ LANGSMITH_TRACING: "true" }, () => {
    check("isTracingEnabled: true when LANGSMITH_TRACING=true", isTracingEnabled() === true);
  });

  withEnv({ LANGCHAIN_TRACING_V2: "true" }, () => {
    check(
      "isTracingEnabled: true when the older LANGCHAIN_TRACING_V2=true alias is set",
      isTracingEnabled() === true,
    );
  });

  withEnv({ LANGSMITH_TRACING: "false" }, () => {
    check(
      'isTracingEnabled: false when set to the string "false", not just unset',
      isTracingEnabled() === false,
    );
  });

  withEnv({ LANGSMITH_PROJECT: undefined, LANGCHAIN_PROJECT: undefined }, () => {
    check('getTracingProject: defaults to "default" when unset', getTracingProject() === "default");
  });

  withEnv({ LANGSMITH_PROJECT: "my-project" }, () => {
    check("getTracingProject: reads LANGSMITH_PROJECT when set", getTracingProject() === "my-project");
  });
}

async function checkEnvExample() {
  const content = await fs.readFile(
    new URL("../../.env.example", import.meta.url),
    "utf-8",
  );

  check(
    ".env.example documents LANGSMITH_TRACING",
    content.includes("LANGSMITH_TRACING"),
  );
  check(
    ".env.example documents LANGSMITH_API_KEY",
    content.includes("LANGSMITH_API_KEY"),
  );
  check(
    ".env.example documents LANGSMITH_PROJECT",
    content.includes("LANGSMITH_PROJECT"),
  );
}

main();
await checkEnvExample();
finish();
