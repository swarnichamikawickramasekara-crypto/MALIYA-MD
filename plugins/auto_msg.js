const { cmd } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ========= ENV =========
const API_KEY = process.env.GEMINI_API_KEY2;
if (!API_KEY) console.error("GEMINI_API_KEY2 is not set (auto_msg plugin)");

// ========= MODELS =========
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

// ========= SETTINGS =========
const PREFIXES = ["."];

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "auto_msg.json");
const MEMORY_STORE = path.join(DATA_DIR, "auto_msg_memory.json");
const PROFILE_STORE = path.join(DATA_DIR, "auto_msg_profiles.json");
const LOGS_DIR = path.join(DATA_DIR, "auto_msg_logs");

// 🔒 RATE-LIMIT SAFETY
const COOLDOWN_MS = 15000; // 15s per chat
const BACKOFF_MS_ON_429 = 180000; // 3 minutes global pause
const MAX_REPLIES_PER_HOUR = 60; // global hourly cap

// 🧠 MEMORY SETTINGS
const MEMORY_MAX_PER_CHAT = 300;
const MEMORY_TTL_DAYS = 90;
const MEMORY_MIN_CHARS = 3;
const SIM_THRESHOLD = 0.52; // lowered from 0.84 -> much better for similar questions
const EXACT_THRESHOLD = 0.97;

// 🧩 CONTEXT SETTINGS
const CONTEXT_MAX_TURNS = 12;

// 👤 PROFILE SETTINGS
const PROFILE_MAX_TOPICS = 20;
const MIN_TOKEN_LEN = 3;

// ========= IDENTITY =========
const IDENTITY_EN =
  "I am MALIYA-MD bot. I am an AI powered advanced bot made by Malindu Nadith.";
const IDENTITY_SI =
  "මම MALIYA-MD bot. මම Malindu Nadith විසින් හදපු AI powered advanced bot එකක්.";

// ========= STOPWORDS =========
const STOPWORDS_EN = new Set([
  "the", "and", "for", "are", "you", "your", "with", "this", "that", "have",
  "what", "how", "why", "was", "were", "will", "from", "they", "them", "then",
  "can", "could", "would", "should", "about", "into", "than", "when", "where",
  "who", "whom", "which", "also", "just", "like", "want", "need", "make", "made",
  "does", "did", "not", "yes", "no", "all", "any", "but", "too", "very", "more",
  "some", "much", "many", "our", "out", "use", "using", "used", "give", "tell",
  "help", "menu", "guide", "info", "please", "pls", "bro", "machan", "okay", "ok"
]);

const STOPWORDS_SI = new Set([
  "මට", "මගේ", "මම", "ඔයා", "ඔබ", "එක", "මේ", "ඒ", "ඒක", "මෙක", "ඔනෙ", "one",
  "denna", "mata", "mage", "oya", "mokak", "mokada", "kohomada", "karanna",
  "puluwan", "hari", "thawa", "kiyala", "kiyanne", "weda", "wada", "balanna",
  "ane", "ai", "ne", "da", "eka", "ehema", "ehama", "meka", "oya", "api",
  "onn", "anith", "tikak", "godak", "hodata", "hoda", "ewage", "wagema"
]);

// ========= HELPERS =========
function safeJsonRead(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function safeJsonWrite(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function sanitizeChatId(chatId) {
  return String(chatId || "unknown")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 120);
}

function ensureBaseFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  if (!fs.existsSync(STORE)) {
    safeJsonWrite(STORE, { global: { enabled: false } });
  }
  if (!fs.existsSync(MEMORY_STORE)) {
    safeJsonWrite(MEMORY_STORE, { chats: {}, context: {} });
  }
  if (!fs.existsSync(PROFILE_STORE)) {
    safeJsonWrite(PROFILE_STORE, { chats: {} });
  }
}

