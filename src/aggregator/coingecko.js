const axios = require('axios');

const DEFAULT_BASE = 'https://api.coingecko.com/api/v3';

function createClient(config = {}) {
  const baseURL = config.baseUrl || DEFAULT_BASE;
  const timeout = config.requestTimeoutMs || 15000;
  const limit = config.topTokensLimit || 50;
  const currency = config.currency || 'usd';

  const http = axios.create({ baseURL, timeout });

  async function fetchTopTokens() {
    try {
      console.log('[CoinGecko] Fetching top tokens by market cap...');
      const pages = Math.ceil(limit / 250);
      let all = [];
      for (let page = 1; page <= pages; page++) {
        const { data } = await http.get('/coins/markets', {
          params: {
            vs_currency: currency,
            order: 'market_cap_desc',
            per_page: Math.min(250, limit - all.length),
            page,
            sparkline: false,
            price_change_percentage: '24h,7d',
          },
        });
        all = all.concat(data);
      }
      return all.slice(0, limit).map(t => ({
        id: t.id,
        symbol: (t.symbol || '').toUpperCase(),
        name: t.name,
        price: t.current_price,
        market_cap: t.market_cap,
        market_cap_rank: t.market_cap_rank,
        volume_24h: t.total_volume,
        change_24h_pct: t.price_change_percentage_24h ?? null,
        change_7d_pct: t.price_change_percentage_7d_in_currency ?? null,
        ath: t.ath,
        ath_change_pct: t.ath_change_percentage ?? null,
        circulating_supply: t.circulating_supply,
        total_supply: t.total_supply,
      }));
    } catch (err) {
      console.error('[CoinGecko] fetchTopTokens error:', err.message);
      return [];
    }
  }

  async function fetchGlobalData() {
    try {
      console.log('[CoinGecko] Fetching global market data...');
      const { data } = await http.get('/global');
      const g = data.data || {};
      return {
        total_market_cap_usd: g.total_market_cap?.usd ?? null,
        total_volume_24h_usd: g.total_volume?.usd ?? null,
        market_cap_change_24h_pct: g.market_cap_change_percentage_24h_usd ?? null,
        btc_dominance: g.market_cap_percentage?.btc ?? null,
        eth_dominance: g.market_cap_percentage?.eth ?? null,
        active_cryptocurrencies: g.active_cryptocurrencies ?? null,
      };
    } catch (err) {
      console.error('[CoinGecko] fetchGlobalData error:', err.message);
      return {};
    }
  }

  async function fetchAll() {
    const [tokens, global] = await Promise.all([fetchTopTokens(), fetchGlobalData()]);
    return { tokens, global, _ts: new Date().toISOString() };
  }

  return { fetchTopTokens, fetchGlobalData, fetchAll };
}

module.exports = { createClient };
