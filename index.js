require('dotenv').config();
const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// --- SERVER PIN (For Render Keep-alive) ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is Online!'));
app.get('/ping', (req, res) => res.send('Pong!'));

app.listen(port, () => {
    console.log(`📡 Server running on port ${port}`);
});

// --- DEBUG LOGS ---
console.log('🚀 Bot is starting...');
console.log('📂 NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('🔑 Token exists:', !!process.env.DISCORD_TOKEN);
console.log('🔗 Supabase URL exists:', !!process.env.SUPABASE_URL);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// --- DEEP DEBUG ---
client.on('error', err => console.error(`[DJS ERROR]`, err));

// AGGRESSIVE TOKEN CLEANUP (Remove ALL spaces/tabs/newlines)
const rawToken = process.env.DISCORD_TOKEN || '';
const token = rawToken.replace(/\s/g, '');

// --- BOT LOGIC ---

let botConfig = {};
let vonixeEmoji = null; // Store logo emoji here

async function loadBotConfig() {
    try {
        const { data, error } = await supabase
            .from('hub_settings')
            .select('discord_bot_token, discord_announcement_channel, discord_ticket_category, discord_premium_category, discord_qr_image_url')
            .single();

        if (data) botConfig = data;
        console.log('✅ Bot configuration loaded.');
    } catch (err) {
        console.error('❌ Failed to load bot config:', err.message);
    }
}

// 1. Auto-Responder & Command Listeners
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.toLowerCase();
    const prefix = '.';

    // PRIORITY 1: Command Handlers (Check for prefix first!)
    if (content.startsWith(prefix)) {
        const args = content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Admin Commands
        if (message.member.permissions.has(PermissionFlagsBits.Administrator)) {

            // 1. .setup-support
            if (command === 'setup-support') {
                await message.delete().catch(() => { });
                const embed = new EmbedBuilder()
                    .setTitle('✦ Vonixe Support Ticket ✦')
                    .setDescription('Klik tombol di bawah jika butuh bantuan atau ingin melaporkan bug.')
                    .setColor(0x0099ff);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_ticket_support').setLabel('Create Support Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
                );

                return message.channel.send({ embeds: [embed], components: [row] });
            }

            // 2. .setup-premium
            if (command === 'setup-premium') {
                await message.delete().catch(() => { });
                const embed = new EmbedBuilder()
                    .setTitle('✦ Vonixe Premium Access ✦')
                    .setDescription('Klik tombol di bawah untuk membeli atau memperpanjang Premium.')
                    .setColor(0x50dc78);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_ticket_premium').setLabel('Buy / Renew Premium').setStyle(ButtonStyle.Success).setEmoji('⭐')
                );

                return message.channel.send({ embeds: [embed], components: [row] });
            }

            // 3. .qr
            if (command === 'qr') {
                await message.delete().catch(() => { });
                await loadBotConfig();
                const qrUrl = botConfig.discord_qr_image_url;
                if (!qrUrl) return message.channel.send('❌ QR Image belum dikonfigurasi di Admin Panel.');

                const embed = new EmbedBuilder()
                    .setTitle('✦ QR Pembayaran Vonixe Hub ✦')
                    .setDescription('Scan QR di bawah ini untuk memproses pembayaran anda.')
                    .setImage(qrUrl)
                    .setColor(0x00ff00)
                    .setFooter({ text: 'Mohon kirim bukti transfer ke ticket setelah membayar.' });

                return message.channel.send({ embeds: [embed] });
            }
        }
        return; // Stop if it was a command (even if failed)
    }

    // PRIORITY 2: Auto-Responder logic (Only if NOT a command)
    const keywords = ['getkey', 'cara get key', 'dimana key', 'buy premium', 'bantuan', 'tutor', 'bug', 'error', 'help', 'support', 'premium'];
    if (keywords.some(k => content.includes(k))) {
        const embed = new EmbedBuilder()
            .setTitle('✦ Vonixe Hub - Community Navigation ✦')
            .setDescription('Halo! Berikut adalah panduan cepat untuk akses Vonixe Hub:')
            .addFields(
                { name: '🔑 Get Key', value: 'Silakan kunjungi <#1483881102127927477>', inline: true },
                { name: '🎫 Support/Bug', value: 'Buat ticket di <#1395413976925339730>', inline: true },
                { name: '💎 Buy Premium', value: 'Informasi ada di <#1487160999189549086>', inline: true }
            )
            .setColor(0xffa000)
            .setFooter({ text: 'Gunakan tombol di channel terkait untuk respon cepat.' });

        return message.reply({ embeds: [embed] });
    }
});

