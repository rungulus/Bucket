import praw
import json

# Load configuration
with open('config.json', 'r') as config_file:
    config = json.load(config_file)
    system_prompt = config['system_prompt']
    reddit_credentials = config['reddit_credentials']

# Reddit API authentication
reddit = praw.Reddit(
    client_id=reddit_credentials['client_id'],
    client_secret=reddit_credentials['client_secret'],
    user_agent=reddit_credentials['user_agent']
)

# Fetch posts from r/twosentencehorror
subreddit = reddit.subreddit('twosentencehorror')
posts = list(subreddit.controversial(limit=256))

# Generate JSONL file
with open('output.jsonl', 'w') as file:
    for post in posts:
        post_title = post.title
        post_body = post.selftext

        # Construct JSON line
        chat_json = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": post_title},
                {"role": "assistant", "content": post_body}
            ]
        }

        # Write JSON line to the file
        file.write(json.dumps(chat_json) + '\n')
