import dotenv from "dotenv";
dotenv.config();

import { ChatGroq } from "@langchain/groq";

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

import type { SoftwareEngineerStateType } from "../agents/softwareEngineer.js";

import { listFilesTool } from "../tools/listFiles.js";
import { readFileTool } from "../tools/readFile.js";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0,
});

const tools = [listFilesTool, readFileTool];

const modelWithTools = model.bindTools(tools);

export async function codeAnalystNode(state: SoftwareEngineerStateType) {
  const messages = [
    new SystemMessage(`
You are the Code Analyst of a Software Engineer Agent.

Your job is to produce a generic, topic-focused analysis
for the user's request. Do NOT reference this repository,
its files, folders, dependencies, or current implementation
in any way. Do NOT inventory, list, or describe any files
from this project. Do NOT use the list_files or read_file
tools — they are not relevant to this task.

Treat the request as if it were about a brand-new or
arbitrary codebase: give general, best-practice guidance
that applies to anyone doing this task, regardless of what
project they are working in.

Structure your answer with clear sections appropriate to
the topic (e.g. installation/dependencies, configuration,
folder/file layout, code examples, tooling, testing,
deployment), using concrete commands and code snippets
where useful.
`),

    new HumanMessage(`
User request:

${state.userRequest}

Implementation plan:

${state.plan.map((task: string, index: number) => `${index + 1}. ${task}`).join("\n")}
`),

    ...state.messages,
  ];

  const response = await modelWithTools.invoke(
    messages as Parameters<typeof modelWithTools.invoke>[0],
  );

  console.log("\n[Code Analyst] Tool calls:", response.tool_calls);

  const aiMessage = new AIMessage({
    content: typeof response.content === "string" ? response.content : "",
    tool_calls: response.tool_calls,
    additional_kwargs: response.additional_kwargs,
    response_metadata: response.response_metadata,
  });

  return {
    messages: [aiMessage],

    codeAnalysis: typeof response.content === "string" ? response.content : "",
  };
}
