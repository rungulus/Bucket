const OpenAI = require('openai');
const fs = require('fs');
const config = require('./config.json');

const openai = new OpenAI({ apiKey: config.openaiApiKey });

async function getAIResponse(messageData, message) {
    let messages = [];
    
    // Add rich presence as system message
    if (messageData.richPresence && messageData.richPresence.length > 0) {
        const presence = messageData.richPresence[0];
        let presenceMessage = '';
        if (presence.name === 'Spotify' && presence.details) {
            presenceMessage = `User is listening to ${presence.details}`;
        } else if (presence.type === 0 && presence.name) {
            presenceMessage = `User is playing ${presence.name}`;
        }
        if (presenceMessage) {
            messages.push({ role: 'system', content: presenceMessage });
        }
    }
    
    // Add user message
    if (messageData.replyChain.length > 0) {
        messages.push(...messageData.replyChain);
    } else {
        messages.push({ role: 'user', name: messageData.nickname.replace(/[^a-zA-Z0-9_-]/g, ''), content: messageData.content || 'No content provided' });
    }
    
    // Process images
    if (messageData.imageUrl) {
        try {
            const imageDescription = await describeImage(messageData.imageUrl);
            messages.push({ role: 'system', content: `Image description: ${imageDescription}` });
        } catch (error) {
            console.error('Error processing image:', error);
        }
    }
    
    // Call OpenAI API
    try {
        const response = await openai.chat.completions.create({
            model: config.fineTunedModel,
            messages,
            temperature: config.temperature,
            frequency_penalty: config.frequencyPenalty,
            presence_penalty: config.presencePenalty
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error getting AI response:', error);
        return 'Error getting AI response';
    }
}

// Process image
async function analyzeImage(imageUrl) {
    // Use OpenAI image-to-text API (or similar) to analyze images
    try {
        const description = await openai.images.analyze({
            url: imageUrl
        });
        return description;
    } catch (error) {
        console.error('Error analyzing image:', error);
        return 'Could not analyze the image.';
    }
}

module.exports = { getAIResponse, analyzeImage };