// ========= RATE LIMIT FRIENDLY MSG =========
function rateLimitMsg(lang) {
  return lang === "si"
    ? "⏳ දැන් requests ටිකක් වැඩියි. ටිකක් පස්සේ ආයෙ try කරන්න.\n> MALIYA-MD ❤️"
    : "⏳ Too many requests right now. Please try again in a moment.\n> MALIYA-MD ❤️";
}

// ========= HELP / ABOUT TEXT =========
function helpText(lang) {
  if (lang === "si") {
    return `🤖 *MALIYA-MD BOT - Help / Guide*

✅ *Prefix:* .
✅ *Menu:* .menu
✅ *AI Auto Reply (Private chats only):*
   - ON:  .msg on
   - OFF: .msg off
   - Status: .msg status
   - Profile: .msg profile
   - Clear memory: .msg clear
   - Export logs: .msg export

> MALIYA-MD ❤️`;
  }

  return `🤖 *MALIYA-MD BOT - Help / Guide*

✅ *Prefix:* .
✅ *Menu:* .menu
✅ *AI Auto Reply (Private chats only):*
   - ON:  .msg on
   - OFF: .msg off
   - Status: .msg status
   - Profile: .msg profile
   - Clear memory: .msg clear
   - Export logs: .msg export

> MALIYA-MD ❤️`;
}

// ========= GLOBAL STORE =========
function readStore() {
  ensureBaseFiles();
  const db = safeJsonRead(STORE, { global: { enabled: false } });
  if (!db.global) db.global = { enabled: false };
  return db;
}

function writeStore(db) {
  ensureBaseFiles();
  safeJsonWrite(STORE, db);
}

function setGlobalEnabled(val) {
  const db = readStore();
  db.global.enabled = !!val;
  writeStore(db);
}

function isGlobalEnabled() {
  const db = readStore();
  return !!db.global.enabled;
}

// ========= MEMORY STORE =========
function readMemory() {
  ensureBaseFiles();
  const db = safeJsonRead(MEMORY_STORE, { chats: {}, context: {} });
  if (!db.chats) db.chats = {};
  if (!db.context) db.context = {};
  return db;
}

function writeMemory(db) {
  ensureBaseFiles();
  safeJsonWrite(MEMORY_STORE, db);
}

function pruneQA(items) {
  const now = Date.now();
  const ttlMs = MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000;

  items = (items || []).filter((x) => {
    const ts = x?.ts || now;
    return now - ts <= ttlMs;
  });

  if (items.length > MEMORY_MAX_PER_CHAT) {
    items = items.slice(items.length - MEMORY_MAX_PER_CHAT);
  }

  return items;
}

function saveQA(chatId, q, a) {
  if (!q || !a) return;
  const db = readMemory();
  if (!db.chats[chatId]) db.chats[chatId] = [];

  db.chats[chatId].push({
    qRaw: String(q),
    qNorm: normalizeText(q),
    a: String(a),
    ts: Date.now(),
  });

  db.chats[chatId] = pruneQA(db.chats[chatId]);
  writeMemory(db);
}

function getChatMemory(chatId) {
  const db = readMemory();
  db.chats[chatId] = pruneQA(db.chats[chatId] || []);
  writeMemory(db);
  return db.chats[chatId];
}

// ========= CONTEXT =========
function saveTurn(chatId, role, text) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return;

  const db = readMemory();
  if (!db.context[chatId]) db.context[chatId] = [];

  db.context[chatId].push({
    role,
    text: cleanText,
    ts: Date.now(),
  });

  if (db.context[chatId].length > CONTEXT_MAX_TURNS) {
    db.context[chatId] = db.context[chatId].slice(-CONTEXT_MAX_TURNS);
  }

  writeMemory(db);
}

function getContext(chatId) {
  const db = readMemory();
  return db.context[chatId] || [];
}

function clearChatMemory(chatId) {
  const db = readMemory();
  db.chats[chatId] = [];
  db.context[chatId] = [];
  writeMemory(db);

  const p = readProfiles();
  p.chats[chatId] = newEmptyProfile();
  writeProfiles(p);

  const logFile = getChatLogFile(chatId);
  safeJsonWrite(logFile, []);
}

