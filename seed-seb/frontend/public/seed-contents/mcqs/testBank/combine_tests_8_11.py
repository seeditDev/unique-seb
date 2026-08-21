import json
import os

def combine_tests(input_files, output_file, duration=180):
    all_questions = []
    
    for filename in input_files:
        if not os.path.exists(filename):
            print(f"File not found: {filename}")
            continue
            
        with open(filename, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
                prefix = data.get('id', os.path.basename(filename))
                for idx, q in enumerate(data.get('questions', [])):
                    q_copy = dict(q)
                    q_copy['id'] = f"{prefix}_{idx}"
                    all_questions.append(q_copy)
            except Exception as e:
                print(f"Error reading {filename}: {e}")
    
    # Re-index ids from 1 to total
    for i, q in enumerate(all_questions):
        q['id'] = str(i + 1)
        
    combined_data = {
        "id": "javamcq360test2",
        "name": "Java MCQ 360 Test 2 (Combined)",
        "section": "java",
        "topic": "core-java",
        "difficulty": "advanced",
        "duration": duration,
        "totalQuestions": len(all_questions),
        "questions": all_questions
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(combined_data, f, indent=2)
    
    print(f"Created {output_file} with {len(all_questions)} questions.")

if __name__ == "__main__":
    base_dir = r"c:/Users/ashok/Downloads/SEED works/GitHub/seed-contents/mcqs/Hackathon"
    files = [os.path.join(base_dir, f"javatest{i}.json") for i in range(8, 12)]
    output = os.path.join(base_dir, "javamcq360test2.json")
    combine_tests(files, output)
