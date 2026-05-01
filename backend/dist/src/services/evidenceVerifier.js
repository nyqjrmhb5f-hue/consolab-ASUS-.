import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { consoleLabPath } from "./consoleLabPaths.js";
import { getAttestationConfig, loadSigningKeyPair, verifyAttestationSignature } from "./evidenceAttestation.js";

const evidenceRoot = consoleLabPath("04_EVIDENCE_ROOM");

const evidenceFiles = {
  runtime_journals: path.join(evidenceRoot, "runtime_journals", "events.jsonl"),
  tx_hashes: path.join(evidenceRoot, "tx_hashes", "events.jsonl"),
  attestations: path.join(evidenceRoot, "attestations", "events.jsonl"),
  signer_events: path.join(evidenceRoot, "signer_events", "events.jsonl"),
  audit_trails: path.join(evidenceRoot, "audit_trails", "events.jsonl"),
  actions: path.join(evidenceRoot, "actions", "events.jsonl")
};

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function readJsonlAll(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = await fsp.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => safeParseJson(line))
    .filter(Boolean);
}

async function readJsonlTail(filePath, limit = 5) {
  const rows = await readJsonlAll(filePath);
  return rows.slice(-limit).reverse();
}

function summarizeStatus(value) {
  if (!value) return "unknown";
  if (value === "signed") return "attested";
  if (value === "pending_activation") return "ready_not_armed";
  if (value === "pending_key_configuration") return "integrity_only";
  if (value === "activation_blocked") return "activation_blocked";
  if (value === "verify_error") return "verify_error";
  if (value === "sign_error") return "sign_error";
  return String(value);
}

export async function getEvidenceStatus() {
  const [runtimeEvents, txHashes, attestations, signerEvents, auditTrails, actions] = await Promise.all(
    Object.values(evidenceFiles).map((filePath) => readJsonlAll(filePath))
  );

  const latestSigner = signerEvents.at(-1) || null;
  const attestationConfig = await getAttestationConfig();
  const signerLoad = attestationConfig.private_key_configured
    ? await loadSigningKeyPair()
    : null;
  const signerLoaded = signerLoad?.ok === true;

  const status = attestationConfig.is_required
    ? (signerLoaded ? "attestation_enforced" : "attestation_blocked")
    : (attestationConfig.private_key_configured ? (signerLoaded ? "attestation_ready" : "activation_blocked") : "integrity_only");

  return {
    timestamp: new Date().toISOString(),
    room: "04_EVIDENCE_ROOM",
    status,
    signing: {
      mode: attestationConfig.mode,
      signing_key_id: attestationConfig.signing_key_id,
      key_configured: attestationConfig.private_key_configured,
      verification_key_configured: attestationConfig.verification_key_configured,
      signer_loaded: signerLoaded,
      signer_load_error: signerLoad?.ok === false ? signerLoad.load_error || signerLoad.error || null : null,
      latest_signer_state: latestSigner?.attestation_state || "unknown",
      latest_signer_summary: summarizeStatus(latestSigner?.attestation_state || ""),
      latest_verification_state: latestSigner?.verification_state || "unknown"
    },
    counts: {
      runtime_journals: runtimeEvents.length,
      tx_hashes: txHashes.length,
      attestations: attestations.length,
      signer_events: signerEvents.length,
      audit_trails: auditTrails.length,
      actions: actions.length
    },
    latest: {
      runtime_journal: runtimeEvents.at(-1) || null,
      tx_hash: txHashes.at(-1) || null,
      signer_event: latestSigner,
      attestation: attestations.at(-1) || null
    },
    paths: evidenceFiles
  };
}