// ========= PROFILE STORE =========
function newEmptyProfile() {
  return {
    lang: "en",
    userMessageCount: 0,
    botMessageCount: 0,
    avgUserMsgLen: 0,
    avgBotMsgLen: 0,
    topics: {},
    lastSeen: 0,
    createdAt: Date.now(),
  };
}

function readProfiles() {
  ensureBaseFiles();
  const db = safeJsonRead(PROFILE_STORE, { chats: {} });
  if (!db.chats) db.chats = {};
  return db;
}

function writeProfiles(db) {
  ensureBaseFiles();
  safeJsonWrite(PROFILE_STORE, db);
}

function getProfile(chatId) {
  const db = readProfiles();
  if (!db.chats[chatId]) {
    db.chats[chatId] = newEmptyProfile();
    writeProfiles(db);
  }
  return db.chats[chatId];
}

function updateProfile(chatId, role, text, lang) {
  const db = readProfiles();
  if (!db.chats[chatId]) db.chats[chatId] = newEmptyProfile();

  const p = db.chats[chatId];
  const clean = String(text || "").trim();

  p.lang = lang || p.lang || "en";
  p.lastSeen = Date.now();

  if (role === "user") {
    p.userMessageCount += 1;
    p.avgUserMsgLen = rollingAvg(p.avgUserMsgLen, p.userMessageCount, clean.length);

    const toks = extractTopicTokens(clean, p.lang);
    for (const tk of toks) {
      p.topics[tk] = (p.topics[tk] || 0) + 1;
    }

    p.topics = trimTopTopics(p.topics, PROFILE_MAX_TOPICS);
  } else if (role === "bot") {
    p.botMessageCount += 1;
    p.avgBotMsgLen = rollingAvg(p.avgBotMsgLen, p.botMessageCount, clean.length);
  }

  writeProfiles(db);
}

function rollingAvg(currentAvg, count, newVal) {
  if (count <= 1) return newVal || 0;
  return ((currentAvg * (count - 1)) + (newVal || 0)) / count;
}

function trimTopTopics(topicMap, maxTopics) {
  const arr = Object.entries(topicMap || {}).sort((a, b) => b[1] - a[1]).slice(0, maxTopics);
  const out = {};
  for (const [k, v] of arr) out[k] = v;
  return out;
}

