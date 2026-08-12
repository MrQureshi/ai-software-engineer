import dotenv from "dotenv";
dotenv.config();

import type { SoftwareEngineerStateType } from "../agents/softwareEngineer.js";

import { runTestsTool } from "../tools/runTests.js";
import { runTypecheckTool } from "../tools/runTypecheck.js";
import { runLintTool } from "../tools/runLint.js";

export const MAX_DEBUG_ATTEMPTS = 3;

type Status = "PASS" | "FAIL" | "SKIPPED";

function parseResult(raw: string): { status: Status; detail: string } {
  const firstLine = raw.split("\n")[0] ?? raw;

  if (raw.startsWith("PASS")) return { status: "PASS", detail: firstLine };

  if (raw.startsWith("SKIPPED")) {
    return { status: "SKIPPED", detail: firstLine.replace(/^SKIPPED:\s*/, "") };
  }

  return { status: "FAIL", detail: raw };
}

export async function testerNode(state: SoftwareEngineerStateType) {
  const [testsRaw, typecheckRaw, lintRaw] = [
    String(await runTestsTool.invoke({})),
    String(await runTypecheckTool.invoke({})),
    String(await runLintTool.invoke({})),
  ];

  const categories = [
    { label: "Tests", raw: testsRaw },
    { label: "TypeScript", raw: typecheckRaw },
    { label: "Lint", raw: lintRaw },
  ].map((c) => ({ ...c, ...parseResult(c.raw) }));

  console.log("\n[Tester]");
  for (const c of categories) {
    console.log(`${c.label}: ${c.status}`);
  }

  const summaryLines = categories.map((c) =>
    c.status === "SKIPPED" ? `${c.label}: SKIPPED — ${c.detail}` : `${c.label}: ${c.status}`,
  );

  const failures = categories.filter((c) => c.status === "FAIL");
  const passed = failures.length === 0;

  const report =
    failures.length === 0
      ? summaryLines.join("\n")
      : `${summaryLines.join("\n")}\n\nErrors:\n\n${failures
          .map((f) => `${f.label}:\n${f.raw}`)
          .join("\n\n")}`;

  if (passed) {
    return { testReport: report, testsPassed: true };
  }

  // Failed: hand the run back to the Debugger for another attempt (the
  // graph's routing function enforces MAX_DEBUG_ATTEMPTS, this node just
  // does the bookkeeping). debugIterations resets to 0 so the Debugger's
  // next pass gets a full fresh tool-calling budget rather than starting
  // already close to its own cap from the previous attempt.
  return {
    testReport: report,
    testsPassed: false,
    debugAttempts: (state.debugAttempts ?? 0) + 1,
    debugIterations: 0,
  };
}
