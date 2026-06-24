process.on('unhandledRejection', error => console.error('Unhandled Promise Rejection:', error));
require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    REST, Routes, SlashCommandBuilder
} = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const { createClient } = require('@supabase/supabase-js');
console.log(' Token exists:', !!process.env.DISCORD_TOKEN);
console.log('  Supabase URL exists:', !!process.env.SUPABASE_URL);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const express = require('express');

// --- SERVER PIN (For Render Keep-alive) ---
const app = express();
const port = process.env.SERVER_PORT || process.env.PORT || 30049;

app.get('/', (req, res) => res.send('Bot is Online!'));
app.get('/ping', (req, res) => res.send('Pong!'));

app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// --- LIVE SESSIONS TRACKER ---
const liveSessions = {}; // { userId: { username, scriptName, placeId, jobId, lastSeen } }

// Cleanup interval (Runs every 2 minutes, removes users inactive for > 2 mins)
setInterval(() => {
    const now = Date.now();
    for (const userId in liveSessions) {
        if (now - liveSessions[userId].lastSeen > 120000) {
            delete liveSessions[userId];
        }
    }
}, 120000);

app.post('/api/live/heartbeat', (req, res) => {
    const { userId, username, scriptName, placeId, jobId } = req.body;
    if (userId) {
        liveSessions[userId] = {
            username: username || "Unknown",
            scriptName: scriptName || "Unknown Script",
            placeId: placeId || 0,
            jobId: jobId || "",
            lastSeen: Date.now()
        };
    }
    res.sendStatus(200);
});

app.get('/api/admin/live', (req, res) => {
    const sessions = Object.values(liveSessions);
    res.json({
        total: sessions.length,
        users: sessions
    });
});

app.get('/api/admin/channels', (req, res) => {
    try {
        let guilds = [];
        client.guilds.cache.forEach(guild => {
            const textChannels = guild.channels.cache
                .filter(c => c.type === 0 || c.type === 5) // Text & Announcement
                .map(c => ({ id: c.id, name: c.name }));
            if (textChannels.length > 0) {
                guilds.push({ id: guild.id, name: guild.name, channels: textChannels });
            }
        });
        res.json(guilds);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/announce', async (req, res) => {
    try {
        const { channelId, embed, content, components } = req.body;
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.status(404).json({ error: 'Channel not found' });

        let messageOptions = { embeds: [embed] };
        if (content) messageOptions.content = content;

        if (components) {
            try {
                if (components[0] && components[0].components && components[0].components[0] && vonixeEmoji) {
                    components[0].components[0].emoji = { id: vonixeEmoji.id, name: vonixeEmoji.name };
                }
            } catch (err) { }
            messageOptions.components = components;
        }

        await channel.send(messageOptions);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sellauth/dynamic', async (req, res) => {
    // Gunakan URL ini di Sellauth Dynamic Product: 
    // https://domain-bot-kamu.com/api/sellauth/dynamic?duration=LIFETIME&secret=RAHASIA

    const secret = req.query.secret;
    if (secret !== (process.env.SELLAUTH_SECRET || 'vonixe123')) {
        return res.status(401).send('Unauthorized');
    }

    const durationInput = req.query.duration || 'LIFETIME';
    const cleanDurationStr = durationInput.toUpperCase();

    // Fungsi generateRandomString
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randStr = '';
    for (let i = 0; i < 12; i++) {
        randStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const licenseCode = `VONIXE-LIC-${cleanDurationStr}-` + randStr;

    const { error } = await supabase.from('hub_licenses').insert([{
        code: licenseCode,
        duration_days: 0
    }]);

    if (error) {
        console.error('Sellauth API Error:', error);
        return res.status(500).send("Error generating license");
    }

    // Response ini akan otomatis ditampilkan ke pembeli di Sellauth
    res.send(`License Code: ${licenseCode}\n\nHow to use:\n1. Join the Vonixe Discord Server\n2. Go to the Premium Panel channel\n3. Click Redeem Key and enter the code above.`);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates
    ],
    rest: {
        timeout: 10000
    }
});

client.on('error', err => console.error(`[DJS ERROR]`, err));

const rawToken = process.env.DISCORD_TOKEN || '';
const token = rawToken.replace(/\s/g, '');

let botConfig = {};
let vonixeEmoji = null;

function parseCustomDuration(durationStr) {
    if (!durationStr) return null;
    if (durationStr.toLowerCase() === 'lifetime') return 'LIFETIME';

    const regex = /^(\d+)(s|m|h|d|w|mo|y)$/i;
    const match = durationStr.match(regex);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const msPerUnit = {
        's': 1000,
        'm': 60000,
        'h': 3600000,
        'd': 86400000,
        'w': 604800000,
        'mo': 2592000000,
        'y': 31536000000
    };

    return amount * msPerUnit[unit];
}



function generateRandomString(length) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function queryWithTimeout(queryPromise, timeoutMs = 7000) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('⏱ Database timeout')), timeoutMs);
    });
    try {
        const result = await Promise.race([queryPromise, timeout]);
        clearTimeout(timer);
        return result;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

async function safeEditReply(interaction, content) {
    return new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('editReply timeout'));
        }, 8000);

        try {
            const result = await interaction['editReply'](content);
            clearTimeout(timer);
            resolve(result);
        } catch (err) {
            clearTimeout(timer);
            reject(err);
        }
    });
}


async function sendAuditLog(client, title, description, color = 0x00FF00) {
    try {
        const fs = require('fs');
        if (!fs.existsSync('logs_config.json')) return;
        const config = JSON.parse(fs.readFileSync('logs_config.json', 'utf8'));
        if (!config.channel_id) return;

        const channel = await client.channels.fetch(config.channel_id);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .setTimestamp();
            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error('[AuditLog] Failed to send log:', e.message);
    }
}

async function loadBotConfig() {

    try {
        const { data, error } = await supabase
            .from('hub_settings')
            .select('discord_announcement_channel, discord_ticket_category, discord_premium_category, discord_premium_role_id, discord_qr_image_url, roblox_loadstring_url, premium_key_price, premium_key_price_permanent, free_key_link')
            .single();

        if (data) botConfig = data;
        console.log(' Bot configuration loaded.');
    } catch (err) {
        console.error(' Failed to load bot config:', err.message);
    }
}

