import fs from 'fs/promises'; // Using fs promises API in ES Modules
import readline from 'readline';

import fetch from 'node-fetch';

// Read the API key and model ID from config.json
const config = await fs.readFile('config.json', 'utf8').then(JSON.parse);
const apiKey = config.apiKey;
const modelId = config.modelId;

const sendChatMessage = async (message) => {
  try {
    const response = await fetch(`https://api.openai.com/v1/engines/${modelId}/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: `You: ${message}\nBot:`,
        max_tokens: 20, // Adjust the number of tokens as needed
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    console.info('Tokens:', 'P-',data.usage.prompt_tokens, 'C-', data.usage.completion_tokens, 'T-', data.usage.total_tokens);

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



// Example usage to interact with the model
try {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.setPrompt('You: ');
  rl.prompt();

  rl.on('line', async (input) => {
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      rl.close();
      return;
    }

    const response = await sendChatMessage(input);
    console.log('Bucket:', response);

    rl.prompt();
  });
} catch (error) {
  console.error('Error:', error);
}
