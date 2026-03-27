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

async function loadBotConfig() {
    const { data, error } = await supabase.from('hub_settings').select('*').single();
    if (!error && data) {
        botConfig = data;
        console.log('✅ Bot configuration loaded.');
    } else {
        console.error('❌ Failed to load bot config:', error?.message);
    }
}

// 1. Auto-Responder & Command Listeners
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.toLowerCase();

    // Auto-Responder logic
    const keywords = {
        'getkey': 'Tutorial ambil key ada di channel <#1395409923059482696>',
        'cara get key': 'Tutorial ambil key ada di channel <#1395409923059482696>',
        'dimana key': 'Kunjungi website kami di https://vonixehub.my.id untuk mendapatkan key.',
        'buy premium': 'Untuk beli premium silakan klik tombol di bawah atau cek channel <#1395409923059482696>'
    };

    for (const [key, response] of Object.entries(keywords)) {
        if (content.includes(key)) return message.reply(response);
    }

    // Command: !setup-bot (Owner only)
    if (content === '!setup-bot' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle('✦ Vonixe Hub Support ✦')
            .setDescription('Silakan klik tombol di bawah untuk bantuan atau pembelian.')
            .setColor(0xffa000);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_ticket_support').setLabel('Support').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
            new ButtonBuilder().setCustomId('create_ticket_premium').setLabel('Premium').setStyle(ButtonStyle.Success).setEmoji('⭐'),
            new ButtonBuilder().setLabel('Buy Premium').setStyle(ButtonStyle.Link).setURL('https://vonixehub.my.id').setEmoji('💎')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
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
                .setPlaceholder('Contoh: IndoStrike / Vonixe Hub')
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

        await channel.send({ 
            content: `<@${userId}> | Admin Team`, 
            embeds: [embed], 
            components: [closeButtonRow] 
        });

        await interaction.editReply({ content: `✅ Ticket created: <#${channel.id}>` });

    } catch (err) {
        console.error('❌ Ticket Error:', err);
        await interaction.editReply({ content: `❌ Gagal membuat tiket. Pastikan Bot punya izin Manage Channels.` });
    }
}

// 2. Announcement Listener (Polling/Real-time)
async function checkAnnouncements() {
    // Reload config every time to get latest Channel IDs from Admin Panel
    await loadBotConfig();

    const { data, error } = await supabase
        .from('bot_announcements')
        .select('*')
        .eq('status', 'pending');

    if (error) {
        console.error('❌ Announcement Error:', error.message);
        return;
    }

    if (data && data.length > 0) {
        const channelId = botConfig.discord_announcement_channel;

        if (!channelId) {
            console.warn('⚠️ Announcement skipped: No Discord Channel ID configured in Admin Panel.');
            return;
        }

        for (const announce of data) {
            try {
                const channel = await client.channels.fetch(channelId);
                if (!channel) {
                    console.error(`❌ Channel not found: ${channelId}`);
                    continue;
                }

                const embed = new EmbedBuilder()
                    .setTitle(`✦ ${announce.title} ✦`)
                    .setDescription(announce.description)
                    .setColor(0xffa000)
                    .setTimestamp()
                    .setFooter({ text: 'Vonixe Hub • Community Updates', iconURL: client.user.displayAvatarURL() });

                if (announce.image_url) {
                    embed.setImage(announce.image_url);
                }

                await channel.send({
                    content: '@everyone @Update Log',
                    embeds: [embed]
                });

                // Mark as sent
                await supabase.from('bot_announcements').update({ status: 'sent' }).eq('id', announce.id);
                console.log(`📢 Announcement sent: ${announce.title}`);

            } catch (err) {
                console.error(`❌ Failed to send announcement ${announce.id}:`, err.message);
            }
        }
    }
}

// 3. Ticket System (Basic UI)
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await loadBotConfig();

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
