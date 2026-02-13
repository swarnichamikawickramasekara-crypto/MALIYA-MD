const { cmd } = require("../command");
const { ytmp3, tiktok, ytmp4 } = require("sadaslk-dlcore");
const yts = require("yt-search");
const fs = require("fs");
const axios = require("axios");
const path = require("path");

/* ================= HELPERS ================= */

async function downloadFile(url, filePath) {
  const writer = fs.createWriteStream(filePath);
  const res = await axios({ url, method: "GET", responseType: "stream" });
  res.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);

  if (isUrl) {
    const id = query.includes("v=")
      ? query.split("v=")[1].split("&")[0]
      : query.split("/").pop();
    return await yts({ videoId: id });
  }

  const search = await yts(query);
  return search.videos[0];
}

// auto progress bar
function generateProgressBar(duration) {
  const totalBars = 10;
  const bar = "─".repeat(totalBars);
  return `*00:00* ${bar}○ *${duration}*`;
}

/* ================= SONG ================= */

/* ================= YOUTUBE VIDEO (MP4) ================= */

cmd(
  {
    pattern: "ytmp4",
    alias: ["ytv", "video", "mp4"],
    react: "🎬",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("🎬 Please send a YouTube video name or link.");

      reply("🔍 Searching YouTube video...");
      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found.");

      const duration = video.timestamp || "0:00";
      const progressBar = generateProgressBar(duration);

      // ===== Thumbnail + FULL original caption =====
      await bot.sendMessage(
        from,
        {
          image: { url: video.thumbnail },
          caption: `
🎬 *${video.title}*

👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${duration}
👀 *Views:* ${video.views.toLocaleString()}
📅 *Uploaded:* ${video.ago || "N/A"}

${progressBar}

🍀 *DOWNLOADING VIDEO...* 🍀
> PLEASE WAIT A MOMENT 🎬🎬🎬🎬🎬🎬🎬
          `,
        },
        { quoted: mek }
      );

      // ===== Download video =====
      reply("⬇️ Downloading video (360p)...");
      
      const data = await ytmp4(video.url, {
        format: "mp4",
        videoQuality: "360",
      });

      if (!data?.url) return reply("❌ Failed to download video.");

      const filePath = path.join(__dirname, `${Date.now()}.mp4`);
      await downloadFile(data.url, filePath);

      await bot.sendMessage(
        from,
        {
          video: fs.readFileSync(filePath),
          mimetype: "video/mp4",
          caption: `
✅ *VIDEO DOWNLOADED SUCCESSFULLY!*

🎬 *${video.title}*
⏱ *Duration:* ${duration}
🔗 *Link:* ${video.url}

> MALIYA-MD ❤️
          `,
          gifPlayback: false,
        },
        { quoted: mek }
      );

      fs.unlinkSync(filePath);
      
    } catch (e) {
      console.log("YTMP4 ERROR:", e);
      reply("❌ Error while downloading video: " + e.message);
    }
  }
);

/* ================= YOUTUBE VIDEO HD ================= */

cmd(
  {
    pattern: "ytmp4hd",
    alias: ["ytvhd", "videohd", "hdvideo"],
    react: "🎬",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("🎬 Please send a YouTube video name or link for HD quality.");

      reply("🔍 Searching YouTube video...");
      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found.");

      // ===== Thumbnail + caption =====
      await bot.sendMessage(
        from,
        {
          image: { url: video.thumbnail },
          caption: `
🎬 *${video.title}*

👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${video.timestamp}
🔗 *Link:* ${video.url}

⬇️ *DOWNLOADING HD VIDEO (720p)...*
          `,
        },
        { quoted: mek }
      );

      // ===== Download HD video =====
      const data = await ytmp4(video.url, {
        format: "mp4",
        videoQuality: "720",
      });

      if (!data?.url) {
        return reply("❌ Failed to download HD video. Try .ytmp4 instead.");
      }

      const filePath = path.join(__dirname, `${Date.now()}_HD.mp4`);
      await downloadFile(data.url, filePath);

      await bot.sendMessage(
        from,
        {
          video: fs.readFileSync(filePath),
          mimetype: "video/mp4",
          caption: `
✅ *HD VIDEO DOWNLOADED!*

🎬 *${video.title}*
⏱ *Duration:* ${video.timestamp}
💎 *Quality:* 720p HD

> MALIYA-MD ❤️
          `,
          gifPlayback: false,
        },
        { quoted: mek }
      );

      fs.unlinkSync(filePath);
      
    } catch (e) {
      console.log("YTMP4 HD ERROR:", e);
      reply("❌ Error while downloading HD video.");
    }
  }
);


cmd(
  {
    pattern: "song",
    alias: ["mp3", "music", "sound"],
    react: "🎵",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("🎧 Please send a song name or YouTube link.");

      reply("🔍 Searching YouTube...");
      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found.");

      const duration = video.timestamp || "0:00";
      const progressBar = generateProgressBar(duration);

      // ===== Thumbnail + FULL original caption =====
      await bot.sendMessage(
        from,
        {
          image: { url: video.thumbnail },
          caption: `
🎵 *${video.title}*

👤 *Channel:* ${video.author.name}
⏱ *Duration:* ${duration}
👀 *Views:* ${video.views.toLocaleString()}
📅 *Uploaded:* ${video.ago}

${progressBar}

🍀 *ENJOY YOUR SONG* 🍀
> USE HEADPHONES FOR THE BEST EXPERIENCE 🎧🎧🎧🎧🎧🎧🎧
          `,
        },
        { quoted: mek }
      );

      // ===== Download audio =====
      const data = await ytmp3(video.url);
      const filePath = path.join(__dirname, `${Date.now()}.mp3`);

      await downloadFile(data.url, filePath);

      await bot.sendMessage(
        from,
        {
          audio: fs.readFileSync(filePath),
          mimetype: "audio/mpeg",
        },
        { quoted: mek }
      );

      fs.unlinkSync(filePath);
    } catch (e) {
      console.log(e);
      reply("❌ Error while downloading song.");
    }
  }
);

/* ================= TIKTOK ================= */

cmd(
  {
    pattern: "tiktok",
    alias: ["ttdl", "tt", "tiktokdl"],
    react: "🎥",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("Please send a TikTok link.");

      reply("Downloading TikTok video...");
      const data = await tiktok(q);

      if (!data?.no_watermark)
        return reply("Failed to download TikTok video.");

      await bot.sendMessage(
        from,
        {
          video: { url: data.no_watermark },
          caption: "TikTok video downloaded successfully.\nMALIYA-MD ❤️",
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log(e);
      reply("Error while downloading TikTok video.");
    }
  }
);
