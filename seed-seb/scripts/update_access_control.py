import json
import os

paths = [
    r"c:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\frontend\SEEDDB\access_control.json",
    r"c:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\frontend\public\SEEDDB\access_control.json",
    r"c:\Users\ashok\Downloads\Development Works\SEED-IT Platform Source folder\seed-website-desktop-edition\frontend\build\SEEDDB\access_control.json"
]

target_ids = ["CA032", "CA033"]
target_keys = ["weekly_coding_assessment_5_-_2027", "daily_coding_challenge_2027_internal"]

for path in paths:
    if not os.path.exists(path):
        print(f"Skipping non-existent path: {path}")
        continue
        
    print(f"Processing: {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    # 1. Modify courses -> assessments -> modules
    if "courses" in data and "assessments" in data["courses"] and "modules" in data["courses"]["assessments"]:
        modules = data["courses"]["assessments"]["modules"]
        filtered_modules = {}
        for k, v in list(modules.items()):
            if k in target_keys or v.get("id") in target_ids:
                filtered_modules[k] = v
        data["courses"]["assessments"]["modules"] = filtered_modules
        print(f"  Filtered coding modules: kept {list(filtered_modules.keys())}")
        
    # 2. Modify access_control -> colleges -> allowed_modules
    colleges_count = 0
    depts_count = 0
    if "access_control" in data and "colleges" in data["access_control"]:
        colleges = data["access_control"]["colleges"]
        for college_name, college_data in colleges.items():
            colleges_count += 1
            for year_name, year_data in college_data.items():
                if not isinstance(year_data, dict):
                    continue
                for dept_name, dept_data in year_data.items():
                    if isinstance(dept_data, dict) and "allowed_modules" in dept_data:
                        dept_data["allowed_modules"] = target_ids
                        depts_count += 1
                        
    print(f"  Updated allowed_modules to {target_ids} for {colleges_count} colleges ({depts_count} total department batches).")
    
    # Save the file back
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("  Saved successfully.")

print("All access control files updated!")
