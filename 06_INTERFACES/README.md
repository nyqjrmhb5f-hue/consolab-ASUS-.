# 06_INTERFACES

Primary engine: `OMNI-SURFACE`

This room is the only outward-facing interaction layer. It translates operator, customer, and developer intent into strict schemas and safe requests for the central brain.

Key flows:
- `operator_console/` for cockpit views
- `customer_surface/` for customer-safe read and action flows
- `codex/`, `ai/`, `schemas/`, and `sensory/` for structured translation and media surfaces

## Locked schemas (`schemas/`)

| File | Version | Purpose |
| --- | --- | --- |
| [`schemas/authority-decision.v1.json`](./schemas/authority-decision.v1.json) | `authority-decision.v1` | Inbound `AuthorityRequest` and outbound `AuthorityDecision` packets that ConsoleLab uses to render approve/reject/needs-info verdicts. Required axes on every request: `scope`, `standard`, `policy`. Every decision (including refusals) carries an `evidenceStamp` that points to the immutable record in `04_EVIDENCE_ROOM`. |

The schemas in this directory are the contractual handshake between every other room. They are versioned by file name (`*.vN.json`); never mutate a published version in place — publish a new file alongside it.

Backend, frontend, and tests must import contracts via [`schemas/index.js`](./schemas/index.js):

```js
import {
  AUTHORITY_DECISION_SCHEMA,
  validateAuthorityRequest,
  validateAuthorityDecision
} from "<repo-root>/06_INTERFACES/schemas/index.js";
```

The validator is hand-rolled, zero-dep, and only supports the subset of JSON Schema actually used by the locked schemas (type, required, properties, additionalProperties, enum, const, pattern, minLength/maxLength, minItems/maxItems, uniqueItems, items, `$ref` into `#/definitions`). It is intentionally small so 06_INTERFACES never ships runtime dependencies.
