import json
import os
import csv

def load_blocked_words(csv_file_path):
    blocked_words = {}
    with open(csv_file_path, 'r', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        next(reader)  # Skip header row
        for row in reader:
            word = row[0].strip().lower()  # text column
            severity = float(row[7].strip())  # severity_rating column (considered as float)
            blocked_words[word] = severity
    return blocked_words

def create_combined_jsonl(input_folder_path, output_jsonl_path, blocked_words):
    # Check if the output file exists, if not, create an empty file
    if not os.path.exists(output_jsonl_path):
        with open(output_jsonl_path, 'w', encoding='utf-8'):
            pass  # Create an empty file

    transformed_data = []

    # Filter function based on severity
    def filter_word(text):
        return not any(blocked_word in text.lower() for blocked_word in blocked_words.keys())

    # Get the total number of files to process
    files_to_process = [name for name in os.listdir(input_folder_path) if os.path.isfile(os.path.join(input_folder_path, name)) and name.endswith('.json')]
    total_files = len(files_to_process)

    # Iterate through files in the folder with progress indicator
    print("Processing Files:")
    for index, filename in enumerate(files_to_process, start=1):
        file_path = os.path.join(input_folder_path, filename)
        print(f"\rProcessing file {index}/{total_files}", end="", flush=True)
        if os.path.isfile(file_path) and filename.endswith('.json'):
            with open(file_path, 'r', encoding='utf-8') as file:
                try:
                    data = json.load(file)

                    messages = data.get('messages', [])
                    num_messages = len(messages)

                    for i in range(0, num_messages - 2, 3):
                        user_msg = messages[i + 1].get('content')
                        assistant_msg = messages[i + 2].get('content')

                        if user_msg and assistant_msg:
                            # Check if the words are not in the blocked words list
                            if filter_word(user_msg) and filter_word(assistant_msg):
                                transformed_data.append({
                                    "role": "system",
                                    "content": "Bucket is an AI Model trained on Harvest."
                                })
                                transformed_data.append({
                                    "role": "user",
                                    "content": user_msg
                                })
                                transformed_data.append({
                                    "role": "assistant",
                                    "content": assistant_msg
                                })
                except json.JSONDecodeError as e:
                    print(f"\nError decoding JSON in file {filename}: {e}")
                    # Handle or skip the file causing the error as needed

    print("\nProcessing complete.")

    with open(output_jsonl_path, 'w', encoding='utf-8') as output_file:
        for i in range(0, len(transformed_data), 3):
            messages_set = {
                "messages": [
                    transformed_data[i],
                    transformed_data[i + 1],
                    transformed_data[i + 2]
                ]
            }
            output_file.write(json.dumps(messages_set) + '\n')

# Example usage:
blocked_words = load_blocked_words('blockedwords.csv')
create_combined_jsonl('dirty-data', 'output.jsonl', blocked_words)
