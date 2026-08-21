import os
import json
import base64

# Define key matching the AssessmentEngine
OBFUSCATION_KEY = "KITE_SECURE_KEY_2026"

def obfuscate(data_str):
    xored = "".join(chr(ord(c) ^ ord(OBFUSCATION_KEY[i % len(OBFUSCATION_KEY)])) for i, c in enumerate(data_str))
    return base64.b64encode(xored.encode('utf-8')).decode('utf-8')

# Challenge definitions
CHALLENGES = [
    {
        "id": "hello_world",
        "title": "1. Hello, World!",
        "difficulty": "Easy",
        "statement": "Write a program that outputs exactly \"Hello, World!\" to the standard output.",
        "instructions": "Your code should print \"Hello, World!\" followed by a new line.",
        "constraints": "Time Limit: 2.0s\nMemory Limit: 256MB",
        "timeLimit": 2.0,
        "memoryLimit": 256,
        "sampleTests": [
            {"input": "", "expected": "Hello, World!\n"}
        ],
        "hiddenTests": [
            {"input": "", "expected": "Hello, World!\n"},
            {"input": "\n", "expected": "Hello, World!\n"}
        ],
        "boilerplates": {
            "c": "#include <stdio.h>\n\nint main() {\n    printf(\"Hello, World!\\n\");\n    return 0;\n}",
            "cpp": "#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << endl;\n    return 0;\n}",
            "python": "print(\"Hello, World!\")",
            "java": "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, World!\");\n    }\n}"
        }
    },
    {
        "id": "add_numbers",
        "title": "2. Sum of Two Integers",
        "difficulty": "Easy",
        "statement": "Write a program that reads two space-separated integers from standard input and prints their sum.",
        "instructions": "Input consists of two integers, A and B. Output a single integer representing A + B.",
        "constraints": "A, B <= 10^5\nTime Limit: 2.0s",
        "timeLimit": 2.0,
        "memoryLimit": 256,
        "sampleTests": [
            {"input": "5 10", "expected": "15\n"},
            {"input": "-3 8", "expected": "5\n"}
        ],
        "hiddenTests": [
            {"input": "5 10", "expected": "15\n"},
            {"input": "-3 8", "expected": "5\n"},
            {"input": "100 -200", "expected": "-100\n"},
            {"input": "0 0", "expected": "0\n"},
            {"input": "99999 1", "expected": "100000\n"}
        ],
        "boilerplates": {
            "c": "#include <stdio.h>\n\nint main() {\n    int a, b;\n    if (scanf(\"%d %d\", &a, &b) == 2) {\n        printf(\"%d\\n\", a + b);\n    }\n    return 0;\n}",
            "cpp": "#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    if (cin >> a >> b) {\n        cout << a + b << endl;\n    }\n    return 0;\n}",
            "python": "import sys\n\ntry:\n    inputs = sys.stdin.read().split()\n    if len(inputs) >= 2:\n        a, b = int(inputs[0]), int(inputs[1])\n        print(a + b)\nexcept Exception as e:\n    pass",
            "java": "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        if (scanner.hasNextInt()) {\n            int a = scanner.nextInt();\n            int b = scanner.nextInt();\n            System.out.println(a + b);\n        }\n    }\n}"
        }
    },
    {
        "id": "even_odd",
        "title": "3. Even or Odd",
        "difficulty": "Easy",
        "statement": "Read an integer N from standard input and output \"Even\" if N is even, and \"Odd\" if N is odd.",
        "instructions": "Input consists of a single integer. Output exactly \"Even\" or \"Odd\" (case-sensitive).",
        "constraints": "-10^9 <= N <= 10^9\nTime Limit: 2.0s",
        "timeLimit": 2.0,
        "memoryLimit": 256,
        "sampleTests": [
            {"input": "4", "expected": "Even\n"},
            {"input": "7", "expected": "Odd\n"}
        ],
        "hiddenTests": [
            {"input": "4", "expected": "Even\n"},
            {"input": "7", "expected": "Odd\n"},
            {"input": "0", "expected": "Even\n"},
            {"input": "-5", "expected": "Odd\n"},
            {"input": "12345678", "expected": "Even\n"},
            {"input": "-99999999", "expected": "Odd\n"}
        ],
        "boilerplates": {
            "c": "#include <stdio.h>\n\nint main() {\n    int n;\n    if (scanf(\"%d\", &n) == 1) {\n        if (n % 2 == 0) {\n            printf(\"Even\\n\");\n        } else {\n            printf(\"Odd\\n\");\n        }\n    }\n    return 0;\n}",
            "cpp": "#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    if (cin >> n) {\n        if (n % 2 == 0) cout << \"Even\" << endl;\n        else cout << \"Odd\" << endl;\n    }\n    return 0;\n}",
            "python": "import sys\n\ntry:\n    n = int(sys.stdin.read().strip())\n    if n % 2 == 0:\n        print(\"Even\")\n    else:\n        print(\"Odd\")\nexcept:\n    pass",
            "java": "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            if (n % 2 == 0) System.out.println(\"Even\");\n            else System.out.println(\"Odd\");\n        }\n    }\n}"
        }
    },
    {
        "id": "factorial",
        "title": "4. Factorial of N",
        "difficulty": "Medium",
        "statement": "Write a program that calculates the factorial of a given non-negative integer N. Factorial of N (N!) is the product of all positive integers less than or equal to N.",
        "instructions": "Input consists of an integer N. Output the factorial value.",
        "constraints": "0 <= N <= 12 (to prevent integer overflow)\nTime Limit: 2.0s",
        "timeLimit": 2.0,
        "memoryLimit": 256,
        "sampleTests": [
            {"input": "5", "expected": "120\n"},
            {"input": "0", "expected": "1\n"}
        ],
        "hiddenTests": [
            {"input": "5", "expected": "120\n"},
            {"input": "0", "expected": "1\n"},
            {"input": "1", "expected": "1\n"},
            {"input": "10", "expected": "3628800\n"},
            {"input": "12", "expected": "479001600\n"}
        ],
        "boilerplates": {
            "c": "#include <stdio.h>\n\nlong long factorial(int n) {\n    long long fact = 1;\n    for(int i = 1; i <= n; i++) {\n        fact *= i;\n    }\n    return fact;\n}\n\nint main() {\n    int n;\n    if (scanf(\"%d\", &n) == 1) {\n        printf(\"%lld\\n\", factorial(n));\n    }\n    return 0;\n}",
            "cpp": "#include <iostream>\nusing namespace std;\n\nlong long factorial(int n) {\n    long long fact = 1;\n    for(int i = 1; i <= n; i++) fact *= i;\n    return fact;\n}\n\nint main() {\n    int n;\n    if (cin >> n) {\n        cout << factorial(n) << endl;\n    }\n    return 0;\n}",
            "python": "import sys\n\ndef factorial(n):\n    fact = 1\n    for i in range(1, n + 1):\n        fact *= i\n    return fact\n\ntry:\n    n = int(sys.stdin.read().strip())\n    print(factorial(n))\nexcept:\n    pass",
            "java": "import java.util.Scanner;\n\npublic class Main {\n    public static long factorial(int n) {\n        long fact = 1;\n        for(int i = 1; i <= n; i++) fact *= i;\n        return fact;\n    }\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            System.out.println(factorial(n));\n        }\n    }\n}"
        }
    },
    {
        "id": "binary_search",
        "title": "5. Binary Search",
        "difficulty": "Medium",
        "statement": "Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1.",
        "instructions": "Input format: The first line contains N (array size). Second line contains N sorted integers. Third line contains target. Output: Target index (0-indexed) or -1.",
        "constraints": "1 <= N <= 10^4\n-10^4 < nums[i], target < 10^4\nTime Limit: 2.0s",
        "timeLimit": 2.0,
        "memoryLimit": 256,
        "sampleTests": [
            {"input": "6\n-1 0 3 5 9 12\n9", "expected": "4\n"},
            {"input": "6\n-1 0 3 5 9 12\n2", "expected": "-1\n"}
        ],
        "hiddenTests": [
            {"input": "6\n-1 0 3 5 9 12\n9", "expected": "4\n"},
            {"input": "6\n-1 0 3 5 9 12\n2", "expected": "-1\n"},
            {"input": "1\n5\n5", "expected": "0\n"},
            {"input": "1\n5\n-5", "expected": "-1\n"},
            {"input": "5\n1 2 3 4 5\n1", "expected": "0\n"},
            {"input": "5\n1 2 3 4 5\n5", "expected": "4\n"}
        ],
        "boilerplates": {
            "c": "#include <stdio.h>\n#include <stdlib.h>\n\nint binarySearch(int* nums, int numsSize, int target) {\n    int low = 0, high = numsSize - 1;\n    while(low <= high) {\n        int mid = low + (high - low)/2;\n        if(nums[mid] == target) return mid;\n        else if(nums[mid] < target) low = mid + 1;\n        else high = mid - 1;\n    }\n    return -1;\n}\n\nint main() {\n    int n;\n    if (scanf(\"%d\", &n) != 1) return 0;\n    int* nums = (int*)malloc(n * sizeof(int));\n    for(int i = 0; i < n; i++) {\n        scanf(\"%d\", &nums[i]);\n    }\n    int target;\n    scanf(\"%d\", &target);\n    printf(\"%d\\n\", binarySearch(nums, n, target));\n    free(nums);\n    return 0;\n}",
            "cpp": "#include <iostream>\n#include <vector>\nusing namespace std;\n\nint binarySearch(vector<int>& nums, int target) {\n    int low = 0, high = nums.size() - 1;\n    while(low <= high) {\n        int mid = low + (high - low)/2;\n        if(nums[mid] == target) return mid;\n        else if(nums[mid] < target) low = mid + 1;\n        else high = mid - 1;\n    }\n    return -1;\n}\n\nint main() {\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for(int i = 0; i < n; i++) {\n        cin >> nums[i];\n    }\n    int target;\n    cin >> target;\n    cout << binarySearch(nums, target) << endl;\n    return 0;\n}",
            "python": "import sys\n\ndef binarySearch(nums, target):\n    low, high = 0, len(nums) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if nums[mid] == target:\n            return mid\n        elif nums[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1\n\ntry:\n    inputs = sys.stdin.read().split()\n    if inputs:\n        n = int(inputs[0])\n        nums = [int(x) for x in inputs[1:n+1]]\n        target = int(inputs[n+1])\n        print(binarySearch(nums, target))\nexcept Exception:\n    pass",
            "java": "import java.util.Scanner;\n\npublic class Main {\n    public static int binarySearch(int[] nums, int target) {\n        int low = 0, high = nums.length - 1;\n        while(low <= high) {\n            int mid = low + (high - low)/2;\n            if(nums[mid] == target) return mid;\n            else if(nums[mid] < target) low = mid + 1;\n            else high = mid - 1;\n        }\n        return -1;\n    }\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            int[] nums = new int[n];\n            for(int i=0; i<n; i++) {\n                nums[i] = sc.nextInt();\n            }\n            int target = sc.nextInt();\n            System.out.println(binarySearch(nums, target));\n        }\n    }\n}"
        }
    }
]

