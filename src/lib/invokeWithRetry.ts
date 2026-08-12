import { HumanMessage, type BaseMessage } from "@langchain/core/messages";

/**
 * Groq rejects a tool call before it ever reaches our tool code when the
 * model supplies arguments that don't match the tool's schema (extra
 * fields, wrong types, an unknown tool name). That surfaces as a thrown
 * BadRequestError from the SDK rather than a normal model response, so it
 * can't be handled by the ToolNode's ordinary error-as-tool-result
 * pattern. This narrows that specific, recoverable case; anything else
 * (auth failure, network error, rate limit) is left to propagate.
 */
export function describeToolCallError(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const err = error as {
    status?: number;
    error?: { error?: { message?: string; code?: string } };
  };

  if (err.status !== 400) return undefined;

  const message = err.error?.error?.message;
  const code = err.error?.error?.code;

  if (!message) return undefined;
  if (code !== "tool_use_failed" && !message.toLowerCase().includes("tool call")) {
    return undefined;
  }

  return message;
}

/**
 * Retries a model invocation a bounded number of times when the provider
 * rejects a tool call for schema-validation reasons, feeding a corrective
 * message back to the model each time. Any other error (or a
 * still-invalid call after the last retry) propagates to the caller
 * instead of being retried indefinitely.
 */
export async function invokeWithRetry<TResponse>(
  invoke: (messages: BaseMessage[]) => Promise<TResponse>,
  messages: BaseMessage[],
  { maxRetries, logPrefix }: { maxRetries: number; logPrefix: string },
): Promise<TResponse> {
  let currentMessages = messages;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await invoke(currentMessages);
    } catch (error) {
      const description = describeToolCallError(error);

      if (!description || attempt === maxRetries) {
        throw error;
      }

      console.warn(
        `\n${logPrefix} Invalid tool call from model (attempt ${attempt + 1}/${maxRetries}): ${description}`,
      );

      currentMessages = [
        ...currentMessages,
        new HumanMessage(
          `Your previous tool call was invalid: ${description}. Retry with arguments that match the tool's schema exactly (only the documented fields, correct types), or answer without using a tool.`,
        ),
      ];
    }
  }

  throw new Error("unreachable");
}
