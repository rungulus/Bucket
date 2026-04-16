#designate a specific user as user messages, all other are assistant messages
#better for more "guided" training

import json
import os
import csv
import re

SELF_USER_ID = input("Enter a Discord user ID: ").strip()
if not SELF_USER_ID:
    raise SystemExit("Discord user ID is required.")

def load_blocked_words(csv_file_path):
    blocked_words = {}
    with open(csv_file_path, 'r', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        next(reader)
        for row in reader:
            word = row[0].strip().lower()
            severity = float(row[7].strip())
            blocked_words[word] = severity
    return blocked_words

def create_combined_jsonl(input_folder_path, output_jsonl_path, blocked_words, system_prompt):
    transformed_data = []

    def filter_word(text):
        return not any(w in text.lower() for w in blocked_words)

    # Regex patterns to ignore
    ignore_patterns = [
    r'https://cdn\.discordapp\.com/attachments/.*\.png',  # Discord GIF/image links
    r'https://(www\.)?youtube\.com/.*',                   # YouTube links
    r'https://youtu\.be/.*',                               # YouTube short links
    r'https://tenor\.com/.*'                               # Tenor GIF links
]


    def ignore_message(text):
        return any(re.match(pattern, text) for pattern in ignore_patterns)

    files_to_process = [
        name for name in os.listdir(input_folder_path)
        if os.path.isfile(os.path.join(input_folder_path, name)) and name.endswith('.json')
    ]

    print("Processing Files:")
    for index, filename in enumerate(files_to_process, start=1):
        print(f"\rProcessing file {index}/{len(files_to_process)}", end="", flush=True)
        file_path = os.path.join(input_folder_path, filename)
        with open(file_path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                continue

        messages = data.get("messages", [])
        user_buffer = []
        assistant_buffer = []

        for msg in messages:
            content = msg.get("content", "").strip()
            attachments = msg.get("attachments", [])

            # Skip empty messages, images, GIFs, YouTube links
            if not content or attachments or ignore_message(content):
                continue

            author_id = msg.get("author", {}).get("id")
            role = "user" if author_id == SELF_USER_ID else "assistant"

            if role == "user":
                if assistant_buffer:
                    # flush previous pair
                    user_text = "\n".join(user_buffer)
                    assistant_text = "\n".join(assistant_buffer)
                    if user_text and assistant_text and filter_word(user_text) and filter_word(assistant_text):
                        transformed_data.append({"role":"system","content":system_prompt})
                        transformed_data.append({"role":"user","content":user_text})
                        transformed_data.append({"role":"assistant","content":assistant_text})
                    # reset buffers
                    user_buffer = []
                    assistant_buffer = []
                user_buffer.append(content)
            else:  # assistant
                assistant_buffer.append(content)

        # flush at end if assistant messages exist
        if user_buffer and assistant_buffer:
            user_text = "\n".join(user_buffer)
            assistant_text = "\n".join(assistant_buffer)
            if filter_word(user_text) and filter_word(assistant_text):
                transformed_data.append({"role":"system","content":system_prompt})
                transformed_data.append({"role":"user","content":user_text})
                transformed_data.append({"role":"assistant","content":assistant_text})

    print("\nProcessing complete.")

    with open(output_jsonl_path, 'w', encoding='utf-8') as out_file:
        for i in range(0, len(transformed_data), 3):
            out_file.write(json.dumps({"messages": transformed_data[i:i+3]}, ensure_ascii=False) + "\n")


# === RUN ===
systemPrompt = input("Enter the system prompt: ")
blocked_words = load_blocked_words("blockedwords.csv")
create_combined_jsonl("dirty-data", "output.jsonl", blocked_words, systemPrompt)
