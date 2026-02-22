/**
 * CT Scanner - Sentiment & Narrative Analysis
 * Pure keyword/lexicon-based analysis, no external LLM calls
 */

// Crypto-specific sentiment lexicon
const BULLISH_WORDS = [
  'bullish', 'moon', 'mooning', 'pump', 'pumping', 'breakout', 'ath', 'all-time high',
  'buy', 'buying', 'long', 'longing', 'accumulate', 'accumulating', 'undervalued',
  'gem', 'alpha', 'send it', 'sending', 'rip', 'ripping', 'green', 'recovery',
  'reversal', 'bottom', 'bottomed', 'support', 'bounce', 'bouncing', 'uptrend',
  'parabolic', 'explosive', 'massive', 'insane', 'huge', 'flywheel', 'supercycle',
  'adoption', 'institutional', 'inflows', 'etf', 'approval', 'partnership',
  'launch', 'mainnet', 'upgrade', 'catalyst', 'outperform', 'rally', 'rallying',
  'strong', 'strength', 'conviction', 'dip', 'buy the dip', 'btd', 'wagmi',
  'generational', 'opportunity', 'rotation', 'bid', 'bidding',
];

const BEARISH_WORDS = [
  'bearish', 'dump', 'dumping', 'crash', 'crashing', 'sell', 'selling', 'short',
  'shorting', 'overvalued', 'bubble', 'rug', 'rugged', 'scam', 'ponzi', 'fraud',
  'red', 'bleeding', 'capitulation', 'liquidation', 'liquidated', 'rekt',
  'resistance', 'rejection', 'breakdown', 'downtrend', 'death cross', 'bear market',
  'outflows', 'decline', 'declining', 'weak', 'weakness', 'fear', 'panic',
  'contagion', 'insolvency', 'bankrupt', 'collapse', 'hack', 'hacked', 'exploit',
  'vulnerability', 'ngmi', 'bag', 'bagholder', 'top signal', 'euphoria',
  'overleveraged', 'derisking', 'de-risk', 'caution', 'warning',
];

const FUD_INDICATORS = [
  'fud', 'regulation', 'ban', 'sec', 'lawsuit', 'investigation', 'subpoena',
  'enforcement', 'crackdown', 'shutdown', 'delisting', 'sanctions', 'tether',
  'unbacked', 'insolvent', 'withdrawal halt', 'frozen', 'freeze',
];

const HYPE_INDICATORS = [
  'airdrop', '100x', '1000x', 'guaranteed', 'free money', 'cant lose', "can't lose",
  'easy money', 'no brainer', 'lfg', 'lets go', "let's go", 'gm', 'ser',
  'narrative', 'meta', 'rotation', 'szn', 'season',
];

// Common crypto tokens/protocols to track
const TOKEN_PATTERNS = /\$([A-Z]{2,10})\b|\b(BTC|ETH|SOL|AVAX|ARB|OP|SUI|APT|MATIC|LINK|DOT|ADA|XRP|DOGE|SHIB|PEPE|WIF|JUP|JTO|TIA|PYTH|SEI|INJ|FET|RNDR|TAO|NEAR|ATOM|FTM|AAVE|UNI|MKR|LDO|RPL|SSV|EIGEN|ETHFI|PENDLE|GMX|DYDX|SNX|CRV|BAL|COMP|SUSHI|CAKE|RAY|ORCA|MEME|BONK|FLOKI|RENDER|GRT|FIL|AR|STRK|ZKSYNC|BASE|BLAST|MODE|SCROLL|LINEA|MANTA|BERACHAIN|MONAD|MOVEMENT|HYPE)\b/gi;

