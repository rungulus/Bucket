import fs from "fs";
import OpenAI from "openai";
import Discord from "discord.js";
const { Client, GatewayIntentBits, Events, Partials } = Discord; //workaround because discord.js doesn't like being imported

const config = await fs.readFileSync('config.json', 'utf8');
const { discordToken, openaiapi, severityCategory, allowedChannelId, trainEmoji, reactionCount, removePings, removeLinks } = JSON.parse(config); //get all the settings
const { apiKey, modelId, maxTokens, temperature, presencePenalty, frequencyPenalty, systemPrompt } = openaiapi;

const openai = new OpenAI({
  apiKey: `${apiKey}`
});

let fetch;
try {
  fetch = require('node-fetch');
} catch (error) {
  fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const logDirectory = 'logs'; // Directory to store log files
const maxLogFileSize = 10 * 1024 * 1024; // 10 MB (in bytes)

let logToFile = async (logData) => {
  const currentDate = new Date().toISOString().slice(0, 10); // Get current date for log file name

  try {
    await fs.promises.mkdir(logDirectory, { recursive: true }); // Use fs.promises for asynchronous operations
    const logFileName = `${logDirectory}/bot_logs_${currentDate}.txt`;

    let fileStats;
    try {
      fileStats = await fs.promises.stat(logFileName);
    } catch (err) {
      botState = 'Creating Log File';
    }

    const logContent = `${logData}\n`;

    if (!fileStats || fileStats.size >= maxLogFileSize) {
      // Create a new log file if the current one is too large or doesn't exist
      await fs.promises.writeFile(logFileName, logContent);
    } else {
      // Append to the current log file
      await fs.promises.appendFile(logFileName, logContent);
    }

    botState = 'Writing to log file';
  } catch (error) {
    console.log('Error writing to log file:', error);
  }
};


let botState = 'Idle';
let botTag = '[connecting to discord]'; 
// Variables to keep track of the console output
let inputTokensUsed = 0;
let outputTokensUsed = 0;
let totalTokensUsed = 0;
let totalInputTokensUsed= 0;
let totalOutputTokensUsed = 0;
let trainingDataFromMessage = 0;
let totalPings= 0;
let blockedWordsCount = 0;
let latestError = `none!`;
let filteredResponse; //out here so we can save it
let userMessageContent = '';
let originalMessage = '';
// update the console
function updateConsole() {
  console.clear(); // Clear console before updating counters
  //welcome to console.log hell
  //im sure there's a better way to do this
  console.log('Connected as', botTag);
  console.log('Current Bot State:', botState);
  console.log('----');
  console.log('Total pings received:', totalPings);
  console.log('Total blocked words found:', blockedWordsCount);
  console.log('Messages Saved for Training: ', trainingDataFromMessage);
  console.log('----');
  console.log(`Total Tokens Used: ${totalTokensUsed}`);
  console.log(`Input Tokens Used: ${inputTokensUsed} (Total Input: ${totalInputTokensUsed})`);
  console.log(`Output Tokens Used: ${outputTokensUsed} (Total Output: ${totalOutputTokensUsed})`);
  console.log('----')
  console.log('Last Error:', latestError);
  
}

const saveToJSONL = async (systemPrompt, userPrompt, aiResponse) => {
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
    botState='Idle';
  } catch (error) {
    latestError='Error saving data to JSONL file:', error;
  }
};

const processMessages = async () => {
  try {
    const getBlockedWords = async (severityCategory) => {
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

    const sendChatMessage = async (message) => {
      try {
        botState = 'Waiting for AI';
        updateConsole();
        const completions = await openai.chat.completions.create({
          messages: [
            { role: "system", content: `${systemPrompt}` },
            { role: "user", content: `${message}`}
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

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
      ]
    });

    client.on('ready', () => {
      botTag = client.user.tag;
      updateConsole();
    });

    client.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (
        reaction.count >= reactionCount &&
        reaction.emoji.name === trainEmoji &&
        user.id !== client.user.id &&
        reaction.message.author.id === client.user.id // Ensure reaction is on bot's message
      ) {
        trainingDataFromMessage++;
        botState = 'Logging for Training';
        updateConsole();
        // const systemPrompt = config.systemPrompt;
        const userPrompt = userMessageContent;
        const aiResponse = filteredResponse; // Assuming the AI response is the same as the bot's message content
        await saveToJSONL(systemPrompt, userPrompt, aiResponse);
      }
    });

    client.on('messageCreate', async (message) => {
      if (message.channelId !== allowedChannelId){
        return;
      }
      
      const content = message.content.toLowerCase().trim(); 

      if (message.mentions.has(client.user)) {
        message.channel.sendTyping();
        totalPings++;
        botState = `Activated by ${message.author.tag}`;
        updateConsole();
        const sender = message.author.tag;
        originalMessage = message.content.replace(/<@!\d+>/g, '').replace('<@1183327864624517120>', '').trim(); //dont send the ping to the ai
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
          updateConsole();
          //1984 module
          filteredResponse = response.replace(/<@!\d+>/g, '')//remove ping tags (<@bunchofnumbers>)
          if (removeLinks == 1){
            filteredResponse.replace(/(https?:\/\/[^\s]+)/gi, '~~link removed~~');//replace links with link removed
          }
          if (removePings == 1){
            filteredResponse.replace(/@/g, '@\u200B');//place invisible space between @ and words so bot can't ping
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
              const emoji = client.emojis.cache.find(emoji => emoji.name === emojiName); //then just search for the emote
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

          const delay = Math.random() * 750; // Random delay in milliseconds (0 to 750 ms)
          await new Promise((resolve) => setTimeout(resolve, delay));
          try {
            botState = 'Sending Message';
            updateConsole();
            await message.reply({
              content: filteredResponse,
              allowedMentions: { repliedUser: false }
            });
            botState = 'Sent Message';
            updateConsole();
          } catch (error) {
            console.log('Error replying to user in channel:', error);
          }
        } else {
          console.log('No response from the bot.');
        }
        botState = 'Logging Data';
        updateConsole();
        await logToFile(logData); // Write log data to file
        botState = 'Idle';
        updateConsole();


      }
    });

    await client.login(discordToken);
  } catch (error) {
    console.log('Error:', error);
  }
};

processMessages();
updateConsole();