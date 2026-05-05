/**
 * 拉拉熊晨間廣播 RSS Feed 伺服器（穩健版）
 * 錯誤時返回簡化版本而非崩潰
 */
const express = require('express');
const https = require('https');

const PORT = process.env.PORT || 3000;

// 最基本的 fallback RSS（靜態內容，Drive 錯誤時仍可回應）
const FALLBACK_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>拉拉熊晨間廣播</title>
    <description>拉拉熊每日晨間廣播，正在恢復中...</description>
    <language>zh-tw</language>
    <itunes:explicit>false</itunes:explicit>
  </channel>
</rss>`;

// 如果 Maton Drive API key 缺失，直接用 fallback
const MATON_API_KEY = process.env.MATON_API_KEY || 'xGdDL_GOLVLjZuZ9k65uJ513SR2vMJ7aczzIrYzOxU_B7TPUp4o2Cz12J2FMRwWonGrDG2BMxrIZTsm8BYf7lR291lZ-Mv_XKvU';
const MATON_CONN = process.env.MATON_CONN || 'aa84aef8-287a-4271-a4b7-26a67b0c6adf';
const PODCAST_FOLDER_ID = process.env.PODCAST_FOLDER_ID || '1TgjlOxE1YfqYXw0ePuvQH2aPne1r77f2';
const MATON_BASE = 'https://gateway.maton.ai/google-drive';

const app = express();

// 簡化的 Drive API 請求（使用原生 https，避免 axios 問題）
function driveRequest(path, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(MATON_BASE + path);
    Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MATON_API_KEY}`,
        'Maton-Connection': MATON_CONN
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse failed: ' + data.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getPodcastFiles() {
  const result = await driveRequest('/drive/v3/files', {
    fields: 'files(id,name,mimeType,createdTime,size,description)',
    q: `mimeType='audio/mpeg' and '${PODCAST_FOLDER_ID}' in parents and trashed=false`,
    orderBy: 'createdTime asc',
    pageSize: 50
  });
  return result.files || [];
}

function getAudioUrl(file) {
  if (file.description && file.description.startsWith('http')) return file.description;
  return `https://drive.google.com/uc?id=${file.id}&format=mp3`;
}

function buildRss(files) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>拉拉熊晨間廣播</title>
    <description>拉拉熊每日晨間廣播，🌏 國際大局 💹 財經科技 🤖 AI Agent</description>
    <language>zh-tw</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>拉拉熊</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <ttl>5</ttl>
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/feed.xml', async (req, res) => {
  try {
    const files = await getPodcastFiles();
    const xml = buildRss(files);
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(xml);
  } catch (err) {
    console.error('RSS error:', err.message);
    // 即使 Drive 出錯，也返回 fallback RSS
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(FALLBACK_RSS);
  }
});

app.listen(PORT, () => {
  console.log(`Podcast RSS running on port ${PORT}`);
});
