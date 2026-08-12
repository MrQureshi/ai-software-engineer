import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { COMMAND_TIMEOUT_MS, execShellCommand, truncateOutput } from "../lib/execCommand.js";

function formatResult(
  exitCode: number | string,
  stdout: string,
  stderr: string,
): string {
  return [
    `Exit code: ${exitCode}`,
    stdout.trim() ? `stdout:\n${truncateOutput(stdout.trim())}` : "",
    stderr.trim() ? `stderr:\n${truncateOutput(stderr.trim())}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const runCommandTool = tool(
  async ({ command }) => {
    console.log(`[Tool] run_command: ${command}`);

    const result = await execShellCommand(command);

    if (result.timedOut) {
      return `Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s: ${command}`;
    }

    return formatResult(result.exitCode, result.stdout, result.stderr);
  },
  {
    name: "run_command",

    description:
      "Run a shell command in the repository root (e.g. 'npx tsc --noEmit', 'npm test', " +
      "'npm run lint') and return its exit code, stdout, and stderr. Inspect package.json " +
      "first rather than assuming a script exists. A non-zero exit code means the command " +
      "failed.",

    schema: z.object({
      command: z
        .string()
        .describe(
          "The shell command to run, e.g. 'npx tsc --noEmit' or 'npm test'.",
        ),
    }),
  },
);
