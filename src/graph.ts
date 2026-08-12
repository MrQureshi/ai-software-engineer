import { StateGraph, START, END } from "@langchain/langgraph";

import { ToolNode } from "@langchain/langgraph/prebuilt";

import { SoftwareEngineerState } from "./agents/softwareEngineer.js";

import { plannerNode } from "./nodes/planner.js";
import { codeAnalystNode, MAX_ANALYSIS_ITERATIONS } from "./nodes/codeAnalyst.js";
import { implementationNode, MAX_IMPLEMENTATION_ITERATIONS } from "./nodes/implementation.js";
import { debuggerNode, MAX_DEBUG_ITERATIONS } from "./nodes/debugger.js";
import { testerNode, MAX_DEBUG_ATTEMPTS } from "./nodes/tester.js";
import { reviewerNode, MAX_REVIEW_ITERATIONS } from "./nodes/reviewer.js";

import { listFilesTool } from "./tools/listFiles.js";
import { readFileTool } from "./tools/readFile.js";
import { searchCodeTool } from "./tools/searchCode.js";
import { writeFileTool } from "./tools/writeFile.js";
import { editFileTool } from "./tools/editFile.js";
import { runCommandTool } from "./tools/runCommand.js";
import { gitDiffTool } from "./tools/gitDiff.js";

import { inspectRepositoryNode } from "./nodes/inspectRepository.js";

const analysisTools = [listFilesTool, readFileTool, searchCodeTool];
const implementationTools = [readFileTool, searchCodeTool, writeFileTool, editFileTool];
const debugTools = [readFileTool, searchCodeTool, editFileTool, runCommandTool];
const reviewTools = [gitDiffTool, readFileTool, searchCodeTool];

const analysisToolNode = new ToolNode(analysisTools);
const implementationToolNode = new ToolNode(implementationTools);
const debugToolNode = new ToolNode(debugTools);
const reviewToolNode = new ToolNode(reviewTools);

function hasPendingToolCalls(state: typeof SoftwareEngineerState.State) {
  const lastMessage = state.messages[state.messages.length - 1];

  return (
    lastMessage instanceof Object &&
    "tool_calls" in lastMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0
  );
}

function shouldContinueAnalysis(state: typeof SoftwareEngineerState.State) {
  return hasPendingToolCalls(state) ? "analysisTools" : "implementationAgent";
}

function shouldContinueImplementation(state: typeof SoftwareEngineerState.State) {
  return hasPendingToolCalls(state) ? "implementationTools" : "debugger";
}

function shouldContinueDebug(state: typeof SoftwareEngineerState.State) {
  return hasPendingToolCalls(state) ? "debugTools" : "tester";
}

/**
 * Not tool-call-shaped like the other three routing functions — the
 * Debugger ↔ Tester loop isn't a message/tool-call loop, it's an
 * attempt-count loop. Still a pure read of state with no side effects,
 * per the contract in 04-graph-spec.md §5 — just a different concrete
 * check. See 18-debugger-tester-loop-spec.md §5.
 */
function shouldRetryAfterTests(state: typeof SoftwareEngineerState.State) {
  if (state.testsPassed) return "reviewer";
  return state.debugAttempts > MAX_DEBUG_ATTEMPTS ? END : "debugger";
}

function shouldContinueReview(state: typeof SoftwareEngineerState.State) {
  return hasPendingToolCalls(state) ? "reviewTools" : END;
}

const graph = new StateGraph(SoftwareEngineerState)
  .addNode("planner", plannerNode)

  .addNode("codeAnalyst", codeAnalystNode)

  .addNode("analysisTools", analysisToolNode)

  // Named "implementationAgent", not "implementation" — the latter is
  // already a state channel (SoftwareEngineerState.implementation), and
  // LangGraph rejects a node name that collides with a channel name.
  .addNode("implementationAgent", implementationNode)

  .addNode("implementationTools", implementationToolNode)

  .addNode("debugger", debuggerNode)

  .addNode("debugTools", debugToolNode)

  .addNode("tester", testerNode)

  .addNode("reviewer", reviewerNode)

  .addNode("reviewTools", reviewToolNode)

  .addNode("inspectRepository", inspectRepositoryNode)

  .addEdge(START, "planner")

  .addEdge("planner", "inspectRepository")

  .addEdge("inspectRepository", "codeAnalyst")

  .addConditionalEdges("codeAnalyst", shouldContinueAnalysis, {
    analysisTools: "analysisTools",
    implementationAgent: "implementationAgent",
  })

  .addEdge("analysisTools", "codeAnalyst")

  .addConditionalEdges("implementationAgent", shouldContinueImplementation, {
    implementationTools: "implementationTools",
    debugger: "debugger",
  })

  .addEdge("implementationTools", "implementationAgent")

  .addConditionalEdges("debugger", shouldContinueDebug, {
    debugTools: "debugTools",
    tester: "tester",
  })

  .addEdge("debugTools", "debugger")

  .addConditionalEdges("tester", shouldRetryAfterTests, {
    debugger: "debugger",
    reviewer: "reviewer",
    [END]: END,
  })

  .addConditionalEdges("reviewer", shouldContinueReview, {
    reviewTools: "reviewTools",
    [END]: END,
  })

  .addEdge("reviewTools", "reviewer");

export const softwareEngineer = graph.compile();

/**
 * LangGraph counts every node execution (including tool nodes) as one
 * step toward its own global recursion limit — separate from, and not
 * automatically aware of, any loop's own iteration cap. Each pass
 * through a tool-calling loop costs 2 steps (the looping node + its
 * tool node); the Debugger ↔ Tester loop (18-debugger-tester-loop-spec.md)
 * can additionally repeat the whole Debugger loop-plus-one-Tester-step
 * unit up to MAX_DEBUG_ATTEMPTS times on top of the first pass. The
 * Reviewer (19-reviewer-node-spec.md) only ever runs once per graph
 * run — it isn't wired into a retry loop yet — so it just adds its own
 * single tool-calling loop's worth of steps on top. Worst case across
 * everything:
 *   planner + inspectRepository (2, non-looping)
 *   + 2 * MAX_ANALYSIS_ITERATIONS
 *   + 2 * MAX_IMPLEMENTATION_ITERATIONS
 *   + (1 + MAX_DEBUG_ATTEMPTS) * (2 * MAX_DEBUG_ITERATIONS + 1)
 *     — the "+1" per unit is the Tester's own single step; the
 *     "1 +" accounts for the first Debugger/Tester pass plus up to
 *     MAX_DEBUG_ATTEMPTS retries
 *   + 2 * MAX_REVIEW_ITERATIONS
 * LangGraph's default limit (25) is well below this once every loop is
 * built — a run can legitimately need more steps than that without any
 * loop misbehaving, so this must be raised accordingly (plus a small
 * safety margin) rather than left at the default.
 */
export const RECURSION_LIMIT =
  2 +
  2 * MAX_ANALYSIS_ITERATIONS +
  2 * MAX_IMPLEMENTATION_ITERATIONS +
  (1 + MAX_DEBUG_ATTEMPTS) * (2 * MAX_DEBUG_ITERATIONS + 1) +
  2 * MAX_REVIEW_ITERATIONS +
  4;