export async function getEvidenceRecord(id) {
  const query = String(id || "").trim();
  if (!query) {
    return null;
  }

  const [runtimeEvents, txHashes, attestations, signerEvents, auditTrails, actions] = await Promise.all(
    Object.values(evidenceFiles).map((filePath) => readJsonlAll(filePath))
  );

  const matchByRecord = (record) =>
    record?.event_id === query ||
    record?.tx_hash === query ||
    record?.entry?.event_id === query ||
    record?.entry?.tx_hash === query;

  const payload = {
    timestamp: new Date().toISOString(),
    query,
    found: false,
    runtime_journals: runtimeEvents.filter(matchByRecord).slice(-5).reverse(),
    tx_hashes: txHashes.filter(matchByRecord).slice(-5).reverse(),
    attestations: attestations.filter(matchByRecord).slice(-5).reverse(),
    signer_events: signerEvents.filter(matchByRecord).slice(-5).reverse(),
    audit_trails: auditTrails.filter(matchByRecord).slice(-5).reverse(),
    actions: actions.filter(matchByRecord).slice(-5).reverse()
  };

  payload.found = Object.values(payload).some(
    (value) => Array.isArray(value) && value.length > 0
  );

  return payload.found ? payload : null;
}

export async function verifyEvidenceHash(hash) {
  const query = String(hash || "").trim();
  if (!query) {
    return {
      timestamp: new Date().toISOString(),
      tx_hash: query,
      found: false,
      verification: "missing_hash"
    };
  }

  const [txHashes, signerEvents, attestations, runtimeEvents] = await Promise.all([
    readJsonlAll(evidenceFiles.tx_hashes),
    readJsonlAll(evidenceFiles.signer_events),
    readJsonlAll(evidenceFiles.attestations),
    readJsonlAll(evidenceFiles.runtime_journals)
  ]);

  const matchedHashes = txHashes.filter((record) => record?.tx_hash === query);
  const relatedSignerEvents = signerEvents.filter((record) => record?.tx_hash === query);
  const relatedAttestations = attestations.filter((record) => record?.tx_hash === query);
  const relatedRuntime = runtimeEvents.filter((record) => record?.tx_hash === query);

  const latestSigner = relatedSignerEvents.at(-1) || null;
  const verificationResults = await Promise.all(
    relatedAttestations.slice(-5).map((attestation) => verifyAttestationSignature(attestation))
  );
  const verifiedAttestation = verificationResults.some((result) => result.ok);
  const attested = relatedAttestations.length > 0 || latestSigner?.attestation_state === "signed";

  return {
    timestamp: new Date().toISOString(),
    tx_hash: query,
    found: matchedHashes.length > 0,
    verification: matchedHashes.length > 0
      ? (verifiedAttestation ? "integrity_and_attestation_verified" : attested ? "integrity_and_attestation_unverified" : "integrity_only")
      : "not_found",
    attested,
    signature_verified: verifiedAttestation,
    signer_state: latestSigner?.attestation_state || null,
    tx_records: matchedHashes.slice(-5).reverse(),
    runtime_records: relatedRuntime.slice(-3).reverse(),
    signer_events: relatedSignerEvents.slice(-5).reverse(),
    attestations: relatedAttestations.slice(-5).reverse(),
    verification_results: verificationResults.reverse()
  };
}

export async function verifyEvidenceAttestation(id) {
  const record = await getEvidenceRecord(id);
  if (!record) {
    return null;
  }

  const targetAttestation = record.attestations[0] || null;
  if (!targetAttestation) {
    return {
      timestamp: new Date().toISOString(),
      query: id,
      found: true,
      attestation_present: false,
      verification: "no_attestation"
    };
  }

  const verification = await verifyAttestationSignature(targetAttestation);

  return {
    timestamp: new Date().toISOString(),
    query: id,
    found: true,
    attestation_present: true,
    verification: verification.verification,
    ok: verification.ok,
    signing_key_id: targetAttestation.signing_key_id || null,
    tx_hash: targetAttestation.tx_hash || null,
    event_id: targetAttestation.event_id || null,
    attestation_state: "signed",
    verification_state: targetAttestation.verification_state || null
  };
}

export async function getEvidenceTail(limit = 8) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 25));
  const [runtime, txHashes, signerEvents] = await Promise.all([
    readJsonlTail(evidenceFiles.runtime_journals, safeLimit),
    readJsonlTail(evidenceFiles.tx_hashes, safeLimit),
    readJsonlTail(evidenceFiles.signer_events, safeLimit)
  ]);

  return {
    timestamp: new Date().toISOString(),
    runtime_journals: runtime,
    tx_hashes: txHashes,
    signer_events: signerEvents
  };
}
