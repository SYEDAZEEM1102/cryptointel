const dayjs = require('dayjs');
const { readFileSync, mkdirSync, writeFileSync } = require('fs');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname, '..', '..');

function loadConfig(configPath) {
  const raw = readFileSync(configPath || join(ROOT, 'config', 'config.json'), 'utf8');
  return JSON.parse(raw);
}

function fmt(n, decimals = 2) {
  if (n == null) return 'N/A';
  if (typeof n === 'string') n = parseFloat(n);
  if (isNaN(n)) return 'N/A';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(decimals)}K`;
  return `$${n.toFixed(decimals)}`;
}

function pct(n) {
  if (n == null) return 'N/A';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function pctRaw(n) {
  if (n == null) return 'N/A';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function bullet(items) {
  return items.filter(Boolean).map(i => `- ${i}`).join('\n');
}

function buildMarketOverview(agg) {
  if (!agg) return '> *No aggregator data available for this run.*\n';
  const prices = agg.prices || [];
  const global = agg.global || {};
  let md = '';
  if (prices.length) {
    md += '| Asset | Price | 24h Chg | 7d Chg | Mkt Cap | Vol 24h |\n';
    md += '|-------|------:|--------:|-------:|--------:|--------:|\n';
    for (const p of prices) {
      md += `| **${p.symbol?.toUpperCase() || p.id}** | ${fmt(p.current_price)} | ${pctRaw(p.price_change_percentage_24h)} | ${pctRaw(p.price_change_percentage_7d_in_currency)} | ${fmt(p.market_cap)} | ${fmt(p.total_volume)} |\n`;
    }
  }
  if (global.total_market_cap) md += `\n**Total Market Cap:** ${fmt(global.total_market_cap)}\n`;
  if (global.btc_dominance != null) md += `**BTC Dominance:** ${global.btc_dominance?.toFixed(1)}%\n`;
  if (global.eth_dominance != null) md += `**ETH Dominance:** ${global.eth_dominance?.toFixed(1)}%\n`;
  if (global.total_volume) md += `**24h Volume:** ${fmt(global.total_volume)}\n`;
  return md || '> *Partial aggregator data.*\n';
}

function buildOnChainSignals(onchain) {
  if (!onchain) return '> *No on-chain data available for this run.*\n';
  const parts = [];
  if (onchain.tvl && onchain.tvl.length) {
    parts.push('### TVL Movers\n');
    const sorted = [...onchain.tvl].sort((a, b) => (b.change_pct || 0) - (a.change_pct || 0));
    const top = sorted.slice(0, 5);
    const bottom = sorted.slice(-3);
    for (const t of top) parts.push(`- **${t.name}**: ${fmt(t.tvl)} (${pctRaw(t.change_pct)} 24h)`);
    if (bottom.length && bottom[0] !== top[top.length - 1]) {
      parts.push('');
      for (const t of bottom) parts.push(`- **${t.name}**: ${fmt(t.tvl)} (${pctRaw(t.change_pct)} 24h) ⚠️`);
    }
  }
  if (onchain.whale_activity && onchain.whale_activity.length) {
    parts.push('\n### Whale Activity 🐋\n');
    for (const w of onchain.whale_activity.slice(0, 8)) parts.push(`- ${w.description || `${w.token}: ${w.type} of ${fmt(w.amount_usd)}`}`);
  }
  if (onchain.anomalies && onchain.anomalies.length) {
    parts.push('\n### Anomalies Detected 🔍\n');
    for (const a of onchain.anomalies) parts.push(`- ${a.description || a.type}: ${a.details || ''}`);
  }
  return parts.join('\n') || '> *No notable on-chain signals.*\n';
}

function buildDerivatives(onchain) {
  if (!onchain?.derivatives) return '> *No derivatives data available.*\n';
  const d = onchain.derivatives;
  const parts = [];
  if (d.funding_rates && d.funding_rates.length) {
    parts.push('### Funding Rates\n');
    parts.push('| Asset | Rate | Annualised | Signal |');
    parts.push('|-------|-----:|-----------:|--------|');
    for (const f of d.funding_rates) {
      const annual = f.rate != null ? (f.rate * 365 * 3).toFixed(1) : 'N/A';
      const signal = f.rate > 0.03 ? '🔴 Extreme Long' : f.rate > 0.01 ? '🟡 Long-biased' : f.rate < -0.01 ? '🟢 Short-biased' : '⚪ Neutral';
      parts.push(`| ${f.symbol} | ${pct(f.rate)} | ${annual}% | ${signal} |`);
    }
  }
  if (d.open_interest) {
    parts.push(`\n**Total Open Interest:** ${fmt(d.open_interest.total)}`);
    if (d.open_interest.change_24h != null) parts.push(`**OI 24h Change:** ${pctRaw(d.open_interest.change_24h)}`);
  }
  if (d.liquidations) {
    parts.push('\n### Liquidations (24h)\n');
    parts.push(`- **Total Liquidated:** ${fmt(d.liquidations.total)}`);
    if (d.liquidations.longs) parts.push(`- Longs: ${fmt(d.liquidations.longs)}`);
    if (d.liquidations.shorts) parts.push(`- Shorts: ${fmt(d.liquidations.shorts)}`);
    const ratio = d.liquidations.longs && d.liquidations.shorts ? (d.liquidations.longs / d.liquidations.shorts).toFixed(2) : null;
    if (ratio) parts.push(`- Long/Short Ratio: ${ratio}x`);
  }
  return parts.join('\n') || '> *No derivatives data.*\n';
}

function buildNarrative(ct) {
  if (!ct) return '> *No CT/sentiment data available for this run.*\n';
  const parts = [];
  if (ct.trending_topics && ct.trending_topics.length) {
    parts.push('### What CT Is Talking About\n');
    for (const t of ct.trending_topics.slice(0, 10)) {
      const mentions = t.mentions ? ` (${t.mentions} mentions)` : '';
      const sentiment = t.sentiment ? ` — ${t.sentiment}` : '';
      parts.push(`- **${t.topic || t.name}**${mentions}${sentiment}`);
    }
  }
  if (ct.key_tweets && ct.key_tweets.length) {
    parts.push('\n### Notable Takes\n');
    for (const tw of ct.key_tweets.slice(0, 8)) {
      const author = tw.author || tw.username || 'Anon';
      const engagement = tw.likes ? ` (${tw.likes}❤️ ${tw.retweets || 0}🔁)` : '';
      parts.push(`- **@${author}**${engagement}: ${tw.text || tw.summary || ''}`);
    }
  }
  if (ct.sentiment) {
    parts.push('\n### Sentiment Gauge\n');
    const s = ct.sentiment;
    if (s.overall) parts.push(`- **Overall:** ${s.overall}`);
    if (s.bullish != null) parts.push(`- Bullish: ${s.bullish}% | Bearish: ${s.bearish}% | Neutral: ${s.neutral}%`);
    if (s.fear_greed != null) parts.push(`- **Fear & Greed Index:** ${s.fear_greed}`);
  }
  if (ct.divergences && ct.divergences.length) {
    parts.push('\n### ⚡ Divergences & Contrarian Signals\n');
    for (const d of ct.divergences) parts.push(`- ${d.description || d}`);
  }
  return parts.join('\n') || '> *No narrative data.*\n';
}

function buildNewsHighlights(news) {
  if (!news) return '> *No news data available for this run.*\n';
  const parts = [];
  const articles = news.articles || news;
  if (!Array.isArray(articles) || !articles.length) return '> *No news articles collected.*\n';
  const categories = { 'Regulation & Policy': [], 'DeFi & Protocols': [], 'Market & Trading': [], 'Technology & Infrastructure': [], 'Institutional & TradFi': [], 'Other': [] };
  for (const a of articles) {
    const cat = a.category || 'Other';
    const bucket = categories[cat] || categories['Other'];
    bucket.push(a);
  }
  for (const [cat, items] of Object.entries(categories)) {
    if (!items.length) continue;
    parts.push(`### ${cat}\n`);
    for (const a of items.slice(0, 5)) {
      const source = a.source ? ` *(${a.source})*` : '';
      const link = a.url ? ` [→](${a.url})` : '';
      parts.push(`- **${a.title}**${source}${link}`);
      if (a.summary) parts.push(`  ${a.summary}`);
    }
    parts.push('');
  }
  if (news.youtube && news.youtube.length) {
    parts.push('### 📺 YouTube Highlights\n');
    for (const v of news.youtube.slice(0, 5)) {
      const link = v.url ? ` [Watch](${v.url})` : '';
      parts.push(`- **${v.title}** — ${v.channel || 'Unknown'}${link}`);
      if (v.summary) parts.push(`  ${v.summary}`);
    }
  }
  return parts.join('\n') || '> *No categorised news.*\n';
}

