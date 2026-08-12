import { searchCodeTool } from "../../src/tools/searchCode.js";

function parseArgs(argv: string[]) {
  const [query, directory, filePattern, caseSensitiveFlag] = argv;

  if (!query || !directory) {
    console.error(
      "Usage: npx tsx test/search-code/run-search-code.mts <query> <directory> [filePattern] [caseSensitive:true|false]",
    );
    process.exit(1);
  }

  return {
    query,
    directory,
    filePattern: filePattern || undefined,
    caseSensitive: caseSensitiveFlag === "true",
  };
}

const args = parseArgs(process.argv.slice(2));

const result = await searchCodeTool.invoke(args);

console.log(result);
