require("dotenv").config();
const {
  AuditLogEvent,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits
} = require("discord.js");

const TOKEN = process.env.BOT_TOKEN;
const PREFIX = process.env.PREFIX || "!";
const LOG_CATEGORY_NAME = "SECURITY LOGS";

const LOG_CHANNELS = {
  bots: "🔍┋لــوق︲الــبــوتــات",
  rooms: "🔍┋لــوق︲الــرومــات",
  edits: "🔍┋لــوق︲الــتعــديــلات",
  messages: "🔍┋لــوق︲الــرســائل",
  voice: "🔍┋لــوق︲الــصوت",
  server: "🔍┋لــوق︲الــســيرفــر",
  roles: "🔍┋لــوق︲الرولات",
  members: "🔍┋لــوق︲الاعــضــاء",
  mute: "🔍┋لــوق︲الــمــيــوت︲الــدفــن"
};

const LOG_ORDER = [
  LOG_CHANNELS.bots,
  LOG_CHANNELS.rooms,
  LOG_CHANNELS.edits,
  LOG_CHANNELS.messages,
  LOG_CHANNELS.voice,
  LOG_CHANNELS.server,
  LOG_CHANNELS.roles,
  LOG_CHANNELS.members,
  LOG_CHANNELS.mute
];

const state = {
  antiSpam: new Map(),
  antiRaid: new Map()
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
});

function hasAdmin(message) {
  return message.member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function formatValue(value) {
  if (value === null || value === undefined) return "غير محدد";
  if (typeof value === "object") return `\`${JSON.stringify(value).slice(0, 900)}\``;
  return String(value).slice(0, 900);
}

async function getLogChannel(guild, channelName) {
  return guild.channels.cache.find((ch) => ch.name === channelName && ch.type === ChannelType.GuildText);
}

async function sendLog(guild, channelName, embed) {
  try {
    const channel = await getLogChannel(guild, channelName);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Failed sending log to ${channelName}:`, error.message);
  }
}

function createEmbed(title, color = 0x2f3136) {
  return new EmbedBuilder()
    .setTitle(`Security Guard | ${title}`)
    .setColor(color)
    .setTimestamp();
}

function buildFields(data) {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => ({
      name,
      value: formatValue(value)
    }));
}

async function logByKey(guild, key, title, data = {}, color = 0x2f3136) {
  if (!guild || !LOG_CHANNELS[key]) return;
  const embed = createEmbed(title, color).addFields(buildFields(data));
  await sendLog(guild, LOG_CHANNELS[key], embed);
}

async function setupLogChannels(guild) {
  let category = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildCategory && ch.name === LOG_CATEGORY_NAME
  );

  if (!category) {
    category = await guild.channels.create({
      name: LOG_CATEGORY_NAME,
      type: ChannelType.GuildCategory
    });
  }

  for (const name of LOG_ORDER) {
    const exists = guild.channels.cache.find((ch) => ch.name === name && ch.type === ChannelType.GuildText);
    if (!exists) {
      await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: "Created by Security Guard Bot"
      });
    }
  }
}

function antiSpamCheck(message) {
  if (!message.guild || message.author.bot) return false;
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const bucket = state.antiSpam.get(key) || [];
  const updated = bucket.filter((t) => now - t < 6000);
  updated.push(now);
  state.antiSpam.set(key, updated);
  return updated.length >= 6;
}

function antiRaidCheck(member) {
  const guildId = member.guild.id;
  const now = Date.now();
  const joins = state.antiRaid.get(guildId) || [];
  const filtered = joins.filter((t) => now - t < 15000);
  filtered.push(now);
  state.antiRaid.set(guildId, filtered);
  return filtered.length >= 8;
}

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  if (antiSpamCheck(message)) {
    await message.delete().catch(() => null);
    await logByKey(
      message.guild,
      "messages",
      "حذف سبام",
      {
        "العضو": `${message.author.tag}`,
        "الروم": `${message.channel}`,
        "السبب": "إرسال رسائل كثيرة بسرعة"
      },
      0xe67e22
    );
    return;
  }

  if (/https?:\/\/|discord\.gg\//i.test(message.content) && !hasAdmin(message)) {
    await message.delete().catch(() => null);
    await logByKey(
      message.guild,
      "messages",
      "حذف رابط",
      {
        "العضو": `${message.author.tag}`,
        "الروم": `${message.channel}`,
        "السبب": "منع الروابط لغير الإدارة"
      },
      0xe74c3c
    );
    return;
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (!hasAdmin(message)) return;

  if (command === "setup-logs") {
    await setupLogChannels(message.guild);
    await message.reply("تم إنشاء كل قنوات اللوق المطلوبة بنجاح.");
  }

  if (command === "log-map") {
    await message.reply(
      [
        "**توزيع اللوقات الحالي:**",
        `- البوتات -> ${LOG_CHANNELS.bots}`,
        `- الرومات -> ${LOG_CHANNELS.rooms}`,
        `- التعديلات الإدارية -> ${LOG_CHANNELS.edits}`,
        `- الرسائل -> ${LOG_CHANNELS.messages}`,
        `- الصوت -> ${LOG_CHANNELS.voice}`,
        `- السيرفر -> ${LOG_CHANNELS.server}`,
        `- الرولات -> ${LOG_CHANNELS.roles}`,
        `- الأعضاء -> ${LOG_CHANNELS.members}`,
        `- الميوت/الدفن -> ${LOG_CHANNELS.mute}`
      ].join("\n")
    );
  }

  if (command === "lockall") {
    const channels = message.guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);
    for (const [, ch] of channels) {
      await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => null);
    }
    await message.reply("تم قفل جميع الرومات الكتابية.");
  }

  if (command === "unlockall") {
    const channels = message.guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);
    for (const [, ch] of channels) {
      await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => null);
    }
    await message.reply("تم فتح جميع الرومات الكتابية.");
  }

  if (command === "help") {
    await message.reply(
      [
        "**اوامر البوت:**",
        `\`${PREFIX}setup-logs\` - إنشاء قنوات اللوق`,
        `\`${PREFIX}lockall\` - قفل كل الرومات`,
        `\`${PREFIX}unlockall\` - فتح كل الرومات`,
        `\`${PREFIX}log-map\` - عرض توزيع اللوقات`,
        `\`${PREFIX}help\` - عرض المساعدة`
      ].join("\n")
    );
  }
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;
  await logByKey(
    message.guild,
    "messages",
    "حذف رسالة",
    {
      "العضو": message.author?.tag || "غير معروف",
      "الروم": message.channel ? `${message.channel}` : "غير معروف",
      "المحتوى": message.content || "رسالة بدون محتوى نصي"
    },
    0xff7675
  );
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  await logByKey(
    newMessage.guild,
    "messages",
    "تعديل رسالة",
    {
      "العضو": newMessage.author?.tag || "غير معروف",
      "الروم": newMessage.channel ? `${newMessage.channel}` : "غير معروف",
      "قبل": oldMessage.content || "فارغ",
      "بعد": newMessage.content || "فارغ"
    },
    0x74b9ff
  );
});

