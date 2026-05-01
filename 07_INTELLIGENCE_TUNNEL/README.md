# 07_INTELLIGENCE_TUNNEL

Primary engine: `SYNAPSE-BRIDGE`

This room is the zero-trust transport fabric for remote access, relay traffic, and live feed delivery. It moves data and control without becoming the system of record.

Key flows:
- `ssh/` and `tunnels/` define secure transport paths
- `relay/` and `feed/` carry commands and feedback
- `session_control/` and `approvals/` guard high-risk remote actions