const NARRATIVE_KEYWORDS = {
  'AI/ML': ['ai', 'artificial intelligence', 'machine learning', 'gpt', 'llm', 'agent', 'agents', 'ai agent', 'depin ai'],
  'DePIN': ['depin', 'decentralized physical', 'iot', 'wireless', 'helium', 'hivemapper'],
  'RWA': ['rwa', 'real world asset', 'tokenized', 'tokenization', 'treasury', 'treasuries', 'blackrock'],
  'L2/Scaling': ['l2', 'layer 2', 'rollup', 'zk', 'zkevm', 'optimistic', 'base', 'arbitrum', 'blast', 'scroll', 'linea'],
  'DeFi': ['defi', 'dex', 'amm', 'lending', 'borrowing', 'yield', 'tvl', 'liquidity', 'farming', 'staking', 'restaking'],
  'Memecoins': ['memecoin', 'meme coin', 'degen', 'pump.fun', 'bonk', 'pepe', 'wif', 'floki', 'shib', 'doge'],
  'NFT/Gaming': ['nft', 'nfts', 'gaming', 'gamefi', 'metaverse', 'ordinals', 'inscriptions', 'brc-20'],
  'Bitcoin': ['bitcoin', 'btc', 'halving', 'mining', 'ordinals', 'brc20', 'runes', 'lightning'],
  'Ethereum': ['ethereum', 'eth', 'eip', 'blob', 'dencun', 'pectra', 'staking', 'restaking', 'eigenlayer'],
  'Solana': ['solana', 'sol', 'jupiter', 'jup', 'raydium', 'marinade', 'firedancer'],
  'Regulation': ['regulation', 'sec', 'cftc', 'congress', 'bill', 'stablecoin', 'compliance', 'etf'],
  'Macro': ['macro', 'fed', 'fomc', 'rate cut', 'rate hike', 'cpi', 'inflation', 'recession', 'treasury', 'dxy', 'dollar'],
  'Airdrop': ['airdrop', 'claim', 'eligibility', 'snapshot', 'points', 'season', 'farming points'],
};

/**
 * Score a single tweet's sentiment
 * Returns value between -1 (very bearish) and +1 (very bullish)
 */
function scoreSentiment(text) {
  const lower = text.toLowerCase();
  let score = 0;
  let signals = 0;

  for (const word of BULLISH_WORDS) {
    if (lower.includes(word)) { score += 1; signals++; }
  }
  for (const word of BEARISH_WORDS) {
    if (lower.includes(word)) { score -= 1; signals++; }
  }
  for (const word of FUD_INDICATORS) {
    if (lower.includes(word)) { score -= 0.5; signals++; }
  }
  for (const word of HYPE_INDICATORS) {
    if (lower.includes(word)) { score += 0.3; signals++; }
  }

  if (signals === 0) return 0;
  // Normalize to [-1, 1] range
  return Math.max(-1, Math.min(1, score / Math.max(signals, 1)));
}

/**
 * Extract mentioned tokens from tweet text
 */
function extractTokens(text) {
  const tokens = new Set();
  let match;
  const regex = new RegExp(TOKEN_PATTERNS.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const token = (match[1] || match[2]).toUpperCase();
    if (token.length >= 2) tokens.add(token);
  }
  return [...tokens];
}

/**
 * Identify which narratives a tweet belongs to
 */
function identifyNarratives(text) {
  const lower = text.toLowerCase();
  const matches = [];

  for (const [narrative, keywords] of Object.entries(NARRATIVE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matches.push(narrative);
        break;
      }
    }
  }

  return matches;
}

/**
 * Analyze an array of tweets
 * @param {Array} tweets - Array of tweet objects from scraper
 * @returns {Object} Full sentiment analysis results
 */
