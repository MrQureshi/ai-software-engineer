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
import { searchCodeTool } from "../tools/searchCode.js";
import {
  describeToolCallError,
  invokeWithRetry,
} from "../lib/invokeWithRetry.js";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0,
});

const tools = [listFilesTool, readFileTool, searchCodeTool];

const modelWithTools = model.bindTools(tools);

const MAX_INVOKE_RETRIES = 2;
export const MAX_ANALYSIS_ITERATIONS = 8;

export async function codeAnalystNode(state: SoftwareEngineerStateType) {
  const iteration = (state.analysisIterations ?? 0) + 1;

  if (iteration > MAX_ANALYSIS_ITERATIONS) {
    console.warn(
      `\n[Code Analyst] Reached max iterations (${MAX_ANALYSIS_ITERATIONS}) without a final answer; stopping.`,
    );

    const cappedMessage = new AIMessage({
      content: `Analysis stopped after reaching the maximum of ${MAX_ANALYSIS_ITERATIONS} tool-calling iterations without producing a final answer. Consider narrowing the request or raising the iteration limit.`,
    });

    return {
      messages: [cappedMessage],
      codeAnalysis: cappedMessage.content as string,
      analysisIterations: iteration,
      analysisCapped: true,
    };
  }

  const messages = [
    new SystemMessage(`
You are the Code Analyst of a Software Engineer Agent.

Your job is to produce an analysis of the user's request
that is grounded in THIS repository's actual code — not
generic, textbook advice.

You have been given the top-level directory listing below.
Use the list_files, search_code, and read_file tools to
inspect whatever is relevant before writing your analysis.
Prefer search_code to locate files by symbol or keyword
instead of reading files one by one — look for the existing
patterns, libraries, and conventions this project already
uses (e.g. state management, navigation, styling, existing
implementations of related features) rather than assuming a
generic setup.

Do not answer until you have read the files that matter for
this request. If a directory listing suggests relevant files
(by name or location), read them. If you are unsure whether
a file is relevant, prefer reading it over guessing.

Your final answer should state:
- Relevant files you found, and what each currently does
- The existing implementation/patterns this request must fit
- Dependencies and other files that may be affected
- Recommended approach, grounded in what you actually read

Structure your answer with clear sections, and reference real
file paths from this repository throughout.
`),

    new HumanMessage(`
User request:

${state.userRequest}

Implementation plan:

${state.plan.map((task: string, index: number) => `${index + 1}. ${task}`).join("\n")}

Top-level repository listing (from list_files "."):

${state.repositoryFiles}
`),

    ...state.messages,
  ];

  let response;

  try {
    response = await invokeWithRetry(
      (msgs) =>
        modelWithTools.invoke(
          msgs as Parameters<typeof modelWithTools.invoke>[0],
        ),
      messages,
      { maxRetries: MAX_INVOKE_RETRIES, logPrefix: "[Code Analyst]" },
    );
  } catch (error) {
    const description =
      describeToolCallError(error) ??
      (error instanceof Error ? error.message : String(error));

    console.error(`\n[Code Analyst] Failed after retries: ${description}`);

    const failureMessage = new AIMessage({
      content: `Analysis could not be completed: the model repeatedly produced an invalid tool call (${description}).`,
    });

    return {
      messages: [failureMessage],
      codeAnalysis: failureMessage.content as string,
      analysisIterations: iteration,
    };
  }

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
    analysisIterations: iteration,
  };
}
