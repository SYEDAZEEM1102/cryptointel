const path = require('path');
const defillama = require('./defillama');
const coingecko = require('./coingecko');
const coinglass = require('./coinglass');
const { normalize } = require('./normalize');

function loadConfig() {
  try {
    return require(path.resolve(__dirname, '../../config/config.json')).aggregator || {};
  } catch (err) {
    console.warn('[Aggregator] Could not load config, using defaults:', err.message);
    return {};
  }
}

async function runAggregator() {
  const config = loadConfig();
  const timeout = config.requestTimeoutMs || 15000;

  console.log('[Aggregator] Starting data collection...');
  const startTime = Date.now();

  const llamaClient = defillama.createClient({ ...config.defillama, requestTimeoutMs: timeout });
  const geckoClient = coingecko.createClient({ ...config.coingecko, requestTimeoutMs: timeout });
  const glassClient = coinglass.createClient({ ...config.coinglass, requestTimeoutMs: timeout });

  // Fetch all sources in parallel
  const [llamaData, geckoData, glassData] = await Promise.all([
    llamaClient.fetchAll(),
    geckoClient.fetchAll(),
    glassClient.fetchAll(),
  ]);

  const result = normalize(geckoData, llamaData, glassData);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Aggregator] Done in ${elapsed}s`);

  return result;
}

module.exports = { runAggregator };
