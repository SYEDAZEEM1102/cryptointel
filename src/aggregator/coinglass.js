const axios = require('axios');

const DEFAULT_BASE = 'https://open-api.coinglass.com/public/v2';
const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'ARB'];

function createClient(config = {}) {
  const baseURL = config.baseUrl || DEFAULT_BASE;
  const timeout = config.requestTimeoutMs || 15000;
  const symbols = config.symbols || DEFAULT_SYMBOLS;

  const http = axios.create({ baseURL, timeout });

  // CoinGlass public endpoints are rate-limited and may require API key.
  // We attempt public access and fall back to structured empty data.

  async function fetchFundingRates() {
    try {
      console.log('[CoinGlass] Fetching funding rates...');
      const { data } = await http.get('/funding', { params: { symbol: 'BTC' } });
      if (data.success === false) throw new Error(data.msg || 'API error');
      return { raw: data.data || [], source: 'coinglass' };
    } catch (err) {
      console.error('[CoinGlass] fetchFundingRates error:', err.message);
      // Return structured placeholder
      return {
        raw: [],
        source: 'coinglass',
        error: err.message,
        symbols,
        note: 'Funding rate data unavailable - API may require key',
      };
    }
  }

  async function fetchOpenInterest() {
    try {
      console.log('[CoinGlass] Fetching open interest...');
      const { data } = await http.get('/open_interest', { params: { symbol: 'BTC' } });
      if (data.success === false) throw new Error(data.msg || 'API error');
      return { raw: data.data || [], source: 'coinglass' };
    } catch (err) {
      console.error('[CoinGlass] fetchOpenInterest error:', err.message);
      return {
        raw: [],
        source: 'coinglass',
        error: err.message,
        symbols,
        note: 'Open interest data unavailable',
      };
    }
  }

  async function fetchLiquidations() {
    try {
      console.log('[CoinGlass] Fetching liquidation data...');
      const { data } = await http.get('/liquidation', { params: { symbol: 'BTC' } });
      if (data.success === false) throw new Error(data.msg || 'API error');
      return { raw: data.data || [], source: 'coinglass' };
    } catch (err) {
      console.error('[CoinGlass] fetchLiquidations error:', err.message);
      return {
        raw: [],
        source: 'coinglass',
        error: err.message,
        symbols,
        note: 'Liquidation data unavailable',
      };
    }
  }

  async function fetchLongShortRatio() {
    try {
      console.log('[CoinGlass] Fetching long/short ratios...');
      const { data } = await http.get('/long_short', { params: { symbol: 'BTC' } });
      if (data.success === false) throw new Error(data.msg || 'API error');
      return { raw: data.data || [], source: 'coinglass' };
    } catch (err) {
      console.error('[CoinGlass] fetchLongShortRatio error:', err.message);
      return {
        raw: [],
        source: 'coinglass',
        error: err.message,
        symbols,
        note: 'Long/short ratio data unavailable',
      };
    }
  }

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
