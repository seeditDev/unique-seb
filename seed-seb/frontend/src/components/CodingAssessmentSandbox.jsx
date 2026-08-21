import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { FaPlay, FaCheck, FaTimes, FaUndo, FaList, FaBookOpen, FaArrowLeft, FaSearch, FaChevronLeft, FaChevronRight, FaLightbulb, FaUser, FaLock, FaClock } from 'react-icons/fa';
import { db } from '../lib/firebase-config';
import { collection, doc, setDoc, getDocs, getDoc, serverTimestamp } from 'firebase/firestore';
import desktopBridge from '../utils/desktopBridge';
import { useLocation, useNavigate } from './router-compat';
import '../styles/CodingAssessmentSandbox.css';

const isRunningInPyQt = () => {
    return navigator.userAgent.includes('QtWebEngine') ||
           navigator.userAgent.includes('QtWebKit');
};

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

const CodingAssessmentSandbox = ({ isEmbedded = false, testData = null, secTimer = 0, onSectionSubmit = null, settings = {} }) => {
    const location = useLocation();
    const navigate = useNavigate();

    // Parse URL query parameter: ?challenge=hello_world&contest=contest_id
    const searchParams = new URLSearchParams(location.search);
    const challengeParam = searchParams.get('challenge');
    const contestParam = searchParams.get('contest');
    const mode = isEmbedded ? "challenges" : ((challengeParam || contestParam) ? "challenges" : "free");


    const [challenges, setChallenges] = useState([]);
    const [selectedChallenge, setSelectedChallenge] = useState(null);
    const currentChallengeIndex = challenges.findIndex(ch => ch.id === selectedChallenge?.id);
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
    const [qTimerRemaining, setQTimerRemaining] = useState(0);
    const [lockedChallenges, setLockedChallenges] = useState([]);
    const [timeSpentPerQ, setTimeSpentPerQ] = useState({});

    const [isRunning, setIsRunning] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    // Proctoring states
    const [tabSwitches, setTabSwitches] = useState(0);
    const [isLockedOut, setIsLockedOut] = useState(false);
    const [isFullscreenExited, setIsFullscreenExited] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [proctorWarning, setProctorWarning] = useState(null);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [customNotice, setCustomNotice] = useState(null); // { title, message, type, onConfirm }

    // Auto submission helper on tab switch violation
    const triggerAutoSubmit = async (finalCode, finalLang, challengeId, contestId) => {
        if (!user?.Email || !challengeId) return;
        try {
            // Save the code attempt for the active question
            await setDoc(doc(db, "users", user.uid, "codingAttempts", challengeId), {
                completed: false,
                language: finalLang,
                submittedCode: finalCode,
                timestamp: serverTimestamp(),
                autoSubmitted: true,
                tabViolation: true
            });

            // Log contest attempt status as completed (autosubmitted with tabViolation: true)
            if (contestId) {
                localStorage.setItem(`contest_completed_${contestId}`, "true");
                await setDoc(doc(db, "users", user.uid, "contestAttempts", contestId), {
                    status: "completed",
                    tabViolation: true,
                    timestamp: serverTimestamp(),
                    lastActiveChallenge: challengeId
                }, { merge: true });
            }
            console.log("Auto-submission successfully recorded.");
        } catch (err) {
            console.error("Failed to auto-submit code:", err);
        }
    };

    const handleManualSubmit = async () => {
        setShowSubmitConfirm(false);
        if (isEmbedded) {
            const activeCode = editorRef.current ? editorRef.current.getValue() : (codeRef.current || code);
            try {
                if (selectedChallenge) {
                    await desktopBridge.saveAnswer(selectedChallenge.id, activeCode).catch(() => {});
                }
            } catch (_) {}
            
            const allAnswers = {};
            challenges.forEach(ch => {
                const savedKey = `code_${ch.id}_${language}`;
                const savedCode = localStorage.getItem(savedKey);
                if (savedCode) {
                    allAnswers[ch.id] = savedCode;
                } else if (ch.id === selectedChallenge?.id) {
                    allAnswers[ch.id] = activeCode;
                }
            });

            if (onSectionSubmit) {
                onSectionSubmit({
                    answers: allAnswers,
                    timeSpentPerQ: timeSpentPerQ,
                    completed: completedChallenges
                });
            }
            return;
        }
        if (!user?.Email || !contestParam) return;
        try {
            // Save current code answer to localStorage
            if (selectedChallenge) {
                const savedKey = `code_${selectedChallenge.id}_${language}`;
                localStorage.setItem(savedKey, code);
            }

            // Set contest attempt status as completed locally
            localStorage.setItem(`contest_completed_${contestParam}`, "true");

            // Attempt online Firestore submission, ignoring failures if offline
            try {
                if (selectedChallenge) {
                    await setDoc(doc(db, "users", user.uid, "codingAttempts", selectedChallenge.id), {
                        completed: completedChallenges[selectedChallenge.id] || false,
                        language: language,
                        submittedCode: code,
                        timestamp: serverTimestamp()
                    }, { merge: true });
                }

                await setDoc(doc(db, "users", user.uid, "contestAttempts", contestParam), {
                    status: "completed",
                    timestamp: serverTimestamp(),
                    submittedManually: true
                }, { merge: true });
            } catch (fireErr) {
                console.log("Firestore submit skipped (offline fallback active):", fireErr.message);
            }

            // Exit fullscreen safely
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => console.log(err));
            }
            setCustomNotice({
                title: "Assessment Submitted",
                message: "Your assessment has been successfully submitted.",
                type: "success",
                onConfirm: () => navigate('/student/assessment')
            });
        } catch (err) {
            setCustomNotice({
                title: "Submission Failed",
                message: `Submission failed: ${err.message}`,
                type: "error"
            });
        }
    };

    // Proctoring: Tab switch detection
    useEffect(() => {
        if (!hasStarted || isLockedOut) return;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                setTabSwitches(prev => {
                    const newCount = prev + 1;
                    if (newCount >= 5) {
                        setIsLockedOut(true);
                        triggerAutoSubmit(code, language, selectedChallenge?.id, contestParam);
                    } else {
                        setProctorWarning(`Tab Switch: ${newCount}/5`);
                    }
                    return newCount;
                });
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [hasStarted, isLockedOut, code, language, selectedChallenge, contestParam, user]);

    // Proctoring: Fullscreen exit detection
    useEffect(() => {
        if (!hasStarted || isLockedOut || isRunningInPyQt()) return;

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setIsFullscreenExited(true);
            } else {
                setIsFullscreenExited(false);
            }
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, [hasStarted, isLockedOut]);

    const handleStartAssessment = () => {
        if (isRunningInPyQt()) {
            setHasStarted(true);
            setIsFullscreenExited(false);
            return;
        }
        document.documentElement.requestFullscreen().then(() => {
            setHasStarted(true);
            setIsFullscreenExited(false);
        }).catch(err => {
            setCustomNotice({
                title: "Fullscreen Required",
                message: "Failed to enter fullscreen. Please enable fullscreen permission in your browser to start the assessment.",
                type: "error"
            });
        });
    };

    const handleReenterFullscreen = () => {
        if (isRunningInPyQt()) {
            setIsFullscreenExited(false);
            return;
        }
        document.documentElement.requestFullscreen().then(() => {
            setIsFullscreenExited(false);
        }).catch(err => {
            setCustomNotice({
                title: "Fullscreen Required",
                message: "Failed to re-enter fullscreen. Please enable fullscreen to continue the assessment.",
                type: "error"
            });
        });
    };

    // Outputs
    const [stdout, setStdout] = useState('');
    const [stderr, setStderr] = useState('');
    const [exitCode, setExitCode] = useState(null);
    const [testResults, setTestResults] = useState([]);

    // 1. Initial authentication and loading attempts from local state / bridge
    useEffect(() => {
        if (isEmbedded) {
            const authData = JSON.parse(localStorage.getItem("auth_data") ?? "{}");
            setUser(authData);
            setHasStarted(true);
            setIsFullscreenExited(false);
            if (testData && testData.questions) {
                setChallenges(testData.questions);
                setSelectedChallenge(testData.questions[0] || null);
            }
            return;
        }

        const loadInitialData = async () => {
            try {
                const authData = JSON.parse(localStorage.getItem("auth_data") ?? "{}");
                if (authData.Email) {
                    setUser(authData);

                    // Load completed questions from local storage (assessment progress)
                    try {
                        const completedMap = {};
                        const keys = Object.keys(localStorage).filter(k => k.startsWith('q_completed_'));
                        keys.forEach(k => { completedMap[k.replace('q_completed_', '')] = true; });
                        setCompletedChallenges(completedMap);
                    } catch (attemptsErr) {
                        console.error("Failed to load completed attempts:", attemptsErr);
                    }

                    // Check if contest is already completed
                    if (contestParam) {
                        const isCompletedInLocal = localStorage.getItem(`contest_completed_${contestParam}`) === "true";
                        if (isCompletedInLocal) {
                            setCustomNotice({
                                title: "Access Denied",
                                message: "You have already completed/submitted this assessment. Access is denied.",
                                type: "error",
                                onConfirm: () => navigate('/student/assessment')
                            });
                            return;
                        }
                    }
                } else {
                    navigate('/login');
                    return;
                }
            } catch (err) {
                console.error("Failed to load user auth:", err);
            }

            // Load questions from access_control.json based on questionIds
            try {
                const { fetchQuestion: fetchQ, fetchQuestionsIndex } = await import('../services/codingQuestionBankService');
                const DataService = (await import('../services/dataService')).default;

                let questionIds = [];

                if (contestParam) {
                    // Find the contest in access_control to get its questionIds
                    try {
                        const accessControl = await DataService.getAccessControl();
                        const assessmentsData = accessControl?.courses?.assessments;
                        let found = false;
                        if (assessmentsData?.subcourses) {
                            for (const [, series] of Object.entries(assessmentsData.subcourses)) {
                                if (series.modules) {
                                    for (const [modKey, mod] of Object.entries(series.modules)) {
                                        const modId = mod.id || modKey;
                                        if (modId === contestParam) {
                                            questionIds = mod.questionIds || [];
                                            found = true;
                                            break;
                                        }
                                    }
                                }
                                if (found) break;
                            }
                        }
                    } catch (acErr) {
                        console.error("Failed to load access control:", acErr);
                    }
                } else if (challengeParam) {
                    // Single challenge mode - just that one question
                    questionIds = [challengeParam];
                } else {
                    // Free mode / no contest — load all questions from index
                    try {
                        const { fetchQuestionsIndex } = await import('../services/codingQuestionBankService');
                        const index = await fetchQuestionsIndex().catch(() => []);
                        questionIds = index.map(q => q.questionId || q.id).filter(Boolean);
                    } catch (e) {}
                }

                // Fetch each question
                let fetchedList = [];
                if (questionIds.length > 0) {
                    const results = await Promise.all(
                        questionIds.map(qid => fetchQ(qid).catch(e => {
                            console.warn(`Failed to load question ${qid}:`, e);
                            return null;
                        }))
                    );
                    fetchedList = results.filter(Boolean).map(q => ({
                        id: q.questionId || q.id,
                        title: q.title,
                        difficulty: q.metadata?.difficulty || q.difficulty || 'Medium',
                        description: q.content?.problemStatement || (q.description  ?? ''),
                        instructions: q.content?.inputFormat || (q.instructions  ?? ''),
                        constraints: Array.isArray(q.content?.constraints) ? q.content.constraints.join('\n') : (q.constraints ?? ''),
                        isPremium: q.metadata?.isPremium || false,
                        testCases: (q.content?.sampleTestCases || q.sampleTestCases || []).map(tc => ({
                            input: tc.input ?? '',
                            expected: tc.expected || tc.output || (tc.expectedOutput  ?? '')
                        })),
                        boilerplates: (() => {
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
                            const bp = {};

                            Object.entries(rawBoilerplates).forEach(([lang, val]) => {
                                const norm = getNormalizedLangKey(lang);
                                if (norm === 'python') {
                                    bp.python = val;
                                    bp.python3 = val;
                                } else {
                                    bp[norm] = val;
                                }
                            });

                            if (q.solution?.code) {
                                Object.entries(q.solution.code).forEach(([lang, val]) => {
                                    const norm = getNormalizedLangKey(lang);
                                    if (norm === 'python') {
                                        bp.python = val;
                                        bp.python3 = val;
                                    } else {
                                        bp[norm] = val;
                                    }
                                });
                            }
                            return bp;
                        })(),
                        _raw: q,
                    }));
                }

                fetchedList.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
                setChallenges(fetchedList);
            } catch (err) {
                console.error("Failed to load challenges:", err);
                setChallenges([...DEFAULT_CHALLENGES]);
            }
        };

        loadInitialData();
    }, [navigate, contestParam, challengeParam, isEmbedded, testData]);

    // 3. Keep selectedChallenge in sync with URL challenge parameter
    useEffect(() => {
        if (isEmbedded) return;
        if (challenges.length > 0 && challengeParam) {
            const found = challenges.find(ch => ch.id === challengeParam);
            if (found) {
                const isPremiumUser = Boolean(user?.isPremium);
                if (found.isPremium && (!user || !isPremiumUser)) {
                    if (user) {
                        setCustomNotice({
                            title: "Premium Feature",
                            message: "This is a Premium challenge. Please upgrade your subscription to access it.",
                            type: "warning",
                            onConfirm: () => navigate('/student/assessment')
                        });
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
    }, [challenges, challengeParam, user, navigate, isEmbedded]);

    // 4. Sync boilerplate code when selected challenge or language changes (recovers progress if available)
    useEffect(() => {
        const loadSavedAnswer = async () => {
            if (!selectedChallenge) return;
            const savedKey = `code_${selectedChallenge.id}_${language}`;
            const savedCode = localStorage.getItem(savedKey);
            let newCode;
            if (savedCode) {
                newCode = savedCode.replace(/\r\n/g, '\n');
            } else if (mode === 'free') {
                newCode = (FREE_BOILERPLATES[language] ?? '').replace(/\r\n/g, '\n');
            } else if (selectedChallenge?.boilerplates?.[language]) {
                newCode = selectedChallenge.boilerplates[language].replace(/\r\n/g, '\n');
            } else {
                newCode = (FREE_BOILERPLATES[language] ?? '').replace(/\r\n/g, '\n');
            }
            setCode(newCode);
            if (editorRef.current) editorRef.current.setValue(newCode);
        };
        loadSavedAnswer();

        // Clear panel outputs when switching problems
        setStdout('');
        setStderr('');
        setExitCode(null);
        setTestResults([]);
        setActiveTab('input');
    }, [selectedChallenge, language, mode]);

    // Section Global Timer Synchronizer
    useEffect(() => {
        if (isEmbedded) {
            if (secTimer <= 0) {
                handleManualSubmit();
            }
        }
    }, [secTimer, isEmbedded]);

    // Question Timer Auto-Reset on challenge change
    useEffect(() => {
        if (isEmbedded && settings.questionTimers && settings.questionTimers.length > 0 && selectedChallenge) {
            const activeTimer = settings.questionTimers[currentChallengeIndex] || 0;
            setQTimerRemaining(activeTimer);
        }
    }, [selectedChallenge, currentChallengeIndex, isEmbedded, settings.questionTimers]);

    // Question Timer Countdown Loop
    useEffect(() => {
        if (isEmbedded && settings.questionTimers && settings.questionTimers.length > 0 && selectedChallenge && !isLockedOut) {
            const activeTimer = settings.questionTimers[currentChallengeIndex] || 0;
            if (activeTimer > 0) {
                const timer = setInterval(() => {
                    setQTimerRemaining(prev => {
                        if (prev <= 1) {
                            // Lock the current question!
                            setLockedChallenges(l => [...l, selectedChallenge.id]);
                            // Move to next challenge or submit if last
                            if (currentChallengeIndex + 1 < challenges.length) {
                                setSelectedChallenge(challenges[currentChallengeIndex + 1]);
                            } else {
                                handleManualSubmit();
                            }
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
                return () => clearInterval(timer);
            }
        }
    }, [isEmbedded, selectedChallenge, currentChallengeIndex, challenges, isLockedOut, settings.questionTimers]);

    // Track active question elapsed seconds
    useEffect(() => {
        let qTimer;
        if (selectedChallenge && !isLockedOut) {
            qTimer = setInterval(() => {
                setTimeSpentPerQ(prev => ({
                    ...prev,
                    [selectedChallenge.id]: (prev[selectedChallenge.id] || 0) + 1
                }));
            }, 1000);
        }
        return () => {
            if (qTimer) clearInterval(qTimer);
        };
    }, [selectedChallenge, isLockedOut]);

    // 5. Autosave code to localStorage every 30 seconds (reads live editor value)
    useEffect(() => {
        if (!selectedChallenge) return;
        const interval = setInterval(() => {
            const savedKey = `code_${selectedChallenge.id}_${language}`;
            const liveCode = editorRef.current ? editorRef.current.getValue() : code;
            if (liveCode) localStorage.setItem(savedKey, liveCode);
        }, 30000);
        return () => clearInterval(interval);
    }, [selectedChallenge, language]);

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

    // Compile and run code against public sample test cases
    const handleRunCode = async () => {
        if (!selectedChallenge && mode !== 'free') return;
        setIsRunning(true);
        setActiveTab('results'); // Focus results/sample test cases tab
        setTestResults([]);
        setStdout('Running tests against sample cases...');
        setStderr('');
        setExitCode(null);

        // Save code to localStorage
        if (selectedChallenge) {
            localStorage.setItem(`code_${selectedChallenge.id}_${language}`, code);
        }

        if (!isRunningInPyQt()) {
            // Not in desktop app — show a helpful message
            setIsRunning(false);
            setActiveTab('output');
            setStdout('');
            setStderr(' Code execution requires the SEED-IT Desktop App (PyQt environment). Your code is saved and can be submitted from within the desktop app.');
            setExitCode(1);
            return;
        }

        try {
            let results = [];
            const currentCode = editorRef.current ? editorRef.current.getValue() : code;
            // Yield before execution so UI/camera frame can paint
            await yieldFrame();
            if (mode === 'free') {
                const res = await desktopBridge.runDirectSandbox(language, currentCode, customInput);
                setActiveTab('output');
                setStdout(res.stdout || (res.exit_code === 0 && !res.stderr ? "Code execution completed successfully with no output." : ""));
                setStderr(res.stderr || (res.error  ?? ""));
                setExitCode(res.exit_code === undefined ? null : res.exit_code);
                return;
            } else {
                const stdinPayload = JSON.stringify({ questionId: selectedChallenge.id, stdin: customInput });
                results = await desktopBridge.runCode(language, currentCode, stdinPayload);
            }

            setTestResults(results.map(r => ({
                index: r.caseNumber,
                input: r.input,
                expected: r.expected,
                actual: r.actual,
                passed: r.passed,
                stderr: r.stderr || (r.error  ?? "")
            })));
        } catch (err) {
            setStderr(`Execution Failed: ${err.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    // Submit against hidden test cases
    const handleTestCode = async () => {
        if (!selectedChallenge || mode === 'free') return;
        setIsTesting(true);
        setActiveTab('results');
        setTestResults([]);

        // Save answer to localStorage before submission
        const currentCode = editorRef.current ? editorRef.current.getValue() : (codeRef.current || code);
        const savedKey = `code_${selectedChallenge.id}_${language}`;
        localStorage.setItem(savedKey, currentCode);

        if (!isRunningInPyQt()) {
            setIsTesting(false);
            setCustomNotice({
                title: "Evaluation Engine Required",
                message: "Code submission and test evaluation service is currently unavailable. Your code has been saved. Please retry when connection is established.",
                type: "warning"
            });
            return;
        }

        try {
            // Yield before heavy bridge call
            await yieldFrame();
            await desktopBridge.saveAnswer(selectedChallenge.id, code);
            const result = await desktopBridge.submitCode(language, code, selectedChallenge.id);
            
            if (result.error) {
                setStderr(result.error);
                setCustomNotice({
                    title: "Submission Error",
                    message: result.error,
                    type: "error"
                });
                return;
            }

            // Display results using generic case titles to hide inputs/expected outputs
            setTestResults(result.testCases.map(tc => ({
                index: tc.caseNumber,
                input: "Hidden Test Case",
                expected: "Hidden Expected Output",
                actual: tc.passed ? "Match" : "Mismatch/Error",
                passed: tc.passed,
                stderr: tc.error ?? ""
            })));

            // Update local React progress mappings
            if (result.score === 100) {
                localStorage.setItem(`q_completed_${selectedChallenge.id}`, 'true');
                setCompletedChallenges(prev => ({
                    ...prev,
                    [selectedChallenge.id]: true
                }));
            }

            setCustomNotice({
                title: "Evaluation Score",
                message: `Assessment score: ${result.score}% (${result.passed}/${result.total} test cases passed). Answers submitted successfully.`,
                type: result.score === 100 ? "success" : "warning"
            });
        } catch (err) {
            setCustomNotice({
                title: "Evaluation Failed",
                message: `Execution failed: ${err.message}`,
                type: "error"
            });
        } finally {
            setIsTesting(false);
        }
    };

    // Previous and Next buttons toggling

    const handlePrevChallenge = () => {
        if (isEmbedded && (settings.forwardOnly || (settings.questionTimers && settings.questionTimers.length > 0))) {
            return; // Lock backward navigation
        }
        if (isEmbedded) {
            if (currentChallengeIndex > 0) {
                setSelectedChallenge(challenges[currentChallengeIndex - 1]);
            }
            return;
        }
        if (currentChallengeIndex > 0) {
            const prev = challenges[currentChallengeIndex - 1];
            navigate(`/student/assessment/sandbox?challenge=${prev.id}${contestParam ? `&contest=${contestParam}` : ''}`);
        }
    };

    const handleNextChallenge = () => {
        if (isEmbedded) {
            if (currentChallengeIndex < challenges.length - 1 && currentChallengeIndex !== -1) {
                setSelectedChallenge(challenges[currentChallengeIndex + 1]);
            }
            return;
        }
        if (currentChallengeIndex < challenges.length - 1 && currentChallengeIndex !== -1) {
            const next = challenges[currentChallengeIndex + 1];
            navigate(`/student/assessment/sandbox?challenge=${next.id}${contestParam ? `&contest=${contestParam}` : ''}`);
        }
    };

    const monacoLanguage = language === 'cpp' ? 'cpp' : (language === 'c' ? 'c' : (language === 'java' ? 'java' : (language === 'javascript' ? 'javascript' : 'python')));
    const userInitials = user?.Name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

    return (
        <div 
            className="sandbox-fullscreen-container"
            onCopy={e => { 
                e.preventDefault(); 
                setCustomNotice({
                    title: "Action Blocked",
                    message: "Copying is disabled during the assessment to maintain integrity.",
                    type: "error"
                });
            }}
            onPaste={e => { 
                e.preventDefault(); 
                setCustomNotice({
                    title: "Action Blocked",
                    message: "Pasting is disabled during the assessment to maintain integrity.",
                    type: "error"
                });
            }}
            onCut={e => { 
                e.preventDefault(); 
                setCustomNotice({
                    title: "Action Blocked",
                    message: "Cutting is disabled during the assessment to maintain integrity.",
                    type: "error"
                });
            }}
        >
            {!hasStarted && (
                <div className="proctor-start-overlay">
                    <div className="proctor-start-card">
                        <h2>Start Coding Assessment</h2>
                        <p>This assessment is proctored. The following rules apply:</p>
                        <ul style={{ textAlign: 'left', marginBottom: '20px', lineHeight: '1.6' }}>
                            <li>The browser will be forced into full-screen mode.</li>
                            <li>Copying, pasting, and cutting are disabled.</li>
                            <li>Switching tabs or minimizing the browser is strictly monitored.</li>
                            <li><strong>If you switch tabs 3 times, the test will submit and lock automatically.</strong></li>
                        </ul>
                        <button className="action-btn run-btn" style={{ padding: '12px 24px', fontSize: '1.1rem' }} onClick={handleStartAssessment}>
                            Acknowledge and Start
                        </button>
                    </div>
                </div>
            )}
            {isLockedOut && (
                <div className="proctor-lockout-overlay">
                    <div className="proctor-lockout-card">
                        <FaLock className="lockout-icon" style={{ fontSize: '3rem', color: '#ff4d4f', marginBottom: '15px' }} />
                        <h2 style={{ color: '#ff4d4f' }}>Assessment Locked</h2>
                        <p style={{ margin: '15px 0' }}>You have exceeded the maximum allowed tab switches (5). Your assessment has been automatically submitted and locked.</p>
                        <button className="action-btn" style={{ background: '#333', color: '#fff', padding: '10px 20px' }} onClick={() => navigate('/student/assessment')}>
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            )}
            {isFullscreenExited && hasStarted && !isLockedOut && (
                <div className="proctor-start-overlay" style={{ zIndex: 10000 }}>
                    <div className="proctor-start-card" style={{ border: '2.5px solid #ff4d4f', boxShadow: '0 0 20px rgba(255, 77, 79, 0.4)' }}>
                        <FaLock className="lockout-icon" style={{ fontSize: '3.5rem', color: '#ff4d4f', marginBottom: '15px', animation: 'pulseLock 1.5s infinite ease-in-out' }} />
                        <h2 style={{ color: '#ff4d4f' }}>Fullscreen Mode Required</h2>
                        <p style={{ marginBottom: '25px', color: '#d1d5db', lineHeight: '1.6' }}>
                            You exited fullscreen mode. To prevent assessment invalidation and continue coding, you must re-enter fullscreen mode.
                        </p>
                        <button className="action-btn run-btn" style={{ padding: '12px 24px', fontSize: '1.1rem' }} onClick={handleReenterFullscreen}>
                            Re-enter Fullscreen
                        </button>
                    </div>
                </div>
            )}
            {proctorWarning && (
                <div className="proctor-start-overlay" style={{ zIndex: 10006 }}>
                    <div className="proctor-start-card" style={{ border: '1.5px solid #f59e0b', boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)' }}>
                        <h2 style={{ color: '#f59e0b' }}>Proctoring Warning</h2>
                        <p style={{ margin: '15px 0', color: '#d1d5db', lineHeight: '1.6' }}>
                            {proctorWarning}
                        </p>
                        <button 
                            className="action-btn" 
                            style={{ background: '#f59e0b', color: '#fff', padding: '10px 25px', marginTop: '15px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            onClick={() => {
                                setProctorWarning(null);
                                if (!isRunningInPyQt() && !document.fullscreenElement) {
                                    document.documentElement.requestFullscreen().catch(e => console.log(e));
                                }
                            }}
                        >
                            I Acknowledge
                        </button>
                    </div>
                </div>
            )}
            {showSubmitConfirm && (
                <div className="proctor-start-overlay" style={{ zIndex: 10005 }}>
                    <div className="proctor-start-card" style={{ border: '1.5px solid #ef4444', boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)' }}>
                        <h2>Submit Assessment?</h2>
                        <p style={{ color: '#d1d5db', lineHeight: '1.6', margin: '15px 0' }}>
                            Are you sure you want to finish and submit your assessment? 
                            Once submitted, you will not be able to re-enter or edit your solutions.
                        </p>
                        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '25px' }}>
                            <button 
                                className="action-btn" 
                                style={{ background: '#333', color: '#ccc', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={() => setShowSubmitConfirm(false)}
                            >
                                Cancel
                            </button>
                            <button 
                                className="action-btn run-btn" 
                                style={{ background: '#ef4444', color: '#fff', padding: '10px 25px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={handleManualSubmit}
                            >
                                Confirm & Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* SEED-IT Header Nav */}
            <header className="sandbox-workspace-header">
                <div className="header-left">
                    <button 
                        onClick={() => {
                            if (isEmbedded) {
                                if (window.confirm("Exit assessment? Your current section progress is saved.")) {
                                    navigate('/student/dashboard');
                                }
                            } else {
                                navigate(mode === 'free' ? '/student/dashboard' : '/student/assessment');
                            }
                        }} 
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
                                    disabled={currentChallengeIndex <= 0 || (isEmbedded && settings.questionTimers && settings.questionTimers.length > 0)}
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

                    {isEmbedded && (
                        <div className="msa-timer-box" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            marginLeft: '15px',
                            color: '#10b981'
                        }}>
                            <FaClock />
                            <span>Time Remaining: {Math.floor(secTimer / 60)}:{(secTimer % 60).toString().padStart(2, '0')}</span>
                        </div>
                    )}

                    {contestParam && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: tabSwitches > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                            color: tabSwitches > 0 ? '#ef4444' : '#10b981',
                            border: tabSwitches > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            marginLeft: '15px'
                        }}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: tabSwitches > 0 ? '#ef4444' : '#10b981', marginRight: '4px', animation: 'pulseLock 1.5s infinite' }}></span>
                            PROCTOR ACTIVE | TAB SWITCHES: {tabSwitches} / 5
                        </div>
                    )}
                </div>

                <div className="header-center-actions">
                    <button 
                        className="header-run-btn" 
                        onClick={handleRunCode} 
                        disabled={isRunning || isTesting || (isEmbedded && selectedChallenge && lockedChallenges.includes(selectedChallenge.id))}
                    >
                        <FaPlay /> Run
                    </button>
                    {mode !== 'free' && (
                        <button 
                            className="header-submit-btn" 
                            onClick={handleTestCode} 
                            disabled={isRunning || isTesting || (isEmbedded && selectedChallenge && lockedChallenges.includes(selectedChallenge.id))}
                        >
                            <FaCheck /> Submit
                        </button>
                    )}
                    {contestParam && (
                        <button 
                            className="header-submit-btn" 
                            style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff', marginLeft: '12px', border: 'none' }}
                            onClick={() => setShowSubmitConfirm(true)}
                            disabled={isRunning || isTesting}
                        >
                            Submit Assessment
                        </button>
                    )}
                    {isEmbedded && !settings.timerRestrictedSubmit && (
                        <button 
                            className="header-submit-btn" 
                            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', marginLeft: '12px', border: 'none' }}
                            onClick={() => {
                                if (window.confirm("Are you sure you want to submit this section? You will not be able to return to it.")) {
                                    handleManualSubmit();
                                }
                            }}
                            disabled={isRunning || isTesting}
                        >
                            Submit Section
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
                                const isPremiumUser = Boolean(user?.isPremium);
                                const isLocked = ch.isPremium && !isPremiumUser;
                                return (
                                    <button
                                        key={ch.id}
                                        className={`drawer-challenge-item ${selectedChallenge?.id === ch.id ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                                        onClick={() => {
                                            if (isEmbedded) {
                                                if (settings.forwardOnly || (settings.questionTimers && settings.questionTimers.length > 0)) {
                                                    return; // Lock jumping around
                                                }
                                                setIsDrawerOpen(false);
                                                setSelectedChallenge(ch);
                                                return;
                                            }
                                            if (isLocked) {
                                                setCustomNotice({
                                                    title: "Premium Feature",
                                                    message: "This is a Premium challenge. Please upgrade your subscription to access it.",
                                                    type: "warning"
                                                });
                                                return;
                                            }
                                            setIsDrawerOpen(false);
                                            navigate(`/student/assessment/sandbox?challenge=${ch.id}${contestParam ? `&contest=${contestParam}` : ''}`);
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
                                            {isEmbedded && settings.questionTimers && settings.questionTimers.length > 0 && (
                                                <span className="constraint-badge" style={{ 
                                                    background: qTimerRemaining <= 60 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                                                    color: qTimerRemaining <= 60 ? '#ef4444' : '#6366f1',
                                                    border: qTimerRemaining <= 60 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)',
                                                    fontWeight: 'bold'
                                                }}>
                                                     Locks in: {Math.floor(qTimerRemaining / 60)}:{(qTimerRemaining % 60).toString().padStart(2, '0')}
                                                </span>
                                            )}
                                        </div>
                                        {isEmbedded && lockedChallenges.includes(selectedChallenge.id) && (
                                            <div style={{
                                                background: 'rgba(239, 68, 68, 0.12)',
                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                borderRadius: '8px',
                                                padding: '12px 16px',
                                                color: '#ef4444',
                                                marginBottom: '15px',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}>
                                                <FaLock />
                                                <span>This question's timer has expired. Your sandbox is locked. You can no longer edit or compile code for this question.</span>
                                            </div>
                                        )}
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
                                    readOnly: isEmbedded && selectedChallenge && lockedChallenges.includes(selectedChallenge.id),
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
                                        disabled={isRunning || isTesting || (isEmbedded && selectedChallenge && lockedChallenges.includes(selectedChallenge.id))}
                                    >
                                        <FaPlay /> {isRunning ? "Running..." : "Run"}
                                    </button>
                                    {mode !== 'free' && (
                                        <button
                                            className="action-btn test-btn"
                                            onClick={handleTestCode}
                                            disabled={isRunning || isTesting || (isEmbedded && selectedChallenge && lockedChallenges.includes(selectedChallenge.id))}
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
            
            {customNotice && (
                <div className="proctor-start-overlay" style={{ zIndex: 10010 }}>
                    <div className="proctor-start-card" style={{ 
                        border: customNotice.type === 'error' ? '1.5px solid #ef4444' : 
                                customNotice.type === 'success' ? '1.5px solid #10b981' : 
                                customNotice.type === 'warning' ? '1.5px solid #f59e0b' : '1.5px solid #3b82f6',
                        boxShadow: customNotice.type === 'error' ? '0 0 15px rgba(239, 68, 68, 0.3)' : 
                                   customNotice.type === 'success' ? '0 0 15px rgba(16, 185, 129, 0.3)' : 
                                   customNotice.type === 'warning' ? '0 0 15px rgba(245, 158, 11, 0.3)' : '0 0 15px rgba(59, 130, 246, 0.3)'
                    }}>
                        <h2 style={{ 
                            color: customNotice.type === 'error' ? '#ef4444' : 
                                   customNotice.type === 'success' ? '#10b981' : 
                                   customNotice.type === 'warning' ? '#f59e0b' : '#3b82f6' 
                        }}>{customNotice.title}</h2>
                        <p style={{ margin: '15px 0', color: '#d1d5db', lineHeight: '1.6' }}>
                            {customNotice.message}
                        </p>
                        <button 
                            className="action-btn" 
                            style={{ 
                                background: customNotice.type === 'error' ? '#ef4444' : 
                                            customNotice.type === 'success' ? '#10b981' : 
                                            customNotice.type === 'warning' ? '#f59e0b' : '#3b82f6', 
                                color: '#fff', 
                                padding: '10px 25px', 
                                marginTop: '15px', 
                                border: 'none', 
                                borderRadius: '4px', 
                                cursor: 'pointer' 
                            }}
                            onClick={() => {
                                const onConfirm = customNotice.onConfirm;
                                setCustomNotice(null);
                                if (onConfirm) onConfirm();
                            }}
                        >
                            Understood
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CodingAssessmentSandbox;
