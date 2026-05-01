import os from "node:os";
import { config } from "../config.js";
import { accessConfiguration } from "./accessControl.js";
import { buildAuthorityStatus } from "./authorityService.js";
import { evidenceStats, readRecentEvidence } from "./evidenceStore.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function getStatusPayload() {
  const [authority, evidence, recentLogs] = await Promise.all([
    buildAuthorityStatus(),
    evidenceStats(),
    readRecentEvidence(config.http.uiLogLimit)
  ]);

  const access = accessConfiguration();

  return {
    ok: authority.ok,
    service: config.serviceName,
    host: os.hostname(),
    authority,
    access,
    evidence,
    recent_actions: recentLogs,
    ts: new Date().toISOString()
  };
}

export function renderStatusPage(status) {
  const rows = status.recent_actions
    .map((entry) => {
      const timestamp = entry.timestamp || entry.created_at || "";
      const hash = entry.hash || entry.tx_hash || entry.digest_sha256 || "";

      return `
      <tr>
        <td>${escapeHtml(timestamp)}</td>
        <td>${escapeHtml(entry.action)}</td>
        <td>${escapeHtml(entry.result)}</td>
        <td>${escapeHtml(hash)}</td>
      </tr>
    `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ASUS ConsoleLab Authority</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1e8;
        --panel: #fffdf9;
        --line: #d7cdb8;
        --text: #1d1b17;
        --muted: #5e5649;
        --ok: #0f7b43;
        --warn: #8d5a00;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top right, rgba(191, 143, 0, 0.10), transparent 28rem),
          linear-gradient(180deg, #f8f5ee 0%, var(--bg) 100%);
        color: var(--text);
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem 1.25rem 3rem;
      }
      h1 {
        margin: 0 0 0.35rem;
        font-size: clamp(2rem, 5vw, 3.25rem);
        line-height: 1;
        letter-spacing: -0.04em;
      }
      p {
        margin: 0;
        color: var(--muted);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-top: 1.75rem;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 1rem;
        box-shadow: 0 10px 30px rgba(29, 27, 23, 0.06);
      }
      .label {
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      .value {
        display: block;
        margin-top: 0.35rem;
        font-size: 1.35rem;
        font-weight: 700;
      }
      .ok { color: var(--ok); }
      .warn { color: var(--warn); }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        overflow: hidden;
      }
      th, td {
        padding: 0.85rem;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
        font-size: 0.92rem;
      }
      th {
        background: #efe8d7;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      tr:last-child td {
        border-bottom: 0;
      }
      code {
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
        font-size: 0.86rem;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <p>AUTHORITY CONTROL SYSTEM</p>
        <h1>ASUS ConsoleLab</h1>
        <p>No runtime mutation. Signing, attestation, access verification, and evidence only.</p>
      </header>

      <section class="grid">
        <article class="card">
          <span class="label">ASUS</span>
          <span class="value ${status.authority.asus.online ? "ok" : "warn"}">${status.authority.asus.online ? "ONLINE" : "OFFLINE"}</span>
          <p>Host ${escapeHtml(status.host)}</p>
        </article>
        <article class="card">
          <span class="label">Sign</span>
          <span class="value ${status.authority.signing.ok ? "ok" : "warn"}">${status.authority.signing.ok ? "OK" : "DEGRADED"}</span>
          <p><code>${escapeHtml(status.authority.signing.key_id || "missing")}</code></p>
        </article>
        <article class="card">
          <span class="label">Attest</span>
          <span class="value ${status.authority.attestation.ok ? "ok" : "warn"}">${status.authority.attestation.ok ? "OK" : "DEGRADED"}</span>
          <p>${escapeHtml(String(status.authority.attestation.trusted_signers))} trusted signer(s)</p>
        </article>
        <article class="card">
          <span class="label">Access</span>
          <span class="value ${(status.access.serviceTokenConfigured || status.access.jwtConfigured) ? "ok" : "warn"}">${(status.access.serviceTokenConfigured || status.access.jwtConfigured) ? "ENFORCED" : "UNCONFIGURED"}</span>
          <p>Service token ${status.access.serviceTokenConfigured ? "loaded" : "missing"}; JWT ${status.access.jwtConfigured ? "enabled" : "disabled"}</p>
        </article>
      </section>

      <section>
        <div class="grid">
          <article class="card">
            <span class="label">Evidence</span>
            <span class="value">${escapeHtml(String(status.evidence.events))}</span>
            <p><code>${escapeHtml(status.evidence.file)}</code></p>
          </article>
          <article class="card">
            <span class="label">Last Hash</span>
            <span class="value"><code>${escapeHtml(status.evidence.last_hash || "none")}</code></span>
            <p>Append-only authority record chain</p>
          </article>
        </div>
      </section>

      <section>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Result</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="4">No evidence recorded yet.</td></tr>'}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}
