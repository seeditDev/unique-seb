import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { FaPlay, FaCheck, FaTimes, FaUndo, FaList, FaBookOpen, FaArrowLeft, FaSearch, FaChevronLeft, FaChevronRight, FaLightbulb, FaUser, FaLock } from 'react-icons/fa';
import { db } from '../firebase-config';
import { collection, doc, setDoc, getDocs, getDoc, serverTimestamp } from 'firebase/firestore';
import desktopBridge, { isEngineDisconnected } from '../utils/desktopBridge';
import { useLocation, useNavigate } from '../router-compat';
import { normalizeTestCaseArray, compareOutputs } from '../utils/testCaseUtils';
import { toast } from 'sonner';
import '../styles/CodingSandbox.css';

// Predefined fallback challenges
const DEFAULT_CHALLENGES = [
    {
        id: 'hello_world',
        title: '1. Hello, World!',
        difficulty: 'Easy',
        description: 'Write a program that outputs exactly "Hello, World!" to the console.',
        instructions: 'Your code should print "Hello, World!" followed by a new line.',
        constraints: 'Time Limit: 2.0s',
        testCases: [
            { input: '', expected: 'Hello, World!\n' }
        ],
        boilerplates: {
            c: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}`,
            cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`,
            python: `print("Hello, World!")`,
            java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`
        }
    },
    {
        id: 'add_numbers',
        title: '2. Sum of Two Integers',
        difficulty: 'Easy',
        description: 'Write a program that reads two space-separated integers from standard input and prints their sum.',
        instructions: 'Input consists of two integers, A and B. Output a single integer representing A + B.',
        constraints: 'A, B <= 10^5\nTime Limit: 2.0s',
        testCases: [
            { input: '5 10', expected: '15\n' },
            { input: '-3 8', expected: '5\n' },
            { input: '100 -200', expected: '-100\n' }
        ],
        boilerplates: {
            c: `#include <stdio.h>\n\nint main() {\n    int a, b;\n    if (scanf("%d %d", &a, &b) == 2) {\n        printf("%d\\n", a + b);\n    }\n    return 0;\n}`,
            cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    if (cin >> a >> b) {\n        cout << a + b << endl;\n    }\n    return 0;\n}`,
            python: `import sys\n\ntry:\n    inputs = sys.stdin.read().split()\n    if len(inputs) >= 2:\n        a, b = int(inputs[0]), int(inputs[1])\n        print(a + b)\nexcept Exception as e:\n    pass`,
            java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        if (scanner.hasNextInt()) {\n            int a = scanner.nextInt();\n            int b = scanner.nextInt();\n            System.out.println(a + b);\n        }\n    }\n}`
        }
    },
    {
        id: 'even_odd',
        title: '3. Even or Odd',
        difficulty: 'Easy',
        description: 'Read an integer N from standard input and output "Even" if N is even, and "Odd" if N is odd.',
        instructions: 'Input consists of a single integer. Output exactly "Even" or "Odd" (case-sensitive).',
        constraints: '-10^9 <= N <= 10^9\nTime Limit: 2.0s',
        testCases: [
            { input: '4', expected: 'Even\n' },
            { input: '7', expected: 'Odd\n' },
            { input: '0', expected: 'Even\n' },
            { input: '-5', expected: 'Odd\n' }
        ],
        boilerplates: {
            c: `#include <stdio.h>\n\nint main() {\n    int n;\n    if (scanf("%d", &n) == 1) {\n        if (n % 2 == 0) {\n            printf("Even\\n");\n        } else {\n            printf("Odd\\n");\n        }\n    }\n    return 0;\n}`,
            cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    if (cin >> n) {\n        if (n % 2 == 0) cout << "Even" << endl;\n        else cout << "Odd" << endl;\n    }\n    return 0;\n}`,
            python: `import sys\n\ntry:\n    n = int(sys.stdin.read().strip())\n    if n % 2 == 0:\n        print("Even")\n    else:\n        print("Odd")\nexcept:\n    pass`,
            java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            if (n % 2 == 0) System.out.println("Even");\n            else System.out.println("Odd");\n        }\n    }\n}`
        }
    },
    {
        id: 'factorial',
        title: '4. Factorial of N',
        difficulty: 'Medium',
        description: 'Write a program that calculates the factorial of a given non-negative integer N. Factorial of N (N!) is the product of all positive integers less than or equal to N.',
        instructions: 'Input consists of an integer N. Output the factorial value.',
        constraints: '0 <= N <= 12 (to prevent integer overflow)\nTime Limit: 2.0s',
        testCases: [
            { input: '0', expected: '1\n' },
            { input: '1', expected: '1\n' },
            { input: '5', expected: '120\n' },
            { input: '10', expected: '3628800\n' }
        ],
        boilerplates: {
            c: `#include <stdio.h>\n\nlong long factorial(int n) {\n    long long fact = 1;\n    for(int i = 1; i <= n; i++) {\n        fact *= i;\n    }\n    return fact;\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) == 1) {\n        printf("%lld\\n", factorial(n));\n    }\n    return 0;\n}`,
            cpp: `#include <iostream>\nusing namespace std;\n\nlong long factorial(int n) {\n    long long fact = 1;\n    for(int i = 1; i <= n; i++) fact *= i;\n    return fact;\n}\n\nint main() {\n    int n;\n    if (cin >> n) {\n        cout << factorial(n) << endl;\n    }\n    return 0;\n}`,
            python: `import sys\n\ndef factorial(n):\n    fact = 1\n    for i in range(1, n + 1):\n        fact *= i\n    return fact\n\ntry:\n    n = int(sys.stdin.read().strip())\n    print(factorial(n))\nexcept:\n    pass`,
            java: `import java.util.Scanner;\n\npublic class Main {\n    public static long factorial(int n) {\n        long fact = 1;\n        for(int i = 1; i <= n; i++) fact *= i;\n        return fact;\n    }\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            System.out.println(factorial(n));\n        }\n    }\n}`
        }
    },
    {
        id: 'binary_search',
        title: '5. Binary Search',
        difficulty: 'Medium',
        description: 'Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1.\n\nYou must write an algorithm with O(log n) runtime complexity.',
        instructions: 'Input format: The first line contains N, the size of the array. The second line contains N space-separated integers. The third line contains the target integer. Output: A single integer representing the index of the target (0-indexed), or -1 if not found.',
        constraints: '1 <= nums.length <= 10^4\n-10^4 < nums[i], target < 10^4\nAll integers in nums are unique.\nnums is sorted in ascending order.\nTime Limit: 2.0s',
        testCases: [
            { input: '6\n-1 0 3 5 9 12\n9', expected: '4\n' },
            { input: '6\n-1 0 3 5 9 12\n2', expected: '-1\n' },
            { input: '1\n5\n5', expected: '0\n' },
            { input: '1\n5\n-5', expected: '-1\n' },
            { input: '5\n1 2 3 4 5\n1', expected: '0\n' },
            { input: '5\n1 2 3 4 5\n5', expected: '4\n' },
            { input: '5\n1 2 3 4 5\n3', expected: '2\n' }
        ],
        boilerplates: {
            c: `#include <stdio.h>\n#include <stdlib.h>\n\nint binarySearch(int* nums, int numsSize, int target) {\n    // Write your code here\n    return -1;\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(n * sizeof(int));\n    for(int i = 0; i < n; i++) {\n        scanf("%d", &nums[i]);\n    }\n    int target;\n    scanf("%d", &target);\n    printf("%d\\n", binarySearch(nums, n, target));\n    free(nums);\n    return 0;\n}`,
            cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint binarySearch(vector<int>& nums, int target) {\n    // Write your code here\n    return -1;\n}\n\nint main() {\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for(int i = 0; i < n; i++) {\n        cin >> nums[i];\n    }\n    int target;\n    cin >> target;\n    cout << binarySearch(nums, target) << endl;\n    return 0;\n}`,
            python: `import sys\n\ndef binarySearch(nums, target):\n    # Write your code here\n    return -1\n\ntry:\n    inputs = sys.stdin.read().split()\n    if inputs:\n        n = int(inputs[0])\n        nums = [int(x) for x in inputs[1:n+1]]\n        target = int(inputs[n+1])\n        print(binarySearch(nums, target))\nexcept Exception:\n    pass`,
            java: `import java.util.Scanner;\n\npublic class Main {\n    public static int binarySearch(int[] nums, int target) {\n        // Write your code here\n        return -1;\n    }\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            int[] nums = new int[n];\n            for(int i=0; i<n; i++) {\n                nums[i] = sc.nextInt();\n            }\n            int target = sc.nextInt();\n            System.out.println(binarySearch(nums, target));\n        }\n    }\n}`
        }
    }
];

