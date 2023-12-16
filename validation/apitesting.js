import OpenAI from "openai";

import fs from "fs";

const config = await fs.readFileSync('config.json', 'utf8');
const { openai, severityCategory, maxTokens, systemPrompt} = JSON.parse(config);
const { apiKey, modelId } = openai;
const aiclient = new OpenAI({
    apiKey: `${apiKey}`
  });

async function main() {
  const completion = await aiclient.chat.completions.create({
    messages: [{ role: "system", content: systemPrompt}],
    model: modelId,
  });

  console.log(completion.choices[0]);
}

main();