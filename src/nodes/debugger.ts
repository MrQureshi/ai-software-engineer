import dotenv from "dotenv";
dotenv.config();

import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { SoftwareEngineerStateType } from "../agents/softwareEngineer.js";

import { readFileTool } from "../tools/readFile.js";
import { searchCodeTool } from "../tools/searchCode.js";
import { editFileTool } from "../tools/editFile.js";
import { runCommandTool } from "../tools/runCommand.js";
import {
  describeToolCallError,
  invokeWithRetry,
} from "../lib/invokeWithRetry.js";
import { createModel } from "../lib/model.js";
import { extractChangedFiles } from "./implementation.js";

const model = createModel();

const tools = [readFileTool, searchCodeTool, editFileTool, runCommandTool];

const modelWithTools = model.bindTools(tools);

const MAX_INVOKE_RETRIES = 2;
export const MAX_DEBUG_ITERATIONS = 10;

/**
 * Files this node fixed, unioned onto the files the Implementation Agent
 * already changed — this node only ever adds to changedFiles, never
 * drops from it.
 */
function mergeChangedFiles(
  existing: string[],
  messages: SoftwareEngineerStateType["messages"],
): string[] {
  return Array.from(new Set([...existing, ...extractChangedFiles(messages)]));
}

export async function debuggerNode(state: SoftwareEngineerStateType) {
  if (state.analysisCapped) {
    const skippedMessage = new AIMessage({
      content:
        "Debugging skipped: code analysis hit its iteration cap and implementation was never carried out, so there is nothing to verify or fix.",
    });

    return {
      messages: [skippedMessage],
      debugReport: skippedMessage.content as string,
      changedFiles: state.changedFiles,
      debugIterations: state.debugIterations ?? 0,
    };
  }

  const iteration = (state.debugIterations ?? 0) + 1;

  if (iteration > MAX_DEBUG_ITERATIONS) {
    console.warn(
      `\n[Debugger] Reached max iterations (${MAX_DEBUG_ITERATIONS}) without confirming the code is error-free; stopping.`,
    );

    const cappedMessage = new AIMessage({
      content: `Debugging stopped after reaching the maximum of ${MAX_DEBUG_ITERATIONS} tool-calling iterations without confirming the code is error-free. Consider narrowing the request or raising the iteration limit.`,
    });

    return {
      messages: [cappedMessage],
      debugReport: cappedMessage.content as string,
      changedFiles: mergeChangedFiles(state.changedFiles, [
        ...state.messages,
        cappedMessage,
      ]),
      debugIterations: iteration,
    };
  }

  const messages = [
    new SystemMessage(`
You are the Debugger of a Software Engineer Agent.

Your job is to verify that the change just made by the
Implementation Agent didn't break anything, and fix it if it did.

Start by running the single most relevant validation command
with run_command — inspect package.json first rather than
assuming a script like "test", "lint", or "typecheck" exists.
Prefer a narrow, fast check (e.g. npx tsc --noEmit) over the
full validation suite; running everything on every pass is not
your job.

If the command fails, use read_file and search_code to find
the root cause, prioritizing the files listed as changed below
before searching more broadly. Then use edit_file to apply the
minimal fix — you do not have write_file, so fix the existing
code rather than rewriting it.

After every edit, re-run the same command with run_command to
confirm the fix actually worked — do not assume it did.

When the command passes, respond with a plain-text summary (no
further tool calls) describing what was wrong, if anything, and
what you changed to fix it. If the command passed on your very
first check, say so plainly instead of inventing a fix.
`),

    new HumanMessage(`
User request:

${state.userRequest}

Implementation plan:

${state.plan.map((task: string, index: number) => `${index + 1}. ${task}`).join("\n")}

Code analysis:

${state.codeAnalysis}

What the Implementation Agent did:

${state.implementation}

Files changed so far:

${state.changedFiles.length > 0 ? state.changedFiles.join("\n") : "(none)"}
${
  state.testReport
    ? `\nThe Tester already ran and found this still failing — fix this specifically rather than starting from scratch:\n\n${state.testReport}\n`
    : ""
}`),

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
      { maxRetries: MAX_INVOKE_RETRIES, logPrefix: "[Debugger]" },
    );
  } catch (error) {
    const description =
      describeToolCallError(error) ??
      (error instanceof Error ? error.message : String(error));

    console.error(`\n[Debugger] Failed after retries: ${description}`);

    const failureMessage = new AIMessage({
      content: `Debugging could not be completed: the model repeatedly produced an invalid tool call (${description}).`,
    });

    return {
      messages: [failureMessage],
      debugReport: failureMessage.content as string,
      changedFiles: mergeChangedFiles(state.changedFiles, [
        ...state.messages,
        failureMessage,
      ]),
      debugIterations: iteration,
    };
  }

  console.log("\n[Debugger] Tool calls:", response.tool_calls);

  const aiMessage = new AIMessage({
    content: typeof response.content === "string" ? response.content : "",
    tool_calls: response.tool_calls,
    additional_kwargs: response.additional_kwargs,
    response_metadata: response.response_metadata,
  });

  return {
    messages: [aiMessage],
    debugReport: typeof response.content === "string" ? response.content : "",
    changedFiles: mergeChangedFiles(state.changedFiles, [
      ...state.messages,
      aiMessage,
    ]),
    debugIterations: iteration,
  };
}