function buildRiskRadar(data) {
  const risks = [];
  const onchain = data.onchain;
  const ct = data.ct_scanner;
  if (onchain?.derivatives?.funding_rates) {
    const extremes = onchain.derivatives.funding_rates.filter(f => Math.abs(f.rate) > 0.03);
    if (extremes.length) risks.push(`**Extreme funding on ${extremes.map(e => e.symbol).join(', ')}** — crowded positioning increases liquidation cascade risk`);
  }
  if (onchain?.derivatives?.liquidations?.total > 500_000_000) risks.push('**Elevated liquidation volume** — market is overleveraged and fragile');
  if (ct?.sentiment?.fear_greed != null) {
    if (ct.sentiment.fear_greed > 80) risks.push('**Extreme Greed territory** — historically precedes corrections');
    else if (ct.sentiment.fear_greed < 20) risks.push('**Extreme Fear** — capitulation possible but also contrarian buy zone');
  }
  if (onchain?.anomalies?.length) {
    for (const a of onchain.anomalies.filter(a => a.severity === 'high')) risks.push(`**${a.type}**: ${a.description || a.details}`);
  }
  if (onchain?.tvl) {
    const bigDrops = onchain.tvl.filter(t => t.change_pct < -15);
    if (bigDrops.length) risks.push(`**TVL hemorrhaging on ${bigDrops.map(t => t.name).join(', ')}** — smart money may be exiting`);
  }
  if (!risks.length) risks.push('No major red flags detected — but complacency itself is a risk');
  return bullet(risks);
}

