/**
 * 拉拉熊晨間廣播 RSS Feed 伺服器（穩健版）
 * 使用 Google Drive 直接下載連結（最穩定，100% 可用）
 * 不依賴 CDN，繞過所有 CDN 上傳失敗問題
 */
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;

const PODCAST_FOLDER_ID = process.env.PODCAST_FOLDER_ID || '1TgjlOxE1YfqYXw0ePuvQH2aPne1r77f2';
const MATON_API_KEY = process.env.MATON_API_KEY || 'xGdDL_GOLVLjZuZ9k65uJ513SR2vMJ7aczzIrYzOxU_B7TPUp4o2Cz12J2FMRwWonGrDG2BMxrIZTsm8BYf7lR291lZ-Mv_XKvU';
const MATON_CONN = process.env.MATON_CONN || 'aa84aef8-287a-4271-a4b7-26a67b0c6adf';
const MATON_BASE = 'https://gateway.maton.ai';

const FALLBACK_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>拉拉熊晨間廣播</title>
    <description>拉拉熊每日晨間廣播，正在恢復中...</description>
    <language>zh-tw</language>
    <itunes:explicit>false</itunes:explicit>
  </channel>
</rss>`;

// Google Drive 直接下載 URL（繞過 CDN）
function getAudioUrl(file) {
  const fileId = file.id;
  // 用本機代理 URL，確保以 .mp3 結尾（Apple Podcasts 需要）
  // 實際請求時會 302 轉址到 Google Drive 直接下載
  return `https://seedturtlepodcast.zeabur.app/audio/${fileId}.mp3`;
}

// 發送 Drive API 請求（純 Node.js，零依賴）
function httpsGet(hostname, pathname, search) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(`https://${hostname}${pathname}${search}`);
    const options = {
      hostname: fullUrl.hostname,
      path: fullUrl.pathname + fullUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MATON_API_KEY}`,
        'Maton-Connection': MATON_CONN,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
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
  // 查詢 podcast 資料夾中的所有 mp3 檔，按 createdTime 排序（最舊在前 = EP1）
  const fullUrl = new URL(MATON_BASE + '/google-drive/drive/v3/files');
  fullUrl.searchParams.set('fields', 'files(id,name,mimeType,createdTime,size,description)');
  fullUrl.searchParams.set('q', `mimeType='audio/mpeg' and '${PODCAST_FOLDER_ID}' in parents and trashed=false`);
  fullUrl.searchParams.set('orderBy', 'createdTime asc');
  fullUrl.searchParams.set('pageSize', 50);

  const parsed = new URL(fullUrl.toString());
  const result = await httpsGet(parsed.hostname, parsed.pathname, parsed.search);
  const files = result.files || [];
  console.log(`[RSS] Fetched ${files.length} files from Google Drive`);
  // 反轉：最新的集數在最上面
  return files.reverse();
}

function buildRss(files) {
  const now = new Date().toUTCString();
  const coverUrl = 'https://drive.google.com/uc?export=download&amp;id=11NAjcBCsUbsIvYzrZ3NDuYRmsgH9xP8H';
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>拉拉熊晨間廣播</title>
    <link>https://seedturtlepodcast.zeabur.app/</link>
    <description><![CDATA[拉拉熊每日晨間廣播，🌏 國際大局 💹 財經科技 🤖 AI Agent。每天早上五點，拉拉熊用溫暖的台灣男聲陪你迎接新的一天。]]></description>
    <language>zh-tw</language>
    <copyright>Copyright 2026 拉拉熊晨間廣播</copyright>
    <lastBuildDate>${now}</lastBuildDate>
    <image>
      <url>${coverUrl}</url>
      <title>拉拉熊晨間廣播</title>
      <link>https://seedturtlepodcast.zeabur.app/</link>
    </image>
    <itunes:author>拉拉熊</itunes:author>
    <itunes:subtitle>拉拉熊每日晨間廣播，溫暖你的每一天</itunes:subtitle>
    <itunes:summary><![CDATA[拉拉熊每日晨間廣播，每天早上五點為你帶來：🌏 國際大局最新動態、💹 財經科技與 AI Agent 產業趨勢、🏥 醫療健康新知，還有拉拉熊溫暖的陪伴與反思。]]></itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${coverUrl}"/>
    <itunes:category text="News">
      <itunes:category text="Daily News"/>
    </itunes:category>
    <itunes:category text="Technology"/>
    <itunes:owner>
      <itunes:name>拉拉熊</itunes:name>
      <itunes:email>seedturtle@gmail.com</itunes:email>
    </itunes:owner>
    <ttl>60</ttl>
    <atom:link href="https://seedturtlepodcast.zeabur.app/" rel="self" type="application/rss+xml"/>
`;
  files.forEach((file, index) => {
    const totalFiles = files.length;
    const episodeNum = totalFiles - index;
    // 從檔名抓日期（如：拉拉熊廣播_20260507.mp3）
    const nameMatch = file.name.match(/(\d{8})/);
    const dateStr = nameMatch ? nameMatch[1] : '';
    const title = dateStr
      ? `第${episodeNum}集｜${dateStr.slice(0,4)}/${dateStr.slice(4,6)}/${dateStr.slice(6,8)}`
      : `第${episodeNum}集`;
    const pubDate = file.createdTime ? new Date(file.createdTime).toUTCString() : now;
    const size = parseInt(file.size || 0);
    const audioUrl = getAudioUrl(file);

    xml += `    <item>
      <title><![CDATA[${title}]]></title>
      <link>https://seedturtlepodcast.zeabur.app/</link>
      <description><![CDATA[拉拉熊晨間廣播，${title}。🌏 國際大局 💹 財經科技 🤖 AI Agent]]></description>
      <itunes:summary><![CDATA[拉拉熊晨間廣播，${title}。🌏 國際大局 💹 財經科技 🤖 AI Agent]]></itunes:summary>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${audioUrl}" type="audio/mpeg" length="${size}"/>
      <guid isPermaLink="false">seedturtle_ep${episodeNum}_${file.id}</guid>
      <itunes:title>${title}</itunes:title>
      <itunes:episode>${episodeNum}</itunes:episode>
      <itunes:duration>${Math.floor(size / 16000)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>\n`;
  });
  return xml + '  </channel>\n</rss>';
}

// HTTP 伺服器
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }
  if (req.url === '/feed.xml' || req.url === '/') {
    try {
      const files = await getPodcastFiles();
      console.log(`[RSS] Building feed with ${files.length} episodes`);
      if (files.length > 0) {
        console.log(`[RSS] Latest (top): ${files[0].name}`);
        console.log(`[RSS] Oldest (bottom): ${files[files.length-1].name}`);
      }
      const xml = buildRss(files);
      res.writeHead(200, {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      });
      res.end(xml);
    } catch (err) {
      console.error('RSS error:', err.message);
      res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      res.end(FALLBACK_RSS);
    }
    return;
  }
  // 音頻代理：302 轉址到 Google Drive 直接下載
  const audioMatch = req.url.match(/^\/audio\/([a-zA-Z0-9_-]+)\.mp3$/);
  if (audioMatch) {
    const fileId = audioMatch[1];
    const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}&format=mp3`;
    console.log(`[AUDIO] Redirecting ${fileId} to Google Drive`);
    res.writeHead(302, {
      'Location': driveUrl,
      'Cache-Control': 'public, max-age=86400'
    });
    res.end();
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Podcast RSS running on port ${PORT} (GD direct links, no CDN)`);
});