# ConsoleLab Architecture

ConsoleLab is the system name for the room-based control surface rooted at `/home/t79/consolelab`.

- `kitty` is the cockpit shell.
- `zsh` is the central brain shell spine.
- `05_CENTRAL_BRAIN` is the command kernel.
- `10_SHARED_BACKBONE` is the ingress and agent transport layer.
- `04_EVIDENCE_ROOM` is the immutable proof vault.

The numbered room tree is the canonical architecture contract for ongoing modularization. Existing implementation code still lives in `backend/` and `frontend/`, and should migrate into room-owned modules in small patches instead of a single cutover.

## Room Summary

- `01_EXECUTIVE`: governance, approvals, mission, oversight
- `02_COMMERCIAL_ROOM`: pricing, contracts, subscriptions, promotions
- `03_OPERATIONS_ROOM`: jobs, queues, incidents, runtime control
- `04_EVIDENCE_ROOM`: hashes, attestations, proofs, audit trails
- `05_CENTRAL_BRAIN`: `CORE-PRIME`, `RAG`, `MEMORY`, `CHRONOS`, connector control
- `06_INTERFACES`: operator, customer, codex, schemas, sensory surfaces
- `07_INTELLIGENCE_TUNNEL`: SSH, relay, remote control, session control
- `09_DEPLOYMENT`: manifests, release, healthchecks, rollback
- `10_SHARED_BACKBONE`: gateway API, server, agent gateway

## Build Rules

- Keep changes modular and layered.
- Prefer narrow room ownership over mixed logic.
- Patch incrementally instead of bulk rewrites.
- Route critical actions through evidence references.
- Prefer signed identities and real connector auth over raw API keys.
