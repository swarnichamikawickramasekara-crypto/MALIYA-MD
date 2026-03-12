const { cmd, replyHandlers } = require("../command");
const puppeteer = require("puppeteer");

// දත්ත තාවකාලිකව ගබඩා කිරීමට
const pendingSearch = {};
const pendingQuality = {};

// -----------------------------
// Helper Functions
// -----------------------------
function normalizeQuality(text) {
  if (!text) return "Unknown";
  text = text.toUpperCase();
  if (/1080|FHD/.test(text)) return "1080p";
  if (/720|HD/.test(text)) return "720p";
  if (/480|SD/.test(text)) return "480p";
  return text;
}

async function searchMovies(query) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(`https://cinesubz.lk/?s=${encodeURIComponent(query)}`, { waitUntil: "networkidle2", timeout: 60000 });
    
    return await page.$$eval(".display-item .item-box", boxes =>
      boxes.slice(0, 10).map((box, index) => ({
        id: index + 1,
        title: box.querySelector("a")?.title?.trim() || "No Title",
        movieUrl: box.querySelector("a")?.href || "",
        thumb: box.querySelector("img")?.src || "",
      })).filter(m => m.movieUrl)
    );
  } finally {
    await browser.close();
  }
}

async function getDirectDownloadLinks(movieUrl) {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(movieUrl, { waitUntil: "networkidle2" });

    const linkItems = await page.$$eval('a[href*="/zt-links/"]', links => 
      links.map(link => {
        const text = link.closest('div')?.innerText || "";
        return {
          url: link.href,
          quality: text.includes('1080p') ? '1080p' : text.includes('720p') ? '720p' : '480p',
          size: text.match(/\d+(\.\d+)?\s*(GB|MB)/i)?.[0] || 'Unknown'
        };
      })
    );

    let finalLinks = [];
    for (const item of linkItems.slice(0, 3)) {
      try {
        await page.goto(item.url, { waitUntil: "networkidle2" });
        const finalPageUrl = await page.$eval('a.btn-danger, .download-btn', el => el.href).catch(() => null);
        if (finalPageUrl) {
          await page.goto(finalPageUrl, { waitUntil: "networkidle2" });
          const directFileLink = await page.$eval('a[href*="sonic-cloud.online"]', el => el.href).catch(() => null);
          if (directFileLink) {
            finalLinks.push({ link: directFileLink, quality: item.quality, size: item.size });
          }
        }
      } catch (e) {}
    }
    return finalLinks;
  } finally {
    await browser.close();
  }
}

// -----------------------------
// Main Command
// -----------------------------
cmd({
  pattern: "film",
  alias: ["movie", "cinesubz"],
  category: "download",
  react: "🎬",
  desc: "Cinesubz movie downloader",
  filename: __filename
}, async (sock, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("අවශ්‍ය චිත්‍රපටයේ නම ඇතුළත් කරන්න. (උදා: .film Leo)");
  
  reply("🔎 සොයමින් පවතී, කරුණාකර රැඳී සිටින්න...");
  const results = await searchMovies(q);
  if (results.length === 0) return reply("❌ කිසිවක් හමු වූයේ නැත.");

  pendingSearch[sender] = { results, timestamp: Date.now() };

  let msg = `🎬 *CINESUBZ MOVIE SEARCH*\n\n`;
  results.forEach((res, i) => msg += `*${i + 1}.* ${res.title}\n`);
  msg += `\n📥 *ලින්ක් ලබාගැනීමට අංකය Reply කරන්න.*`;

  await sock.sendMessage(from, { image: { url: results[0].thumb }, caption: msg }, { quoted: mek });
});

// -----------------------------
// Reply Handlers (Number Listeners)
// -----------------------------

// 1. චිත්‍රපටය තේරීම සඳහා
replyHandlers.push({
  filter: (body, { sender }) => {
    return pendingSearch[sender] && !isNaN(body) && parseInt(body) <= pendingSearch[sender].results.length;
  },
  react: "⏳",
  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const index = parseInt(body) - 1;
    const selected = pendingSearch[sender].results[index];
    delete pendingSearch[sender];

    reply(`⏳ *${selected.title}* සඳහා Direct Links ලබාගනිමින් පවතී...`);
    const links = await getDirectDownloadLinks(selected.movieUrl);
    
    if (links.length === 0) return reply("❌ Direct links සොයාගත නොහැකි විය.");

    pendingQuality[sender] = { title: selected.title, links, timestamp: Date.now() };

    let qMsg = `🎬 *${selected.title}*\n\n`;
    links.forEach((l, i) => qMsg += `*${i + 1}.* ${l.quality} (${l.size})\n`);
    qMsg += `\n📥 *ඩවුන්ලෝඩ් කිරීමට අංකය Reply කරන්න.*`;
    
    reply(qMsg);
  }
});

// 2. Quality එක තේරීම සහ File එක යැවීම සඳහා
replyHandlers.push({
  filter: (body, { sender }) => {
    return pendingQuality[sender] && !isNaN(body) && parseInt(body) <= pendingQuality[sender].links.length;
  },
  react: "📤",
  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const index = parseInt(body) - 1;
    const data = pendingQuality[sender];
    const selected = data.links[index];
    delete pendingQuality[sender];

    try {
      await sock.sendMessage(from, {
        document: { url: selected.link },
        mimetype: "video/mp4",
        fileName: `${data.title} (${selected.quality}).mp4`,
        caption: `🎬 *${data.title}*\n⭐ Quality: ${selected.quality}\n\n*Powered by MALIYA-MD*`
      }, { quoted: mek });
    } catch (e) {
      reply("❌ දෝෂයක් ඇතිවිය. Direct Link:\n" + selected.link);
    }
  }
});

module.exports = { searchMovies, getDirectDownloadLinks };
