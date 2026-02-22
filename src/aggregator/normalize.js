/**
 * normalize.js - Merges raw data from DeFiLlama, CoinGecko, and CoinGlass
 * into a unified structured object.
 */

// Canonical symbol mapping for common aliases
const SYMBOL_MAP = {
  WETH: 'ETH', WBTC: 'BTC', STETH: 'ETH', RETH: 'ETH',
  'USDC.E': 'USDC', BUSD: 'BUSD', DAI: 'DAI',
};

function unifySymbol(sym) {
  if (!sym) return 'UNKNOWN';
  const upper = sym.toUpperCase().trim();
  return SYMBOL_MAP[upper] || upper;
}

function toUTCTimestamp(ts) {
  if (!ts) return new Date().toISOString();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function buildMarketOverview(geckoData) {
  const g = geckoData.global || {};
  const tokens = geckoData.tokens || [];
  const btc = tokens.find(t => t.symbol === 'BTC');
  const eth = tokens.find(t => t.symbol === 'ETH');

  return {
    total_market_cap_usd: g.total_market_cap_usd ?? null,
    total_volume_24h_usd: g.total_volume_24h_usd ?? null,
    market_cap_change_24h_pct: g.market_cap_change_24h_pct ?? null,
    btc_dominance: g.btc_dominance ?? null,
    eth_dominance: g.eth_dominance ?? null,
    btc_price: btc?.price ?? null,
    eth_price: eth?.price ?? null,
    top_tokens: tokens.slice(0, 20).map(t => ({
      symbol: unifySymbol(t.symbol),
      name: t.name,
      price: t.price,
      market_cap: t.market_cap,
      volume_24h: t.volume_24h,
      change_24h_pct: t.change_24h_pct,
      change_7d_pct: t.change_7d_pct,
    })),
  };
}

function buildTVLData(llamaData) {
  return {
    top_protocols: (llamaData.protocols || []).map(p => ({
      name: p.name,
      symbol: unifySymbol(p.symbol),
      tvl: p.tvl,
      change_1d: p.change_1d,
      change_7d: p.change_7d,
      category: p.category,
    })),
    chain_breakdown: (llamaData.chains || []).slice(0, 30).map(c => ({
      chain: c.name,
      tvl: c.tvl,
      change_1d: c.change_1d,
      change_7d: c.change_7d,
    })),
    top_yields: (llamaData.yields || []).map(y => ({
      project: y.project,
      symbol: unifySymbol(y.symbol),
      chain: y.chain,
      tvl_usd: y.tvlUsd,
      apy: y.apy,
      apy_base: y.apyBase,
      apy_reward: y.apyReward,
    })),
  };
}

function buildDerivatives(glassData) {
  return {
    funding_rates: glassData.fundingRates || {},
    open_interest: glassData.openInterest || {},
    liquidations: glassData.liquidations || {},
    long_short_ratio: glassData.longShortRatio || {},
    tracked_symbols: glassData.symbols || [],
  };
}

function buildStablecoinFlows(llamaData) {
  const stables = llamaData.stablecoins || [];
  const totalCirculating = stables.reduce((sum, s) => sum + (s.circulating || 0), 0);
  const totalChange1d = stables.reduce((sum, s) => sum + (s.change_1d || 0), 0);
  const totalChange7d = stables.reduce((sum, s) => sum + (s.change_7d || 0), 0);

  return {
    total_circulating_usd: totalCirculating,
    net_flow_1d: totalChange1d,
    net_flow_7d: totalChange7d,
    breakdown: stables.map(s => ({
      symbol: unifySymbol(s.symbol),
      name: s.name,
      circulating: s.circulating,
      change_1d: s.change_1d,
      change_7d: s.change_7d,
    })),
  };
}

function buildTopMovers(geckoData) {
  const tokens = geckoData.tokens || [];
  const withChange = tokens.filter(t => t.change_24h_pct != null);
  const sorted = [...withChange].sort((a, b) => (b.change_24h_pct || 0) - (a.change_24h_pct || 0));

  return {
    gainers_24h: sorted.slice(0, 10).map(t => ({
      symbol: unifySymbol(t.symbol),
      name: t.name,
      price: t.price,
      change_24h_pct: t.change_24h_pct,
      volume_24h: t.volume_24h,
    })),
    losers_24h: sorted.slice(-10).reverse().map(t => ({
      symbol: unifySymbol(t.symbol),
      name: t.name,
      price: t.price,
      change_24h_pct: t.change_24h_pct,
      volume_24h: t.volume_24h,
    })),
  };
}

function normalize(geckoData = {}, llamaData = {}, glassData = {}) {
  console.log('[Normalize] Merging data from all sources...');

  return {
    timestamp: toUTCTimestamp(),
    market_overview: buildMarketOverview(geckoData),
    tvl_data: buildTVLData(llamaData),
    derivatives: buildDerivatives(glassData),
    stablecoin_flows: buildStablecoinFlows(llamaData),
    top_movers: buildTopMovers(geckoData),
    _meta: {
      sources: {
        coingecko: { ts: toUTCTimestamp(geckoData._ts), hasData: (geckoData.tokens || []).length > 0 },
        defillama: { ts: toUTCTimestamp(llamaData._ts), hasData: (llamaData.protocols || []).length > 0 },
        coinglass: { ts: toUTCTimestamp(glassData._ts), hasData: !!(glassData.fundingRates?.raw?.length) },
      },
    },
  };
}

module.exports = { normalize, unifySymbol, toUTCTimestamp };