function analyzeSentiment(tweets) {
  if (!tweets || tweets.length === 0) {
    return {
      totalTweets: 0,
      avgSentiment: 0,
      sentimentLabel: 'neutral',
      tokenMentions: {},
      narrativeCounts: {},
      tweetAnalysis: [],
      keywordFrequency: {},
    };
  }

  const tokenMentions = {}; // token -> { count, bullish, bearish, tweets }
  const narrativeCounts = {}; // narrative -> { count, avgSentiment, tweets }
  const keywordFreq = {};
  let totalSentiment = 0;

  const tweetAnalysis = tweets.map(tweet => {
    const sentiment = scoreSentiment(tweet.text);
    const tokens = extractTokens(tweet.text);
    const narratives = identifyNarratives(tweet.text);

    totalSentiment += sentiment;

    // Track token mentions
    for (const token of tokens) {
      if (!tokenMentions[token]) {
        tokenMentions[token] = { count: 0, bullish: 0, bearish: 0, neutral: 0, tweets: [] };
      }
      tokenMentions[token].count++;
      if (sentiment > 0.1) tokenMentions[token].bullish++;
      else if (sentiment < -0.1) tokenMentions[token].bearish++;
      else tokenMentions[token].neutral++;
      if (tokenMentions[token].tweets.length < 5) {
        tokenMentions[token].tweets.push({
          author: tweet.author,
          text: tweet.text.slice(0, 200),
          sentiment,
          engagement: (tweet.likes || 0) + (tweet.retweets || 0),
        });
      }
    }

    // Track narratives
    for (const nar of narratives) {
      if (!narrativeCounts[nar]) {
        narrativeCounts[nar] = { count: 0, totalSentiment: 0, tweets: [] };
      }
      narrativeCounts[nar].count++;
      narrativeCounts[nar].totalSentiment += sentiment;
      if (narrativeCounts[nar].tweets.length < 5) {
        narrativeCounts[nar].tweets.push({
          author: tweet.author,
          text: tweet.text.slice(0, 200),
          sentiment,
        });
      }
    }

    // Keyword frequency (words 4+ chars, excluding common words)
    const words = tweet.text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    for (const w of words) {
      if (!STOP_WORDS.has(w)) {
        keywordFreq[w] = (keywordFreq[w] || 0) + 1;
      }
    }

    return {
      author: tweet.author,
      text: tweet.text.slice(0, 300),
      sentiment,
      sentimentLabel: sentiment > 0.1 ? 'bullish' : sentiment < -0.1 ? 'bearish' : 'neutral',
      tokens,
      narratives,
      engagement: {
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        views: tweet.views || 0,
        bookmarks: tweet.bookmarks || 0,
      },
    };
  });

  // Compute avg sentiment per narrative
  for (const nar of Object.keys(narrativeCounts)) {
    narrativeCounts[nar].avgSentiment = +(narrativeCounts[nar].totalSentiment / narrativeCounts[nar].count).toFixed(3);
    delete narrativeCounts[nar].totalSentiment;
  }

  const avgSentiment = +(totalSentiment / tweets.length).toFixed(3);

  return {
    totalTweets: tweets.length,
    avgSentiment,
    sentimentLabel: avgSentiment > 0.1 ? 'bullish' : avgSentiment < -0.1 ? 'bearish' : 'neutral',
    tokenMentions,
    narrativeCounts,
    tweetAnalysis,
    keywordFrequency: Object.fromEntries(
      Object.entries(keywordFreq).sort((a, b) => b[1] - a[1]).slice(0, 50)
    ),
  };
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'will', 'been', 'were', 'they',
  'their', 'what', 'when', 'which', 'there', 'about', 'would', 'could',
  'should', 'just', 'like', 'more', 'some', 'than', 'them', 'then', 'these',
  'into', 'also', 'very', 'much', 'most', 'only', 'over', 'such', 'here',
  'after', 'before', 'being', 'does', 'doing', 'done', 'each', 'even',
  'every', 'going', 'good', 'great', 'know', 'make', 'many', 'need',
  'next', 'people', 'really', 'right', 'same', 'still', 'take', 'think',
  'time', 'want', 'well', 'work', 'your', 'https', 'http', 'tweet',
]);

module.exports = {
  analyzeSentiment,
  scoreSentiment,
  extractTokens,
  identifyNarratives,
  BULLISH_WORDS,
  BEARISH_WORDS,
  NARRATIVE_KEYWORDS,
};
