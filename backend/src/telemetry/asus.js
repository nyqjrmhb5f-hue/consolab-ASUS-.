import { getAsusxStatus } from "../services/asusxAttestation.js";

export async function getAsusStatus() {
  const result = await getAsusxStatus();

  if (!result.ok) {
    return {
      machine: "ASUS",
      status: "unreachable",
      systemState: "unknown",
      attestation: "UNREACHABLE",
      error: result.error || result.data
    };
  }

  return {
    machine: "ASUS",
    status: "authority",
    systemState: result.data?.status || "ok",
    attestation: result.data?.attestation || "READY",
    payload: result.data
  };
}
