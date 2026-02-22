const axios = require('axios');
const path = require('path');

let config;
try { config = require(path.resolve(__dirname, '../../config/config.json')); } catch { config = {}; }

const TIMEOUT = config?.aggregator?.requestTimeoutMs || 15000;
const SYMBOLS = config?.aggregator?.coinglass?.symbols || ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'SUI', 'APT'];
const EXTREME_THRESHOLD = 0.03; // 0.03%

// Use CoinGlass public endpoints + fallback to alternative free sources
const COINGLASS_BASE = config?.aggregator?.coinglass?.baseUrl || 'https://open-api.coinglass.com/public/v2';

const ax = axios.create({ timeout: TIMEOUT });

async function fetchFundingFromCoinglass() {
  // CoinGlass public funding rate endpoint
  try {
    const { data } = await ax.get(`${COINGLASS_BASE}/funding`, {
      headers: { 'accept': 'application/json' },
    });
    if (data?.success && data?.data) return data.data;
  } catch { /* fall through */ }
  return null;
}

async function fetchFundingFromAlternative() {
  // Fallback: use CoinGecko derivatives/exchanges for basic funding data
  try {
    const { data } = await ax.get('https://api.coingecko.com/api/v3/derivatives/exchanges', {
      params: { per_page: 10 },
    });
    return data;
  } catch { return null; }
}

function analyzeFunding(rawData) {
  const extreme = [];
  const divergences = [];

  if (!rawData || !Array.isArray(rawData)) return { extreme, divergences, raw: rawData };

  for (const item of rawData) {
    const symbol = item.symbol || item.uMarginList?.[0]?.symbol || '';
    const upperSymbol = symbol.toUpperCase();
    if (!SYMBOLS.some(s => upperSymbol.includes(s))) continue;

    // Handle CoinGlass format
    const marginList = item.uMarginList || item.cMarginList || [];
    const rates = [];

    for (const entry of marginList) {
      const rate = parseFloat(entry.rate);
      if (isNaN(rate)) continue;
      const exchange = entry.exchangeName || 'unknown';
      rates.push({ exchange, rate, symbol: entry.symbol });

      if (Math.abs(rate) > EXTREME_THRESHOLD) {
        extreme.push({
          symbol: entry.symbol || symbol,
          exchange,
          rate: parseFloat(rate.toFixed(4)),
          direction: rate > 0 ? 'long_heavy' : 'short_heavy',
        });
      }
    }

    // Check for divergences (spread between highest and lowest funding on same asset)
    if (rates.length >= 2) {
      const sorted = rates.sort((a, b) => a.rate - b.rate);
      const spread = sorted[sorted.length - 1].rate - sorted[0].rate;
      if (spread > EXTREME_THRESHOLD) {
        divergences.push({
          symbol: symbol,
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
    let raw = await fetchFundingFromCoinglass();
    if (!raw) {
      raw = await fetchFundingFromAlternative();
      results.summary = 'Used fallback data source (CoinGecko derivatives). Data may be limited.';
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
