const axios = require('axios');
const path = require('path');

let config;
try { config = require(path.resolve(__dirname, '../../config/config.json')); } catch { config = {}; }

const TIMEOUT = config?.aggregator?.requestTimeoutMs || 15000;
const SYMBOLS = config?.aggregator?.coinglass?.symbols || ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'SUI', 'APT'];
const EXTREME_THRESHOLD = 0.03; // 0.03%

const PAIRS = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', AVAX: 'AVAXUSDT',
  ARB: 'ARBUSDT', OP: 'OPUSDT', SUI: 'SUIUSDT', APT: 'APTUSDT',
};

const ax = axios.create({ timeout: TIMEOUT });

async function fetchFundingFromBinance() {
  const results = [];
  for (const [sym, pair] of Object.entries(PAIRS)) {
    if (!SYMBOLS.includes(sym)) continue;
    try {
      const { data } = await ax.get('https://fapi.binance.com/fapi/v1/fundingRate', {
        params: { symbol: pair, limit: 1 },
      });
      if (data?.[0]) {
        results.push({ symbol: sym, exchange: 'Binance', rate: parseFloat(data[0].fundingRate), pair });
      }
    } catch { /* skip */ }
  }
  return results.length ? results : null;
}

async function fetchFundingFromBybit() {
  const results = [];
  for (const [sym, pair] of Object.entries(PAIRS)) {
    if (!SYMBOLS.includes(sym)) continue;
    try {
      const { data } = await ax.get('https://api.bybit.com/v5/market/tickers', {
        params: { category: 'linear', symbol: pair },
      });
      const item = data?.result?.list?.[0];
      if (item) {
        results.push({ symbol: sym, exchange: 'Bybit', rate: parseFloat(item.fundingRate), pair });
      }
    } catch { /* skip */ }
  }
  return results.length ? results : null;
}

function analyzeFunding(rawData) {
  const extreme = [];
  const divergences = [];

  if (!rawData || !Array.isArray(rawData)) return { extreme, divergences, raw: rawData };

  // Group by symbol
  const bySymbol = {};
  for (const item of rawData) {
    const sym = item.symbol;
    if (!bySymbol[sym]) bySymbol[sym] = [];
    bySymbol[sym].push(item);

    if (Math.abs(item.rate) > EXTREME_THRESHOLD) {
      extreme.push({
        symbol: sym,
        exchange: item.exchange,
        rate: parseFloat(item.rate.toFixed(4)),
        direction: item.rate > 0 ? 'long_heavy' : 'short_heavy',
      });
    }
  }

  // Check for divergences between exchanges
  for (const [sym, rates] of Object.entries(bySymbol)) {
    if (rates.length >= 2) {
      const sorted = rates.sort((a, b) => a.rate - b.rate);
      const spread = sorted[sorted.length - 1].rate - sorted[0].rate;
      if (spread > EXTREME_THRESHOLD) {
        divergences.push({
          symbol: sym,
          highExchange: sorted[sorted.length - 1].exchange,
          highRate: sorted[sorted.length - 1].rate,
          lowExchange: sorted[0].exchange,
          lowRate: sorted[0].rate,
          spread: parseFloat(spread.toFixed(4)),
        });
      }
    }
  }

  return { extreme, divergences };
}

async function monitorFunding() {
  const results = { extreme: [], divergences: [], summary: null, errors: [] };

  try {
    let raw = await fetchFundingFromBinance();
    if (!raw) {
      raw = await fetchFundingFromBybit();
      results.summary = 'Used Bybit fallback. Binance data unavailable.';
    } else {
      // Also fetch Bybit to compare cross-exchange
      const bybitData = await fetchFundingFromBybit();
      if (bybitData) raw = raw.concat(bybitData);
    }

    if (raw) {
      const analysis = analyzeFunding(raw);
      results.extreme = analysis.extreme;
      results.divergences = analysis.divergences;
    } else {
      results.errors.push('All funding data sources failed');
    }
  } catch (e) {
    results.errors.push(`funding: ${e.message}`);
  }

  return results;
}

module.exports = { monitorFunding };
