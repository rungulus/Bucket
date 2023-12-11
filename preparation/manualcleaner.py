import json
import os
import csv

def load_blocked_words(csv_file_path):
    # Function to load blocked words from a CSV file into a dictionary
    blocked_words = {}
    with open(csv_file_path, 'r', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        next(reader)  # Skip header row
        for row in reader:
            word = row[0].strip().lower()  # text column
            severity = float(row[7].strip())  # severity_rating column (considered as float)
            blocked_words[word] = severity
    return blocked_words

def create_combined_jsonl(output_jsonl_path, blocked_words, system_prompt):
    # Function to create or append messages to a JSON Lines (JSONL) file
    transformed_data = []

    # Filter function based on severity
    def filter_word(text):
        return not any(blocked_word in text.lower() for blocked_word in blocked_words.keys())

    while True:
        user_msg = input("Enter your message (type 'exit' to close): ")
        if user_msg.lower() == 'exit':
            break

        assistant_msg = input("Enter assistant's message: ")

        # Check if the words are not in the blocked words list
        if filter_word(user_msg) and filter_word(assistant_msg):
            transformed_data.append({
                "role": "system",
                "content": system_prompt
            })
            transformed_data.append({
                "role": "user",
                "content": user_msg
            })
            transformed_data.append({
                "role": "assistant",
                "content": assistant_msg
            })

            # Write to JSONL file after each entry
            with open(output_jsonl_path, 'a', encoding='utf-8') as output_file:
                messages_set = {
                    "messages": [
                        transformed_data[-3],
                        transformed_data[-2],
                        transformed_data[-1]
                    ]
                }
                output_file.write(json.dumps(messages_set) + '\n')
                print("Messages saved.")

# Ask user for the system prompt
system_prompt = input("Enter the system prompt: ")

# Example usage:
blocked_words = load_blocked_words('blockedwords.csv')
create_combined_jsonl('output.jsonl', blocked_words, system_prompt)
