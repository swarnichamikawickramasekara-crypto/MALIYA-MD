const { cmd } = require("../command");
const yts = require("yt-search");
const axios = require("axios");

function generateProgressBar(duration = "0:00") {
    const totalBars = 10;
    const bar = "─".repeat(totalBars);
    return `*00:00* ${bar}○ *${duration}*`;
}

function isYouTubeUrl(text = "") {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(text.trim());
}

async function getDownload(url) {
    const res = await axios.get(`https://api.vevioz.com/api/button/mp4/${encodeURIComponent(url)}`);
    const match = res.data.match(/href="([^"]+)"[^>]*>Download MP4/);
    if (!match) return null;
    return match[1];
}

cmd(
{
pattern: "video",
alias: ["ytmp4","vdl"],
react: "🎥",
category: "download",
filename: __filename
},
async (bot, mek, m, { from, q, reply }) => {

try {

if (!q) return reply("🎥 Please provide a YouTube link or video name.");

await reply("🔍 Searching Video...");

let video;
let videoUrl;

if (isYouTubeUrl(q)) {

videoUrl = q.trim();

const search = await yts(videoUrl);
video = search.videos[0];

} else {

const search = await yts(q);

if (!search.videos.length) return reply("❌ No results found.");

video = search.videos[0];
videoUrl = video.url;

}

const title = video.title || "Unknown Title";
const duration = video.timestamp || "0:00";
const views = video.views ? video.views.toLocaleString() : "Unknown";
const channel = video.author?.name || "Unknown";
const uploaded = video.ago || "Unknown";
const thumbnail = video.thumbnail;

const progressBar = generateProgressBar(duration);

await bot.sendMessage(from,{
image:{url:thumbnail},
caption:`🎥 *${title}*

👤 *Channel:* ${channel}
⏱ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}

${progressBar}

🍀 *MALIYA-MD VIDEO DOWNLOADER* 🍀
> QUALITY: AUTO 🎬`
},{quoted:mek});

await reply("⬇️ Downloading video...");

const dl = await getDownload(videoUrl);

if (!dl) return reply("❌ Failed to fetch download link.");

await bot.sendMessage(from,{
video:{url:dl},
mimetype:"video/mp4",
caption:`✅ *${title}*\n\n*MALIYA-MD ❤️*`
},{quoted:mek});

} catch(e){

console.log(e);
reply("❌ Error while downloading video: " + e.message);

}

});