def generate():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    q_dir = os.path.join(root, "data", "questions")
    h_dir = os.path.join(q_dir, "hidden")
    
    os.makedirs(q_dir, exist_ok=True)
    os.makedirs(h_dir, exist_ok=True)
    
    # 1. Write contests list JSON
    contests_path = os.path.join(root, "data", "contests.json")
    contests_data = [
        {
            "id": "practice_contest",
            "title": "SEED-IT Practice Contest",
            "description": "General practice for C, C++, Java, and Python.",
            "startTime": "2026-01-01T00:00:00Z",
            "endTime": "2026-12-31T23:59:59Z",
            "questions": ["hello_world", "add_numbers", "even_odd", "factorial", "binary_search"]
        }
    ]
    with open(contests_path, "w", encoding="utf-8") as f:
        json.dump(contests_data, f, indent=4)
        print("Generated data/contests.json")

    # 2. Write challenges list JSON
    challenges_list_path = os.path.join(q_dir, "challenges.json")
    challenges_summary = []
    
    for ch in CHALLENGES:
        challenges_summary.append({
            "id": ch["id"],
            "title": ch["title"],
            "difficulty": ch["difficulty"],
            "description": ch["statement"],
            "category": "Fundamentals" if ch["id"] in ["hello_world", "add_numbers", "even_odd"] else "Advanced"
        })
        
        # Public question details
        pub_question = {
            "id": ch["id"],
            "title": ch["title"],
            "difficulty": ch["difficulty"],
            "statement": ch["statement"],
            "instructions": ch["instructions"],
            "constraints": ch["constraints"],
            "timeLimit": ch["timeLimit"],
            "memoryLimit": ch["memoryLimit"],
            "sampleTests": ch["sampleTests"],
            "boilerplates": ch["boilerplates"]
        }
        
        # Write public JSON
        pub_path = os.path.join(q_dir, f"{ch['id']}.json")
        with open(pub_path, "w", encoding="utf-8") as f:
            json.dump(pub_question, f, indent=4)
            
        # Obfuscate and write hidden tests
        hidden_tests = ch["hiddenTests"]
        hidden_json_str = json.dumps(hidden_tests)
        obfuscated_str = obfuscate(hidden_json_str)
        
        hid_path = os.path.join(h_dir, f"{ch['id']}_hidden.json")
        with open(hid_path, "w", encoding="utf-8") as f:
            f.write(obfuscated_str)
            
        print(f"Generated question: {ch['id']}")
        
    with open(challenges_list_path, "w", encoding="utf-8") as f:
        json.dump(challenges_summary, f, indent=4)
        print("Generated data/questions/challenges.json")
        
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    generate()
