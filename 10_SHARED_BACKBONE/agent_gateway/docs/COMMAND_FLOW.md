# Command Flow

1. `OMNI-SURFACE` translates human intent into a command envelope.
2. `GATEWAY-API` validates and stages the envelope.
3. `GATEWAY-API` classifies the command using `command-classes.v1`.
4. `GATEWAY-API` assigns `command_hash`, `idempotency_key`, and `correlation_id`.
5. `AGENT-GATEWAY` records the session receipt.
6. `OPS-MATRIX` receives the job in `03_OPERATIONS_ROOM/jobs/intake`.
7. High-risk actions stop in `01_EXECUTIVE/approvals/pending`.
8. Tunnel-sensitive actions also stop in `07_INTELLIGENCE_TUNNEL/approvals`.

## Ledgers

- `command_intake.jsonl` = ingress and approval-facing lifecycle
- `command_execution.jsonl` = dispatch, execution, sealing, and failure lifecycle
- `command_state_index.json` = latest projected state by tracking id

## Proof Contract

- `proof_contract_version = proof-refs.v1`
- `approval_ref` binds approved commands to approval artifacts
- `execution_ref` binds executed commands to runtime execution artifacts
- `rollback_ref` binds rolled-back commands to rollback artifacts
- `evidence_ref` binds sealed commands to Evidence Room proof
- `signature_ref` binds attested sealed commands to a signature artifact when signing is armed

## State Machine

- `received -> validated`
- `validated -> staged | pending_approval | rejected`
- `pending_approval -> pending_approval | approved | rejected`
- `approved -> dispatched`
- `staged -> dispatched`
- `dispatched -> executed | failed`
- `executed -> sealed`
- `sealed -> attested_sealed`
- `failed -> rolled_back | rejected`

Terminal lifecycle states:

- `sealed`
- `attested_sealed`
- `rejected`
- `failed`
- `rolled_back`

## Control States

- `accepted` = staged, no approval required
- `pending_approval` = staged, blocked on approval scopes
- `rejected` = invalid or idempotency-conflicted
- `sealed` = executed and evidence-linked

## Command Classes

- `standard`
- `sensitive`
- `high_risk`
- `tunnel`
- `runtime_mutation`
- `evidence_only`

The policy source of truth is:

- `/home/t79/consolelab/10_SHARED_BACKBONE/gateway_api/policies/command-classes.v1.json`
- `GET /api/gateway-api/policies/command-classes`
