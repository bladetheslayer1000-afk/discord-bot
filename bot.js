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

const BEAMERS_API = "https://app.beamers.si/v1/public/user";
const PREFIX = ",";
const ALLOWED_GUILD = "1519682429042823208";
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

// -------------------- Welcome --------------------

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

// -------------------- Slash Commands --------------------

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
        `# <a:white_flame:1521667415790846012> ꜱᴛᴀᴛɪꜱᴛɪᴄꜱ <a:white_flame:1521667415790846012>\n` +
        `<a:checkmark:1521670753660178503> **${target} Stats**\n\n` +
        `<a:white_arrow_right:1521669099195994152> **Total Hits:** ${stats.hits.toLocaleString()}\n` +
        `<a:white_arrow_right:1521669099195994152> **Total Visits:** ${stats.visits.toLocaleString()}\n` +
        `<a:white_arrow_right:1521669099195994152> **Total Clicks:** ${stats.clicks.toLocaleString()}`
      )
      .setImage(
        "https://cdn.discordapp.com/attachments/1519698599125057636/1521660681773125813/6CBB45B0-1A8E-4305-94EF-A31A91410C0E.gif"
      )
      .setFooter({
        text: `${displayName} Blade Stats`,
        iconURL: target.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
    });
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

// -------------------- Prefix Commands --------------------

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild?.id !== ALLOWED_GUILD) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  const botHighestRole = message.guild.members.me.roles.highest;
  const userHighestRole = message.member.roles.highest;

  if (userHighestRole.position < botHighestRole.position) {
    return message.reply(
      "❌ You don't have a high enough role to use my commands."
    );
        }
