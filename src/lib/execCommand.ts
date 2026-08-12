import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const COMMAND_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 8_000;

export interface CommandResult {
  exitCode: number | "unknown";
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output;

  return `${output.slice(0, MAX_OUTPUT_LENGTH)}\n...output truncated (${
    output.length - MAX_OUTPUT_LENGTH
  } more characters)`;
}

export async function execShellCommand(command: string): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });

    return { exitCode: 0, timedOut: false, stdout, stderr };
  } catch (error) {
    const execError = error as {
      code?: number;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
      message: string;
    };

    if (execError.killed) {
      return {
        exitCode: "unknown",
        timedOut: true,
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
      };
    }

    return {
      exitCode: execError.code ?? "unknown",
      timedOut: false,
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? execError.message,
    };
  }
}

export async function getPackageScript(name: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };

    return pkg.scripts?.[name];
  } catch {
    return undefined;
  }
}

export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(process.cwd(), relativePath));
    return true;
  } catch {
    return false;
  }
}
