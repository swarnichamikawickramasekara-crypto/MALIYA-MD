const { cmd } = require("../command");

cmd(
  {
    pattern: "poll",
    desc: "Create a WhatsApp poll",
    category: "group",
    react: "📊",
    filename: __filename,
  },
  async (conn, mek, m, { q, reply, from, isGroup }) => {
    try {
      if (!q) {
        return reply(
          "📌 Use:\n.poll Question | Option1, Option2\n\nExample:\n.poll Heta enawada | Ow, Na"
        );
      }

      const parts = q.split("|");
      if (parts.length < 2) {
        return reply(
          "❌ Format waradi.\n\nUse:\n.poll Question | Option1, Option2"
        );
      }

      const question = parts[0].trim();
      const options = parts[1]
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      if (!question) {
        return reply("❌ Poll question ekak denna.");
      }

      if (options.length < 2) {
        return reply("❌ Poll ekakata options 2k wath one.");
      }

      await conn.sendMessage(
        from,
        {
          poll: {
            name: question,
            values: options,
            selectableCount: 1,
          },
        },
        { quoted: mek }
      );
    } catch (e) {
      console.log("POLL PLUGIN ERROR:", e);
      return reply("❌ Poll send karanna bari una.");
    }
  }
);
