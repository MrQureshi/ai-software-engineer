import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createModel } from "../../src/lib/model.js";
import { createChecker } from "../support/checker.js";

const { check, finish } = createChecker();

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const NODE_FILES = [
  "planner.ts",
  "codeAnalyst.ts",
  "implementation.ts",
  "debugger.ts",
  "reviewer.ts",
].map((f) => path.join(PROJECT_ROOT, "src/nodes", f));

async function main() {
  // --- createModel() itself ---

  const model = createModel();

  check("createModel: returns a ChatGroq instance", model.constructor.name === "ChatGroq");
  check("createModel: uses the expected model", model.model === "openai/gpt-oss-120b", String(model.model));
  check("createModel: temperature is 0 (deterministic)", model.temperature === 0, String(model.temperature));

  // --- regression guard: no node file constructs its own ChatGroq anymore ---

  for (const file of NODE_FILES) {
    const content = await fs.readFile(file, "utf-8");
    const relative = path.relative(PROJECT_ROOT, file);

    check(
      `${relative}: does not construct its own ChatGroq (uses the shared factory instead)`,
      !content.includes("new ChatGroq"),
    );
    check(
      `${relative}: imports createModel from lib/model`,
      content.includes('from "../lib/model.js"') && content.includes("createModel"),
    );
  }

  finish();
}

main();
