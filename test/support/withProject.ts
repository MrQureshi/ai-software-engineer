import fs from "node:fs/promises";
import path from "node:path";

import { execShellCommand } from "../../src/lib/execCommand.js";

/**
 * Every tool/node under test resolves paths off process.cwd() (matching
 * how they always inspect the real project root in production, never a
 * caller-supplied directory), so exercising different package.json/
 * tsconfig.json scenarios means actually chdir-ing into a fixture
 * project — not just passing a directory argument.
 *
 * The fixture is created *inside* the caller-supplied baseDir (a test
 * folder under this project, not os.tmpdir()) so `npx tsc` resolves
 * this project's own local `typescript` via ancestor node_modules
 * resolution, instead of trying to install one from the network for an
 * isolated temp directory.
 */
export async function withProject(
  baseDir: string,
  files: Record<string, string>,
  fn: () => Promise<void>,
) {
  const dir = await fs.mkdtemp(path.join(baseDir, ".tmp-fixture-"));
  const originalCwd = process.cwd();

  try {
    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(dir, relPath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf-8");
    }

    process.chdir(dir);
    await fn();
  } finally {
    process.chdir(originalCwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export function packageJson(scripts: Record<string, string>): string {
  return JSON.stringify({ name: "fixture", version: "1.0.0", scripts }, null, 2);
}

/**
 * Initializes and commits an initial state in the *current* directory
 * (call after `withProject` has already `chdir`'d into the fixture).
 * Local config (email/name) is set on the fixture repo only — this
 * never touches the caller's real git identity.
 */
export async function initGitRepo() {
  await execShellCommand("git init -q");
  await execShellCommand('git config user.email "fixture@example.com"');
  await execShellCommand('git config user.name "Fixture"');
  await execShellCommand("git add -A");
  await execShellCommand('git commit -q -m "initial"');
}
