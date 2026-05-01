import { config } from "../config.js";
import { runCommand } from "./command.js";

export async function runDellCommand(remoteCommand, options = {}) {
  if (config.dell.useLocal) {
    return runCommand("bash", ["-lc", remoteCommand], options);
  }

  const args = [];
  args.push("-o", "BatchMode=yes");
  args.push("-o", `ConnectTimeout=${config.dell.connectTimeout}`);
  if (config.dell.identityFile) {
    args.push("-i", config.dell.identityFile);
    args.push("-o", "IdentitiesOnly=yes");
  }
  if (config.dell.knownHosts) {
    args.push("-o", "StrictHostKeyChecking=yes");
    args.push("-o", `UserKnownHostsFile=${config.dell.knownHosts}`);
  }
  if (config.dell.port) {
    args.push("-p", String(config.dell.port));
  }
  args.push(`${config.dell.user}@${config.dell.host}`);
  args.push(remoteCommand);

  return runCommand("ssh", args, options);
}
