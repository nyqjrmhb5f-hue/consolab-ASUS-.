# 09_DEPLOYMENT

Primary engine: `LAUNCH-VECTOR`

This room owns the release corridor from approved change to live mutation. It packages manifests, promotes releases, verifies health, and triggers rollback when the live system rejects a mutation.

Key flows:
- `manifests/` defines desired state
- `release/` performs rollout strategy
- `healthchecks/` validates the live path
- `rollback/` restores the last known good snapshot
