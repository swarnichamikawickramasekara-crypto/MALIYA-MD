const { cmd } = require("../command");
const yts = require("yt-search");
const ytdl = require("@distube/ytdl-core");

function generateProgressBar(duration = "0:00") {
    const totalBars = 10;
    const bar = "─".repeat(totalBars);
    return `*00:00* ${bar}○ *${duration}*`;
}

function isYouTubeUrl(text = "") {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(text.trim());
}

cmd(
    {
        pattern: "video",
        alias: ["ytmp4", "vdl"],
        react: "🎥",
        category: "download",
        filename: __filename,
    },
    async (bot, mek, m, { from, q, reply }) => {
        try {
            if (!q) return reply("🎥 Please provide a YouTube link or video name.");

            await reply("🔍 Searching Video...");

            let video;
            let videoUrl;

            if (isYouTubeUrl(q)) {
                videoUrl = q.trim();

                const info = await ytdl.getInfo(videoUrl);
                const details = info.videoDetails;

                video = {
                    title: details.title || "Unknown Title",
                    timestamp: details.lengthSeconds
                        ? `${Math.floor(details.lengthSeconds / 60)}:${String(details.lengthSeconds % 60).padStart(2, "0")}`
                        : "0:00",
                    views: details.viewCount ? Number(details.viewCount) : 0,
                    ago: details.publishDate || "Unknown",
                    thumbnail: details.thumbnails?.[details.thumbnails.length - 1]?.url || null,
                    author: { name: details.author?.name || "Unknown Channel" },
                    url: videoUrl,
                };
            } else {
                const search = await yts(q);
                if (!search.videos || !search.videos.length) {
                    return reply("❌ No results found.");
                }

                const v = search.videos[0];
                video = {
                    title: v.title,
                    timestamp: v.timestamp || "0:00",
                    views: v.views || 0,
                    ago: v.ago || "Unknown",
                    thumbnail: v.thumbnail || null,
                    author: { name: v.author?.name || "Unknown Channel" },
                    url: v.url,
                };
                videoUrl = v.url;
            }

            const title = video.title || "Unknown Title";
            const duration = video.timestamp || "0:00";
            const channel = video.author?.name || "Unknown Channel";
            const views = video.views ? Number(video.views).toLocaleString() : "Unknown";
            const uploaded = video.ago || "Unknown";
            const thumbnail = video.thumbnail || null;
            const progressBar = generateProgressBar(duration);

            if (thumbnail) {
                await bot.sendMessage(
                    from,
                    {
                        image: { url: thumbnail },
                        caption: `🎥 *${title}*

👤 *Channel:* ${channel}
⏱ *Duration:* ${duration}
👀 *Views:* ${views}
📅 *Uploaded:* ${uploaded}

${progressBar}

🍀 *MALIYA-MD VIDEO DOWNLOADER* 🍀
> QUALITY: 360P STABLE 🎬`
                    },
                    { quoted: mek }
                );
            }

            await reply("⬇️ Downloading video...");

            const info = await ytdl.getInfo(videoUrl);

            const formats = ytdl.filterFormats(info.formats, "videoandaudio")
                .filter(f => f.container === "mp4" && f.hasVideo && f.hasAudio);

            if (!formats.length) {
                return reply("❌ No MP4 format found for this video.");
            }

            let chosen =
                formats
                    .filter(f => Number(f.height || 0) <= 360)
                    .sort((a, b) => Number(b.height || 0) - Number(a.height || 0))[0];

            if (!chosen) {
                chosen = formats.sort((a, b) => Number(a.height || 9999) - Number(b.height || 9999))[0];
            }

            if (!chosen || !chosen.url) {
                return reply("❌ Failed to get downloadable video format.");
            }

            await bot.sendMessage(
                from,
                {
                    video: { url: chosen.url },
                    mimetype: "video/mp4",
                    caption: `✅ *${title}*\n\n*MALIYA-MD ❤️*`
                },
                { quoted: mek }
            );

        } catch (e) {
            console.log("VIDEO CMD ERROR:", e);
            return reply("❌ Error while downloading video: " + e.message);
        }
    }
);
