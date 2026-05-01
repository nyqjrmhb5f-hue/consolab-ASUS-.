import { BaseGenerator } from '../../../core/generator.js';
import { baseStyles, metaBlock, MARKET_COLORS } from '../../../core/renderer.js';

const ACCENT = MARKET_COLORS.dubai;
const LINES = [
  'FUNDS MOVED \u2260 TRANSACTION VALID.',
  'Execution is not finality.',
  'Without Authority / Evidence / Integrity, there is no proof.',
  'PROVE EVERY TRANSACTION.'
];

class DubaiFinancialFlyer extends BaseGenerator {
  constructor() { super({ type: 'flyer', market: 'dubai', name: 'financial', subdir: 'flyers/dubai' }); }
  renderHTML(spec) {
    const lines = LINES.map((l, i) => {
      if (i === 0) return `<p class="line headline">${l}</p>`;
      if (i === LINES.length - 1) return `<p class="line cta">${l}</p>`;
      return `<p class="line">${l}</p>`;
    }).join('\n');
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>VYRDON FLYER — DUBAI 02 — FINANCIAL</title><style>
  ${baseStyles(ACCENT)}
  .flyer{max-width:800px;width:100%;border:2px solid ${ACCENT};padding:3rem;text-align:center;position:relative;}
  .market-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:${ACCENT};color:#0a0a0a;font-weight:900;font-size:.8rem;padding:.2rem 1rem;letter-spacing:.2em;}
  .logo{font-size:.8rem;color:#555;letter-spacing:.3em;margin-bottom:2rem;}
  .line{font-size:1.5rem;font-weight:700;line-height:1.6;color:#fff;margin:.4rem 0;}
  .line.headline{font-size:2.2rem;font-weight:900;color:${ACCENT};margin-bottom:1.5rem;}
  .line.cta{font-size:1.8rem;color:${ACCENT};margin-top:1.5rem;padding:.5rem 1.5rem;border:2px solid ${ACCENT};display:inline-block;}
</style></head><body>
<div class="flyer"><div class="market-badge">DUBAI MARKET</div>
<div class="logo">VYRDON CONSOLAB — MEDIA ENGINE</div>
${lines}
${metaBlock({ id: spec.id, market: spec.market, name: spec.name, issuedAt: spec.issued_at, hash: spec.evidence_hash, accentColor: ACCENT })}
</div></body></html>`;
  }
}
export default new DubaiFinancialFlyer();
