import { BaseGenerator } from '../../core/generator.js';
import { baseStyles, metaBlock } from '../../core/renderer.js';

const ACCENT = '#ffd700';

class StampGenerator extends BaseGenerator {
  constructor() { super({ type: 'stamp', market: 'global', name: 'digital-stamp', subdir: 'stamps' }); }
  renderHTML(spec) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>VYRDON DIGITAL STAMP</title><style>
  ${baseStyles(ACCENT)}
  .stamp-wrap{max-width:600px;width:100%;text-align:center;}
  h1{color:${ACCENT};font-size:1.4rem;letter-spacing:.3em;margin-bottom:2rem;}
  .badge{display:inline-block;width:220px;height:220px;position:relative;}
  .badge svg{width:100%;height:100%;}
  .status-valid{color:#00ff88;font-weight:bold;font-size:1rem;margin:1.5rem 0;}
</style></head><body>
<div class="stamp-wrap">
<h1>VYRDON DIGITAL STAMP</h1>
<div class="badge">
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="95" fill="none" stroke="${ACCENT}" stroke-width="4"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="${ACCENT}" stroke-width="1.5" stroke-dasharray="4 3"/>
  <path d="M100 20 L110 55 L145 55 L118 75 L128 110 L100 90 L72 110 L82 75 L55 55 L90 55 Z" fill="${ACCENT}" opacity="0.15" stroke="${ACCENT}" stroke-width="1"/>
  <text x="100" y="95" text-anchor="middle" fill="${ACCENT}" font-size="11" font-family="Courier New" font-weight="bold" letter-spacing="2">VYRDON</text>
  <text x="100" y="112" text-anchor="middle" fill="#fff" font-size="8" font-family="Courier New" letter-spacing="1">CONSOLAB</text>
  <text x="100" y="128" text-anchor="middle" fill="${ACCENT}" font-size="7" font-family="Courier New">DIGITAL STAMP</text>
  <text x="100" y="168" text-anchor="middle" fill="#888" font-size="6" font-family="Courier New">CHAIN OF TRUTH</text>
</svg>
</div>
<p class="status-valid">STATUS: ✓ VALID</p>
${metaBlock({ id: spec.id, market: spec.market, name: spec.name, issuedAt: spec.issued_at, hash: spec.evidence_hash, accentColor: ACCENT })}
</div></body></html>`;
  }
}
export default new StampGenerator();