const FREE_BOILERPLATES = {
    c: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}`,
    cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`,
    python: `print("Hello, World!")`,
    java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`,
    javascript: `console.log("Hello, World!");`
};

const normalizeQuestion = (q) => {
    if (!q) return q;
    const id = q.questionId || (q.id  ?? '');
    const title = q.title ?? '';
    const description = q.content?.problemStatement || (q.description  ?? '');
    const instructions = q.content?.inputFormat || (q.instructions  ?? '');
    const constraints = Array.isArray(q.content?.constraints) 
        ? q.content.constraints.join('\n') 
        : (q.constraints ?? '');

    // Normalize boilerplates robustly supporting camelCase, lowerCase, and standard language keys
    const getNormalizedLangKey = (k) => {
        const clean = String(k).trim().toLowerCase();
        if (clean === 'c') return 'c';
        if (clean === 'cpp' || clean === 'c++') return 'cpp';
        if (clean === 'java') return 'java';
        if (clean === 'python' || clean === 'python3') return 'python';
        if (clean === 'javascript' || clean === 'js') return 'javascript';
        return clean;
    };

    const rawBoilerplates = q.boilerPlates ?? {};
    const boilerplates = {};

    Object.entries(rawBoilerplates).forEach(([lang, val]) => {
        const norm = getNormalizedLangKey(lang);
        if (norm === 'python') {
            boilerplates.python = val;
            boilerplates.python3 = val;
        } else {
            boilerplates[norm] = val;
        }
    });

    if (q.solution?.code) {
        Object.entries(q.solution.code).forEach(([lang, val]) => {
            const norm = getNormalizedLangKey(lang);
            if (norm === 'python') {
                boilerplates.python = val;
                boilerplates.python3 = val;
            } else {
                boilerplates[norm] = val;
            }
        });
    }

    // Normalize sample test cases
    const sampleTestCases = normalizeTestCaseArray(q.content?.sampleTestCases || q.sampleTestCases || q.sampleTests || []);

    // Normalize hidden test cases
    let hidden = [];
    if (q.testCases?.hidden) {
        hidden = normalizeTestCaseArray(q.testCases.hidden);
    } else if (Array.isArray(q.testCases)) {
        hidden = normalizeTestCaseArray(q.testCases);
    }

    return {
        ...q,
        id,
        title,
        description,
        instructions,
        constraints,
        boilerplates,
        sampleTestCases,
        sampleTests: sampleTestCases,
        hiddenTests: hidden,
        testCases: {
            ...q.testCases,
            hidden: hidden
        }
    };
};

const CodingSandbox = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Parse URL query parameter: ?challenge=hello_world
    const searchParams = new URLSearchParams(location.search);
    const challengeParam = searchParams.get('challenge');
    const mode = challengeParam ? "challenges" : "free";

    const [challenges, setChallenges] = useState([]);
    const [selectedChallenge, setSelectedChallenge] = useState(null);
    const [completedChallenges, setCompletedChallenges] = useState({});
    const [language, setLanguage] = useState('cpp');
    const [code, setCode] = useState('');  // Used only for initial load/reset
    const codeRef = useRef('');
    const editorRef = useRef(null);  // Direct editor instance to avoid setValue() on re-renders
    const [customInput, setCustomInput] = useState('');
    const [activeTab, setActiveTab] = useState('input'); // 'input', 'output', 'results'
    const [activeLeftTab, setActiveLeftTab] = useState('description'); // 'description', 'editorial', 'solutions', 'submissions'
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerSearch, setDrawerSearch] = useState('');
    const [user, setUser] = useState(null);

    const [isRunning, setIsRunning] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    // Outputs
    const [stdout, setStdout] = useState('');
    const [stderr, setStderr] = useState('');
    const [exitCode, setExitCode] = useState(null);
    const [testResults, setTestResults] = useState([]);

    // 1. Initial authentication and loading attempts from Firestore
    useEffect(() => {
        const loadInitialData = async () => {
            let activeUser = null;
            try {
                const authData = JSON.parse(localStorage.getItem("auth_data") ?? "{}");
                if (authData.Email) {
                    let isPremium = false;
                    try {
                        const userDocSnap = await getDoc(doc(db, "users", authData.Email));
                        if (userDocSnap.exists()) {
                            isPremium = !!userDocSnap.data().isPremium;
                        }
                    } catch (userErr) {
                        console.error("Failed to fetch user premium status:", userErr);
                    }
                    const fullUser = { ...authData, isPremium };
                    setUser(fullUser);
                    activeUser = fullUser;

                    // Fetch user attempts
                    const attemptsCol = collection(db, "users", authData.Email, "codingAttempts");
                    const attemptsSnap = await getDocs(attemptsCol);
                    const completedMap = {};
                    attemptsSnap.forEach(doc => {
                        if (doc.data().completed) {
                            completedMap[doc.id] = true;
                        }
                    });
                    setCompletedChallenges(completedMap);
                } else {
                    // Redirect to login if user session is absent
                    navigate('/login');
                    return;
                }
            } catch (err) {
                console.error("Failed to load user attempts from Firestore:", err);
            }

            // 2. Fetch challenges list
            try {
                const challengesCol = collection(db, "codingChallenges");
                const challengesSnap = await getDocs(challengesCol);

                if (challengesSnap.empty) {
                    // Seed the default challenges list
                    console.log("No coding challenges found in database. Seeding defaults...");
                    for (const ch of DEFAULT_CHALLENGES) {
                        await setDoc(doc(db, "codingChallenges", ch.id), ch);
                    }
                    setChallenges(DEFAULT_CHALLENGES.map(normalizeQuestion));
                } else {
                    const fetchedList = [];
                    challengesSnap.forEach(doc => {
                        fetchedList.push(normalizeQuestion({ id: doc.id, ...doc.data() }));
                    });
                    fetchedList.sort((a, b) => a.title.localeCompare(b.title));
                    setChallenges(fetchedList);
                }
            } catch (err) {
                console.error("Failed to load challenges from database. Using local backup:", err);
                setChallenges(DEFAULT_CHALLENGES.map(normalizeQuestion));
            }
        };

        loadInitialData();
    }, [navigate]);

    // 3. Keep selectedChallenge in sync with URL challenge parameter
    useEffect(() => {
        if (challenges.length > 0 && challengeParam) {
            const found = challenges.find(ch => ch.id === challengeParam);
            if (found) {
                const isPremiumUser = user?.Premium === true || user?.Premium === 'true' || user?.Premium === 1 || user?.Premium === 2 || user?.Premium === 'Yes' || !!user?.isPremium;
                if (found.isPremium && (!user || !isPremiumUser)) {
                    if (user) {
                        toast.warning("This is a Premium challenge. Please upgrade your subscription to access it.");
                        navigate('/student/learn');
                        return;
                    }
                    return;
                }
                setSelectedChallenge(found);
            } else {
                setSelectedChallenge(challenges[0]);
            }
        } else {
            setSelectedChallenge(null);
        }
    }, [challenges, challengeParam, user, navigate]);

    // 4. Sync boilerplate code when selected challenge or language changes
    useEffect(() => {
        let newCode;
        if (mode === 'free') {
            newCode = (FREE_BOILERPLATES[language] ?? '').replace(/\r\n/g, '\n');
        } else if (selectedChallenge?.boilerplates?.[language]) {
            newCode = selectedChallenge.boilerplates[language].replace(/\r\n/g, '\n');
        } else {
            return; // no change needed
        }
        setCode(newCode);
        if (editorRef.current) editorRef.current.setValue(newCode);
        // Clear panel outputs when switching problems
        setStdout('');
        setStderr('');
        setExitCode(null);
        setTestResults([]);
        setActiveTab('input');
    }, [selectedChallenge, language, mode]);

    const handleResetCode = () => {
        if (window.confirm("Are you sure you want to reset your code to the default template?")) {
            const newCode = mode === 'free'
                ? (FREE_BOILERPLATES[language] ?? '').replace(/\r\n/g, '\n')
                : (selectedChallenge?.boilerplates?.[language] ?? '').replace(/\r\n/g, '\n');
            setCode(newCode);
            if (editorRef.current) editorRef.current.setValue(newCode);
        }
    };

    // Yield a paint frame to keep camera/UI alive before heavy execution
    const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    // Compile and run code with custom input
    const handleRunCode = async () => {
        setIsRunning(true);
        setActiveTab('output');
        setStdout('Running execution...');
        setStderr('');
        setExitCode(null);

        try {
            const currentCode = editorRef.current ? editorRef.current.getValue() : code;
            await yieldFrame();
            const result = await desktopBridge.runDirectSandbox(language, currentCode, customInput);
            setStdout(result.stdout || (result.exit_code === 0 && !result.stderr ? "Code execution completed successfully with no output." : ""));
            setStderr(result.stderr || (result.error  ?? ""));
            setExitCode(result.exit_code === undefined ? null : result.exit_code);
        } catch (err) {
            setStderr(`Execution Failed: ${err.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    // Submit against test cases
    const handleTestCode = async () => {
        if (!selectedChallenge || mode === 'free') return;
        setIsTesting(true);
        setActiveTab('results');
        setTestResults([]);

        const results = [];
        const cases = selectedChallenge.testCases || [];

const isCodeBlankOrEmpty = (codeStr) => {
  if (!codeStr || typeof codeStr !== 'string') return true;
  const trimmed = codeStr.trim();
  if (trimmed === '') return true;
  const noComments = trimmed
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    .replace(/#.*/g, '')
    .trim();
  return noComments === '';
};

        try {
            const currentCode = editorRef.current ? editorRef.current.getValue() : code;
            const isBlank = isCodeBlankOrEmpty(currentCode);
            await yieldFrame();
            for (let i = 0; i < cases.length; i++) {
                const tc = cases[i];
                if (i > 0) await yieldFrame();
                const res = isBlank
                    ? { stdout: '', stderr: 'No code submitted in editor.', exit_code: 1 }
                    : await desktopBridge.runDirectSandbox(language, currentCode, tc.input);

                if (isEngineDisconnected(res)) {
                    results.push({
                        index: i + 1,
                        input: tc.input,
                        expected: (tc.expected ?? '').replace(/\r\n/g, '\n').trim(),
                        actual: '',
                        passed: false,
                        stderr: 'Evaluation engine not connected. Please restart the application or rerun the code.'
                    });
                    break; // Stop running remaining test cases!
                }
                
                const cleanActual = (res.stdout ?? '').replace(/\r\n/g, '\n').trim();
                const cleanExpected = (tc.expected ?? '').replace(/\r\n/g, '\n').trim();
                const isPassed = !isBlank && compareOutputs(res.stdout, tc.expected) && (res.exit_code === 0 || res.exit_code === undefined) && !res.error;

                results.push({
                    index: i + 1,
                    input: tc.input,
                    expected: cleanExpected,
                    actual: cleanActual,
                    passed: isPassed,
                    stderr: isBlank ? 'No code submitted in editor.' : (res.stderr || (res.error  ?? ""))
                });
            }
            setTestResults(results);

            // Log completion in Firestore if all pass (ignore offline errors)
            if (results.length > 0 && results.every(r => r.passed)) {
                if (user?.Email) {
                    try {
                        await setDoc(doc(db, "users", user.uid, "codingAttempts", selectedChallenge.id), {
                            completed: true,
                            language: language,
                            submittedCode: code,
                            timestamp: serverTimestamp()
                        });
                        setCompletedChallenges(prev => ({
                            ...prev,
                            [selectedChallenge.id]: true
                        }));
                    } catch (dbErr) {
                        console.error("Failed to save attempt in database:", dbErr);
                    }
                }
            }
        } catch (err) {
            toast.error(`Testing failed: ${err.message}`);
        } finally {
            setIsTesting(false);
        }
    };

    // Previous and Next buttons toggling
    const currentChallengeIndex = challenges.findIndex(ch => ch.id === selectedChallenge?.id);

    const handlePrevChallenge = () => {
        if (currentChallengeIndex > 0) {
            const prev = challenges[currentChallengeIndex - 1];
            navigate(`/student/sandbox?challenge=${prev.id}`);
        }
    };

    const handleNextChallenge = () => {
        if (currentChallengeIndex < challenges.length - 1 && currentChallengeIndex !== -1) {
            const next = challenges[currentChallengeIndex + 1];
            navigate(`/student/sandbox?challenge=${next.id}`);
        }
    };

    const monacoLanguage = language === 'cpp' ? 'cpp' : (language === 'c' ? 'c' : (language === 'java' ? 'java' : (language === 'javascript' ? 'javascript' : 'python')));
    const userInitials = user?.Name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

    return (
        <div className="sandbox-fullscreen-container">
            {/* SEED-IT Header Nav */}
            <header className="sandbox-workspace-header">
                <div className="header-left">
                    <button 
                        onClick={() => navigate(mode === 'free' ? '/student/dashboard' : '/student/learn')} 
                        className="nav-back-btn" 
                        title="Back"
                    >
                        <FaArrowLeft />
                    </button>
                    <img 
                        src="https://raw.githubusercontent.com/seeditDev/SEED-Website/f3cee9002410a00df4da7bea636ac9fbc4c312ca/Plugins/SEED_Logo.webp" 
                        alt="SEED Logo" 
                        className="header-logo" 
                    />
                    
                    {mode !== 'free' && (
                        <>
                            <button className="problem-list-toggle-btn" onClick={() => setIsDrawerOpen(true)}>
                                <FaList /> Problem List
                            </button>
                            <div className="challenge-nav-buttons">
                                <button 
                                    onClick={handlePrevChallenge} 
                                    disabled={currentChallengeIndex <= 0}
                                    className="nav-arrow-btn"
                                    title="Previous Challenge"
                                >
                                    <FaChevronLeft />
                                </button>
                                <button 
                                    onClick={handleNextChallenge} 
                                    disabled={currentChallengeIndex >= challenges.length - 1 || currentChallengeIndex === -1}
                                    className="nav-arrow-btn"
                                    title="Next Challenge"
                                >
                                    <FaChevronRight />
                                </button>
                            </div>
                        </>
                    )}

                    {mode === 'free' && <span className="header-mode-title">Code Editor Sandbox</span>}
                </div>

                <div className="header-center-actions">
                    <button 
                        className="header-run-btn" 
                        onClick={handleRunCode} 
                        disabled={isRunning || isTesting}
                    >
                        <FaPlay /> Run
                    </button>
                    {mode !== 'free' && (
                        <button 
                            className="header-submit-btn" 
                            onClick={handleTestCode} 
                            disabled={isRunning || isTesting}
                        >
                            <FaCheck /> Submit
                        </button>
                    )}
                </div>

                <div className="header-right">
                    <div className="user-profile-circle small">
                        {userInitials}
                    </div>
                </div>
            </header>

            {/* Sliding Sidebar Drawer */}
            {mode !== 'free' && (
                <div className={`sandbox-drawer-overlay ${isDrawerOpen ? 'open' : ''}`} onClick={() => setIsDrawerOpen(false)}>
                    <div className="sandbox-drawer-content" onClick={(e) => e.stopPropagation()}>
                        <div className="drawer-header">
                            <h3>Problem List</h3>
                            <button className="close-drawer-btn" onClick={() => setIsDrawerOpen(false)}>
                                <FaTimes />
                            </button>
                        </div>
                        <div className="drawer-search-wrapper">
                            <FaSearch className="search-icon" />
                            <input 
                                type="text" 
                                placeholder="Search questions..." 
                                value={drawerSearch}
                                onChange={(e) => setDrawerSearch(e.target.value)}
                                className="drawer-search-input"
                            />
                        </div>
                        <div className="drawer-challenges-list">
                            {challenges.filter(ch => ch.title.toLowerCase().includes(drawerSearch.toLowerCase())).map((ch) => {
                                const isPremiumUser = user?.Premium === true || user?.Premium === 'true' || user?.Premium === 1 || user?.Premium === 2 || user?.Premium === 'Yes' || !!user?.isPremium;
                                const isLocked = ch.isPremium && !isPremiumUser;
                                return (
                                    <button
                                        key={ch.id}
                                        className={`drawer-challenge-item ${selectedChallenge?.id === ch.id ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                                        onClick={() => {
                                            if (isLocked) {
                                                toast.warning("This is a Premium challenge. Please upgrade your subscription to access it.");
                                                return;
                                            }
                                            setIsDrawerOpen(false);
                                            navigate(`/student/sandbox?challenge=${ch.id}`);
                                        }}
                                    >
                                        <div className="ch-title-row">
                                            <span>
                                                {ch.title}
                                                {isLocked && <FaLock className="drawer-lock-icon" style={{ marginLeft: '6px', color: '#ffb300', fontSize: '0.75rem' }} />}
                                            </span>
                                            {completedChallenges[ch.id] && <FaCheck className="drawer-completed-icon" />}
                                        </div>
                                        <span className={`drawer-diff ${ch.difficulty?.toLowerCase() || ''}`}>{ch.difficulty}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Sandbox Layout */}
            <div className={`sandbox-wrapper ${mode === 'free' ? 'free-mode' : ''}`}>
                <div className="sandbox-layout">
                    {/* Left Side: SEED-IT-style tabbed problem details panel */}
                    {mode !== 'free' && selectedChallenge && (
                        <div className="problem-panel">
                            <div className="problem-tabs-header">
                                <button 
                                    className={`tab-link ${activeLeftTab === 'description' ? 'active' : ''}`}
                                    onClick={() => setActiveLeftTab('description')}
                                >
                                    Description
                                </button>
                                <button 
                                    className={`tab-link ${activeLeftTab === 'editorial' ? 'active' : ''}`}
                                    onClick={() => setActiveLeftTab('editorial')}
                                >
                                    Editorial
                                </button>
                                <button 
                                    className={`tab-link ${activeLeftTab === 'solutions' ? 'active' : ''}`}
                                    onClick={() => setActiveLeftTab('solutions')}
                                >
                                    Solutions
                                </button>
                                <button 
                                    className={`tab-link ${activeLeftTab === 'submissions' ? 'active' : ''}`}
                                    onClick={() => setActiveLeftTab('submissions')}
                                >
                                    Submissions
                                </button>
                            </div>

                            <div className="problem-tab-content">
                                {activeLeftTab === 'description' && (
                                    <div className="problem-content">
                                        <h2 className="prob-title">{selectedChallenge.title}</h2>
                                        <div className="prob-meta">
                                            <span className={`diff-badge ${selectedChallenge.difficulty?.toLowerCase() || ''}`}>
                                                {selectedChallenge.difficulty}
                                            </span>
                                            <span className="constraint-badge">{selectedChallenge.constraints}</span>
                                        </div>
                                        <div className="prob-section">
                                            <p>{selectedChallenge.description}</p>
                                        </div>
                                        <div className="prob-section">
                                            <h4>Instructions</h4>
                                            <p className="instructions-txt">{selectedChallenge.instructions}</p>
                                        </div>

                                        {selectedChallenge.testCases && selectedChallenge.testCases.length > 0 && (
                                            <div className="prob-section">
                                                <h4>Example Test Case</h4>
                                                <div className="example-block">
                                                    <strong>Input:</strong>
                                                    <pre>{selectedChallenge.testCases[0].input ?? "(None)"}</pre>
                                                    <strong>Expected Output:</strong>
                                                    <pre>{selectedChallenge.testCases[0].expected}</pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeLeftTab === 'editorial' && (
                                    <div className="editorial-content">
                                        <h3>Editorial / Solution Analysis</h3>
                                        <div className="editorial-lock-card">
                                            <p>Complete the challenge and pass all tests to unlock details. Editorial solutions are provided to guide structure optimization.</p>
                                            <div className="lock-icon-box"></div>
                                        </div>
                                    </div>
                                )}

                                {activeLeftTab === 'solutions' && (
                                    <div className="solutions-content">
                                        <h3>Community Solutions</h3>
                                        <p>Find optimized logic in languages such as C, C++, Python, and Java. Solve the problem to access and submit custom community patterns.</p>
                                        <div className="solution-template-item">
                                            <h4>Recommended Pattern (C++ / C)</h4>
                                            <pre>Use standard streams and clear buffering to optimize memory cycles.</pre>
                                        </div>
                                    </div>
                                )}

                                {activeLeftTab === 'submissions' && (
                                    <div className="submissions-content">
                                        <h3>My Submissions</h3>
                                        {completedChallenges[selectedChallenge.id] ? (
                                            <div className="submission-history-item success">
                                                <div className="sh-header">
                                                    <span className="status">Accepted</span>
                                                    <span className="lang">Language: {language.toUpperCase()}</span>
                                                </div>
                                                <p>You have successfully solved this challenge. Keep practicing!</p>
                                            </div>
                                        ) : (
                                            <p className="no-submissions-txt">No accepted submissions found for this challenge.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Right Side: Code Editor and Console */}
                    <div className="editor-console-panel">
                        {/* Guidance Network Tip */}
                        <div className="sandbox-network-tip">
                            <FaLightbulb className="tip-icon" />
                            <span>
                                <strong>Connection Guide:</strong> If compiling inside campus Wi-Fi, please connect your device to a <strong>mobile hotspot / personal network</strong> to bypass shared IP limits.
                            </span>
                        </div>
                        
                        {/* Toolbar */}
                        <div className="editor-toolbar">
                            <div className="toolbar-left">
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="toolbar-select"
                                >
                                    <option value="cpp">C++ (GCC 10.2)</option>
                                    <option value="c">C (GCC 10.2)</option>
                                    <option value="python">Python 3.10</option>
                                    <option value="java">Java 15</option>
                                    <option value="javascript">JavaScript (Node.js 18)</option>
                                </select>
                            </div>
                            <div className="toolbar-right">
                                <button className="toolbar-btn reset" onClick={handleResetCode}>
                                    <FaUndo /> Reset
                                </button>
                            </div>
                        </div>

                        {/* Editor Container */}
                        <div className="monaco-editor-container">
                            <Editor
                                key={`${selectedChallenge?.id ?? ''}_${monacoLanguage}`}
                                height="100%"
                                language={monacoLanguage}
                                theme="vs-dark"
                                defaultValue={code}
                                onChange={(val) => {
                                    codeRef.current = val ?? '';
                                }}
                                onMount={(editor) => {
                                    editorRef.current = editor;
                                    const currentCode = codeRef.current || (code  ?? '');
                                    if (editor.getValue() !== currentCode) {
                                        editor.setValue(currentCode);
                                    }
                                }}
                                options={{
                                    fontSize: 14,
                                    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    tabSize: 4,
                                    wordWrap: 'off'
                                }}
                            />
                        </div>

                        {/* Console Tabs & Actions */}
                        <div className="console-panel">
                            <div className="console-tabs-row">
                                <div className="console-tabs">
                                    <button
                                        className={`tab-btn ${activeTab === 'input' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('input')}
                                    >
                                        Custom Input
                                    </button>
                                    <button
                                        className={`tab-btn ${activeTab === 'output' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('output')}
                                    >
                                        Console Output
                                    </button>
                                    {mode !== 'free' && selectedChallenge && (
                                        <button
                                            className={`tab-btn ${activeTab === 'results' ? 'active' : ''}`}
                                            onClick={() => setActiveTab('results')}
                                        >
                                            Test Cases ({selectedChallenge.testCases?.length || 0})
                                        </button>
                                    )}
                                </div>
                                <div className="console-actions">
                                    <button
                                        className="action-btn run-btn"
                                        onClick={handleRunCode}
                                        disabled={isRunning || isTesting}
                                    >
                                        <FaPlay /> {isRunning ? "Running..." : "Run"}
                                    </button>
                                    {mode !== 'free' && (
                                        <button
                                            className="action-btn test-btn"
                                            onClick={handleTestCode}
                                            disabled={isRunning || isTesting}
                                        >
                                            <FaCheck /> {isTesting ? "Testing..." : "Submit Tests"}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Console Tab Content */}
                            <div className="console-tab-content">
                                {activeTab === 'input' && (
                                    <textarea
                                        className="console-textarea stdin"
                                        placeholder="Enter custom input values to feed into standard input (stdin)..."
                                        value={customInput}
                                        onChange={(e) => setCustomInput(e.target.value)}
                                    />
                                )}

                                {activeTab === 'output' && (
                                    <div className="console-output-box">
                                        {isRunning ? (
                                            <div className="console-loader">
                                                <div className="mini-spinner"></div>
                                                <span>Executing code...</span>
                                            </div>
                                        ) : stderr ? (
                                            <div className="execution-error">
                                                <h4>Runtime/Compilation Error:</h4>
                                                <pre>{stderr}</pre>
                                            </div>
                                        ) : stdout ? (
                                            <div className="execution-success">
                                                <h4>Exit Code: {exitCode}</h4>
                                                <pre>{stdout}</pre>
                                            </div>
                                        ) : (
                                            <p className="no-output-text">Click "Run" to view compilation output.</p>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'results' && (
                                    <div className="test-results-container">
                                        {isTesting ? (
                                            <div className="console-loader">
                                                <div className="mini-spinner"></div>
                                                <span>Running test cases...</span>
                                            </div>
                                        ) : testResults.length === 0 ? (
                                            <p className="no-output-text">Click "Submit Tests" to check code validity.</p>
                                        ) : (
                                            <div className="test-cases-list">
                                                <div className="test-overall-status">
                                                    {testResults.every(r => r.passed) ? (
                                                        <span className="status-label all-passed">
                                                            <FaCheck /> All Test Cases Passed!
                                                        </span>
                                                    ) : (
                                                        <span className="status-label failed">
                                                            <FaTimes /> Some Test Cases Failed
                                                        </span>
                                                    )}
                                                </div>
                                                {testResults.map((tr) => (
                                                    <div key={tr.index} className={`test-case-card ${tr.passed ? 'passed' : 'failed'}`}>
                                                        <div className="test-case-header">
                                                            <h4>Test Case {tr.index}</h4>
                                                            <span className={`status-badge ${tr.passed ? 'passed' : 'failed'}`}>
                                                                {tr.passed ? "Passed" : "Failed"}
                                                            </span>
                                                        </div>
                                                        <div className="test-case-details">
                                                            <div className="tc-detail-col">
                                                                <strong>Input:</strong>
                                                                <pre>{tr.input ?? "(None)"}</pre>
                                                            </div>
                                                            <div className="tc-detail-col">
                                                                <strong>Expected:</strong>
                                                                <pre>{tr.expected}</pre>
                                                            </div>
                                                            <div className="tc-detail-col">
                                                                <strong>Actual:</strong>
                                                                <pre>{tr.actual ?? "(No output)"}</pre>
                                                            </div>
                                                        </div>
                                                        {tr.stderr && (
                                                            <div className="tc-error-box">
                                                                <strong>Stderr:</strong>
                                                                <pre>{tr.stderr}</pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CodingSandbox;
