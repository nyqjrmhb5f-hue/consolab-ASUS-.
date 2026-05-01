import { BaseGenerator } from '../../core/generator.js';
import { baseStyles, metaBlock } from '../../core/renderer.js';

const ACCENT = '#c9a84c';

class CertificateGenerator extends BaseGenerator {
  constructor() { super({ type: 'certificate', market: 'global', name: 'validation-record', subdir: 'certificates' }); }
  renderHTML(spec) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>VYRDON CERTIFIED VALIDATION RECORD</title><style>
  ${baseStyles(ACCENT)}
  .cert{max-width:850px;width:100%;border:3px double ${ACCENT};padding:3rem;text-align:center;position:relative;background:linear-gradient(135deg,#0d0d1a 0%,#0a0a0a 100%);}
  .cert::before{content:'';position:absolute;inset:8px;border:1px solid ${ACCENT};opacity:.3;pointer-events:none;}
  .cert-title{font-size:1rem;letter-spacing:.4em;color:#888;margin-bottom:.5rem;}
  .cert-main{font-size:2rem;font-weight:900;color:${ACCENT};letter-spacing:.1em;margin-bottom:.5rem;}
  .cert-sub{font-size:.85rem;letter-spacing:.3em;color:#aaa;margin-bottom:2.5rem;}
  .seal{display:inline-block;border:2px solid ${ACCENT};padding:.5rem 2rem;color:${ACCENT};font-size:.9rem;letter-spacing:.2em;margin:1.5rem 0;}
  .status-valid{color:#00ff88;font-size:1.1rem;font-weight:bold;margin:.5rem 0;}
</style></head><body>
<div class="cert">
  <p class="cert-title">VYRDON CONSOLAB</p>
  <p class="cert-main">CERTIFIED VALIDATION RECORD</p>
  <p class="cert-sub">CHAIN OF TRUTH — WRITE-ONCE VAULT</p>
  <div class="seal">VYRDON AUTHORITY SEAL</div>
  <p class="status-valid">✓ CERTIFIED — VALID — ACCEPTED</p>
  ${metaBlock({ id: spec.id, market: spec.market, name: spec.name, issuedAt: spec.issued_at, hash: spec.evidence_hash, accentColor: ACCENT })}
</div></body></html>`;
  }
}
export default new CertificateGenerator();
