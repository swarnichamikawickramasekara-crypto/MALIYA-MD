const { cmd } = require("../command");
const { ytmp3 } = require("sadaslk-dlcore");
const yts = require("yt-search");
const fs = require("fs");
const axios = require("axios");
const path = require("path");

/* ================= STORAGE ================= */

const STORE_PATH = path.join(__dirname, "csong_targets.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { groups: [] };
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8") || '{"groups":[]}');
  } catch {
    return { groups: [] };
  }
}

function writeStore(obj) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2));
}

function isGroupJid(jid = "") {
  return typeof jid === "string" && jid.endsWith("@g.us");
}

/* ================= HELPERS ================= */

function getBodyFromMek(mek) {
  const msg = mek?.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    ""
  );
}

function getSenderJid(sock, mek) {
  return mek.key?.fromMe ? sock.user?.id : (mek.key?.participant || mek.key?.remoteJid);
}

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

async function getGroupName(bot, jid) {
  try {
    const meta = await bot.groupMetadata(jid);
    return meta?.subject || jid;
  } catch {
    return jid;
  }
}

function makeBeautifulCaption(video, extraLine = "") {
  const title = video?.title || "Unknown Title";
  const channel = video?.author?.name || "Unknown";
  const duration = video?.timestamp || "0:00";
  const views = Number(video?.views || 0).toLocaleString();
  const uploaded = video?.ago || "Unknown";
  const progressBar = generateProgressBar(duration);

  return `
🎵 *${title}*

👤 *Channel:* ${channel}
⏱ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}

${progressBar}

🍀 *ENJOY YOUR SONG* 🍀
> USE HEADPHONES FOR THE BEST EXPERIENCE 🎧🎧🎧🎧🎧🎧🎧
${extraLine ? `\n\n${extraLine}` : ""}
  `.trim();
}

async function sendSongToGroup(bot, quoted, target, video) {
  await bot.sendMessage(
    target,
    {
      image: { url: video.thumbnail },
      caption: makeBeautifulCaption(video),
    },
    { quoted }
  );

  const data = await ytmp3(video.url);
  if (!data?.url) throw new Error("MP3 download failed (missing url).");

  const filePath = path.join(__dirname, `${Date.now()}.mp3`);
  await downloadFile(data.url, filePath);

  await bot.sendMessage(
    target,
    {
      audio: fs.readFileSync(filePath),
      mimetype: "audio/mpeg",
      fileName: `${video.title}.mp3`,
    },
    { quoted }
  );

  fs.unlinkSync(filePath);
}

/* ================= PENDING ================= */

const pending = {}; // pending[senderJid] = { video, groups, from, createdAt }
const TTL = 2 * 60 * 1000;

/* ================= COMMANDS: GROUP TARGET MGMT ================= */

// Add current group
cmd(
  { pattern: "ctarget", react: "🎯", category: "config", filename: __filename },
  async (bot, mek, m, { from, reply }) => {
    try {
      if (!isGroupJid(from)) return reply("Use this command inside a group.");

      const store = readStore();
      if (!store.groups.includes(from)) {
        store.groups.push(from);
        writeStore(store);
      }

      const name = await getGroupName(bot, from);
      return reply(`Saved target group: *${name}*`);
    } catch (e) {
      console.log(e);
      return reply("Error saving target group.");
    }
  }
);

// List groups
cmd(
  { pattern: "ctargetlist", react: "📋", category: "config", filename: __filename },
  async (bot, mek, m, { reply }) => {
    try {
      const store = readStore();
      if (!store.groups.length) return reply("No target groups saved.");

      const names = await Promise.all(store.groups.map((g) => getGroupName(bot, g)));
      const lines = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
      return reply(`Saved target groups:\n\n${lines}\n\nRemove: .ctargetdel <number>\nClear: .ctargetclear`);
    } catch (e) {
      console.log(e);
      return reply("Error listing target groups.");
    }
  }
);

