import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '../skills');

// Lazy-loaded skill map: key = "type/market/name" or "type/name"
const _cache = new Map();

export async function loadSkill(type, market, name) {
  const key = name ? `${type}/${market}/${name}` : `${type}/${market}`;
  if (_cache.has(key)) return _cache.get(key);

  // Try full path first, then fallback to index.js under type/market
  const candidates = name
    ? [
        path.join(SKILLS_DIR, type, market, `${name}.js`),
        path.join(SKILLS_DIR, type, market, 'index.js')
      ]
    : [
        path.join(SKILLS_DIR, type, `${market}.js`),
        path.join(SKILLS_DIR, type, 'index.js')
      ];

  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      const skill = mod.default;
      _cache.set(key, skill);
      return skill;
    } catch {}
  }
  throw new Error(`Skill not found: ${key}`);
}

export async function listSkills() {
  const skills = [];
  for (const typeName of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!typeName.isDirectory()) continue;
    const typeDir = path.join(SKILLS_DIR, typeName.name);
    for (const entry of readdirSync(typeDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const subDir = path.join(typeDir, entry.name);
        for (const file of readdirSync(subDir).filter(f => f.endsWith('.js'))) {
          skills.push({ type: typeName.name, market: entry.name, name: file.replace('.js','') });
        }
      } else if (entry.name.endsWith('.js')) {
        skills.push({ type: typeName.name, market: entry.name.replace('.js',''), name: 'index' });
      }
    }
  }
  return skills;
}
