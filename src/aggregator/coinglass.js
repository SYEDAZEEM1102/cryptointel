const axios = require('axios');

const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'SUI', 'APT'];

// Binance symbol mapping (futures pairs)
const BINANCE_PAIRS = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', AVAX: 'AVAXUSDT',
  ARB: 'ARBUSDT', OP: 'OPUSDT', SUI: 'SUIUSDT', APT: 'APTUSDT',
  BNB: 'BNBUSDT', XRP: 'XRPUSDT', DOGE: 'DOGEUSDT', ADA: 'ADAUSDT', LINK: 'LINKUSDT',
};

const BYBIT_PAIRS = { ...BINANCE_PAIRS }; // same naming convention

function createClient(config = {}) {
  const timeout = config.requestTimeoutMs || 15000;
  const symbols = config.symbols || DEFAULT_SYMBOLS;
  const ax = axios.create({ timeout });

  // ─── Funding Rates ───
  async function fetchBinanceFunding(symbol) {
    const pair = BINANCE_PAIRS[symbol];
    if (!pair) return null;
    const { data } = await ax.get('https://fapi.binance.com/fapi/v1/fundingRate', {
      params: { symbol: pair, limit: 1 },
    });
    if (!data?.length) return null;
    const d = data[0];
    return { symbol, exchange: 'Binance', rate: parseFloat(d.fundingRate), time: d.fundingTime, pair };
  }

  async function fetchBybitFunding(symbol) {
    const pair = BYBIT_PAIRS[symbol];
    if (!pair) return null;
    const { data } = await ax.get('https://api.bybit.com/v5/market/tickers', {
      params: { category: 'linear', symbol: pair },
    });
    const item = data?.result?.list?.[0];
    if (!item) return null;
    return { symbol, exchange: 'Bybit', rate: parseFloat(item.fundingRate), time: Date.now(), pair, nextFundingTime: item.nextFundingTime };
  }

  async function fetchFundingRates() {
    console.log('[CoinGlass/Free] Fetching funding rates from Binance + Bybit...');
    const results = [];
    const tasks = symbols.flatMap(s => [
      fetchBinanceFunding(s).catch(() => null),
      fetchBybitFunding(s).catch(() => null),
    ]);
    const settled = await Promise.all(tasks);
    for (const r of settled) if (r) results.push(r);
    return { raw: results, source: 'binance+bybit' };
  }

  // ─── Open Interest ───
  async function fetchBinanceOI(symbol) {
    const pair = BINANCE_PAIRS[symbol];
    if (!pair) return null;
    const { data } = await ax.get('https://fapi.binance.com/fapi/v1/openInterest', {
      params: { symbol: pair },
    });
    return { symbol, exchange: 'Binance', openInterest: parseFloat(data.openInterest), pair, time: data.time };
  }

  async function fetchBybitOI(symbol) {
    const pair = BYBIT_PAIRS[symbol];
    if (!pair) return null;
    const { data } = await ax.get('https://api.bybit.com/v5/market/open-interest', {
      params: { category: 'linear', symbol: pair, intervalTime: '1h', limit: 1 },
    });
    const item = data?.result?.list?.[0];
    if (!item) return null;
    return { symbol, exchange: 'Bybit', openInterest: parseFloat(item.openInterest), pair, time: parseInt(item.timestamp) };
  }

  async function fetchOpenInterest() {
    console.log('[CoinGlass/Free] Fetching open interest from Binance + Bybit...');
    const results = [];
    const tasks = symbols.flatMap(s => [
      fetchBinanceOI(s).catch(() => null),
      fetchBybitOI(s).catch(() => null),
    ]);
    const settled = await Promise.all(tasks);
    for (const r of settled) if (r) results.push(r);
    return { raw: results, source: 'binance+bybit' };
  }

  // ─── Liquidations ───
  // Binance doesn't have a public liquidation history endpoint, but has forceOrders websocket.
  // We'll use Bybit + CoinGlass public API attempt as fallback.
  async function fetchCoinGlassLiquidations() {
    try {
      const { data } = await ax.get('https://open-api-v3.coinglass.com/api/futures/liquidation/v2/home', {
        headers: { accept: 'application/json' },
        timeout: 8000,
      });
      if (data?.data) return data.data;
    } catch { /* fall through */ }
    return null;
  }

  async function fetchLiquidations() {
    console.log('[CoinGlass/Free] Fetching liquidation data...');
    // Try CoinGlass public endpoint first
    const cgData = await fetchCoinGlassLiquidations();
    if (cgData) return { raw: cgData, source: 'coinglass-public' };

    // Fallback: aggregate from Binance forceOrders (recent only)
    const results = [];
    for (const s of symbols.slice(0, 4)) { // limit to avoid rate limits
      const pair = BINANCE_PAIRS[s];
      if (!pair) continue;
      try {
        const { data } = await ax.get('https://fapi.binance.com/fapi/v1/allForceOrders', {
          params: { symbol: pair, limit: 20 },
        });
        if (data?.length) {
          let longLiq = 0, shortLiq = 0;
          for (const o of data) {
            const val = parseFloat(o.price) * parseFloat(o.origQty);
            if (o.side === 'SELL') longLiq += val; // long position liquidated
            else shortLiq += val;
          }
          results.push({ symbol: s, exchange: 'Binance', longLiquidations: longLiq, shortLiquidations: shortLiq, count: data.length });
        }
      } catch { /* skip */ }
    }
    return { raw: results, source: 'binance-forceorders' };
  }

  // ─── Long/Short Ratio ───
  async function fetchBinanceLSRatio(symbol) {
    const pair = BINANCE_PAIRS[symbol];
    if (!pair) return null;
    const { data } = await ax.get('https://fapi.binance.com/futures/data/globalLongShortAccountRatio', {
      params: { symbol: pair, period: '1h', limit: 1 },
    });
    if (!data?.length) return null;
    const d = data[0];
    return { symbol, exchange: 'Binance', longAccount: parseFloat(d.longAccount), shortAccount: parseFloat(d.shortAccount), longShortRatio: parseFloat(d.longShortRatio), time: d.timestamp };
  }

  async function fetchLongShortRatio() {
    console.log('[CoinGlass/Free] Fetching long/short ratios from Binance...');
    const results = [];
    const tasks = symbols.map(s => fetchBinanceLSRatio(s).catch(() => null));
    const settled = await Promise.all(tasks);
    for (const r of settled) if (r) results.push(r);
    return { raw: results, source: 'binance' };
  }

  // ─── Fetch All ───
  async function fetchAll() {
    const [fundingRates, openInterest, liquidations, longShortRatio] = await Promise.all([
      fetchFundingRates(),
      fetchOpenInterest(),
      fetchLiquidations(),
      fetchLongShortRatio(),
    ]);
    return { fundingRates, openInterest, liquidations, longShortRatio, symbols, _ts: new Date().toISOString() };
  }

  return { fetchFundingRates, fetchOpenInterest, fetchLiquidations, fetchLongShortRatio, fetchAll };
}

module.exports = { createClient };
