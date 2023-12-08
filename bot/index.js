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
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });

    const config = await fs.readFile('config.json', 'utf8');
    const { discordToken, openai } = JSON.parse(config);
    const { apiKey, modelId } = openai;

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
            max_tokens: 20,
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

    const logPingReceived = (message) => {
      console.log(`Pinged by ${message.author.tag}: ${message.content}`);
    };

    const logMessageFailedToSend = (error) => {
      console.error('Error sending message:', error);
    };

    const logOpenAIIssues = (error) => {
      console.error('OpenAI API Issue:', error);
    };

    client.on('ready', () => {
      console.log(`Logged in as ${client.user.tag}!`);
    });

    client.on('messageCreate', async (message) => {
      if (message.mentions.has(client.user) && !message.author.bot) {
        logPingReceived(message);
    
        const input = message.content.replace(`<@!${client.user.id}>`, '').trim();
        const response = await sendChatMessage(input).catch(logMessageFailedToSend);
        console.log('Bucket:', response);
        if (response) {
          const filteredResponse = response
            .replace(/@/g, '@\u200B')
            .replace(/(https?:\/\/[^\s]+)/gi, '[Bucket tried to send a link]');
    
          // Reply to the user's message in the same channel
          try {
            await message.reply(filteredResponse);
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
    logOpenAIIssues(error);
  }
};

processMessages();