client.once('ready', async () => {

    // Auto-Purge Expired Keys Task (runs every 6 hours)
    setInterval(async () => {
        try {
            console.log('[Auto-Purge] Cleaning up expired keys...');
            const now = new Date().toISOString();

            // Delete expired Free Keys
            await supabase.from('active_keys').delete().lt('expires_at', now);
            await supabase.from('pending_free_keys').delete().lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // delete pending older than 24h

            // Delete expired Premium Keys
            await supabase.from('active_premium_keys').delete().lt('expires_at', now);

            console.log('[Auto-Purge] Cleanup complete.');
        } catch (e) {
            console.error('[Auto-Purge] Error:', e.message);
        }
    }, 6 * 60 * 60 * 1000); // 6 hours

    console.log(` Logged in as ${client.user.tag}!`);
    await loadBotConfig();

    // ✅ [GAG2] Start stock tracker after config is loaded
    startGAG2StockTracker();

    // --- LIVE PET TRACKER (Vonixe Hub Notification) ---
    const PET_CHANNEL_ID = '1519002671359459438';
    let lastPetCheck = new Date().toISOString();

    setInterval(async () => {
        try {
            const { data, error } = await supabase
                .from('pet_servers')
                .select('*')
                .gt('created_at', lastPetCheck)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[PetTracker] Fetch error:', error.message);
                return;
            }

            if (data && data.length > 0) {
                lastPetCheck = data[data.length - 1].created_at;
                const channel = await client.channels.fetch(PET_CHANNEL_ID).catch(() => null);
                if (!channel) return;

                for (const pet of data) {
                    const colorMap = {
                        'mythic': 16007990,     // Rose
                        'legendary': 16492312,  // Yellow
                        'super': 16711935,      // Magenta (Super)
                        'rare': 3901174,        // Blue
                        'uncommon': 1211977     // Emerald
                    };

                    const types = (pet.pet_type || '').split(/\s*,\s*/).filter(Boolean);
                    const rarities = (pet.rarity || '').split(/\s*,\s*/).filter(Boolean);
                    const prices = (pet.price || '').split(/\s*,\s*/).filter(Boolean);

                    for (let i = 0; i < types.length; i++) {
                        const singleType = types[i];
                        const singleRarity = rarities[i] || 'Common';
                        const singlePrice = prices[i] || 'Free';

                        let color = 10066329; // default gray
                        const r = singleRarity.toLowerCase();
                        if (r.includes('mythic')) color = colorMap['mythic'];
                        else if (r.includes('legendary')) color = colorMap['legendary'];
                        else if (r.includes('super')) color = colorMap['super'];
                        else if (r.includes('rare')) color = colorMap['rare'];
                        else if (r.includes('uncommon')) color = colorMap['uncommon'];

                        const PLACE_ID = '97598239454123';
                        const embed = new EmbedBuilder()
                            .setTitle('Vonixe Hub Pet Finder')
                            .addFields(
                                { name: 'Pet Name:', value: `\`\`\`${singleType}\`\`\``, inline: false },
                                { name: 'Players:', value: `\`\`\`${pet.people || '1/8'}\`\`\``, inline: false },
                                { name: 'PlaceId:', value: `\`\`\`${PLACE_ID}\`\`\``, inline: false },
                                { name: 'Jobid:', value: `\`\`\`${pet.job_id}\`\`\``, inline: false },
                                { name: 'Jobid (Mobile):', value: `${pet.job_id}`, inline: false }
                            )
                            .setColor(color)
                            .setFooter({ text: 'Vonixe Hub • Live Pet Tracker', iconURL: client.user?.displayAvatarURL() })
                            .setTimestamp();

                        await channel.send({ embeds: [embed] });
                        await new Promise(res => setTimeout(res, 1000)); // anti-rate limit
                    }
                    await new Promise(res => setTimeout(res, 1000)); // anti-rate limit
                }
            }
        } catch (e) {
            console.error('[PetTracker] Check loop error:', e.message);
        }
    }, 5000); // Check setiap 5 detik
    // --------------------------------------------------

    const commandsArray = [
        new SlashCommandBuilder()
            .setName('giveboost')
            .setDescription('Give a Premium Key to a Server Booster (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(option => option.setName('user').setDescription('The user who boosted').setRequired(true))
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Type of Boost')
                    .setRequired(true)
                    .addChoices(
                        { name: '1x Boost (Temporary)', value: 'BOOST' },
                        { name: '2x Boost (Lifetime)', value: 'LIFETIME' }
                    )
            ),
        new SlashCommandBuilder()
            .setName('setupsupport')
            .setDescription('Create a support ticket panel (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder()
            .setName('setuppremium')
            .setDescription('Create a premium purchase panel (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder()
            .setName('setuppanel')
            .setDescription('Create a self-service panel (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Type of panel')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Premium', value: 'premium' },
                        { name: 'Free', value: 'free' }
                    )
            ),
        new SlashCommandBuilder()
            .setName('qr')
            .setDescription('Show the payment QR code (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder()
            .setName('joinvoice')
            .setDescription('Join the voice channel (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addChannelOption(option => option.setName('channel').setDescription('Voice Channel').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setRequired(true)),
        new SlashCommandBuilder()
            .setName('leavevoice')
            .setDescription('Leave the voice channel (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder()
            .setName('givepremium')
            .setDescription('Generate a Premium License Code for a user (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(option => option.setName('user').setDescription('The user to give premium to').setRequired(true))
            .addStringOption(option =>
                option.setName('duration')
                    .setDescription('e.g., 100s, 10h, 30d, 1mo, lifetime')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('editkey')
            .setDescription('Edit duration of an existing key (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addStringOption(option => option.setName('key').setDescription('The key string to edit').setRequired(true))
            .addStringOption(option =>
                option.setName('action')
                    .setDescription('Add time or set total time?')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Add Time', value: 'ADD' },
                        { name: 'Set Exact Time', value: 'SET' }
                    )
            )
            .addStringOption(option => option.setName('duration').setDescription('e.g., 10h, 30d, lifetime').setRequired(true)),
        new SlashCommandBuilder()
            .setName('checkkey')
            .setDescription('Check the status of a key (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addStringOption(option => option.setName('key').setDescription('The key string to check').setRequired(true)),
        new SlashCommandBuilder()
            .setName('revokekey')
            .setDescription('Delete a key permanently (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addStringOption(option => option.setName('key').setDescription('The key string to delete').setRequired(true)),
        new SlashCommandBuilder()
            .setName('resetuser')
            .setDescription('Reset HWID binding for a key (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addStringOption(option => option.setName('key').setDescription('The key string to reset').setRequired(true)),
        new SlashCommandBuilder()
            .setName('cleanchannels')
            .setDescription('Hapus semua channel raid (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder()
            .setName('unbanall')
            .setDescription('Unban semua member yang di-ban saat raid (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log('Started refreshing application (/) commands.');
        for (const [guildId] of client.guilds.cache) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: commandsArray },
            );
        }
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error reloading commands:', error);
    }
});

// 1. Auto-Responder
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.toLowerCase();

    const keywords = ['getkey', 'cara get key', 'dimana key', 'buy premium', 'bantuan', 'tutor', 'bug', 'error', 'help', 'support', 'premium'];
    if (keywords.some(k => content.includes(k))) {
        const embed = new EmbedBuilder()
            .setTitle(' Vonixe Hub - Community Navigation ')
            .setDescription('**[ID]** Halo! Berikut adalah panduan cepat untuk akses Vonixe Hub:\n**[EN]** Hello! Here is a quick guide to access Vonixe Hub:')
            .addFields(
                { name: ' Get Key', value: '**[ID]** Kunjungi <#1483881102127927477>\n**[EN]** Visit <#1483881102127927477>', inline: true },
                { name: ' Support/Bug', value: '**[ID]** Buat tiket di <#1395413976925339730>\n**[EN]** Open a ticket at <#1395413976925339730>', inline: true },
                { name: ' Buy Premium', value: '**[ID]** Info di <#1487160999189549086>\n**[EN]** Info at <#1487160999189549086>', inline: true }
            )
            .setColor(0xffa000)
            .setFooter({ text: 'Gunakan tombol di channel terkait untuk respon cepat. / Use the buttons in the respective channels for a quick response.' });

        return message.reply({ embeds: [embed] });
    }
});

// 2. Interaction Listener (Slash Commands)
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = interaction.commandName;

            if (!interaction.member || !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({ content: '[ID] Anda tidak memiliki izin. / [EN] You do not have permission.', flags: 64 });
            }

            // AUTO GUILD LOCK: Prevent exploiters from using commands in their own servers
            if (botConfig.discord_announcement_channel) {
                const homeGuild = client.guilds.cache.find(g => g.channels.cache.has(botConfig.discord_announcement_channel));
                if (homeGuild && interaction.guildId !== homeGuild.id) {
                    return await interaction.reply({ content: '[ID] Bot hanya bisa menerima perintah di Official Server! / [EN] Bot can only receive commands in the Official Server!', flags: 64 });
                }
            }

            if (command === 'setupsupport') {
                const embed = new EmbedBuilder()
                    .setTitle(' Vonixe Support Center ')
                    .setDescription('**[ID]** Butuh bantuan, laporan bug, atau pertanyaan seputar script? Klik tombol di bawah ini untuk membuat tiket bantuan.\n\n**[EN]** Need help, want to report a bug, or have questions about the script? Click the button below to open a support ticket.')
                    .setColor(0x0099ff);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_ticket_support').setLabel('Create Support Ticket').setStyle(ButtonStyle.Primary)
                );

                await interaction.channel.send({ embeds: [embed], components: [row] });
                return await interaction.reply({ content: '[ID] Panel Support dibuat. / [EN] Support Panel created.', flags: 64 });
            }

            if (command === 'setuppremium') {
                await loadBotConfig();
                const price30 = botConfig.premium_key_price || '10.000';
                const pricePerm = botConfig.premium_key_price_permanent || '20.000';

                const embed = new EmbedBuilder()
                    .setTitle(' VIP SCRIPT ')
                    .setDescription(`Price: IDR ${pricePerm} expired: permanen\nPrice: IDR ${price30} expired: 7 hari\n\n1. Transfer sesuai nominal & bukti\n2. Tunggu admin membalas (jangan spam)\n3. save key setelah admin mengirim key\n\n---\n**[EN]**\nPrice: IDR ${pricePerm} (Lifetime)\nPrice: IDR ${price30} (7 Days)\n\n1. Transfer the exact amount & send proof\n2. Wait for admin response (do not spam)\n3. Save your key after admin sends it`)
                    .setColor(0xffa000);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_ticket_premium').setLabel('Buy / Renew Premium').setStyle(ButtonStyle.Success)
                );

                await interaction.channel.send({ embeds: [embed], components: [row] });
                return await interaction.reply({ content: '[ID] Panel Premium dibuat. / [EN] Premium Panel created.', flags: 64 });
            }

            if (command === 'setuppanel') {
                const type = interaction.options.getString('type');
                if (type === 'premium') {
                    const embed = new EmbedBuilder()
                        .setTitle(' Vonixe Premium Panel ')
                        .setDescription('**[ID]** Kelola akses script Vonixe Hub Premium kamu. Gunakan tombol di bawah untuk Redeem Key, mendapatkan Script, atau Claim Role.\n\n**[EN]** Manage your script access for Vonixe Hub Premium. Use the buttons below to redeem your key, get the script, or grab your role.')
                        .setImage('https://i.imgur.com/buvIdbn.gif')
                        .setColor(0x50dc78);

                    const row1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_redeem_premium').setLabel('Redeem Key').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('btn_get_script').setLabel('Get Script').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_get_script_mobile').setLabel('Mobile').setStyle(ButtonStyle.Secondary)
                    );

                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_reset_hwid').setLabel('Reset HWID').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('btn_get_stats').setLabel('Get Stats').setStyle(ButtonStyle.Secondary)
                    );

                    await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
                    return await interaction.reply({ content: '[ID] Panel Premium dibuat. / [EN] Premium Panel created.', flags: 64 });
                }

                if (type === 'free') {
                    const embed = new EmbedBuilder()
                        .setTitle(' Vonixe Free Key ')
                        .setDescription('**[ID]** Dapatkan akses 24 Jam gratis ke Vonixe Hub dengan melewati checkpoint. Klik tombol di bawah ini!\n\n**[EN]** Get free 24-hour access to Vonixe Hub by completing a checkpoint. Click the button below!')
                        .setImage('https://i.imgur.com/buvIdbn.gif')
                        .setColor(0x0099ff);

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_get_free_key').setLabel('Get Key').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('btn_claim_free_key').setLabel('Claim Key').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('btn_get_script_free').setLabel('Get Script').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_get_script_mobile_free').setLabel('Mobile').setStyle(ButtonStyle.Secondary)
                    );

                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_reset_hwid_free').setLabel('Reset HWID').setStyle(ButtonStyle.Danger)
                    );

                    await interaction.channel.send({ embeds: [embed], components: [row, row2] });
                    return await interaction.reply({ content: '[ID] Panel Gratis dibuat. / [EN] Free Panel created.', flags: 64 });
                }
            }

            if (command === 'qr') {
                await loadBotConfig();
                const qrUrl = botConfig.discord_qr_image_url;
                if (!qrUrl) return await interaction.reply({ content: '[ID] QR Image belum dikonfigurasi. / [EN] QR Image not configured.', flags: 64 });

                const embed = new EmbedBuilder()
                    .setTitle(' QR Pembayaran / Payment QR ')
                    .setDescription('**[ID]** Scan QR di bawah ini untuk memproses pembayaran Anda.\n**[EN]** Scan the QR below to process your payment.')
                    .setImage(qrUrl)
                    .setColor(0x00ff00)
                    .setFooter({ text: 'Mohon kirim bukti transfer ke tiket / Please send payment proof to the ticket' });

                await interaction.channel.send({ embeds: [embed] });
                return await interaction.reply({ content: '[ID] QR Code ditampilkan. / [EN] QR Code displayed.', flags: 64 });
            }

            if (command === 'joinvoice') {
                const voiceChannel = interaction.options.getChannel('channel');
                try {
                    joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: interaction.guild.id,
                        adapterCreator: interaction.guild.voiceAdapterCreator,
                        selfDeaf: false,
                        selfMute: true,
                    });
                    return await interaction.reply({ content: ` Berhasil masuk ke Voice Channel <#${voiceChannel.id}> dan idle 24/7.`, flags: 64 });
                } catch (err) {
                    console.error('Voice Join Error:', err);
                    return await interaction.reply({ content: ` Gagal masuk ke Voice Channel: ${err.message}`, flags: 64 });
                }
            }

            if (command === 'leavevoice') {
                const connection = getVoiceConnection(interaction.guild.id);
                if (!connection) return await interaction.reply({ content: '[ID] Bot tidak di Voice Channel. / [EN] Bot is not in any Voice Channel.', flags: 64 });
                connection.destroy();
                return await interaction.reply({ content: '[ID] Berhasil keluar dari Voice Channel. / [EN] Successfully left Voice Channel.', flags: 64 });
            }

            if (command === 'giveboost') {
                console.log(`[DEBUG giveboost] Command received from ${interaction.user.tag}`);
                const targetUser = interaction.options.getMember('user');
                const boostType = interaction.options.getString('type');

                if (!targetUser) {
                    return await interaction.reply({ content: '[ID] User tidak valid! / [EN] Invalid user!', flags: 64 });
                }

                const newKeyStr = 'VONIXE-PREM-' + generateRandomString(12);
                let expiresAt = boostType === 'LIFETIME' ? null : '8888-08-08T08:08:08.000Z';

                console.log(`[DEBUG giveboost] Inserting key into hub_keys...`);
                const { error: insertError } = await supabase.from('hub_keys').insert([{
                    key_string: newKeyStr,
                    type: 'PREMIUM',
                    discord_id: targetUser.id,
                    discord_username: targetUser.user.username,
                    expires_at: expiresAt
                }]);

                if (insertError) {
                    console.error(`[DEBUG giveboost] Supabase Error:`, insertError);
                    return await interaction.reply({ content: `[ID] Gagal membuat Boost Key: ${insertError.message} / [EN] Failed to create Boost Key: ${insertError.message}` });
                }

                let roleMsgID = '';
                let roleMsgEN = '';
                if (botConfig.discord_premium_role_id) {
                    try {
                        console.log(`[DEBUG giveboost] Adding premium role...`);
                        await targetUser.roles.add(botConfig.discord_premium_role_id);
                        roleMsgID = '\n[ Role Premium ditambahkan ]';
                        roleMsgEN = '\n[ Premium Role added ]';
                    } catch (e) {
                        console.log(`[DEBUG giveboost] Failed to add role:`, e.message);
                        roleMsgID = '\n[ Gagal memberi role ]';
                        roleMsgEN = '\n[ Failed to add role ]';
                    }
                }

                const dmEmbed = new EmbedBuilder()
                    .setTitle('Thanks for Boosting Vonixe!')
                    .setDescription(`[ID] Kamu mendapatkan akses Premium Script!\n[EN] You got Premium Script access!\n\n**Key:**\n\`${newKeyStr}\`\n\n**Duration:** ${boostType === 'LIFETIME' ? 'Lifetime' : 'While Boosting'}\n\n[ID] Gunakan key ini di executor kamu. Jangan bagikan ke siapapun!\n[EN] Use this key in your executor. Do not share it!`)
                    .setColor(0xffa000)
                    .setTimestamp();

                let dmMsgID = '';
                let dmMsgEN = '';
                try {
                    await targetUser.send({ embeds: [dmEmbed] });
                    dmMsgID = '\n[ DM terkirim ]';
                    dmMsgEN = '\n[ DM sent ]';
                } catch (e) {
                    dmMsgID = '\n[ Gagal DM user ]';
                    dmMsgEN = '\n[ Failed to DM user ]';
                }

                await sendAuditLog(interaction.client, ' Server Boost Key Created', `**Admin:** <@${interaction.user.id}>\n**Target User:** <@${targetUser.id}>\n**Key:** \`${newKeyStr}\`\n**Type:** ${boostType}`, 0xffa000);
                await interaction.reply({ content: `[ID] Sukses memberikan Boost Key! <@${targetUser.id}>${roleMsgID}${dmMsgID}\n\n[EN] Successfully gave Boost Key! <@${targetUser.id}>${roleMsgEN}${dmMsgEN}` });
                return;
            }

            if (command === 'givepremium') {
                console.log(`[DEBUG giveprem] Command received from ${interaction.user.tag}`);
                const targetUser = interaction.options.getMember('user');
                const durationInput = interaction.options.getString('duration');
                console.log(`[DEBUG giveprem] targetUser: ${targetUser ? targetUser.id : 'null'}, duration: ${durationInput}`);

                const parsedMs = parseCustomDuration(durationInput);
                if (!parsedMs) {
                    console.log(`[DEBUG giveprem] Invalid duration format`);
                    return await interaction.reply({ content: '[ID] Format durasi salah! / [EN] Invalid duration format!' });
                }

                const cleanDurationStr = durationInput.toUpperCase();
                const licenseCode = `VONIXE-LIC-${cleanDurationStr}-` + generateRandomString(12);

                console.log(`[DEBUG giveprem] Inserting into Supabase...`);
                const { error } = await supabase.from('hub_licenses').insert([{
                    code: licenseCode,
                    duration_days: 0
                }]);

                if (error) {
                    console.error(`[DEBUG giveprem] Supabase Error:`, error);
                    return await interaction.reply({ content: `[ID] Gagal membuat License Code: ${error.message} / [EN] Failed to create License Code: ${error.message}` });
                }

                console.log(`[DEBUG giveprem] Supabase insert successful! Building embed...`);

                const embed = new EmbedBuilder()
                    .setTitle(' License Code Berhasil Dibuat ')
                    .setDescription(`License Code untuk <@${targetUser ? targetUser.id : 'Unknown'}> telah dibuat.\nSilakan tukar kode ini menjadi Key di Premium Panel.`)
                    .addFields(
                        { name: '  User', value: `${targetUser ? targetUser.user.username : 'Unknown'} (${targetUser ? targetUser.id : 'Unknown'})` },
                        { name: ' License Code', value: `\`${licenseCode}\`` },
                        { name: ' Durasi', value: cleanDurationStr }
                    )
                    .setColor(0x50dc78)
                    .setTimestamp()
                    .setFooter({ text: 'Vonixe Hub Premium' });

                let roleMsg = '';
                if (botConfig.discord_premium_role_id && targetUser) {
                    try {
                        console.log(`[DEBUG giveprem] Adding role...`);
                        await targetUser.roles.add(botConfig.discord_premium_role_id);
                        roleMsg = '\n Role Premium telah diberikan otomatis kepada user tersebut.';
                    } catch (e) {
                        console.log(`[DEBUG giveprem] Failed to add role:`, e.message);
                        roleMsg = '\n (Gagal memberi role: bot kurang izin)';
                    }
                }

                console.log(`[DEBUG giveprem] Sending reply...`);
                await sendAuditLog(interaction.client, '? Premium License Created', `**Admin:** <@${interaction.user.id}>\n**Target User:** ${targetUser ? '<@' + targetUser.id + '>' : 'None'}\n**License Code:** \`${licenseCode}\`\n**Duration Input:** ${durationInput}`, 0x00FF00);
                await interaction.reply({ content: `[ID] Pembuatan License selesai! <@${targetUser ? targetUser.id : ''}> / [EN] License creation complete! <@${targetUser ? targetUser.id : ''}>${roleMsg}`, embeds: [embed] });
                console.log(`[DEBUG giveprem] Done!`);
                return;
            }

            if (command === 'checkkey') {
                const keyToCheck = interaction.options.getString('key');
                const { data, error } = await supabase.from('hub_keys').select('*').eq('key_string', keyToCheck).single();

                if (error || !data) return await interaction.reply({ content: `[ID] Key tidak ditemukan. / [EN] Key not found in database.`, flags: 64 });

                const embed = new EmbedBuilder()
                    .setTitle(' Key Information ')
                    .addFields(
                        { name: 'Key String', value: `\`${data.key_string}\`` },
                        { name: 'Type', value: data.type, inline: true },
                        { name: 'Roblox Username', value: data.roblox_username || 'Unknown', inline: true },
                        { name: 'HWID Status', value: data.hwid ? 'Bound' : 'Not Bound', inline: true },
                        { name: 'Expires At', value: data.expires_at ? new Date(data.expires_at).toLocaleString() : 'Lifetime' }
                    )
                    .setColor(0x0099ff);

                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (command === 'editkey') {
                const keyToEdit = interaction.options.getString('key');
                const action = interaction.options.getString('action');
                const durationInput = interaction.options.getString('duration');

                const parsedMs = parseCustomDuration(durationInput);
                if (!parsedMs) {
                    return await interaction.reply({ content: '[ID] Format durasi salah! / [EN] Invalid duration format!', flags: 64 });
                }

                const { data: keyData, error: keyError } = await supabase.from('hub_keys').select('*').eq('key_string', keyToEdit).single();
                if (keyError || !keyData) return await safeEditReply(interaction, `[ID] Key \`${keyToEdit}\` tidak ditemukan di database. / [EN] Key \`${keyToEdit}\` not found in database.`);

                let newExpiresAt = null;
                if (parsedMs !== 'LIFETIME') {
                    if (action === 'ADD') {
                        let currentExpiryTime = keyData.expires_at ? new Date(keyData.expires_at).getTime() : Date.now();
                        if (currentExpiryTime < Date.now()) currentExpiryTime = Date.now();
                        newExpiresAt = new Date(currentExpiryTime + parsedMs).toISOString();
                    } else if (action === 'SET') {
                        newExpiresAt = new Date(Date.now() + parsedMs).toISOString();
                    }
                } else {
                    newExpiresAt = null;
                }

                const { error: updateError } = await supabase.from('hub_keys').update({ expires_at: newExpiresAt }).eq('key_string', keyToEdit);
                if (updateError) return await interaction.reply({ content: `[ID] Gagal mengupdate key: ${updateError.message} / [EN] Failed to update key: ${updateError.message}`, flags: 64 });

                const embed = new EmbedBuilder()
                    .setTitle(' Key Updated Successfully')
                    .addFields(
                        { name: 'Key', value: `\`${keyToEdit}\`` },
                        { name: 'Action', value: action },
                        { name: 'Input Duration', value: durationInput },
                        { name: 'New Expiration', value: newExpiresAt ? new Date(newExpiresAt).toLocaleString() : 'LIFETIME' }
                    )
                    .setColor(0x00ff64);
                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (command === 'revokekey') {
                const keyToRevoke = interaction.options.getString('key');
                const { error } = await supabase.from('hub_keys').delete().eq('key_string', keyToRevoke);
                if (error) return await interaction.reply({ content: `[ID] Gagal menghapus key: ${error.message} / [EN] Failed to delete key: ${error.message}`, flags: 64 });
                return await safeEditReply(interaction, `[ID] Key \`${keyToRevoke}\` berhasil dihapus secara permanen. / [EN] Key \`${keyToRevoke}\` successfully deleted permanently.`);
            }

            if (command === 'resetuser') {
                const keyToReset = interaction.options.getString('key');
                const { error } = await supabase.from('hub_keys').update({ hwid: null }).eq('key_string', keyToReset);
                if (error) return await interaction.reply({ content: `[ID] Gagal mereset HWID: ${error.message} / [EN] Failed to reset HWID: ${error.message}`, flags: 64 });
                return await safeEditReply(interaction, `[ID] Berhasil! HWID binding untuk key \`${keyToReset}\` telah di-reset. / [EN] Success! HWID binding for key \`${keyToReset}\` has been reset.`);
            }


            if (command === 'setuplogs') {
                const fs = require('fs');
                fs.writeFileSync('logs_config.json', JSON.stringify({ channel_id: interaction.channelId }));
                return await interaction.reply({ content: '[ID] Channel ini berhasil diset sebagai Log Channel! / [EN] Channel set as Log Channel!', flags: 64 });
            }

            if (command === 'mykey') {
                await interaction.deferReply({ flags: 64 });
                const userId = interaction.user.id;

                // Check Premium
                const { data: premKeys } = await supabase.from('active_premium_keys').select('*').eq('discord_id', userId);
                // Check Free
                const { data: freeKeys } = await supabase.from('active_keys').select('*').eq('discord_id', userId);

                if ((!premKeys || premKeys.length === 0) && (!freeKeys || freeKeys.length === 0)) {
                    return await interaction.editReply({ content: '[ID] Kamu tidak memiliki key yang aktif saat ini. / [EN] You do not have any active keys.' });
                }

                let desc = '';
                if (premKeys && premKeys.length > 0) {
                    desc += '**? PREMIUM KEYS**\n';
                    premKeys.forEach(k => {
                        const isBoost = k.expires_at && k.expires_at.startsWith('8888');
                        const expired = !k.expires_at ? 'Lifetime' : isBoost ? 'Active Boost' : `<t:${Math.floor(new Date(k.expires_at).getTime() / 1000)}:R>`;
                        desc += `Key: ` + `${k.key_string}` + `\nHWID: ${k.hwid || 'Belum di-bind'}\nExpired: ${expired}\n\n`;
                    });
                }
                if (freeKeys && freeKeys.length > 0) {
                    desc += '**? FREE KEYS**\n';
                    freeKeys.forEach(k => {
                        desc += `Key: ` + `${k.key_string}` + `\nHWID: ${k.hwid || 'Belum di-bind'}\nExpired: <t:${Math.floor(new Date(k.expires_at).getTime() / 1000)}:R>\n\n`;
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle('? Status Key Kamu')
                    .setDescription(desc)
                    .setColor(0x00FF00);

                return await interaction.editReply({ embeds: [embed] });
            }

            if (command === 'cleanchannels') {

                await interaction.reply({ content: '[ID] Menghapus channel spam... / [EN] Deleting spam channels...', flags: 64 });
                const channels = interaction.guild.channels.cache.filter(c => c.name.toLowerCase().includes('raided') || c.name.toLowerCase().includes('sky'));
                if (channels.size === 0) return await interaction.followUp({ content: '[ID] Tidak ada channel raid. / [EN] No raid channels found.', flags: 64 });

                let count = 0;
                for (const [id, channel] of channels) {
                    try {
                        await channel.delete();
                        count++;
                        await new Promise(r => setTimeout(r, 400));
                    } catch (e) { }
                }
                await interaction.followUp({ content: `[ID] Selesai menghapus ${count} channel. / [EN] Finished deleting ${count} channels.`, flags: 64 });
                return;
            }

            if (command === 'unbanall') {
                await interaction.reply({ content: '[ID] Memulai unban massal... / [EN] Starting mass unban...', flags: 64 });
                try {
                    const bans = await interaction.guild.bans.fetch();
                    if (bans.size === 0) return await interaction.followUp({ content: '[ID] Tidak ada member yang di-ban. / [EN] No banned members.', flags: 64 });

                    let count = 0;
                    for (const [id, ban] of bans) {
                        try {
                            await interaction.guild.bans.remove(id, 'Unban massal pasca raid');
                            count++;
                            await new Promise(r => setTimeout(r, 400));
                        } catch (e) { }
                    }
                    await interaction.followUp({ content: `[ID] Berhasil unban ${count} member. / [EN] Successfully unbanned ${count} members.`, flags: 64 });
                } catch (err) {
                    await interaction.followUp({ content: `[ID] Error: ${err.message} / [EN] Error: ${err.message}`, flags: 64 });
                }
                return;
            }
        }
    } catch (err) {
        console.error('Interaction/Modal Error:', err);
        const errMsg = String(err.message || err).substring(0, 1500);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.reply({ content: `[ID] Error: ${errMsg} / [EN] Error: ${errMsg}`, flags: 64 });
            } else {
                await interaction.reply({ content: `[ID] Error: ${errMsg} / [EN] Error: ${errMsg}`, flags: 64 });
            }
        } catch (replyErr) {
            console.error('Failed to send error reply:', replyErr.message);
        }
    }
});

