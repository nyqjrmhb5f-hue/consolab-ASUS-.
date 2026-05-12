#!/usr/bin/env bash
# Idempotently ensure the ConsoleLab DNS routes point at the canonical tunnel.
# Run after install-cloudflared-consolelab.sh once the operator is logged in
# to Cloudflare via `cloudflared tunnel login`.
#
# Cloudflare error 1033 ("Argo Tunnel error: 1033") means the DNS record for
# the hostname exists but no healthy tunnel is registered to serve it. This
# script fixes the route-binding half of that problem by ensuring each of the
# three ConsoleLab hostnames has a DNS route pointing to our tunnel UUID.
#
# Re-running is safe. `cloudflared tunnel route dns` no-ops when the record
# already exists and matches; if the record points at a different tunnel it
# returns a conflict, which we surface verbatim so the operator can resolve
# it in the Cloudflare dashboard before re-running.
#
# Hard rules:
#   - no Cloudflare API writes (uses the cloudflared CLI's user-auth flow)
#   - read-only to runtime hosts other than ASUS
#   - never runs as root (cloudflared user-auth lives in $HOME)

set -euo pipefail

TUNNEL_ID="${CONSOLELAB_TUNNEL_ID:-ac840436-bc21-43b0-9548-198ea7fc0ab4}"
HOSTNAMES=(
  "consolelab.vyrdon.com"
  "consolab.vyrdon.com"
  "authority.consolelab.vyrdon.com"
)

if [[ "${EUID}" -eq 0 ]]; then
  echo "ensure-cloudflared-routes: refusing to run as root — run as the tunnel owner (e.g. t79)" >&2
  exit 64
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ensure-cloudflared-routes: cloudflared is not installed" >&2
  exit 65
fi

echo "Ensuring DNS routes for tunnel ${TUNNEL_ID}:"
for host in "${HOSTNAMES[@]}"; do
  echo
  echo "  → ${host}"
  # We bias for noisy success: the CLI prints "Successfully created/updated"
  # on a fresh write and "An A, AAAA, or CNAME record already exists" on a
  # no-op. Surface both verbatim; never swallow errors silently.
  if cloudflared tunnel route dns "${TUNNEL_ID}" "${host}" 2>&1; then
    echo "  ✓ ${host} route OK"
  else
    rc=$?
    echo "  ✗ ${host} route failed (exit ${rc}) — see Cloudflare DNS dashboard" >&2
    # Don't abort the loop — operator may want to see all three results.
  fi
done

echo
echo "Done. Next: run scripts/verify-deploy-lock.sh to confirm 1033 is gone."
