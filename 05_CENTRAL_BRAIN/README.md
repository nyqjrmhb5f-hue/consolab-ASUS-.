# 05_CENTRAL_BRAIN

Primary engine: `CORE-PRIME`

This room is the command kernel for ConsoleLab. It runs the policy-aware decision loop, hosts agent memory and retrieval, owns orchestration cadence, and coordinates connector access through `MCP-BRAIN`.

Key flows:
- `env/zsh/` anchors the brain shell spine
- `core/` contains reasoning, memory, and agent modules
- `integrations/ledger/` and `integrations/mcp_brain/` connect the brain to evidence and tools
