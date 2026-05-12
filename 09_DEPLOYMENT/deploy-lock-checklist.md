# ConsoleLab Deploy Lock — Operator Runbook (Follow-up D)

This is the canonical, repeatable runbook for putting the ConsoleLab authority
host behind cloudflared + Cloudflare Zero Trust Access, with single-tunnel
ownership and localhost-only backend binding.

Source-of-truth for every artifact this runbook references is in the repo —
nothing here is ad-hoc on ASUS.

## Hard constraints (encoded as gates below)

- Authority backend binds **127.0.0.1 only** (never 0.0.0.0).
- Exactly **one** cloudflared tunnel process owns the published hostnames.
- **Cloudflare Access required** on `authority.consolelab.vyrdon.com`.
  Unauthenticated requests **must** see a 302/401/403 challenge.
- **No SSH** to runtime hosts. ConsoleLab is read-only relative to Dell /
  VYRDX runtime.
- **Evidence row** written on every authenticated request (the authority
  route already does this via `decideAuthority`; `/sign` and `/attest/verify`
  hardening is tracked in a follow-up).

## Host topology

| Hostname | Public via Cloudflare? | Tunnel origin | Notes |
|---|---|---|---|
| `consolelab.vyrdon.com` | Yes (Access optional but recommended) | `http://127.0.0.1:8080` | Control surface |
| `consolab.vyrdon.com` | Yes | `http://127.0.0.1:8080` | Alias for control surface |
| `authority.consolelab.vyrdon.com` | Yes (Access **required**) | `http://127.0.0.1:18080` | Authority backend (this PR's focus) |

Tunnel UUID: `ac840436-bc21-43b0-9548-198ea7fc0ab4`.

## Checklist

Run in order on the ASUS host as the `t79` user (or whoever owns the live
tunnel). Each step is idempotent.

### 0. Prerequisites

- [ ] `cloudflared` installed at `/usr/local/bin/cloudflared` (`cloudflared --version`)
- [ ] The tunnel signing key JSON exists at the path declared in
      `ops/cloudflare/vyrdon-consolelab.yml`'s `credentials-file:` field. Do
      **not** commit this file. Default location:
      `/home/t79/.cloudflared/ac840436-bc21-43b0-9548-198ea7fc0ab4.json`
- [ ] The backend repo is checked out under `/home/t79/vyrdon/consolelab/`

### 0.5 Baseline capture (read-only — run before any mutation)

- [ ] Capture a frozen "before" snapshot of the host into
      `04_EVIDENCE_ROOM/runtime_journals/`:
      `bash scripts/capture-deploy-lock-baseline.sh`
      Output file is `deploy-lock-baseline-<UTC>.md`. The file proves which
      control-surface port is actually listening (`:8080` vs `:7821`), how
      many cloudflared processes exist before dedup, and the current public
      response for each of the 3 hostnames (including any Cloudflare 1033
      errors).

### 1. Authority backend (localhost-only)

- [ ] Run the installer:
      `bash scripts/install-cloudflared-consolelab.sh`
- [ ] Confirm the backend listens on `127.0.0.1:18080`:
      `ss -ltnp | grep :18080`
      Expect a row containing `127.0.0.1:18080` (never `0.0.0.0`).
- [ ] Confirm local `/health` returns 200:
      `curl -s http://127.0.0.1:18080/health`

### 2. Tunnel config and single-owner unit

- [ ] The installer wrote `ops/cloudflare/vyrdon-consolelab.yml` to
      `/home/t79/ASUS/ASUSX/ops/cloudflare/vyrdon-consolelab.yml`. Verify:
      `head -50 /home/t79/ASUS/ASUSX/ops/cloudflare/vyrdon-consolelab.yml`
- [ ] Confirm exactly one cloudflared tunnel process is running:
      `ps -ef | grep -i 'cloudflared tunnel' | grep -v grep`
      Expect exactly one row. If there's more than one, the installer's
      "single-tunnel-owner" enforcement didn't catch a process started outside
      systemd — kill it manually before continuing.
- [ ] Confirm `cloudflared-consolelab.service` is the only enabled user unit
      matching `cloudflared*.service`:
      `systemctl --user list-units --type=service --all | grep cloudflared`

### 3. DNS routes (interactive Cloudflare auth required)

- [ ] Ensure all 3 hostnames are routed at this tunnel UUID. The wrapper
      script runs the `route dns` command for each hostname idempotently:
      `bash scripts/ensure-cloudflared-routes.sh`
      Or by hand:
      ```
      cloudflared tunnel route dns ac840436-bc21-43b0-9548-198ea7fc0ab4 consolelab.vyrdon.com
      cloudflared tunnel route dns ac840436-bc21-43b0-9548-198ea7fc0ab4 consolab.vyrdon.com
      cloudflared tunnel route dns ac840436-bc21-43b0-9548-198ea7fc0ab4 authority.consolelab.vyrdon.com
      ```
      If Cloudflare returns `An A, AAAA, or CNAME record already exists` and
      it points at a *different* tunnel, the existing record must be removed
      in the Cloudflare dashboard first — this is the most common cause of
      Cloudflare error 1033 on hostnames you expect to work.

### 4. Cloudflare Zero Trust Access

- [ ] Apply the policy spec in `09_DEPLOYMENT/zero-trust/access-policy.md`:
      Application name `ConsoleLab Authority`, allow policy for operator
      email(s), service-auth policy for headless callers, default Block.

### 5. Verification

- [ ] Run the verifier:
      `bash scripts/verify-deploy-lock.sh`
      Expect `D-LOCK: SEALED` and exit 0.

      The verifier asserts every gate above:
      - bind on 127.0.0.1 only
      - local /health 200
      - exactly one cloudflared tunnel process
      - cloudflared-consolelab.service + consolelab-backend.service both active
      - public `authority.consolelab.vyrdon.com/health` returns 302/401/403
        when not authenticated (i.e. Access is in front)

- [ ] From a logged-in browser, verify
      `https://authority.consolelab.vyrdon.com/health` returns 200 after
      authenticating.

- [ ] From a headless caller (e.g. CI) with service-token headers:
      ```
      curl -I -H "CF-Access-Client-Id: $CF_SERVICE_TOKEN_ID" \
              -H "CF-Access-Client-Secret: $CF_SERVICE_TOKEN_SECRET" \
              https://authority.consolelab.vyrdon.com/health
      ```
      Expect `HTTP/2 200`.

### 6. Evidence-row spot check

After at least one authenticated request reaches `/api/authority/decisions`:

- [ ] `tail -n 1 /home/t79/vyrdon/consolelab/04_EVIDENCE_ROOM/audit_trails/events.jsonl`
      Confirm a recent row exists with a non-empty `tx_hash` and `recorded_at`
      within the last few minutes.

## Rollback

- [ ] `bash scripts/uninstall-cloudflared-consolelab.sh` — disables both user
      units. Tunnel config + credentials JSON are preserved.
- [ ] To fully revert (extremely rare): also remove the DNS route via
      `cloudflared tunnel route dns --remove authority.consolelab.vyrdon.com`
      and disable the Cloudflare Access application via the dashboard.

## What this PR does **NOT** do

- Does not modify Dell or VYRDX runtime hosts. ConsoleLab remains read-only.
- Does not SSH into any runtime host.
- Does not change the existing `cloudflared-dell.service` /
  `cloudflared-asusx.service` system units in `ops/systemd/` — those manage
  different hosts and remain operationally separate from the new user unit.
- Does not add an evidence-on-authenticated-request middleware to `/sign` or
  `/attest/verify` — that's a separate, smaller hardening PR. The authority
  route at `/api/authority/decisions` already writes evidence on every
  decision via `decideAuthority`.
- Does not provision the Cloudflare Access application via API. Dashboard
  apply per `09_DEPLOYMENT/zero-trust/access-policy.md`.
