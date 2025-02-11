const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionsBitField, MessageFlags } = require('discord.js');
const fs = require('fs');
const { getAIResponse } = require("./openai"); // Import the AI response function
const { analyzeImage } = require("./openai"); // Import the image analysis function

// Load config.json
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ]
});

// Slash commands for adding and removing channels
const commands = [
    new SlashCommandBuilder()
        .setName('addbucketchannel')
        .setDescription('Tell Bucket to watch a channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to watch')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('removebucketchannel')
        .setDescription('Tell Bucket to stop watching a channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to remove from monitoring')
                .setRequired(true)
        )
];

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log('Registering slash commands...');
        await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), { body: commands });
        console.log('Slash commands registered for guild: ' + config.guildId);
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on("messageCreate", async (message) => {
    if (message.author.bot || !config.monitoredChannels.includes(message.channel.id)) return;

    if (message.mentions.has(client.user)) {
        // Collect user data (same as before)
        const nickname = message.member?.nickname || message.author.username;
        const sanitizedNickname = nickname.replace(/[^a-zA-Z0-9\s]/g, '');
        const replyChain = [];
        let currentMessage = message;
        while (currentMessage.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(currentMessage.reference.messageId);
                replyChain.unshift({
                    author: repliedMessage.member?.nickname || repliedMessage.author.username,
                    content: repliedMessage.content,
                });
                currentMessage = repliedMessage;
            } catch (err) {
                break;
            }
        }

        const embeds = message.embeds.map(embed => ({
            type: embed.type,
            url: embed.url
        }));

        const member = await message.guild.members.fetch(message.author.id);
        const richPresence = member.presence?.activities.map(activity => ({
            name: activity.name,
            type: activity.type,
            details: activity.details || 'N/A'
        })) || [];

        const profilePicture = message.author.displayAvatarURL({ dynamic: true, size: 256 });

        // If the message contains an image, analyze it using OpenAI
        let imageDescription = '';
        if (embeds.length > 0) {
            const imageEmbed = embeds.find(embed => embed.type === 'image');
            if (imageEmbed) {
                imageDescription = await analyzeImage(imageEmbed.url);
            }
        }

        // Construct user data
        const userData = {
            nickname: sanitizedNickname,
            replyChain,
            embeds,
            richPresence,
            profilePicture,
            imageDescription,
        };

        // Log the data being sent to the AI for debugging
        console.log("Sending the following data to AI: ", JSON.stringify(userData, null, 2));

        // Prepare the message history for OpenAI API
        const messages = [];

        // Add the user's message
        messages.push({
            role: 'user',
            name: sanitizedNickname,  // Make sure we send the nickname in 'name'
            content: message.content,
        });

        // If there are reply chains, include them as well
        replyChain.forEach(reply => {
            messages.unshift({
                role: 'user',
                name: reply.author,
                content: reply.content,
            });
        });

        // Log the prepared message history
        console.log("Prepared message history: ", JSON.stringify(messages, null, 2));

        // Get AI response
        const aiResponse = await getAIResponse(userData, messages); // Pass message history here

        // Log AI's response for debugging
        console.log("AI's response: ", aiResponse);

        // Reply to the user
        message.reply(aiResponse);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    // Check admin permissions
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ 
            content: `You're not an admin!`, 
            flags: MessageFlags.Ephemeral
        });
    }

    const channel = interaction.options.getChannel('channel');

    if (interaction.commandName === 'addbucketchannel') {
        if (config.monitoredChannels.includes(channel.id)) {
            return interaction.reply({ 
                content: `Bucket's already in <#${channel.id}>`,
                flags: MessageFlags.Ephemeral
            });
        }

        config.monitoredChannels.push(channel.id);
        fs.writeFileSync('config.json', JSON.stringify(config, null, 4));

        return interaction.reply({ 
            content: `Bucket is now in <#${channel.id}>.`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.commandName === 'removebucketchannel') {
        if (!config.monitoredChannels.includes(channel.id)) {
            return interaction.reply({ 
                content: `Bucket wasn't watching <#${channel.id}>`,
                flags: MessageFlags.Ephemeral
            });
        }

        config.monitoredChannels = config.monitoredChannels.filter(id => id !== channel.id);
        fs.writeFileSync('config.json', JSON.stringify(config, null, 4));

        return interaction.reply({ 
            content: `Bucket stopped watching <#${channel.id}>.`,
            flags: MessageFlags.Ephemeral
        });
    }
});

client.login(config.token);
