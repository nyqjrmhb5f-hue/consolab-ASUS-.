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
| [`schemas/authority-decision.v1.json`](./schemas/authority-decision.v1.json) | `authority-decision.v1` | Inbound `AuthorityRequest` and outbound `AuthorityDecision` packets that ConsoleLab uses to render approve/reject/needs-info verdicts. Required axes on every request: `scope`, `standard`, `policy`. Every decision (including refusals) carries an `evidenceStamp` that points to the immutable record in `04_EVIDENCE_ROOM`. Schema-invalid packets are rendered as `REJECTED` with `reasonCode=MALFORMED_REQUEST` and a row in `04_EVIDENCE_ROOM/malformed_requests/events.jsonl`; over-limit malformed traffic gets `reasonCode=MALFORMED_REQUEST_RATE_LIMITED` with a single summary row per minute per key. |

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

Every validator error carries a stable machine-routable `code` so downstream consumers (e.g. the `authority.malformed_request` evidence row) can group errors by class without re-parsing prose:

| Code | When |
| --- | --- |
| `missing_required_property` | A required field is absent. |
| `additional_property_disallowed` | An object had a key not declared in `properties` while `additionalProperties` is `false`. |
| `type_mismatch` | The runtime type didn't match the declared `type`. |
| `enum_mismatch` | The value isn't in the declared `enum`. |
| `const_mismatch` | The value didn't match the declared `const`. |
| `pattern_mismatch` | A string didn't match the declared `pattern`. |
| `length_violation` | A string violated `minLength` / `maxLength`. |
| `array_length_violation` | An array violated `minItems` / `maxItems`. |
| `unique_items_violation` | An array with `uniqueItems: true` had duplicates. |

## HTTP ingress (`backend/src/routes/authority.js`)

`POST /api/authority/decisions` is the canonical authority surface. Body must be an `AuthorityRequest`; response is always an `AuthorityDecision` (the `evidenceStamp` + `payloadHash` + `signature` + `key_id` + `algorithm` bundle on the response IS the authorityStamp). HTTP status codes:

| Decision | `reasonCode` | HTTP |
| --- | --- | --- |
| `APPROVED` | — | `200` |
| `NEEDS_INFO` | — | `422` |
| `REJECTED` | `MALFORMED_REQUEST` | `400` |
| `REJECTED` | `MALFORMED_REQUEST_RATE_LIMITED` | `429` |
| `REJECTED` | other (policy / standard mismatch, scope-incomplete after fields) | `403` |

The route is mounted in `backend/src/index.js` behind the same `requireAccess` gate that covers `/sign` and `/attest/verify`. ConsoleLab remains read-only to VYRDX/Dell runtime — `decideAuthority()` only reads policy and writes evidence; no SSH, no runtime sockets.
