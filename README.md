<img src='bucket.jpg' width='100' align="right">

# Bucket

A GPT discord bot that uses your own server for training data. This repo is to help you build that bot.

## Why'd you name it Bucket?
seemed funny.

# Getting Started

## Step 0 - Stuff you need
You will need:
- Python
- Node.JS
- (at least) 5 dollars

## Step 1 - Prep
  1. To get started, you'll need chat data. Use DiscordChatExporter: https://github.com/Tyrrrz/DiscordChatExporter

  2. In DiscordChatExporter, choose the channel you want to use for the training data, make sure to download it as `json`. This will probably take a while.

 You will probably want to set a partition limit! I used `10mb`.

  3. Once you have your json files, make a folder called `dirty-data` in the `preparation` folder, and put all the json files in there.

  4. Run the `jsoncleaner.py` python script.

  5. When asked, enter your system prompt. 
  
  Your system prompt sets the "context" for the AI Model, as well as placing restrictions or "boundaries" on its responses. You may want to write this down for future steps, but you can also just grab it from the `output.jsonl` file.


## Step 2 - Training
**This step will cost you at least $5**

There *is* a script in the training folder, but I would just use the web ui for this: https://platform.openai.com/finetune/

You can only use `gpt-3.5-turbo-xxxx` models for fine tuning with the data you've generated.

Training will also take a while, especially if you've given it a lot of data. For me training a GPT3.5 model with ~2048 lines of data will run you about $2.



## Step 3 - Releasing it into the wild (Discord)

### Bucket will want to say slurs after a while. There's a filter in place which should block most if not all of them, and a well crafted system prompt will prevent some as well. We will need a better solution for "ignoring" them from OpenAI's data.

1. Rename `config.sample.json` to `config.json`, and get ready to enter a lot of settings:

- discordToken: your discord api key you got from the developer's portal
- allowedChannelId: the channel you want the bot to look at for pings (can be a thread)
- trainEmoji: an emoji reaction you want the bot to watch for to save the response (and original message) for future training
- reactionCount: how many reactions until the bot should save the message
- openaiapi section:
  - apiKey: your OpenAI api key
  - modelId: your fine tuned model id
  - maxTokens: how many tokens your bot can use per response
    - default: 100
<hr>

  > you should leave these settings as is, but here is what these do
  - temperature: how "random" you want the bot to be, can be 0-2. lower is less "random"
    - default: 0.6
  - presencePenalty: how "on topic" the bot should be, can be 0-2. lower is more "on topic"
    - default: 0.6
  - frequencyPenalty: how "repetitive" the bot should be, can be 0-2. lower is more "repetitive"
    - default: 1
  - severityCategory: what "level" of slurs and bad words should we filter, can be 0-3.
    - default: 2.2
  <hr>
  
  - systemPrompt: your system prompt that the ai will use

> **A note on system prompts**
>
> While you're in `config.json`, you need to add a system prompt. This sets the guidelines and "boundaries" that the AI *mostly* follows. You can use the same system prompt that was used in `jsoncleaner.py`, but now would be the best time to mess around and see what gives you the best results. 

- removePings: can be 0 or 1, 1 to remove pings, 0 to allow them
- removeLinks: can be 0 or 1, 1 to remove links, 0 to allow them
<hr>

2. Open a terminal/command prompt in the `bot` folder, then run `npm install` to grab all the dependencies
  
3. Once that's done, run `node bucket2.mjs` or just `node .` to start the bot

Bucket will log responses, and who triggered the bot in the `/bot/logs/` folder. 

## Contributing
Feel Free! If you want to change something just open a PR.
