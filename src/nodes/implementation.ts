import dotenv from "dotenv";
dotenv.config();

import { ChatGroq } from "@langchain/groq";

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";

import type { SoftwareEngineerStateType } from "../agents/softwareEngineer.js";

import { readFileTool } from "../tools/readFile.js";
import { searchCodeTool } from "../tools/searchCode.js";
import { writeFileTool } from "../tools/writeFile.js";
import { editFileTool } from "../tools/editFile.js";
import {
  describeToolCallError,
  invokeWithRetry,
} from "../lib/invokeWithRetry.js";

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0,
});

const tools = [readFileTool, searchCodeTool, writeFileTool, editFileTool];

const modelWithTools = model.bindTools(tools);

const MAX_INVOKE_RETRIES = 2;
export const MAX_IMPLEMENTATION_ITERATIONS = 10;

/**
 * Derives the set of successfully changed file paths from the full
 * message history, rather than tracking it incrementally. Correlates
 * each ToolMessage back to the AIMessage tool_call that produced it (by
 * tool_call_id) to recover the target path, and only counts it if the
 * tool's own result string indicates success (write_file/edit_file both
 * return a descriptive error string, not a thrown exception, on failure).
 */
function extractChangedFiles(messages: BaseMessage[]): string[] {
  const toolCallsById = new Map<string, { name: string; path: unknown }>();

  for (const message of messages) {
    if (!(message instanceof AIMessage)) continue;

    for (const toolCall of message.tool_calls ?? []) {
      if (!toolCall.id) continue;
      if (toolCall.name !== "write_file" && toolCall.name !== "edit_file")
        continue;

      toolCallsById.set(toolCall.id, {
        name: toolCall.name,
        path: (toolCall.args as { path?: unknown } | undefined)?.path,
      });
    }
  }

  const changedFiles = new Set<string>();

  for (const message of messages) {
    if (!(message instanceof ToolMessage)) continue;

    const call = toolCallsById.get(message.tool_call_id);
    if (!call || typeof call.path !== "string") continue;

    const content = typeof message.content === "string" ? message.content : "";
    const succeeded =
      content.startsWith("Wrote ") || content.startsWith("Edited ");

    if (succeeded) {
      changedFiles.add(call.path);
    }
  }

  return Array.from(changedFiles);
}

export async function implementationNode(state: SoftwareEngineerStateType) {
  if (state.analysisCapped) {
    const skippedMessage = new AIMessage({
      content:
        "Implementation skipped: code analysis hit its iteration cap and never produced grounded analysis, so there is nothing reliable to implement from. Re-run with a narrower request or a higher analysis iteration limit.",
    });

    return {
      messages: [skippedMessage],
      implementation: skippedMessage.content as string,
      changedFiles: [],
      implementationIterations: state.implementationIterations ?? 0,
    };
  }

  const iteration = (state.implementationIterations ?? 0) + 1;

  if (iteration > MAX_IMPLEMENTATION_ITERATIONS) {
    console.warn(
      `\n[Implementation Agent] Reached max iterations (${MAX_IMPLEMENTATION_ITERATIONS}) without a final answer; stopping.`,
    );

    const cappedMessage = new AIMessage({
      content: `Implementation stopped after reaching the maximum of ${MAX_IMPLEMENTATION_ITERATIONS} tool-calling iterations without producing a final summary. Consider narrowing the request or raising the iteration limit.`,
    });

    return {
      messages: [cappedMessage],
      implementation: cappedMessage.content as string,
      changedFiles: extractChangedFiles([...state.messages, cappedMessage]),
      implementationIterations: iteration,
    };
  }

  const messages = [
    new SystemMessage(`
You are the Implementation Agent of a Software Engineer Agent.

Your job is to carry out the plan below by actually modifying
files in this repository — not to re-derive the analysis, but
to act on it.

Use read_file and search_code to confirm a file's CURRENT
contents immediately before editing it, even if the analysis
already described it — the analysis may be slightly stale by
the time you write. Then use write_file to create a new file
or fully replace one, and edit_file to change a specific part
of an existing file.

edit_file requires oldString to match exactly one location in
the file. If it fails because oldString was not found or
matched multiple times, re-read the file and retry with more
surrounding context to make it unique — do not guess.

Only describe a file as added, changed, or updated if you
actually called write_file or edit_file for it earlier in
this conversation and the tool call succeeded. Never narrate
changes you have not executed.

When you are done, respond with a plain-text summary (no
further tool calls) listing what you changed and why.
`),

    new HumanMessage(`
User request:

${state.userRequest}

Implementation plan:

${state.plan.map((task: string, index: number) => `${index + 1}. ${task}`).join("\n")}

Code analysis (grounding for this implementation):

${state.codeAnalysis}
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
      { maxRetries: MAX_INVOKE_RETRIES, logPrefix: "[Implementation Agent]" },
    );
  } catch (error) {
    const description =
      describeToolCallError(error) ??
      (error instanceof Error ? error.message : String(error));

    console.error(
      `\n[Implementation Agent] Failed after retries: ${description}`,
    );

    const failureMessage = new AIMessage({
      content: `Implementation could not be completed: the model repeatedly produced an invalid tool call (${description}).`,
    });

    return {
      messages: [failureMessage],
      implementation: failureMessage.content as string,
      changedFiles: extractChangedFiles([...state.messages, failureMessage]),
      implementationIterations: iteration,
    };
  }

  console.log("\n[Implementation Agent] Tool calls:", response.tool_calls);

  const aiMessage = new AIMessage({
    content: typeof response.content === "string" ? response.content : "",
    tool_calls: response.tool_calls,
    additional_kwargs: response.additional_kwargs,
    response_metadata: response.response_metadata,
  });

  return {
    messages: [aiMessage],

    implementation:
      typeof response.content === "string" ? response.content : "",
    changedFiles: extractChangedFiles([...state.messages, aiMessage]),
    implementationIterations: iteration,
  };
}
