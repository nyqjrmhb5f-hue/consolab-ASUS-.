export const CONTACT_BLOCK_HTML = `
<div class="contact-block">
  <p><strong>Website:</strong> <a href="https://vyrdx.vyrdon.com">https://vyrdx.vyrdon.com</a></p>
  <p><strong>Main:</strong> <a href="https://vyrdon.com">https://vyrdon.com</a></p>
  <p><strong>GitHub:</strong> <a href="https://github.com/teee79A/Anchor-Stack">https://github.com/teee79A/Anchor-Stack</a></p>
  <p><strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/vyrdon-llc">https://www.linkedin.com/in/vyrdon-llc</a></p>
  <p><strong>X:</strong> <a href="https://x.com/vyrdon">https://x.com/vyrdon</a></p>
  <p><strong>Email:</strong> <a href="mailto:contact@vyrdon.com">contact@vyrdon.com</a></p>
  <p><strong>License:</strong> Apache-2.0 + Commercial terms available</p>
</div>`;

export const MARKET_COLORS = { usa: '#e63946', dubai: '#f4a261' };

export function baseStyles(accentColor) {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #f0f0f0; font-family: 'Courier New', monospace; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; }
  .meta { margin-top: 2rem; font-size: 0.75rem; color: #666; border-top: 1px solid #333; padding-top: 1rem; }
  .hash { font-family: monospace; font-size: 0.65rem; color: #444; word-break: break-all; margin: 0.5rem 0; }
  .contact-block { margin-top: 1.5rem; text-align: left; font-size: 0.75rem; color: #888; }
  .contact-block p { margin: 0.2rem 0; }
  .contact-block a { color: ${accentColor}; text-decoration: none; }`;
}

export function metaBlock({ id, market, name, issuedAt, hash, accentColor }) {
  return `
  <div class="meta">
    <p>ID: ${id} | Market: ${market.toUpperCase()} | Type: ${name}</p>
    <p>Issued: ${issuedAt}</p>
    <p>Status: <span style="color:#00ff88">VALID</span></p>
    <div class="hash">EVIDENCE HASH: ${hash}</div>
    <p><a href="https://vyrdx.vyrdon.com/verify/${hash}" style="color:${accentColor}">Verify: https://vyrdx.vyrdon.com/verify/${hash}</a></p>
  </div>
  ${CONTACT_BLOCK_HTML}`;
}
