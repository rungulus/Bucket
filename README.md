<img src='bucket.jpg' width='100' align="right">

# Bucket

brainrot for [at least 5 dollars]! this repo will help you make your own GPT model based on messages from your discord server, eventually you can use it with a discord bot!

## installation
you need python and node.js! i'm really dumb and pip wasnt working so deal with it!

once you got that, just clone this repo

## usage
this project is seprated into 4 steps!

### preparation
to start you'll need discordchatexporter: https://github.com/Tyrrrz/DiscordChatExporter

choose the channel you want to use for the training data, make sure to download it as `json`. this will probably take a while!

(you may want to set a partition limit, most editors will get upset about 10gb json files lol) (i used 10mb)

once you have your json files, make a folder called `dirty-data` in the `preparation` folder, and put all the json files in there

run either `jsoncleaner.py` or `jsoncleaner2.py` (they work slightly differently!) - they will output to the same file, appending if nessecary, be careful!

(use `jsoncleaner-chatcompletion.py` if you wanna use gpt3 models)

currently i just run both, idk if this is good though (model's still training)

### training

yeah theres a folder for it, but i would just use openai's web ui: https://platform.openai.com/finetune/

i'm using davinci-002 because its real cheap but still gives decent results, you can use whatever you want

**you will have to pay openai at least $5 to continue past this point**

training will also take a while, and will run you about 5 cents per 50,000 tokens or so? im not doing the math!
### validation
the fun bit!

rename `config.sample.json` to `config.json` and enter your API Key and your Model ID into the specified fields

open a terminal/command prompt in the validation folder and run `node --experimental-modules validate.mjs`

you can now chat with the bot you made! the token counts are just there for debugging and will probably be removed in a future version.

> P = prompt

> C = completion

> T = total tokens used

### discord bot

rename `config.sample.json` to `config.json` and enter your Discord API key, and your OpenAI API Key & Model ID into the fields

open a terminal/command prompt in the validation folder and run `node index.js`

it should get everything it needs, if not do `npm install discord.js node-fetch`

## why are you calling this bucket

seemed funny, idk! bucket of crap maybe


