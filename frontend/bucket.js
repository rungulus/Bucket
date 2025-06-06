const EventEmitter = require('events');
const fs = require("fs");
const OpenAI = require("openai");
const Discord = require("discord.js");
const { Events } = require("discord.js");
const path = require('path');
//const { config } = require('process');
let inquirer;
let severityCategory;
let previousMessage = "";

async function getConfig() {
    try {
        const configContents = await fs.promises.readFile('config.json', 'utf8');
        return JSON.parse(configContents);
    } catch (error) {
        throw new Error(`Failed to load config: ${error.message}`);
    }
}

async function loadInquirer() {
    inquirer = (await
        import ('inquirer')).default;
}

const saveToJSONL = async(systemPrompt, userPrompt, aiResponse) => {
    const data = {
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: aiResponse }
            //try to save in chat completion format
        ]
    };
    try {
        const jsonlData = JSON.stringify(data) + '\n';
        fs.appendFileSync('saved-messages.jsonl', jsonlData);
        botState = 'Idle';
    } catch (error) {
        latestError = 'Error saving data to JSONL file:', error;
    }
};

class Bucket extends EventEmitter {
    constructor() {
        super();
        this.botState = 'Initializing';
        this.inputTokensUsed = 0;
        this.outputTokensUsed = 0;
        this.totalInputTokensUsed = 0;
        this.totalOutputTokensUsed = 0;
        this.totalTokensUsed = 0;
        this.recentMessages = new Map();
        this.chatHistory = new Map();
        this.maxHistoryTokens = 1000; // 25% of GPT-3.5's 4k context
        this.minHistoryMessages = 3;
        this.maxHistoryMessages = 10;
        this.blockedWords = new Set();
        this.botTag = '';
        this.totalPings = 0;
        this.blockedWordsCount = 0;
        this.trainingDataFromMessage = 0;
        this.latestError = 'none!';
        this.filteredResponse = '';
        this.userMessageContent = '';
        this.originalMessage = '';
        this.config = null;
        this.client = new Discord.Client({
            intents: [
                Discord.GatewayIntentBits.Guilds,
                Discord.GatewayIntentBits.GuildMessages,
                Discord.GatewayIntentBits.GuildPresences,
                Discord.GatewayIntentBits.GuildMessageReactions,
                Discord.GatewayIntentBits.DirectMessages,
                Discord.GatewayIntentBits.MessageContent
            ],
            partials: [
                Discord.Partials.Channel,
                Discord.Partials.Message,
                Discord.Partials.User,
                Discord.Partials.GuildMember,
                Discord.Partials.Reaction
            ]
        });
    }

    async init() {
        console.log('Starting bot initialization...');
        await this.loadBlockedWords();
        await this.loadConfig();
        this.openai = new OpenAI({ apiKey: this.config.openaiapi.apiKey });

        // Set up event handlers before login
        this.setupEventHandlers();

        console.log('Logging in to Discord...');
        await this.client.login(this.discordToken);
        console.log('Login successful!');
    }