function buildOpportunities(data) {
  const opps = [];
  const agg = data.aggregator;
  const onchain = data.onchain;
  const ct = data.ct_scanner;
  if (agg?.prices) {
    const oversold = agg.prices.filter(p => p.price_change_percentage_7d_in_currency < -15);
    if (oversold.length) opps.push(`**Potential mean-reversion plays**: ${oversold.map(p => `${p.symbol?.toUpperCase()} (${pctRaw(p.price_change_percentage_7d_in_currency)} 7d)`).join(', ')}`);
  }
  if (onchain?.tvl) {
    const rising = onchain.tvl.filter(t => t.change_pct > 10).slice(0, 3);
    if (rising.length) opps.push(`**TVL inflows accelerating**: ${rising.map(t => `${t.name} (${pctRaw(t.change_pct)})`).join(', ')} — follow the liquidity`);
  }
  if (ct?.trending_topics) {
    const bullish = ct.trending_topics.filter(t => t.sentiment === 'bullish' || t.sentiment === 'very_bullish');
    if (bullish.length) opps.push(`**CT consensus bullish on**: ${bullish.slice(0, 5).map(t => t.topic || t.name).join(', ')}`);
  }
  if (onchain?.derivatives?.funding_rates) {
    const neg = onchain.derivatives.funding_rates.filter(f => f.rate < -0.005);
    if (neg.length) opps.push(`**Negative funding (short-heavy) on ${neg.map(f => f.symbol).join(', ')}** — potential short squeeze setup`);
  }
  if (!opps.length) opps.push('Market in wait-and-see mode — patience is a position');
  return bullet(opps);
}

