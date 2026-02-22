const CATEGORIES = ['macro', 'defi', 'regulation', 'narrative', 'protocol', 'market_structure'];

const KEYWORD_MAP = {
  macro: ['fed', 'fomc', 'interest rate', 'cpi', 'inflation', 'gdp', 'recession', 'treasury', 'bond', 'dollar', 'dxy', 'unemployment', 'tariff', 'trade war', 'macro', 'central bank', 'monetary policy', 'rate cut', 'rate hike', 'powell', 'yellen'],
  defi: ['defi', 'dex', 'amm', 'liquidity', 'yield', 'lending', 'borrow', 'aave', 'uniswap', 'curve', 'compound', 'maker', 'tvl', 'staking', 'restaking', 'eigenlayer', 'lido', 'swap'],
  regulation: ['sec', 'cftc', 'regulation', 'lawsuit', 'ban', 'compliance', 'etf', 'spot etf', 'congress', 'bill', 'law', 'gensler', 'enforcement', 'sanction', 'license', 'framework', 'stablecoin bill'],
  narrative: ['ai', 'rwa', 'memecoin', 'meme', 'narrative', 'trend', 'hype', 'adoption', 'institutional', 'airdrop', 'points', 'layer 2', 'modular', 'intent', 'chain abstraction', 'depin', 'socialfi'],
  protocol: ['upgrade', 'fork', 'mainnet', 'testnet', 'launch', 'v2', 'v3', 'v4', 'bridge', 'hack', 'exploit', 'vulnerability', 'audit', 'partnership', 'integration', 'token', 'burn', 'mint'],
  market_structure: ['liquidat', 'open interest', 'funding rate', 'whale', 'exchange', 'volume', 'outflow', 'inflow', 'etf flow', 'market cap', 'dominance', 'alt season', 'correlation', 'leverage', 'short', 'long', 'basis'],
};

function categorize(text) {
  const lower = (text || '').toLowerCase();
  const tags = [];
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) tags.push(cat);
  }
  return tags.length ? tags : ['narrative']; // default
}

function similarity(a, b) {
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3));
  if (!wordsA.size || !wordsB.size) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.min(wordsA.size, wordsB.size);
}

function groupByTopic(items) {
  const groups = [];
  const used = new Set();

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const group = { items: [items[i]], title: items[i].title };
    used.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      if (similarity(items[i].title, items[j].title) > 0.35) {
        group.items.push(items[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

function scoreGroup(group) {
  let score = group.items.length * 2; // more coverage = more important
  const sources = new Set(group.items.map(i => i.source || i.channel));
  score += sources.size * 1.5; // multi-source = more important
  for (const item of group.items) {
    if (item.viewCount) score += Math.log10(Math.max(item.viewCount, 1));
  }
  return score;
}

async function summarizeNewsAndVideos(newsItems = [], videos = []) {
  // Normalize into unified items
  const allItems = [
    ...newsItems.map(n => ({ ...n, type: 'news' })),
    ...videos.map(v => ({
      type: 'youtube',
      source: v.channel,
      channel: v.channel,
      title: v.title,
      link: v.url,
      pubDate: v.uploadDate,
      pubDateTs: v.uploadTs,
      viewCount: v.viewCount,
      duration: v.durationStr,
      description: '',
    })),
  ];

  const groups = groupByTopic(allItems);

  // Score and rank
  const scored = groups.map(g => ({
    ...g,
    score: scoreGroup(g),
    categories: [...new Set(g.items.flatMap(i => categorize(`${i.title} ${i.description || ''}`)))],
    sourceCount: new Set(g.items.map(i => i.source || i.channel)).size,
    sources: [...new Set(g.items.map(i => i.source || i.channel))],
  }));

  scored.sort((a, b) => b.score - a.score);
  const topStories = scored.slice(0, 10);

  return {
    timestamp: new Date().toISOString(),
    totalNewsItems: newsItems.length,
    totalVideos: videos.length,
    totalGroups: groups.length,
    topStories: topStories.map((g, idx) => ({
      rank: idx + 1,
      title: g.title,
      categories: g.categories,
      score: Math.round(g.score * 10) / 10,
      coverage: g.items.length,
      sources: g.sources,
      items: g.items.map(i => ({
        type: i.type,
        source: i.source || i.channel,
        title: i.title,
        link: i.link,
        ...(i.viewCount ? { viewCount: i.viewCount } : {}),
      })),
    })),
  };
}

module.exports = { summarizeNewsAndVideos, categorize, groupByTopic };
