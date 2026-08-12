import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { execShellCommand, truncateOutput } from "../lib/execCommand.js";

export const gitDiffTool = tool(
  async ({ path }) => {
    console.log(`[Tool] git_diff${path ? `: ${path}` : ""}`);

    const command = path ? `git diff -- ${JSON.stringify(path)}` : "git diff";
    const result = await execShellCommand(command);

    if (result.exitCode !== 0) {
      return `Failed to run git diff (exit code ${result.exitCode}): ${truncateOutput(
        result.stderr.trim() || result.stdout.trim(),
      )}`;
    }

    const diff = result.stdout.trim();

    return diff
      ? truncateOutput(diff)
      : path
        ? `No uncommitted changes in ${path}.`
        : "No uncommitted changes in the repository.";
  },
  {
    name: "git_diff",

    description:
      "Show the current uncommitted changes in the repository (git diff against the " +
      "working tree), optionally scoped to one file or directory. Read-only — this never " +
      "modifies anything.",

    schema: z.object({
      path: z
        .string()
        .optional()
        .describe(
          "Optional file or directory to scope the diff to, e.g. 'src/tools/formatBytes.ts'. Omit to see the full diff.",
        ),
    }),
  },
);
