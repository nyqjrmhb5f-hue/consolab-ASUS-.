import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';

const router = Router();
const MEDIA_DIR = '/home/t79/vyrdon/consolelab/data/consolab/media';

async function listHTML(subdir) {
  const dir = path.join(MEDIA_DIR, subdir);
  try {
    const entries = await fs.readdir(dir, { recursive: true });
    return entries.filter(f => f.endsWith('.html')).map(f => `/media/${subdir}/${f}`);
  } catch { return []; }
}

const TYPES = {
  flyers:       ['flyers/usa','flyers/dubai'],
  stamps:       ['stamps'],
  certificates: ['certificates'],
  receipts:     ['receipts'],
};

for (const [type, dirs] of Object.entries(TYPES)) {
  router.get(`/preview/${type}`, async (req, res) => {
    const all = (await Promise.all(dirs.map(d => listHTML(d)))).flat();
    const links = all.map(u => `<li><a href="${u}" target="_blank">${path.basename(u)}</a></li>`).join('\n');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PREVIEW — ${type.toUpperCase()}</title>
<style>body{background:#0a0a0a;color:#f0f0f0;font-family:monospace;padding:2rem;}
a{color:#e63946;}li{margin:.4rem 0;}</style></head>
<body><h2 style="color:#e63946;margin-bottom:1rem">CONSOLAB — ${type.toUpperCase()} PREVIEWS</h2>
<ul>${links || '<li>No artifacts yet — POST to /generate-' + type.slice(0,-1) + '</li>'}</ul>
<p style="margin-top:2rem"><a href="/dashboard">&larr; Dashboard</a></p>
</body></html>`);
  });
}

export default router;
