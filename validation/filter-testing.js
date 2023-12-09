// this file is for testing the filtering system
//enter a word you want to test the filtering with below

const response = 'word-here'; 

const fs = require('fs').promises;

const processMessages = async () => {
  try {
    const config = await fs.readFile('config.json', 'utf8');
    const { openai, severityCategory, maxTokens } = JSON.parse(config);
    const { apiKey, modelId } = openai;

    console.log('Severity Category:', severityCategory);

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
    
    const blockedWordsWithSeverity = await getBlockedWords(severityCategory);

    console.log('Raw Response:', response);
    let words = response.split(/\s+/); // Split response into words

    // Replace blocked words based on severity category
    words = words.map(word => {
      const trimmedWord = word.replace(/[.,!?]/g, '').toLowerCase(); // Remove punctuation and convert to lowercase
      const foundBlockedWord = blockedWordsWithSeverity.find(({ word: blockedWord }) => blockedWord === trimmedWord);

      if (foundBlockedWord) {
        // Replace the blocked word with a message indicating it was blocked
        return `[Blocked Word (${foundBlockedWord.severity})]`;
      }
      return word;
    });

    const filteredResponse = words.join(' '); // Join words back into a string
    console.log('Final Response:', filteredResponse);
  } catch (error) {
    console.error('Error:', error);
  }
};

processMessages();
