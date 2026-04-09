// /api/generate.js
// Called by Vercel Cron at 06:00 UTC Mon–Fri (美東 02:00，開市前 3.5 小時)
// Can also be triggered manually: GET /api/generate?secret=YOUR_CRON_SECRET

import { computeConviction }                    from '../lib/score.js';
import { fetchM2Yoy, fetchFedFundsChange,
         fetchEarningsBeat, fetchBreadth,
         fetchDivergences, getDruckQuote }       from '../lib/fetch.js';
import { writeFile, mkdir }                     from 'fs/promises';
import path                                     from 'path';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // ── Auth: only cron or secret-bearer may trigger ────────────────────────
  const cronHeader = req.headers['x-vercel-cron'];
  const secret     = req.query.secret;
  if (!cronHeader && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // ── 1. Fetch all data in parallel ──────────────────────────────────────
    const [m2Yoy, fedChange, earnings, breadth, price] = await Promise.all([
      fetchM2Yoy(),
      fetchFedFundsChange(),
      fetchEarningsBeat(),
      fetchBreadth(),
      fetchDivergences(),
    ]);

    // ── 2. Score ───────────────────────────────────────────────────────────
    const result = computeConviction({
      liquidity:        { m2_yoy: m2Yoy, fed_funds_change: fedChange },
      forward_earnings: earnings,
      market_breadth:   breadth,
      price_signal:     price,
    });

    // ── 3. Add metadata ────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const output = {
      date:        today,
      generated_at: new Date().toISOString(),
      druck_quote:  getDruckQuote(),
      ...result,
      _raw: {
        m2_yoy:          parseFloat(m2Yoy.toFixed(2)),
        fed_funds_change: parseFloat(fedChange.toFixed(2)),
        beat_pct:         earnings.beat_pct,
        pct_above_200ma:  breadth.pct_above_200ma,
      },
    };

    // ── 4. Write to /reports/conviction_YYYY-MM-DD.json ────────────────────
    const dir  = path.join(process.cwd(), 'reports');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `conviction_${today}.json`), JSON.stringify(output, null, 2));

    return res.status(200).json({ ok: true, date: today, conviction_score: output.conviction_score });

  } catch (err) {
    console.error('generate error:', err);
    return res.status(500).json({ error: err.message });
  }
}
