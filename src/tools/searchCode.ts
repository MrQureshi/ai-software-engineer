import fs from "node:fs/promises";
import path from "node:path";

import { tool } from "@langchain/core/tools";
import { z } from "zod";

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
]);

const IGNORED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".bmp",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".zip",
  ".tar",
  ".gz",
  ".pdf",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
]);

const MAX_FILES_SCANNED = 2000;
const MAX_FILE_SIZE_BYTES = 1024 * 1024;
const MAX_MATCHES_RETURNED = 50;

async function collectFiles(
  directory: string,
  filePattern: string | undefined,
  filesScanned: { count: number },
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string) {
    if (filesScanned.count >= MAX_FILES_SCANNED) return;

    let entries;

    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (filesScanned.count >= MAX_FILES_SCANNED) return;

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;

        await walk(path.join(dir, entry.name));
        continue;
      }

      if (IGNORED_FILES.has(entry.name)) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(extension)) continue;

      if (filePattern && !entry.name.endsWith(filePattern)) continue;

      filesScanned.count += 1;
      results.push(path.join(dir, entry.name));
    }
  }

  await walk(directory);

  return results;
}

export const searchCodeTool = tool(
  async ({ query, directory = ".", filePattern, caseSensitive = false }) => {
    console.log(`[Tool] search_code: "${query}" in ${directory}`);

    const filesScanned = { count: 0 };
    const files = await collectFiles(directory, filePattern, filesScanned);

    const compareQuery = caseSensitive ? query : query.toLowerCase();

    const matchesByFile = new Map<string, string[]>();
    let totalMatches = 0;
    let truncated = false;

    filesLoop: for (const filePath of files) {
      let stats;

      try {
        stats = await fs.stat(filePath);
      } catch {
        continue;
      }

      if (stats.size > MAX_FILE_SIZE_BYTES) continue;

      let content: string;

      try {
        content = await fs.readFile(filePath, "utf-8");
      } catch {
        continue;
      }

      const lines = content.split("\n");

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        if (line === undefined) continue;

        const compareLine = caseSensitive ? line : line.toLowerCase();

        if (!compareLine.includes(compareQuery)) continue;

        if (totalMatches >= MAX_MATCHES_RETURNED) {
          truncated = true;
          break filesLoop;
        }

        const fileMatches = matchesByFile.get(filePath) ?? [];
        fileMatches.push(`  ${lineIndex + 1}:   ${line.trim()}`);
        matchesByFile.set(filePath, fileMatches);
        totalMatches += 1;
      }
    }

    if (matchesByFile.size === 0) {
      return `No matches found for "${query}" in ${directory}.`;
    }

    const blocks = Array.from(matchesByFile.entries()).map(
      ([filePath, matchLines]) => `${filePath}\n${matchLines.join("\n")}`,
    );

    let output = blocks.join("\n\n");

    if (truncated) {
      output += `\n\n...${MAX_MATCHES_RETURNED}+ matches found, remaining matches omitted`;
    }

    return output;
  },
  {
    name: "search_code",

    description:
      "Search file contents in the software project for a keyword or symbol. " +
      "Use this to find which files are relevant to a request before reading them with read_file.",

    schema: z.object({
      query: z
        .string()
        .describe("Keyword or symbol to search for in file contents."),

      directory: z
        .string()
        .default(".")
        .describe("Directory to search within. Defaults to the project root."),

      filePattern: z
        .string()
        .optional()
        .describe(
          "Optional file extension filter, e.g. '.tsx' or '.ts'. If omitted, all non-ignored text files are searched.",
        ),

      caseSensitive: z
        .boolean()
        .default(false)
        .describe("Whether the search is case-sensitive. Defaults to false."),
    }),
  },
);
