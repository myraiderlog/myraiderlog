const fs = require('fs');
const https = require('https');

// Arc Raiders Steam App ID (correct)
const ARC_RAIDERS_APP_ID = '1808500';
const STEAM_NEWS_URL = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${ARC_RAIDERS_APP_ID}&count=30&maxlength=800&format=json`;

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\{STEAM_CLAN_IMAGE\}[^\s]*/g, '')
    .replace(/\[\/?[^\]]*\]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isArcRaidersNews(item) {
  // Only include items that are actually about Arc Raiders
  const title = (item.title || '').toLowerCase();
  const content = (item.contents || '').toLowerCase();
  const label = (item.feedlabel || '').toLowerCase();
  
  // Skip generic top sellers / charts lists unless Arc Raiders is in the title
  if (title.includes('top sellers') || title.includes('top played')) {
    return false;
  }
  
  // Must mention arc raiders in title or be from the official Arc Raiders feed
  if (item.appid === 1808500 && !item.is_external_url) return true;
  if (title.includes('arc raiders') || title.includes('arc raider')) return true;
  if (label.includes('arc raiders')) return true;
  
  return false;
}

function makeId(title) {
  return 'steam-' + title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function formatDate(timestamp) {
  const d = new Date(timestamp * 1000);
  return d.toISOString().split('T')[0];
}

function newsToIntel(item) {
  const clean = stripHtml(item.contents || '');
  const teaser = clean.length > 150 ? clean.substring(0, 147) + '...' : clean;
  const dateStr = formatDate(item.date);
  const source = item.feedlabel || 'Steam';

  return {
    id: makeId(item.title),
    title: item.title,
    status: 'confirmed',
    startDate: dateStr,
    endDate: null,
    teaser: teaser,
    summary: clean.length > 600 ? clean.substring(0, 597) + '...' : clean,
    howItWorks: ['Details sourced from ' + source + ' news feed', 'Check the source link for full information'],
    rewards: ['See official announcement for full details'],
    raiderImpact: ['Solo: Check source for gameplay impact', 'Duo: Check source for gameplay impact', 'Trio: Check source for gameplay impact'],
    sources: [{ label: source, url: item.url || ('https://store.steampowered.com/news/app/' + ARC_RAIDERS_APP_ID) }],
    lastUpdated: dateStr
  };
}

async function main() {
  console.log('Fetching Arc Raiders news from Steam (App ID: ' + ARC_RAIDERS_APP_ID + ')...');

  let existingData = [];
  try {
    existingData = JSON.parse(fs.readFileSync('intel-data.json', 'utf-8'));
    console.log('Loaded ' + existingData.length + ' existing intel entries');
  } catch (e) {
    console.log('No existing intel-data.json found, starting fresh');
  }

  // Separate manual entries from steam entries
  const manualEntries = existingData.filter(e => !e.id.startsWith('steam-'));
  const existingSteamEntries = existingData.filter(e => e.id.startsWith('steam-'));
  const existingSteamIds = new Set(existingSteamEntries.map(e => e.id));

  console.log('Manual entries: ' + manualEntries.length);
  console.log('Existing Steam entries: ' + existingSteamEntries.length);

  let steamNews = [];
  try {
    const data = await fetch(STEAM_NEWS_URL);
    if (data.appnews && data.appnews.newsitems) {
      steamNews = data.appnews.newsitems;
      console.log('Fetched ' + steamNews.length + ' raw news items from Steam');
    }
  } catch (e) {
    console.error('Failed to fetch Steam news:', e.message);
  }

  // Filter to Arc Raiders only
  const arcNews = steamNews.filter(isArcRaidersNews);
  console.log('Filtered to ' + arcNews.length + ' Arc Raiders news items');

  const newSteamEntries = [];
  for (const item of arcNews) {
    const intel = newsToIntel(item);
    if (!existingSteamIds.has(intel.id)) {
      newSteamEntries.push(intel);
      console.log('NEW: ' + intel.title);
    }
  }

  // Combine: manual entries first, then new steam, then existing steam
  const allEntries = [...manualEntries, ...newSteamEntries, ...existingSteamEntries];

  // Sort by date descending
  allEntries.sort((a, b) => {
    const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
    const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
    return dateB - dateA;
  });

  fs.writeFileSync('intel-data.json', JSON.stringify(allEntries, null, 2));
  console.log('Wrote ' + allEntries.length + ' total entries to intel-data.json');
  console.log('Added ' + newSteamEntries.length + ' new Arc Raiders entries');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