// 3. Interaction Listener (Buttons & Modals)
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton()) {
            const userId = interaction.user.id;
            const userName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');

            if (interaction.customId === 'create_ticket_support') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_support_ticket')
                    .setTitle('Support Ticket Form');

                const scriptInput = new TextInputBuilder()
                    .setCustomId('ticket_script_name')
                    .setLabel('Script Name?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. IndoStrike')
                    .setRequired(true);

                const issueInput = new TextInputBuilder()
                    .setCustomId('ticket_issue_summary')
                    .setLabel('What is the issue?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. Cannot load / Key error')
                    .setRequired(true);

                const descInput = new TextInputBuilder()
                    .setCustomId('ticket_issue_desc')
                    .setLabel('Detail the bug/issue')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Explain in detail here...')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(scriptInput),
                    new ActionRowBuilder().addComponents(issueInput),
                    new ActionRowBuilder().addComponents(descInput)
                );

                await interaction.showModal(modal);
            }

            if (interaction.customId === 'create_ticket_premium') {
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_premium_type')
                        .setPlaceholder('Select Premium Service...')
                        .addOptions(
                            new StringSelectMenuOptionBuilder().setLabel('Buy New Premium').setDescription('Beli durasi baru / Buy new duration').setValue('buy_premium')
                            ,
                            new StringSelectMenuOptionBuilder().setLabel('Renew Premium').setDescription('Perpanjang durasi / Renew existing duration').setValue('renew_premium')

                        )
                );

                await interaction.reply({
                    content: '[ID] Pilih layanan yang diinginkan: / [EN] Select the desired service:',
                    components: [row],
                    flags: 64
                });
            }

            if (interaction.customId === 'close_ticket') {
                await interaction.reply({ content: '[ID] Tiket akan ditutup dalam 5 detik... / [EN] Ticket will be closed in 5 seconds...' });
                setTimeout(() => interaction.channel.delete().catch(e => console.error(' Delete Error:', e)), 5000);
            }

            if (interaction.customId === 'btn_claim_free_key') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_claim_free_key')
                    .setTitle('Claim Free Key');

                const keyInput = new TextInputBuilder()
                    .setCustomId('claim_key_input')
                    .setLabel('Paste your key here')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('VONIXE-FREE-...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_get_free_key') {
                await loadBotConfig();
                const freeLink = (botConfig.free_key_link || 'https://vonixehub.my.id/getkey').replace('#getkey', 'getkey');
                const embed = new EmbedBuilder()
                    .setTitle(' Get Free Key ')
                    .setDescription(`**[ID]** Silakan selesaikan checkpoint melalui link berikut untuk mendapatkan key gratis 24 jam:\n\n**[EN]** Please complete the checkpoint through the link below to get your free 24-hour key:\n\n  **[Click Here to Get Free Key](${freeLink})**`)
                    .setColor(0x0099ff);
                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (interaction.customId === 'btn_get_script_free') {
                await loadBotConfig();
                const loadstringUrl = botConfig.roblox_loadstring_url || 'https://raw.githubusercontent.com/SCombat282/vonixehub/refs/heads/main/bootstrapper.lua';
                const embed = new EmbedBuilder()
                    .setTitle('Loader Script')
                    .setDescription('Copy and paste this script into your executor:\n\n```lua\nloadstring(game:HttpGet("' + loadstringUrl + '"))()\n```')
                    .setColor(0x0099ff);
                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (interaction.customId === 'btn_get_script_mobile_free') {
                await loadBotConfig();
                const loadstringUrl = botConfig.roblox_loadstring_url || 'https://raw.githubusercontent.com/SCombat282/vonixehub/refs/heads/main/bootstrapper.lua';
                const code = `loadstring(game:HttpGet("${loadstringUrl}"))()`;
                return await interaction.reply({ content: code, flags: 64 });
            }

            if (interaction.customId === 'btn_reset_hwid_free') {
                let keys, error;
                try {
                    const result = await queryWithTimeout(
                        supabase
                            .from('hub_keys')
                            .select('*')
                            .eq('discord_id', userId)
                            .eq('type', 'FREE')
                            .order('created_at', { ascending: false })
                    );
                    keys = result.data;
                    error = result.error;
                } catch (timeoutErr) {
                    return await interaction.reply({ content: '[ID] Database lambat, coba lagi sebentar. / [EN] Database slow, try again shortly.', flags: 64 });
                }

                if (error || !keys || keys.length === 0) {
                    return await interaction.reply({ content: '[ID] Kamu belum memiliki Free Key. / [EN] You do not have a Free Key yet.', flags: 64 });
                }

                const activeKey = keys[0];
                const now = new Date();
                let canReset = true;
                let remainingHours = 0;

                if (activeKey.last_hwid_reset) {
                    const lastReset = new Date(activeKey.last_hwid_reset);
                    const diffTime = Math.abs(now - lastReset);
                    const diffHours = diffTime / (1000 * 60 * 60);
                    if (diffHours < 2) {
                        canReset = false;
                        remainingHours = (2 - diffHours).toFixed(1);
                    }
                }

                if (!canReset) {
                    return await interaction.reply({ content: `[ID] Masih cooldown. Tunggu **${remainingHours} jam**. / [EN] Still on cooldown. Wait **${remainingHours} hours**.`, flags: 64 });
                }

                const newCount = (activeKey.reset_count || 0) + 1;
                const { error: resetError } = await supabase.from('hub_keys').update({
                    hwid: null,
                    last_hwid_reset: now.toISOString(),
                    reset_count: newCount
                }).eq('key_string', activeKey.key_string);

                if (resetError) return await interaction.reply({ content: `[ID] Gagal mereset: ${resetError.message} / [EN] Failed to reset: ${resetError.message}`, flags: 64 });
                return await interaction.reply({ content: '[ID] HWID Free berhasil di-reset! / [EN] Free HWID successfully reset!', flags: 64 });
            }

            if (interaction.customId === 'btn_redeem_premium') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_redeem_premium')
                    .setTitle('Redeem Premium License');

                const codeInput = new TextInputBuilder()
                    .setCustomId('license_code')
                    .setLabel('License Code')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('VONIXE-LIC-XXXXXX')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
                await interaction.showModal(modal);
            }

            if (['btn_get_script', 'btn_get_script_mobile', 'btn_get_role', 'btn_reset_hwid', 'btn_get_stats'].includes(interaction.customId)) {
                let keys, error;
                try {
                    const result = await queryWithTimeout(
                        supabase
                            .from('hub_keys')
                            .select('*')
                            .eq('discord_id', userId)
                            .eq('type', 'PREMIUM')
                            .order('created_at', { ascending: false })
                    );
                    keys = result.data;
                    error = result.error;
                } catch (timeoutErr) {
                    return await interaction.reply({
                        content: ' Database lambat, coba lagi sebentar. / Database slow, try again shortly.'
                        , flags: 64
                    });
                }

                if (error || !keys || keys.length === 0) {
                    return await interaction.reply({ content: '[ID] Kamu belum memiliki Premium Key. / [EN] You do not have a Premium Key yet.', flags: 64 });
                }

                const activeKey = keys[0];

                if (interaction.customId === 'btn_get_script') {
                    const loadstringUrl = botConfig.roblox_loadstring_url || 'https://raw.githubusercontent.com/SCombat282/vonixehub/refs/heads/main/bootstrapper.lua';
                    const embed = new EmbedBuilder()
                        .setTitle('Loader Script')
                        .setDescription('Copy and paste this script into your executor:\n\n```lua\ngetgenv().script_key="' + activeKey.key_string + '";\nloadstring(game:HttpGet("' + loadstringUrl + '"))()\n```\n\n **Don\'t share your key or script with anyone else!**')
                        .setColor(0x50dc78);
                    return await interaction.reply({ embeds: [embed], flags: 64 });
                }

                if (interaction.customId === 'btn_get_script_mobile') {
                    const loadstringUrl = botConfig.roblox_loadstring_url || 'https://raw.githubusercontent.com/SCombat282/vonixehub/refs/heads/main/bootstrapper.lua';
                    const code = `getgenv().script_key="${activeKey.key_string}";\nloadstring(game:HttpGet("${loadstringUrl}"))()`;
                    return await interaction.reply({ content: code, flags: 64 });
                }

                if (interaction.customId === 'btn_get_role') {
                    if (botConfig.discord_premium_role_id) {
                        try {
                            const member = await interaction.guild.members.fetch(userId);
                            await member.roles.add(botConfig.discord_premium_role_id);
                            return await interaction.reply({ content: '[ID] Role Premium berhasil diberikan! / [EN] Premium Role successfully granted!', flags: 64 });
                        } catch (err) {
                            return await interaction.reply({ content: '[ID] Gagal memberikan role. / [EN] Failed to grant role.', flags: 64 });
                        }
                    } else {
                        return await interaction.reply({ content: '[ID] Premium Role ID belum di-setup. / [EN] Premium Role ID not setup.', flags: 64 });
                    }
                }

                if (interaction.customId === 'btn_reset_hwid') {
                    const now = new Date();
                    let canReset = true;
                    let remainingHours = 0;

                    if (activeKey.last_hwid_reset) {
                        const lastReset = new Date(activeKey.last_hwid_reset);
                        const diffTime = Math.abs(now - lastReset);
                        const diffHours = diffTime / (1000 * 60 * 60);
                        if (diffHours < 12) {
                            canReset = false;
                            remainingHours = (12 - diffHours).toFixed(1);
                        }
                    }

                    if (!canReset) {
                        return await interaction.reply({ content: `[ID] Masih cooldown. Tunggu **${remainingHours} jam**. / [EN] Still on cooldown. Wait **${remainingHours} hours**.`, flags: 64 });
                    }

                    const newCount = (activeKey.reset_count || 0) + 1;
                    const { error: resetError } = await supabase.from('hub_keys').update({
                        hwid: null,
                        last_hwid_reset: now.toISOString(),
                        reset_count: newCount
                    }).eq('key_string', activeKey.key_string);

                    if (resetError) return await interaction.reply({ content: `[ID] Gagal mereset: ${resetError.message} / [EN] Failed to reset: ${resetError.message}`, flags: 64 });
                    return await interaction.reply({ content: '[ID] HWID berhasil di-reset! / [EN] HWID successfully reset!', flags: 64 });
                }

                if (interaction.customId === 'btn_get_stats') {
                    const hwidStr = activeKey.hwid ? 'Bound' : 'Not Bound';
                    const expiresStr = activeKey.expires_at ? new Date(activeKey.expires_at).toLocaleString() : 'Never';
                    const lastResetStr = activeKey.last_hwid_reset ? new Date(activeKey.last_hwid_reset).toLocaleString() : 'Never';

                    const embed = new EmbedBuilder()
                        .setTitle('Your Key Statistics')
                        .addFields(
                            { name: 'HWID Status', value: hwidStr, inline: true },
                            { name: 'Roblox Username', value: activeKey.roblox_username || 'Unknown', inline: true },
                            { name: 'Key', value: `\`${activeKey.key_string}\`` },
                            { name: 'Total HWID Resets', value: `${activeKey.reset_count || 0}`, inline: true },
                            { name: 'Last Reset', value: lastResetStr, inline: true },
                            { name: 'Expires At', value: expiresStr }
                        )
                        .setThumbnail(interaction.user.displayAvatarURL())
                        .setColor(0x0099ff);

                    return await interaction.reply({ embeds: [embed], flags: 64 });
                }
            }
        }

        // Handle Selection Menu
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_premium_type') {
                await interaction.deferUpdate();
                const choice = interaction.values[0];
                const userName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
                const categoryId = botConfig.discord_premium_category || botConfig.discord_ticket_category;

                let prefix = 'premium';
                let title = 'Buy Premium';

                if (choice === 'renew_premium') {
                    prefix = 'perpanjang';
                    title = 'Renew Premium';
                }

                const channelName = `${prefix}-${userName}`;
                await createTicketChannel(interaction, channelName, categoryId, title);
            }
        }

        // Handle Modal Submission
        if (interaction.isModalSubmit()) {

            if (interaction.customId === 'modal_claim_free_key') {

                const keyString = interaction.fields.getTextInputValue('claim_key_input').trim();

                if (!keyString.startsWith('VONIXE-FREE-')) {
                    return await interaction.reply({ content: '[ID] Format key salah! / [EN] Invalid key format!', flags: 64 });
                }

                const { data: pendingKey, error: lookupError } = await supabase
                    .from('pending_free_keys')
                    .select('*')
                    .eq('key_string', keyString)
                    .eq('claimed', false)
                    .single();

                if (lookupError || !pendingKey) {
                    return await interaction.reply({ content: '[ID] Key tidak valid atau sudah diklaim. / [EN] Key is invalid or already claimed.', flags: 64 });
                }

                const durationHours = pendingKey.duration_hours;
                const d = new Date();
                d.setHours(d.getHours() + durationHours);

                const { error } = await supabase.from('hub_keys').insert([{
                    key_string: keyString,
                    type: 'FREE',
                    expires_at: d.toISOString(),
                    discord_id: interaction.user.id,
                    discord_username: interaction.user.username
                }]);

                if (error) {
                    if (error.code === '23505') {
                        return await interaction.reply({ content: '[ID] Key ini sudah diklaim! / [EN] This key has already been claimed!', flags: 64 });
                    }
                    return await interaction.reply({ content: `[ID] Database Error: ${error.message} / [EN] Database Error: ${error.message}`, flags: 64 });
                }

                await supabase
                    .from('pending_free_keys')
                    .update({ claimed: true })
                    .eq('key_string', keyString);

                const embed = new EmbedBuilder()
                    .setTitle(' Key Berhasil Diklaim!')
                    .setDescription(`Key kamu sudah aktif selama **${durationHours} jam**!\n\nSilakan gunakan di script executor kamu.`)
                    .addFields(
                        { name: ' Key', value: `\`${keyString}\`` },
                        { name: ' Aktif sampai', value: `<t:${Math.floor(d.getTime() / 1000)}:F>` }
                    )
                    .setColor(0x00ff64)
                    .setTimestamp();

                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (interaction.customId === 'modal_support_ticket') {

                const scriptName = interaction.fields.getTextInputValue('ticket_script_name');
                const summary = interaction.fields.getTextInputValue('ticket_issue_summary');
                const desc = interaction.fields.getTextInputValue('ticket_issue_desc');
                const userName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
                const categoryId = botConfig.discord_ticket_category;
                const channelName = `support-${userName}`;

                await createTicketChannel(interaction, channelName, categoryId, 'Bug Report / Support', {
                    'Script': scriptName,
                    'Issue': summary,
                    'Detail': desc
                });
            }

            if (interaction.customId === 'modal_redeem_premium') {
                const inputCode = interaction.fields.getTextInputValue('license_code').trim();

                const { data: license, error: licError } = await supabase
                    .from('hub_licenses')
                    .select('*')
                    .eq('code', inputCode)
                    .single();

                if (licError || !license) {
                    return await interaction.reply({ content: '[ID] License Code tidak valid atau sudah digunakan. / [EN] License Code is invalid or already used.', flags: 64 });
                }

                const newKeyStr = 'VONIXE-PREM-' + generateRandomString(12);
                let expiresAt = null;

                const parts = license.code.split('-');
                if (parts.length >= 4) {
                    const durationStr = parts[2];
                    const durationMs = parseCustomDuration(durationStr);
                    if (durationMs && durationMs !== 'LIFETIME') {
                        const d = new Date();
                        d.setTime(d.getTime() + durationMs);
                        expiresAt = d.toISOString();
                    }
                }

                const { error: insertError } = await supabase.from('hub_keys').insert([{
                    key_string: newKeyStr,
                    type: 'PREMIUM',
                    expires_at: expiresAt,
                    discord_id: interaction.user.id,
                    discord_username: interaction.user.username
                }]);

                if (insertError) return await interaction.reply({ content: ` Error generating key: ${insertError.message}`, flags: 64 });

                await supabase.from('hub_licenses').delete().eq('id', license.id);

                if (botConfig.discord_premium_role_id) {
                    try {
                        const member = await interaction.guild.members.fetch(interaction.user.id);
                        await member.roles.add(botConfig.discord_premium_role_id);
                    } catch (e) { }
                }

                const embed = new EmbedBuilder()
                    .setTitle(' Redeem Sukses! ')
                    .setDescription(`License Code berhasil ditukar! Berikut adalah Premium Key Anda:`)
                    .addFields(
                        { name: ' Premium Key', value: `\`${newKeyStr}\`` },
                        { name: ' Expired Date', value: expiresAt ? new Date(expiresAt).toLocaleString() : 'Lifetime' }
                    )
                    .setColor(0x50dc78);

                return await interaction.reply({ embeds: [embed], flags: 64 });
            }
        }
    } catch (err) {
        console.error('Interaction/Modal Error:', err);
        const errMsg = String(err.message || err).substring(0, 1500);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.reply({ content: `[ID] Error: ${errMsg} / [EN] Error: ${errMsg}`, flags: 64 });
            } else {
                await interaction.reply({ content: `[ID] Error: ${errMsg} / [EN] Error: ${errMsg}`, flags: 64 });
            }
        } catch (replyErr) {
            console.error('Failed to send error reply:', replyErr.message);
        }
    }
});

