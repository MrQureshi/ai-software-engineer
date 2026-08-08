import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getTimeTool = tool(
  async ({ timeZone }) => {
    const date = new Date();

    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "full",
      timeStyle: "long",
    }).format(date);
  },
  {
    name: "get_current_time",
    description: "Get the current date and time for a specific IANA time zone.",
    schema: z.object({
      timeZone: z
        .string()
        .describe(
          "IANA time zone, for example Asia/Karachi, America/New_York, or Europe/London",
        ),
    }),
  },
);
