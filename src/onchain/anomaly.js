/**
 * Anomaly scoring and categorization engine.
 * Takes raw on-chain data from all collectors, scores and ranks anomalies.
 */

const CATEGORIES = {
  WHALE_MOVEMENT: 'whale_movement',
  TVL_SHIFT: 'tvl_shift',
  FUNDING_EXTREME: 'funding_extreme',
  LIQUIDATION_CASCADE: 'liquidation_cascade',
  EXCHANGE_FLOW: 'exchange_flow',
};

function scoreTVLAnomalies(tvlData) {
  const anomalies = [];

  for (const mover of (tvlData.bigMovers || [])) {
    const absChange = Math.abs(mover.change24h);
    // Score: 10% = 3, 25% = 5, 50%+ = 8, 80%+ = 10
    let severity = Math.min(10, Math.max(1, Math.floor(absChange / 10) + 2));
    if (absChange > 50) severity = Math.max(severity, 8);
    if (absChange > 80) severity = 10;

    const direction = mover.change24h > 0 ? 'surge' : 'dump';
    anomalies.push({
      category: CATEGORIES.TVL_SHIFT,
      severity,
      title: `${mover.protocol} TVL ${direction}: ${mover.change24h > 0 ? '+' : ''}${mover.change24h}%`,
      explanation: `${mover.protocol} (rank #${mover.rank}, ${mover.category || 'DeFi'}) saw a ${absChange.toFixed(1)}% TVL ${direction} in 24h. Current TVL: $${formatLargeNum(mover.tvl)}.`,
      data: mover,
      timestamp: new Date().toISOString(),
    });
  }

  for (const entry of (tvlData.newTop100 || [])) {
    anomalies.push({
      category: CATEGORIES.TVL_SHIFT,
      severity: 6,
      title: `New top-100 protocol: ${entry.protocol} (+${entry.change7d}% 7d)`,
      explanation: `${entry.protocol} entered top 100 with explosive ${entry.change7d}% growth over 7 days. TVL: $${formatLargeNum(entry.tvl)}.`,
      data: entry,
      timestamp: new Date().toISOString(),
    });
  }

  return anomalies;
}

function scoreFundingAnomalies(fundingData) {
  const anomalies = [];

  for (const item of (fundingData.extreme || [])) {
    const absRate = Math.abs(item.rate);
    let severity = absRate > 0.1 ? 9 : absRate > 0.06 ? 7 : absRate > 0.03 ? 5 : 3;

    anomalies.push({
      category: CATEGORIES.FUNDING_EXTREME,
      severity,
      title: `Extreme funding on ${item.symbol} @ ${item.exchange}: ${item.rate}%`,
      explanation: `${item.symbol} funding rate at ${item.rate}% on ${item.exchange} indicates heavy ${item.direction === 'long_heavy' ? 'long' : 'short'} positioning. Potential for ${item.direction === 'long_heavy' ? 'long squeeze' : 'short squeeze'}.`,
      data: item,
      timestamp: new Date().toISOString(),
    });
  }

  for (const div of (fundingData.divergences || [])) {
    const severity = div.spread > 0.1 ? 8 : div.spread > 0.05 ? 6 : 4;
    anomalies.push({
      category: CATEGORIES.FUNDING_EXTREME,
      severity,
      title: `Funding divergence on ${div.symbol}: ${div.spread}% spread`,
      explanation: `${div.symbol} has a ${div.spread}% funding spread between ${div.highExchange} (${div.highRate}%) and ${div.lowExchange} (${div.lowRate}%). Potential arbitrage or positioning imbalance.`,
      data: div,
      timestamp: new Date().toISOString(),
    });
  }

  return anomalies;
}

function scoreWhaleAnomalies(whaleData) {
  const anomalies = [];

  for (const tx of (whaleData.transactions || [])) {
    const usd = tx.estimatedUSD || 0;
    let severity = usd > 100_000_000 ? 10 : usd > 50_000_000 ? 8 : usd > 10_000_000 ? 6 : usd > 1_000_000 ? 4 : 2;

    const cat = tx.direction?.includes('exchange') ? CATEGORIES.EXCHANGE_FLOW : CATEGORIES.WHALE_MOVEMENT;

    let explanation = `$${formatLargeNum(usd)} ${tx.chain} transfer detected.`;
    if (tx.direction === 'exchange_inflow') {
      explanation += ' Inflow to exchange — potential sell pressure.';
      severity = Math.min(10, severity + 1); // exchange inflows are more bearish signal
    } else if (tx.direction === 'exchange_outflow') {
      explanation += ' Outflow from exchange — potential accumulation signal.';
    }

    anomalies.push({
      category: cat,
      severity,
      title: `${tx.chain} whale: $${formatLargeNum(usd)} ${tx.direction || 'transfer'}`,
      explanation,
      data: { chain: tx.chain, hash: tx.hash, estimatedUSD: usd, direction: tx.direction },
      timestamp: tx.time || new Date().toISOString(),
    });
  }

  // Aggregate exchange flow pattern
  const summary = whaleData.summary;
  if (summary && (summary.exchangeInflows > 3 || summary.exchangeOutflows > 3)) {
    const netFlow = summary.exchangeInflowUSD - summary.exchangeOutflowUSD;
    const isNetInflow = netFlow > 0;
    anomalies.push({
      category: CATEGORIES.EXCHANGE_FLOW,
      severity: Math.abs(netFlow) > 100_000_000 ? 8 : 5,
      title: `Net exchange ${isNetInflow ? 'inflow' : 'outflow'}: $${formatLargeNum(Math.abs(netFlow))}`,
      explanation: `Aggregate exchange flows show net ${isNetInflow ? 'inflow (bearish)' : 'outflow (bullish)'} of $${formatLargeNum(Math.abs(netFlow))}. Inflows: ${summary.exchangeInflows}, Outflows: ${summary.exchangeOutflows}.`,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  }

  return anomalies;
}

function formatLargeNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function analyzeAnomalies({ tvlData, fundingData, whaleData }) {
  const all = [
    ...scoreTVLAnomalies(tvlData || {}),
    ...scoreFundingAnomalies(fundingData || {}),
    ...scoreWhaleAnomalies(whaleData || {}),
  ];

  // Sort by severity descending
  all.sort((a, b) => b.severity - a.severity);

  return {
    anomalies: all,
    topAnomalies: all.slice(0, 15),
    stats: {
      total: all.length,
      bySeverity: {
        critical: all.filter(a => a.severity >= 8).length,
        high: all.filter(a => a.severity >= 5 && a.severity < 8).length,
        medium: all.filter(a => a.severity >= 3 && a.severity < 5).length,
        low: all.filter(a => a.severity < 3).length,
      },
      byCategory: Object.values(CATEGORIES).reduce((acc, cat) => {
        acc[cat] = all.filter(a => a.category === cat).length;
        return acc;
      }, {}),
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { analyzeAnomalies, CATEGORIES };
