import type { SoftwareEngineerStateType } from "../agents/softwareEngineer.js";
import { createModel } from "../lib/model.js";

import dotenv from "dotenv";

dotenv.config();

const model = createModel();

export async function plannerNode(state: SoftwareEngineerStateType) {
  const response = await model.invoke([
    {
      role: "system",
      content: `
You are a senior software engineering planner.

Analyze the user's software request and create
a clear implementation plan.

Return ONLY a numbered list of tasks.
`,
    },
    {
      role: "user",
      content: state.userRequest,
    },
  ]);

  const content = String(response.content);

  const plan = content
    .split("\n")
    .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter(Boolean);

  return {
    plan,
  };
}
