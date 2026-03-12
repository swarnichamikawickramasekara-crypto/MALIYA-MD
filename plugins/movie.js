const { cmd, replyHandlers } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");

const pendingSearch = {};
const pendingQuality = {};

// Headers - සැබෑ බ්‍රවුසරයකින් යනවා වගේ පෙන්වීමට
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://cinesubz.lk/'
};

async function getDirectDownloadLinks(movieUrl) {
    try {
        // 1. Movie Page එකට ගොස් ZT-Links සොයන්න
        const moviePage = await axios.get(movieUrl, { headers });
        const $ = cheerio.load(moviePage.data);
        const ztLinks = [];

        $('a[href*="/zt-links/"]').each((i, el) => {
            const url = $(el).attr('href');
            const parentText = $(el).closest('tr, div').text();
            const quality = parentText.includes('1080p') ? '1080p' : parentText.includes('720p') ? '720p' : '480p';
            const size = parentText.match(/\d+(\.\d+)?\s*(GB|MB)/i)?.[0] || 'Unknown';
            ztLinks.push({ url, quality, size });
        });

        if (ztLinks.length === 0) return [];

        let finalLinks = [];
        // මුල් ලින්ක් එක පමණක් වේගය සඳහා පරීක්ෂා කරමු
        const target = ztLinks[0];
        
        // 2. ZT-Links පේජ් එකට රික්වෙස්ට් එකක් යවන්න
        const ztPage = await axios.get(target.url, { headers });
        
        // මෙහිදී බොහොමයක් සයිට් වල ඩිරෙක්ට් ලින්ක් එක HTML එකේ හැංගිලා තියෙනවා (Base64 හෝ JavaScript එකක)
        // Sonic-cloud ලින්ක් එක සොයමු
        const sonicLinkMatch = ztPage.data.match(/https?:\/\/sonic-cloud\.online\/[^\s"']+/);
        
        if (sonicLinkMatch) {
            finalLinks.push({
                link: sonicLinkMatch[0],
                quality: target.quality,
                size: target.size
            });
        }

        return finalLinks;
    } catch (e) {
        console.error("Scraping error:", e.message);
        return [];
    }
}

// --- Commands ---

cmd({
    pattern: "film",
    alias: ["movie", "cinesubz"],
    react: "🎬",
    category: "download",
    filename: __filename
}, async (sock, mek, m, { from, q, sender, reply }) => {
    if (!q) return reply("චිත්‍රපටයක නමක් ලබා දෙන්න.");
    reply("🔎 සෙවුම් කරමින් පවතී...");

    try {
        const searchUrl = `https://cinesubz.lk/?s=${encodeURIComponent(q)}`;
        const searchPage = await axios.get(searchUrl, { headers });
        const $ = cheerio.load(searchPage.data);
        const results = [];

        $('.display-item .item-box').each((i, el) => {
            if (i < 5) {
                results.push({
                    id: i + 1,
                    title: $(el).find('a').attr('title')?.trim() || "No Title",
                    movieUrl: $(el).find('a').attr('href'),
                    thumb: $(el).find('img').attr('src')
                });
            }
        });

        if (results.length === 0) return reply("❌ කිසිවක් හමු වූයේ නැත.");

        pendingSearch[sender] = { results };
        let msg = `🎬 *MALIYA-MD MOVIE SEARCH*\n\n`;
        results.forEach((res, i) => msg += `*${i+1}.* ${res.title}\n`);
        msg += `\n📥 *අංකය Reply කරන්න.*`;

        await sock.sendMessage(from, { image: { url: results[0].thumb }, caption: msg }, { quoted: mek });
    } catch (e) { reply("Error: " + e.message); }
});

// Selection Handler
replyHandlers.push({
    filter: (body, { sender }) => pendingSearch[sender] && !isNaN(body),
    function: async (sock, mek, m, { from, body, sender, reply }) => {
        const selected = pendingSearch[sender].results[parseInt(body) - 1];
        if (!selected) return;
        delete pendingSearch[sender];

        reply(`⏳ *${selected.title}* ලින්ක් ලබාගනිමින් පවතී...`);
        const links = await getDirectDownloadLinks(selected.movieUrl);
        
        if (links.length === 0) return reply("❌ කනගාටුයි, වෙබ් අඩවියේ ආරක්ෂක පද්ධතිය නිසා ලින්ක් ලබාගත නොහැකි විය.");

        pendingQuality[sender] = { title: selected.title, links };
        let qMsg = `🎬 *${selected.title}*\n\n`;
        links.forEach((l, i) => qMsg += `*${i+1}.* ${l.quality} (${l.size})\n`);
        reply(qMsg + `\n📥 *අංකය Reply කරන්න.*`);
    }
});

replyHandlers.push({
    filter: (body, { sender }) => pendingQuality[sender] && !isNaN(body),
    function: async (sock, mek, m, { from, body, sender, reply }) => {
        const data = pendingQuality[sender];
        const selected = data.links[parseInt(body) - 1];
        if (!selected) return;
        delete pendingQuality[sender];

        reply("📤 ගොනුව එවමින් පවතී...");
        try {
            await sock.sendMessage(from, {
                document: { url: selected.link },
                mimetype: "video/mp4",
                fileName: `${data.title}.mp4`,
                caption: `🎬 *${data.title}*\n\n*Enjoy!*`
            }, { quoted: mek });
        } catch (e) { reply("❌ දෝෂයකි: " + selected.link); }
    }
});
