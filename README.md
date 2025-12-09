<img src='bucket.png' width='100' align="right">

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
- consent

## Step 1 - Prep

**You should probably get consent before doing all this!**

  1. To get started, you'll need chat data. Use DiscordChatExporter: https://github.com/Tyrrrz/DiscordChatExporter

  2. In DiscordChatExporter, choose the channel you want to use for the training data, make sure to download it as `json`. This will probably take a while.

 You will probably want to set a partition limit! I used `10mb`.

  3. Once you have your json files, make a folder called `dirty-data` in the `preparation` folder, and put all the json files in there.

  4. Run the `jsoncleaner.py` python script.

  5. When asked, enter your system prompt. 
  
  Your system prompt sets the "context" for the AI Model, as well as placing restrictions or "boundaries" on its responses. You may want to write this down for future steps, but you can also just grab it from the `output.jsonl` file.


## Step 2 - Training
**This step will cost you at least $5**

Use the OpenAI Dev Portal: https://platform.openai.com/finetune/

You should be able to the following base models: `gpt-3.5-turbo` - `gpt-4o`/`mini` - `gpt-4.1`/`mini`/`nano`

Training will also take a while, especially if you've given it a lot of data. For me training a GPT3.5 model with ~2048 lines of data will run you about $2.



## Step 3 - Releasing it into the wild (Discord)

> **Your AI Model will want to say slurs after a while, no matter how much you train it. There's a filter in place which should block most if not all of them, and a well crafted system prompt will prevent them as well. We will need a better solution for "ignoring" them from OpenAI's data in the future, though.**

1. Rename `bot/config.sample.json` to `config.json`, and get ready to enter a lot of settings:

- discordToken: your discord api key you got from the developer's portal
- allowedChannelId: the channel you want the bot to look at for pings (can be a thread)
- trainEmoji: an emoji reaction you want the bot to watch for to save the response (and original message) for future training
- reactionCount: how many reactions until the bot should save the message
- openaiapi section:
  - apiKey: your OpenAI api key
  - modelId: your fine tuned model id

<hr>

  > you should leave these settings as is, but here is what these do
  - maxTokens: how many tokens your bot can use per response
    - default: 1024
  - temperature: how "random" you want the bot to be, can be 0-2. lower is less "random"
    - default: 0.9
  - presencePenalty: how "on topic" the bot should be, can be 0-2. lower is more "on topic"
    - default: 0.3
  - frequencyPenalty: how "repetitive" the bot should be, can be 0-2. lower is more "repetitive"
    - default: 0.3
  - severityCategory: what "level" of slurs and bad words should we filter.
    - default: high
  <hr>
  
  - systemPrompt: your system prompt that the ai will use

> **A note on system prompts**
>
> While you're in `config.json`, you need to add a system prompt. This sets the guidelines and "boundaries" that the AI *mostly* follows. You can use the same system prompt that was used in `jsoncleaner.py`, but now would be the best time to mess around and see what gives you the best results. 

- allowedUserTag: a discord user id for a user who can use the bot in any channel
- removePings: can be 0 or 1, 1 to remove pings, 0 to allow them
- removeLinks: can be 0 or 1, 1 to remove links, 0 to allow them
- randomChannels
  - name: the name of the channel (can be anything)
  - channelId: the id of the channel you want the bot in
  - chance: the percentage chance you want the bot to reply, can be `0-1` - `45% = 0.45` (set this lower than you'd think, 5% is good)
<hr>

2. Open a terminal/command prompt in the `bot` folder, then run `npm install` to grab all the dependencies
  
3. Once that's done, run `npm start` to start the bot!

Bucket will log responses, and who triggered the bot in the `/bot/logs/` folder. 

## Contributing
Feel Free! If you want to change something just open a PR.