    setupEventHandlers() {
        console.log('Setting up event handlers...');

        this.client.on('ready', () => {
            console.log(`Bot is ready! Logged in as ${this.client.user.tag}`);
            this.botState = 'Ready';
            this.botTag = this.client.user.tag;
        });

        this.client.on('messageCreate', async(message) => {
            console.log('Message received:', {
                author: message.author.tag,
                content: message.content,
                channelId: message.channelId,
                isPing: message.mentions.has(this.client.user)
            });

            try {
                // Reload config before processing each message
                await this.loadConfig();

                // Ignore messages from the bot itself
                if (message.author.id === this.client.user.id) {
                    console.log('Ignoring bot\'s own message');
                    return;
                }

                // Check if we should respond to this message
                const shouldRespond = this.shouldRespondToMessage(message);
                console.log('Should respond:', shouldRespond);

                if (!shouldRespond) {
                    console.log('Not responding to message');
                    return;
                }

                // Start typing indicator
                await message.channel.sendTyping();

                // Keep typing indicator active during processing
                const typingInterval = setInterval(() => {
                    message.channel.sendTyping();
                }, 8000); // Send typing every 8 seconds

                try {
                    console.log('Processing message...');
                    this.botState = 'Processing Message';
                    this.originalMessage = message.content;
                    this.userMessageContent = this.originalMessage;

                    // Remove pings if configured
                    if (this.removePings) {
                        this.userMessageContent = this.userMessageContent.replace(/<@!?\d+>/g, '');
                    }

                    // Remove links if configured
                    if (this.removeLinks) {
                        this.userMessageContent = this.userMessageContent.replace(/https?:\/\/\S+/g, '');
                    }

                    // Get message history
                    const history = await this.getMessageHistory(message.channel);
                    console.log('Message history loaded:', history.length, 'messages');

                    // Process any images in the message
                    const imageAttachments = message.attachments.filter(attachment =>
                        attachment.contentType && attachment.contentType.startsWith('image/')
                    );

                    let response;
                    if (imageAttachments.size > 0) {
                        console.log('Processing image...');
                        // Process the first image
                        const imageUrl = imageAttachments.first().url;
                        const imageDescription = await this.getImageDescription(imageUrl);
                        console.log('Image description:', imageDescription);

                        // Add image description to message history
                        const messagesArray = [
                            { role: "system", content: this.config.openaiapi.systemPrompt },
                            ...history,
                            { role: "user", content: `[Image: ${imageDescription}] ${this.userMessageContent}` }
                        ];

                        response = await this.sendChatMessage(messagesArray, message.channel).catch(error => {
                            console.error('Error sending chat message:', error);
                            this.emit('error', error.message);
                            return null;
                        });
                    } else {
                        console.log('Processing text message...');
                        // Process text message with history
                        const messagesArray = [
                            { role: "system", content: this.config.openaiapi.systemPrompt },
                            ...history,
                            { role: "user", content: this.userMessageContent }
                        ];

                        response = await this.sendChatMessage(messagesArray, message.channel).catch(error => {
                            console.error('Error sending chat message:', error);
                            this.emit('error', error.message);
                            return null;
                        });
                    }

                    if (response) {
                        console.log('Sending response...');
                        await message.reply({
                            content: response,
                            allowedMentions: { repliedUser: false }
                        });
                        console.log('Response sent!');
                    } else {
                        console.log('No response generated');
                    }

                    this.botState = 'Idle';
                } finally {
                    // Clear the typing interval
                    clearInterval(typingInterval);
                }
            } catch (error) {
                console.error('Error processing message:', error);
                this.emit('error', `Error processing message: ${error.message}`);
                this.botState = 'Error';
            }
        });

        console.log('Event handlers setup complete');
    }

    async processMessages() {
        console.log('processMessages called - event handlers should already be set up');
    }

    async loadBlockedWords() {
        try {
            const blockedWordsPath = path.join(__dirname, 'blockedwords.csv');
            const fileContent = await fs.promises.readFile(blockedWordsPath, 'utf-8');
            const words = fileContent.split('\n').map(word => word.trim().toLowerCase()).filter(word => word);
            this.blockedWords = new Set(words);
            console.log(`Loaded ${this.blockedWords.size} blocked words`);
        } catch (error) {
            console.error('Error loading blocked words:', error);
            this.emit('error', 'Failed to load blocked words list');
        }
    }

    containsBlockedWords(text) {
        const words = text.toLowerCase().split(/\s+/);
        return words.some(word => this.blockedWords.has(word));
    }

    // Helper function to estimate tokens in a string
    estimateTokens(text) {
        // GPT-3.5 specific token estimation
        // Average of 4 characters per token for English text
        // Add 4 tokens for role and name overhead
        return Math.ceil(text.length / 4) + 4;
    }

    // Helper function to get total tokens in a message array
    getTotalTokens(messages) {
        return messages.reduce((total, msg) => {
            return total + this.estimateTokens(msg.content || '') +
                this.estimateTokens(msg.name || '');
        }, 0);
    }

    // Add message to chat history
    addToHistory(channelId, message) {
        if (!this.chatHistory.has(channelId)) {
            this.chatHistory.set(channelId, []);
        }

        const history = this.chatHistory.get(channelId);
        history.push(message);

        // Trim history if needed
        this.trimHistory(channelId);
    }

    // Trim history based on token limits and message counts
    trimHistory(channelId) {
        const history = this.chatHistory.get(channelId);
        if (!history) return;

        // First trim by message count
        while (history.length > this.maxHistoryMessages) {
            history.shift();
        }

        // Then trim by token count if still over limit
        while (history.length > this.minHistoryMessages && this.getTotalTokens(history) > this.maxHistoryTokens) {
            history.shift();
        }
    }

