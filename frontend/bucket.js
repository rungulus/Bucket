const EventEmitter = require('events');
const fs = require("fs");
const OpenAI = require("openai");
const Discord = require("discord.js");
const {Events} = require("discord.js");
let inquirer;
let severityCategory;
async function loadInquirer() {
    inquirer = (await import('inquirer')).default;
}

class Bucket extends EventEmitter {
    constructor() {
        super();
        this.client = new Discord.Client({
            intents: [
                Discord.GatewayIntentBits.Guilds,
                Discord.GatewayIntentBits.GuildMessages,
                Discord.GatewayIntentBits.GuildMessageReactions
            ],
            partials: [
                Discord.Partials.Message,
                Discord.Partials.Channel,
                Discord.Partials.Reaction
            ]
        });
    }
    async initialize() {
        await loadInquirer();
        await this.init();
    }

    async init() {
        try {
            let config;
            console.log('checking config.json');
            try {
                config = JSON.parse(await fs.promises.readFile('config.json', 'utf8'));
            } catch (error) {
                console.log('config.json not found. Please enter the configuration details.');
                config = await this.promptForConfig();
                await fs.promises.writeFile('config.json', JSON.stringify(config, null, 2));
                console.log('Configuration saved to config.json.');
            }
            this.applyConfig(config);
            console.log('getting ready');
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
        console.error('Error during initialization:', error);
    }
        console.log('starting openai');
        this.openai = new OpenAI({ apiKey: this.openaiapi.apiKey });
        this.processMessages();
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
    applyConfig(config) {
        console.log('saving config.json');
        this.discordToken = config.discordToken;
        this.openaiapi = config.openaiapi;
        this.severityCategory = config.severityCategory;
        this.allowedChannelId = config.allowedChannelId;
        this.trainEmoji = config.trainEmoji;
        this.reactionCount = config.reactionCount;
        this.removePings = config.removePings;
        this.removeLinks = config.removeLinks;
    }

    async stop() {
        try {
            if (this.client) {
                console.log('Bye Bucket!');
                await this.client.destroy();
                this.botState = 'Offline';
                this.emitUpdate();
            }

            console.log('Bot stopped gracefully.');
        } catch (error) {
            console.error('Error while stopping the bot:', error);
            this.latestError = `Error while stopping the bot: ${error}`;
            this.emitUpdate();
        }
    }

    emitUpdate() {
        console.log('Updating UI');
        this.emit('update', {
            botTag: this.botTag,
            botState: this.botState,
            totalPings: this.totalPings,
            blockedWordsCount: this.blockedWordsCount,
            trainingDataFromMessage: this.trainingDataFromMessage,
            totalTokensUsed: this.totalTokensUsed,
            inputTokensUsed: this.inputTokensUsed,
            totalInputTokensUsed: this.totalInputTokensUsed,
            outputTokensUsed: this.outputTokensUsed,
            totalOutputTokensUsed: this.totalOutputTokensUsed
        });
    }
    
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
            latestError = 'Error saving data to JSONL file:', error;
        }
    };
    
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
                    console.log('Error reading blocked words:', error);
                    return [];
                }
            };
    
            const sendChatMessage = async(message) => {
                try {
                    botState = 'Waiting for AI';
                    
                    const completions = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: `${systemPrompt}` },
                            { role: "user", content: `${message}` }
                        ],
                        model: `${modelId}`,
                        frequency_penalty: frequencyPenalty,
                        presence_penalty: presencePenalty,
                        temperature: temperature,
                        max_tokens: maxTokens
                    });
    
                    if (completions.choices && completions.choices.length > 0) {
                        const responseContent = completions.choices[0].message.content;
                        console.log('Response Content:', responseContent);
                        outputTokensUsed = parseInt(completions.usage.completion_tokens);
                        totalOutputTokensUsed += outputTokensUsed;
                        inputTokensUsed = parseInt(completions.usage.prompt_tokens);
                        totalInputTokensUsed += inputTokensUsed;
                        totalTokensUsed += parseInt(completions.usage.total_tokens);
                        return responseContent;
                    } else {
                        console.log('No valid response received from the bot.');
                        return '[OpenAI Error - No valid response]';
                    }
                } catch (error) {
                    return "[Generic Error - probably OpenAI]";
                }
            };
    
            const blockedWords = await getBlockedWords(severityCategory);
    
            this.client.on('ready', () => {
                this.botTag = this.client.user.tag;
            });
    
            this.client.on(Events.MessageReactionAdd, async(reaction, user) => {
                if (
                    reaction.count == reactionCount &&
                    reaction.emoji.name === trainEmoji &&
                    user.id !== this.client.user.id &&
                    reaction.message.author.id === this.client.user.id // Ensure reaction is on bot's message
                ) {
                    trainingDataFromMessage++;
                    botState = 'Logging for Training';
                    
                    // const systemPrompt = config.systemPrompt;
                    const userPrompt = userMessageContent;
                    //const userPrompt = reaction.message.fetch(message.reference.messageID); //should return the original message?
                    //according to stackoverflow, this can cause bugs, so we should wrap this in a try/catch or something similar
                    //i will find a better solution when i get home 
                    const aiResponse = reaction.message.content;
                    await saveToJSONL(systemPrompt, userPrompt, aiResponse);
                }
            });
    
            this.client.on('messageCreate', async(message) => {
                if (message.channelId !== allowedChannelId) {
                    return; //we don't care if it's not in the channel
                }
    
                if (message.mentions.has(this.client.user)) {
                    message.channel.sendTyping();
                    totalPings++;
                    botState = `Activated by ${message.author.tag}`;
                    
                    const sender = message.author.tag;
                    originalMessage = message.content.replace(/<@!\d+>/g, '').replace(`<@${this.client.user.id}>`, '').trim(); //dont send the ping to the ai
                    userMessageContent = originalMessage;
                    let logData = `Sender: ${sender}\nOriginal Message: ${originalMessage}`;
    
    
                    const input = originalMessage;
                    inputTokensUsed = input.split(' ').length; // Count input tokens
                    const response = await sendChatMessage(input).catch(error => {
                        console.log('Error sending message:', error);
                        return null;
                    });
    
                    if (response) {
                        botState = 'Processing Reply';
                        
                        //1984 module
                        filteredResponse = response.replace(/<@!\d+>/g, '') //remove ping tags (<@bunchofnumbers>)
                        if (removeLinks == 1) {
                            filteredResponse.replace(/(https?:\/\/[^\s]+)/gi, '~~link removed~~'); //replace links with link removed
                        }
                        if (removePings == 1) {
                            filteredResponse.replace(/@/g, '@\u200B'); //place invisible space between @ and words so bot can't ping
                        }
                        //slur filtering
                        blockedWords.forEach(word => {
                            const regex = new RegExp(`\\b${word.word}\\b|${word.word}(?=[\\W]|$)`, 'gi');
                            if (filteredResponse.match(regex)) {
                                blockedWordsCount++; // Increment blocked words counter for each match found
                            }
                            filteredResponse = filteredResponse.replace(regex, 'nt'); //temporary, seems we have something tripping up the filter, especially on words ending in "nt", like "want"
                        });
    
                        //ok time to find some emojis
                        const emojiRegex = /:[a-zA-Z0-9_]+:/g;
                        const matchedEmojis = filteredResponse.match(emojiRegex);
                        //if we found some, we need to do some work to let the bot send them
                        if (matchedEmojis) {
                            matchedEmojis.forEach(match => {
                                const emojiName = match.split(':')[1]; // remove the colons, discord.js doesn't want them
                                const emoji = this.client.emojis.cache.find(emoji => emoji.name === emojiName); //then just search for the emote
                                //this should reset each message, but we'll find out if it doesnt.
                                if (emoji) {
                                    // If the emoji is found, replace the matched string with the actual emoji
                                    filteredResponse = filteredResponse.replace(match, emoji.toString());
                                }
                                // we do not care if the emote is not found (its funnier), so we don't handle this case.
                            });
                        }
                        // time to log some data
                        logData += `\nInput Tokens Used: ${inputTokensUsed}`; // Append input tokens used to log data
                        logData += `\nOutput Tokens Used: ${outputTokensUsed}`; // Append output tokens used to log data
                        logData += `\nTotal Tokens Used: ${totalTokensUsed} - Total Input:${totalInputTokensUsed} - Total Output:${totalOutputTokensUsed}`; // Append total tokens used to log data
                        logData += '\n--';
                        logData += `\nPre-Filter: ${response}`;
                        logData += '\n--';
                        logData += `\nFiltered: ${filteredResponse}`;
                        logData += '\n------------------------------------';
    
                        try {
                            botState = 'Sending Message';
                            
                            await message.reply({
                                content: filteredResponse,
                                allowedMentions: { repliedUser: false }
                            });
                            botState = 'Sent Message';
                            
                        } catch (error) {
                            console.log('Error replying to user in channel:', error);
                        }
                    } else {
                        console.log('No response from the bot.');
                    }
                    botState = 'Logging Data';
                    
                    await logToFile(logData); // Write log data to file
                    botState = 'Idle';
                    
    
    
                }
            });
    
            await this.client.login(this.discordToken);
        } catch (error) {
            console.log('Error:', error);
        }
    };

    emitUpdate() {
        this.emit('update', {
            botTag: this.botTag,
            botState: this.botState,
            totalPings: this.totalPings,
            blockedWordsCount: this.blockedWordsCount,
            trainingDataFromMessage: this.trainingDataFromMessage,
            totalTokensUsed: this.totalTokensUsed,
            inputTokensUsed: this.inputTokensUsed,
            totalInputTokensUsed: this.totalInputTokensUsed,
            outputTokensUsed: this.outputTokensUsed,
            totalOutputTokensUsed: this.totalOutputTokensUsed
        });
    }
}

module.exports = Bucket;
