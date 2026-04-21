/**
 * 拉拉熊晨間廣播 RSS Feed Server
 * 
 * 查询 Google Drive podcast 資料夾，動態生成 RSS XML
 * 部署到 Zeabur，透過 /feed.xml 供 Podcast 平台訂閱
 */

const express = require('express');
const https = require('https');

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ========== 設定區 ==========
const PODCAST_FOLDER_ID = '1TgjlOxE1YfqYXw0ePuvQH2aPne1r77f2';
const FEED_BASE_URL = process.env.FEED_BASE_URL || 'https://seedturtlepodcast.zeabur.app';  // KIRITU/podcast
const SHOW = {
  title: '拉拉熊晨間廣播',
  description: '每天早上7點，透過AI為您整理國際大局、財經科技與AI Agent最新動態。溫暖的聲音，豐富的內容，拉拉熊陪伴您的每一天早晨。',
  author: '拉拉熊 🐻',
  email: 'seedturtle1976@gmail.com',
  language: 'zh-tw',
  categories: ['Technology', 'News', 'Science'],
  imageUrl: process.env.COVER_IMAGE_URL || 'https://agent-cdn.minimax.io/mcp/cdn_upload/495582502232113157/382781085360351/1776780467_ef7b9790.png',
  link: process.env.PODCAST_LINK || 'https://seedturtlepodcast.zeabur.app',
  ownerName: '洪醫師 Seedturtle',
  copyright: `Copyright ${new Date().getFullYear()} 拉拉熊晨間廣播`,
  ttl: 60  // minutes to cache before refresh
};

// Maton API Gateway
const MATON_KEY = process.env.MATON_API_KEY;
const CONN_ID   = process.env.MATON_CONN_ID || 'aa84aef8-287a-4271-a4b7-26a67b0c6adf';

// ========== Google Drive 查詢（Maton Gateway）==========
function driveRequest(path, params = {}) {
  return new Promise((resolve, reject) => {
    const queryParts = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    const qs = queryParts.length ? '?' + queryParts.join('&') : '';
    const options = {
      hostname: 'gateway.maton.ai',
      path: `/google-drive${path}${qs}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MATON_KEY}`,
        'Maton-Connection': CONN_ID
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => reject(new Error('Drive request timeout')));
    req.end();
  });
}

async function getPodcastFiles() {
  // 查詢 podcast 資料夾中的 MP3 檔案，按修改時間倒序
  const result = await driveRequest('/drive/v3/files', {
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,size,webContentLink,description)',
    q: `mimeType='audio/mpeg' and '${PODCAST_FOLDER_ID}' in parents and trashed=false`,
    orderBy: 'modifiedTime desc',
    pageSize: 50
  });
  return result.files || [];
}

// ========== MP3 公開網址（優先使用 CDN）==========
// Google Drive 支援 description 存放 CDN URL
// 流程：上傳 MP3 → 上傳 CDN → 將 CDN URL 存入 description
// RSS 優先取 description，否則 fallback 到 Google Drive URL
function getAudioUrl(file) {
  // 第一優先：Google Drive description（存放 CDN URL）
  if (file.description && file.description.startsWith('http')) {
    return file.description;
  }
  // 第二優先：webContentLink（如果有）
  if (file.webContentLink) {
    return file.webContentLink.replace('&export=download', '&format=mp3');
  }
  // 第三優先：CDN CDS 格式
  return `https://drive.google.com/uc?id=${file.id}&export=download`;
}

// ========== RSS XML 生成 ==========
function generateRSS(files) {
  const baseUrl = FEED_BASE_URL;
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${SHOW.title}]]></title>
    <link>${SHOW.link}</link>
    <description><![CDATA[${SHOW.description}]]></description>
    <language>${SHOW.language}</language>
    <copyright>${SHOW.copyright}</copyright>
    <itunes:author>${SHOW.author}</itunes:author>
    <itunes:summary><![CDATA[${SHOW.description}]]></itunes:summary>
    <itunes:owner>
      <itunes:name>${SHOW.ownerName}</itunes:name>
      <itunes:email>${SHOW.email}</itunes:email>
    </itunes:owner>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Technology"/>
    <itunes:category text="News"/>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
`;

  if (SHOW.imageUrl) {
    xml += `    <itunes:image href="${SHOW.imageUrl}"/>\n`;
    xml += `    <image><url>${SHOW.imageUrl}</url><title>${SHOW.title}</title><link>${SHOW.link}</link></image>\n`;
  }

  xml += `    <ttl>${SHOW.ttl}</ttl>\n`;

  files.forEach((file, index) => {
    // 從檔名解析日期與集次
    // 格式：拉拉熊廣播_YYYYMMDD.mp3
    const nameMatch = file.name.match(/(\d{8})/);
    const dateStr = nameMatch ? nameMatch[1] : '';
    const pubDate = file.modifiedTime
      ? new Date(file.modifiedTime).toUTCString()
      : new Date().toUTCString();

    // MP3 大小（bytes）
    const size = parseInt(file.size || 0);
    const durationSecs = Math.round((size / (128 * 1024 / 8))); // 估算（128kbps）

    // 集次標題
    const episodeNum = files.length - index;
    const episodeTitle = dateStr
      ? `第${episodeNum}集｜${dateStr.slice(0,4)}/${dateStr.slice(4,6)}/${dateStr.slice(6,8)}`
      : `第${episodeNum}集`;

    xml += `    <item>
      <title><![CDATA[${episodeTitle}]]></title>
      <description><![CDATA[拉拉熊晨間廣播，${episodeTitle}。🌏 國際大局 💹 財經科技 🤖 AI Agent]]></description>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${getAudioUrl(file)}" type="audio/mpeg" length="${size}"/>
      <guid isPermaLink="false">${file.id}</guid>
      <itunes:title>${episodeTitle}</itunes:title>
      <itunes:duration>${durationSecs}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>\n`;
  });

  xml += `  </channel>\n</rss>`;
  return xml;
}

// ========== 路由 ==========

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// RSS Feed
app.get('/feed.xml', async (req, res) => {
  try {
    const files = await getPodcastFiles();
    const xml = generateRSS(files);
    
    res.set({
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',  // 1小時快取
      'Access-Control-Allow-Origin': '*'
    });
    res.send(xml);
    console.log(`[${new Date().toISOString()}] RSS generated: ${files.length} episodes`);
  } catch (err) {
    console.error('RSS error:', err.message);
    res.status(500).send(`<!-- RSS Error: ${err.message} -->`);
  }
});

// 文字版列表（除錯用）
app.get('/episodes', async (req, res) => {
  try {
    const files = await getPodcastFiles();
    res.json({
      count: files.length,
      episodes: files.map(f => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
        size: f.size
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 啟動 ==========
app.listen(PORT, () => {
  console.log(`🐻 拉拉熊 RSS Server 啟動！`);
  console.log(`📡 Feed URL: ${FEED_BASE_URL}/feed.xml`);
  console.log(`📋 Episodes: ${FEED_BASE_URL}/episodes`);
});
