import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs/promises";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const readFileTool = tool(
  async ({ path }) => {
    try {
      const content = await fs.readFile(path, "utf-8");

      return content;
    } catch (error) {
      return `Failed to read file "${path}": ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  },
  {
    name: "read_file",

    description:
      "Read the contents of a file in the software project. Use this after discovering relevant files with list_files.",

    schema: z.object({
      path: z
        .string()
        .describe(
          "Path of the file to read, for example package.json or src/App.tsx",
        ),
    }),
  },
);