function getTopTopics(chatId, limit = 8) {
  const p = getProfile(chatId);
  return Object.entries(p.topics || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

// ========= LOGGING =========
function getChatLogFile(chatId) {
  return path.join(LOGS_DIR, `${sanitizeChatId(chatId)}.json`);
}

function appendChatLog(chatId, entry) {
  const file = getChatLogFile(chatId);
  const arr = safeJsonRead(file, []);
  arr.push({
    ...entry,
    ts: entry.ts || Date.now(),
  });

  if (arr.length > 1000) {
    arr.splice(0, arr.length - 1000);
  }

  safeJsonWrite(file, arr);
}

function getRecentLogs(chatId, limit = 20) {
  const file = getChatLogFile(chatId);
  const arr = safeJsonRead(file, []);
  return arr.slice(-limit);
}

// ========= TEXT NORMALIZATION =========
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  const t = normalizeText(s);
  if (!t) return [];
  return t.split(" ").filter(Boolean);
}

function charNgrams(s, n = 3) {
  const t = normalizeText(s).replace(/\s+/g, " ");
  if (!t) return [];
  if (t.length <= n) return [t];
  const out = [];
  for (let i = 0; i <= t.length - n; i++) {
    out.push(t.slice(i, i + n));
  }
  return out;
}

function jaccardFromArrays(a1, a2) {
  const A = new Set(a1);
  const B = new Set(a2);
  if (!A.size || !B.size) return 0;

  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;

  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function similarity(a, b) {
  const tokenScore = jaccardFromArrays(tokens(a), tokens(b));
  const ngramScore = jaccardFromArrays(charNgrams(a, 3), charNgrams(b, 3));
  return (tokenScore * 0.65) + (ngramScore * 0.35);
}

// ========= TOPIC EXTRACTION =========
function detectSinhalaScript(text) {
  return /[අ-෴]/.test(String(text || ""));
}

function extractTopicTokens(text, lang = "en") {
  const arr = tokens(text);
  const stop = lang === "si" ? STOPWORDS_SI : STOPWORDS_EN;

  return arr.filter((w) => {
    if (!w) return false;
    if (w.length < MIN_TOKEN_LEN) return false;
    if (/^\d+$/.test(w)) return false;
    if (stop.has(w)) return false;
    return true;
  });
}

// ========= MEMORY SEARCH =========
function findBestMemoryAnswer(chatId, userText) {
  const qn = normalizeText(userText);
  if (!qn || qn.length < MEMORY_MIN_CHARS) return null;

  const items = getChatMemory(chatId);
  if (!items.length) return null;

  let best = null;
  let bestScore = 0;

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const sc = similarity(qn, it.qNorm || it.qRaw || "");
    if (sc > bestScore) {
      bestScore = sc;
      best = it;
      if (bestScore >= EXACT_THRESHOLD) break;
    }
  }

  if (best && bestScore >= SIM_THRESHOLD) {
    return {
      answer: best.a,
      score: bestScore,
      matchedQuestion: best.qRaw || best.qNorm,
      source: bestScore >= EXACT_THRESHOLD ? "exact_memory" : "similar_memory",
    };
  }

  return null;
}

// ========= COOLDOWN =========
const lastReplyAt = new Map();

function inCooldown(chatId) {
  const now = Date.now();
  const last = lastReplyAt.get(chatId) || 0;
  if (now - last < COOLDOWN_MS) return true;
  lastReplyAt.set(chatId, now);
  return false;
}

// ========= HOURLY CAP =========
let hourWindowStart = Date.now();
let repliesThisHour = 0;

function hitHourlyCap() {
  const now = Date.now();

  if (now - hourWindowStart > 3600000) {
    hourWindowStart = now;
    repliesThisHour = 0;
  }

  if (repliesThisHour >= MAX_REPLIES_PER_HOUR) return true;
  repliesThisHour++;
  return false;
}

// ========= BACKOFF =========
let backoffUntil = 0;

function inBackoff() {
  return Date.now() < backoffUntil;
}

function startBackoff() {
  backoffUntil = Date.now() + BACKOFF_MS_ON_429;
}

// ========= QUEUE LOCK =========
let busy = false;

// ========= LANGUAGE DETECT =========
function detectLang(text) {
  if (!text) return "en";
  const t = text.toLowerCase().trim();

  if (/[අ-෴]/.test(text)) return "si";

  const singlishHints = [
    "oya", "kawda", "mokada", "mokak", "kohomada", "karanna", "puluwan",
    "eka", "mage", "mata", "one", "nathi", "hari", "thawa", "denna",
    "kiyala", "kiyanne", "wedak", "wada", "balanna", "ai", "ne", "da",
    "thiyenne", "thiyanawa", "wenne", "ganna", "haduwe", "hadapu", "ehema",
    "bro", "machan", "hodai", "hodayi", "ane", "pls", "plz"
  ];

  if (singlishHints.some((w) => t.includes(w))) return "si";
  return "en";
}

// ========= FOLLOW-UP DETECT =========
function isFollowUp(text) {
  const t = normalizeText(text);
  if (!t) return false;

  if (t.length <= 18) return true;

  const keys = [
    "eka", "eeka", "ehema", "ehama", "ow", "an", "ai", "ehenam", "meka",
    "mokakda", "kohomada", "hari", "ok", "okay", "thawa", "then", "so",
    "why", "how", "what about", "explain", "detail", "more", "anith eka",
    "itapasse", "passe", "aye", "next"
  ];

  return keys.some((k) => t === k || t.includes(k));
}

// ========= QUESTION DETECTORS =========
function isIdentityQuestion(text) {
  const t = (text || "").toLowerCase();
  const siKeys = ["oya kawda", "kawda oya", "oyawa haduwe", "haduwe kawda", "me bot eka kawda"];
  const enKeys = ["who are you", "who made you", "who created you", "what are you"];
  return siKeys.some((k) => t.includes(k)) || enKeys.some((k) => t.includes(k));
}

function isHelpQuestion(text) {
  const t = (text || "").toLowerCase();
  const siKeys = ["help", "menu", "cmd", "commands", "use karanne", "kohomada use", "bot use", "guide", "info"];
  const enKeys = ["help", "menu", "commands", "cmd", "how to use", "guide", "info", "about"];
  return siKeys.some((k) => t.includes(k)) || enKeys.some((k) => t.includes(k));
}

function getIdentityReply(lang) {
  return lang === "si" ? IDENTITY_SI : IDENTITY_EN;
}

// ========= USER PROFILE SUMMARY FOR PROMPT =========
function buildUserProfileSummary(chatId) {
  const p = getProfile(chatId);
  const topics = getTopTopics(chatId, 8);
  const recent = getRecentLogs(chatId, 6)
    .map((x) => `${x.role === "user" ? "User" : "Bot"}: ${x.text}`)
    .join("\n");

  return {
    lang: p.lang || "en",
    userMessageCount: p.userMessageCount || 0,
    avgUserMsgLen: Math.round(p.avgUserMsgLen || 0),
    topics,
    recent,
  };
}

// ========= PROMPT =========
function buildPrompt(userText, lang, chatId) {
  const prof = buildUserProfileSummary(chatId);
  const topTopics = prof.topics.length ? prof.topics.join(", ") : "none";

  if (lang === "si") {
    return `
ඔබ "MALIYA-MD" bot.
ඔබ Malindu Nadith විසින් හදපු AI powered advanced bot එකක්.
ඔබ ගැන කතා කරද්දි "MALIYA-MD" සහ "Malindu Nadith" විතරක් භාවිතා කරන්න.
පිළිතුරු කෙටි, පැහැදිලි, friendly Sinhala / Singlish mix එකෙන් දෙන්න.
user ගේ style එකට ගැලපෙන විදිහට reply කරන්න.
ඕනෙ නැති විස්තර වැඩියෙන් දෙන්න එපා.
same answer repeat කරන්න එපා.

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}

User: ${userText}
`.trim();
  }

  return `
You are "MALIYA-MD" bot.
You are made by Malindu Nadith.
Use only "MALIYA-MD" and "Malindu Nadith" when referring to yourself.
Reply short, clear, friendly, and natural.
Match the user's style.
Do not overuse the bot name.
Avoid repeating the same phrases.

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}

User: ${userText}
`.trim();
}

function buildPromptWithContext(userText, lang, chatId, contextTurns) {
  const prof = buildUserProfileSummary(chatId);
  const history = (contextTurns || [])
    .map((x) => `${x.role === "user" ? "User" : "Bot"}: ${x.text}`)
    .join("\n");

  const topTopics = prof.topics.length ? prof.topics.join(", ") : "none";

  if (lang === "si") {
    return `
ඔබ "MALIYA-MD" bot.
ඔබ Malindu Nadith විසින් හදපු AI powered advanced bot එකක්.
ඔබ ගැන කතා කරද්දි "MALIYA-MD" සහ "Malindu Nadith" විතරක් භාවිතා කරන්න.
පිළිතුරු කෙටි, පැහැදිලි, friendly Sinhala / Singlish mix එකෙන් දෙන්න.
User කලින් කතා කරපු context එක හරියට බලලා reply කරන්න.
Follow-up question එකට context එකට ගැලපෙන answer දෙන්න.
ඕනෙ නැති විස්තර දෙන්න එපා.
නිතරම bot name repeat කරන්න එපා.

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}

Previous chat context:
${history || "(no context)"}

Recent chat log:
${prof.recent || "(no recent log)"}

Now user asks:
${userText}
`.trim();
  }

  return `
You are "MALIYA-MD" bot, made by Malindu Nadith.
Use only "MALIYA-MD" and "Malindu Nadith" when referring to yourself.
Reply short, clear, and friendly.
Use previous context properly for follow-up messages.
Do not overuse the bot name.
Avoid unnecessary details.

User profile:
- Preferred language: ${prof.lang}
- User message count: ${prof.userMessageCount}
- Average user message length: ${prof.avgUserMsgLen}
- Common topics: ${topTopics}

Previous chat context:
${history || "(no context)"}

Recent chat log:
${prof.recent || "(no recent log)"}

Now user asks:
${userText}
`.trim();
}

// ========= AI CALL =========
async function generateText(prompt) {
  if (!API_KEY) throw new Error("Missing GEMINI_API_KEY2");

  let lastErr = null;

  for (const model of MODEL_CANDIDATES) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const res = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.75,
            topP: 0.95,
            maxOutputTokens: 300,
          },
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": API_KEY,
          },
        }
      );

      const out = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (out && out.length > 1) return out;

      lastErr = new Error("Empty response");
    } catch (e) {
      lastErr = e;
      if (e?.response?.status === 404) continue;
      throw e;
    }
  }

  throw lastErr || new Error("AI error");
}

