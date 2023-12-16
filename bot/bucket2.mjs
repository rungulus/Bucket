// const fs = require('fs').promises;
//const { Client, GatewayIntentBits } = require('discord.js');
// const OpenAI = require('openai');

import fs from "fs";
import OpenAI from "openai";
import Discord from "discord.js";
const { Client, GatewayIntentBits } = Discord;

const config = await fs.readFileSync('config.json', 'utf8');
const { discordToken, openaiapi, severityCategory, maxTokens, systemPrompt, allowedChannelId } = JSON.parse(config); //get all the settings
const { apiKey, modelId } = openaiapi;

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
    await fs.mkdirSync(logDirectory, { recursive: true }); // Create logs directory if it doesn't exist
    const logFileName = `${logDirectory}/bot_logs_${currentDate}.txt`;
    
    let fileStats;
    try {
      fileStats = await fs.stat(logFileName);
    } catch (err) {
      // File does not exist, create a new one
    }

    if (!fileStats || fileStats.size >= maxLogFileSize) {
      // Create a new log file if the current one is too large or doesn't exist
      await fs.appendFileSync(logFileName, `${logData}\n`);
    } else {
      // Append to the current log file
      await fs.appendFileSync(logFileName, `${logData}\n`);
    }

    //console.log('Log written to file.');
  } catch (error) {
    console.log('Error writing to log file:', error);
  }
};

let totalPings = 0; // Counter for total pings received
let blockedWordsCount = 0; // Counter for blocked words
let botState = 'Idle';
let botTag = 'undefined';

// Variables to keep track of tokens used per trigger for input, output, and total tokens
let inputTokensUsed = 0;
let outputTokensUsed = 0;
let totalTokensUsed = 0;
let totalInputTokensUsed = 0;
let totalOutputTokensUsed = 0;
let trainingDataFromMessage = 0;
let latestError = `none!`;

// Function to update the console output
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

const reactionLimit = 3; // Number of reactions to trigger saving to JSONL file

const saveToJSONL = async (systemPrompt, userPrompt, aiResponse) => {
  const data = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: aiResponse }
    ]
  };

  try {
    const jsonlData = JSON.stringify(data) + '\n';
    await fs.appendFileSync('saved_messages.jsonl', jsonlData);
    console.log('Data saved to JSONL file.');
  } catch (error) {
    console.log('Error saving data to JSONL file:', error);
  }
};

const processMessages = async () => {
  try {
    const getBlockedWords = async (severityCategory) => {
      try {
        const csvData = await fs.readFileSync('blockedwords.csv', 'utf8');
        const rows = csvData.split('\n').slice(1); // Skip header row
        const wordsWithSeverity = rows.map(row => {
          const columns = row.split(',');
          const word = columns[0].trim().toLowerCase(); // text column
          const severity = Number(columns[7].trim()); // severity_rating column
          return { word, severity };
        });
        
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
        });
        
        // console.log(completions);
        // console.log(completions.choices); 
        if (completions.choices && completions.choices.length > 0) {
          const responseContent = completions.choices[0].message.content;
          console.log('Response Content:', responseContent);
          return responseContent;
        } else {
          console.log('No valid response received from the bot.');
          return '[OpenAI Error - No valid response]';
        }
      } catch (error) {
        //console.error('OpenAI API Issue:', error);
        return "[Generic Error - probably OpenAI]";
      }
    };

    const blockedWords = await getBlockedWords(severityCategory);


    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });

    client.on('ready', () => {
      botTag = client.user.tag;
      updateConsole();
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
        const originalMessage = message.content.replace(/<@!\d+>/g, '').replace('<@1183327864624517120>', '').trim(); //dont send the ping to the ai

        let logData = `Sender: ${sender}\nOriginal Message: ${originalMessage}`;

        
        const input = originalMessage;
        inputTokensUsed = input.split(' ').length; // Count input tokens
        const response = await sendChatMessage(input).catch(error => {
          console.log('Error sending message:', error);
          return null;
        });
        
        if (response && response.length > 0 && response[0].message && response[0].message.content) {
          botState = 'Processing Reply';
          updateConsole();
          const filteredResponse = response[0].message.content;
          // Further processing and sending the filteredResponse
        } else {
          console.log('No valid response received from the bot.');
          // Handle this case according to your requirements
        }
        

        if (response) {
          botState = 'Processing Reply';
          updateConsole();
          let filteredResponse = response
            .replace(/<@!\d+>/g, '') //remove ping tags
            .replace(/@/g, '@\u200B') // invisible space so bot cannot ping normally
            .replace(/(https?:\/\/[^\s]+)/gi, '~~link removed~~'); // remove links

          // Replace blocked words based on severity category
          blockedWords.forEach(word => {
            const regex = new RegExp(`\\b${word.word}\\b|${word.word}(?=[\\W]|$)`, 'gi');
            if (filteredResponse.match(regex)) {
              blockedWordsCount++; // Increment blocked words counter for each match found
            }
            filteredResponse = filteredResponse.replace(regex, 'nt'); //temporary, seems we have something tripping up the filter, especially on words ending in "nt", like "want"
          });

          client.on('messageReactionAdd', async (reaction, user) => {
            if (
              reaction.count >= reactionLimit &&
              reaction.emoji.name === '🔥' &&
              user.id !== client.user.id &&
              reaction.message.author.id === client.user.id // Ensure reaction is on bot's message
            ) {
              trainingDataFromMessage++;
              botState = 'Logging for Training';
              updateConsole();
              const systemPrompt = config.systemPrompt;
              const userPrompt = originalMessage;
              const aiResponse = filteredResponse; // Assuming the AI response is the same as the bot's message content
              await saveToJSONL(systemPrompt, userPrompt, aiResponse);
            }
          });


          // Calculate total tokens used
          totalTokensUsed += inputTokensUsed + outputTokensUsed;
          totalInputTokensUsed += inputTokensUsed;
          totalOutputTokensUsed += outputTokensUsed;

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

        // Reset tokens used for the next trigger
        inputTokensUsed = 0;
        outputTokensUsed = 0;
      }
    });

    await client.login(discordToken);
  } catch (error) {
    console.log('Error:', error);
  }
};

processMessages();
updateConsole();