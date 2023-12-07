##this version will alternate prompt and completion with each message
##i have not tested which gives better results!

import json

def create_jsonl_file(input_json_path, output_jsonl_path):
    with open(input_json_path, 'r', encoding='utf-8') as file:
        data = json.load(file)

        messages = data.get('messages', [])
        num_messages = len(messages)

        with open(output_jsonl_path, 'w', encoding='utf-8') as output_file:
            for i in range(0, num_messages - 1, 2):  # Iterate through messages, considering every other message
                prompt = messages[i].get('content')
                completion = messages[i + 1].get('content')
                
                if prompt and completion:
                    entry = {
                        "prompt": prompt,
                        "completion": completion
                    }
                    output_file.write(json.dumps(entry) + '\n')

# Replace 'input.json' with the path to your original JSON file containing the data.
# Replace 'output.jsonl' with the desired path for the output file in JSONL format.
create_jsonl_file('input.json', 'output.jsonl')