client.on(Events.GuildMemberAdd, async (member) => {
  const raidDetected = antiRaidCheck(member);
  await logByKey(
    member.guild,
    "members",
    "دخول عضو",
    {
      "العضو": `${member.user.tag}`,
      "الحساب": `${member}`,
      "الحالة": raidDetected ? "تحذير: دخول سريع (Raid محتمل)" : "طبيعي"
    },
    raidDetected ? 0xe74c3c : 0x2ecc71
  );

  if (member.user.bot) {
    await logByKey(
      member.guild,
      "bots",
      "إضافة بوت",
      {
        "البوت": member.user.tag,
        "المعرّف": member.user.id
      },
      0xe67e22
    );
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  await logByKey(
    member.guild,
    "members",
    "خروج عضو",
    {
      "العضو": member.user.tag,
      "المعرّف": member.user.id
    },
    0xe17055
  );
});

client.on(Events.GuildBanAdd, async (ban) => {
  await logByKey(
    ban.guild,
    "mute",
    "دفن (Ban)",
    {
      "العضو": ban.user.tag,
      "المعرّف": ban.user.id
    },
    0xc0392b
  );
});

client.on(Events.GuildBanRemove, async (ban) => {
  await logByKey(
    ban.guild,
    "mute",
    "فك دفن (Unban)",
    {
      "العضو": ban.user.tag,
      "المعرّف": ban.user.id
    },
    0x27ae60
  );
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const wasTimedOut = oldMember.communicationDisabledUntilTimestamp || 0;
  const nowTimedOut = newMember.communicationDisabledUntilTimestamp || 0;

  if (wasTimedOut !== nowTimedOut) {
    const muted = nowTimedOut > Date.now();
    await logByKey(
      newMember.guild,
      "mute",
      muted ? "ميوت عضو (Timeout)" : "فك الميوت",
      {
        "العضو": newMember.user.tag,
        "النوع": muted ? "تم تطبيق التايم اوت" : "تم إلغاء التايم اوت"
      },
      muted ? 0xf39c12 : 0x2ecc71
    );
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (!newState.guild) return;
  if (oldState.channelId === newState.channelId && oldState.serverMute === newState.serverMute && oldState.serverDeaf === newState.serverDeaf) {
    return;
  }

  const userTag = newState.member?.user?.tag || oldState.member?.user?.tag || "غير معروف";
  const before = oldState.channel?.name || "لا يوجد";
  const after = newState.channel?.name || "لا يوجد";
  await logByKey(
    newState.guild,
    "voice",
    "تحديث صوتي",
    {
      "العضو": userTag,
      "القناة قبل": before,
      "القناة بعد": after,
      "Server Mute": newState.serverMute ? "Yes" : "No",
      "Server Deaf": newState.serverDeaf ? "Yes" : "No"
    },
    0x9b59b6
  );
});

client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  await logByKey(
    channel.guild,
    "rooms",
    "إنشاء روم",
    {
      "اسم الروم": channel.name,
      "النوع": String(channel.type)
    },
    0x2ecc71
  );
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  await logByKey(
    channel.guild,
    "rooms",
    "حذف روم",
    {
      "اسم الروم": channel.name,
      "النوع": String(channel.type)
    },
    0xe74c3c
  );
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  await logByKey(
    newChannel.guild,
    "rooms",
    "تعديل روم",
    {
      "قبل": oldChannel.name || "غير معروف",
      "بعد": newChannel.name || "غير معروف"
    },
    0x3498db
  );
  await logByKey(
    newChannel.guild,
    "edits",
    "تعديل إداري على روم",
    {
      "قبل": oldChannel.name || "غير معروف",
      "بعد": newChannel.name || "غير معروف"
    },
    0x2980b9
  );
});

