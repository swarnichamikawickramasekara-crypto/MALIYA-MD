const { cmd } = require("../command");
const axios = require("axios");
const cheerio = require("cheerio");

function isSinhala(text) {
  return /[\u0D80-\u0DFF]/.test(text);
}

function cleanLyrics(text) {
  if (!text) return "";

  // remove chords
  text = text.replace(/\b(Em|Dm|Am|G|C|D|F|B7|A7|E7|Bm|Fm|C7)\b/g, "");

  // remove youtube / urls
  text = text.replace(/https?:\/\/\S+/g, "");

  // remove english garbage lines
  text = text.replace(/(INTRO|CHORUS|VERSE|Key:|Beat:|Posted by:|Lyrics:|Music:|Watch this video).*$/gim, "");

  // remove extra spaces
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

async function getSinhalaLyrics(query) {
  try {
    const searchUrl = `https://sinhalasongbook.com/?s=${encodeURIComponent(query)}`;
    const searchRes = await axios.get(searchUrl);
    const $ = cheerio.load(searchRes.data);

    const link = $("h2.entry-title a").attr("href");
    if (!link) return null;

    const songRes = await axios.get(link);
    const $$ = cheerio.load(songRes.data);

    let title = $$("h1.entry-title").text().trim();
    let lyrics = $$("div.entry-content").text().trim();

    lyrics = cleanLyrics(lyrics);

    return { title, lyrics };
  } catch {
    return null;
  }
}

async function getEnglishLyrics(query) {
  try {
    const url = `https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`;
    const res = await axios.get(url);

    if (!res.data.data || !res.data.data[0]) return null;

    const first = res.data.data[0];
    const lyr = await axios.get(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(first.artist.name)}/${encodeURIComponent(first.title)}`
    );

    return {
      title: `${first.artist.name} - ${first.title}`,
      lyrics: lyr.data.lyrics
    };
  } catch {
    return null;
  }
}

cmd({
  pattern: "lyrics",
  alias: ["l"],
  desc: "Clean Sinhala + English Lyrics",
  category: "search",
  react: "🎵",
  filename: __filename
},
async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("❌ Song name eka denna\nExample: .lyrics faded");

    let result;

    if (isSinhala(q)) {
      result = await getSinhalaLyrics(q);
    } else {
      result = await getEnglishLyrics(q);
    }

    if (!result || !result.lyrics)
      return reply("❌ Lyrics hambune na!");

    let text = `🎶 *${result.title}*\n\n${result.lyrics}`;

    if (text.length > 3500)
      text = text.slice(0, 3500) + "\n\n...Lyrics Too Long";

    await conn.sendMessage(from, { text }, { quoted: mek });

  } catch (e) {
    console.log(e);
    reply("⚠️ Error ekak una!");
  }
});
