import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envFiles = [
  path.resolve(process.cwd(), ".env"),
  "/home/t79/ASUS/ASUSX/.secrets/consolelab.env",
  "/home/t79/vyrdon/consolelab/.env"
];

for (const filePath of envFiles) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

function valueOr(defaultValue, ...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return defaultValue;
}

function numberOr(defaultValue, value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const rootDir = valueOr("/home/t79/vyrdon/consolelab", process.env.CONSOLELAB_ROOT);
const keyDir = valueOr("/home/t79/ASUS/ASUSX/secure/keys", process.env.ASUSX_KEY_DIR);

export const config = {
  serviceName: "consolelab-authority",
  host: valueOr("127.0.0.1", process.env.CONSOLELAB_BIND_HOST, process.env.LAB_CONSOLE_HOST),
  port: numberOr(8080, process.env.CONSOLELAB_BIND_PORT || process.env.PORT),
  rootDir,
  keyDir,
  keyMetaFile: valueOr(path.join(keyDir, "keys.json"), process.env.ASUSX_KEY_META_FILE),
  signerRegistryFile: valueOr(
    "/home/t79/ASUS/ASUSX/secure/signer_registry/registry.json",
    process.env.ASUSX_SIGNER_REGISTRY_FILE
  ),
  evidence: {
    dir: valueOr(
      path.join(rootDir, "04_EVIDENCE_ROOM", "actions"),
      process.env.CONSOLELAB_EVIDENCE_DIR,
      process.env.CONSOLELAB_EVIDENCE_STORE_DIR
    ),
    file: valueOr(
      path.join(rootDir, "04_EVIDENCE_ROOM", "actions", "events.jsonl"),
      process.env.CONSOLELAB_EVIDENCE_FILE
    )
  },
  access: {
    serviceTokenId: valueOr("", process.env.CF_SERVICE_TOKEN_ID),
    serviceTokenSecret: valueOr("", process.env.CF_SERVICE_TOKEN_SECRET),
    serviceTokenIdPath: valueOr(
      path.join(rootDir, ".secrets", "access", "service-token-id"),
      process.env.CF_SERVICE_TOKEN_ID_PATH
    ),
    serviceTokenSecretPath: valueOr(
      path.join(rootDir, ".secrets", "access", "service-token-secret"),
      process.env.CF_SERVICE_TOKEN_SECRET_PATH
    ),
    teamDomain: valueOr("", process.env.CF_ACCESS_TEAM_DOMAIN),
    audience: valueOr("", process.env.CF_ACCESS_AUD)
  },
  http: {
    jsonLimit: valueOr("64kb", process.env.CONSOLELAB_JSON_LIMIT, process.env.LAB_CONSOLE_JSON_LIMIT),
    uiLogLimit: numberOr(12, process.env.CONSOLELAB_UI_LOG_LIMIT),
    statusLogLimit: numberOr(20, process.env.CONSOLELAB_STATUS_LOG_LIMIT),
    clockSkewSeconds: numberOr(300, process.env.CONSOLELAB_CLOCK_SKEW_SECONDS)
  },
  hostnames: {
    consolelab: valueOr("asus.consolelab.vyrdon.com", process.env.CONSOLELAB_HOSTNAME),
    sign: valueOr("sign.asusx.vyrdon.com", process.env.ASUS_SIGN_HOSTNAME),
    attest: valueOr("attest.asusx.vyrdon.com", process.env.ASUS_ATTEST_HOSTNAME)
  }
};
