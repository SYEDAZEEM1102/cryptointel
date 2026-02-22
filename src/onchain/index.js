const { monitorTVL } = require('./tvl_monitor');
const { monitorFunding } = require('./funding_rates');
const { trackWhales } = require('./whale_tracker');
const { analyzeAnomalies } = require('./anomaly');

/**
 * Run the full on-chain anomaly detector pipeline.
 * All collectors run in parallel; failures are isolated.
 * Returns structured JSON with anomalies scored and ranked.
 */
async function runOnchainDetector() {
  const startTime = Date.now();

  const [tvlResult, fundingResult, whaleResult] = await Promise.allSettled([
    monitorTVL(),
    monitorFunding(),
    trackWhales(),
  ]);

  const tvlData = tvlResult.status === 'fulfilled' ? tvlResult.value : { bigMovers: [], chainTrends: [], newTop100: [], errors: [tvlResult.reason?.message] };
  const fundingData = fundingResult.status === 'fulfilled' ? fundingResult.value : { extreme: [], divergences: [], errors: [fundingResult.reason?.message] };
  const whaleData = whaleResult.status === 'fulfilled' ? whaleResult.value : { transactions: [], summary: {}, errors: [whaleResult.reason?.message] };

  const anomalyReport = analyzeAnomalies({ tvlData, fundingData, whaleData });

  return {
    module: 'onchain-anomaly-detector',
    runtime: Date.now() - startTime,
    raw: { tvl: tvlData, funding: fundingData, whales: whaleData },
    ...anomalyReport,
    errors: [
      ...(tvlData.errors || []),
      ...(fundingData.errors || []),
      ...(whaleData.errors || []),
    ],
  };
}

module.exports = { runOnchainDetector };
