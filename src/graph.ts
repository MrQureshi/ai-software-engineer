import { StateGraph, START, END } from "@langchain/langgraph";

import { ToolNode } from "@langchain/langgraph/prebuilt";

import { SoftwareEngineerState } from "./agents/softwareEngineer.js";

import { plannerNode } from "./nodes/planner.js";
import { codeAnalystNode } from "./nodes/codeAnalyst.js";

import { listFilesTool } from "./tools/listFiles.js";
import { readFileTool } from "./tools/readFile.js";

import { inspectRepositoryNode } from "./nodes/inspectRepository.js";

// const tools = [listFilesTool];
const tools = [listFilesTool, readFileTool];

// const toolNode = new ToolNode(tools);
const toolNode = new ToolNode(tools);

function shouldContinue(state: typeof SoftwareEngineerState.State) {
  const lastMessage = state.messages[state.messages.length - 1];

  if (
    lastMessage instanceof Object &&
    "tool_calls" in lastMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0
  ) {
    return "tools";
  }

  return END;
}

const graph = new StateGraph(SoftwareEngineerState)
  .addNode("planner", plannerNode)

  .addNode("codeAnalyst", codeAnalystNode)

  .addNode("tools", toolNode)

  .addNode("inspectRepository", inspectRepositoryNode)

  .addEdge(START, "planner")

  .addEdge("planner", "inspectRepository")

  .addEdge("inspectRepository", "codeAnalyst")

  .addConditionalEdges("codeAnalyst", shouldContinue, {
    tools: "tools",
    [END]: END,
  })

  .addEdge("tools", "codeAnalyst");

export const softwareEngineer = graph.compile();
