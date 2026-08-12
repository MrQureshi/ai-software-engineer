import { StateGraph, START, END } from "@langchain/langgraph";

import { ToolNode } from "@langchain/langgraph/prebuilt";

import { SoftwareEngineerState } from "./agents/softwareEngineer.js";

import { plannerNode } from "./nodes/planner.js";
import { codeAnalystNode, MAX_ANALYSIS_ITERATIONS } from "./nodes/codeAnalyst.js";
import { implementationNode, MAX_IMPLEMENTATION_ITERATIONS } from "./nodes/implementation.js";

import { listFilesTool } from "./tools/listFiles.js";
import { readFileTool } from "./tools/readFile.js";
import { searchCodeTool } from "./tools/searchCode.js";
import { writeFileTool } from "./tools/writeFile.js";
import { editFileTool } from "./tools/editFile.js";

import { inspectRepositoryNode } from "./nodes/inspectRepository.js";

const analysisTools = [listFilesTool, readFileTool, searchCodeTool];
const implementationTools = [readFileTool, searchCodeTool, writeFileTool, editFileTool];

const analysisToolNode = new ToolNode(analysisTools);
const implementationToolNode = new ToolNode(implementationTools);

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
  return hasPendingToolCalls(state) ? "implementationTools" : END;
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
    [END]: END,
  })

  .addEdge("implementationTools", "implementationAgent");

export const softwareEngineer = graph.compile();

/**
 * LangGraph counts every node execution (including tool nodes) as one
 * step toward its own global recursion limit — separate from, and not
 * automatically aware of, either loop's own iteration cap. Each pass
 * through a loop costs 2 steps (the looping node + its tool node), so
 * the worst case across both loops is:
 *   planner + inspectRepository (2, non-looping)
 *   + 2 * MAX_ANALYSIS_ITERATIONS
 *   + 2 * MAX_IMPLEMENTATION_ITERATIONS
 * LangGraph's default limit (25) is well below this once both loops are
 * built — a run can legitimately need more steps than that without
 * either loop misbehaving, so this must be raised accordingly (plus a
 * small safety margin) rather than left at the default.
 */
export const RECURSION_LIMIT =
  2 + 2 * MAX_ANALYSIS_ITERATIONS + 2 * MAX_IMPLEMENTATION_ITERATIONS + 4;
