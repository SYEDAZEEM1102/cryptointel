/**
 * CT (Crypto Twitter) Scanner Module
 * Main entry point - orchestrates scraping, sentiment analysis, and trend aggregation
 */

const path = require('path');
const { scrapeLists } = require('./scraper');
const { analyzeSentiment } = require('./sentiment');
const { aggregateTrends } = require('./trends');

/**
 * Load config from config.json
 */
function loadConfig() {
  try {
    const configPath = path.resolve(__dirname, '../../config/config.json');
    return require(configPath);
  } catch (err) {
    return { ct_scanner: { lists: [] } };
  }
}

/**
 * Run the full CT Scanner pipeline
 * @param {Object} options - Optional overrides
 * @param {Array} options.lists - Override list URLs from config
 * @param {boolean} options.skipScrape - Skip scraping, use provided tweets
 * @param {Array} options.tweets - Pre-scraped tweets (if skipScrape)
 * @returns {Object} Full CT intelligence report as structured JSON
 */
async function runCTScanner(options = {}) {
  const startTime = Date.now();
  const result = {
    module: 'ct_scanner',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    warnings: [],
    scrapeResults: null,
    sentimentAnalysis: null,
    trendReport: null,
    executionTimeMs: 0,
  };

  try {
    // 1. Scrape tweets
    let scrapeData;
    if (options.skipScrape && options.tweets) {
      scrapeData = {
        tweets: options.tweets,
        warnings: ['Using pre-provided tweets, scraping skipped'],
        scrapedLists: 0,
        failedLists: 0,
        scrapedAt: new Date().toISOString(),
      };
    } else {
      const config = loadConfig();
      const lists = options.lists || config.ct_scanner?.lists || [];
      scrapeData = await scrapeLists(lists);
    }

    result.scrapeResults = {
      totalTweets: scrapeData.tweets.length,
      scrapedLists: scrapeData.scrapedLists,
      failedLists: scrapeData.failedLists,
      scrapedAt: scrapeData.scrapedAt,
    };
    result.warnings.push(...scrapeData.warnings);

    // 2. Analyze sentiment
    result.sentimentAnalysis = analyzeSentiment(scrapeData.tweets);

    // 3. Aggregate trends
    result.trendReport = aggregateTrends(result.sentimentAnalysis);

  } catch (err) {
    result.warnings.push(`CT Scanner error: ${err.message}`);
    // Ensure we return valid structure even on total failure
    if (!result.sentimentAnalysis) {
      result.sentimentAnalysis = { totalTweets: 0, avgSentiment: 0, sentimentLabel: 'neutral' };
    }
    if (!result.trendReport) {
      result.trendReport = { totalTweets: 0, trendingNarratives: [], tokenTrends: [], kolTakes: [] };
    }
  }

  result.executionTimeMs = Date.now() - startTime;
  return result;
}

module.exports = { runCTScanner };