// Delete group by number
cmd(
  { pattern: "ctargetdel", alias: ["ctargetremove"], react: "🗑️", category: "config", filename: __filename },
  async (bot, mek, m, { q, reply }) => {
    try {
      const store = readStore();
      if (!store.groups.length) return reply("No target groups saved.");

      const num = parseInt((q || "").trim(), 10);
      if (!num || num < 1 || num > store.groups.length) {
        return reply(`Usage: .ctargetdel <number>\nExample: .ctargetdel 2`);
      }

      const removed = store.groups.splice(num - 1, 1)[0];
      writeStore(store);

      const name = await getGroupName(bot, removed);
      return reply(`Removed target group: *${name}*`);
    } catch (e) {
      console.log(e);
      return reply("Error removing target group.");
    }
  }
);

// Clear all groups
cmd(
  { pattern: "ctargetclear", react: "🧹", category: "config", filename: __filename },
  async (bot, mek, m, { reply }) => {
    try {
      writeStore({ groups: [] });
      return reply("All target groups cleared.");
    } catch (e) {
      console.log(e);
      return reply("Error clearing target groups.");
    }
  }
);

/* ================= CSONG ================= */

cmd(
  { pattern: "csong", react: "🎵", category: "download", filename: __filename },
  async (bot, mek, m, { from, q, reply, sender }) => {
    try {
      const store = readStore();
      const groups = store.groups || [];
      if (!groups.length) return reply("No target groups saved. Use .ctarget inside a group first.");
      if (!q) return reply("Please provide a song name or YouTube link.");

      const video = await getYoutube(q);
      if (!video) return reply("No results found.");

      // Preview to command chat
      await bot.sendMessage(
        from,
        {
          image: { url: video.thumbnail },
          caption: makeBeautifulCaption(video, "Reply with a group number to send. Reply *0* to cancel."),
        },
        { quoted: mek }
      );

      if (groups.length === 1) {
        await sendSongToGroup(bot, mek, groups[0], video);
        return reply("Sent to the saved target group.");
      }

      const names = await Promise.all(groups.map((g) => getGroupName(bot, g)));
      const list = names.map((n, i) => `${i + 1}. ${n}`).join("\n");

      pending[sender] = { video, groups, from, createdAt: Date.now() };

      return reply(`Select a target group number (1-${groups.length}) or reply 0 to cancel:\n\n${list}`);
    } catch (e) {
      console.log(e);
      return reply("Error while processing the song.");
    }
  }
);

/* ================= NUMBER REPLY (NO PREFIX) ================= */

global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push({
  onMessage: async (bot, mek) => {
    try {
      const from = mek.key?.remoteJid;
      if (!from || from === "status@broadcast") return;

      const body = (getBodyFromMek(mek) || "").trim();
      if (!/^\d+$/.test(body)) return;

      const senderJid = getSenderJid(bot, mek);
      if (!senderJid) return;

      const p = pending[senderJid];
      if (!p) return;
      if (p.from !== from) return;

      if (Date.now() - p.createdAt > TTL) {
        delete pending[senderJid];
        await bot.sendMessage(from, { text: "Selection expired. Please run .csong again." }, { quoted: mek });
        return;
      }

      const num = parseInt(body, 10);

      if (num === 0) {
        delete pending[senderJid];
        await bot.sendMessage(from, { text: "Cancelled." }, { quoted: mek });
        return;
      }

      if (num < 1 || num > p.groups.length) {
        await bot.sendMessage(from, { text: `Invalid number. Reply 1-${p.groups.length}, or 0 to cancel.` }, { quoted: mek });
        return;
      }

      const target = p.groups[num - 1];
      delete pending[senderJid];

      await bot.sendMessage(from, { text: "Sending..." }, { quoted: mek });
      await sendSongToGroup(bot, mek, target, p.video);
      await bot.sendMessage(from, { text: "Sent successfully." }, { quoted: mek });
    } catch (e) {
      console.log("csong number hook error:", e?.message || e);
    }
  },
});
