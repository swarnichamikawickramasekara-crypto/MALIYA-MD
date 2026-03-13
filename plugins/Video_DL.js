const { cmd } = require("../command");
const DY_SCRAP = require("@dark-yasiya/scrap");
const dy_scrap = new DY_SCRAP();

function generateProgressBar(duration = "0:00") {
    const totalBars = 10;
    const bar = "─".repeat(totalBars);
    return `*00:00* ${bar}○ *${duration}*`;
}

async function getVideoDownload(url) {
    // 1st try normal
    try {
        const data = await dy_scrap.ytmp4(url, 360);
        const dl = data?.result?.download?.url;
        if (data?.status && dl) {
            return { ok: true, url: dl, source: "ytmp4" };
        }
        console.log("ytmp4 failed response:", data);
    } catch (e) {
        console.log("ytmp4 error:", e.message);
    }

    // 2nd try v2
    try {
        const data2 = await dy_scrap.ytmp4_v2(url, 360);
        const dl2 = data2?.result?.download?.url;
        if (data2?.status && dl2) {
            return { ok: true, url: dl2, source: "ytmp4_v2" };
        }
        console.log("ytmp4_v2 failed response:", data2);
    } catch (e) {
        console.log("ytmp4_v2 error:", e.message);
    }

    return { ok: false };
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

            const search = await dy_scrap.ytsearch(q);

            if (!search?.results?.length) {
                return reply("❌ No results found.");
            }

            const video = search.results[0];
            const title = video?.title || "Unknown Title";
            const thumbnail = video?.thumbnail || video?.image || null;
            const duration = video?.timestamp || "0:00";
            const channel = video?.author?.name || "Unknown Channel";
            const views = video?.views ? Number(video.views).toLocaleString() : "Unknown";
            const uploaded = video?.ago || "Unknown";
            const videoUrl = video?.url;

            if (!videoUrl) return reply("❌ Video URL not found.");

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
> QUALITY: 360P STABLE 🎬`,
                    },
                    { quoted: mek }
                );
            }

            await reply("⬇️ Downloading video...");

            const result = await getVideoDownload(videoUrl);

            if (!result.ok || !result.url) {
                return reply("❌ Failed to fetch video download link.\n\nTry another video or use a direct YouTube URL.");
            }

            await bot.sendMessage(
                from,
                {
                    video: { url: result.url },
                    mimetype: "video/mp4",
                    caption: `✅ *${title}*\n\n*MALIYA-MD ❤️*\n> Source: ${result.source}`,
                },
                { quoted: mek }
            );

        } catch (e) {
            console.log("VIDEO CMD ERROR:", e);
            return reply("❌ Error while downloading video: " + e.message);
        }
    }
);
