const fs = require('fs');
const https = require('https');

// Arc Raiders Steam App ID
const ARC_RAIDERS_APP_ID = '2325290';
const STEAM_NEWS_URL = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${ARC_RAIDERS_APP_ID}&count=15&maxlength=500&format=json`;

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

function makeId(title) {
  return title
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

  return {
    id: 'steam-' + makeId(item.title),
    title: item.title,
    status: 'confirmed',
    startDate: dateStr,
    endDate: null,
    teaser: teaser,
    summary: clean.length > 500 ? clean.substring(0, 497) + '...' : clean,
    howItWorks: ['Details sourced from official Steam news feed', 'Check the source link for full information'],
    rewards: ['See official announcement for details'],
    raiderImpact: ['Solo: Check source for gameplay impact', 'Duo: Check source for gameplay impact', 'Trio: Check source for gameplay impact'],
    sources: [{ label: 'Steam News', url: item.url || ('https://store.steampowered.com/news/app/' + ARC_RAIDERS_APP_ID) }],
    lastUpdated: dateStr
  };
}

async function main() {
  console.log('Fetching Arc Raiders news from Steam...');

  let existingData = [];
  try {
    existingData = JSON.parse(fs.readFileSync('intel-data.json', 'utf-8'));
    console.log('Loaded ' + existingData.length + ' existing intel entries');
  } catch (e) {
    console.log('No existing intel-data.json found, starting fresh');
  }

  const existingIds = new Set(existingData.map(e => e.id));
  const manualEntries = existingData.filter(e => !e.id.startsWith('steam-'));

  let steamNews = [];
  try {
    const data = await fetch(STEAM_NEWS_URL);
    if (data.appnews && data.appnews.newsitems) {
      steamNews = data.appnews.newsitems;
      console.log('Fetched ' + steamNews.length + ' news items from Steam');
    }
  } catch (e) {
    console.error('Failed to fetch Steam news:', e.message);
  }

  const newSteamEntries = [];
  const existingSteamEntries = existingData.filter(e => e.id.startsWith('steam-'));
  const existingSteamIds = new Set(existingSteamEntries.map(e => e.id));

  for (const item of steamNews) {
    const intel = newsToIntel(item);
    if (!existingSteamIds.has(intel.id)) {
      newSteamEntries.push(intel);
      console.log('New intel: ' + intel.title);
    }
  }

  const allEntries = [...manualEntries, ...newSteamEntries, ...existingSteamEntries];

  allEntries.sort((a, b) => {
    const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
    const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
    return dateB - dateA;
  });

  fs.writeFileSync('intel-data.json', JSON.stringify(allEntries, null, 2));
  console.log('Wrote ' + allEntries.length + ' total entries to intel-data.json');
  console.log('Added ' + newSteamEntries.length + ' new Steam entries');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
