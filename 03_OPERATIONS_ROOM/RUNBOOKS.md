# Runbooks

## Intake

Move validated work into `jobs/intake`, assign a tracking ID, then dispatch into the correct pipeline.

## Incident

Open `incidents/triage`, gate risky features in `runtime_control/feature_gates`, and publish evidence references.

## Recovery

Use `runtime_control/recovery` for local recovery and `09_DEPLOYMENT/rollback` for release-level reversal.
