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

                    for i in range(0, num_messages - 2, 3):  # Iterate through messages considering every third message
                        system_msg = messages[i].get('content')
                        user_msg = messages[i + 1].get('content')
                        assistant_msg = messages[i + 2].get('content')

                        if system_msg and user_msg and assistant_msg:
                            transformed_data.append({
                                "role": "system",
                                "content": system_msg
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
                    print(f"Error decoding JSON in file {filename}: {e}")
                    # Handle or skip the file causing the error as needed

    # Write transformed data in the desired JSONL format to the output file
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
create_combined_jsonl('dirty-data', 'output_chatcompletion.jsonl')
