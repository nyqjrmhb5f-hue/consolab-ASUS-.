# Cloudflare Zero Trust — Access policy for `authority.consolelab.vyrdon.com`

Spec for the Cloudflare Access application that gates the ConsoleLab authority
host. This is the **only** thing standing between the public internet and the
tunneled `127.0.0.1:18080` backend. Get this right.

## Why this exists

Follow-up D's hard constraint (per the D-LOCK instruction block):

> Cloudflare Access required (unauthenticated = blocked).
> evidence row written on every authenticated request.

Without an Access app in front of the tunnel, the authority backend is
effectively a public service that happens to have a `requireAccess` middleware
check. With the Access app in place, **every** request reaching the backend
already carries a verified Cloudflare identity (JWT in `Cf-Access-Jwt-Assertion`
or service-token headers).

## Apply via dashboard (no API writes needed yet)

Cloudflare One → **Zero Trust** → **Access** → **Applications** → **Add an
application** → **Self-hosted**.

### Application

| Field | Value |
|---|---|
| Application name | `ConsoleLab Authority` |
| Session duration | `24 hours` |
| Application domain | `authority.consolelab.vyrdon.com` |
| App launcher visibility | Off (do not advertise in the launcher) |
| Auto-redirect to identity | On |
| Identity providers | Whatever your tenant uses for admin login (e.g. One-time PIN to allowed emails, GitHub OAuth, Google Workspace) |

Add a **second application** with the same settings for
`consolelab.vyrdon.com` (the control surface) and `consolab.vyrdon.com` (the
alias) if you want the same gate on the control surface. The D-LOCK only
**requires** Access on the authority host; the control surface is optional but
recommended.

### Policies

For the `ConsoleLab Authority` application, create two policies in this order:

**Policy 1 — `admin-emails`** (Action: Allow)

| Include | Value |
|---|---|
| Emails | the operator's email(s) — list explicitly, no wildcards |

Or, if you have a Cloudflare Access group containing the operators, include
that group instead.

**Policy 2 — `service-token-headless`** (Action: Service Auth)

This lets `smoke.mjs` and other headless callers reach the backend with
`CF-Access-Client-Id` + `CF-Access-Client-Secret` headers — without these the
backend has no way to be checked from CI.

| Include | Value |
|---|---|
| Service Token | Create one named `ConsoleLab Smoke` and pin it here |

Store the resulting `Client ID` and `Client Secret` in your operator secrets
dir; the backend reads them via `process.env.CF_SERVICE_TOKEN_ID` /
`CF_SERVICE_TOKEN_SECRET` (see `backend/src/config.js`).

**Default action: Block.** (This is set on the application, not as a separate
policy. Cloudflare blocks anything that doesn't match an Allow or
Service-Auth policy.)

### Headers Cloudflare adds (which the backend MAY read)

| Header | Meaning |
|---|---|
| `Cf-Access-Authenticated-User-Email` | The verified email for user requests |
| `Cf-Access-Jwt-Assertion` | The signed JWT proving the request passed Access |
| `Cf-Access-Client-Id` / `Cf-Access-Client-Secret` | Service-token auth for headless callers |
| `Cf-Connecting-Ip` | True client IP (overrides `X-Forwarded-For` upstream) |

The authority route reads `cf-connecting-ip` for source-IP attribution
(see `backend/src/routes/authority.js`). It does not yet verify the JWT in
`Cf-Access-Jwt-Assertion` — that's an evidence-binding hardening task,
deferred to a separate PR.

## Verification (after applying the policy)

From a machine that is NOT logged into Cloudflare Access:

```bash
curl -I -m 10 https://authority.consolelab.vyrdon.com/health
```

Expected: `HTTP/2 302` (redirect to the Access login) or `401`/`403`. **Any
`200` here means Access is not enforcing — that's a critical failure of the
D-LOCK invariant.**

From a machine WITH a valid service token:

```bash
curl -I -m 10 \
  -H "CF-Access-Client-Id: $CF_SERVICE_TOKEN_ID" \
  -H "CF-Access-Client-Secret: $CF_SERVICE_TOKEN_SECRET" \
  https://authority.consolelab.vyrdon.com/health
```

Expected: `HTTP/2 200`.

## Rollback

If you need to remove the Access gate during incident response:

1. Cloudflare One → Zero Trust → Access → Applications → `ConsoleLab Authority`
2. Disable the application (do not delete — the policies are useful audit
   history).
3. Run `bash scripts/verify-deploy-lock.sh` — it should now report:
   > FAIL: returned 200 unauthenticated — Cloudflare Access is NOT enforcing.

That failure is **expected** in this rollback state and confirms Access is
off. Re-enable the application as soon as the incident is resolved.

## API-based application creation (deferred)

If you later want this provisioned via Terraform or the Cloudflare API instead
of through the dashboard, the relevant endpoints are:

- `POST /accounts/{account_id}/access/apps` — create the application
- `POST /accounts/{account_id}/access/apps/{app_id}/policies` — attach policies
- `POST /accounts/{account_id}/access/service_tokens` — service token

The `cloudfare` session secret in this session is a Cloudflare API token; if
the operator authorizes it (and provides the account ID), a follow-up PR can
add an idempotent provisioner. For now, dashboard is fine — Access apps are
created once per host and almost never change.
