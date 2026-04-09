// ─── Druckenmiller Conviction Scoring Engine ───────────────────────────────
// Weights: Liquidity 35% | Forward Earnings 25% | Market Breadth 25% | Price 15%

const WEIGHTS = {
  liquidity:        0.35,
  forward_earnings: 0.25,
  market_breadth:   0.25,
  price_signal:     0.15,
};

function scoreToZone(score) {
  if (score >= 85) return { zone: 'fat pitch',            equity_range: '90–100%', action: '全力押注。一年只有一兩次，這是其中之一。' };
  if (score >= 70) return { zone: 'high conviction',      equity_range: '70–89%',  action: '積極加碼。信號清晰，不要猶豫。' };
  if (score >= 50) return { zone: 'moderate',             equity_range: '50–69%',  action: '標準倉位，等催化劑確認。' };
  if (score >= 30) return { zone: 'low conviction',       equity_range: '20–49%',  action: '縮倉。現金是合法倉位，不是懦弱。' };
  return           { zone: 'capital preservation',        equity_range: '0–19%',   action: '最大防禦。不清楚就不揮棒。' };
}

// ── Liquidity signal (FRED: M2 YoY + Fed Funds Rate trend) ──────────────────
function scoreLiquidity({ m2_yoy, fed_funds_change }) {
  // m2_yoy: M2 year-over-year % change
  // fed_funds_change: change in fed funds rate over last 3 months (negative = easing)
  let score = 50;
  let direction = 'neutral';

  if (m2_yoy > 5)         { score += 25; direction = 'expanding'; }
  else if (m2_yoy > 2)    { score += 10; direction = 'expanding'; }
  else if (m2_yoy < -2)   { score -= 25; direction = 'tightening'; }
  else if (m2_yoy < 0)    { score -= 10; direction = 'tightening'; }

  if (fed_funds_change < -0.25)  { score += 20; direction = direction === 'tightening' ? 'pivot' : 'expanding'; }
  else if (fed_funds_change > 0.25) { score -= 15; if (direction !== 'expanding') direction = 'tightening'; }

  return { score: Math.max(0, Math.min(100, score)), direction };
}

// ── Forward Earnings signal (FMP: EPS revisions) ────────────────────────────
function scoreForwardEarnings({ beat_pct, revision_trend }) {
  // beat_pct: % of S&P500 companies beating EPS estimates this quarter
  // revision_trend: analyst revision direction ('up' | 'flat' | 'down')
  let score = 50;
  let direction = 'neutral';

  if (beat_pct > 75)      { score += 20; direction = 'beat'; }
  else if (beat_pct > 65) { score += 8;  direction = 'beat'; }
  else if (beat_pct < 55) { score -= 15; direction = 'miss'; }
  else if (beat_pct < 45) { score -= 25; direction = 'miss'; }

  if (revision_trend === 'up')   { score += 15; }
  else if (revision_trend === 'down') { score -= 15; }

  return { score: Math.max(0, Math.min(100, score)), direction };
}

// ── Market Breadth signal (% stocks above 200MA, advance/decline) ───────────
function scoreMarketBreadth({ pct_above_200ma, adl_trend, blow_off }) {
  // pct_above_200ma: % of S&P500 stocks trading above 200-day MA
  // adl_trend: advance/decline line trend ('rising' | 'flat' | 'falling')
  // blow_off: boolean — parabolic move with diverging internals
  let score = 50;
  let direction = 'neutral';

  if (blow_off)                       { return { score: 30, direction: 'deteriorating', blow_off: true }; }

  if (pct_above_200ma > 70)           { score += 25; direction = 'healthy'; }
  else if (pct_above_200ma > 55)      { score += 10; direction = 'healthy'; }
  else if (pct_above_200ma < 40)      { score -= 20; direction = 'deteriorating'; }
  else if (pct_above_200ma < 30)      { score -= 30; direction = 'deteriorating'; }

  if (adl_trend === 'rising')         { score += 10; }
  else if (adl_trend === 'falling')   { score -= 10; }

  return { score: Math.max(0, Math.min(100, score)), direction };
}

// ── Price Signal (divergences: beat earnings but stock sold off) ────────────
function scorePriceSignal({ divergences, spy_trend }) {
  // divergences: array of tickers that beat earnings but sold off >3%
  // spy_trend: 'up' | 'sideways' | 'down' over 3 months
  let score = 50;
  let direction = 'neutral';

  const divCount = (divergences || []).length;
  if (divCount === 0)       { score += 15; }
  else if (divCount <= 2)   { score -= 10; direction = 'bearish'; }
  else if (divCount <= 5)   { score -= 20; direction = 'bearish'; }
  else                      { score -= 30; direction = 'bearish'; }

  if (spy_trend === 'up')        { score += 10; if (direction === 'neutral') direction = 'bullish'; }
  else if (spy_trend === 'down') { score -= 10; }

  return { score: Math.max(0, Math.min(100, score)), direction };
}

// ── Master compute function ──────────────────────────────────────────────────
export function computeConviction({ liquidity, forward_earnings, market_breadth, price_signal }) {
  const liq  = scoreLiquidity(liquidity);
  const earn = scoreForwardEarnings(forward_earnings);
  const mkt  = scoreMarketBreadth(market_breadth);
  const prc  = scorePriceSignal(price_signal);

  const total = Math.round(
    liq.score  * WEIGHTS.liquidity +
    earn.score * WEIGHTS.forward_earnings +
    mkt.score  * WEIGHTS.market_breadth +
    prc.score  * WEIGHTS.price_signal
  );

  const { zone, equity_range, action } = scoreToZone(total);

  return {
    conviction_score: total,
    conviction_zone:  zone,
    equity_range,
    action,
    blow_off_risk: !!mkt.blow_off,
    notable_divergences: price_signal.divergences || [],
    components: {
      liquidity:        { score: liq.score,  direction: liq.direction },
      forward_earnings: { score: earn.score, direction: earn.direction },
      market_breadth:   { score: mkt.score,  direction: mkt.direction },
      price_signal:     { score: prc.score,  direction: prc.direction },
    },
  };
}
