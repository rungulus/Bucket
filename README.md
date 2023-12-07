<img src='bucket.jpg' width='100' align="right">

# Bucket


brainrot for free!

## installation
you need python and node.js! i'm really dumb and pip wasnt working so deal with it!

once you got that, just clone this repo locally 

## usage
this project is seprated into 3 distinct steps (will be 4 for the bot)

### preparation
to start you'll need discordchatexporter: https://github.com/Tyrrrz/DiscordChatExporter

choose the channel you want to use for the training data, this may take a while!!

once you have your json file, rename it to `input.json` and move it into the preparation folder

run either `jsoncleaner.py` or `jsoncleaner2.py` (they work slightly differently!)

currently i just run both and combine the files manually once they're done, idk if this is good though (model's still training)

### training

yeah theres a folder for it, but i would just use openai's web ui: https://platform.openai.com/finetune/

i'm using davinci-002 because its real cheap but still gives decent results, you can use whatever you want

**you will have to pay openai at least $5 to continue past this point**

### validation
the fun bit!

rename `config.sample.json` to `config.json` and enter your API Key and your Model ID into the specified fields

open a terminal/command prompt in the validation folder and run `node --experimental-modules validate.mjs`

### discord bot

coming soon!


