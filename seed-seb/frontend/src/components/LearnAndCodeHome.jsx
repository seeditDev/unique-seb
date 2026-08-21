import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from './router-compat';
import { FaCheck, FaPlay, FaSignOutAlt, FaUser, FaArrowLeft, FaSearch, FaBookOpen, FaLock, FaKey, FaTimes, FaTrophy, FaStar, FaBolt } from 'react-icons/fa';
import { db } from '../lib/firebase-config';
import { collection, doc, setDoc, getDocs, getDoc } from 'firebase/firestore';
import '../styles/LearnAndCodeHome.css';

// Duplicate local challenges list in case DB seeding is required
const DEFAULT_CHALLENGES = [
    {
        id: 'hello_world',
        title: '1. Hello, World!',
        difficulty: 'Easy',
        description: 'Write a program that outputs exactly "Hello, World!" to the console.',
        instructions: 'Your code should print "Hello, World!" followed by a new line.',
        constraints: 'Time Limit: 2.0s',
        testCases: [{ input: '', expected: 'Hello, World!\n' }],
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
            { input: '-3 8', expected: '5\n' }
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
            { input: '7', expected: 'Odd\n' }
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
        description: 'Write a program that calculates the factorial of a given non-negative integer N.',
        instructions: 'Input consists of an integer N. Output the factorial value.',
        constraints: '0 <= N <= 12\nTime Limit: 2.0s',
        testCases: [
            { input: '5', expected: '120\n' },
            { input: '0', expected: '1\n' }
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

const LearnAndCodeHome = () => {
    const [challenges, setChallenges] = useState([]);
    const [completedAttempts, setCompletedAttempts] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [difficultyFilter, setDifficultyFilter] = useState('All');
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        const loadDashboardData = async () => {
            setIsLoading(true);
            let activeUser = null;

            // 1. Authenticate user from localStorage
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

                    // Fetch user's completion records
                    const attemptsCol = collection(db, "users", authData.Email, "codingAttempts");
                    const attemptsSnap = await getDocs(attemptsCol);
                    const completedMap = {};
                    attemptsSnap.forEach(doc => {
                        if (doc.data().completed) {
                            completedMap[doc.id] = true;
                        }
                    });
                    setCompletedAttempts(completedMap);
                } else {
                    // Redirect to login if auth is missing
                    navigate('/login');
                    return;
                }
            } catch (err) {
                console.error("Failed to load student auth details:", err);
            }

            // 2. Fetch challenges list
            try {
                const challengesCol = collection(db, "codingChallenges");
                const challengesSnap = await getDocs(challengesCol);

                if (challengesSnap.empty) {
                    // Seed defaults if empty
                    console.log("[LearnAndCode] Seeding default challenges...");
                    for (const ch of DEFAULT_CHALLENGES) {
                        await setDoc(doc(db, "codingChallenges", ch.id), ch);
                    }
                    setChallenges(DEFAULT_CHALLENGES);
                } else {
                    const fetched = [];
                    challengesSnap.forEach(doc => {
                        fetched.push({ id: doc.id, ...doc.data() });
                    });
                    fetched.sort((a, b) => a.title.localeCompare(b.title));
                    setChallenges(fetched);
                }
            } catch (err) {
                console.error("Failed to fetch challenges, loading local backup:", err);
                setChallenges(DEFAULT_CHALLENGES);
            } finally {
                setIsLoading(false);
            }
        };

        loadDashboardData();
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem("auth_data");
        localStorage.removeItem("role");
        // Clear cookies manually if any
        document.cookie = "user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "user_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        navigate("/login");
    };

    // Filter challenges based on search queries and difficulty dropdown
    const filteredChallenges = challenges.filter(ch => {
        const matchesSearch = ch.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              ch.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDiff = difficultyFilter === 'All' || ch.difficulty === difficultyFilter;
        return matchesSearch && matchesDiff;
    });

    const solvedCount = Object.keys(completedAttempts).length;
    const totalCount = challenges.length;
    const completionRate = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;

    return (
        <div className="learn-home-wrapper">
            {/* Header section matching premium dashboard */}
            <header className="learn-home-header">
                <div className="header-left">
                    <img 
                        src="https://raw.githubusercontent.com/seeditDev/SEED-Website/f3cee9002410a00df4da7bea636ac9fbc4c312ca/Plugins/SEED_Logo.webp" 
                        alt="SEED Logo" 
                        className="learn-logo" 
                    />
                    <span className="learn-brand">SEED-IT Learn & Code</span>
                    <Link to="/student/dashboard" className="back-dash-btn">
                        <FaArrowLeft /> Back to Dashboard
                    </Link>
                </div>
                <div className="header-right">
                    <div className="user-profile-circle">
                        {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : <FaUser />}
                    </div>
                    <button className="learn-logout-btn" onClick={handleLogout} aria-label="Logout">
                        <FaSignOutAlt />
                    </button>
                </div>
            </header>

            {isLoading ? (
                <div className="learn-loading">
                    <div className="learn-spinner"></div>
                    <p>Loading challenges library...</p>
                </div>
            ) : (
                <main className="learn-home-content">
                    <div className="learn-content-grid">
                        {/* Problems Table Panel */}
                        <div className="problems-panel">
                            <div className="panel-filters-row">
                                <div className="search-box-wrapper">
                                    <FaSearch className="search-icon" />
                                    <input 
                                        type="text" 
                                        placeholder="Search questions..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                    />
                                </div>
                                <div className="filter-dropdown-wrapper">
                                    <select 
                                        value={difficultyFilter} 
                                        onChange={(e) => setDifficultyFilter(e.target.value)}
                                        className="diff-filter-select"
                                    >
                                        <option value="All">All Difficulties</option>
                                        <option value="Easy">Easy</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Hard">Hard</option>
                                    </select>
                                </div>
                            </div>

                            <div className="table-responsive">
                                <table className="problems-table">
                                    <thead>
                                        <tr>
                                            <th className="col-status">Status</th>
                                            <th className="col-title">Title</th>
                                            <th className="col-diff">Difficulty</th>
                                            <th className="col-action">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredChallenges.length > 0 ? (
                                            filteredChallenges.map((ch) => {
                                                const isPremiumUser = Boolean(user?.isPremium);
                                                const isLocked = ch.isPremium && !isPremiumUser;
                                                return (
                                                    <tr 
                                                        key={ch.id} 
                                                        className="problem-row" 
                                                        onClick={isLocked ? () => setShowUpgradeModal(true) : () => navigate(`/student/sandbox?challenge=${ch.id}`)}
                                                    >
                                                        <td className="col-status">
                                                            {completedAttempts[ch.id] ? (
                                                                <div className="status-circle solved">
                                                                    <FaCheck />
                                                                </div>
                                                            ) : (
                                                                <div className="status-circle unsolved"></div>
                                                            )}
                                                        </td>
                                                        <td className="col-title">
                                                            <span className="problem-title-text">
                                                                {ch.title}
                                                                {isLocked && <FaLock className="locked-challenge-icon" style={{ marginLeft: '8px', color: '#ffb300' }} />}
                                                            </span>
                                                        </td>
                                                        <td className="col-diff">
                                                            <span className={`diff-badge ${ch.difficulty?.toLowerCase() || ''}`}>
                                                                {ch.difficulty}
                                                            </span>
                                                        </td>
                                                        <td className="col-action" onClick={(e) => e.stopPropagation()}>
                                                            {isLocked ? (
                                                                <button 
                                                                    className="solve-btn locked"
                                                                    onClick={() => setShowUpgradeModal(true)}
                                                                >
                                                                    <FaLock /> Unlock
                                                                </button>
                                                            ) : (
                                                                <button 
                                                                    className="solve-btn"
                                                                    onClick={() => navigate(`/student/sandbox?challenge=${ch.id}`)}
                                                                >
                                                                    <FaPlay /> {completedAttempts[ch.id] ? "Review" : "Solve"}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan="4" className="no-records-row">
                                                    No challenges matches the active filter or search string.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Progress Sidebar Panel */}
                        <div className="progress-panel">
                            {(Boolean(user?.isPremium)) ? (
                                <div className="premium-status-banner premium">
                                    <FaKey className="status-banner-icon" />
                                    <span>SEED-IT Premium Active</span>
                                </div>
                            ) : (
                                <div className="premium-status-banner free">
                                    <FaLock className="status-banner-icon" />
                                    <span>Standard Free Account</span>
                                </div>
                            )}
                            <div className="stats-card">
                                <h3>Session Progress</h3>
                                <div className="progress-radial-bar">
                                    <div className="progress-inner-value">
                                        <span className="solved-num">{solvedCount}</span>
                                        <span className="divider">/</span>
                                        <span className="total-num">{totalCount}</span>
                                    </div>
                                    <div className="progress-bar-line">
                                        <div className="progress-fill" style={{ width: `${completionRate}%` }}></div>
                                    </div>
                                    <span className="pct-txt">{completionRate}% Completed</span>
                                </div>
                                <div className="stats-breakdown">
                                    <div className="breakdown-row">
                                        <span>Total Solved:</span>
                                        <strong>{solvedCount}</strong>
                                    </div>
                                    <div className="breakdown-row">
                                        <span>Total Available:</span>
                                        <strong>{totalCount}</strong>
                                    </div>
                                </div>
                            </div>

                            <div className="guidance-card">
                                <h3><FaBookOpen style={{ marginRight: '8px', color: '#fbbf24' }} /> Practice Tip</h3>
                                <p>To maximize learning, try writing your solutions in multiple languages. Our sandbox currently supports C, C++, Python, and Java compiles.</p>
                            </div>
                        </div>
                    </div>
                </main>
            )}
            {showUpgradeModal && (
                <div className="premium-modal-overlay" onClick={() => setShowUpgradeModal(false)}>
                    <div className="premium-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="premium-modal-header">
                            <h3>
                                <FaLock className="premium-lock-icon" />
                                Premium Challenge
                            </h3>
                            <button className="premium-close-btn" onClick={() => setShowUpgradeModal(false)}>
                                <FaTimes />
                            </button>
                        </div>
                        <div className="premium-modal-body">
                            <p>This practice challenge is locked for Premium accounts. To upgrade, please reach out to your Placement Department or contact your SEED-IT Training Manager.</p>
                            <div className="premium-benefits">
                                <div className="benefit-item"><FaTrophy style={{ marginRight: '8px', color: '#fbbf24' }} /> Full access to all coding challenges</div>
                                <div className="benefit-item"><FaBolt style={{ marginRight: '8px', color: '#fbbf24' }} /> Unlimited code compilations & submissions</div>
                                <div className="benefit-item"><FaBookOpen style={{ marginRight: '8px', color: '#fbbf24' }} /> Detailed solution editorials & optimal templates</div>
                            </div>
                        </div>
                        <div className="premium-modal-footer">
                            <button className="premium-modal-ok-btn" onClick={() => setShowUpgradeModal(false)} style={{ width: '100%' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LearnAndCodeHome;
