require("dotenv").config();
const path = require("path");
const http = require("http");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running.");
}).listen(PORT);

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
    const displayName = nickname || target.username;
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("<a:white_flame:1424922037381496974> ꜱᴛᴀᴛɪꜱᴛɪᴄꜱ <a:white_flame:1424922037381496974>")
      .setDescription(
        `<a:chech_bw:1386925779429883996> **${displayName} stats**\n\n` +
        `<a:White_Arrow_Right:1424923190060126379> **Total hits: ${stats.hits.toLocaleString()}**\n\n` +
        `<a:White_Arrow_Right:1424923190060126379> **Total visits: ${stats.visits.toLocaleString()}**\n\n` +
        `<a:White_Arrow_Right:1424923190060126379> **Total clicks: ${stats.clicks.toLocaleString()}**`
      )
      .setImage("https://cdn.discordapp.com/attachments/1519698599125057636/1521660681773125813/6CBB45B0-1A8E-4305-94EF-A31A91410C0E.gif")
      .setFooter({ text: `${displayName} blade stats`, iconURL: target.displayAvatarURL() })
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
  if (userHighestRole.position < botHighestRole.position)
    return message.reply("❌ You don't have a high enough role to use my commands.");
  if (command === "purge") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply("❌ You need **Manage Messages** permission.");
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply("❌ I don't have **Manage Messages** permission.");
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply("❌ Provide a number 1–100. Example: `,purge 10`");
    try {
      await message.delete().catch(() => {});
      const fetched = await message.channel.messages.fetch({ limit: amount });
      const deleted = await message.channel.bulkDelete(fetched, true);
      if (deleted.size === 0) {
        const w = await message.channel.send("❌ No messages could be deleted — may be older than 14 days.");
        setTimeout(() => w.delete().catch(() => {}), 4000);
        return;
      }
      const c = await message.channel.send(`🧹 **Done** — deleted **${deleted.size}** message${deleted.size === 1 ? "" : "s"}.`);
      setTimeout(() => c.delete().catch(() => {}), 3000);
    } catch { message.channel.send("❌ Failed to delete messages."); }
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

const token = process.env.DISCORD_TOKEN;

console.log("First 10:", token.slice(0, 10));
console.log("Length:", token.length);

client.login(token);