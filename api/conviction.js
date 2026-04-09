// /api/conviction.js
// GET /api/conviction?date=2026-04-09  (省略 date 则返回今天)

import { MongoClient } from 'mongodb';

let _client;
async function getCollection() {
  if (!_client) {
    _client = new MongoClient(process.env.MONGODB_URI);
    await _client.connect();
  }
  return _client.db('druckenmiller').collection('conviction');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const col  = await getCollection();
    const data = await col.findOne({ date }, { projection: { _id: 0 } });

    if (!data) {
      return res.status(404).json({
        error: '今日數據尚未生成，pipeline 可能尚未執行。',
        date,
      });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
