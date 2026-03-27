require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
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
            new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
            new ButtonBuilder().setLabel('Buy Premium').setStyle(ButtonStyle.Link).setURL('https://vonixehub.my.id').setEmoji('💎')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// 2. Interaction Listener (Tickets)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'create_ticket') {
        const guild = interaction.guild;
        const categoryId = botConfig.discord_ticket_category;

        const channel = await guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: categoryId || null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });

        const embed = new EmbedBuilder()
            .setTitle('🎫 Welcome to Support')
            .setDescription(`Halo ${interaction.user}, silakan jelaskan kendala kamu. Staff kami akan segera membantu.`)
            .setColor(0x50dc78);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await channel.send({ content: `${interaction.user} <@&ID_STAFF_ROLE>`, embeds: [embed], components: [row] });
        await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
    }

    if (interaction.customId === 'close_ticket') {
        await interaction.reply('Closing ticket in 5 seconds...');
        setTimeout(() => interaction.channel.delete(), 5000);
    }
});

// 2. Announcement Listener (Polling/Real-time)
async function checkAnnouncements() {
    const { data, error } = await supabase
        .from('bot_announcements')
        .select('*')
        .eq('status', 'pending');

    if (error) {
        console.error('❌ Announcement Error:', error.message);
        return;
    }

    if (data && data.length > 0) {
        for (const announce of data) {
            try {
                const channelId = botConfig.discord_announcement_channel;
                if (!channelId) continue;

                const channel = await client.channels.fetch(channelId);
                if (!channel) continue;

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
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Login failed:', err.message);
});
