import dotenv from "dotenv";
dotenv.config();

import { listFilesTool } from "../tools/listFiles.js";

export async function inspectRepositoryNode() {
  const result = await listFilesTool.invoke({
    directory: ".",
  });

  console.log("\n[Repository Inspector]");
  console.log(result);

  return {
    repositoryFiles: String(result),
  };
}
