import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { execShellCommand, getPackageScript, truncateOutput } from "../lib/execCommand.js";

export const runLintTool = tool(
  async () => {
    console.log("[Tool] run_lint");

    const script = await getPackageScript("lint");

    if (!script) {
      return 'SKIPPED: no "lint" script in package.json.';
    }

    const result = await execShellCommand("npm run lint");
    const output = [result.stdout, result.stderr]
      .filter((s) => s.trim())
      .join("\n")
      .trim();

    if (result.timedOut) {
      return `FAIL: npm run lint timed out.\n${truncateOutput(output)}`;
    }

    return result.exitCode === 0
      ? "PASS: npm run lint"
      : `FAIL: npm run lint (exit code ${result.exitCode})\n${truncateOutput(output)}`;
  },
  {
    name: "run_lint",

    description:
      'Run the project\'s "lint" npm script (npm run lint) if package.json defines one, and ' +
      "report PASS, FAIL (with output), or SKIPPED if no lint script is configured.",

    schema: z.object({}),
  },
);
