import { runCommandTool } from "../../src/tools/runCommand.js";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`PASS - ${label}`);
    passed++;
  } else {
    console.log(`FAIL - ${label}${detail ? ` (${detail})` : ""}`);
    failed++;
  }
}

async function main() {
  // Step 1 — a successful command reports exit code 0 and captures stdout
  const r1 = await runCommandTool.invoke({ command: "echo hello-world" });
  check("successful command reports exit code 0", r1.startsWith("Exit code: 0"), r1);
  check("successful command captures stdout", r1.includes("hello-world"), r1);

  // Step 2 — a failing command reports its actual (non-zero) exit code
  const r2 = await runCommandTool.invoke({
    command: 'node -e "process.exit(3)"',
  });
  check("failing command reports exit code 3", r2.includes("Exit code: 3"), r2);

  // Step 3 — stderr is captured on failure
  const r3 = await runCommandTool.invoke({
    command: 'node -e "console.error(\'boom\'); process.exit(1)"',
  });
  check("failing command reports exit code 1", r3.includes("Exit code: 1"), r3);
  check("stderr is captured", r3.includes("boom"), r3);

  // Step 4 — a command that doesn't exist fails gracefully, does not throw
  const r4 = await runCommandTool.invoke({
    command: "definitely-not-a-real-command-xyz",
  });
  check(
    "nonexistent command fails gracefully rather than throwing",
    r4.startsWith("Exit code:"),
    r4,
  );

  // Step 5 — commands run in the repository root, not some other cwd
  const r5 = await runCommandTool.invoke({ command: "pwd" });
  check("command runs in the repository root", r5.includes(process.cwd()), r5);

  // Step 6 — long output is truncated rather than returned unbounded
  const r6 = await runCommandTool.invoke({
    command: "node -e \"console.log('x'.repeat(20000))\"",
  });
  check(
    "long output is truncated",
    r6.includes("output truncated") && r6.length < 20000,
    `length=${r6.length}`,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
