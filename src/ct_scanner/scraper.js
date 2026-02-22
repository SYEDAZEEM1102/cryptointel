/**
 * CT Scanner - X/Twitter List Scraper
 * Multi-fallback scraper: X direct -> Nitter instances -> empty graceful degradation
 */

const axios = require('axios');
const cheerio = require('cheerio');

const NITTER_INSTANCES = [
  'nitter.privacydev.net',
  'nitter.poast.org',
  'nitter.woodland.cafe',
  'nitter.1d4.us',
  'nitter.kavin.rocks',
  'nitter.unixfox.eu',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 15000;

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Extract list ID from X list URL
 */
function extractListId(url) {
  const m = url.match(/lists\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Try fetching a URL with retries
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await axios.get(url, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        maxRedirects: 3,
      });
      return resp.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 || status === 503) {
        const wait = RETRY_DELAY_MS * (i + 1) * 2;
        await sleep(wait);
        continue;
      }
      if (i < retries) {
        await sleep(RETRY_DELAY_MS * (i + 1));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Parse tweets from Nitter HTML
 */
function parseNitterTimeline(html) {
  const $ = cheerio.load(html);
  const tweets = [];

  $('.timeline-item, .thread-line').each((_, el) => {
    try {
      const $el = $(el);

      const author = $el.find('.username').first().text().trim().replace(/^@/, '');
      const fullname = $el.find('.fullname').first().text().trim();
      const tweetText = $el.find('.tweet-content, .media-body').first().text().trim();
      const dateStr = $el.find('.tweet-date a').attr('title') || $el.find('time').attr('datetime') || '';

      // Engagement stats
      const statsText = $el.find('.tweet-stat, .icon-container').map((_, s) => $(s).text().trim()).get();
      const stats = parseNitterStats($el);

      if (!tweetText && !author) return;

      const tweetUrl = $el.find('.tweet-link, .tweet-date a').attr('href') || '';

      tweets.push({
        author: author || 'unknown',
        fullname: fullname || author || 'unknown',
        text: tweetText,
        timestamp: dateStr ? new Date(dateStr).toISOString() : null,
        likes: stats.likes,
        retweets: stats.retweets,
        replies: stats.replies,
        bookmarks: stats.bookmarks,
        views: stats.views,
        url: tweetUrl,
        source: 'nitter',
      });
    } catch (_) { /* skip malformed */ }
  });

  return tweets;
}

/**
 * Parse engagement numbers from Nitter stat elements
 */
function parseNitterStats($el) {
  const stats = { likes: 0, retweets: 0, replies: 0, bookmarks: 0, views: 0 };

  $el.find('.tweet-stat, .icon-container').each((_, s) => {
    const text = cheerio.load(s).text().trim().toLowerCase();
    const num = parseEngagementNum(text);

    if (text.includes('comment') || text.includes('repl')) stats.replies = num;
    else if (text.includes('retweet') || text.includes('rt') || text.includes('repeat')) stats.retweets = num;
    else if (text.includes('like') || text.includes('heart') || text.includes('fav')) stats.likes = num;
    else if (text.includes('bookmark')) stats.bookmarks = num;
    else if (text.includes('view') || text.includes('play')) stats.views = num;
  });

  // Alternative: look for stat icons by class
  $el.find('[class*="icon-"]').each((_, s) => {
    const $s = cheerio.load(s);
    const cls = $s('*').first().attr('class') || '';
    const num = parseEngagementNum($s.text().trim());

    if (cls.includes('comment')) stats.replies = num;
    else if (cls.includes('retweet')) stats.retweets = num;
    else if (cls.includes('heart') || cls.includes('like')) stats.likes = num;
  });

  return stats;
}

/**
 * Parse human-readable numbers (1.2K, 5M, etc.)
 */
function parseEngagementNum(str) {
  const match = str.match(/([\d,.]+)\s*([kmb])?/i);
  if (!match) return 0;
  let num = parseFloat(match[1].replace(/,/g, ''));
  const suffix = (match[2] || '').toLowerCase();
  if (suffix === 'k') num *= 1000;
  else if (suffix === 'm') num *= 1_000_000;
  else if (suffix === 'b') num *= 1_000_000_000;
  return Math.round(num);
}

/**
 * Try scraping via X directly (usually blocked, but worth trying)
 */
async function scrapeXDirect(listUrl) {
  try {
    const html = await fetchWithRetry(listUrl, 1);
    // X serves a JS app shell; there's rarely useful HTML content
    // But we try to parse any server-rendered tweets
    const $ = cheerio.load(html);
    const tweets = [];

    $('[data-testid="tweet"]').each((_, el) => {
      const $el = $(el);
      tweets.push({
        author: $el.find('[data-testid="User-Name"] a').first().text().trim(),
        text: $el.find('[data-testid="tweetText"]').text().trim(),
        timestamp: $el.find('time').attr('datetime') || null,
        likes: 0, retweets: 0, replies: 0, bookmarks: 0, views: 0,
        url: listUrl,
        source: 'x_direct',
      });
    });

    return tweets.filter(t => t.text);
  } catch {
    return [];
  }
}

/**
 * Try scraping via Nitter instances
 */
async function scrapeViaNitter(listUrl) {
  const listId = extractListId(listUrl);
  if (!listId) return [];

  // Shuffle instances to distribute load
  const instances = [...NITTER_INSTANCES].sort(() => Math.random() - 0.5);

  for (const instance of instances) {
    try {
      // Nitter list URL format varies by instance
      const nitterUrl = `https://${instance}/i/lists/${listId}`;
      const html = await fetchWithRetry(nitterUrl, 1);
      const tweets = parseNitterTimeline(html);
      if (tweets.length > 0) {
        return tweets;
      }
    } catch {
      continue; // Try next instance
    }
  }

  return [];
}

/**
 * Filter tweets to last 24 hours
 */
function filterLast24h(tweets) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return tweets.filter(t => {
    if (!t.timestamp) return true; // Keep tweets without timestamp (can't verify)
    try {
      return new Date(t.timestamp).getTime() >= cutoff;
    } catch {
      return true;
    }
  });
}

/**
 * Deduplicate tweets by text similarity
 */
function deduplicateTweets(tweets) {
  const seen = new Set();
  return tweets.filter(t => {
    const key = `${t.author}:${t.text.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Main scraper function - scrapes all configured lists
 * @param {Array} lists - Array of {name, url} from config
 * @returns {Object} { tweets: [], warnings: [], scrapedLists: number, failedLists: number }
 */
async function scrapeLists(lists) {
  const result = {
    tweets: [],
    warnings: [],
    scrapedLists: 0,
    failedLists: 0,
    scrapedAt: new Date().toISOString(),
  };

  if (!lists || !Array.isArray(lists) || lists.length === 0) {
    result.warnings.push('No lists configured');
    return result;
  }

  for (const list of lists) {
    try {
      // Strategy 1: Try X direct
      let tweets = await scrapeXDirect(list.url);

      // Strategy 2: Try Nitter fallback
      if (tweets.length === 0) {
        tweets = await scrapeViaNitter(list.url);
      }

      if (tweets.length > 0) {
        // Tag tweets with list source
        tweets.forEach(t => { t.listName = list.name; });
        result.tweets.push(...tweets);
        result.scrapedLists++;
      } else {
        result.failedLists++;
        result.warnings.push(`No tweets scraped from "${list.name}" (${list.url})`);
      }

      // Polite delay between lists
      await sleep(1500 + Math.random() * 1500);
    } catch (err) {
      result.failedLists++;
      result.warnings.push(`Error scraping "${list.name}": ${err.message}`);
    }
  }

  // Filter to 24h and deduplicate
  result.tweets = deduplicateTweets(filterLast24h(result.tweets));

  if (result.tweets.length === 0 && result.failedLists > 0) {
    result.warnings.push('WARNING: All scraping methods failed. X and Nitter may be blocking requests. Results are empty.');
  }

  return result;
}

module.exports = {
  scrapeLists,
  scrapeXDirect,
  scrapeViaNitter,
  filterLast24h,
  deduplicateTweets,
  parseEngagementNum,
  extractListId,
};
