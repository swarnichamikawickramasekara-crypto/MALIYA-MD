const { cmd, replyHandlers } = require("../command");
const puppeteer = require("puppeteer");

const pendingSearch = {};
const pendingQuality = {};

async function getDirectDownloadLinks(movieUrl) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] 
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Step 1: Movie Page
    await page.goto(movieUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const linkItems = await page.$$eval('a[href*="/zt-links/"]', links => 
      links.map(link => {
        const text = link.closest('tr, .download-item, div')?.innerText || "";
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
        // Step 2: ZT-Links Page
        await page.goto(item.url, { waitUntil: "domcontentloaded" });
        
        // Timer එක ඉවර වන තෙක් තත්පර 8ක් පමණ රැඳී සිටීම (පින්තූර 3 අනුව)
        await new Promise(r => setTimeout(r, 8000)); 

        const finalPageUrl = await page.evaluate(() => {
          const btn = document.querySelector('a.btn-danger, .download-btn, #download-btn');
          return btn ? btn.href : null;
        });
        
        if (finalPageUrl) {
          // Step 3: Final Sonic-Cloud Page
          await page.goto(finalPageUrl, { waitUntil: "networkidle2" });
          
          // Direct Download ලින්ක් එක සෙවීම
          const directFileLink = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a[href*="sonic-cloud"]'));
            return anchors.length > 0 ? anchors[0].href : null;
          });

          if (directFileLink) {
            finalLinks.push({ link: directFileLink, quality: item.quality, size: item.size });
          }
        }
      } catch (e) { console.log("Link error:", e.message); }
    }
    return finalLinks;
  } finally {
    await browser.close();
  }
}

// --- Commands (Search) ---
cmd({
  pattern: "film",
  category: "download",
  react: "🎬",
  desc: "Cinesubz movie downloader",
  filename: __filename
}, async (sock, mek, m, { from, q, sender, reply }) => {
  if (!q) return reply("චිත්‍රපටයේ නම ලබා දෙන්න.");
  
  reply("🔎 සෙවුම් කරමින් පවතී...");
  
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(`https://cinesubz.lk/?s=${encodeURIComponent(q)}`);
  const results = await page.$$eval(".display-item .item-box", boxes =>
    boxes.slice(0, 8).map((box, index) => ({
      id: index + 1,
      title: box.querySelector("a")?.title?.trim() || "No Title",
      movieUrl: box.querySelector("a")?.href || "",
      thumb: box.querySelector("img")?.src || "",
    }))
  );
  await browser.close();

  if (results.length === 0) return reply("❌ සොයාගත නොහැකි විය.");

  pendingSearch[sender] = { results, timestamp: Date.now() };
  let msg = `🎬 *CINESUBZ SEARCH*\n\n`;
  results.forEach((res, i) => msg += `*${i + 1}.* ${res.title}\n`);
  msg += `\n📥 අංකය ලබා දෙන්න.`;

  await sock.sendMessage(from, { image: { url: results[0].thumb }, caption: msg }, { quoted: mek });
});

// --- Selection Handlers ---
replyHandlers.push({
  filter: (body, { sender }) => pendingSearch[sender] && !isNaN(body),
  react: "⏳",
  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const selected = pendingSearch[sender].results[parseInt(body) - 1];
    if (!selected) return;
    delete pendingSearch[sender];

    reply(`⏳ *${selected.title}* ලින්ක් ලබාගනිමින් පවතී... (මෙයට තත්පර 30-40ක් ගතවිය හැක)`);
    const links = await getDirectDownloadLinks(selected.movieUrl);
    
    if (links.length === 0) return reply("❌ දත්ත ලබාගැනීමට නොහැකි විය. වෙබ් අඩවියේ ආරක්ෂක පියවරක් නිසා විය හැක.");

    pendingQuality[sender] = { title: selected.title, links, timestamp: Date.now() };
    let qMsg = `🎬 *${selected.title}*\n\n`;
    links.forEach((l, i) => qMsg += `*${i + 1}.* ${l.quality} (${l.size})\n`);
    reply(qMsg + `\n📥 Quality අංකය ලබා දෙන්න.`);
  }
});

replyHandlers.push({
  filter: (body, { sender }) => pendingQuality[sender] && !isNaN(body),
  react: "📤",
  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const data = pendingQuality[sender];
    const selected = data.links[parseInt(body) - 1];
    if (!selected) return;
    delete pendingQuality[sender];

    try {
      await sock.sendMessage(from, {
        document: { url: selected.link },
        mimetype: "video/mp4",
        fileName: `${data.title}.mp4`,
        caption: `🎬 *${data.title}*\n✅ Done.`
      }, { quoted: mek });
    } catch (e) { reply("❌ දෝෂයකි: " + selected.link); }
  }
});
