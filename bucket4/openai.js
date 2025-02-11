const { OpenAI } = require("openai");
const fs = require("fs");

// Load config.json
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const openai = new OpenAI({ apiKey: config.openaiApiKey });

/**
 * Sends a message to OpenAI's API using the fine-tuned model and returns the response.
 * @param {Object} userData - The structured user data from bot.js.
 * @param {Object} message - The current message being processed (if any).
 * @returns {Promise<string>} - The AI-generated response.
 */
async function getAIResponse(userData, message) {
    try {
        const prompt = await generatePrompt(userData, message);

        const response = await openai.chat.completions.create({
            model: config.fineTunedModel,  // Always use the fine-tuned model
            messages: [{ role: "system", content: config.aiSettings.system_prompt }, ...prompt],
            temperature: config.aiSettings.temperature,
            top_p: config.aiSettings.top_p,
            frequency_penalty: config.aiSettings.frequency_penalty,
            presence_penalty: config.aiSettings.presence_penalty
        });

        return response.choices[0]?.message?.content || "I couldn't generate a response.";
    } catch (error) {
        console.error("OpenAI API Error:", error);
        return "There was an error processing your request.";
    }
}

async function generatePrompt(userData, message, limit = 10) {
    const conversationHistory = [];

    // Add system message for rich presence if exists
    if (userData.richPresence && userData.richPresence.length > 0) {
        userData.richPresence.forEach(richPresence => {
            conversationHistory.push({
                role: 'system',
                content: `User is currently active on ${richPresence.name} - ${richPresence.details}`
            });
        });
    }

    // Process the reply chain if it exists
    if (userData.replyChain && userData.replyChain.length > 0) {
        let chain = await getMessageChain(userData.replyChain, limit);  // Pass userData.replyChain instead of message
        conversationHistory.push(...chain);
    } else {
        // Add the current message as a user message if there's no reply chain
        const senderDisplayName = userData.nickname || 'unknown'; // Fallback to 'unknown' if no nickname
        const content = message ? message.content : "Initial message"; // If there's no message, use a default message

        // Ensure the message content is passed correctly (use the message content from the caller)
        conversationHistory.push({
            role: 'user',
            name: senderDisplayName,
            content: content
        });
    }

    console.log("Prepared message history:", conversationHistory);
    return conversationHistory;
}

async function getMessageChain(replyChain, limit = 10) {
    let chain = [];
    let count = 0;

    // Loop through the reply chain and format messages
    for (let i = 0; i < replyChain.length && count < limit; i++) {
        const currentMessage = replyChain[i];

        // Ensure we always have a valid 'author'
        let senderDisplayName = currentMessage.author || 'unknown';  // Ensure author is not undefined
        senderDisplayName = sanitizeUsername(senderDisplayName);
        
        // Add message to the chain
        chain.push({
            role: currentMessage.author === this.client.user.id ? "assistant" : "user",  // Check for bot's ID
            name: senderDisplayName,
            content: currentMessage.content || 'No content available'
        });
        count++;
    }

    // Reverse the chain to ensure oldest messages come first
    const reversedChain = chain.reverse();  // Reverse the array to put oldest messages at the top

    // Remove duplicates based on content
    const seen = new Set();
    const filteredChain = reversedChain.filter(el => {
        const duplicate = seen.has(el.content);
        seen.add(el.content);
        return !duplicate;
    });

    return filteredChain;
}

// Helper function to sanitize the username (same as in your example)
function sanitizeUsername(username) {
    let sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '');
    if (sanitizedUsername.length > 64) {
        sanitizedUsername = sanitizedUsername.substring(0, 64);
    }
    return sanitizedUsername;
}

module.exports = { getAIResponse, generatePrompt, getMessageChain };
