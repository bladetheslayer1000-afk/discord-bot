require("dotenv").config();
const path = require("path");
const http = require("http");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require("discord.js");

// Keep-alive HTTP server so Replit can deploy and host this bot 24/7
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running.");
}).listen(PORT, () => {
  console.log(`Keep-alive server on port ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const BEAMERS_API    = "https://app.beamers.si/v1/public/user";
const PREFIX         = ",";
const ALLOWED_GUILD  = "1519682429042823208";
const WELCOME_CHANNEL = "1519698507475189791";

async function fetchStats(discordUserId) {
  const url = `${BEAMERS_API}?id=${discordUserId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error("API returned success: false");
  return data;
}

client.once("clientReady", () => {
  console.log(`Bot is online as ${client.user.tag}`);
});

// --- Welcome Message ---
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== ALLOWED_GUILD) return;

  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL);
  if (!channel) return;

  const attachment = new AttachmentBuilder(
    path.join(__dirname, "welcome.jpeg"),
    { name: "welcome.jpeg" }
  );

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription(`**welcome to 𝗯𝗹𝗮𝗱𝗲メ** <@${member.id}>`)
    .setImage("attachment://welcome.jpeg")
    .setTimestamp();

  await channel.send({
    content: `<@${member.id}>`,
    embeds: [embed],
    files: [attachment],
  });
});

// --- Slash Commands ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.guild?.id !== ALLOWED_GUILD) return;
  if (interaction.commandName !== "stats") return;

  await interaction.deferReply();

  const target = interaction.options.getUser("user") || interaction.user;

  try {
    const data = await fetchStats(target.id);
    const { nickname, stats } = data;

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${nickname || target.username}'s Beamers Stats`)
      .addFields(
        { name: "📁 Total Stats", value: "\u200b",                           inline: false },
        { name: "🔘 Hits",        value: `${stats.hits.toLocaleString()}`,   inline: false },
        { name: "🩶 Visits",      value: `${stats.visits.toLocaleString()}`, inline: false },
        { name: "🌫️ Clicks",     value: `${stats.clicks.toLocaleString()}`, inline: false }
      )
      .setFooter({ text: `User ID: ${target.id} • Beamers Stats` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(`Stats fetch failed for ${target.id}:`, error.message);
    const isNotFound =
      error.message.includes("success: false") ||
      error.message.includes("404");
    await interaction.editReply({
      content: isNotFound
        ? `❌ No Beamers.si account found for Discord ID \`${target.id}\`. Make sure your Discord is linked in your Beamers.si account settings.`
        : "❌ Failed to fetch stats. Please try again later.",
    });
  }
});

// --- Prefix Commands ---
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild?.id !== ALLOWED_GUILD) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // Block anyone whose highest role is below the bot's highest role
  const botHighestRole = message.guild.members.me.roles.highest;
  const userHighestRole = message.member.roles.highest;
  if (userHighestRole.position < botHighestRole.position) {
    return message.reply("❌ You don't have a high enough role to use my commands.");
  }

  // ,purge [amount]
  if (command === "purge") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply("❌ You need **Manage Messages** permission to use this.");
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply("❌ I don't have **Manage Messages** permission. Please give the bot that role permission.");
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply("❌ Provide a number between 1 and 100. Example: `,purge 10`");
    }

    try {
      await message.delete().catch(() => {});
      const fetched = await message.channel.messages.fetch({ limit: amount });
      const deleted = await message.channel.bulkDelete(fetched, true);
      if (deleted.size === 0) {
        const warn = await message.channel.send("❌ No messages could be deleted — they may all be older than 14 days.");
        setTimeout(() => warn.delete().catch(() => {}), 4000);
        return;
      }
      const confirm = await message.channel.send(`🧹 **Done** — deleted **${deleted.size}** message${deleted.size === 1 ? "" : "s"}.`);
      setTimeout(() => confirm.delete().catch(() => {}), 3000);
    } catch (err) {
      console.error("Purge error:", err.message);
      message.channel.send("❌ Failed to delete messages. Make sure messages are less than 14 days old.").then(m => {
        setTimeout(() => m.delete().catch(() => {}), 4000);
      });
    }
    return;
  }

  // ,ban @user [reason]
  if (command === "ban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply("❌ You need **Ban Members** permission to use this.");
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply("❌ Mention a user to ban. Example: `,ban @user spamming`");
    }
    if (!target.bannable) {
      return message.reply("❌ I can't ban that user — they may have a higher role than me.");
    }

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      await target.ban({ reason });
      message.reply("**Done**");
    } catch (err) {
      console.error("Ban error:", err.message);
      message.reply("❌ Failed to ban that user.");
    }
    return;
  }

  // ,timeout @user [minutes] [reason]
  if (command === "timeout") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply("❌ You need **Timeout Members** permission to use this.");
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply("❌ Mention a user to timeout. Example: `,timeout @user 10 spamming`");
    }
    if (!target.moderatable) {
      return message.reply("❌ I can't timeout that user — they may have a higher role than me.");
    }

    const minutes = parseInt(args[1]) || 10;
    const reason   = args.slice(2).join(" ") || "No reason provided";
    const ms       = minutes * 60 * 1000;

    try {
      await target.timeout(ms, reason);
      message.reply("**Done**");
    } catch (err) {
      console.error("Timeout error:", err.message);
      message.reply("❌ Failed to timeout that user.");
    }
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);
