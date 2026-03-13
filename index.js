// index.js (FULL CODE) ✅ Status Auto Seen + React FIXED (Baileys latest) + Cmd Auto-Fix (CONFIRM PLUGIN)
// ------------------------------------------------------------

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const P = require("pino");
const express = require("express");
const path = require("path");

const config = require("./config");
const { sms } = require("./lib/msg");
const { File } = require("megajs");
const { commands, replyHandlers } = require("./command");

// ✅ auto msg plugin
const autoMsgPlugin = require("./plugins/auto_msg.js");

// ✅ Cmd AutoFix Confirm plugin
let cmdFixPlugin = null;
try {
  cmdFixPlugin = require("./plugins/cmd_autofix_confirm.js");
} catch (e) {
  console.log("⚠️ cmd_autofix_confirm.js not found or failed to load:", e?.message || e);
}

const app = express();
const port = process.env.PORT || 8000;

const prefix = ".";
const ownerNumber = ["94701369636"];
const authDir = path.join(__dirname, "/auth_info_baileys/");
const credsPath = path.join(authDir, "creds.json");

/* ================= SESSION CHECK ================= */

async function ensureSessionFile() {
  try {
    if (!fs.existsSync(credsPath)) {
      if (!config.SESSION_ID) {
        console.error("❌ SESSION_ID missing");
        process.exit(1);
      }

      console.log("🔄 Downloading session from MEGA...");
      const filer = File.fromURL(`https://mega.nz/file/${config.SESSION_ID}`);

      filer.download((err, data) => {
        if (err) {
          console.error("❌ Session download failed:", err);
          process.exit(1);
        }

        fs.mkdirSync(authDir, { recursive: true });
        fs.writeFileSync(credsPath, data);

        console.log("✅ Session restored. Restarting...");
        setTimeout(connectToWA, 2000);
      });

    } else {
      setTimeout(connectToWA, 1000);
    }

  } catch (e) {
    console.error("❌ ensureSessionFile error:", e);
    process.exit(1);
  }
}

/* ================= PLUGINS ================= */

const antiDeletePlugin = require("./plugins/antidelete.js");

global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push(antiDeletePlugin);

/* ================= CONNECT ================= */

async function connectToWA() {

  console.log("Connecting MALIYA-MD 🧬...");

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.macOS("Firefox"),
    auth: state,
    version,
    syncFullHistory: true,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on("connection.update", async (update) => {

    const { connection, lastDisconnect } = update;

    if (connection === "close") {

      const code = lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {

        console.log("🔁 Reconnecting...");
        connectToWA();

      } else {

        console.log("❌ Logged out. Delete auth_info_baileys and re-pair.");

      }
    }

    if (connection === "open") {

      console.log("✅ MALIYA-MD connected");

      /* ===== CONNECT MESSAGE ===== */

      const OWNER_NAME = "Malindu Nadith";
      const BOT_VERSION = "v4.0.0";

      const now = new Date();

      const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now);

      const date = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);

      const up = `
🌈━━━━━━━━━━━━━🌈
🔥🤖 *MALIYA-MD* 🤖🔥
🌈━━━━━━━━━━━━━🌈

✅✨ Connection : CONNECTED & ONLINE
⚡🧬 System     : STABLE | FAST | SECURE
🛡️🔐 Mode      : PUBLIC
🎯🧩 Prefix    : ${prefix}

🧑‍💻👑 Owner    : ${OWNER_NAME}
🚀📦 Version  : ${BOT_VERSION}

🕒⏳ Time      : ${time}
📅🗓️ Date      : ${date}

💬📖 Type .menu to start
🔥🚀 Powered by MALIYA-MD Engine
🌈━━━━━━━━━━━🌈
`.trim();

      try {

        await sock.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
          image: {
            url: "https://github.com/Maliya-bro/MALIYA-MD/blob/main/images/Screenshot%202026-01-18%20122855.png?raw=true",
          },
          caption: up,
        });

      } catch (e) {

        console.log("⚠️ Connect msg send failed:", e?.message || e);

      }

      /* ================= LOAD PLUGINS ================= */

      try {

        fs.readdirSync("./plugins/").forEach((plugin) => {

          if (plugin === "auto_msg.js") return; // prevent duplicate load

          if (plugin.endsWith(".js")) {
            require(`./plugins/${plugin}`);
          }

        });

      } catch (e) {

        console.log("⚠️ Plugin load error:", e?.message || e);

      }

    }

  });

  sock.ev.on("creds.update", saveCreds);

  /* ================= MESSAGE HANDLER ================= */

  sock.ev.on("messages.upsert", async ({ messages }) => {

    if (!messages || !messages.length) return;

    for (const mek of messages) {

      if (!mek?.message) continue;

      mek.message =
        getContentType(mek.message) === "ephemeralMessage"
          ? mek.message.ephemeralMessage.message
          : mek.message;

      /* ===== pluginHooks ===== */

      if (global.pluginHooks) {

        for (const plugin of global.pluginHooks) {

          if (plugin.onMessage) {

            try {

              await plugin.onMessage(sock, mek);

            } catch {}

          }
        }
      }

      const m = sms(sock, mek);
      const type = getContentType(mek.message);

      let body =
        type === "conversation"
          ? mek.message.conversation
          : mek.message[type]?.text || mek.message[type]?.caption || "";

      body = String(body || "");

      let isCmd = body.startsWith(prefix);
      let commandName = isCmd
        ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase()
        : "";

      let args = body.trim().split(/ +/).slice(1);
      let q = args.join(" ");

      const from = mek.key.remoteJid;

      const sender = mek.key.fromMe
        ? sock.user.id
        : mek.key.participant || mek.key.remoteJid;

      const senderNumber = (sender || "").split("@")[0];

      const isGroup = from.endsWith("@g.us");
      const isOwner = ownerNumber.includes(senderNumber);

      const reply = (text) =>
        sock.sendMessage(from, { text }, { quoted: mek });

      /* ================= AUTO AI ================= */

      try {

        if (autoMsgPlugin && typeof autoMsgPlugin.onMessage === "function") {

          await autoMsgPlugin.onMessage(sock, mek, m, {
            from,
            body,
            args,
            q,
            sender,
            senderNumber,
            isGroup,
            isOwner,
            reply,
            isCmd,
            commandName,
            prefix,
          });

        }

      } catch (e) {

        console.log("AutoMsg hook error:", e?.message || e);

      }

      /* ================= COMMAND HANDLER ================= */

      if (isCmd) {

        const cmd = commands.find(
          (c) => c.pattern === commandName || c.alias?.includes(commandName)
        );

        if (cmd) {

          if (cmd.react) {
            sock.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
          }

          await cmd.function(sock, mek, m, {
            from,
            body,
            args,
            q,
            sender,
            senderNumber,
            isGroup,
            isOwner,
            reply,
          });

        }
      }
    }
  });
}

/* ================= SERVER ================= */

ensureSessionFile();

app.get("/", (req, res) => {
  res.send("Hey There, MALIYA-MD started ✅");
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
