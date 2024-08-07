const EventEmitter = require('events');
const fs = require("fs");
const OpenAI = require("openai");
const Discord = require("discord.js");
const {Events} = require("discord.js");
//const { config } = require('process');
let inquirer;
let severityCategory;
let previousMessage = "";

async function getConfig(){
    //console.log('i hope config.json is there');
    try {
        configContents = await fs.promises.readFile('config.json', 'utf8');
        config = JSON.parse(configContents);
    } catch (error) {
        this.emit('error', error.message);
        //need to handle this case
    } return {
        config
    }
}

async function loadInquirer() {
    inquirer = (await import('inquirer')).default;
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
        this.recentMessages = [];
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
    async initialize() {
        await loadInquirer();
        await this.init();
        await getConfig();
        await this.loadConfig();
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

    async init() {
        //console.log('Getting OpenAI Ready');
        const configData = await getConfig();
        //console.log('Got OpenAI API Key!');
        const openaiapikey = configData.config.openaiapi.apiKey;
        //console.log(openaiapikey);
        this.botState = 'Waiting for AI';
        this.openai = new OpenAI({ apiKey: openaiapikey });
        this.processMessages();
    }
    async loadConfig() {
        try {
            //this.applyConfig(config);
            //console.log('Initializing settings');
            this.discordToken = config.discordToken;
            this.openaiapi = config.openaiapi;
            this.severityCategory = config.severityCategory;
            this.allowedChannelId = config.allowedChannelId;
            this.trainEmoji = config.trainEmoji;
            this.reactionCount = config.reactionCount;
            this.removePings = config.removePings;
            this.removeLinks = config.removeLinks;
            this.severityCategory = config.severityCategory;
            severityCategory = this.severityCategory
            this.botState = 'Idle';
            this.botTag = '[connecting to discord]';
            this.totalPings = 0;
            this.blockedWordsCount = 0;
            this.trainingDataFromMessage = 0;
            this.totalTokensUsed = 0;
            this.inputTokensUsed = 0;
            this.outputTokensUsed = 0;
            this.totalInputTokensUsed = 0;
            this.totalOutputTokensUsed = 0;
            this.latestError = 'none!';
            this.filteredResponse = '';
            this.userMessageContent = '';
            this.originalMessage = '';
        } catch (error) {
            this.emit('error', error.message);
        }
    }

    async promptForConfig() {
        const questions = [
            { name: 'discordToken', message: 'Enter your Discord bot token:' },
            { name: 'allowedChannelId', message: 'Enter the channel/thread ID for the bot:' },
            { name: 'trainEmoji', message: 'Enter the emoji used to save training data'},
            { name: 'reactionCount', message: 'How many reactions until we should save training data?'},
            { name: 'removePings', message: 'Remove Pings? (1 - Yes, 0 - No)'},
            { name: 'trainEmoji', message: 'Remove Links? (1- Yes, 0 - No)'}
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
    }

    async logToFile(logData){
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
                //try to save in chat completion format
            ]
        };
        try {
            const jsonlData = JSON.stringify(data) + '\n';
            await fs.appendFileSync('saved-messages.jsonl', jsonlData);
            botState = 'Idle';
        } catch (error) {
            this.latestError = 'Error saving data to JSONL file:', error;
        }
    };

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
    
    async processMessages(){
        try {
            const getBlockedWords = async(severityCategory) => {
                try {
                    //block slurs
                    const csvData = await fs.readFileSync('blockedwords.csv', 'utf8');
                    const rows = csvData.split('\n').slice(1); // Skip header row
                    const wordsWithSeverity = rows.map(row => {
                        const columns = row.split(',');
                        const word = columns[0].trim().toLowerCase(); // text column
                        const severity = Number(columns[7].trim()); // severity_rating column
                        return { word, severity };
                    });
    
                    //only block stuff greater than (or equal to) the severity
                    const filteredWords = wordsWithSeverity.filter(entry => entry.severity >= severityCategory);
                    return filteredWords;
                } catch (error) {
                    this.emit('error', error.message);
                    return [];
                }
            };
    
            const sendChatMessage = async (messages, sender) => {
                try {
                    const configData = await getConfig();
                    const systemPrompt = configData.config.openaiapi.systemPrompt;
                    const modelId = configData.config.openaiapi.modelId;
                    // const temperature = parseInt(configData.config.openaiapi.temperature);
                    // const maxTokens = parseInt(configData.config.openaiapi.maxTokens);
                    // const frequencyPenalty = parseInt(configData.config.openaiapi.frequencyPenalty);
                    // const presencePenalty = parseInt(configData.config.openaiapi.presencePenalty);
                    this.botState = 'Waiting for AI';
            
                    const userMessage = messages[0].content;
                    
                    const completions = await this.openai.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...messages
                        ],
                        model: modelId,
                        frequency_penalty: parseFloat(configData.config.openaiapi.frequencyPenalty),
                        presence_penalty: parseFloat(configData.config.openaiapi.presencePenalty),
                        temperature: parseFloat(configData.config.openaiapi.temperature),
                        max_tokens: parseInt(configData.config.openaiapi.maxTokens)
                    });
            
                    if (completions.choices && completions.choices.length > 0) {
                        const responseContent = completions.choices[0].message.content;
                        // Update usage statistics
                        this.outputTokensUsed = parseInt(completions.usage.completion_tokens);
                        this.totalOutputTokensUsed += this.outputTokensUsed;
                        this.inputTokensUsed = parseInt(completions.usage.prompt_tokens);
                        this.totalInputTokensUsed += this.inputTokensUsed;
                        this.totalTokensUsed += parseInt(completions.usage.total_tokens);
                        return responseContent;
                    } else {
                        this.emit('error', `OpenAI Issue, check your settings`);
                        return '[OpenAI Error - No valid response]';
                    }
                } catch (error) {
                    this.emit('error', error.message);
                    return "[Generic Error - probably OpenAI]";
                }
            };

            
    
            this.client.on('ready', () => {
                this.botTag = this.client.user.tag;
            });
    
            this.client.on(Events.MessageReactionAdd, async(reaction, user) => {
                if (
                    reaction.count == this.reactionCount &&
                    reaction.emoji.name === this.trainEmoji &&
                    user.id !== this.client.user.id &&
                    reaction.message.author.id === this.client.user.id // Ensure reaction is on bot's message
                ) {
                    this.trainingDataFromMessage++;
                    this.botState = 'Logging for Training';
                    const configData = await getConfig();
                    const trainingPrompt = configData.config.openaiapi.systemPrompt;
                    // const systemPrompt = config.systemPrompt;
                    const userPrompt = this.userMessageContent;
                    //const userPrompt = reaction.message.fetch(message.reference.messageID); //should return the original message?
                    //according to stackoverflow, this can cause bugs, so we should wrap this in a try/catch or something similar
                    //i will find a better solution when i get home 
                    const aiResponse = reaction.message.content;
                    await saveToJSONL(trainingPrompt, userPrompt, aiResponse);
                }
            });
    
            this.client.on('messageCreate', async(message) => {
                const configData = await getConfig();
                if (message.channelId == this.allowedChannelId && message.mentions.has(this.client.user)) {
                    //console.log('got message in channel');
                    await message.channel.sendTyping();
                    this.totalPings++;
                    this.botState = `Activated by ${message.author.tag}`;
                    //console.log(`Got Ping! It's from ${message.author.tag}`);
                    
                    const sender = message.author.displayName.replace(/[^a-zA-Z0-9_-]/g, '');;
                    
                    
                    
                    this.originalMessage = message.content.replace(/<@!\d+>/g, '').replace(`<@${this.client.user.id}>`, '').trim(); //dont send the ping to the ai
                    //this.originalMessage = sender + ": " + this.originalMessage;
                    const isReply = message.reference && message.reference.messageId;
                    let messagesArray;
                    if (isReply) {
                        // If the message is a reply, get the message chain
                        messagesArray = await this.getMessageChain(message);

                        //console.log('message is a reply')
                        //console.log(messagesArray);
                    } else {
                        // If it's not a reply, just use the current message
                        messagesArray = [{ role: "user", name: `${sender}`, content: `${this.originalMessage}` }];
                        //console.log('message is not a reply')
                        //console.log(messagesArray);
                    }
                    // Call sendChatMessage with the constructed messages array
                    const response = await sendChatMessage(messagesArray, sender).catch(error => {
                        this.emit('error', error.message);
                        console.log(error.message);
                        return null;
                    });
                    this.userMessageContent = this.originalMessage;
                    let logData = `${this.originalMessage}`;
                    const input = this.originalMessage;
                    //this.inputTokensUsed = input.split(' ').length; // Count input tokens
                    // const response = await sendChatMessage(input, sender).catch(error => {
                    //     this.emit('error', error.message);
                    //     return null;
                    //});
    
                    if (response) {
                        this.botState = 'Processing Reply';
                        const blockedWords = await getBlockedWords(configData.config.severityCategory);
                        //1984 module
                        this.filteredResponse = response.replace(/<@!\d+>/g, ``) //remove ping tags (<@bunchofnumbers>)
                        this.filteredResponse = response.replace(`Bucket: `, ``)
                        if (configData.config.removeLinks == 1) {
                            this.filteredResponse.replace(/(https?:\/\/[^\s]+)/gi, '~~link removed~~'); //replace links with link removed
                        }
                        if (configData.config.removePings == 1) {
                            this.filteredResponse.replace(/@/g, '@\u200B'); //place invisible space between @ and words so bot can't ping
                        }
                        //slur filtering
                        blockedWords.forEach(word => {
                            const regex = new RegExp(`\\b${word.word}\\b|${word.word}(?=[\\W]|$)`, 'gi');
                            if (this.filteredResponse.match(regex)) {
                                this.blockedWordsCount++; // Increment blocked words counter for each match found
                            }
                            this.filteredResponse = this.filteredResponse.replace(regex, 'nt'); //temporary, seems we have something tripping up the filter, especially on words ending in "nt", like "want"
                        });
    
                        //ok time to find some emojis
                        const emojiRegex = /:[a-zA-Z0-9_]+:/g;
                        const matchedEmojis = this.filteredResponse.match(emojiRegex);
                        //if we found some, we need to do some work to let the bot send them
                        if (matchedEmojis) {
                            matchedEmojis.forEach(match => {
                                const emojiName = match.split(':')[1]; // remove the colons, discord.js doesn't want them
                                const emoji = this.client.emojis.cache.find(emoji => emoji.name === emojiName); //then just search for the emote
                                //this should reset each message, but we'll find out if it doesnt.
                                if (emoji) {
                                    // If the emoji is found, replace the matched string with the actual emoji
                                    this.filteredResponse = this.filteredResponse.replace(match, emoji.toString());
                                }
                                // we do not care if the emote is not found (its funnier), so we don't handle this case.
                            });
                        }

                        //log here
                        previousMessage = this.filteredResponse;
                        try {
                            this.botState = 'Sending Message';
                            
                            await message.reply({
                                content: this.filteredResponse,
                                allowedMentions: { repliedUser: false }
                            });
                            this.botState = 'Sent Message';
                            
                        } catch (error) {
                            this.emit('error', error.message);
                        }
                    } else {
                        this.emit('error', 'Generic Error');
                    }
                    this.botState = 'Logging Data';
                    logData += `\nInput Tokens Used: ${this.inputTokensUsed}`; // Append input tokens used to log data
                    logData += `\nOutput Tokens Used: ${this.outputTokensUsed}`; // Append output tokens used to log data
                    logData += `\nTotal Tokens Used: ${this.totalTokensUsed} - Total Input:${this.totalInputTokensUsed} - Total Output:${this.totalOutputTokensUsed}`; // Append total tokens used to log data
                    logData += '\n--';
                    logData += `\nPre-Filter: ${response}`;
                    logData += '\n--';
                    logData += `\nFiltered: ${this.filteredResponse}`;
                    logData += '\n------------------------------------';
                    await this.logToFile(logData); // Write log data to file
                    let messageData = {
                        sender: sender,
                        originalMessage: this.originalMessage,
                        preFilteredMessage: response,
                        filteredMessage: this.filteredResponse,
                        inputTokensUsed: this.inputTokensUsed,
                        outputTokensUsed: this.outputTokensUsed,
                        totalTokensUsed: this.totalTokensUsed,
                        totalInputTokensUsed: this.totalInputTokensUsed,
                        totalOutputTokensUsed: this.totalOutputTokensUsed
                    };
                    
                    this.addRecentMessage(messageData);
                    this.botState = 'Idle';
                    
    
    
                }
            });
            
            //console.log('Getting Discord Token');
            const configData = await getConfig();
            //console.log('Got Discord Token!');
            const discordToken = configData.config.discordToken;
            await this.client.login(discordToken);
        } catch (error) {
            this.emit('error', error.message);
        }
    };

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

}

module.exports = Bucket;