const { cmd } = require("../command");
const { ytmp3, ytmp4, tiktok } = require("sadaslk-dlcore");
const yts = require("yt-search");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

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
    timeout: 120000,
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
        "-vf scale='min(854,iw)':-2"
      ])
      .format("mp4")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

function safeUnlink(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

cmd(
  {
    pattern: "ytmp4",
    alias: ["ytv", "video"],
    react: "🎥",
    desc: "Download YouTube MP4 by name or link",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    let rawFile = null;
    let fixedFile = null;

    try {
      if (!q) return reply("🎬 Send video name or YouTube link");

      await reply("🔎 Searching YouTube...");
      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found");

      const caption =
        `🎬 *${video.title}*\n\n` +
        `👤 Channel: ${video.author?.name || "Unknown"}\n` +
        `⏱ Duration: ${video.timestamp || "Unknown"}\n` +
        `👀 Views: ${video.views ? video.views.toLocaleString() : "Unknown"}\n` +
        `📅 Uploaded: ${video.ago || "Unknown"}\n` +
        `🔗 ${video.url}`;

      await bot.sendMessage(
        from,
        {
          image: { url: video.thumbnail },
          caption,
        },
        { quoted: mek }
      );

      await reply("⬇️ Downloading video...");

      const data = await ytmp4(video.url, {
        format: "mp4",
        videoQuality: "360",
      });

      if (!data?.url) return reply("❌ Failed to download video");

      const stamp = Date.now();
      rawFile = path.join(TEMP_DIR, `yt_raw_${stamp}.mp4`);
      fixedFile = path.join(TEMP_DIR, `yt_fixed_${stamp}.mp4`);

      await reply("🛠 Converting video for phone support...");

      await downloadFile(data.url, rawFile);
      await reencodeForWhatsApp(rawFile, fixedFile);

      await bot.sendMessage(
        from,
        {
          video: fs.readFileSync(fixedFile),
          mimetype: "video/mp4",
          fileName: (data.filename || "youtube_video").replace(/\.[^/.]+$/, "") + "_fixed.mp4",
          caption: `🎬 *${video.title}*\n\n*MALIYA-MD ❤️*`,
          gifPlayback: false,
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("YTMP4 ERROR:", e);
      reply("❌ Error while downloading/converting video");
    } finally {
      safeUnlink(rawFile);
      safeUnlink(fixedFile);
    }
  }
);
