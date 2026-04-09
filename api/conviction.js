// /api/conviction.js
// GET /api/conviction?date=2026-04-09  (or omit for today)
// The Dashboard fetches /reports/conviction_YYYY-MM-DD.json directly as a static file,
// but this endpoint also works and adds CORS headers.

import { readFile } from 'fs/promises';
import path         from 'path';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const file = path.join(process.cwd(), 'reports', `conviction_${date}.json`);

  try {
    const raw  = await readFile(file, 'utf8');
    const data = JSON.parse(raw);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(data);
  } catch {
    return res.status(404).json({
      error: '今日數據尚未生成，pipeline 可能尚未執行。',
      date,
    });
  }
}
