/**
 * 拉拉熊晨間廣播 RSS Feed 伺服器（純 Node.js 內建模組，零依賴）
 * 錯誤時返回 fallback 而非崩潰
 */
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;

const FALLBACK_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>拉拉熊晨間廣播</title>
    <description>拉拉熊每日晨間廣播，正在恢復中...</description>
    <language>zh-tw</language>
    <itunes:explicit>false</itunes:explicit>
  </channel>
</rss>`;

const MATON_API_KEY = process.env.MATON_API_KEY || 'xGdDL_GOLVLjZuZ9k65uJ513SR2vMJ7aczzIrYzOxU_B7TPUp4o2Cz12J2FMRwWonGrDG2BMxrIZTsm8BYf7lR291lZ-Mv_XKvU';
const MATON_CONN = process.env.MATON_CONN || 'aa84aef8-287a-4271-a4b7-26a67b0c6adf';
const PODCAST_FOLDER_ID = process.env.PODCAST_FOLDER_ID || '1TgjlOxE1YfqYXw0ePuvQH2aPne1r77f2';
const MATON_BASE = 'https://gateway.maton.ai';

function httpGet(options, postData) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(options.hostname + options.path, 'https://' + options.hostname);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function driveRequest(path, params) {
  const fullUrl = new URL(MATON_BASE + path);
  if (params) Object.keys(params).forEach(k => fullUrl.searchParams.set(k, params[k]));
  const opts = {
    hostname: fullUrl.hostname,
    path: fullUrl.pathname + fullUrl.search,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${MATON_API_KEY}`,
      'Maton-Connection': MATON_CONN,
      'Content-Type': 'application/json'
    }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getPodcastFiles() {
  const result = await driveRequest('/google-drive/drive/v3/files', {
    fields: 'files(id,name,mimeType,createdTime,size,description)',
    q: `mimeType='audio/mpeg' and '${PODCAST_FOLDER_ID}' in parents and trashed=false`,
    orderBy: 'createdTime asc',
    pageSize: 50
  });
  return (result.files || []);
}

function getAudioUrl(file) {
  if (file.description && file.description.startsWith('http')) return file.description;
  return `https://drive.google.com/uc?id=${file.id}&format=mp3`;
}

function buildRss(files) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>拉拉熊晨間廣播</title>
    <description><![CDATA[拉拉熊每日晨間廣播，🌏 國際大局 💹 財經科技 🤖 AI Agent]]></description>
    <language>zh-tw</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>拉拉熊</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <ttl>5</ttl>
    <atom:link href="https://seedturtlepodcast.zeabur.app/feed.xml" rel="self" type="application/rss+xml"/>
`;
  files.forEach((file, index) => {
    const episodeNum = index + 1;
    const nameMatch = file.name.match(/(\d{8})/);
    const dateStr = nameMatch ? nameMatch[1] : '';
    const title = dateStr
      ? `第${episodeNum}集｜${dateStr.slice(0,4)}/${dateStr.slice(4,6)}/${dateStr.slice(6,8)}`
      : `第${episodeNum}集`;
    const pubDate = file.createdTime ? new Date(file.createdTime).toUTCString() : new Date().toUTCString();
    const size = parseInt(file.size || 0);
    xml += `    <item>
      <title><![CDATA[${title}]]></title>
      <description><![CDATA[拉拉熊晨間廣播，${title}。🌏 國際大局 💹 財經科技 🤖 AI Agent]]></description>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${getAudioUrl(file)}" type="audio/mpeg" length="${size}"/>
      <guid isPermaLink="false">seedturtle_ep${episodeNum}_${file.id}</guid>
      <itunes:title>${title}</itunes:title>
      <itunes:episode>${episodeNum}</itunes:episode>
      <itunes:explicit>false</itunes:explicit>
    </item>\n`;
  });
  return xml + '  </channel>\n</rss>';
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }
  if (req.url === '/feed.xml' || req.url === '/') {
    try {
      const files = await getPodcastFiles();
      const xml = buildRss(files);
      res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
      res.end(xml);
    } catch (err) {
      console.error('RSS error:', err.message);
      res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      res.end(FALLBACK_RSS);
    }
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Podcast RSS running on port ${PORT} (zero dependencies)`);
});