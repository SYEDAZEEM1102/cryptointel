const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const DEFAULT_FEEDS = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
];

function loadConfig() {
  try {
    const cfg = require('../../config/config.json');
    return cfg?.news?.sources?.map(s => ({ name: s.name, url: s.rss })) || DEFAULT_FEEDS;
  } catch { return DEFAULT_FEEDS; }
}

function parseItems(xml, sourceName) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];
  // RSS <item> or Atom <entry>
  const nodes = $('item').length ? $('item') : $('entry');
  nodes.each((_, el) => {
    const $el = $(el);
    const title = $el.find('title').first().text().trim();
    const link = $el.find('link').first().text().trim()
      || $el.find('link').first().attr('href') || '';
    const pubDateRaw = $el.find('pubDate').first().text().trim()
      || $el.find('published').first().text().trim()
      || $el.find('updated').first().text().trim();
    const description = $el.find('description').first().text().trim()
      || $el.find('summary').first().text().trim()
      || $el.find('content').first().text().trim();

    if (title) {
      items.push({
        source: sourceName,
        title,
        link: link.replace(/\s+/g, ''),
        pubDate: pubDateRaw || null,
        pubDateTs: pubDateRaw ? new Date(pubDateRaw).getTime() : 0,
        description: cheerio.load(description).text().slice(0, 500),
      });
    }
  });
  return items;
}

async function fetchFeed(feed, cutoffTs) {
  try {
    const { data } = await axios.get(feed.url, {
      timeout: 15000,
      headers: { 'User-Agent': 'CryptoIntel/1.0' },
    });
    const items = parseItems(data, feed.name);
    return items.filter(i => i.pubDateTs >= cutoffTs);
  } catch (err) {
    console.error(`[rss] Failed to fetch ${feed.name}: ${err.message}`);
    return [];
  }
}

async function fetchAllFeeds(hoursBack = 24) {
  const feeds = loadConfig();
  const cutoffTs = Date.now() - hoursBack * 60 * 60 * 1000;
  const results = await Promise.allSettled(feeds.map(f => fetchFeed(f, cutoffTs)));
  const allItems = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);
  allItems.sort((a, b) => b.pubDateTs - a.pubDateTs);
  return allItems;
}

module.exports = { fetchAllFeeds, fetchFeed, parseItems };
