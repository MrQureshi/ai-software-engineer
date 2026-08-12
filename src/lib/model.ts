import { ChatGroq } from "@langchain/groq";

/**
 * Single source of truth for the model every model-loop node (Planner,
 * Code Analyst, Implementation Agent, Debugger, Reviewer) constructs —
 * previously five identical copies of the same ChatGroq config, one
 * per node file, with nothing to keep them in sync if one drifted.
 */
export function createModel(): ChatGroq {
  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-120b",
    temperature: 0,
  });
}
