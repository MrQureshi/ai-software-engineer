import path from "node:path";
import { fileURLToPath } from "node:url";

import { softwareEngineer } from "../../src/graph.js";
import { testerNode, MAX_DEBUG_ATTEMPTS } from "../../src/nodes/tester.js";
import type { SoftwareEngineerStateType } from "../../src/agents/softwareEngineer.js";
import { createChecker } from "../support/checker.js";
import { packageJson, withProject } from "../support/withProject.js";

const LOOP_DIR = path.dirname(fileURLToPath(import.meta.url));
const { check, finish } = createChecker();
const project = (files: Record<string, string>, fn: () => Promise<void>) =>
  withProject(LOOP_DIR, files, fn);

function fakeState(overrides: Partial<SoftwareEngineerStateType>): SoftwareEngineerStateType {
  return overrides as SoftwareEngineerStateType;
}

async function main() {
  // --- Graph structure (no LLM): the conditional edges this phase adds
  // actually exist on the compiled graph, wired the way the spec says.

  const edges = softwareEngineer.getGraph().edges;
  const hasEdge = (source: string, target: string) =>
    edges.some((e) => e.source === source && e.target === target);

  check(
    "graph: tester has a conditional edge back to debugger (the retry path)",
    hasEdge("tester", "debugger"),
  );
  check(
    "graph: tester has a conditional edge to END (passed, or out of attempts)",
    hasEdge("tester", "__end__"),
  );
  check(
    "graph: debugger still routes to tester once its own tool loop finishes (unchanged from Phase 6)",
    hasEdge("debugger", "tester"),
  );
  check(
    "graph: debugger still routes to its own tool node while it has pending tool calls (unchanged)",
    hasEdge("debugger", "debugTools"),
  );

  // --- Attempt-cap bookkeeping, driven against a fixture project whose
  // "test" script always fails, so testerNode(...) fails deterministically
  // on every pass — proving the cap without depending on this actual
  // repo's own package.json (which happens to always fail too, but for
  // an unrelated reason: see test/tester/tester-manual-test.md §2).

  await project({ "package.json": packageJson({ test: "exit 1" }) }, async () => {
    let state: SoftwareEngineerStateType = fakeState({ debugAttempts: 0, debugIterations: 9 });
    let passes = 0;
    let allFailed = true;
    let allFreshIterations = true;

    for (let i = 0; i < MAX_DEBUG_ATTEMPTS + 3; i++) {
      const result = await testerNode(state);
      passes++;

      if (result.testsPassed) {
        allFailed = false;
        break;
      }

      if (result.debugIterations !== 0) allFreshIterations = false;

      state = { ...state, ...result };

      const willRetry = (result.debugAttempts ?? 0) <= MAX_DEBUG_ATTEMPTS;
      if (!willRetry) break;
    }

    check(
      `attempt cap: exactly ${1 + MAX_DEBUG_ATTEMPTS} testerNode passes before giving up (1 initial + MAX_DEBUG_ATTEMPTS retries)`,
      allFailed && passes === 1 + MAX_DEBUG_ATTEMPTS,
      `passes=${passes}`,
    );

    check(
      "attempt cap: debugIterations is reset to 0 on every failing pass (fresh budget each retry)",
      allFreshIterations,
    );

    check(
      "attempt cap: final debugAttempts exceeds MAX_DEBUG_ATTEMPTS (this is what tells the graph's routing function to stop)",
      (state.debugAttempts ?? 0) > MAX_DEBUG_ATTEMPTS,
      String(state.debugAttempts),
    );
  });

  // --- A single retry, then recovery: the loop doesn't just count down
  // to zero blindly — a pass that finally succeeds still ends the loop
  // even with attempts remaining, and doesn't touch the attempt counter.

  await project({ "package.json": packageJson({ test: "exit 1" }) }, async () => {
    const first = await testerNode(fakeState({ debugAttempts: 0, debugIterations: 4 }));
    check("recovery: first (failing) pass increments debugAttempts to 1", first.debugAttempts === 1);
  });

  await project({ "package.json": packageJson({ test: "exit 0" }) }, async () => {
    const recovered = await testerNode(fakeState({ debugAttempts: 1, debugIterations: 4 }));
    check("recovery: a passing pass reports testsPassed true regardless of prior debugAttempts", recovered.testsPassed === true);
    check(
      "recovery: a passing pass does not touch debugAttempts/debugIterations (loop simply ends)",
      !("debugAttempts" in recovered) && !("debugIterations" in recovered),
      JSON.stringify(recovered),
    );
  });

  finish();
}

main();
