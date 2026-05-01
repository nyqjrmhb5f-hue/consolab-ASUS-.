import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSkill, listSkills } from './registry/skills.js';
import generateRouter from './routes/generate.js';
import previewRouter from './routes/preview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 7821;
const MEDIA_DIR = '/home/t79/vyrdon/consolelab/data/consolab/media';

const app = express();
app.use(express.json());

// ── Static media files ────────────────────────────────────────────────────
app.use('/media', async (req, res, next) => {
  const filePath = path.join(MEDIA_DIR, req.path);
  try {
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch { next(); }
});

// ── Modular routes ────────────────────────────────────────────────────────
app.use('/', generateRouter);
app.use('/', previewRouter);

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'consolab-media-engine', port: PORT, ts: new Date().toISOString() });
});

// ── Status (live artifact counts) ─────────────────────────────────────────
app.get('/status', async (req, res) => {
  const cats = ['flyers/usa', 'flyers/dubai', 'stamps', 'certificates', 'receipts'];
  const result = {};
  for (const cat of cats) {
    const dir = path.join(MEDIA_DIR, cat);
    try {
      const files = (await fs.readdir(dir)).filter(f => f.endsWith('.html'));
      result[cat] = { count: files.length, files };
    } catch { result[cat] = { count: 0, files: [] }; }
  }
  const skills = await listSkills();
  res.json({ service: 'consolab-media-engine', ts: new Date().toISOString(), skills_registered: skills.length, skills, artifacts: result });
});

// ── Dashboard ─────────────────────────────────────────────────────────────
app.get('/dashboard', async (req, res) => {
  const cats = [
    { key: 'flyers/usa',    label: 'FLYERS — USA',    previewPath: '/preview/flyers' },
    { key: 'flyers/dubai',  label: 'FLYERS — DUBAI',  previewPath: '/preview/flyers' },
    { key: 'stamps',        label: 'STAMPS',           previewPath: '/preview/stamps' },
    { key: 'certificates',  label: 'CERTIFICATES',     previewPath: '/preview/certificates' },
    { key: 'receipts',      label: 'RECEIPTS',         previewPath: '/preview/receipts' },
  ];

  let sections = '';
  for (const { key, label, previewPath } of cats) {
    const dir = path.join(MEDIA_DIR, key);
    let items = '';
    try {
      const files = (await fs.readdir(dir)).filter(f => f.endsWith('.html'));
      for (const f of files) {
        items += `<li><a href="/media/${key}/${f}" target="_blank">▶ ${f}</a></li>\n`;
      }
    } catch { items = '<li><em>None yet</em></li>'; }
    sections += `
    <section>
      <h3>${label} <a class="preview-link" href="${previewPath}">[ view all ]</a></h3>
      <ul>${items}</ul>
    </section>`;
  }

  const skills = await listSkills();
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>CONSOLAB MEDIA ENGINE — DASHBOARD</title>
<meta http-equiv="refresh" content="30">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:#0a0a0a;color:#f0f0f0;font-family:'Courier New',monospace;padding:2rem;}
  header{border-bottom:2px solid #e63946;padding-bottom:1rem;margin-bottom:2rem;}
  h1{color:#e63946;font-size:1.6rem;letter-spacing:.3em;}
  .status{color:#00ff88;font-size:.85rem;margin-top:.4rem;}
  nav{margin-top:.8rem;display:flex;gap:1.2rem;flex-wrap:wrap;}
  nav a{color:#888;text-decoration:none;font-size:.8rem;letter-spacing:.1em;}
  nav a:hover{color:#e63946;}
  section{margin:1.5rem 0;padding:1rem;border:1px solid #1a1a1a;background:#0d0d0d;}
  h3{color:#ffd700;font-size:.9rem;letter-spacing:.1em;margin-bottom:.6rem;}
  ul{list-style:none;}
  li{padding:.3rem 0;border-bottom:1px dotted #1a1a1a;}
  a{color:#4fc3f7;text-decoration:none;font-size:.85rem;}
  a:hover{color:#ffd700;}
  .preview-link{color:#e63946;font-size:.75rem;margin-left:.5rem;}
  .skill-pill{display:inline-block;background:#1a1a1a;color:#888;font-size:.7rem;padding:.15rem .5rem;border-radius:2px;margin:.15rem;}
  footer{margin-top:3rem;border-top:1px solid #1a1a1a;padding-top:1rem;color:#444;font-size:.75rem;}
  footer a{color:#666;}
</style>
</head>
<body>
<header>
  <h1>CONSOLAB MEDIA ENGINE</h1>
  <p class="status">● RUNNING — PORT ${PORT} — ${new Date().toISOString()}</p>
  <nav>
    <a href="/health">Health</a>
    <a href="/status">Status</a>
    <a href="/preview/flyers">Flyers</a>
    <a href="/preview/stamps">Stamps</a>
    <a href="/preview/certificates">Certificates</a>
    <a href="/preview/receipts">Receipts</a>
  </nav>
</header>
<div>
  <p style="color:#555;font-size:.8rem;margin-bottom:.5rem">REGISTERED SKILLS (${skills.length})</p>
  ${skills.map(s => `<span class="skill-pill">${s.type}/${s.market}/${s.name}</span>`).join('')}
</div>
${sections}
<footer>
  <p>VYRDON CONSOLAB | <a href="https://vyrdx.vyrdon.com">vyrdx.vyrdon.com</a> | <a href="https://vyrdon.com">vyrdon.com</a> | contact@vyrdon.com | Apache-2.0</p>
</footer>
</body></html>`);
});

// ── Auto-generate all artifacts on startup ────────────────────────────────
async function autoGenerate() {
  console.log('[CONSOLAB] Bootstrapping all skill artifacts...');
  const matrix = [
    ['flyer', 'usa',    'challenge'],
    ['flyer', 'usa',    'proof'],
    ['flyer', 'usa',    'conversion'],
    ['flyer', 'dubai',  'authority'],
    ['flyer', 'dubai',  'financial'],
    ['flyer', 'dubai',  'control'],
  ];
  for (const [type, market, name] of matrix) {
    try {
      const skill = await loadSkill(type, market, name);
      const r = await skill.generate();
      console.log(`[CONSOLAB]  ✓ ${type}/${market}/${name} → ${r.evidence_hash.slice(0,16)}...`);
    } catch (e) { console.error(`[CONSOLAB]  ✗ ${type}/${market}/${name}: ${e.message}`); }
  }
  for (const type of ['stamp', 'certificate', 'receipt']) {
    try {
      const skill = await loadSkill(type, 'index');
      const r = await skill.generate();
      console.log(`[CONSOLAB]  ✓ ${type} → ${r.evidence_hash.slice(0,16)}...`);
    } catch (e) { console.error(`[CONSOLAB]  ✗ ${type}: ${e.message}`); }
  }
  console.log('[CONSOLAB] Bootstrap complete.');
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[CONSOLAB] Media Engine v2 (modular) running on port ${PORT}`);
  await autoGenerate();
});
