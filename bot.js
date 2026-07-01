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

const BEAMERS_API     = "https://app.beamers.si/v1/public/user";
const PREFIX          = ",";
const ALLOWED_GUILD   = "1519682429042823208";
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

    const displayName = nickname || target.username;

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(
        `# <a:white_flame:1521667415790846012> STATISTICS <a:white_flame:1521667415790846012>\n` +
        `<a:checkmark:1521670753660178503> **${displayName} stats**\n\n` +
        `<a:white_arrow_right:1521669099195994152> **Total hits: ${stats.hits.toLocaleString()}**\n\n` +
        `<a:white_arrow_right:1521669099195994152> **Total visits: ${stats.visits.toLocaleString()}**\n\n` +
        `<a:white_arrow_right:1521669099195994152> **Total clicks: ${stats.clicks.toLocaleString()}**`
      )
      .setImage("https://cdn.discordapp.com/attachments/1519698599125057636/1521660681773125813/6CBB45B0-1A8E-4305-94EF-A31A91410C0E.gif")
      .setFooter({ text: `${displayName} blade stats`, iconURL: target.displayAvatarURL() })
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

  const botHighestRole = message.guild.members.me.roles.highest;
  const userHighestRole = message.member.roles.highest;
  if (userHighestRole.position < botHighestRole.position) {
    return message.reply("❌ You don't have a high enough role to use my commands.");
  }

  // ,purge [amount]
  if (command === "purge") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply("❌ You need **Manage Messages** permission to use this.");
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply("❌ I don't have **Manage Messages** permission.");

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply("❌ Provide a number between 1 and 100. Example: `,purge 10`");

    try {
      await message.delete().catch(() => {});
      const fetched = await message.channel.messages.fetch({ limit: amount });
      const deleted = await message.channel.bulkDelete(fetched, true);
      if (deleted.size === 0) {
        const warn = await message.channel.send("❌ No messages could be deleted — may be older than 14 days.");
        setTimeout(() => warn.delete().catch(() => {}), 4000);
        return;
      }
      const confirm = await message.channel.send(`🧹 **Done** — deleted **${deleted.size}** message${deleted.size === 1 ? "" : "s"}.`);
      setTimeout(() => confirm.delete().catch(() => {}), 3000);
    } catch (err) {
      console.error("Purge error:", err.message);
      message.channel.send("❌ Failed to delete messages.").then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
    }
    return;
  }

  // ,ban @user [reason]
  if (command === "ban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply("❌ You need **Ban Members** permission to use this.");

    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user to ban. Example: `,ban @user reason`");
    if (!target.bannable) return message.reply("❌ I can't ban that user — they may have a higher role than me.");

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
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply("❌ You need **Timeout Members** permission to use this.");

    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user to timeout. Example: `,timeout @user 10 reason`");
    if (!target.moderatable) return message.reply("❌ I can't timeout that user — they may have a higher role than me.");

    const minutes = parseInt(args[1]) || 10;
    const reason  = args.slice(2).join(" ") || "No reason provided";

    try {
      await target.timeout(minutes * 60 * 1000, reason);
      message.reply("**Done**");
    } catch (err) {
      console.error("Timeout error:", err.message);
      message.reply("❌ Failed to timeout that user.");
    }
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);    const minutes = parseInt(args[1]) || 10;
    const reason  = args.slice(2).join(" ") || "No reason provided";

    try {
      await target.timeout(minutes * 60 * 1000, reason);
      message.reply("**Done**");
    } catch (err) {
      console.error("Timeout error:", err.message);
      message.reply("❌ Failed to timeout that user.");
    }
    return;

  }
});

client.login(process.env.DISCORD_TOKEN);
