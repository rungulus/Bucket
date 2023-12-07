##this version will use the same prompt for each completion
##i have not tested which will give better results yet!

import json

def clean_and_transform_to_jsonl(input_json_path, output_jsonl_path):
    with open(input_json_path, 'r', encoding='utf-8') as file:
        data = json.load(file)

        transformed_data = []
        for item in data.get('messages', []):
            content = item.get('content')
            if content:
                transformed_data.append({
                    "prompt": "Generate a message for Discord, please ->",
                    "completion": content
                })

        with open(output_jsonl_path, 'w', encoding='utf-8') as output_file:
            for entry in transformed_data:
                chat_completion_data = {
                    "prompt": entry["prompt"],
                    "completion": entry["completion"]
                }
                # Write each transformed data line by line as JSONL in chat-completion format
                output_file.write(json.dumps(chat_completion_data) + '\n')

# Replace 'input.json' with the path to your original JSON file containing the data.
# Replace 'output_transformed_chat_completion.jsonl' with the desired path for the output file in chat-completion JSONL format.
clean_and_transform_to_jsonl('input.json', 'output_transformed_chat_completion.jsonl')
