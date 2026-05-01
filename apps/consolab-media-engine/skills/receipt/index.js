import { BaseGenerator } from '../../core/generator.js';
import { baseStyles, metaBlock } from '../../core/renderer.js';

const ACCENT = '#00ff88';

class ReceiptGenerator extends BaseGenerator {
  constructor() { super({ type: 'receipt', market: 'global', name: 'vyrdon-receipt', subdir: 'receipts' }); }
  renderHTML(spec) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>VYRDON RECEIPT</title><style>
  ${baseStyles(ACCENT)}
  .receipt{max-width:480px;width:100%;border:1px solid #333;padding:2rem;font-size:.9rem;}
  .receipt-header{text-align:center;border-bottom:2px dashed #333;padding-bottom:1rem;margin-bottom:1rem;}
  .receipt-title{font-size:1.2rem;color:${ACCENT};font-weight:900;letter-spacing:.2em;}
  .receipt-row{display:flex;justify-content:space-between;margin:.4rem 0;font-size:.85rem;}
  .receipt-row .label{color:#888;}
  .receipt-row .value{color:#fff;font-weight:600;}
  .receipt-divider{border:none;border-top:1px dashed #444;margin:1rem 0;}
  .receipt-status{text-align:center;color:${ACCENT};font-weight:bold;font-size:1rem;margin:1rem 0;}
</style></head><body>
<div class="receipt">
  <div class="receipt-header">
    <p class="receipt-title">VYRDON RECEIPT</p>
    <p style="color:#666;font-size:.75rem;letter-spacing:.1em">CONSOLAB — CHAIN OF TRUTH</p>
  </div>
  <div class="receipt-row"><span class="label">TYPE</span><span class="value">VALIDATION RECEIPT</span></div>
  <div class="receipt-row"><span class="label">ISSUED</span><span class="value">${spec.issued_at}</span></div>
  <div class="receipt-row"><span class="label">MARKET</span><span class="value">${spec.market.toUpperCase()}</span></div>
  <div class="receipt-row"><span class="label">ARTIFACT</span><span class="value">${spec.artifact_hash.slice(0,16)}...</span></div>
  <hr class="receipt-divider"/>
  <div class="receipt-row"><span class="label">EVIDENCE HASH</span></div>
  <div style="font-size:.6rem;color:#555;word-break:break-all;margin:.4rem 0;">${spec.evidence_hash}</div>
  <hr class="receipt-divider"/>
  <p class="receipt-status">STATUS: ✓ VALID — ACCEPTED</p>
  ${metaBlock({ id: spec.id, market: spec.market, name: spec.name, issuedAt: spec.issued_at, hash: spec.evidence_hash, accentColor: ACCENT })}
</div></body></html>`;
  }
}
export default new ReceiptGenerator();
