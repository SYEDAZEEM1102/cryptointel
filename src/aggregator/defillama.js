const axios = require('axios');

const DEFAULT_BASE = 'https://api.llama.fi';

function createClient(config = {}) {
  const baseURL = config.baseUrl || DEFAULT_BASE;
  const timeout = config.requestTimeoutMs || 15000;
  const topN = config.topProtocolsLimit || 25;
  const topPools = config.topPoolsLimit || 20;

  const http = axios.create({ baseURL, timeout });

  async function fetchTopProtocols() {
    try {
      console.log('[DeFiLlama] Fetching top protocols by TVL...');
      const { data } = await http.get('/protocols');
      return data.slice(0, topN).map(p => ({
        name: p.name,
        symbol: (p.symbol || '').toUpperCase(),
        tvl: p.tvl,
        change_1d: p.change_1d ?? null,
        change_7d: p.change_7d ?? null,
        category: p.category,
        chains: p.chains || [],
        url: p.url,
      }));
    } catch (err) {
      console.error('[DeFiLlama] fetchTopProtocols error:', err.message);
      return [];
    }
  }

  async function fetchChainTVL() {
    try {
      console.log('[DeFiLlama] Fetching chain TVL breakdown...');
      const { data } = await http.get('/v2/chains');
      return data.map(c => ({
        name: c.name,
        tvl: c.tvl,
        tokenSymbol: (c.tokenSymbol || '').toUpperCase(),
        change_1d: c.change_1d ?? null,
        change_7d: c.change_7d ?? null,
      }));
    } catch (err) {
      console.error('[DeFiLlama] fetchChainTVL error:', err.message);
      return [];
    }
  }

  async function fetchStablecoinFlows() {
    try {
      console.log('[DeFiLlama] Fetching stablecoin flows...');
      const { data } = await http.get('/stablecoins', { baseURL: 'https://stablecoins.llama.fi' });
      const stables = (data.peggedAssets || []).slice(0, 20);
      return stables.map(s => ({
        name: s.name,
        symbol: (s.symbol || '').toUpperCase(),
        circulating: s.circulating?.peggedUSD ?? null,
        change_1d: s.circulatingPrevDay?.peggedUSD
          ? ((s.circulating?.peggedUSD || 0) - s.circulatingPrevDay.peggedUSD)
          : null,
        change_7d: s.circulatingPrevWeek?.peggedUSD
          ? ((s.circulating?.peggedUSD || 0) - s.circulatingPrevWeek.peggedUSD)
          : null,
        chains: s.chains || [],
      }));
    } catch (err) {
      console.error('[DeFiLlama] fetchStablecoinFlows error:', err.message);
      return [];
    }
  }

  async function fetchTopYields() {
    try {
      console.log('[DeFiLlama] Fetching top yields...');
      const { data } = await http.get('/pools', { baseURL: 'https://yields.llama.fi' });
      const pools = (data.data || [])
        .filter(p => p.tvlUsd > 1_000_000)
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, topPools);
      return pools.map(p => ({
        pool: p.pool,
        project: p.project,
        symbol: (p.symbol || '').toUpperCase(),
        chain: p.chain,
        tvlUsd: p.tvlUsd,
        apy: p.apy,
        apyBase: p.apyBase ?? null,
        apyReward: p.apyReward ?? null,
        apyChange_1d: p.apyPct1D ?? null,
        apyChange_7d: p.apyPct7D ?? null,
      }));
    } catch (err) {
      console.error('[DeFiLlama] fetchTopYields error:', err.message);
      return [];
    }
  }

  async function fetchAll() {
    const [protocols, chains, stablecoins, yields] = await Promise.all([
      fetchTopProtocols(),
      fetchChainTVL(),
      fetchStablecoinFlows(),
      fetchTopYields(),
    ]);
    return { protocols, chains, stablecoins, yields, _ts: new Date().toISOString() };
  }

  return { fetchTopProtocols, fetchChainTVL, fetchStablecoinFlows, fetchTopYields, fetchAll };
}

module.exports = { createClient };
