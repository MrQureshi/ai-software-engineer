import dotenv from "dotenv";
dotenv.config();

import { runTestsTool } from "../tools/runTests.js";
import { runTypecheckTool } from "../tools/runTypecheck.js";
import { runLintTool } from "../tools/runLint.js";

type Status = "PASS" | "FAIL" | "SKIPPED";

function parseResult(raw: string): { status: Status; detail: string } {
  const firstLine = raw.split("\n")[0] ?? raw;

  if (raw.startsWith("PASS")) return { status: "PASS", detail: firstLine };

  if (raw.startsWith("SKIPPED")) {
    return { status: "SKIPPED", detail: firstLine.replace(/^SKIPPED:\s*/, "") };
  }

  return { status: "FAIL", detail: raw };
}

export async function testerNode() {
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

  const report =
    failures.length === 0
      ? summaryLines.join("\n")
      : `${summaryLines.join("\n")}\n\nErrors:\n\n${failures
          .map((f) => `${f.label}:\n${f.raw}`)
          .join("\n\n")}`;

  return {
    testReport: report,
    testsPassed: failures.length === 0,
  };
}
