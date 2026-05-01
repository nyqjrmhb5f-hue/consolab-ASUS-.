# LEDGERD

Evidence hashing, journaling, and optional attestation engine.

Current live behavior:
- hashes canonical runtime events into `04_EVIDENCE_ROOM/tx_hashes`
- mirrors append-only journals into `04_EVIDENCE_ROOM/runtime_journals`
- records signer events into `04_EVIDENCE_ROOM/signer_events`

Attestations become active only when the trust layer is explicitly armed:
- `CONSOLELAB_EVIDENCE_ATTESTATION_MODE=required`
- `CONSOLELAB_EVIDENCE_SIGNING_KEY_ID`
- `CONSOLELAB_EVIDENCE_PRIVATE_KEY_PATH` or `CONSOLELAB_EVIDENCE_SIGNING_PRIVATE_KEY_PATH`, or inline `CONSOLELAB_EVIDENCE_PRIVATE_KEY`
- optional verifier override: `CONSOLELAB_EVIDENCE_PUBLIC_KEY_PATH` or `CONSOLELAB_EVIDENCE_SIGNING_PUBLIC_KEY_PATH`, or inline `CONSOLELAB_EVIDENCE_PUBLIC_KEY`

When attestation mode is not `required`, the system remains `integrity_only` or `attestation_ready` and does not promote commands to `attested_sealed`.
