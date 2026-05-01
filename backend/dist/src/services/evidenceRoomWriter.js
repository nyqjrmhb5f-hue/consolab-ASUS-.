import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { consoleLabPath } from "./consoleLabPaths.js";
import { buildAttestationPayload, getAttestationConfig, signAttestationPayload, stableStringify } from "./evidenceAttestation.js";

const evidenceRoomRoot = consoleLabPath("04_EVIDENCE_ROOM");

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])])
    );
  }

  return value;
}

async function appendJsonl(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function makeHash(content, salt = "") {
  return crypto.createHash("sha256").update(`${content}${salt}`).digest("hex");
}

async function buildAttestation(canonical, txHash, eventId, timestamp) {
  const config = await getAttestationConfig();
  const payload = buildAttestationPayload({
    event_id: eventId,
    tx_hash: txHash,
    created_at: timestamp,
    hash_algorithm: "sha256"
  });

  if (config.mode !== "required") {
    return {
      signing_key_id: config.signing_key_id,
      attestation_state: config.private_key_configured ? "pending_activation" : "pending_key_configuration",
      verification_state: "inactive",
      attestation_payload: payload
    };
  }

  if (!config.is_ready) {
    return {
      signing_key_id: config.signing_key_id,
      attestation_state: "activation_blocked",
      verification_state: "inactive",
      attestation_payload: payload
    };
  }

  try {
    const signed = await signAttestationPayload(payload);
    if (!signed.ok) {
      return {
        signing_key_id: signed.signing_key_id || config.signing_key_id,
        attestation_state: signed.verification_state === "verify_error" ? "verify_error" : "sign_error",
        verification_state: signed.verification_state,
        error: signed.error || "signature_verification_failed",
        attestation_payload: payload
      };
    }

    const attestation = {
      event_id: eventId,
      tx_hash: txHash,
      signature: signed.signature,
      signing_key_id: signed.signing_key_id,
      key_type: signed.key_type,
      created_at: timestamp,
      hash_algorithm: "sha256",
      verification_state: signed.verification_state,
      attestation_payload: payload
    };

    await appendJsonl(path.join(evidenceRoomRoot, "attestations", "events.jsonl"), attestation);

    return {
      signing_key_id: signed.signing_key_id,
      attestation_state: "signed",
      key_type: signed.key_type,
      verification_state: signed.verification_state,
      attestation_payload: payload
    };
  } catch (error) {
    return {
      signing_key_id: config.signing_key_id,
      attestation_state: "sign_error",
      verification_state: "sign_error",
      error: error.message,
      attestation_payload: payload
    };
  }
}

export async function mirrorEvidenceEvent(entry) {
  const canonical = stableStringify(entry);
  const salt = process.env.CONSOLELAB_EVIDENCE_SALT || "";
  const txHash = makeHash(canonical, salt);
  const eventId = `${String(entry.timestamp || new Date().toISOString()).replace(/[^0-9TZ]/g, "")}-${txHash.slice(0, 16)}`;
  const attestation = await buildAttestation(canonical, txHash, eventId, entry.timestamp);
  const artifactPaths = {
    runtime_journals: path.join(evidenceRoomRoot, "runtime_journals", "events.jsonl"),
    tx_hashes: path.join(evidenceRoomRoot, "tx_hashes", "events.jsonl"),
    actions: path.join(evidenceRoomRoot, "actions", "events.jsonl"),
    audit_trails: path.join(evidenceRoomRoot, "audit_trails", "events.jsonl"),
    signer_events: path.join(evidenceRoomRoot, "signer_events", "events.jsonl"),
    attestations:
      attestation.attestation_state === "signed"
        ? path.join(evidenceRoomRoot, "attestations", "events.jsonl")
        : null
  };

  await Promise.all([
    appendJsonl(artifactPaths.runtime_journals, {
      event_id: eventId,
      tx_hash: txHash,
      canonical,
      salt_mode: salt ? "configured" : "none",
      entry
    }),
    appendJsonl(artifactPaths.tx_hashes, {
      event_id: eventId,
      tx_hash: txHash,
      hash_algorithm: "sha256",
      hash_scope: "runtime_event",
      privacy_class: "internal",
      component: entry.component,
      action: entry.action,
      result: entry.result,
      created_at: entry.timestamp
    }),
    appendJsonl(artifactPaths.actions, {
      event_id: eventId,
      tx_hash: txHash,
      component: entry.component,
      action: entry.action,
      result: entry.result,
      source_ip: entry.source_ip,
      created_at: entry.timestamp
    }),
    appendJsonl(artifactPaths.audit_trails, {
      event_id: eventId,
      tx_hash: txHash,
      seal_id: entry.seal_id,
      component: entry.component,
      action: entry.action,
      result: entry.result,
      recorded_at: entry.timestamp
    }),
    appendJsonl(artifactPaths.signer_events, {
      event_id: eventId,
      tx_hash: txHash,
      signer_engine: "LEDGERD",
      signing_key_id: attestation.signing_key_id || null,
      attestation_state: attestation.attestation_state,
      verification_state: attestation.verification_state || null,
      key_type: attestation.key_type || null,
      error: attestation.error || null,
      recorded_at: entry.timestamp
    })
  ]);

  return {
    event_id: eventId,
    tx_hash: txHash,
    hash_algorithm: "sha256",
    attestation_state: attestation.attestation_state,
    verification_state: attestation.verification_state || null,
    signing_key_id: attestation.signing_key_id || null,
    key_type: attestation.key_type || null,
    recorded_at: entry.timestamp,
    artifact_paths: artifactPaths
  };
}
