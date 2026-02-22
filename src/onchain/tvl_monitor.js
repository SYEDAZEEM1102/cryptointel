const axios = require('axios');
const path = require('path');

let config;
try { config = require(path.resolve(__dirname, '../../config/config.json')); } catch { config = {}; }

const BASE = config?.aggregator?.defillama?.baseUrl || 'https://api.llama.fi';
const TIMEOUT = config?.aggregator?.requestTimeoutMs || 15000;
const TOP_LIMIT = config?.aggregator?.defillama?.topProtocolsLimit || 25;

const ax = axios.create({ baseURL: BASE, timeout: TIMEOUT });

async function fetchProtocols() {
  const { data } = await ax.get('/protocols');
  return data;
}

async function fetchChains() {
  const { data } = await ax.get('/v2/chains');
  return data;
}

async function monitorTVL() {
  const results = { bigMovers: [], chainTrends: [], newTop100: [], errors: [] };

  // Protocol TVL changes
  try {
    const protocols = await fetchProtocols();
    const sorted = protocols
      .filter(p => p.tvl && p.tvl > 0)
      .sort((a, b) => (b.tvl || 0) - (a.tvl || 0));

    const top100 = sorted.slice(0, 100);

    for (const p of top100) {
      const change24h = p.change_1d ?? null;
      if (change24h !== null && Math.abs(change24h) > 10) {
        results.bigMovers.push({
          protocol: p.name,
          slug: p.slug,
          chain: p.chain,
          tvl: p.tvl,
          change24h: parseFloat(change24h.toFixed(2)),
          category: p.category,
          rank: top100.indexOf(p) + 1,
        });
      }
    }

    // Detect "new entrants" — protocols in top 100 with very high 7d change (proxy for new)
    for (const p of top100) {
      const change7d = p.change_7d ?? null;
      if (change7d !== null && change7d > 100) {
        results.newTop100.push({
          protocol: p.name,
          tvl: p.tvl,
          change7d: parseFloat(change7d.toFixed(2)),
          category: p.category,
          rank: top100.indexOf(p) + 1,
        });
      }
    }
  } catch (e) {
    results.errors.push(`protocols: ${e.message}`);
  }

  // Chain TVL trends
  try {
    const chains = await fetchChains();
    const withTvl = chains.filter(c => c.tvl && c.tvl > 0).sort((a, b) => b.tvl - a.tvl);

    const topChains = withTvl.slice(0, 30).map(c => ({
      chain: c.name || c.gecko_id,
      tvl: c.tvl,
      tokenSymbol: c.tokenSymbol || null,
    }));

    // Sort by relative change if available from protocol aggregation
    results.chainTrends = topChains;
  } catch (e) {
    results.errors.push(`chains: ${e.message}`);
  }

  return results;
}

module.exports = { monitorTVL };
