import { Router } from 'express';
import { loadSkill } from '../registry/skills.js';

const router = Router();

// POST /generate-flyer  { market, name }
router.post('/generate-flyer', async (req, res) => {
  try {
    const { market = 'usa', name = 'challenge' } = req.body;
    const skill = await loadSkill('flyer', market, name);
    const result = await skill.generate();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /generate-stamp
router.post('/generate-stamp', async (req, res) => {
  try {
    const skill = await loadSkill('stamp', 'index');
    const result = await skill.generate();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /generate-certificate
router.post('/generate-certificate', async (req, res) => {
  try {
    const skill = await loadSkill('certificate', 'index');
    const result = await skill.generate();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /generate-receipt
router.post('/generate-receipt', async (req, res) => {
  try {
    const skill = await loadSkill('receipt', 'index');
    const result = await skill.generate();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
