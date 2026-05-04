/**
 * 拉拉熊晨間廣播 RSS Feed 伺服器
 * 自動從 Google Drive 讀取 MP3 檔案產生 Podcast RSS
 */
const https = require('https');
const express = require('express');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const PODCAST_FOLDER_ID = '1TgjlOxE1YfqYXw0ePuvQH2aPne1r77f2';
const MATON_API_KEY = 'xGdDL_GOLVLjZuZ9k65uJ513SR2vMJ7aczzIrYzOxU_B7TPUp4o2Cz12J2FMRwWonGrDG2BMxrIZTsm8BYf7lR291lZ-Mv_XKvU';
const MATON_CONN = 'aa84aef8-287a-4271-a4b7-26a67b0c6adf';
const MATON_BASE = 'https://gateway.maton.ai/google-drive';

// Google Drive API helper
async function driveRequest(path, params = {}) {
  const url = new URL(MATON_BASE + path);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  const response = await axios.get(url.toString(), {
    headers: {
      'Authorization': `Bearer ${MATON_API_KEY}`,
      'Maton-Connection': MATON_CONN
    }
  });
  return response.data;
}

// ========== 讀取 podcast 資料夾 ==========
async function getPodcastFiles() {
  const result = await driveRequest('/drive/v3/files', {
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,size,webContentLink,description)',
    q: `mimeType='audio/mpeg' and '${PODCAST_FOLDER_ID}' in parents and trashed=false`,
    orderBy: 'createdTime asc',
    pageSize: 50
  });
  return result.files || [];
}

// ========== MP3 公開網址（優先使用 CDN）==========
function getAudioUrl(file) {
  if (file.description && file.description.startsWith('http')) {
    return file.description;
  }
  if (file.webContentLink) {
    return file.webContentLink.replace('&format=mp3', '');
  }
  return `https://drive.google.com/uc?id=${file.id}&format=mp3`;
}

// ========== 產生 RSS XML ==========
function buildRss(files) {
  const SHOW = {
    title: '拉拉熊晨間廣播',
    description: '拉拉熊每日晨間廣播，帶你掌握國際大局、兩岸台海、財經科技與 AI Agent 最新動態。',
    link: 'https://seedturtlepodcast.zeabur.app',
    imageUrl: 'https://agent-cdn.minimax.io/mcp/cdn_upload/495582502232113157/382781085360351/1776813216_8ee24b04.png',
    language: 'zh-tw',
    ttl: '5',
    author: '拉拉熊',
    email: 'seedturtle1976@gmail.com'
  };

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom"
>
  <channel>
    <title>${SHOW.title}</title>
    <description><![CDATA[${SHOW.description}]]></description>
    <link>${SHOW.link}</link>
    <language>${SHOW.language}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>${SHOW.author}</itunes:author>
    <itunes:email>${SHOW.email}</itunes:email>
    <itunes:category text="News" />
    <itunes:explicit>false</itunes:explicit>
    <ttl>${SHOW.ttl}</ttl>
`;

  if (SHOW.imageUrl) {
    xml += `    <itunes:image href="${SHOW.imageUrl}"/>\n`;
    xml += `    <image><url>${SHOW.imageUrl}</url><title>${SHOW.title}</title><link>${SHOW.link}</link></image>\n`;
  }

  xml += `    <ttl>${SHOW.ttl}</ttl>\n`;

  // 按 Drive createdTime 從早到晚排序（第1個建立的=EP1）
  files.sort((a, b) => {
    const ta = a.createdTime ? new Date(a.createdTime).getTime() : 0;
    const tb = b.createdTime ? new Date(b.createdTime).getTime() : 0;
    return ta - tb;
  });

  files.forEach((file, index) => {
    // EP 集數 = 排序位置（第1個建立的=EP1，第N個=EPN）
    const episodeNum = index + 1;

    // 從檔名解析錄音日期（用於標題顯示）
    const nameMatch = file.name.match(/(\d{8})/);
    const dateStr = nameMatch ? nameMatch[1] : '';
    // pubDate：使用 Drive createdTime（第1個建立的時間）
    const pubDateStr = file.createdTime
      ? new Date(file.createdTime).toUTCString()
      : new Date().toUTCString();

    // MP3 大小（bytes），估算 duration
    const size = parseInt(file.size || 0);
    const durationSecs = Math.round((size / (128 * 1024 / 8)));

    // 集次標題：顯示 EP 集數與錄音日期
    const episodeTitle = dateStr
      ? `第${episodeNum}集｜${dateStr.slice(0,4)}/${dateStr.slice(4,6)}/${dateStr.slice(6,8)}`
      : `第${episodeNum}集`;

    // guid 固定格式：永遠認得同一集
    const guidValue = `seedturtle_ep${episodeNum}_${file.id}`;

    xml += `    <item>
      <title><![CDATA[${episodeTitle}]]></title>
      <description><![CDATA[拉拉熊晨間廣播，${episodeTitle}。🌏 國際大局 💹 財經科技 🤖 AI Agent]]></description>
      <pubDate>${pubDateStr}</pubDate>
      <enclosure url="${getAudioUrl(file)}" type="audio/mpeg" length="${size}"/>
      <guid isPermaLink="false">${guidValue}</guid>
      <itunes:title>${episodeTitle}</itunes:title>
      <itunes:episode>${episodeNum}</itunes:episode>
      <itunes:duration>${durationSecs}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>\n`;
  });

  xml += `  </channel>\n</rss>`;
  return xml;
}

// ========== 路由 ==========
const app = express();

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
    res.status(500).send('RSS error: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Podcast RSS server running on port ${PORT}`);
});