# 10_SHARED_BACKBONE

Primary engines: `GATEWAY-API`, `SERVER`, `AGENT-GATEWAY`

This room is the shared ingress and service fabric for ConsoleLab. It exposes the API edge, hosts runtime transport, and brokers requests between interfaces, agents, and the central brain.

Key flows:
- `gateway_api/` validates and routes ingress traffic
- `server/` hosts transport, sockets, health, and runtime configs
- `agent_gateway/` brokers agent sessions, tool routing, approvals, and MCP links