    // Get relevant chat history
    async getChatHistory(channelId, currentMessage) {
        const history = this.chatHistory.get(channelId) || [];

        // If this is a reply, we might want to include the referenced message
        if (currentMessage.reference && currentMessage.reference.messageId) {
            try {
                const referencedMessage = await currentMessage.channel.messages.fetch(currentMessage.reference.messageId);
                if (referencedMessage) {
                    // Add referenced message to history if not already present
                    const exists = history.some(msg => msg.id === referencedMessage.id);
                    if (!exists) {
                        history.push({
                            id: referencedMessage.id,
                            role: referencedMessage.author.id === this.client.user.id ? "assistant" : "user",
                            name: referencedMessage.author.username,
                            content: referencedMessage.content
                        });
                    }
                }
            } catch (error) {
                this.emit('error', `Failed to fetch referenced message: ${error.message}`);
            }
        }

        return history;
    }

    // Update max history tokens based on model's context window
    updateMaxHistoryTokens() {
        const modelId = this.config.openaiapi.modelId;
        // Default to 2000 if model not recognized
        let contextWindow = 2000;

        // Set context window based on model
        if (modelId.includes('gpt-4')) {
            contextWindow = 8000;
        } else if (modelId.includes('gpt-3.5-turbo-16k')) {
            contextWindow = 16000;
        } else if (modelId.includes('gpt-3.5-turbo')) {
            contextWindow = 4000;
        }

        // Reserve some tokens for system prompt and current message
        this.maxHistoryTokens = Math.floor(contextWindow * 0.3); // Use 30% of context window for history
    }

    async loadConfig() {
        try {
            const configPath = path.join(__dirname, 'config.json');
            const configData = await fs.promises.readFile(configPath, 'utf-8');
            this.config = JSON.parse(configData);

            if (!this.config || !this.config.openaiapi || !this.config.openaiapi.apiKey) {
                throw new Error('Config not loaded or missing required fields');
            }

            // Set up config properties
            this.discordToken = this.config.discordToken;
            this.openaiapi = this.config.openaiapi;
            this.severityCategory = this.config.severityCategory;
            this.allowedChannelId = this.config.allowedChannelId;
            this.trainEmoji = this.config.trainEmoji;
            this.reactionCount = this.config.reactionCount;
            this.removePings = this.config.removePings;
            this.removeLinks = this.config.removeLinks;
            this.randomChannels = this.config.randomChannels || []; // Array of {channelId, chance}
            this.botState = 'Idle';

            console.log('Config loaded:', {
                modelId: this.config.openaiapi.modelId,
                temperature: this.config.openaiapi.temperature,
                frequencyPenalty: this.config.openaiapi.frequencyPenalty,
                presencePenalty: this.config.openaiapi.presencePenalty,
                maxTokens: this.config.openaiapi.maxTokens,
                randomChannels: this.randomChannels
            });
        } catch (error) {
            console.error('Error loading config:', error);
            throw new Error('Config not loaded');
        }
    }

    async promptForConfig() {
        const questions = [
            { name: 'discordToken', message: 'Enter your Discord bot token:' },
            { name: 'allowedChannelId', message: 'Enter the channel/thread ID for the bot:' },
            { name: 'trainEmoji', message: 'Enter the emoji used to save training data' },
            { name: 'reactionCount', message: 'How many reactions until we should save training data?' },
            { name: 'removePings', message: 'Remove Pings? (1 - Yes, 0 - No)' },
            { name: 'trainEmoji', message: 'Remove Links? (1- Yes, 0 - No)' }
        ];
        return inquirer.prompt(questions);
    }

    async stop() {
        try {
            if (this.client) {
                console.log('Bye Bucket!');
                await this.client.destroy();
                this.botState = 'Offline';
            }

            console.log('Bucket is asleep');
        } catch (error) {
            this.emit('error', error.message);
            this.latestError = `Error while stopping the bot: ${error}`;
        }
    };

    async logToFile(logData) {
        const logDirectory = 'logs'; // Directory to store log files
        const maxLogFileSize = 10 * 1024 * 1024; // 10 MB (in bytes)
        const currentDate = new Date().toISOString().slice(0, 10); // Get current date for log file name

        try {
            await fs.promises.mkdir(logDirectory, { recursive: true }); // Use fs.promises for asynchronous operations
            const logFileName = `${logDirectory}/bot_logs_${currentDate}.txt`;

            let fileStats;
            try {
                fileStats = await fs.promises.stat(logFileName);
            } catch (err) {
                this.botState = 'Creating Log File';
            }

            const logContent = `${logData}\n`;

            if (!fileStats || fileStats.size >= maxLogFileSize) {
                // Create a new log file if the current one is too large or doesn't exist
                await fs.promises.writeFile(logFileName, logContent);
            } else {
                // Append to the current log file
                await fs.promises.appendFile(logFileName, logContent);
            }

            this.botState = 'Writing to log file';
        } catch (error) {
            this.emit('error', error.message);
        }
    };

