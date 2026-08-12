import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writeFileTool } from "../../src/tools/writeFile.js";
import { editFileTool } from "../../src/tools/editFile.js";

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
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "write-edit-test-"));

  try {
    // Step 1 — write_file creates a new file, including missing parent dirs
    const nestedPath = path.join(testDir, "nested", "dir", "hello.txt");
    const r1 = await writeFileTool.invoke({
      path: nestedPath,
      content: "line one\nline two\n",
    });
    check("write_file creates nested file", r1.startsWith("Wrote "), r1);
    const nestedContent = await fs.readFile(nestedPath, "utf-8");
    check(
      "written content matches",
      nestedContent === "line one\nline two\n",
      nestedContent,
    );

    // Step 2 — write_file overwrites an existing file
    const r2 = await writeFileTool.invoke({
      path: nestedPath,
      content: "overwritten\n",
    });
    check("write_file overwrites existing file", r2.startsWith("Wrote "), r2);
    const overwrittenContent = await fs.readFile(nestedPath, "utf-8");
    check(
      "overwritten content matches",
      overwrittenContent === "overwritten\n",
      overwrittenContent,
    );

    // Step 3 — edit_file succeeds on a unique match
    const r3 = await editFileTool.invoke({
      path: nestedPath,
      oldString: "overwritten",
      newString: "edited successfully",
    });
    check("edit_file succeeds on unique match", r3 === `Edited ${nestedPath}`, r3);
    const editedContent = await fs.readFile(nestedPath, "utf-8");
    check(
      "edited content matches",
      editedContent === "edited successfully\n",
      editedContent,
    );

    // Step 4 — edit_file fails cleanly on zero matches, file untouched
    const r4 = await editFileTool.invoke({
      path: nestedPath,
      oldString: "this text does not exist",
      newString: "x",
    });
    check(
      "edit_file reports zero matches",
      r4.includes("was not found"),
      r4,
    );
    const unchangedAfterZeroMatch = await fs.readFile(nestedPath, "utf-8");
    check(
      "file unchanged after zero-match edit",
      unchangedAfterZeroMatch === editedContent,
    );

    // Step 5 — edit_file refuses an ambiguous match, file untouched
    const dupPath = path.join(testDir, "dup.txt");
    await writeFileTool.invoke({ path: dupPath, content: "foo\nfoo\nfoo\n" });
    const r5 = await editFileTool.invoke({
      path: dupPath,
      oldString: "foo",
      newString: "bar",
    });
    check(
      "edit_file reports ambiguous match",
      r5.includes("3 locations"),
      r5,
    );
    const unchangedAfterAmbiguous = await fs.readFile(dupPath, "utf-8");
    check(
      "file unchanged after ambiguous-match edit",
      unchangedAfterAmbiguous === "foo\nfoo\nfoo\n",
      unchangedAfterAmbiguous,
    );

    // Step 6 — edit_file on a nonexistent file fails cleanly
    const missingPath = path.join(testDir, "does-not-exist.txt");
    const r6 = await editFileTool.invoke({
      path: missingPath,
      oldString: "x",
      newString: "y",
    });
    check(
      "edit_file reports missing file",
      r6.startsWith("Failed to read file"),
      r6,
    );
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
