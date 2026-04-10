// /api/conviction.js
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const col = await getCollection();

    // 先精确找今天，找不到就返回最新一条
    let data = await col.findOne({ date }, { projection: { _id: 0 } });
    if (!data) {
      data = await col.findOne({}, { sort: { date: -1 }, projection: { _id: 0 } });
    }

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
