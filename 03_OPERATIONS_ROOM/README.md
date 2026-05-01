# 03_OPERATIONS_ROOM

Primary engine: `OPS-MATRIX`

This room is the execution floor. It translates approved intent into jobs, queues, pipelines, runtime control, incident response, and recovery paths.

Key flows:
- `jobs/intake` -> `jobs/active` -> `jobs/completed`
- `queues/` feeds workloads and retries
- `evidence_refs/` publishes runtime proof back to `04_EVIDENCE_ROOM`
