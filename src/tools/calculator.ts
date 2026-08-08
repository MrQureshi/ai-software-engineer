import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const calculatorTool = tool(
  async ({ a, b, operation }) => {
    switch (operation) {
      case "add":
        return a + b;

      case "subtract":
        return a - b;

      case "multiply":
        return a * b;

      case "divide":
        if (b === 0) {
          throw new Error("Cannot divide by zero");
        }

        return a / b;

      default:
        throw new Error("Unsupported operation");
    }
  },
  {
    name: "calculator",
    description: "Perform basic mathematical calculations between two numbers.",
    schema: z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
      operation: z
        .enum(["add", "subtract", "multiply", "divide"])
        .describe("Mathematical operation to perform"),
    }),
  },
);
