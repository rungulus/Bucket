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

  4. Run any of the python scripts in the `preparation` folder, they work slightly differently. If you want to use GPT3 models, you can only use `jsoncleaner-chatcompletion.py`. 

They do write to the same file, so use caution.

## Step 2 - Training
**This step will cost you at least $5**

There *is* a script in the training folder, but I would just use the web ui for this: https://platform.openai.com/finetune/

You can use whichever model you want, if you *didn't* use `jsoncleaner-chatcompletion.py` you won't be able to use any GPT3+ models.

Training will also take a while, especially if you've given it a lot of data.

## Step 3 - Validation

1. Rename `config.sample.json` to `config.json` and enter your API Key and your Model ID into the specified fields

2. Also, specify your token amount if you want, this controls how long the messages that the bot replies with are. 

3. Open a terminal/command prompt in the validation folder and run `node chatbot.js`

4. You can now chat with the bot you made! Make sure it's a bit normal, and retrain your model as needed.

## Step 4 - Releasing it into the wild (Discord)

### Bucket will want to say slurs after a while. There's a filter in place which should block most if not all of them, but in the future we will need a better way to filter them out from OpenAI's data.

1. Rename `config.sample.json` to `config.json` and enter your Discord API key, OpenAI API Key, and Fine Tuned Model ID.
 
2. Open a terminal/command prompt in the validation folder and run `node index.js`

If you're having issues with the bot, make sure the dependencies are installed by running `npm install discord.js node-fetch`

## That's all!
If you see an issue, or want to make an improvement please feel free!