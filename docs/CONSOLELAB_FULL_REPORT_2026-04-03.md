# ConsoleLab Full Report

Date: April 3, 2026
Location: `/home/t79/vyrdon/consolelab`
Canonical system name: `ConsoleLab`
Cockpit: `kitty`
Central brain shell: `zsh`

## Executive Summary

ConsoleLab is now operating as a room-based, layered, modular control surface with live backend and frontend paths, an evidence-linked command flow, a shared backbone, staged tunnel controls, Central Brain module visibility, and a dedicated live-TV wall.

The architecture is frozen around `ConsoleLab` only. Older labels such as `VYRDON`, `VYRDx`, and similar legacy naming are not used as active architecture labels in the live surface.

Current structural counts from the live registry:

- Rooms: `9`
- Engines: `19`
- Inter-room links: `14`
- MCP connector mode: `real_mcp_connectors`
- MCP connectors present in inventory: `5`

## Canonical Room Layout

Active room architecture:

- `01_EXECUTIVE`
- `02_COMMERCIAL_ROOM`
- `03_OPERATIONS_ROOM`
- `04_EVIDENCE_ROOM`
- `05_CENTRAL_BRAIN`
- `06_INTERFACES`
- `07_INTELLIGENCE_TUNNEL`
- `09_DEPLOYMENT`
- `10_SHARED_BACKBONE`

Primary engine mapping:

- `01_EXECUTIVE` -> `APEX-CONTROL`
- `02_COMMERCIAL_ROOM` -> `REVENUE-NEXUS`
- `03_OPERATIONS_ROOM` -> `OPS-MATRIX`
- `04_EVIDENCE_ROOM` <- served by `LEDGERD`
- `05_CENTRAL_BRAIN` -> `CORE-PRIME`
- `06_INTERFACES` -> `OMNI-SURFACE`
- `07_INTELLIGENCE_TUNNEL` -> `SYNAPSE-BRIDGE`
- `09_DEPLOYMENT` -> `LAUNCH-VECTOR`
- `10_SHARED_BACKBONE` -> `GATEWAY-API`

Additional active engines/modules registered:

- `PROMO-ARC`
- `SENTINEL`
- `BALANCE`
- `TREASURY`
- `CHRONOS`
- `MCP-BRAIN`
- `MEMORY`
- `RAG`
- `SERVER`
- `AGENT-GATEWAY`

## System Implementation Status

### 1. Kitty and Brain Shell

- `kitty` installed user-local and verified working
- path: `/home/t79/.local/bin/kitty`
- `kitten` verified
- `kitty +kitten ssh` verified
- `zsh` present and used as the canonical Central Brain shell path

### 2. Registry and Architecture Freeze

Implemented:

- canonical architecture doc
- room registry JSON
- topology model
- room state service
- live control surface routes

Key files:

- `/home/t79/vyrdon/consolelab/CONSOLELAB_ARCHITECTURE.md`
- `/home/t79/vyrdon/consolelab/05_CENTRAL_BRAIN/docs/room_registry.json`
- `/home/t79/vyrdon/consolelab/backend/src/services/roomRegistry.js`
- `/home/t79/vyrdon/consolelab/backend/src/services/roomState.js`

### 3. Evidence Engine and Immutable Room

Implemented:

- Evidence Room mirror from runtime events into `04_EVIDENCE_ROOM`
- SHA-256 hashing for event fingerprints
- runtime journals
- hash stream
- signer events
- audit trails

Evidence paths now active:

- `/home/t79/vyrdon/consolelab/04_EVIDENCE_ROOM/runtime_journals/events.jsonl`
- `/home/t79/vyrdon/consolelab/04_EVIDENCE_ROOM/tx_hashes/events.jsonl`
- `/home/t79/vyrdon/consolelab/04_EVIDENCE_ROOM/actions/events.jsonl`
- `/home/t79/vyrdon/consolelab/04_EVIDENCE_ROOM/audit_trails/events.jsonl`
- `/home/t79/vyrdon/consolelab/04_EVIDENCE_ROOM/signer_events/events.jsonl`