client.on(Events.RoleCreate, async (role) => {
  await logByKey(role.guild, "roles", "إنشاء رتبة", { "اسم الرتبة": role.name }, 0x2ecc71);
});

client.on(Events.RoleDelete, async (role) => {
  await logByKey(role.guild, "roles", "حذف رتبة", { "اسم الرتبة": role.name }, 0xe74c3c);
});

client.on(Events.RoleUpdate, async (oldRole, newRole) => {
  await logByKey(
    newRole.guild,
    "roles",
    "تعديل رتبة",
    {
      "قبل": oldRole.name,
      "بعد": newRole.name
    },
    0x3498db
  );
  await logByKey(
    newRole.guild,
    "edits",
    "تعديل إداري على رتبة",
    {
      "قبل": oldRole.name,
      "بعد": newRole.name
    },
    0x2980b9
  );
});

client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
  await logByKey(
    newGuild,
    "server",
    "تعديل إعدادات السيرفر",
    {
      "الاسم قبل": oldGuild.name || "غير معروف",
      "الاسم بعد": newGuild.name || "غير معروف"
    },
    0x1abc9c
  );
  await logByKey(
    newGuild,
    "edits",
    "تعديل إداري على السيرفر",
    {
      "الاسم قبل": oldGuild.name || "غير معروف",
      "الاسم بعد": newGuild.name || "غير معروف"
    },
    0x2980b9
  );
});

client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
  const sensitiveEvents = [
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.WebhookDelete,
    AuditLogEvent.WebhookUpdate,
    AuditLogEvent.BotAdd
  ];

  if (!sensitiveEvents.includes(entry.action)) return;
  const executor = entry.executor?.tag || "Unknown";
  const target = entry.target?.id || "Unknown";

  await logByKey(
    guild,
    "edits",
    "نشاط إداري حساس",
    {
      "المنفذ": executor,
      "الحدث": String(entry.action),
      "الهدف": target
    },
    0xf1c40f
  );

  if (entry.action === AuditLogEvent.BotAdd) {
    await logByKey(
      guild,
      "bots",
      "إضافة بوت عبر السجلات",
      {
        "المنفذ": executor,
        "الهدف": target
      },
      0xe67e22
    );
  }
});

if (!TOKEN) {
  console.error("Missing BOT_TOKEN in environment variables.");
  process.exit(1);
}

client.login(TOKEN);