// 2. Interaction Listener (Tickets)
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const userName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');

        if (interaction.customId === 'create_ticket_support') {
            // Show Modal for Support
            const modal = new ModalBuilder()
                .setCustomId('modal_support_ticket')
                .setTitle('Support Ticket Form');

            const scriptInput = new TextInputBuilder()
                .setCustomId('ticket_script_name')
                .setLabel('Script Apa?')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Contoh: IndoStrike')
                .setRequired(true);

            const issueInput = new TextInputBuilder()
                .setCustomId('ticket_issue_summary')
                .setLabel('Apa yang terjadi sama scriptnya?')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Contoh: Gak bisa load / Error key')
                .setRequired(true);

            const descInput = new TextInputBuilder()
                .setCustomId('ticket_issue_desc')
                .setLabel('Jelaskan detail bug/keluhannya')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Jelaskan sedetail mungkin di sini...')
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
                    .setPlaceholder('Pilih jenis layanan premium...')
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Beli Premium Baru')
                            .setDescription('Saya ingin membeli durasi premium baru')
                            .setValue('buy_premium')
                            .setEmoji('💎'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Perpanjang Premium')
                            .setDescription('Saya ingin memperpanjang durasi yang sudah ada')
                            .setValue('renew_premium')
                            .setEmoji('⏳')
                    )
            );

            await interaction.reply({
                content: '🛒 **Pilih jenis produk yang ingin dibeli:**',
                components: [row],
                ephemeral: true
            });
        }

        if (interaction.customId === 'close_ticket') {
            await interaction.reply('🔒 Tiket ini akan ditutup dalam 5 detik...');
            setTimeout(() => interaction.channel.delete().catch(e => console.error('❌ Delete Error:', e)), 5000);
        }
    }

    // Handle Selection Menu
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_premium_type') {
            await interaction.deferUpdate(); // Acknowledge the menu

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
        if (interaction.customId === 'modal_support_ticket') {
            await interaction.deferReply({ ephemeral: true });

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
    }
});

async function createTicketChannel(interaction, channelName, categoryId, typeTitle, formData = null) {
    const guild = interaction.guild;
    const userId = interaction.user.id;

    try {
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText, // Text Channel
            parent: categoryId,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }, // @everyone: No view
                { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }, // User: View, Send, History
            ]
        });

        const embed = new EmbedBuilder()
            .setTitle(`🎫 ${typeTitle}`)
            .setDescription(`Halo <@${userId}>, Staff akan segera melayani anda.`)
            .setColor(0x00ff00)
            .setTimestamp();

        if (formData) {
            Object.keys(formData).forEach(key => {
                embed.addFields({ name: key, value: formData[key] });
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await channel.send({
            content: `<@${userId}> | Admin Team`,
            embeds: [embed],
            components: [row]
        });

        await interaction.editReply({ content: `✅ Ticket created: <#${channel.id}>` });

    } catch (err) {
        console.error('❌ Ticket Error:', err);
        await interaction.editReply({ content: `❌ Gagal membuat tiket. Pastikan Bot punya izin Manage Channels.` });
    }
}

// 2. Announcement Listener (Polling/Real-time)
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

            // [ LOGIC FIX ] Resolve channel names like #general to <#ID>
            let processedDesc = announce.description;
            const guild = channel.guild;
            if (guild) {
                // Fetch all channels to ensure cache is up to date
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
                .setTitle(`✦ ${announce.title} ✦`)
                .setDescription(processedDesc)
                .setColor(0xffa000)
                .setTimestamp()
                .setFooter({ text: 'Vonixe Hub • Community Updates' });

            if (announce.image_url) embed.setImage(announce.image_url);

            // [ UI FIX ] Add Branded Website Button
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Vonixe Hub Website')
                    .setURL('https://vonixehub.my.id')
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(vonixeEmoji ? vonixeEmoji.id : '🌐')
            );

            await channel.send({
                content: '<@&1395418057178091580> <@&1396200120139382886>', // Tag Member & Premium
                embeds: [embed],
                components: [row]
            });

            // Mark as sent
            await supabase.from('bot_announcements').update({ status: 'sent' }).eq('id', announce.id);
            console.log(`📢 Announcement sent: ${announce.title}`);

        } catch (err) {
            console.error(`❌ Announcement Error:`, err.message);
        }
    }
}

// 3. Ticket System (Basic UI)
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await loadBotConfig();

    // [ LOGIC FIX ] Ensure branded emoji is ready
    try {
        await client.guilds.fetch();
        const guild = client.guilds.cache.first();

        if (guild) {
            console.log(`🔍 Checking emoji in guild: ${guild.name}`);
            await guild.emojis.fetch();
            vonixeEmoji = guild.emojis.cache.find(e => e.name === 'vonixe_logo');

            if (!vonixeEmoji) {
                console.log('📦 Fetching logo buffer to upload (with Headers)...');
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
                    const buffer = await fetchImage('https://i.imgur.com/yjSJoOE.png');
                    console.log(`📑 Logo buffer received (Size: ${buffer.length} bytes)`);
                    
                    const dataUri = `data:image/png;base64,${buffer.toString('base64')}`;

                    vonixeEmoji = await guild.emojis.create({
                        attachment: dataUri,
                        name: 'vonixe_logo'
                    });
                    console.log('✅ Created branded emoji: vonixe_logo');
                } catch (fetchErr) {
                    console.error('❌ Fetching failed:', fetchErr.message);
                }
            } else {
                console.log('✅ Found existing branded emoji');
            }
        }
    } catch (err) {
        console.error('⚠️ Could not setup logo emoji:', err.message);
    }

    // Check for announcements every 30 seconds
    setInterval(checkAnnouncements, 30000);
});

console.log('📡 Connecting to Discord...');
const loginTimeout = setTimeout(() => {
    console.error('❌ Login timeout: Bot took too long to connect. Pastikan TOKEN bener (Bot Token, bukan Client Secret) dan INTENTS di Developer Portal sudah ON semua!');
}, 15000);

client.login(token).then(() => {
    clearTimeout(loginTimeout);
    console.log(`✅ Login Success: ${client.user.tag}`);
}).catch(err => {
    clearTimeout(loginTimeout);
    console.error('❌ Login failed:', err.message);
});