async function createTicketChannel(interaction, channelName, categoryId, typeTitle, formData = null) {
    const guild = interaction.guild;
    const userId = interaction.user.id;

    try {
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            ]
        });

        const embed = new EmbedBuilder()
            .setTitle(` ${typeTitle}`)
            .setDescription(`[ID] Halo <@${userId}>, Staff akan segera melayani anda.\n[EN] Hello <@${userId}>, Staff will assist you shortly.`)
            .setColor(0x00ff00)
            .setTimestamp();

        if (formData) {
            Object.keys(formData).forEach(key => {
                embed.addFields({ name: key, value: formData[key] });
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
        );

        await channel.send({
            content: `<@${userId}>`,
            embeds: [embed],
            components: [row]
        });

        await interaction.reply({ content: `[ID] Tiket dibuat: <#${channel.id}> / [EN] Ticket created: <#${channel.id}>`, flags: 64 });

        // Auto-close after 24 hours
        setTimeout(() => {
            channel.delete().catch(() => { });
        }, 24 * 60 * 60 * 1000);

    } catch (err) {
        console.error(' Ticket Error:', err);
        await interaction.reply({ content: `[ID] Gagal membuat tiket. Pastikan Bot punya izin Manage Channels. / [EN] Failed to create ticket. Ensure Bot has Manage Channels permission.`, flags: 64 });
    }
}

