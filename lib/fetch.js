// ─── Data Fetchers ────────────────────────────────────────────────────────────

const FRED_KEY = process.env.FRED_API_KEY;
const FMP_KEY  = process.env.FMP_API_KEY;

// ── FRED: M2 Money Supply YoY % change ──────────────────────────────────────
export async function fetchM2Yoy() {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&sort_order=desc&limit=14&api_key=${FRED_KEY}&file_type=json`;
  const res  = await fetch(url);
  const data = await res.json();
  const obs  = data.observations.filter(o => o.value !== '.');
  if (obs.length < 13) return 0;
  const latest   = parseFloat(obs[0].value);
  const yearAgo  = parseFloat(obs[12].value);
  return ((latest - yearAgo) / yearAgo) * 100;
}

// ── FRED: Fed Funds Rate — 3-month change ────────────────────────────────────
export async function fetchFedFundsChange() {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&sort_order=desc&limit=4&api_key=${FRED_KEY}&file_type=json`;
  const res  = await fetch(url);
  const data = await res.json();
  const obs  = data.observations.filter(o => o.value !== '.');
  if (obs.length < 4) return 0;
  return parseFloat(obs[0].value) - parseFloat(obs[3].value);
}

// ── FMP: S&P500 earnings beat rate this quarter ──────────────────────────────
export async function fetchEarningsBeat() {
  // FMP earnings calendar — last 90 days, count beats
  const today    = new Date();
  const from     = new Date(today - 90 * 86400000).toISOString().slice(0, 10);
  const to       = today.toISOString().slice(0, 10);
  const url      = `https://financialmodelingprep.com/api/v3/earnings-surprises?from=${from}&to=${to}&apikey=${FMP_KEY}`;
  const res      = await fetch(url);
  const data     = await res.json();
  if (!Array.isArray(data) || data.length === 0) return { beat_pct: 65, revision_trend: 'flat' };
  const beats    = data.filter(e => e.actualEarningResult > e.estimatedEarning).length;
  const beat_pct = Math.round((beats / data.length) * 100);
  const avgSurp  = data.reduce((a, e) => a + (e.actualEarningResult - e.estimatedEarning), 0) / data.length;
  return {
    beat_pct,
    revision_trend: avgSurp > 0.05 ? 'up' : avgSurp < -0.05 ? 'down' : 'flat',
  };
}

// ── FMP: % of S&P500 stocks above 200-day MA ────────────────────────────────
export async function fetchBreadth() {
  // Use FMP stock screener: filter S&P500 components above 200MA
  const url      = `https://financialmodelingprep.com/api/v3/stock-screener?exchange=NYSE,NASDAQ&marketCapMoreThan=10000000000&limit=500&apikey=${FMP_KEY}`;
  const res      = await fetch(url);
  const stocks   = await res.json();
  if (!Array.isArray(stocks) || stocks.length === 0) return { pct_above_200ma: 55, adl_trend: 'flat', blow_off: false };
  let above = 0;
  for (const s of stocks) {
    if (s.price && s.priceAvg200 && s.price > s.priceAvg200) above++;
  }
  const pct = Math.round((above / stocks.length) * 100);
  return {
    pct_above_200ma: pct,
    adl_trend: pct > 60 ? 'rising' : pct < 45 ? 'falling' : 'flat',
    blow_off:  pct > 80,
  };
}

// ── FMP: Price divergences — beat earnings but price fell ───────────────────
export async function fetchDivergences() {
  const today = new Date();
  const from  = new Date(today - 60 * 86400000).toISOString().slice(0, 10);
  const to    = today.toISOString().slice(0, 10);
  const url   = `https://financialmodelingprep.com/api/v3/earnings-surprises?from=${from}&to=${to}&apikey=${FMP_KEY}`;
  const res   = await fetch(url);
  const data  = await res.json();
  if (!Array.isArray(data)) return { divergences: [], spy_trend: 'sideways' };

  // Beat earnings but stock sold off > 3% on earnings day
  const divs = [];
  for (const e of data) {
    if (e.actualEarningResult > e.estimatedEarning && e.symbol) {
      // Check price reaction — use FMP quote endpoint
      try {
        const qr  = await fetch(`https://financialmodelingprep.com/api/v3/quote-short/${e.symbol}?apikey=${FMP_KEY}`);
        const qt  = await qr.json();
        if (Array.isArray(qt) && qt[0]?.changesPercentage < -3) {
          divs.push(e.symbol);
        }
      } catch (_) {}
    }
    if (divs.length >= 8) break; // cap at 8
  }

  // SPY trend — 3-month
  const spyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/SPY?timeseries=90&apikey=${FMP_KEY}`;
  const spyRes = await fetch(spyUrl);
  const spyData = await spyRes.json();
  let spy_trend = 'sideways';
  if (spyData?.historical?.length > 60) {
    const first  = spyData.historical[spyData.historical.length - 1].close;
    const latest = spyData.historical[0].close;
    const chg    = (latest - first) / first;
    spy_trend    = chg > 0.04 ? 'up' : chg < -0.04 ? 'down' : 'sideways';
  }

  return { divergences: divs, spy_trend };
}

// ── Druckenmiller quotes pool (rotates daily) ────────────────────────────────
const QUOTES = [
  '流動性在說什麼？永遠先問這個問題。',
  '正確的時候，要敢於重押。只有分析正確但倉位太小，跟分析錯誤一樣毫無意義。',
  '我從來不用「明天市場會怎樣」來做決策。我問的是流動性正在往哪個方向走。',
  '現金是合法倉位。持有現金不是懦弱，是紀律。',
  '當你看不清楚，不要揮棒。等到你能清楚看見的時候，再重重揮一次。',
  '市場比你我都聰明。它知道的事情，往往在六個月後才會出現在新聞裡。',
  'Fat pitch 一年只有一兩次。其他時間是等待，不是行動。',
];

export function getDruckQuote() {
  const day = new Date().getDay();
  return QUOTES[day % QUOTES.length];
}