Important status:

- journaling is real
- hashing is real
- attestations are prepared but still waiting for a signing key configuration

### 4. Shared Backbone and Command Flow

Implemented:

- `GATEWAY-API` command intake
- command envelope schema path
- command staging into `03_OPERATIONS_ROOM`
- approval fan-out into `01_EXECUTIVE` and `07_INTELLIGENCE_TUNNEL`
- `AGENT-GATEWAY` session mirroring
- dispatch and workflow completion

Key files:

- `/home/t79/vyrdon/consolelab/backend/src/services/commandIntake.js`
- `/home/t79/vyrdon/consolelab/backend/src/services/commandWorkflow.js`
- `/home/t79/vyrdon/consolelab/backend/src/routes/command.js`
- `/home/t79/vyrdon/consolelab/10_SHARED_BACKBONE/gateway_api/schemas/command-envelope.v1.json`

### 5. Approval, Dispatch, and Tunnel Lifecycle

Implemented:

- executive sign-off
- tunnel sign-off
- automatic dispatch after all required approvals pass
- tunnel definition staging
- tunnel close route
- session-control close records

Current tunnel lifecycle supported:

1. Stage tunnel request
2. Route to executive and tunnel approvals
3. Approve scopes
4. Auto-dispatch to staged tunnel definition
5. Close staged tunnel
6. Record closure in tunnel fabric and agent session state

Key files:

- `/home/t79/vyrdon/consolelab/backend/src/services/tunnelFabric.js`
- `/home/t79/vyrdon/consolelab/07_INTELLIGENCE_TUNNEL/tunnels`
- `/home/t79/vyrdon/consolelab/07_INTELLIGENCE_TUNNEL/session_control`

### 6. Central Brain Modules

Implemented live status surfaces for:

- `CORE-PRIME`
- `MEMORY`
- `RAG`
- `MCP-BRAIN`
- `CHRONOS`
- `LEDGERD`

These are now exposed as live read models rather than only static directories.

Key file:

- `/home/t79/vyrdon/consolelab/backend/src/services/brainModules.js`

### 7. Agent Gateway Surface

Implemented:

- session inspection
- approval mirror inspection
- agent gateway status surface

Key file:

- `/home/t79/vyrdon/consolelab/backend/src/services/agentGateway.js`

### 8. Frontend Control Surface

The frontend is no longer just a static monitor. It now supports:

- room architecture display
- command deck submission
- approval signing
- manual dispatch from intake when allowed
- tunnel fabric view and close action
- Central Brain module view
- agent gateway view

Key files:

- `/home/t79/vyrdon/consolelab/frontend/src/App.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/pages/OperatorDeck.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/pages/ApprovalQueue.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/pages/OperationsQueue.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/pages/BrainModules.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/pages/TunnelFabric.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/pages/AgentGatewayView.jsx`

### 9. Live TV Wall

Implemented:

- dedicated aggregated live-TV backend feed
- lighter broadcast payload for wall use
- layered kiosk wall modules
- live second-by-second countdown rendering between refreshes
- cleaner TV styling for high-distance readability

Key files:

- `/home/t79/vyrdon/consolelab/backend/src/services/liveTvState.js`
- `/home/t79/vyrdon/consolelab/frontend/src/pages/KioskView.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/components/kiosk/KioskHero.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/components/kiosk/KioskTimelineBoard.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/components/kiosk/KioskOpsBoard.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/components/kiosk/KioskRoomWall.jsx`
- `/home/t79/vyrdon/consolelab/frontend/src/lib/liveTv.js`

## Backend API Surface

Current route counts:

- control-surface routes: `13`
- command routes: `12`

Important control-surface endpoints:

- `GET /api/control-surface/topology`
- `GET /api/control-surface/rooms`
- `GET /api/control-surface/room-states`
- `GET /api/control-surface/evidence-reader`
- `GET /api/control-surface/telemetry-collector`
- `GET /api/control-surface/chronos`
- `GET /api/control-surface/brain-modules`
- `GET /api/control-surface/agent-gateway`
- `GET /api/control-surface/tunnel-fabric`
- `GET /api/control-surface/live-tv`