async function checkAnnouncements() {
    await loadBotConfig();
    const { data, error } = await supabase
        .from('bot_announcements')
        .select('*')
        .eq('status', 'pending');

    if (error || !data || data.length === 0) return;

    const channelId = botConfig.discord_announcement_channel;
    if (!channelId) return;

    for (const announce of data) {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) continue;

            let processedDesc = announce.description;
            const guild = channel.guild;
            if (guild) {
                await guild.channels.fetch();
                const channelNames = processedDesc.match(/#([a-z0-9-]+)/gi);
                if (channelNames) {
                    for (const nameWithHash of channelNames) {
                        const cleanName = nameWithHash.substring(1);
                        const targetChan = guild.channels.cache.find(c => c.name.toLowerCase() === cleanName.toLowerCase());
                        if (targetChan) {
                            processedDesc = processedDesc.replace(nameWithHash, `<#${targetChan.id}>`);
                        }
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(` ${announce.title} `)
                .setDescription(processedDesc)
                .setColor(0xffa000)
                .setTimestamp()
                .setFooter({ text: 'Vonixe Hub • Community Updates' });

            if (announce.image_url) embed.setImage(announce.image_url);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Vonixe Hub Website')
                    .setURL('https://vonixehub.my.id')
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(vonixeEmoji ? vonixeEmoji.id : ' ')
            );

            await channel.send({
                content: '<@&1395418057178091580> <@&1396200120139382886>',
                embeds: [embed],
                components: [row]
            });

            await supabase.from('bot_announcements').update({ status: 'sent' }).eq('id', announce.id);
            console.log(`  Announcement sent: ${announce.title}`);

        } catch (err) {
            console.error(` Announcement Error:`, err.message);
        }
    }
}

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await loadBotConfig();

    try {
        await client.guilds.fetch();
        const guild = client.guilds.cache.first();

        if (guild) {
            console.log(`  Checking emoji in guild: ${guild.name}`);
            await guild.emojis.fetch();
            vonixeEmoji = guild.emojis.cache.find(e => e.name === 'vonixe_logo');

            if (!vonixeEmoji) {
                console.log('  Fetching logo buffer to upload (with Headers)...');
                const https = require('https');

                const fetchImage = (url) => {
                    return new Promise((resolve, reject) => {
                        const options = {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (VonixeBot/1.0)',
                                'Accept': 'image/png,image/*;q=0.8,*/*;q=0.5'
                            }
                        };
                        https.get(url, options, (res) => {
                            if (res.statusCode === 302 || res.statusCode === 301) {
                                return fetchImage(res.headers.location).then(resolve).catch(reject);
                            }
                            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                            const chunks = [];
                            res.on('data', (chunk) => chunks.push(chunk));
                            res.on('end', () => resolve(Buffer.concat(chunks)));
                            res.on('error', (err) => reject(err));
                        }).on('error', (err) => reject(err));
                    });
                };

                try {
                    const buffer = await fetchImage('https://media.discordapp.net/attachments/771388554093527085/1487203240851411044/vonixe_hub_logo-removebg-preview.png?ex=69c84973&is=69c6f7f3&hm=5bf8c4f6db13978e17a6d288196540f39e484b5aeb95a4ed482a597efced9d79&=&format=webp&quality=lossless&width=500&height=500');
                    console.log(`  Logo buffer received (Size: ${buffer.length} bytes)`);
                    const dataUri = `data:image/png;base64,${buffer.toString('base64')}`;
                    vonixeEmoji = await guild.emojis.create({ attachment: dataUri, name: 'vonixe_logo' });
                    console.log(' Created branded emoji: vonixe_logo');
                } catch (fetchErr) {
                    console.error(' Fetching failed:', fetchErr.message);
                }
            } else {
                console.log(' Found existing branded emoji');
            }
        }
    } catch (err) {
        console.error(' Could not setup logo emoji:', err.message);
    }

    setInterval(checkAnnouncements, 30000);
});