function buildExecutiveSummary(data) {
  const points = [];
  const agg = data.aggregator;
  const onchain = data.onchain;
  const ct = data.ct_scanner;
  const news = data.news_scanner;
  if (agg?.prices?.length) {
    const btc = agg.prices.find(p => (p.symbol || p.id) === 'btc' || (p.symbol || p.id) === 'bitcoin');
    if (btc) {
      const dir = btc.price_change_percentage_24h > 0 ? 'up' : 'down';
      points.push(`BTC trading at ${fmt(btc.current_price)}, ${dir} ${pctRaw(Math.abs(btc.price_change_percentage_24h))} on the day`);
    }
  }
  if (ct?.sentiment?.overall) points.push(`Market sentiment: **${ct.sentiment.overall}** — CT consensus is ${ct.sentiment.overall.toLowerCase()}`);
  if (onchain?.derivatives?.liquidations?.total) points.push(`${fmt(onchain.derivatives.liquidations.total)} liquidated in 24h — ${onchain.derivatives.liquidations.total > 300_000_000 ? 'elevated leverage risk' : 'within normal range'}`);
  const articles = news?.articles || (Array.isArray(news) ? news : []);
  if (articles.length) points.push(`${articles.length} news stories tracked — top theme: ${articles[0]?.category || articles[0]?.title || 'mixed'}`);
  if (onchain?.tvl) {
    const totalTvl = onchain.tvl.reduce((s, t) => s + (t.tvl || 0), 0);
    if (totalTvl) points.push(`DeFi TVL snapshot: ${fmt(totalTvl)} across tracked protocols`);
  }
  if (!points.length) {
    points.push('Partial data run — some modules did not return data');
    points.push('Review individual sections for available intelligence');
  }
  return bullet(points.slice(0, 5));
}

async function runSynthesis(data, options = {}) {
  const config = loadConfig(options.configPath);
  const outputDir = options.outputDir || config.synthesis?.output_dir || './output';
  const now = dayjs();
  const dateStr = now.format('YYYY-MM-DD');
  const timeStr = now.format('HH:mm');

  const md = `# 🔬 CryptoIntel Daily Briefing
## ${now.format('dddd, MMMM D, YYYY')} — ${timeStr} IST

---

## 📌 Executive Summary

${buildExecutiveSummary(data)}

---

## 📊 Market Overview

${buildMarketOverview(data.aggregator)}

---

## ⛓️ On-Chain Signals

${buildOnChainSignals(data.onchain)}

---

## 📈 Derivatives & Positioning

${buildDerivatives(data.onchain)}

---

## 🗣️ Narrative & Sentiment

${buildNarrative(data.ct_scanner)}

---

## 📰 News Highlights

${buildNewsHighlights(data.news_scanner)}

---

## 🚨 Risk Radar

${buildRiskRadar(data)}

---

## 💡 Opportunities

${buildOpportunities(data)}

---

*Generated by CryptoIntel v0.1.0 at ${now.format('YYYY-MM-DD HH:mm:ss')} IST*
*Data sources: CoinGecko, DeFiLlama, CoinGlass, Crypto Twitter, CoinDesk, Decrypt, The Block*
`;

  const absOutputDir = resolve(ROOT, outputDir);
  mkdirSync(absOutputDir, { recursive: true });
  const mdPath = join(absOutputDir, `briefing-${dateStr}.md`);
  writeFileSync(mdPath, md, 'utf8');
  const jsonPath = join(absOutputDir, `briefing-${dateStr}.json`);
  writeFileSync(jsonPath, JSON.stringify({ date: dateStr, generated_at: now.toISOString(), data, briefing_md: md }, null, 2), 'utf8');

  return { markdown: md, paths: { md: mdPath, json: jsonPath }, date: dateStr };
}

module.exports = { runSynthesis };
