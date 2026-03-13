const { cmd } = require("../command");
const { ytmp4 } = require("sadaslk-dlcore");
const yts = require("yt-search");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const VIDEO_LIMIT_MB = 45;
const pendingVideos = new Map();

function makeTempFile(ext = ".mp4") {
  const id = crypto.randomBytes(6).toString("hex");
  return path.join(TEMP_DIR, `${Date.now()}_${id}${ext}`);
}

function safeUnlink(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

function formatViews(num) {
  if (!num) return "Unknown";
  return Number(num).toLocaleString();
}

function generateProgressBar(duration = "0:00") {
  return `*00:00* ──────────◉ *${duration}*`;
}

function getFileSizeMB(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);
  if (isUrl) {
    const id = query.includes("v=")
      ? query.split("v=")[1].split("&")[0]
      : query.split("/").pop().split("?")[0];

    const info = await yts({ videoId: id });
    return info;
  }

  const search = await yts(query);
  if (!search.videos.length) return null;
  return search.videos[0];
}

async function downloadFile(url, outPath) {
  const res = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 180000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outPath);
    res.data.pipe(writer);
    writer.on("finish", () => resolve(outPath));
    writer.on("error", reject);
  });
}

async function reencodeForWhatsApp(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-movflags +faststart",
        "-pix_fmt yuv420p",
        "-profile:v main",
        "-level 3.1",
        "-preset veryfast",
        "-crf 28",
        "-maxrate 1200k",
        "-bufsize 2400k",
        "-vf scale='min(854,iw)':-2",
      ])
      .format("mp4")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

function getQualityFromChoice(choice) {
  switch (choice) {
    case "1":
      return "360";
    case "2":
      return "480";
    case "3":
      return "720";
    case "4":
      return "1080";
    default:
      return null;
  }
}

async function processVideoDownload(bot, mek, m, { from, sender, body, reply }) {
  const pending = pendingVideos.get(sender);
  if (!pending) return;

  const choice = String(body || "").trim();
  const quality = getQualityFromChoice(choice);
  if (!quality) return reply("❌ Reply with 1, 2, 3 or 4 only.");

  let rawFile = null;
  let fixedFile = null;

  try {
    await reply(`⬇️ Downloading ${quality}p video...`);

    const data = await ytmp4(pending.video.url, {
      format: "mp4",
      videoQuality: quality,
    });

    if (!data?.url) return reply("❌ Failed to download video.");

    rawFile = makeTempFile(".mp4");
    fixedFile = makeTempFile(".mp4");

    await downloadFile(data.url, rawFile);

    await reply("🛠 Converting video for phone support...");
    await reencodeForWhatsApp(rawFile, fixedFile);

    const sizeMB = getFileSizeMB(fixedFile);
    const safeTitle = (pending.video.title || "youtube_video").replace(/[\\/:*?"<>|]/g, "");

    if (sizeMB > VIDEO_LIMIT_MB) {
      await bot.sendMessage(
        from,
        {
          document: fs.readFileSync(fixedFile),
          mimetype: "video/mp4",
          fileName: `${safeTitle}_${quality}p.mp4`,
          caption: `🎬 *${pending.video.title}*\n🎞 Quality: ${quality}p\n📦 Size: ${sizeMB.toFixed(2)} MB\n\n*MALIYA-MD ❤️*`,
        },
        { quoted: mek }
      );
    } else {
      await bot.sendMessage(
        from,
        {
          video: fs.readFileSync(fixedFile),
          mimetype: "video/mp4",
          fileName: `${safeTitle}_${quality}p.mp4`,
          caption: `🎬 *${pending.video.title}*\n🎞 Quality: ${quality}p\n📦 Size: ${sizeMB.toFixed(2)} MB\n\n*MALIYA-MD ❤️*`,
          gifPlayback: false,
        },
        { quoted: mek }
      );
    }

    pendingVideos.delete(sender);
  } catch (e) {
    console.log("VIDEO SELECT ERROR:", e);
    reply("❌ Error while downloading/converting selected quality video.");
  } finally {
    safeUnlink(rawFile);
    safeUnlink(fixedFile);
  }
}

cmd(
  {
    pattern: "ytmp4",
    alias: ["ytv", "video"],
    react: "🎥",
    desc: "Download YouTube video with quality selection",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply, sender }) => {
    try {
      if (!q) return reply("🎬 Send video name or YouTube link");

      await reply("🔎 Searching YouTube...");
      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found");

      const caption = `╭━━〔 *YOUTUBE VIDEO DOWNLOAD* 〕━━⬣
┃ 🎬 *Title:* ${video.title}
┃ 👤 *Channel:* ${video.author?.name || "Unknown"}
┃ ⏱ *Duration:* ${video.timestamp || "Unknown"}
┃ 👀 *Views:* ${formatViews(video.views)}
┃ 📅 *Uploaded:* ${video.ago || "Unknown"}
╰━━━━━━━━━━━━━━━━━━⬣

${generateProgressBar(video.timestamp || "0:00")}

*Reply with a number to choose quality:*

*1* ┃ 360p
*2* ┃ 480p
*3* ┃ 720p
*4* ┃ 1080p

> Reply only with 1, 2, 3 or 4`;

      await bot.sendMessage(
        from,
        {
          image: { url: video.thumbnail },
          caption,
        },
        { quoted: mek }
      );

      pendingVideos.set(sender, {
        video,
        from,
        createdAt: Date.now(),
      });
    } catch (e) {
      console.log("VIDEO MENU ERROR:", e);
      reply("❌ Error while preparing video menu.");
    }
  }
);

cmd(
  {
    on: "text",
    react: "🎞️",
    dontAddCommandList: true,
    filename: __filename,
  },
  async (bot, mek, m, { from, body, sender, reply, isCmd }) => {
    try {
      if (isCmd) return;
      if (!/^[1-4]$/.test(String(body || "").trim())) return;
      if (!pendingVideos.has(sender)) return;

      await processVideoDownload(bot, mek, m, {
        from,
        sender,
        body,
        reply,
      });
    } catch (e) {
      console.log("VIDEO REPLY HANDLER ERROR:", e);
    }
  }
);