console.log('  Connecting to Discord...');
// 4. Boost Tracker Listener
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Check if user stopped boosting
    if (oldMember.premiumSince && !newMember.premiumSince) {
        console.log(`[Boost Tracker] ${newMember.user.tag} stopped boosting! Revoking Boost key and role...`);
        try {
            // Remove Premium Role if they have it
            if (botConfig.discord_premium_role_id && newMember.roles.cache.has(botConfig.discord_premium_role_id)) {
                await newMember.roles.remove(botConfig.discord_premium_role_id);
                console.log(`[Boost Tracker] Removed Premium Role from ${newMember.user.tag}`);
            }

            // Find and delete the BOOST key in active_premium_keys
            const { data, error } = await supabase
                .from('active_premium_keys')
                .select('*')
                .eq('discord_id', newMember.id)
                .eq('expires_at', '8888-08-08T08:08:08.000Z');

            if (!error && data && data.length > 0) {
                await supabase.from('active_premium_keys').delete().eq('discord_id', newMember.id).eq('expires_at', '8888-08-08T08:08:08.000Z');
                console.log(`[Boost Tracker] Deleted ${data.length} Boost Key(s) for ${newMember.user.tag}`);

                // Try to DM them
                try {
                    const embed = new EmbedBuilder()
                        .setTitle(' Boost Berakhir')
                        .setDescription('Masa aktif Server Boost kamu sudah berakhir, sehingga akses Premium Script otomatis dicabut.\n\nTerimakasih telah mem-boost server kami! Silakan boost kembali atau beli Premium jika ingin menggunakan script lagi.')
                        .setColor(0xff0000)
                        .setTimestamp();
                    await newMember.send({ embeds: [embed] });
                } catch (dmErr) { }

                await sendAuditLog(newMember.client, '📉 Server Boost Ended', `**User:** <@${newMember.id}>\n**Action:** Premium Role and Boost Key automatically revoked.`, 0xff0000);
            }
        } catch (e) {
            console.error('[Boost Tracker] Error:', e.message);
        }
    }
});

