const fs = require('fs').promises;
let fetch;
try {
  fetch = require('node-fetch');
} catch (error) {
  fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const processMessages = async () => {
  try {
    const config = await fs.readFile('config.json', 'utf8');
    const { openai, severityCategory, maxTokens, systemPrompt} = JSON.parse(config);
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
            prompt: `${systemPrompt}\n${message}`,
            max_tokens: maxTokens
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

    const blockedWords = await getBlockedWords(severityCategory);

    console.log('Bucket AI is now active.');

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.on('line', async (input) => {
      const response = await sendChatMessage(input).catch(error => {
        console.error('Error sending message:', error);
        return null;
      });
      
      if (response) {
        botState = 'Processing Reply';
        updateConsole();
        let filteredResponse = response
          .replace(/<@!\d+>/g, '') //remove ping tags
          .replace(/@/g, '@\u200B') // invisible space so bot cannot ping normally
          .replace(/(https?:\/\/[^\s]+)/gi, '~~link blocked~~'); // remove links

        // Replace blocked words based on severity category
        blockedWords.forEach(word => {
          const regex = new RegExp(`\\b${word.word}\\b|${word.word}(?=[\\W]|$)`, 'gi');
          if (filteredResponse.match(regex)) {
            blockedWordsCount++; // Increment blocked words counter for each match found
          }
          filteredResponse = filteredResponse.replace(regex, 'nt');
        });
        

        console.log('Bucket:', filteredResponse);
      }

      readline.prompt();
    });

    readline.prompt();
  } catch (error) {
    console.error('Error:', error);
  }
};

processMessages();