Important command endpoints:

- `GET /api/gateway-api/status`
- `GET /api/gateway-api/commands`
- `GET /api/gateway-api/commands/:trackingId`
- `POST /api/gateway-api/commands`
- `GET /api/executive/approvals`
- `GET /api/operations/queues`
- `POST /api/executive/approvals/:trackingId/sign`
- `POST /api/intelligence-tunnel/approvals/:trackingId/sign`
- `POST /api/operations/dispatch/:trackingId`
- `POST /api/intelligence-tunnel/tunnels/:trackingId/close`

## ConsoleLab-Only Boundary

The live backend now defaults to ConsoleLab-only behavior.

Implemented:

- legacy route mounting is gated by `CONSOLELAB_ENABLE_LEGACY_ROUTES`
- default value is `false`
- unmatched `/api/*` requests now return JSON `404`
- frontend catch-all no longer masks missing API routes

Key files:

- `/home/t79/vyrdon/consolelab/backend/src/config.js`
- `/home/t79/vyrdon/consolelab/backend/src/index.js`

## Verification Performed

Build verification:

- backend `npm run build` passed
- frontend `npm run build` passed
- backend syntax checks passed for new route and service files

Runtime verification completed with temporary local backend runs on dedicated ports.

Verified flows:

- room registry read
- room state read
- evidence reader read
- `CHRONOS` timeline read
- gateway command submission
- approval-gated tunnel request staging
- executive approval
- tunnel approval
- auto-dispatch after final approval
- tunnel definition file creation
- tunnel close operation
- live-TV aggregated payload
- `/kiosk` serving current production bundle
- disabled legacy route returning real `404`

## Current Real Status

Last verified live summary during report generation:

- rooms: `9`
- ready: `8`
- watch: `1`
- down: `0`
- approvals waiting: `2`
- gateway intake: `2`
- connectors: `5`
- workflows: `7`
- staged tunnels: `1`
- evidence events visible in live-TV feed: `24`
- host: `t79`

Current watch item:

- `04_EVIDENCE_ROOM` remains in watch/degraded state because the evidence signing key is not configured yet

## Real Limitations and Intentionally Unfaked Areas

The following are intentionally not faked:

- real SSH remote execution over staged tunnel definitions
- real tunnel target connector/session binding
- live attestation signing without configured evidence keys
- fake MCP links or fake external connector sessions

This means:

- tunnel lifecycle is real as staged/approved/closed control state
- tunnel transport is not yet connected to an actual remote connector target
- evidence hashing is real
- attestation signature generation is not live until keys are configured

## Recommended Next Work

Priority next steps:

1. Configure evidence signing
   Add `CONSOLELAB_EVIDENCE_SIGNING_KEY_ID` and private key material so `LEDGERD` can emit real attestations.

2. Bind real tunnel targets
   Connect `SYNAPSE-BRIDGE` staged tunnel definitions to actual SSH/session endpoints and known-host identities.

3. Add session activation state
   Introduce explicit `opening`, `open`, `closing`, and `closed` states for tunnel sessions once real transport is wired.

4. Add MCP link artifacts
   Populate `AGENT-GATEWAY/mcp_links` and `tool_routing` from real connector routing events.

5. Add wall-safe auto-rotation modes
   Create TV scene rotation between room wall, evidence wall, and operations wall while keeping the same aggregated feed.

## Conclusion

ConsoleLab is no longer only a directory plan. It is now a live layered control surface with:

- a frozen room architecture
- a working shared-backbone command path
- evidence-linked action recording
- approval and dispatch loops
- Central Brain module visibility
- tunnel lifecycle controls
- an aggregated real-time live-TV wall

The system is structurally stable and clearly bounded. The remaining gaps are not architecture gaps; they are connector and key-material activation gaps.
