/**
 * CT Scanner - Trend Aggregation
 * Aggregates sentiment analysis into actionable intelligence
 */

// Known KOL (Key Opinion Leader) accounts
const KNOWN_KOLS = new Set([
  'milesdeutscher', 'raaboramsey', 'cryptobanter', 'altcoindaily',
  'coinbureau', 'benjamincowen', 'raaboramsey', 'datadash',
  'cburniske', 'rleshner', 'haaboramsey', 'inversebrah',
  'blknoiz06', 'hsaka', 'gameaboramsey', 'dlowobtc',
  'cryptohayes', 'zaboramsey', 'deaboramsey', 'galaboramsey',
  'cobie', 'ansem', 'rewkang', 'laurashin', 'taboramsey',
  'pentosh1', 'cryptokaleo', 'crypto_birb', 'cred_TA',
  'smartcontracter', 'trader1sz', 'credmark', 'raboramsey',
  'onchainwizard', 'route2fi', 'thedefiedge', 'defiignas',
  'shaboramsey', 'lookonchain', 'whale_alert', 'arkaboramsey',
]);

/**
 * Build trending narratives from sentiment analysis
 */
function buildTrendingNarratives(sentimentData) {
  const { narrativeCounts } = sentimentData;
  if (!narrativeCounts) return [];

  return Object.entries(narrativeCounts)
    .map(([name, data]) => ({
      narrative: name,
      tweetCount: data.count,
      avgSentiment: data.avgSentiment,
      sentimentLabel: data.avgSentiment > 0.1 ? 'bullish' : data.avgSentiment < -0.1 ? 'bearish' : 'neutral',
      sampleTweets: (data.tweets || []).slice(0, 3),
    }))
    .sort((a, b) => b.tweetCount - a.tweetCount)
    .slice(0, 10);
}

/**
 * Build most-discussed tokens with sentiment split
 */
function buildTokenTrends(sentimentData) {
  const { tokenMentions } = sentimentData;
  if (!tokenMentions) return [];

  return Object.entries(tokenMentions)
    .map(([token, data]) => ({
      token,
      mentions: data.count,
      bullishCount: data.bullish,
      bearishCount: data.bearish,
      neutralCount: data.neutral,
      sentiment: data.count > 0
        ? +((data.bullish - data.bearish) / data.count).toFixed(3)
        : 0,
      sentimentLabel: data.bullish > data.bearish ? 'bullish' : data.bearish > data.bullish ? 'bearish' : 'neutral',
      topTweets: (data.tweets || [])
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 3),
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 25);
}

/**
 * Extract notable KOL takes (high-engagement tweets from known accounts)
 */
function extractKOLTakes(sentimentData) {
  const { tweetAnalysis } = sentimentData;
  if (!tweetAnalysis) return [];

  // Get KOL tweets and high-engagement tweets
  const notable = tweetAnalysis.filter(t => {
    const isKOL = KNOWN_KOLS.has(t.author?.toLowerCase());
    const highEngagement = (t.engagement?.likes || 0) >= 50 ||
                           (t.engagement?.retweets || 0) >= 20 ||
                           (t.engagement?.views || 0) >= 10000;
    return isKOL || highEngagement;
  });

  return notable
    .sort((a, b) => {
      const engA = (a.engagement?.likes || 0) + (a.engagement?.retweets || 0) * 3;
      const engB = (b.engagement?.likes || 0) + (b.engagement?.retweets || 0) * 3;
      return engB - engA;
    })
    .slice(0, 20)
    .map(t => ({
      author: t.author,
      text: t.text,
      sentiment: t.sentiment,
      sentimentLabel: t.sentimentLabel,
      tokens: t.tokens,
      narratives: t.narratives,
      engagement: t.engagement,
      isKOL: KNOWN_KOLS.has(t.author?.toLowerCase()),
    }));
}

/**
 * Identify consensus vs contrarian views
 */
function identifyConsensusVsContrarian(sentimentData) {
  const { tweetAnalysis, avgSentiment } = sentimentData;
  if (!tweetAnalysis || tweetAnalysis.length === 0) {
    return { consensus: [], contrarian: [], overallBias: 'neutral' };
  }

  const consensus = [];
  const contrarian = [];

  for (const t of tweetAnalysis) {
    // Contrarian = sentiment strongly opposite to average
    if (avgSentiment > 0.1 && t.sentiment < -0.3) {
      contrarian.push(t);
    } else if (avgSentiment < -0.1 && t.sentiment > 0.3) {
      contrarian.push(t);
    } else if (Math.abs(t.sentiment - avgSentiment) < 0.2 && Math.abs(t.sentiment) > 0.1) {
      consensus.push(t);
    }
  }

  // Sort by engagement
  const sortByEng = (a, b) => {
    const ea = (a.engagement?.likes || 0) + (a.engagement?.retweets || 0);
    const eb = (b.engagement?.likes || 0) + (b.engagement?.retweets || 0);
    return eb - ea;
  };

  return {
    overallBias: avgSentiment > 0.1 ? 'bullish' : avgSentiment < -0.1 ? 'bearish' : 'neutral',
    avgSentiment,
    consensusCount: consensus.length,
    contrarianCount: contrarian.length,
    topConsensus: consensus.sort(sortByEng).slice(0, 5).map(t => ({
      author: t.author, text: t.text, sentiment: t.sentiment,
    })),
    topContrarian: contrarian.sort(sortByEng).slice(0, 5).map(t => ({
      author: t.author, text: t.text, sentiment: t.sentiment,
    })),
  };
}

/**
 * Main trend aggregation function
 * @param {Object} sentimentData - Output from sentiment.analyzeSentiment()
 * @returns {Object} Structured trend report
 */
function aggregateTrends(sentimentData) {
  if (!sentimentData || sentimentData.totalTweets === 0) {
    return {
      generatedAt: new Date().toISOString(),
      totalTweets: 0,
      overallSentiment: { score: 0, label: 'neutral' },
      trendingNarratives: [],
      tokenTrends: [],
      kolTakes: [],
      consensusAnalysis: { overallBias: 'neutral', consensusCount: 0, contrarianCount: 0 },
      topKeywords: [],
      warnings: ['No tweet data available for trend analysis'],
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    totalTweets: sentimentData.totalTweets,
    overallSentiment: {
      score: sentimentData.avgSentiment,
      label: sentimentData.sentimentLabel,
    },
    trendingNarratives: buildTrendingNarratives(sentimentData),
    tokenTrends: buildTokenTrends(sentimentData),
    kolTakes: extractKOLTakes(sentimentData),
    consensusAnalysis: identifyConsensusVsContrarian(sentimentData),
    topKeywords: Object.entries(sentimentData.keywordFrequency || {})
      .slice(0, 20)
      .map(([word, count]) => ({ word, count })),
  };
}

module.exports = {
  aggregateTrends,
  buildTrendingNarratives,
  buildTokenTrends,
  extractKOLTakes,
  identifyConsensusVsContrarian,
  KNOWN_KOLS,
};
