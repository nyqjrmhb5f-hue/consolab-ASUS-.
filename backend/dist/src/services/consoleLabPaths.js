import fs from "node:fs";
import path from "node:path";

const candidateRoots = [
  process.env.CONSOLELAB_ROOT,
  "/home/t79/consolelab",
  "/home/t79/vyrdon/consolelab"
].filter(Boolean);

function resolveConsoleLabRoot() {
  for (const candidate of candidateRoots) {
    try {
      if (fs.existsSync(candidate)) {
        return fs.realpathSync(candidate);
      }
    } catch {
      // Ignore invalid candidate and continue.
    }
  }

  return path.resolve(process.cwd(), "..");
}

export const consoleLabRoot = resolveConsoleLabRoot();

export function consoleLabPath(...segments) {
  return path.join(consoleLabRoot, ...segments);
}