// ========= EXPORT / SUMMARY =========
function buildProfileText(chatId) {
  const p = getProfile(chatId);
  const topTopics = getTopTopics(chatId, 10);
  const recent = getRecentLogs(chatId, 10);

  return `👤 *Chat Profile*

• Language: ${p.lang || "en"}
• User messages: ${p.userMessageCount || 0}
• Bot replies: ${p.botMessageCount || 0}
• Avg user msg length: ${Math.round(p.avgUserMsgLen || 0)}
• Avg bot msg length: ${Math.round(p.avgBotMsgLen || 0)}
• Top topics: ${topTopics.length ? topTopics.join(", ") : "none"}

🕘 *Recent messages:*
${recent.length
  ? recent.map((x, i) => `${i + 1}. [${x.role}] ${String(x.text).slice(0, 120)}`).join("\n")
  : "No recent messages"}
`;
}

function buildExportText(chatId) {
  const logs = getRecentLogs(chatId, 50);
  if (!logs.length) return "No chat logs found.";

  return logs
    .map((x) => {
      const dt = new Date(x.ts || Date.now()).toISOString();
      return `[${dt}] ${x.role.toUpperCase()}: ${x.text}`;
    })
    .join("\n");
}

// ========= COMMAND: .msg =========
cmd(
  {
    pattern: "msg",
    desc: "Auto Reply ON/OFF (Private chats only)",
    category: "AI",
    react: "💬",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply }) => {
    try {
      const arg = (q || "").trim().toLowerCase();
      const from = mek?.key?.remoteJid;

      if (!arg) {
        return reply("Use:\n.msg on\n.msg off\n.msg status\n.msg profile\n.msg clear\n.msg export");
      }

      if (arg === "on") {
        setGlobalEnabled(true);
        return reply("✅ Auto Reply ON (Private chats only)");
      }

      if (arg === "off") {
        setGlobalEnabled(false);
        return reply("⛔ Auto Reply OFF");
      }

      if (arg === "status") {
        return reply(`Auto Reply: ${isGlobalEnabled() ? "ON" : "OFF"}`);
      }

      if (arg === "profile") {
        if (!from) return reply("Chat not found.");
        return reply(buildProfileText(from));
      }

      if (arg === "clear") {
        if (!from) return reply("Chat not found.");
        clearChatMemory(from);
        return reply("🧹 මේ chat එකේ memory / profile / logs clear කරලා ඉවරයි.");
      }

      if (arg === "export") {
        if (!from) return reply("Chat not found.");
        const txt = buildExportText(from);
        return reply(txt.length > 3900 ? txt.slice(0, 3900) + "\n\n...truncated" : txt);
      }

      return reply("Use:\n.msg on\n.msg off\n.msg status\n.msg profile\n.msg clear\n.msg export");
    } catch (e) {
      console.log("MSG COMMAND ERROR:", e?.message || e);
      return reply("❌ Command error");
    }
  }
);

