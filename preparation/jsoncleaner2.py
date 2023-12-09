import json
import os

def create_combined_jsonl(input_folder_path, output_jsonl_path):
    # Check if the output file exists, if not, create an empty file
    if not os.path.exists(output_jsonl_path):
        with open(output_jsonl_path, 'w', encoding='utf-8'):
            pass  # Create an empty file

    transformed_data = []

    # Iterate through files in the folder
    for filename in os.listdir(input_folder_path):
        file_path = os.path.join(input_folder_path, filename)
        if os.path.isfile(file_path) and filename.endswith('.json'):
            with open(file_path, 'r', encoding='utf-8') as file:
                try:
                    data = json.load(file)

                    messages = data.get('messages', [])
                    num_messages = len(messages)

                    for i in range(0, num_messages - 1, 2):  # Iterate through messages, considering every other message
                        prompt = messages[i].get('content')
                        completion = messages[i + 1].get('content')

                        if prompt and completion:
                            transformed_data.append({
                                "prompt": prompt,
                                "completion": completion
                            })
                except json.JSONDecodeError as e:
                    print(f"Error decoding JSON in file {filename}: {e}")
                    # Handle or skip the file causing the error as needed

    # Append aggregated transformed data to the existing JSONL output file
    with open(output_jsonl_path, 'a', encoding='utf-8') as output_file:
        for entry in transformed_data:
            chat_completion_data = {
                "prompt": entry["prompt"],
                "completion": entry["completion"]
            }
            # Append each transformed data line by line as JSONL in chat-completion format
            output_file.write(json.dumps(chat_completion_data) + '\n')

# Example usage:
create_combined_jsonl('dirty-data', 'output.jsonl')
