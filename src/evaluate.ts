import dotenv from "dotenv";
dotenv.config();

import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";

import { softwareEngineer, RECURSION_LIMIT } from "./graph.js";
import { evaluators } from "./lib/evaluators.js";

const DATASET_NAME = "ai-software-engineer";

const EXAMPLES: { userRequest: string }[] = [
  {
    userRequest:
      "Add a one-line comment above the formatBytes function in src/tools/formatBytes.ts explaining what unit system it uses.",
  },
  {
    userRequest:
      "Create a new utility file src/tools/pluralize.ts that exports a pluralize function converting a singular English word to its plural form for the common case of just adding 's'.",
  },
];

async function ensureDataset(client: Client): Promise<void> {
  const exists = await client.hasDataset({ datasetName: DATASET_NAME });
  if (exists) return;

  console.log(`[Evaluate] Creating dataset "${DATASET_NAME}" with ${EXAMPLES.length} example(s)...`);

  const dataset = await client.createDataset(DATASET_NAME, {
    description: "Requests exercised against the Software Engineer Agent's full graph.",
  });

  await client.createExamples(
    EXAMPLES.map((example) => ({
      dataset_id: dataset.id,
      inputs: example,
    })),
  );
}

async function main() {
  const hasApiKey =
    process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY;

  if (!hasApiKey) {
    console.error(
      "\nLANGSMITH_API_KEY (or LANGCHAIN_API_KEY) is not set. " +
        "Evaluation requires a LangSmith account — see docs/20-langsmith-spec.md. " +
        "Set it in .env and try again.",
    );
    process.exit(1);
  }

  const client = new Client();

  await ensureDataset(client);

  await evaluate(
    async (input: { userRequest: string }) =>
      softwareEngineer.invoke(
        { userRequest: input.userRequest },
        { recursionLimit: RECURSION_LIMIT },
      ),
    {
      data: DATASET_NAME,
      evaluators,
      experimentPrefix: "software-engineer-agent",
      client,
    },
  );

  console.log("\n[Evaluate] Done — see the LangSmith UI for results.");
}

main();
