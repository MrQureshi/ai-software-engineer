import { exec } from "node:child_process";
import { promisify } from "node:util";

import { tool } from "@langchain/core/tools";
import { z } from "zod";

const execAsync = promisify(exec);

const COMMAND_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 8_000;

function truncate(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output;

  return `${output.slice(0, MAX_OUTPUT_LENGTH)}\n...output truncated (${
    output.length - MAX_OUTPUT_LENGTH
  } more characters)`;
}

function formatResult(
  exitCode: number | string,
  stdout: string,
  stderr: string,
): string {
  return [
    `Exit code: ${exitCode}`,
    stdout.trim() ? `stdout:\n${truncate(stdout.trim())}` : "",
    stderr.trim() ? `stderr:\n${truncate(stderr.trim())}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const runCommandTool = tool(
  async ({ command }) => {
    console.log(`[Tool] run_command: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      });

      return formatResult(0, stdout, stderr);
    } catch (error) {
      const execError = error as {
        code?: number;
        killed?: boolean;
        stdout?: string;
        stderr?: string;
        message: string;
      };

      if (execError.killed) {
        return `Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s: ${command}`;
      }

      return formatResult(
        execError.code ?? "unknown",
        execError.stdout ?? "",
        execError.stderr ?? execError.message,
      );
    }
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
