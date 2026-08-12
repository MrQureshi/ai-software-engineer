import fs from "node:fs/promises";

import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const editFileTool = tool(
  async ({ path: filePath, oldString, newString }) => {
    console.log(`[Tool] edit_file: ${filePath}`);

    let content: string;

    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      return `Failed to read file "${filePath}": ${
        error instanceof Error ? error.message : String(error)
      }`;
    }

    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) {
      return `Edit failed: oldString was not found in "${filePath}". No changes were made.`;
    }

    if (occurrences > 1) {
      return `Edit failed: oldString matches ${occurrences} locations in "${filePath}", but must match exactly one. Include more surrounding context in oldString to make it unique. No changes were made.`;
    }

    const updatedContent = content.replace(oldString, newString);

    try {
      await fs.writeFile(filePath, updatedContent, "utf-8");
    } catch (error) {
      return `Failed to write file "${filePath}": ${
        error instanceof Error ? error.message : String(error)
      }`;
    }

    return `Edited ${filePath}`;
  },
  {
    name: "edit_file",

    description:
      "Replace an exact, unique block of text within an existing file. Fails without " +
      "writing anything if oldString is not found, or matches more than once — in that " +
      "case, include more surrounding context in oldString to make it unique.",

    schema: z.object({
      path: z.string().describe("Path of the file to edit."),

      oldString: z
        .string()
        .describe("Exact text to find in the file. Must match exactly one location."),

      newString: z.string().describe("Text to replace oldString with."),
    }),
  },
);
