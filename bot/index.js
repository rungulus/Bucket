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

    // Read configuration from config.json
    const config = await fs.readFile('config.json', 'utf8');
    const { discordToken, openai } = JSON.parse(config);
    const { apiKey, modelId } = openai;

    // Function to send message using OpenAI
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
            max_tokens: 15, // Adjust the number of tokens as needed
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
        console.error('Error sending message:', error);
        return 'Error occurred while sending message.';
      }
    };

    // Discord bot logic
    client.on('ready', () => {
      console.log(`Logged in as ${client.user.tag}!`);
    });

    client.on('messageCreate', async (message) => {
      // Check if the message mentions the bot and if the author is not a bot
      if (message.mentions.has(client.user) && !message.author.bot) {
        const input = message.content.replace(`<@!${client.user.id}>`, '').trim();
        const response = await sendChatMessage(input);
    
        // Filter out potential mentions and URLs from the AI-generated response
        const filteredResponse = response
          .replace(/@/g, '@\u200B') // Replace @ with @​ (zero-width space)
          .replace(/(https?:\/\/[^\s]+)/gi, '[URL]'); // Replace URLs with [URL]
    
        message.channel.send(filteredResponse);
      }
    });
    

    // Login using Discord bot token
    await client.login(discordToken);
  } catch (error) {
    console.error('Error:', error);
  }
};

processMessages();
