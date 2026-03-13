const { cmd, replyHandlers } = require("../command");
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
const pendingVideoQuality = {};

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

function sanitizeFileName(name = "youtube_video") {
  return String(name).replace(/[\\/:*?"<>|]/g, "").trim() || "youtube_video";
}

function getQualityFromChoice(choice) {
  switch (String(choice).trim()) {
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

function getQualityLabel(choice) {
  switch (String(choice).trim()) {
    case "1":
      return "360p";
    case "2":
      return "480p";
    case "3":
      return "720p HD";
    case "4":
      return "1080p FHD";
    default:
      return "Unknown";
  }
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
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    maxRedirects: 5,
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

cmd(
  {
    pattern: "ytmp4",
    alias: ["ytv", "video"],
    react: "🎥",
    desc: "Download YouTube video with quality selection",
    category: "download",
    filename: __filename,
  },
  async (sock, mek, m, { from, q, sender, reply }) => {
    try {
      if (!q) return reply("🎬 Please send a YouTube video name or link.");

      await reply("🔎 Searching YouTube...");

      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found.");

      const title = video.title || "Unknown Title";
      const channel = video.author?.name || "Unknown Channel";
      const duration = video.timestamp || "Unknown";
      const views = formatViews(video.views);
      const uploaded = video.ago || "Unknown";
      const videoUrl = video.url || "Unknown";
      const thumbnail = video.thumbnail;

      const detailsCaption = `╭━━━〔 *MALIYA-MD YOUTUBE DOWNLOADER* 〕━━━⬣
┃ 🎬 *Title* : ${title}
┃ 👤 *Channel* : ${channel}
┃ ⏱ *Duration* : ${duration}
┃ 👀 *Views* : ${views}
┃ 📅 *Uploaded* : ${uploaded}
┃ 🔗 *Link* : ${videoUrl}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━⬣

${generateProgressBar(duration)}

> *Fast • Stable • Phone Supported Video Download*`;

      await sock.sendMessage(
        from,
        {
          image: { url: thumbnail },
          caption: detailsCaption,
        },
        { quoted: mek }
      );

      await sock.sendMessage(
        from,
        {
          text: `╭━━━〔 *SELECT VIDEO QUALITY* 〕━━━⬣
┃ *1* ┃ 360p
┃ *2* ┃ 480p
┃ *3* ┃ 720p HD
┃ *4* ┃ 1080p FHD
┃ > MALIYA-MD 🎥🎥
╰━━━━━━━━━━━━━━━━━━━━━━⬣

📥 *Reply with a number only*
> Example : 1 or 2 or 3 or 4`,
        },
        { quoted: mek }
      );

      pendingVideoQuality[sender] = {
        video,
        from,
        createdAt: Date.now(),
      };
    } catch (e) {
      console.log("VIDEO MENU ERROR:", e);
      reply("❌ Error while preparing video menu.");
    }
  }
);

replyHandlers.push({
  filter: (body, { sender }) =>
    pendingVideoQuality[sender] &&
    /^[1-4]$/.test(String(body || "").trim()),

  function: async (sock, mek, m, { from, body, sender, reply }) => {
    const pending = pendingVideoQuality[sender];
    if (!pending) return;

    const quality = getQualityFromChoice(body);
    const qualityLabel = getQualityLabel(body);

    if (!quality) return reply("❌ Please reply with 1, 2, 3 or 4 only.");

    let rawFile = null;
    let fixedFile = null;

    try {
      await reply(`⬇️ Downloading *${qualityLabel}* video...`);

      const data = await ytmp4(pending.video.url, {
        format: "mp4",
        videoQuality: quality,
      });

      if (!data?.url) {
        delete pendingVideoQuality[sender];
        return reply("❌ Failed to download selected quality video.");
      }

      rawFile = makeTempFile(".mp4");
      fixedFile = makeTempFile(".mp4");

      await downloadFile(data.url, rawFile);

      await reply("🛠 Converting video for phone support...");

      await reencodeForWhatsApp(rawFile, fixedFile);

      const sizeMB = getFileSizeMB(fixedFile);
      const cleanTitle = sanitizeFileName(pending.video.title);

      if (sizeMB > VIDEO_LIMIT_MB) {
        await sock.sendMessage(
          from,
          {
            document: fs.readFileSync(fixedFile),
            mimetype: "video/mp4",
            fileName: `${cleanTitle}_${quality}p.mp4`,
            caption: `╭━━━〔 *VIDEO READY* 〕━━━⬣
┃ 🎬 *Title* : ${pending.video.title}
┃ 🎞 *Quality* : ${qualityLabel}
┃ 📦 *Size* : ${sizeMB.toFixed(2)} MB
┃ 📄 *Mode* : Document
┃ 🍀ENJOY YOUR VIDEO🍀
╰━━━━━━━━━━━━━━━━━━━━━━⬣

> File size is high, so it was sent as a document.
*MALIYA-MD ❤️*`,
          },
          { quoted: mek }
        );
      } else {
        await sock.sendMessage(
          from,
          {
            video: fs.readFileSync(fixedFile),
            mimetype: "video/mp4",
            fileName: `${cleanTitle}_${quality}p.mp4`,
            caption: `╭━━━〔 *VIDEO READY* 〕━━━⬣
┃ 🎬 *Title* : ${pending.video.title}
┃ 🎞 *Quality* : ${qualityLabel}
┃ 📦 *Size* : ${sizeMB.toFixed(2)} MB
┃ 📱 *Mode* : Playable Video
┃ 🍀ENJOY YOUR VIDEO🍀
╰━━━━━━━━━━━━━━━━━━━━━━⬣

*MALIYA-MD ❤️*`,
            gifPlayback: false,
          },
          { quoted: mek }
        );
      }

      delete pendingVideoQuality[sender];
    } catch (e) {
      console.log("VIDEO QUALITY ERROR:", e);
      reply("❌ Error while downloading/converting selected quality video.");
      delete pendingVideoQuality[sender];
    } finally {
      safeUnlink(rawFile);
      safeUnlink(fixedFile);
    }
  },
});