// ============================================================
//  GAG2 STOCK TRACKER
// ============================================================

// ── Channel IDs ─────────────────────────────────────────────
const GAG2_CHANNELS = {
    seeds: '1519203037871341588',
    gears: '1519209655543402527',
    // crates: '1519211830382428241',  // ❌ Not in API — skipped
    weather: '1519212067385507892',
};

const GAG2_API_URL = 'https://www.game.guide/api/gag2-stock';

// ── Rarity table ─────────────────────────────────────────────
const RARITY_CFG = {
    'Common': { emoji: '⚪', color: 0x9E9E9E, priority: 0 },
    'Uncommon': { emoji: '🟢', color: 0x4CAF50, priority: 1 },
    'Rare': { emoji: '🔵', color: 0x2196F3, priority: 2 },
    'Epic': { emoji: '🟣', color: 0x9C27B0, priority: 3 },
    'Legendary': { emoji: '🟡', color: 0xFFD700, priority: 4 },
    'Mythic': { emoji: '🔴', color: 0xF44336, priority: 5 },
    'Super': { emoji: '🌟', color: 0xFF9800, priority: 6 },
};

// ── Weather config ────────────────────────────────────────────
const SPECIAL_WEATHER_KEYWORDS = [
    'blood moon', 'gold moon', 'golden moon',
    'rainbow moon', 'thunderstorm', 'starfall', 'rainbow',
];

const WEATHER_EMOJI = {
    'blood moon': '🩸',
    'gold moon': '🌕',
    'golden moon': '🌕',
    'rainbow moon': '🌈',
    'thunderstorm': '⚡',
    'starfall': '🌠',
    'rainbow': '🌈',
    'rain': '🌧️',
    'sunny': '☀️',
    'windy': '💨',
    'snow': '❄️',
    'snowfall': '❄️',
    'night': '🌙',
    'day': '🌤️',
};

// ── De-dup state ──────────────────────────────────────────────
let gag2LastSeedKey = null;
let gag2LastGearKey = null;
let gag2LastWeatherKey = null;

// ── Helpers ───────────────────────────────────────────────────
function gag2RarityCfg(rarity) {
    if (!rarity) return RARITY_CFG['Common'];
    const key = Object.keys(RARITY_CFG)
        .find(k => k.toLowerCase() === rarity.toLowerCase());
    return RARITY_CFG[key] || RARITY_CFG['Common'];
}

function gag2StockKey(items) {
    if (!items || items.length === 0) return '__empty__';
    return items
        .map(i => `${(i.name || '').toLowerCase()}:${i.qty ?? i.quantity ?? 0}`)
        .sort()
        .join('|');
}

function gag2FindCurrentRestock(restocks, now) {
    if (!restocks || restocks.length === 0) return { current: null, next: null };
    let current = null;
    let next = null;
    for (let i = 0; i < restocks.length; i++) {
        if (restocks[i].time <= now) {
            current = restocks[i];
            next = restocks[i + 1] || null;
        } else {
            if (!current) { current = restocks[i]; next = restocks[i + 1] || null; }
            else if (!next) { next = restocks[i]; }
            break;
        }
    }
    return { current, next };
}

function gag2TopPriority(items) {
    return (items || []).reduce((best, item) => {
        const p = gag2RarityCfg(item.rarity).priority;
        return p > best ? p : best;
    }, -1);
}

function gag2ItemLines(client, items) {
    if (!items || items.length === 0) return '_No items available._';
    const sorted = [...items].sort((a, b) =>
        gag2RarityCfg(a.rarity).priority - gag2RarityCfg(b.rarity).priority
    );
    return sorted.map(item => {
        const cfg = gag2RarityCfg(item.rarity);
        const icon = gag2GetItemEmoji(client, item.name, cfg);
        const qty = item.qty != null ? `\`x${item.qty}\`` : '';
        const price = item.price != null ? ` — 🌿 ${Number(item.price).toLocaleString()}¢` : '';
        const rare = item.rarity || 'Common';
        return `${icon} **${item.name}** ${qty}${price} \`${rare}\``;
    }).join('\n');
}

function gag2GetItemEmoji(client, itemName, rarityCfg) {
    if (!itemName) return rarityCfg.emoji;

    // Search custom emojis first
    if (client && client.emojis && client.emojis.cache) {
        const target = itemName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const customEmoji = client.emojis.cache.find(e => {
            const emojiName = e.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return emojiName === target ||
                emojiName === `gag2${target}` ||
                emojiName === `growagarden2${target}`;
        });
        if (customEmoji) return customEmoji.toString();
    }

    // Fallback to unicode
    const lower = itemName.toLowerCase();
    if (typeof ITEM_EMOJIS !== 'undefined' && ITEM_EMOJIS[lower]) return ITEM_EMOJIS[lower];
    if (lower.includes('sprinkler')) return '⛲';
    if (lower.includes('watering can')) return '🚿';

    return rarityCfg.emoji; // fallback to rarity circle
}

function gag2Countdown(ts) {
    if (!ts) return 'Unknown';
    return `<t:${ts}:R>`;
}

function gag2WeatherEmoji(name) {
    if (!name) return '🌤️';
    const key = Object.keys(WEATHER_EMOJI)
        .find(k => name.toLowerCase().includes(k));
    return key ? WEATHER_EMOJI[key] : '🌤️';
}

