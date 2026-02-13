const { cmd } = require("../command");
const { ytmp3 } = require("sadaslk-dlcore");
const yts = require("yt-search");
const fs = require("fs");
const axios = require("axios");
const path = require("path");

/* ================= CONFIG STORAGE ================= */

const STORE_PATH = path.join(__dirname, "csong_target.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeStore(obj) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2));
}

function isGroupJid(jid = "") {
  return typeof jid === "string" && jid.endsWith("@g.us");
}

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
    const r = await yts({ videoId: id });
    return r?.title ? r : null;
  }

  const search = await yts(query);
  return search.videos?.[0];
}

function generateProgressBar(duration) {
  const totalBars = 10;
  const bar = "─".repeat(totalBars);
  return `*00:00* ${bar}○ *${duration}*`;
}

/* ================= SET TARGET GROUP ================= */

cmd(
  {
    pattern: "ctarget",
    alias: ["setcgroup"],
    react: "🎯",
    category: "config",
    filename: __filename,
  },
  async (bot, mek, m, { from, reply }) => {
    try {
      if (!isGroupJid(from)) {
        return reply("This command must be used inside a group.");
      }

      const store = readStore();
      store.target_group = from;
      store.updated_at = new Date().toISOString();
      writeStore(store);

      let gname = "Target Group";
      try {
        const meta = await bot.groupMetadata(from);
        if (meta?.subject) gname = meta.subject;
      } catch {}

      return reply(
        `Target group saved successfully!\n\nGroup: ${gname}\nID: ${from}\n\nNow use .csong <name/link> to send songs here.`
      );
    } catch (e) {
      console.log(e);
      reply("Error saving target group.");
    }
  }
);

/* ================= CSONG COMMAND ================= */

cmd(
  {
    pattern: "csong",
    alias: ["cmusic", "cmp3"],
    react: "🎵",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      const store = readStore();
      const target = store.target_group;

      if (!target || !isGroupJid(target)) {
        return reply("No target group set. Use .ctarget inside a group first.");
      }

      if (!q) return reply("Please provide a song name or YouTube link.");

      await reply("Processing request...");

      const video = await getYoutube(q);
      if (!video) return reply("No results found.");

      const duration = video.timestamp || "0:00";
      const progressBar = generateProgressBar(duration);

      /* ===== THUMBNAIL + INFO ===== */
      await bot.sendMessage(
        target,
        {
          image: { url: video.thumbnail },
          caption: `
🎵 *${video.title}*

👤 Channel: ${video.author?.name || "Unknown"}
⏱ Duration: ${duration}
👀 Views: ${Number(video.views || 0).toLocaleString()}
📅 Uploaded: ${video.ago || "Unknown"}

${progressBar}

🍀 ENJOY YOUR SONG 🍀
> USE HEADPHONES FOR THE BEST EXPERIENCE 🎧🎧🎧🎧🎧🎧🎧
          `.trim(),
        },
        { quoted: mek }
      );

      /* ===== DOWNLOAD MP3 ===== */
      const data = await ytmp3(video.url);
      if (!data?.url) return reply("Download failed.");

      const filePath = path.join(__dirname, `${Date.now()}.mp3`);
      await downloadFile(data.url, filePath);

      await bot.sendMessage(
        target,
        {
          audio: fs.readFileSync(filePath),
          mimetype: "audio/mpeg",
          fileName: `${video.title}.mp3`,
        },
        { quoted: mek }
      );

      fs.unlinkSync(filePath);

      await reply("Song sent to target group successfully.");
    } catch (e) {
      console.log(e);
      reply("Error while downloading song.");
    }
  }
);
