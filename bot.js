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

client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== ALLOWED_GUILD) return;
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription(`**welcome to 𝗯𝗹𝗮𝗱𝗲メ** <@${member.id}>`)
    .setTimestamp();
  await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
});

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
        { name: "📁 Total Stats", value: "\u200b", inline: false },
        { name: "🔘 Hits", value: `${stats.hits.toLocaleString()}`, inline: false },
        { name: "🩶 Visits", value: `${stats.visits.toLocaleString()}`, inline: false },
        { name: "🌫️ Clicks", value: `${stats.clicks.toLocaleString()}`, inline: false }
      )
      .setFooter({ text: `User ID: ${target.id} • Beamers Stats` })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const isNotFound = error.message.includes("success: false") || error.message.includes("404");
    await interaction.editReply({
      content: isNotFound
        ? `❌ No Beamers.si account found for Discord ID \`${target.id}\`.`
        : "❌ Failed to fetch stats. Please try again later.",
    });
  }
});

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
  if (command === "purge") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply("❌ You need **Manage Messages** permission.");
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
        const w = await message.channel.send("❌ No messages could be deleted — they may be older than 14 days.");
        setTimeout(() => w.delete().catch(() => {}), 4000);
        return;
      }
      const c = await message.channel.send(`🧹 **Done** — deleted **${deleted.size}** message${deleted.size === 1 ? "" : "s"}.`);
      setTimeout(() => c.delete().catch(() => {}), 3000);
    } catch (err) {
      message.channel.send("❌ Failed to delete messages.");
    }
    return;
  }
  if (command === "ban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply("❌ You need **Ban Members** permission.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user. Example: `,ban @user reason`");
    if (!target.bannable) return message.reply("❌ I can't ban that user.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    try { await target.ban({ reason }); message.reply("**Done**"); }
    catch { message.reply("❌ Failed to ban that user."); }
    return;
  }
  if (command === "timeout") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply("❌ You need **Timeout Members** permission.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user. Example: `,timeout @user 10 reason`");
    if (!target.moderatable) return message.reply("❌ I can't timeout that user.");
    const minutes = parseInt(args[1]) || 10;
    const reason = args.slice(2).join(" ") || "No reason provided";
    try { await target.timeout(minutes * 60 * 1000, reason); message.reply("**Done**"); }
    catch { message.reply("❌ Failed to timeout that user."); }
    return;
  }
});

console.log(process.env);
console.log("DISCORD_TOKEN:", process.env.DISCORD_TOKEN);
console.log("TOKEN:", process.env.TOKEN);

client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
