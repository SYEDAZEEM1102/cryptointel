const { fetchAllFeeds } = require('./rss');
const { scanAllChannels } = require('./youtube');
const { summarizeNewsAndVideos } = require('./summarize');

async function runNewsScanner(options = {}) {
  const hoursBack = options.hoursBack || 24;
  console.log(`[news_scanner] Scanning last ${hoursBack}h...`);

  const [newsItems, videos] = await Promise.allSettled([
    fetchAllFeeds(hoursBack),
    scanAllChannels(hoursBack),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));

  console.log(`[news_scanner] Found ${newsItems.length} news items, ${videos.length} videos`);

  const summary = await summarizeNewsAndVideos(newsItems, videos);

  return {
    ...summary,
    raw: {
      news: newsItems,
      youtube: videos,
    },
  };
}

module.exports = { runNewsScanner };
