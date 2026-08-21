import json
import os
import random

def create_mixed_assessment(input_files, output_file, num_questions=100):
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
    
    if len(all_questions) < num_questions:
        print(f"Warning: Only {len(all_questions)} questions available, but {num_questions} requested.")
        selected = all_questions
    else:
        selected = random.sample(all_questions, num_questions)
        
    # Re-index ids from 1 to num_questions
    for i, q in enumerate(selected):
        q['id'] = str(i + 1)
        
    assessment_data = {
        "id": "javaweeklyassessment1",
        "name": "Java Weekly Assessment 1 (Mixed)",
        "section": "java",
        "topic": "mixed",
        "difficulty": "mixed",
        "duration": 50,
        "totalQuestions": len(selected),
        "questions": selected
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(assessment_data, f, indent=2)
    
    print(f"Created {output_file} with {len(selected)} questions.")

if __name__ == "__main__":
    base_dir = r"c:/Users/ashok/Downloads/SEED works/GitHub/seed-contents/mcqs/Hackathon"
    files = [os.path.join(base_dir, f"javatest{i}.json") for i in range(1, 12)]
    output = os.path.join(base_dir, "javaweeklyassessment1.json")
    create_mixed_assessment(files, output)