// ========= MAIN HOOK =========
async function onMessage(conn, mek, m, ctx = {}) {
  let lang = "en";

  try {
    const from = ctx.from || mek?.key?.remoteJid;
    if (!from) return;

    // Private chats only
    if (String(from).endsWith("@g.us")) return;
    if (!isGlobalEnabled()) return;
    if (mek?.key?.fromMe) return;

    const body = String(ctx.body || "").trim();
    if (!body) return;

    // ignore commands
    if (PREFIXES.some((p) => body.startsWith(p))) return;

    lang = detectLang(body);

    // Save user data
    saveTurn(from, "user", body);
    appendChatLog(from, { role: "user", text: body, ts: Date.now() });
    updateProfile(from, "user", body, lang);

    // Static handlers
    if (isHelpQuestion(body)) {
      const txt = helpText(lang);
      await conn.sendMessage(from, { text: txt }, { quoted: mek });

      saveTurn(from, "bot", txt);
      appendChatLog(from, { role: "bot", text: txt, ts: Date.now() });
      updateProfile(from, "bot", txt, lang);
      return;
    }

    if (isIdentityQuestion(body)) {
      const txt = getIdentityReply(lang);
      await conn.sendMessage(from, { text: txt }, { quoted: mek });

      saveTurn(from, "bot", txt);
      appendChatLog(from, { role: "bot", text: txt, ts: Date.now() });
      updateProfile(from, "bot", txt, lang);
      return;
    }

    // backoff / queue / caps
    if (inBackoff()) return;
    if (busy) return;
    if (inCooldown(from)) return;
    if (hitHourlyCap()) return;

    // 1) MEMORY CHECK FIRST
    const mem = findBestMemoryAnswer(from, body);
    if (mem?.answer) {
      const reused = mem.answer;

      await conn.sendMessage(from, { text: reused }, { quoted: mek });

      saveTurn(from, "bot", reused);
      appendChatLog(from, {
        role: "bot",
        text: reused,
        ts: Date.now(),
        meta: {
          source: mem.source,
          score: Number(mem.score || 0).toFixed(3),
          matchedQuestion: mem.matchedQuestion || "",
        },
      });
      updateProfile(from, "bot", reused, lang);
      return;
    }

    // 2) API CALL
    busy = true;

    const ctxTurns = getContext(from);
    const prompt = isFollowUp(body)
      ? buildPromptWithContext(body, lang, from, ctxTurns)
      : buildPrompt(body, lang, from);

    const out = await generateText(prompt);

    if (out) {
      await conn.sendMessage(from, { text: out }, { quoted: mek });

      // save Q/A for future no-API reuse
      saveQA(from, body, out);

      // save context, logs, profile
      saveTurn(from, "bot", out);
      appendChatLog(from, {
        role: "bot",
        text: out,
        ts: Date.now(),
        meta: { source: "api" },
      });
      updateProfile(from, "bot", out, lang);
    }
  } catch (e) {
    const status = e?.response?.status;

    if (status === 429) {
      startBackoff();

      try {
        const from = ctx.from || mek?.key?.remoteJid;
        if (from && !String(from).endsWith("@g.us")) {
          await conn.sendMessage(from, { text: rateLimitMsg(lang) }, { quoted: mek });
        }
      } catch {}

      console.log("AUTO_MSG: rate limit hit (429) - backoff started");
      return;
    }

    console.log("AUTO_MSG ERROR:", status || "", e?.message || e);
  } finally {
    busy = false;
  }
}

module.exports = { onMessage };
