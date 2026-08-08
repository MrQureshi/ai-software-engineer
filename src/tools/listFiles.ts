import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs/promises";
import path from "node:path";

import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const listFilesTool = tool(
  async ({ directory = "." }) => {
    console.log(`[Tool] list_files: ${directory}`);

    const entries = await fs.readdir(directory, {
      withFileTypes: true,
    });

    return entries
      .filter(
        (entry) =>
          !["node_modules", ".git", ".next", "dist", "build"].includes(
            entry.name,
          ),
      )
      .map((entry) => {
        const type = entry.isDirectory() ? "directory" : "file";

        return `${type}: ${path.join(directory, entry.name)}`;
      })
      .join("\n");
  },
  {
    name: "list_files",

    description:
      "List files and directories in the software project. Use this to inspect the repository structure.",

    schema: z.object({
      directory: z
        .string()
        .default(".")
        .describe("Directory to inspect. Defaults to the project root."),
    }),
  },
);
