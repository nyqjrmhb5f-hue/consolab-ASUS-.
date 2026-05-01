import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export async function getTeamRoom() {
  const filePath = path.join(config.docsDir, "team-room.md");
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { content };
  } catch (error) {
    const message = error && typeof error.message === "string" ? error.message : "read_failed";
    return {
      content: [
        "# Team Room",
        "",
        "team-room.md is missing or unreadable.",
        `path: ${filePath}`,
        `error: ${message}`,
        "",
        "To generate it:",
        "  node /home/t79/vyrdon/consolelab/scripts/update-team-room.mjs"
      ].join("\n")
    };
  }
}
