import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runCommand(command, args = [], options = {}) {
  const { timeout = 5000, cwd = process.cwd() } = options;

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout,
      cwd,
      maxBuffer: 1024 * 1024
    });

    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      stdout: (error.stdout || "").trim(),
      stderr: (error.stderr || error.message || "").trim(),
      code: error.code ?? 1
    };
  }
}
