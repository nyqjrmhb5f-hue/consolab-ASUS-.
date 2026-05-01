# ConsoleLab File Contract Lock

Status: Locked
Date: 2026-04-03
Scope: Live command lanes and evidence lanes

## Frozen Live Lanes

The following paths are now contract-critical and must not drift in meaning:

- `/home/t79/consolelab/01_EXECUTIVE/approvals/pending`
- `/home/t79/consolelab/03_OPERATIONS_ROOM/jobs/intake`
- `/home/t79/consolelab/04_EVIDENCE_ROOM`
- `/home/t79/consolelab/07_INTELLIGENCE_TUNNEL/approvals`
- `/home/t79/consolelab/10_SHARED_BACKBONE/agent_gateway/sessions`
- `/home/t79/consolelab/10_SHARED_BACKBONE/agent_gateway/command_intake.jsonl`
- `/home/t79/consolelab/10_SHARED_BACKBONE/agent_gateway/command_execution.jsonl`
- `/home/t79/consolelab/10_SHARED_BACKBONE/agent_gateway/command_state_index.json`
- `/home/t79/consolelab/10_SHARED_BACKBONE/gateway_api/routes/idempotency`
- `/home/t79/consolelab/10_SHARED_BACKBONE/gateway_api/routes/correlation`

## Required Meanings

### `/01_EXECUTIVE/approvals/pending`

- high-risk requests waiting for governance sign-off
- no execution should bypass this lane when `executive` approval is required

### `/03_OPERATIONS_ROOM/jobs/intake`

- canonical intake queue for staged operational work
- every accepted or approval-pending command must be represented here before execution

### `/04_EVIDENCE_ROOM`

- append-only proof surface
- hashes, signer events, journals, audit trails, and attestations belong here
- evidence verification endpoints must read from this room as source of truth

### `/07_INTELLIGENCE_TUNNEL/approvals`

- tunnel-sensitive requests blocked pending tunnel authorization
- no staged remote tunnel should be considered active without passing this lane

### `/10_SHARED_BACKBONE/agent_gateway/sessions`

- canonical session receipt mirror for every command entering the gateway
- must include correlation and command identity fields

### `/10_SHARED_BACKBONE/agent_gateway/command_intake.jsonl`

- append-only ingress trail
- records `received`, `validated`, `staged`, `pending_approval`, and `approved`

### `/10_SHARED_BACKBONE/agent_gateway/command_execution.jsonl`

- append-only execution trail
- records `dispatched`, `executed`, `sealed`, `failed`, `rejected`, and future `rolled_back`

### `/10_SHARED_BACKBONE/agent_gateway/command_state_index.json`

- latest materialized command state by tracking id
- source of truth for fast `status` lookups without replaying both ledgers

### `/10_SHARED_BACKBONE/gateway_api/routes/idempotency`

- dedupe ledger for `idempotency_key`
- same key + same `command_hash` must replay safely
- same key + different `command_hash` must reject with conflict

### `/10_SHARED_BACKBONE/gateway_api/routes/correlation`

- correlation index for tracking related command activity
- must preserve command lineage even when retries or approvals occur

## Control-State Law

- `accepted` = staged, approval-free
- `pending_approval` = staged and blocked
- `rejected` = invalid or policy-denied
- `sealed` = executed with evidence-linked completion

## Lifecycle-State Law

- `received`
- `validated`
- `staged`
- `pending_approval`
- `approved`
- `dispatched`
- `executed`
- `sealed`
- `attested_sealed`
- `rejected`
- `rolled_back`
- `failed`

## Allowed Lifecycle Transitions

- `received -> validated`
- `validated -> staged | pending_approval | rejected`
- `pending_approval -> pending_approval | approved | rejected`
- `approved -> dispatched`
- `staged -> dispatched`
- `dispatched -> executed | failed`
- `executed -> sealed`
- `sealed -> attested_sealed`
- `failed -> rolled_back | rejected`

## Command-Class Law

Source of truth:

- `/home/t79/consolelab/10_SHARED_BACKBONE/gateway_api/policies/command-classes.v1.json`

Active classes:

- `standard`
- `sensitive`
- `high_risk`
- `tunnel`
- `runtime_mutation`
- `evidence_only`

Each class defines:

- approval scopes
- tunnel requirement
- evidence level
- execution timeout
- rollback requirement

## Proof-Ref Law

Proof contract version:

- `proof-refs.v1`

Evidence reference lanes:

- `/home/t79/consolelab/03_OPERATIONS_ROOM/evidence_refs/runtime`
- `/home/t79/consolelab/03_OPERATIONS_ROOM/evidence_refs/recovery`

Bound refs:

- `approval_ref`
- `execution_ref`
- `rollback_ref`
- `evidence_ref`
- `signature_ref`

Required invariants for `proof-refs.v1` commands:

- `sealed => evidence_ref exists`
- `attested_sealed => evidence_ref exists`
- `executed => execution_ref exists`
- `rolled_back => rollback_ref exists`
- `pending_approval => approval_scope or pending_approval_scopes exists`
- `approved => approval_ref exists`
- `attested_sealed => signature_ref exists`

Projection rule:

- proof refs must survive ledger replay and rebuild into `/home/t79/consolelab/10_SHARED_BACKBONE/agent_gateway/command_state_index.json`

## Enforcement Note

Future changes may extend these lanes, but must not silently repurpose them. Any semantic change to these paths requires an explicit contract update.
