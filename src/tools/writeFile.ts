import fs from "node:fs/promises";
import path from "node:path";

import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const writeFileTool = tool(
  async ({ path: filePath, content }) => {
    console.log(`[Tool] write_file: ${filePath}`);

    try {
      const directory = path.dirname(filePath);
      await fs.mkdir(directory, { recursive: true });

      await fs.writeFile(filePath, content, "utf-8");

      return `Wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${filePath}`;
    } catch (error) {
      return `Failed to write file "${filePath}": ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  },
  {
    name: "write_file",

    description:
      "Create or overwrite a file with the given content, creating any missing parent " +
      "directories. Use this for new files, or to fully replace an existing file's contents.",

    schema: z.object({
      path: z
        .string()
        .describe("Path of the file to create or overwrite, e.g. src/theme/colors.ts"),

      content: z.string().describe("Full contents to write to the file."),
    }),
  },
);
