const fs = require('fs').promises;
const { Client, GatewayIntentBits } = require('discord.js');

let fetch;
try {
  fetch = require('node-fetch');
} catch (error) {
  fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const processMessages = async () => {
  try {
    const config = await fs.readFile('config.json', 'utf8');
    const { discordToken, openai, severityCategory, maxTokens } = JSON.parse(config);
    const { apiKey, modelId } = openai;

    const getBlockedWords = async (severityCategory) => {
      try {
        const csvData = await fs.readFile('blockedwords.csv', 'utf8');
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
        console.error('Error reading blocked words:', error);
        return [];
      }
    };
    

    const sendChatMessage = async (message) => {
      try {
        const response = await fetch(`https://api.openai.com/v1/engines/${modelId}/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            prompt: `${message}\nBucket:`,
            max_tokens: maxTokens,
          }),
        });

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (data.choices && data.choices.length > 0 && data.choices[0].text) {
          return data.choices[0].text.trim();
        } else {
          throw new Error('Invalid response format or empty choices array');
        }
      } catch (error) {
        console.error('OpenAI API Issue:', error);
        return '[Bucket has an Internal Error]';
      }
    };

    const blockedWords = await getBlockedWords();

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });

    client.on('ready', () => {
      console.log(`Logged in as ${client.user.tag}!`);
    });

    client.on('messageCreate', async (message) => {
      if (message.mentions.has(client.user) && !message.author.bot) {
        const input = message.content.replace(`<@!${client.user.id}>`, '').trim();
        const response = await sendChatMessage(input).catch(error => {
          console.error('Error sending message:', error);
          return null;
        });
        
        if (response) {
          console.log('PreFilter: ', response ,'\n');
          let filteredResponse = response
            .replace(/@/g, '@\u200B') // Filter pings
            .replace(/(https?:\/\/[^\s]+)/gi, '[Bucket tried to send a link]'); // Filter links

          // Replace blocked words based on severity category
          blockedWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b|${word}(?=[\\W]|$)`, 'gi');
            filteredResponse = filteredResponse.replace(regex, '[Bucket said a blocked word, please let rungus know]');
          });
          
          console.log('Filtered',filteredResponse);
          // Reply to the user's message in the same channel
          try {
            await message.reply({
              content: filteredResponse,
              allowedMentions: { repliedUser: false }
            });
            console.log('Replied to', message.author.tag, 'in channel');
          } catch (error) {
            console.error('Error replying to user in channel:', error);
          }
        }
      }
    });

    await client.login(discordToken);
  } catch (error) {
    console.error('Error:', error);
  }
};

processMessages();
