import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  execShellCommand,
  fileExists,
  getPackageScript,
  truncateOutput,
} from "../lib/execCommand.js";

export const runTypecheckTool = tool(
  async () => {
    console.log("[Tool] run_typecheck");

    const script = await getPackageScript("typecheck");
    const command = script
      ? "npm run typecheck"
      : (await fileExists("tsconfig.json"))
        ? "npx tsc --noEmit"
        : undefined;

    if (!command) {
      return 'SKIPPED: no "typecheck" script in package.json and no tsconfig.json found.';
    }

    const result = await execShellCommand(command);
    const output = [result.stdout, result.stderr]
      .filter((s) => s.trim())
      .join("\n")
      .trim();

    if (result.timedOut) {
      return `FAIL: ${command} timed out.\n${truncateOutput(output)}`;
    }

    return result.exitCode === 0
      ? `PASS: ${command}`
      : `FAIL: ${command} (exit code ${result.exitCode})\n${truncateOutput(output)}`;
  },
  {
    name: "run_typecheck",

    description:
      'Run a TypeScript check — the "typecheck" npm script if package.json defines one, ' +
      "otherwise npx tsc --noEmit if a tsconfig.json exists — and report PASS, FAIL (with " +
      "output), or SKIPPED if neither is available.",

    schema: z.object({}),
  },
);
