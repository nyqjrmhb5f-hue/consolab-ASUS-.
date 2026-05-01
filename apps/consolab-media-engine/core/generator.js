import { promises as fs } from 'fs';
import path from 'path';
import { hashContent } from './hasher.js';

const MEDIA_DIR = '/home/t79/vyrdon/consolelab/data/consolab/media';

export class BaseGenerator {
  constructor({ type, market, name, subdir }) {
    this.type = type;       // flyer | stamp | certificate | receipt
    this.market = market;   // usa | dubai | global
    this.name = name;       // challenge | proof | stamp | etc.
    this.subdir = subdir;   // relative path under MEDIA_DIR
    this.outputDir = path.join(MEDIA_DIR, subdir);
  }

  spec(issuedAt, hash) {
    return {
      id: `${this.type}-${this.market}-${this.name}`,
      type: this.type,
      market: this.market,
      name: this.name,
      issued_at: issuedAt,
      status: 'VALID',
      evidence_hash: hash,
      verify_url: `https://vyrdx.vyrdon.com/verify/${hash}`,
      artifact_hash: hashContent(`${this.type}:${this.market}:${this.name}:${issuedAt}`)
    };
  }

  // Override in subclass
  renderHTML(_spec) { throw new Error(`renderHTML() not implemented in ${this.constructor.name}`); }

  async generate() {
    await fs.mkdir(this.outputDir, { recursive: true });
    const issuedAt = new Date().toISOString();
    const placeholder = `${this.type}:${this.market}:${this.name}:${issuedAt}`;
    const hash = hashContent(placeholder);
    const specObj = this.spec(issuedAt, hash);
    const html = this.renderHTML(specObj);
    const ts = Date.now();
    const base = `${this.market}-${this.name}-${ts}`;

    await Promise.all([
      fs.writeFile(path.join(this.outputDir, `${base}.html`), html),
      fs.writeFile(path.join(this.outputDir, `${base}.json`), JSON.stringify(specObj, null, 2))
    ]);

    return { ...specObj, files: { html: `${base}.html`, json: `${base}.json` } };
  }
}
