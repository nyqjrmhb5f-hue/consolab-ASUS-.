# archives/daily — ConsoleLab Daily Authority Reports

This tree is the immutable archive of CONSOLELAB daily authority reports.
One Markdown file per calendar day, written under
`YYYY/MM/DD/CONSOLELAB_DAILY_REPORT_YYYY-MM-DD.md`.

## Contract

- **Source of truth.** Each report summarises the day's evidence stamps,
  approvals, releases, and command activity by walking the rooms that
  own those signals:
  - `05_CENTRAL_BRAIN/{commands,telemetry,workflows}`
  - `10_SHARED_BACKBONE/{gateway_api,agent_gateway,server}`
  - `04_EVIDENCE_ROOM/{audit_trails,signer_events,release_gates,proofs}`
  - `07_INTELLIGENCE_TUNNEL/{approvals,audit,session_control,relay}`
  - `09_DEPLOYMENT/{release,healthchecks,rollback}`
- **Immutability.** Once a primary report is written for a date, the
  generator refuses to overwrite it. Corrections must be filed as a
  sibling file named
  `CONSOLELAB_DAILY_REPORT_YYYY-MM-DD_ADDENDUM_YYYY-MM-DD.md`
  (the trailing date is the day the addendum was filed).
- **Retention.** The generator deletes any `YYYY/MM/DD/` directory whose
  date is strictly more than 365 days before today. Empty `YYYY/MM/`
  and `YYYY/` directories are pruned. This `README.md` is preserved.

## Filing an addendum

```sh
# correct yesterday's report (default --date is yesterday in --tz)
npm run report:daily -- --addendum --note "fixed approver name on tracking_id …"
```

The script will fail loudly if the primary report does not exist or if an
addendum has already been filed today. Multiple addenda are allowed across
distinct days.

## Generator location

`scripts/archive/consolab-daily-report.ts` — invoked by the user-level
systemd timer `consolab-daily-report.timer` (00:03 local, `Persistent=true`
so missed boots catch up). See `scripts/install-consolab-daily-report.sh`.
