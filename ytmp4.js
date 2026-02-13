const { cmd } = require("../command");
const { ytmp4 } = require("sadaslk-dlcore");
const yts = require("yt-search");

async function getYoutube(query) {
  const isUrl = /(youtube\.com|youtu\.be)/i.test(query);
  if (isUrl) {
    const id = query.split("v=")[1] || query.split("/").pop();
    const info = await yts({ videoId: id });
    return info;
  }

  const search = await yts(query);
  if (!search.videos.length) return null;
  return search.videos[0];
}

cmd(
  {
    pattern: "ytmp4",
    alias: ["ytv", "video", "mp4"],
    desc: "Download YouTube videos as MP4",
    category: "download",
    filename: __filename,
  },
  async (bot, mek, m, { from, q, reply }) => {
    try {
      if (!q) return reply("⚠️ Please provide a YouTube video name or link.\n\nExample:\n.ytmp4 Despacito\n.ytmp4 https://youtu.be/...");

      reply("🔍 Searching YouTube...");
      
      const video = await getYoutube(q);
      if (!video) return reply("❌ No results found.");

      const caption = 
        `╭━━━━━━━━━━━━━━╮\n` +
        `│   🎬 YOUTUBE VIDEO   │\n` +
        `╰━━━━━━━━━━━━━━╯\n\n` +
        `📌 Title: ${video.title}\n` +
        `👤 Channel: ${video.author.name}\n` +
        `⏱ Duration: ${video.timestamp}\n` +
        `👀 Views: ${video.views.toLocaleString()}\n` +
        `📅 Uploaded: ${video.ago || 'N/A'}\n` +
        `🔗 Link: ${video.url}\n\n` +
        `⬇️ Downloading video (360p)...`;

      await bot.sendMessage(
        from,
        {
          image: { url: video.thumbnail },
          caption: caption,
        },
        { quoted: mek }
      );

      const data = await ytmp4(video.url, {
        format: "mp4",
        videoQuality: "360",
      });

      if (!data?.url) {
        return reply("❌ Failed to download video. Please try again.");
      }

      await bot.sendMessage(
        from,
        {
          video: { url: data.url },
          mimetype: "video/mp4",
          fileName: data.filename || `${video.title}.mp4`,
          caption: `✅ Download complete!\n\n📌 ${video.title}`,
          gifPlayback: false,
        },
        { quoted: mek }
      );

    } catch (e) {
      console.error("YTMP4 Error:", e);
      reply("❌ Error downloading video. Please try again later.");
    }
  }
);
