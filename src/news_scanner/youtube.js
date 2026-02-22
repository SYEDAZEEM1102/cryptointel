const { execSync } = require('child_process');

const DEFAULT_CHANNELS = [
  'Miles Deutscher Finance',
  'Coin Bureau',
  'Benjamin Cowen',
  'Raoul Pal',
  'DataDash',
  'Altcoin Daily',
  'CryptoBanter',
];

function loadConfig() {
  try {
    const cfg = require('../../config/config.json');
    return cfg?.news?.youtube_channels || DEFAULT_CHANNELS;
  } catch { return DEFAULT_CHANNELS; }
}

function scanChannel(channelName, cutoffTs) {
  const searchQuery = `ytsearch10:${channelName}`;
  try {
    const raw = execSync(
      `yt-dlp --flat-playlist --dump-json --no-warnings "${searchQuery}"`,
      { timeout: 30000, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
    );
    const videos = [];
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const entry = JSON.parse(line);
        // yt-dlp upload_date is YYYYMMDD
        let uploadTs = 0;
        if (entry.upload_date) {
          const d = entry.upload_date;
          uploadTs = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`).getTime();
        } else if (entry.timestamp) {
          uploadTs = entry.timestamp * 1000;
        }
        if (uploadTs >= cutoffTs) {
          videos.push({
            channel: channelName,
            title: entry.title || entry.fulltitle || '',
            url: entry.url ? `https://www.youtube.com/watch?v=${entry.id || entry.url}` : '',
            uploadDate: entry.upload_date || null,
            uploadTs,
            duration: entry.duration || 0,
            durationStr: formatDuration(entry.duration || 0),
            viewCount: entry.view_count || 0,
          });
        }
      } catch { /* skip malformed line */ }
    }
    return videos;
  } catch (err) {
    console.error(`[youtube] Failed to scan "${channelName}": ${err.message}`);
    return [];
  }
}

function formatDuration(secs) {
  if (!secs) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

async function scanAllChannels(hoursBack = 24) {
  const channels = loadConfig();
  const cutoffTs = Date.now() - hoursBack * 60 * 60 * 1000;
  const allVideos = [];
  for (const ch of channels) {
    const videos = scanChannel(ch, cutoffTs);
    allVideos.push(...videos);
  }
  allVideos.sort((a, b) => b.viewCount - a.viewCount);
  return allVideos;
}

module.exports = { scanAllChannels, scanChannel };
