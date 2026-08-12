import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { softwareEngineer } from "../../src/graph.js";
import { gitDiffTool } from "../../src/tools/gitDiff.js";
import { parseVerdict } from "../../src/nodes/reviewer.js";
import { createChecker } from "../support/checker.js";
import { initGitRepo, withProject } from "../support/withProject.js";

const REVIEWER_DIR = path.dirname(fileURLToPath(import.meta.url));
const { check, finish } = createChecker();
const project = (files: Record<string, string>, fn: () => Promise<void>) =>
  withProject(REVIEWER_DIR, files, fn);

async function main() {
  // --- graph structure (no LLM) ---

  const edges = softwareEngineer.getGraph().edges;
  const hasEdge = (source: string, target: string) =>
    edges.some((e) => e.source === source && e.target === target);

  check(
    "graph: tester routes to reviewer once tests pass",
    hasEdge("tester", "reviewer"),
  );
  check(
    "graph: reviewer has a conditional edge to its own tool node",
    hasEdge("reviewer", "reviewTools"),
  );
  check(
    "graph: reviewer has a conditional edge to END (verdict given)",
    hasEdge("reviewer", "__end__"),
  );
  check(
    "graph: reviewTools loops back to reviewer",
    hasEdge("reviewTools", "reviewer"),
  );

  // --- parseVerdict (pure function, no LLM, no filesystem) ---

  check(
    "parseVerdict: CHANGES_REQUIRED text is not approved",
    parseVerdict("REVIEW\n\nStatus: CHANGES_REQUIRED\n\nIssues:\n1. Missing test") === false,
  );
  check(
    "parseVerdict: APPROVE text is approved",
    parseVerdict("REVIEW\n\nIssues:\nNone\n\nRecommendation:\nAPPROVE") === true,
  );
  check(
    "parseVerdict: neither token present defaults to not approved (fail-closed)",
    parseVerdict("REVIEW\n\nLooks fine to me.") === false,
  );
  check(
    "parseVerdict: CHANGES_REQUIRED wins if both tokens somehow appear",
    parseVerdict("I would normally APPROVE this, but Status: CHANGES_REQUIRED due to a bug.") === false,
  );

  // --- git_diff tool ---

  // Deliberately os.tmpdir() here, not the nested project() fixture —
  // git walks up to the nearest ancestor .git, and this project's own
  // repo would otherwise "rescue" a nested fixture that has no .git of
  // its own, defeating this exact check.
  await withProject(os.tmpdir(), { "file.txt": "hello\n" }, async () => {
    const r = await gitDiffTool.invoke({});
    check(
      "git_diff: fails gracefully (not a thrown exception) outside any git repository",
      String(r).startsWith("Failed to run git diff"),
      String(r),
    );
  });

  await project({ "file.txt": "hello\n" }, async () => {
    await initGitRepo();

    const clean = await gitDiffTool.invoke({});
    check(
      "git_diff: reports no changes right after a commit",
      String(clean) === "No uncommitted changes in the repository.",
      String(clean),
    );

    const { writeFile } = await import("node:fs/promises");
    await writeFile("file.txt", "hello world\n", "utf-8");

    const dirty = String(await gitDiffTool.invoke({}));
    check(
      "git_diff: shows a real uncommitted change",
      dirty.includes("file.txt") && dirty.includes("-hello") && dirty.includes("+hello world"),
      dirty,
    );

    const scoped = String(await gitDiffTool.invoke({ path: "file.txt" }));
    check(
      "git_diff: scoping to the changed file shows the same diff",
      scoped.includes("+hello world"),
      scoped,
    );

    const { writeFile: wf2 } = await import("node:fs/promises");
    await wf2("other.txt", "untouched\n", "utf-8");
    const untouched = String(await gitDiffTool.invoke({ path: "other.txt" }));
    check(
      "git_diff: scoping to an untracked/unchanged path reports no changes for it specifically",
      untouched === "No uncommitted changes in other.txt.",
      untouched,
    );
  });

  finish();
}

main();
