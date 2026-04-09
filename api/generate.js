// /api/generate.js
// Called by Vercel Cron at 06:00 UTC Mon–Fri (美東 02:00，開市前 3.5 小時)
// Can also be triggered manually: GET /api/generate?secret=YOUR_CRON_SECRET

import { computeConviction }               from '../lib/score.js';
import { fetchM2Yoy, fetchFedFundsChange,
         fetchEarningsBeat, fetchBreadth,
         fetchDivergences, getDruckQuote }  from '../lib/fetch.js';
import { MongoClient }                     from 'mongodb';

export const config = { maxDuration: 30 };

let _client;
async function getCollection() {
  if (!_client) {
    _client = new MongoClient(process.env.MONGODB_URI);
    await _client.connect();
  }
  return _client.db('druckenmiller').collection('conviction');
}

export default async function handler(req, res) {
  const cronHeader = req.headers['x-vercel-cron'];
  const secret     = req.query.secret;
  if (!cronHeader && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [m2Yoy, fedChange, earnings, breadth, price] = await Promise.all([
      fetchM2Yoy(),
      fetchFedFundsChange(),
      fetchEarningsBeat(),
      fetchBreadth(),
      fetchDivergences(),
    ]);

    const result = computeConviction({
      liquidity:        { m2_yoy: m2Yoy, fed_funds_change: fedChange },
      forward_earnings: earnings,
      market_breadth:   breadth,
      price_signal:     price,
    });

    const today  = new Date().toISOString().slice(0, 10);
    const output = {
      date:         today,
      generated_at: new Date().toISOString(),
      druck_quote:  getDruckQuote(),
      ...result,
      _raw: {
        m2_yoy:           parseFloat(m2Yoy.toFixed(2)),
        fed_funds_change:  parseFloat(fedChange.toFixed(2)),
        beat_pct:          earnings.beat_pct,
        pct_above_200ma:   breadth.pct_above_200ma,
      },
    };

    const col = await getCollection();
    await col.updateOne(
      { date: today },
      { $set: output },
      { upsert: true }
    );

    return res.status(200).json({ ok: true, date: today, conviction_score: output.conviction_score });

  } catch (err) {
    console.error('generate error:', err);
    return res.status(500).json({ error: err.message });
  }
}
