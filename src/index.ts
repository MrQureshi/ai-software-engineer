import fs from "fs";
import path from "path";
import readline from "readline";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { softwareEngineer } from "./graph.js";

// Silence the built-in `punycode` deprecation warning triggered by an old
// transitive dependency (groq-sdk -> node-fetch@2 -> whatwg-url@5).
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "DeprecationWarning" && warning.message.includes("punycode")) {
    return;
  }
  console.warn(warning);
});

marked.use(markedTerminal() as Parameters<typeof marked.use>[0]);

const userRequest = await new Promise<string>((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("What would you like to build? ", (answer) => {
    rl.close();
    resolve(answer.trim());
  });
});

const result = await softwareEngineer.invoke({ userRequest });

// --- console output ---

console.log("\n====================");
console.log("IMPLEMENTATION PLAN");
console.log("====================\n");

result.plan.forEach((task: string, index: number) => {
  console.log(`${index + 1}. ${task}`);
});

console.log("\n====================");
console.log("CODE ANALYSIS");
console.log("====================\n");

console.log(marked(result.codeAnalysis));

// --- save reports ---

const stopWords = new Set(["add", "a", "an", "the", "to", "my", "your", "our", "in", "on", "for", "of", "with", "and", "or"]);

const topic = userRequest
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, "")
  .trim()
  .split(/\s+/)
  .filter((word) => !stopWords.has(word))
  .slice(0, 4)
  .join("-");

const planDir = path.resolve("reports/plan");
const analysisDir = path.resolve("reports/codeAnalysis");

fs.mkdirSync(planDir, { recursive: true });
fs.mkdirSync(analysisDir, { recursive: true });

function nextSequenceNumber(...dirs: string[]): number {
  let highest = 0;

  for (const dir of dirs) {
    for (const entry of fs.readdirSync(dir)) {
      const match = entry.match(/^(\d+)-/);
      if (match) {
        highest = Math.max(highest, Number(match[1]));
      }
    }
  }

  return highest + 1;
}

const sequence = String(nextSequenceNumber(planDir, analysisDir)).padStart(2, "0");
const reportName = `${sequence}-${topic}.md`;

const planContent = `# IMPLEMENTATION PLAN\n\n${result.plan.map((task: string, i: number) => `${i + 1}. ${task}`).join("\n")}\n`;
fs.writeFileSync(path.join(planDir, reportName), planContent);

fs.writeFileSync(path.join(analysisDir, reportName), `# CODE ANALYSIS\n\n${result.codeAnalysis}\n`);

console.log(`\nReports saved:\n  reports/plan/${reportName}\n  reports/codeAnalysis/${reportName}`);