    async saveToJSONL(systemPrompt, userPrompt, aiResponse) {
        const data = {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: aiResponse }
            ]
        };
        try {
            const jsonlData = JSON.stringify(data) + '\n';
            await fs.promises.appendFile('saved-messages.jsonl', jsonlData);
            this.botState = 'Idle';
        } catch (error) {
            this.latestError = `Error saving data to JSONL file: ${error.message}`;
            this.emit('error', this.latestError);
        }
    }

    async getMessageChain(message, limit = 10) {
        let chain = [];
        let currentMessage = message;
        let count = 0;

        // Include the current message first
        let senderDisplayName = currentMessage.member ? currentMessage.member.user.username : currentMessage.author.username;
        // Sanitize the displayName and truncate if necessary
        senderDisplayName = senderDisplayName.replace(/[^a-zA-Z0-9_-]/g, '');
        if (senderDisplayName.length > 64) {
            senderDisplayName = senderDisplayName.substring(0, 64);
        }
        chain.push({
            role: currentMessage.author.id === this.client.user.id ? "assistant" : "user",
            name: senderDisplayName,
            content: currentMessage.content
        });

        // Now traverse the message references
        while (currentMessage.reference && currentMessage.reference.messageId && count < limit) {
            const referenceMessageId = currentMessage.reference.messageId;
            currentMessage = await currentMessage.channel.messages.fetch(referenceMessageId);

            if (currentMessage) {
                // Make sure to use `username` from `member.user` or `author`
                senderDisplayName = currentMessage.member ? currentMessage.member.user.username : currentMessage.author.username;
                //console.log('presanitized username:' + senderDisplayName);
                // Sanitize the username and truncate if necessary
                senderDisplayName = senderDisplayName.replace(/[^a-zA-Z0-9_-]/g, '');
                //console.log('sanitized username:' + senderDisplayName);
                if (senderDisplayName.length > 64) {
                    senderDisplayName = senderDisplayName.substring(0, 64);
                }
                chain.unshift({ // Prepend to chain
                    role: currentMessage.author.id === this.client.user.id ? "assistant" : "user",
                    name: senderDisplayName,
                    content: currentMessage.content
                });
            }
            count++;
        }

        // Remove any duplicates that might be caused by referencing messages
        const seen = new Set();
        const filteredChain = chain.filter(el => {
            const duplicate = seen.has(el.content);
            seen.add(el.content);
            return !duplicate;
        });

        return filteredChain;
    }

    async getImageDescription(imageUrl) {
        try {
            console.log('Getting image description for:', imageUrl);
            const response = await this.openai.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: [{
                    role: "user",
                    content: [{
                            type: "text",
                            text: "Please provide a description of this image."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: imageUrl
                            }
                        }
                    ]
                }],
                max_tokens: 300
            });

            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
                throw new Error('Vision API returned an invalid response');
            }

            console.log('Got image description:', response.choices[0].message.content);
            return response.choices[0].message.content;
        } catch (error) {
            console.error('Error getting image description:', error);
            this.emit('error', `Image analysis error: ${error.message}`);
            throw error;
        }
    }

    async processImage(imageUrl, userMessage = '') {
        try {
            this.botState = 'Processing Image';
            console.log('Processing image with message:', userMessage);

            // First, get a detailed description of the image
            const imageDescription = await this.getImageDescription(imageUrl);

            // Construct the messages array with clear separation between image context and user message
            const messages = [
                { role: "system", content: this.config.openaiapi.systemPrompt },
                {
                    role: "system",
                    content: `[Image Context: ${imageDescription}]`
                }
            ];

            // Add user message if provided
            if (userMessage.trim()) {
                messages.push({
                    role: "user",
                    content: userMessage
                });
            } else {
                messages.push({
                    role: "user",
                    content: "Bucket look at this"
                });
            }

            console.log('Sending image context to chat model...');
            // Get response from the fine-tuned model
            const response = await this.openai.chat.completions.create({
                messages: messages,
                model: this.config.openaiapi.modelId,
                temperature: parseFloat(this.config.openaiapi.temperature),
                frequency_penalty: parseFloat(this.config.openaiapi.frequencyPenalty),
                presence_penalty: parseFloat(this.config.openaiapi.presencePenalty),
                max_tokens: parseInt(this.config.openaiapi.maxTokens)
            });

            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
                throw new Error('Fine-tuned model returned an invalid response');
            }

            console.log('Got response from chat model');
            return response.choices[0].message.content;
        } catch (error) {
            console.error('Error processing image:', error);
            this.emit('error', `Image processing error: ${error.message}`);
            throw error;
        }
    }

    shouldRespondToMessage(message) {
        console.log('Checking if should respond to message:', {
            channelId: message.channelId,
            allowedChannelId: this.allowedChannelId,
            isPing: message.mentions.has(this.client.user),
            randomChannels: this.randomChannels
        });

        // Check if message is in allowed channel
        if (message.channelId === this.allowedChannelId) {
            // In allowed channel, only respond to pings
            const shouldRespond = message.mentions.has(this.client.user);
            console.log('Allowed channel check:', { shouldRespond });
            return shouldRespond;
        }

        // Check if message is in a random channel
        const randomChannel = this.randomChannels.find(ch => ch.channelId === message.channelId);
        if (randomChannel) {
            // Use the chance value directly since it's already in decimal format
            const chance = randomChannel.chance;
            const random = Math.random();
            const shouldRespond = random < chance;

            console.log('Random channel check:', {
                channelId: message.channelId,
                configuredChance: randomChannel.chance,
                randomNumber: random,
                shouldRespond
            });

            return shouldRespond;
        }

        // Not in allowed or random channel
        console.log('Message not in configured channels');
        return false;
    }

    async sendChatMessage(messages, channel) {
        try {
            const response = await this.openai.chat.completions.create({
                messages: messages,
                model: this.config.openaiapi.modelId,
                temperature: parseFloat(this.config.openaiapi.temperature),
                frequency_penalty: parseFloat(this.config.openaiapi.frequencyPenalty),
                presence_penalty: parseFloat(this.config.openaiapi.presencePenalty),
                max_tokens: parseInt(this.config.openaiapi.maxTokens)
            });

            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
                throw new Error('Fine-tuned model returned an invalid response');
            }

            // Check for blocked words in the response
            if (this.containsBlockedWords(response.choices[0].message.content)) {
                await channel.send("I apologize, but I cannot send a response containing inappropriate language.");
                return;
            }

            // Update token usage for fine-tuned model
            this.outputTokensUsed = parseInt(response.usage.completion_tokens);
            this.totalOutputTokensUsed += this.outputTokensUsed;
            this.totalTokensUsed += parseInt(response.usage.total_tokens);

            return response.choices[0].message.content;
        } catch (error) {
            this.emit('error', `Chat error: ${error.message}`);
            throw error;
        }
    }

    async getBlockedWords(severityCategory) {
        try {
            const csvData = await fs.promises.readFile('blockedwords.csv', 'utf8');
            const rows = csvData.split('\n').slice(1); // Skip header row
            const wordsWithSeverity = rows.map(row => {
                const columns = row.split(',');
                const word = columns[0].trim().toLowerCase(); // text column
                const severity = Number(columns[7].trim()); // severity_rating column
                return { word, severity };
            });

            //only block stuff greater than (or equal to) the severity
            return wordsWithSeverity.filter(entry => entry.severity >= severityCategory);
        } catch (error) {
            this.emit('error', `Failed to load blocked words: ${error.message}`);
            return [];
        }
    }

    emitUpdate() {
        return {
            botTag: this.botTag,
            botState: this.botState,
            totalPings: this.totalPings,
            blockedWordsCount: this.blockedWordsCount,
            trainingDataFromMessage: this.trainingDataFromMessage,
            totalTokensUsed: this.totalTokensUsed,
            inputTokensUsed: this.inputTokensUsed,
            totalInputTokensUsed: this.totalInputTokensUsed,
            outputTokensUsed: this.outputTokensUsed,
            totalOutputTokensUsed: this.totalOutputTokensUsed,
            response: this.responseContent,
            filteredResponse: this.filteredResponse
        };
    }

    addRecentMessage(messageData) {
        this.recentMessages.push(messageData);
        if (this.recentMessages.length > 10) { // keep only last 10
            this.recentMessages.shift();
        }
    }

    getRecentMessages() {
        return this.recentMessages;
    }

    async getMessageHistory(channel) {
        try {
            // Fetch last 10 messages from the channel
            const messages = await channel.messages.fetch({ limit: 10 });

            // Convert to array and reverse to get chronological order
            const messageArray = Array.from(messages.values()).reverse();

            // Format messages for the API
            const formattedMessages = messageArray.map(msg => {
                // Skip bot's own messages
                if (msg.author.id === this.client.user.id) return null;

                // Format user messages
                return {
                    role: "user",
                    content: msg.content
                };
            }).filter(msg => msg !== null); // Remove null entries

            console.log('Formatted message history:', formattedMessages.length, 'messages');
            return formattedMessages;
        } catch (error) {
            console.error('Error getting message history:', error);
            return []; // Return empty array if there's an error
        }
    }
}

module.exports = Bucket;