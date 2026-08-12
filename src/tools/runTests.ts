import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { execShellCommand, getPackageScript, truncateOutput } from "../lib/execCommand.js";

export const runTestsTool = tool(
  async () => {
    console.log("[Tool] run_tests");

    const script = await getPackageScript("test");

    if (!script) {
      return 'SKIPPED: no "test" script in package.json.';
    }

    const result = await execShellCommand("npm test");
    const output = [result.stdout, result.stderr]
      .filter((s) => s.trim())
      .join("\n")
      .trim();

    if (result.timedOut) {
      return `FAIL: npm test timed out.\n${truncateOutput(output)}`;
    }

    return result.exitCode === 0
      ? "PASS: npm test"
      : `FAIL: npm test (exit code ${result.exitCode})\n${truncateOutput(output)}`;
  },
  {
    name: "run_tests",

    description:
      'Run the project\'s "test" npm script (npm test) if package.json defines one, and ' +
      "report PASS, FAIL (with output), or SKIPPED if no test script is configured.",

    schema: z.object({}),
  },
);
