import dotenv from "dotenv";
dotenv.config();

import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { SoftwareEngineerStateType } from "../agents/softwareEngineer.js";

import { gitDiffTool } from "../tools/gitDiff.js";
import { readFileTool } from "../tools/readFile.js";
import { searchCodeTool } from "../tools/searchCode.js";
import {
  describeToolCallError,
  invokeWithRetry,
} from "../lib/invokeWithRetry.js";
import { createModel } from "../lib/model.js";

const model = createModel();

const tools = [gitDiffTool, readFileTool, searchCodeTool];

const modelWithTools = model.bindTools(tools);

const MAX_INVOKE_RETRIES = 2;
export const MAX_REVIEW_ITERATIONS = 8;

/**
 * Fail-closed: CHANGES_REQUIRED is checked first since it's a far less
 * ambiguous token than the bare word "approve" (which could appear
 * inside a sentence that isn't actually approving anything). A verdict
 * that doesn't parse as either is treated as not approved, same default
 * testsPassed uses — an unparseable review is not an approval.
 */
export function parseVerdict(reportText: string): boolean {
  if (reportText.includes("CHANGES_REQUIRED")) return false;
  return reportText.includes("APPROVE");
}

export async function reviewerNode(state: SoftwareEngineerStateType) {
  if (state.analysisCapped) {
    const skippedMessage = new AIMessage({
      content:
        "Review skipped: code analysis hit its iteration cap and implementation was never carried out, so there is nothing to review.",
    });

    return {
      messages: [skippedMessage],
      reviewReport: skippedMessage.content as string,
      reviewApproved: false,
      reviewIterations: state.reviewIterations ?? 0,
    };
  }

  const iteration = (state.reviewIterations ?? 0) + 1;

  if (iteration > MAX_REVIEW_ITERATIONS) {
    console.warn(
      `\n[Reviewer] Reached max iterations (${MAX_REVIEW_ITERATIONS}) without producing a verdict; stopping.`,
    );

    const cappedMessage = new AIMessage({
      content: `Review stopped after reaching the maximum of ${MAX_REVIEW_ITERATIONS} tool-calling iterations without producing a verdict. Consider narrowing the request or raising the iteration limit.`,
    });

    return {
      messages: [cappedMessage],
      reviewReport: cappedMessage.content as string,
      reviewApproved: false,
      reviewIterations: iteration,
    };
  }

  const messages = [
    new SystemMessage(`
You are the Reviewer of a Software Engineer Agent — the final
quality gate after the Tester has already reported a pass.

Start with git_diff to see the actual changes for yourself —
do not just trust the Implementation/Debugger summaries below,
they are self-reported prose written by the agents that made
the changes, not verified fact. Use read_file and search_code
for context beyond the diff when useful (e.g. checking whether
a changed function's other call sites were updated consistently,
or whether a similar existing pattern was followed).

If git_diff shows no changes at all, say so plainly rather than
inventing issues — an empty diff is not automatically a problem.

Judge the change against: architecture, type safety, code
quality, security, and performance. Use the test results already
provided below — do not re-run tests, that is not your job here.

When you are ready to give a verdict, respond with a plain-text
summary (no further tool calls) in exactly this shape:

REVIEW

Architecture: PASS or FAIL
Type safety: PASS or FAIL
Tests: PASS or FAIL
Code quality: PASS or FAIL

Issues:
None, or a numbered list

Recommendation:
APPROVE

or, if there are real problems:

REVIEW

Status: CHANGES_REQUIRED

Issues:
1. ...
2. ...

Use the literal words APPROVE or CHANGES_REQUIRED exactly as
shown — the graph parses your response for these tokens.
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

What the Debugger found/fixed:

${state.debugReport || "(nothing — Debugger reported no issues)"}

Files changed:

${state.changedFiles.length > 0 ? state.changedFiles.join("\n") : "(none)"}

Test results (already run — do not re-run):

${state.testReport}
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
      { maxRetries: MAX_INVOKE_RETRIES, logPrefix: "[Reviewer]" },
    );
  } catch (error) {
    const description =
      describeToolCallError(error) ??
      (error instanceof Error ? error.message : String(error));

    console.error(`\n[Reviewer] Failed after retries: ${description}`);

    const failureMessage = new AIMessage({
      content: `Review could not be completed: the model repeatedly produced an invalid tool call (${description}).`,
    });

    return {
      messages: [failureMessage],
      reviewReport: failureMessage.content as string,
      reviewApproved: false,
      reviewIterations: iteration,
    };
  }

  console.log("\n[Reviewer] Tool calls:", response.tool_calls);

  const aiMessage = new AIMessage({
    content: typeof response.content === "string" ? response.content : "",
    tool_calls: response.tool_calls,
    additional_kwargs: response.additional_kwargs,
    response_metadata: response.response_metadata,
  });

  const reportText = typeof response.content === "string" ? response.content : "";

  return {
    messages: [aiMessage],
    reviewReport: reportText,
    reviewApproved: parseVerdict(reportText),
    reviewIterations: iteration,
  };
}
