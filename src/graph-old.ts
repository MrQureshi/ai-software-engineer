import { ChatGroq } from "@langchain/groq";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
} from "@langchain/langgraph";
import dotenv from "dotenv";

dotenv.config();

import { calculatorTool } from "./tools/calculator";
import { getTimeTool } from "./tools/getTime";

import { weatherTool } from "./tools/weather";
import { searchTool } from "./tools/search";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0,
});

// All tools available to the agent

const tools = [calculatorTool, getTimeTool, weatherTool, searchTool];

// Create a lookup map:
// "calculator" → calculatorTool
const toolMap = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

const modelWithTools = model.bindTools(tools);

async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await modelWithTools.invoke(state.messages);

  return {
    messages: [response],
  };
}

async function callTools(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

  const toolMessages: ToolMessage[] = [];

  for (const toolCall of lastMessage.tool_calls ?? []) {
    const tool = toolMap[toolCall.name];

    if (!tool) {
      throw new Error(`Tool "${toolCall.name}" not found`);
    }

    const result = await tool.invoke(toolCall.args);

    toolMessages.push(
      new ToolMessage({
        content: String(result),
        tool_call_id: toolCall.id!,
      }),
    );
  }

  return {
    messages: toolMessages,
  };
}

function shouldContinue(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

  if (lastMessage.tool_calls?.length) {
    return "tools";
  }

  return END;
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("model", callModel)
  .addNode("tools", callTools)

  .addEdge(START, "model")

  .addConditionalEdges("model", shouldContinue, ["tools", END])

  .addEdge("tools", "model");

export const agent = graph.compile();