function gag2IsSpecial(weatherName) {
    if (!weatherName) return false;
    const lower = weatherName.toLowerCase();
    return SPECIAL_WEATHER_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Embed builders ────────────────────────────────────────────
function gag2BuildSeedEmbed(client, data) {
    const now = Math.floor(Date.now() / 1000);
    const allRestocks = data?.upcoming?.seeds ?? [];
    const { current, next } = gag2FindCurrentRestock(allRestocks, now);
    const seeds = current?.items ?? [];
    const nextTime = next?.time ?? null;
    const topP = gag2TopPriority(seeds);

    let color = 0x4CAF50;
    if (topP >= 7) color = 0xE8EAF6;
    else if (topP >= 6) color = 0xFF9800;
    else if (topP >= 4) color = 0xFFD700;
    else if (topP >= 3) color = 0x9C27B0;
    else if (topP >= 2) color = 0x2196F3;

    let nextPrediction = '> _No data available._';
    if (next && next.items) {
        nextPrediction = gag2ItemLines(client, next.items);
    }

    const timerText = nextTime ? `( ${gag2Countdown(nextTime)} )` : '';
    const desc = [
        '🛒 **CURRENTLY IN STOCK**',
        '==============================',
        gag2ItemLines(client, seeds) || '> _Empty_',
        '',
        `🔮 **UPCOMING PREDICTION** ${timerText}`,
        '==============================',
        nextPrediction
    ].join('\n');

    return new EmbedBuilder()
        .setAuthor({ name: '🌱 GAG2 — Seed Shop Restock' })
        .setDescription(desc)
        .setColor(color)
        .setFooter({ text: `Vonixe Hub • Total Items: ${seeds.length}` })
        .setTimestamp();
}

function gag2BuildGearEmbed(client, data) {
    const now = Math.floor(Date.now() / 1000);
    const allRestocks = data?.upcoming?.gears ?? [];
    const { current, next } = gag2FindCurrentRestock(allRestocks, now);
    const gears = current?.items ?? [];
    const nextTime = next?.time ?? null;
    const topP = gag2TopPriority(gears);

    let color = 0x2196F3;
    if (topP >= 6) color = 0xFF9800;
    else if (topP >= 4) color = 0xFFD700;
    else if (topP >= 3) color = 0x9C27B0;

    let nextPrediction = '> _No data available._';
    if (next && next.items) {
        nextPrediction = gag2ItemLines(client, next.items);
    }

    const timerText = nextTime ? `( ${gag2Countdown(nextTime)} )` : '';
    const desc = [
        '🛒 **CURRENTLY IN STOCK**',
        '==============================',
        gag2ItemLines(client, gears) || '> _Empty_',
        '',
        `🔮 **UPCOMING PREDICTION** ${timerText}`,
        '==============================',
        nextPrediction
    ].join('\n');

    return new EmbedBuilder()
        .setAuthor({ name: '⚙️ GAG2 — Gear Shop Restock' })
        .setDescription(desc)
        .setColor(color)
        .setFooter({ text: `Vonixe Hub • Total Items: ${gears.length}` })
        .setTimestamp();
}

function gag2GetWeatherSchedule(weatherData, now) {
    if (!weatherData || !weatherData.seq) return { current: null, upcoming: [] };

    const clen = weatherData.clen || 600;
    const weekSeconds = 7 * 24 * 60 * 60;
    const currentSecondOfWeek = now % weekSeconds;
    const cycleIndex = Math.floor(currentSecondOfWeek / clen);
    const timeInCycle = now % clen;
    const cycleStart = now - timeInCycle;

    const phases = weatherData.phases || [
        { offset: 0, duration: 450 },
        { offset: 450, duration: 30 },
        { offset: 480, duration: 120 }
    ];

    let currentPhaseIdx = 0;
    for (let i = phases.length - 1; i >= 0; i--) {
        if (timeInCycle >= phases[i].offset) {
            currentPhaseIdx = i;
            break;
        }
    }

    let cIdx = cycleIndex;
    let pIdx = currentPhaseIdx;

    // Game Guide has a +634 offset from standard weekly epoch
    const seqLength = weatherData.seq.length;
    const seqIdx = (cIdx + 634) % seqLength;
    const currentName = weatherData.seq[seqIdx][pIdx];
    const currentStartsAt = cycleStart + phases[pIdx].offset;
    const currentEndsAt = currentStartsAt + phases[pIdx].duration;

    const schedule = [{ name: currentName, startsAt: currentStartsAt, endsAt: currentEndsAt }];

    // Find next 5 Night phases
    const upcomingNights = [];
    let searchCIdx = cIdx;
    let searchPIdx = pIdx + 1;
    if (searchPIdx >= phases.length) {
        searchPIdx = 0;
        searchCIdx++;
    }

    while (upcomingNights.length < 5) {
        if (searchPIdx === 2) { // 2 is the Night phase
            const searchSeqIdx = (searchCIdx + 634) % seqLength;
            const name = weatherData.seq[searchSeqIdx][searchPIdx];
            const pInfo = phases[searchPIdx];
            const startsAt = cycleStart + (searchCIdx - cycleIndex) * clen + pInfo.offset;
            upcomingNights.push({ name, startsAt, endsAt: startsAt + pInfo.duration });
        }
        searchPIdx++;
        if (searchPIdx >= phases.length) {
            searchPIdx = 0;
            searchCIdx++;
        }
    }

    return {
        current: schedule[0],
        upcoming: upcomingNights
    };
}

function gag2BuildWeatherEmbed(data) {
    const now = Math.floor(Date.now() / 1000);
    const { current, upcoming } = gag2GetWeatherSchedule(data?.weather, now);

    const currentName = current?.name ?? 'Unknown';
    const currentEmoji = gag2WeatherEmoji(currentName);
    const isSpecial = gag2IsSpecial(currentName);

    let desc = '';
    if (current) {
        const endsAt = current.endsAt ?? current.endTime ?? null;
        desc += `**Now Active:** ${currentEmoji} **${currentName}**`;
        if (endsAt) desc += `  —  ends ${gag2Countdown(endsAt)}`;
        desc += '\n\n';
    }

    if (upcoming.length > 0) {
        desc += '**Upcoming Nights & Moons:**\n';
        for (const w of upcoming) {
            const em = gag2WeatherEmoji(w.name);
            const special = gag2IsSpecial(w.name);
            const label = special ? `**${w.name}** 🚨` : w.name;
            desc += `${em} ${label}`;
            if (w.startsAt) desc += `  —  ${gag2Countdown(w.startsAt)}`;
            desc += '\n';
        }
    }

    return new EmbedBuilder()
        .setTitle(`🌙 GAG2 Weather — ${currentEmoji} ${currentName}`)
        .setDescription(desc || '_No weather data available._')
        .setColor(isSpecial ? 0x9C27B0 : 0x37474F)
        .setFooter({ text: 'Vonixe Hub • GAG2 Weather Tracker' })
        .setTimestamp();
}

// ── Core fetch + dispatch ─────────────────────────────────────
async function fetchGAG2Stock() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
        const res = await fetch(`${GAG2_API_URL}?_=${Date.now()}`, {
            headers: {
                'User-Agent': 'VonixeBot/1.0 (Discord Stock Tracker)',
                'Accept': 'application/json',
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status} from gag2-stock API`);
        return await res.json();
    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

async function gag2RunTrackerCycle() {
    try {
        const data = await fetchGAG2Stock();

        const now = Math.floor(Date.now() / 1000);
        const allSeeds = data?.upcoming?.seeds ?? [];
        const allGears = data?.upcoming?.gears ?? [];
        const { current: curSeed } = gag2FindCurrentRestock(allSeeds, now);
        const { current: curGear } = gag2FindCurrentRestock(allGears, now);
        const seeds = curSeed?.items ?? [];
        const gears = curGear?.items ?? [];
        const seq = data?.weather?.seq ?? [];
        const weather = Array.isArray(seq[0]) ? seq[0][2] : (seq[0]?.name ?? null);

        // ── Seeds ──
        const newSeedKey = gag2StockKey(seeds);
        if (newSeedKey !== gag2LastSeedKey) {
            gag2LastSeedKey = newSeedKey;
            try {
                const chan = await client.channels.fetch(GAG2_CHANNELS.seeds).catch(() => null);
                if (chan) {
                    const embed = gag2BuildSeedEmbed(client, data);
                    await chan.send({ embeds: [embed] });
                    console.log(`[GAG2 Seeds] Posted restock.`);
                }
            } catch (e) { console.error('[GAG2 Seeds] Full error:', e); }
        }

        // ── Gears ──
        const newGearKey = gag2StockKey(gears);
        if (newGearKey !== gag2LastGearKey) {
            gag2LastGearKey = newGearKey;
            try {
                const chan = await client.channels.fetch(GAG2_CHANNELS.gears).catch(() => null);
                if (chan) {
                    const embed = gag2BuildGearEmbed(client, data);
                    await chan.send({ embeds: [embed] });
                    console.log(`[GAG2 Gears] Posted restock.`);
                }
            } catch (e) { console.error('[GAG2 Gears] Full error:', e); }
        }

        // ── Weather (special events only) ──
        if (weather && weather !== gag2LastWeatherKey) {
            gag2LastWeatherKey = weather;
            if (gag2IsSpecial(weather)) {
                try {
                    const chan = await client.channels.fetch(GAG2_CHANNELS.weather).catch(() => null);
                    if (chan) {
                        const embed = gag2BuildWeatherEmbed(data);
                        await chan.send({ embeds: [embed] });
                        console.log(`[GAG2 Weather] Special event posted: ${weather}`);
                    }
                } catch (e) { console.error('[GAG2 Weather] Full error:', e); }
            } else {
                console.log(`[GAG2 Weather] Regular weather changed to: ${weather} (not posted)`);
            }
        }

    } catch (err) {
        console.error('[GAG2 Tracker] Cycle error:', err.message);
    }
}

function startGAG2StockTracker() {
    console.log('[GAG2 Tracker] Stock tracker starting (30-sec interval)...');
    gag2RunTrackerCycle();                             // Fire immediately on bot ready
    setInterval(gag2RunTrackerCycle, 30 * 1000);     // Then every 30 seconds
}

// ============================================================
//  END OF GAG2 STOCK TRACKER
// ============================================================

const loginTimeout = setTimeout(() => {
    console.error(' Login timeout: Bot took too long to connect (lebih dari 60 detik). Coba cek koneksi internet kamu.');
}, 60000);

client.login(token).then(() => {
    clearTimeout(loginTimeout);
    console.log(` Login Success: ${client.user.tag}`);
}).catch(err => {
    clearTimeout(loginTimeout);
    console.error(' Login failed:', err.message);
});