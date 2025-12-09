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
        this.maxHistoryTokens = 1024;
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
        this.recentResponses = [];
        this.maxRecentResponses = 15;
        this.recentMessageChains = [];
        this.maxRecentMessageChains = 15;
        this.startTime = Date.now()
        this.totalMessagesProcessed = 0;
        this.totalImagesProcessed = 0;
        this.lastResponseTime = null;
        this.uiOpen = false;
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
        // historyAgeMinutes and logHistoryFiltering are loaded from config in loadConfig
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

            // Display initial status
            this.displayStatus();
        });

        this.client.on('messageCreate', async(message) => {
            try {
                // Reload config before processing each message
                await this.loadConfig();

                // Ignore messages from the bot itself for response generation
                if (message.author.id === this.client.user.id) {
                    return;
                }

                // Check if we should respond to this message
                const shouldRespond = this.shouldRespondToMessage(message);

                if (!shouldRespond) {
                    return;
                }

                // Increment message counter
                this.totalMessagesProcessed++;

                // Increment ping counter if it's a ping
                if (message.mentions.has(this.client.user)) {
                    this.totalPings++;
                }

                // Start typing indicator
                await message.channel.sendTyping();

                // Keep typing indicator active during processing
                const typingInterval = setInterval(() => {
                    message.channel.sendTyping();
                }, 8000); // Send typing every 8 seconds

                try {
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
                    const history = await this.getMessageHistory(message.channel, message.id);

                    // Process any images in the message
                    const imageAttachments = message.attachments.filter(attachment =>
                        attachment.contentType && attachment.contentType.startsWith('image/')
                    );

                    let response;
                    let finalUserMessage = this.userMessageContent;

                    if (imageAttachments.size > 0) {
                        // Increment image counter
                        this.totalImagesProcessed++;

                        // Process the first image
                        const imageUrl = imageAttachments.first().url;
                        const imageDescription = await this.getImageDescription(imageUrl);

                        // Create the user message with image description
                        finalUserMessage = `[Image: ${imageDescription}] ${this.userMessageContent}`;

                        // Add image description to message history
                        const messagesArray = [
                            { role: "system", name: this.botTag || "Bucket", content: this.config.openaiapi.systemPrompt },
                            ...history,
                            { role: "user", name: this.sanitizeUsername(message.member ? message.member.displayName : message.author.username), content: finalUserMessage }
                        ];

                        response = await this.sendChatMessage(messagesArray, message.channel, finalUserMessage, this.sanitizeUsername(message.member ? message.member.displayName : message.author.username)).catch(error => {
                            console.error('Error sending chat message:', error);
                            this.emit('error', error.message);
                            return null;
                        });
                    } else {
                        // Process text message with history
                        const messagesArray = [
                            { role: "system", name: this.botTag || "Bucket", content: this.config.openaiapi.systemPrompt },
                            ...history,
                            { role: "user", name: this.sanitizeUsername(message.member ? message.member.displayName : message.author.username), content: finalUserMessage }
                        ];

                        response = await this.sendChatMessage(messagesArray, message.channel, finalUserMessage, this.sanitizeUsername(message.member ? message.member.displayName : message.author.username)).catch(error => {
                            console.error('Error sending chat message:', error);
                            this.emit('error', error.message);
                            return null;
                        });
                    }

                    if (response) {
                        await message.reply({
                            content: response,
                            allowedMentions: { repliedUser: false }
                        });

                        // Update last response time
                        this.lastResponseTime = Date.now();

                        // Display status every 10 messages
                        if (this.totalMessagesProcessed % 10 === 0) {
                            this.displayStatus();
                        }
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
                    // Exclude referenced messages older than configured minutes
                    const cutoff = Date.now() - ( (this.historyAgeMinutes || 15) * 60 * 1000 );
                    if (referencedMessage.createdTimestamp < cutoff) {
                        return history;
                    }
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
            // How old messages can be to include in history (in minutes)
            this.historyAgeMinutes = typeof this.config.historyAgeMinutes === 'number' ? this.config.historyAgeMinutes : 15;
            this.logHistoryFiltering = !!this.config.logHistoryFiltering;
            this.botState = 'Idle';

            // Update max history tokens based on model
            this.updateMaxHistoryTokens();
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
        //senderDisplayName = senderDisplayName.replace(/[^a-zA-Z0-9_-]/g, '');
        if (senderDisplayName.length > 64) {
            senderDisplayName = senderDisplayName.substring(0, 64);
        }
        chain.push({
            role: currentMessage.author.id === this.client.user.id ? "assistant" : "user",
            name: senderDisplayName,
            content: currentMessage.content
        });

        // Cutoff timestamp to avoid including old messages (configurable)
        const cutoff = Date.now() - ((this.historyAgeMinutes || 15) * 60 * 1000);

        // Now traverse the message references
        while (currentMessage.reference && currentMessage.reference.messageId && count < limit) {
            const referenceMessageId = currentMessage.reference.messageId;
            currentMessage = await currentMessage.channel.messages.fetch(referenceMessageId);

            if (currentMessage) {
                // Skip adding referenced messages older than cutoff
                if (currentMessage.createdTimestamp < cutoff) {
                    break;
                }
                // Make sure to use `username` from `member.user` or `author`
                senderDisplayName = currentMessage.member ? currentMessage.member.user.username : currentMessage.author.username;
                //console.log('presanitized username:' + senderDisplayName);
                // Sanitize the username and truncate if necessary
                //senderDisplayName = senderDisplayName.replace(/[^a-zA-Z0-9_-]/g, '');
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
                { role: "system", name: this.botTag || "Bucket", content: this.config.openaiapi.systemPrompt },
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
        // Check if message is in allowed channel
        if (message.channelId === this.allowedChannelId) {
            // In allowed channel, only respond to pings
            const shouldRespond = message.mentions.has(this.client.user);
            return shouldRespond;
        }

        // Check if message is in a random channel
        const randomChannel = this.randomChannels.find(ch => ch.channelId === message.channelId);
        if (randomChannel) {
            // Use the chance value directly since it's already in decimal format
            const chance = randomChannel.chance;
            const random = Math.random();
            const shouldRespond = random < chance;

            return shouldRespond;
        }

        // Not in allowed or random channel
        return false;
    }

    isCopyingUserMessage(response, userMessage) {
        if (!userMessage || !response) return false;

        const userLower = userMessage.toLowerCase().trim();
        const responseLower = response.toLowerCase().trim();

        // Check for exact copying
        if (responseLower === userLower) {
            return true;
        }

        // Check if response starts with the user's message
        if (responseLower.startsWith(userLower) && userLower.length > 10) {
            return true;
        }

        // Check for high similarity (more than 70% word overlap)
        const userWords = new Set(userLower.split(/\s+/));
        const responseWords = new Set(responseLower.split(/\s+/));

        const intersection = new Set([...userWords].filter(x => responseWords.has(x)));
        const union = new Set([...userWords, ...responseWords]);

        const similarity = intersection.size / union.size;
        return similarity > 0.7;
    }

    // Helper function to check if response is too similar to recent responses
    isSimilarToRecentResponses(response) {
        if (this.recentResponses.length === 0) {
            return false;
        }

        const responseLower = response.toLowerCase().trim();

        for (const recentResponse of this.recentResponses) {
            const recentLower = recentResponse.content.toLowerCase().trim();

            // Check for exact matches
            if (responseLower === recentLower) {
                return true;
            }

            // Check for high similarity (if more than 80% of words match)
            const responseWords = new Set(responseLower.split(/\s+/));
            const recentWords = new Set(recentLower.split(/\s+/));

            const intersection = new Set([...responseWords].filter(x => recentWords.has(x)));
            const union = new Set([...responseWords, ...recentWords]);

            const similarity = intersection.size / union.size;
            if (similarity > 0.8) {
                return true;
            }
        }

        return false;
    }

    // Helper function to add response to recent responses
    addToRecentResponses(response, originalMessage = null, originalSender = null) {
        const responseData = {
            content: response,
            timestamp: Date.now(),
            originalMessage: originalMessage,
            originalSender: originalSender
        };
        this.recentResponses.push(responseData);
        if (this.recentResponses.length > this.maxRecentResponses) {
            this.recentResponses.shift();
        }
    }

    // Helper function to add message chain to recent message chains
    addToRecentMessageChains(messageChain) {
        this.recentMessageChains.push(messageChain);
        if (this.recentMessageChains.length > this.maxRecentMessageChains) {
            this.recentMessageChains.shift();
        }
    }

    async sendChatMessage(messages, channel, originalMessage = null, originalSender = null) {
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

            const responseContent = response.choices[0].message.content;

            // Check for blocked words in the response
            if (this.containsBlockedWords(responseContent)) {
                this.blockedWordsCount++;
                console.log('Blocked word detected, giving up.');
                return;
            }

            // Check if response is copying the user message
            const lastMessage = messages[messages.length - 1];
            const userMessage = lastMessage && lastMessage.content ? lastMessage.content : '';
            if (this.isCopyingUserMessage(responseContent, userMessage)) {
                console.log('Response is copying user message, regenerating...');
                // Add instructions to be original
                const updatedMessages = [
                    ...messages.slice(0, -1), // Keep all messages except the last user message
                    { role: "system", name: this.botTag || "Bucket", content: "IMPORTANT: Do not copy or repeat what the user said, say something original." },
                    messages[messages.length - 1] // Add the last user message back
                ];

                // Try again with updated messages and higher temperature
                const retryResponse = await this.openai.chat.completions.create({
                    messages: updatedMessages,
                    model: this.config.openaiapi.modelId,
                    temperature: Math.min(parseFloat(this.config.openaiapi.temperature) + 0.3, 1.0), // Increase temperature more
                    frequency_penalty: parseFloat(this.config.openaiapi.frequencyPenalty),
                    presence_penalty: parseFloat(this.config.openaiapi.presencePenalty),
                    max_tokens: parseInt(this.config.openaiapi.maxTokens)
                });

                if (retryResponse && retryResponse.choices && retryResponse.choices[0] && retryResponse.choices[0].message && retryResponse.choices[0].message.content) {
                    const retryContent = retryResponse.choices[0].message.content;

                    // Check blocked words again
                    if (this.containsBlockedWords(retryContent)) {
                        this.blockedWordsCount++;
                        console.log('Blocked word detected, giving up.');
                        return;
                    }

                    // Check copying again
                    if (this.isCopyingUserMessage(retryContent, userMessage)) {
                        console.log('Retry response still copying, giving up.');
                        return;
                    }

                    // Add to recent responses and return
                    this.addToRecentResponses(retryContent, originalMessage, originalSender);

                    // Store the message chain for UI display
                    const messageChainWithResponse = [...updatedMessages, { role: "assistant", name: this.botTag || "Bucket", content: retryContent }];
                    this.addToRecentMessageChains(messageChainWithResponse);

                    // Update token usage
                    this.inputTokensUsed = parseInt(retryResponse.usage.prompt_tokens);
                    this.totalInputTokensUsed += this.inputTokensUsed;
                    this.outputTokensUsed = parseInt(retryResponse.usage.completion_tokens);
                    this.totalOutputTokensUsed += this.outputTokensUsed;
                    this.totalTokensUsed += parseInt(retryResponse.usage.total_tokens);

                    return retryContent;
                }
            }

            // Check if response is too similar to recent responses
            if (this.isSimilarToRecentResponses(responseContent)) {
                console.log('Response too similar to recent responses, regenerating...');
                // Add a note to the system prompt to encourage variety
                const updatedMessages = [
                    ...messages.slice(0, -1), // Keep all messages except the last user message
                    { role: "system", name: this.botTag || "Bucket", content: "Please provide a different response than what you've said recently. Be creative and varied in your responses." },
                    messages[messages.length - 1] // Add the last user message back
                ];

                // Try again with updated messages
                const retryResponse = await this.openai.chat.completions.create({
                    messages: updatedMessages,
                    model: this.config.openaiapi.modelId,
                    temperature: Math.min(parseFloat(this.config.openaiapi.temperature) + 0.2, 1.0), // Increase temperature slightly
                    frequency_penalty: parseFloat(this.config.openaiapi.frequencyPenalty),
                    presence_penalty: parseFloat(this.config.openaiapi.presencePenalty),
                    max_tokens: parseInt(this.config.openaiapi.maxTokens)
                });

                if (retryResponse && retryResponse.choices && retryResponse.choices[0] && retryResponse.choices[0].message && retryResponse.choices[0].message.content) {
                    const retryContent = retryResponse.choices[0].message.content;

                    // Check blocked words again
                    if (this.containsBlockedWords(retryContent)) {
                        this.blockedWordsCount++;
                        console.log('Blocked word detected, giving up.');
                        return;
                    }

                    // Add to recent responses and return
                    this.addToRecentResponses(retryContent, originalMessage, originalSender);

                    // Store the message chain for UI display
                    const messageChainWithResponse = [...updatedMessages, { role: "assistant", name: this.botTag || "Bucket", content: retryContent }];
                    this.addToRecentMessageChains(messageChainWithResponse);

                    // Update token usage
                    this.inputTokensUsed = parseInt(retryResponse.usage.prompt_tokens);
                    this.totalInputTokensUsed += this.inputTokensUsed;
                    this.outputTokensUsed = parseInt(retryResponse.usage.completion_tokens);
                    this.totalOutputTokensUsed += this.outputTokensUsed;
                    this.totalTokensUsed += parseInt(retryResponse.usage.total_tokens);

                    return retryContent;
                }
            }

            // Add response to recent responses
            this.addToRecentResponses(responseContent, originalMessage, originalSender);

            // Store the message chain for UI display
            const messageChainWithResponse = [...messages, { role: "assistant", name: this.botTag || "Bucket", content: responseContent }];
            this.addToRecentMessageChains(messageChainWithResponse);

            // Update token usage for fine-tuned model
            this.inputTokensUsed = parseInt(response.usage.prompt_tokens);
            this.totalInputTokensUsed += this.inputTokensUsed;
            this.outputTokensUsed = parseInt(response.usage.completion_tokens);
            this.totalOutputTokensUsed += this.outputTokensUsed;
            this.totalTokensUsed += parseInt(response.usage.total_tokens);

            return responseContent;
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
            filteredResponse: this.filteredResponse,
            uptime: this.getUptime(),
            totalMessagesProcessed: this.totalMessagesProcessed,
            totalImagesProcessed: this.totalImagesProcessed,
            lastResponseTime: this.lastResponseTime,
            recentResponses: this.recentResponses.slice(-15),
            messageChains: this.recentMessageChains.slice(-15).reverse(), // Reverse to match UI order
            // Model configuration data
            modelId: this.config && this.config.openaiapi && this.config.openaiapi.modelId ? this.config.openaiapi.modelId : 'Unknown',
            temperature: this.config && this.config.openaiapi && this.config.openaiapi.temperature ? this.config.openaiapi.temperature : 'Unknown',
            frequencyPenalty: this.config && this.config.openaiapi && this.config.openaiapi.frequencyPenalty ? this.config.openaiapi.frequencyPenalty : 'Unknown',
            presencePenalty: this.config && this.config.openaiapi && this.config.openaiapi.presencePenalty ? this.config.openaiapi.presencePenalty : 'Unknown',
            maxTokens: this.config && this.config.openaiapi && this.config.openaiapi.maxTokens ? this.config.openaiapi.maxTokens : 'Unknown',
            randomChannels: this.randomChannels || []
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

    // Helper function to sanitize username for API use
    sanitizeUsername(username) {
        if (!username) return 'User';

        // Filter out special characters and limit length
        //let sanitized = username.replace(/[^a-zA-Z0-9_-]/g, '');
        if (sanitized.length > 64) {
            sanitized = sanitized.substring(0, 64);
        }

        // Ensure username is not empty after filtering
        if (!sanitized || sanitized.length === 0) {
            sanitized = 'User';
        }

        return sanitized;
    }

    async getMessageHistory(channel, currentMessageId = null) {
        try {
            // Fetch last 15 messages from the channel (increased to get more messages after filtering)
            const messages = await channel.messages.fetch({ limit: 15 });

            // Convert to array and reverse to get chronological order
            const messageArray = Array.from(messages.values()).reverse();

            // Filter out empty messages, emoji-only messages, and the current message if provided
            const cutoff = Date.now() - ((this.historyAgeMinutes || 15) * 60 * 1000); // configured minutes ago
            const filteredMessages = messageArray.filter(msg => {
                // Skip the current message if it's provided
                if (currentMessageId && msg.id === currentMessageId) {
                    return false;
                }

                // Skip empty messages or messages that are just whitespace
                if (!msg.content || msg.content.trim().length === 0) {
                    return false;
                }

                // Skip messages that are just emojis or reactions
                if (msg.content.match(/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u)) {
                    return false;
                }

                // Skip messages older than cutoff (15 minutes)
                if (msg.createdTimestamp < cutoff) {
                    return false;
                }

                return true;
            });

            // Limit to last 10 messages to prevent context overflow
            const limitedMessages = filteredMessages.slice(-10);

            // Format messages for the API with proper role assignment and usernames
            const formattedMessages = limitedMessages.map(msg => {
                // Get username and filter out special characters
                let username = msg.member ? msg.member.displayName : msg.author.username;

                // Filter out special characters and limit length
                username = this.sanitizeUsername(username);

                return {
                    role: msg.author.id === this.client.user.id ? "assistant" : "user",
                    name: username,
                    content: msg.content
                };
            });

            return formattedMessages;
        } catch (error) {
            console.error('Error getting message history:', error);
            return []; // Return empty array if there's an error
        }
    }

    // Helper function to format uptime
    getUptime() {
        const uptime = Date.now() - this.startTime;
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    // Helper function to get recent responses for display
    getRecentResponsesDisplay() {
        if (this.recentResponses.length === 0) {
            return "None";
        }

        return this.recentResponses.slice(-3).map((response, index) => {
            const truncated = response.content.length > 50 ? response.content.substring(0, 50) + '...' : response.content;
            return `${index + 1}. "${truncated}"`;
        }).join('\n    ');
    }

    // Method to set UI state
    setUIState(isOpen) {
        this.uiOpen = isOpen;
    }

    // Display comprehensive bot status
    displayStatus() {
        // Only display status if UI is not open
        if (this.uiOpen) {
            return;
        }

        const uptime = this.getUptime();
        const recentResponses = this.getRecentResponsesDisplay();
        const lastResponse = this.lastResponseTime ? new Date(this.lastResponseTime).toLocaleTimeString() : 'Never';

        console.log('\n' + '='.repeat(60));
        console.log('BUCKET BOT STATUS');
        console.log('='.repeat(60));
        console.log(`State: ${this.botState}`);
        console.log(`Uptime: ${uptime}`);
        console.log(`Bot Tag: ${this.botTag || 'Not set'}`);
        console.log(`Model: ${this.config?.openaiapi?.modelId || 'Unknown'}`);
        console.log(`Temperature: ${this.config?.openaiapi?.temperature || 'Unknown'}`);
        console.log(`Frequency Penalty: ${this.config?.openaiapi?.frequencyPenalty || 'Unknown'}`);
        console.log(`Presence Penalty: ${this.config?.openaiapi?.presencePenalty || 'Unknown'}`);
        console.log(`Max Tokens: ${this.config?.openaiapi?.maxTokens || 'Unknown'}`);
        console.log(`Random Channels: ${this.randomChannels?.length || 0} configured`);
        console.log(`Blocked Words Count: ${this.blockedWordsCount}`);
        console.log(`Last Response: ${lastResponse}`);
        console.log(`Total Tokens Used: ${this.totalTokensUsed.toLocaleString()}`);
        console.log(`Input Tokens: ${this.totalInputTokensUsed.toLocaleString()}`);
        console.log(`Output Tokens: ${this.totalOutputTokensUsed.toLocaleString()}`);
        console.log(`Recent Responses:`);
        console.log(`    ${recentResponses}`);
        console.log('='.repeat(60) + '\n');
    }

    // Method to manually display status (can be called from external scripts)
    showStatus() {
        this.displayStatus();
    }
}

module.exports = Bucket;