import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from './router-compat';
import { FaTrash, FaEdit, FaPlus, FaCheck, FaTimes, FaUser, FaArrowLeft, FaDatabase, FaLock, FaKey } from 'react-icons/fa';
import { db } from '../lib/firebase-config';
import { collection, doc, setDoc, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import '../styles/AdminQuestionBank.css';

const DEFAULT_CHALLENGES = [
    {
        id: 'hello_world',
        title: '1. Hello, World!',
        difficulty: 'Easy',
        description: 'Write a program that outputs exactly "Hello, World!" to the console.',
        instructions: 'Your code should print "Hello, World!" followed by a new line.',
        constraints: 'Time Limit: 2.0s',
        testCases: [{ input: '', expected: 'Hello, World!\n' }],
        boilerPlates: {
            c: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}`,
            cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`,
            python: `print("Hello, World!")`,
            java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`
        },
        isPremium: false
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
        boilerPlates: {
            c: `#include <stdio.h>\n\nint main() {\n    int a, b;\n    if (scanf("%d %d", &a, &b) == 2) {\n        printf("%d\\n", a + b);\n    }\n    return 0;\n}`,
            cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    if (cin >> a >> b) {\n        cout << a + b << endl;\n    }\n    return 0;\n}`,
            python: `import sys\n\ntry:\n    inputs = sys.stdin.read().split()\n    if len(inputs) >= 2:\n        a, b = int(inputs[0]), int(inputs[1])\n        print(a + b)\nexcept Exception as e:\n    pass`,
            java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        if (scanner.hasNextInt()) {\n            int a = scanner.nextInt();\n            int b = scanner.nextInt();\n            System.out.println(a + b);\n        }\n    }\n}`
        },
        isPremium: false
    }
];

const AdminQuestionBank = () => {
    const [challenges, setChallenges] = useState([]);
    const [contests, setContests] = useState([]);
    const [activeTab, setActiveTab] = useState('questions'); // 'questions', 'users', 'contests'
    const [isLoading, setIsLoading] = useState(true);
    
    // User Manager states
    const [userEmail, setUserEmail] = useState('');
    const [userPremiumStatus, setUserPremiumStatus] = useState(null);
    const [userMessage, setUserMessage] = useState('');

    // Question form modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null); // Null if creating
    
    const [formId, setFormId] = useState('');
    const [formTitle, setFormTitle] = useState('');
    const [formDiff, setFormDiff] = useState('Easy');
    const [formDesc, setFormDesc] = useState('');
    const [formInst, setFormInst] = useState('');
    const [formCons, setFormCons] = useState('Time Limit: 2.0s');
    const [formIsPremium, setFormIsPremium] = useState(false);
    const [formTestcases, setFormTestcases] = useState([{ input: '', expected: '' }]);
    const [formBoilerplates, setFormBoilerplates] = useState({
        c: '', cpp: '', python: '', java: ''
    });

    // Contest form modal states
    const [isContestModalOpen, setIsContestModalOpen] = useState(false);
    const [editingContestId, setEditingContestId] = useState(null);
    const [contestForm, setContestForm] = useState({
        id: '', title: '', description: '', startTime: '', endTime: '', duration: '', questions: []
    });

    const navigate = useNavigate();

    // Fetch question bank challenges
    const fetchChallenges = async () => {
        setIsLoading(true);
        try {
            const challengesCol = collection(db, "codingChallenges");
            const snap = await getDocs(challengesCol);
            const list = [];
            snap.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            list.sort((a, b) => a.title.localeCompare(b.title));
            setChallenges(list);
        } catch (err) {
            console.error("Failed to load questions in admin dashboard:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchContests = async () => {
        setIsLoading(true);
        try {
            const snap = await getDocs(collection(db, "contests"));
            const list = [];
            snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            setContests(list);
        } catch (err) {
            console.error("Failed to load contests:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchChallenges();
        fetchContests();
    }, []);

    // Seeding tool
    const handleReSeed = async () => {
        if (window.confirm("Are you sure you want to seed default challenges into Firestore? This will overwrite duplicates.")) {
            try {
                setIsLoading(true);
                for (const ch of DEFAULT_CHALLENGES) {
                    await setDoc(doc(db, "codingChallenges", ch.id), ch, { merge: true });
                }
                toast.success("Default challenges seeded successfully.");
                fetchChallenges();
            } catch (err) {
                toast.error(`Seeding failed: ${err.message}`);
            }
        }
    };

    // Delete question
    const handleDeleteQuestion = async (id) => {
        if (window.confirm("Are you sure you want to delete this challenge permanently?")) {
            try {
                await deleteDoc(doc(db, "codingChallenges", id));
                toast.success("Challenge deleted successfully.");
                fetchChallenges();
            } catch (err) {
                toast.error(`Delete failed: ${err.message}`);
            }
        }
    };

    // Open contest modal
    const openContestModal = (contest = null) => {
        if (contest) {
            setEditingContestId(contest.id);
            setContestForm({
                id: contest.id,
                title: contest.title ?? '',
                description: contest.description ?? '',
                startTime: contest.startTime ?? '',
                endTime: contest.endTime ?? '',
                duration: contest.duration ?? '',
                questions: contest.questions || []
            });
        } else {
            setEditingContestId(null);
            setContestForm({ id: '', title: '', description: '', startTime: '', endTime: '', duration: '', questions: [] });
        }
        setIsContestModalOpen(true);
    };

    const handleSaveContest = async (e) => {
        e.preventDefault();
        const contestId = contestForm.id.trim();
        if (!contestId || !contestForm.title.trim()) {
            toast.warning("ID and Title are required.");
            return;
        }
        try {
            // 1. Save Contest details
            await setDoc(doc(db, "contests", contestId), {
                ...contestForm,
                id: contestId
            });

            // 2. Automatically generate and provision 256-bit AES-GCM encryption key
            const randomBytes = new Uint8Array(32);
            if (window.crypto && window.crypto.getRandomValues) {
                window.crypto.getRandomValues(randomBytes);
            } else {
                for (let i = 0; i < 32; i++) randomBytes[i] = Math.floor(Math.random() * 256);
            }
            const generatedKeyHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

            await setDoc(doc(db, "assessment_keys", contestId), {
                conassessmentId: contestId,
                encryptionKey: generatedKeyHex,
                algorithm: "AES-256-GCM",
                createdAt: new Date().toISOString(),
                validFrom: contestForm.startTime || null,
                validUntil: contestForm.endTime || null
            }, { merge: true });

            toast.success("Contest and secure encryption key saved successfully.");
            setIsContestModalOpen(false);
            fetchContests();
        } catch (err) {
            toast.error(`Failed to save contest: ${err.message}`);
        }
    };

    const handleDeleteContest = async (id) => {
        if (window.confirm("Are you sure you want to delete this contest?")) {
            try {
                await deleteDoc(doc(db, "contests", id));
                try {
                    await deleteDoc(doc(db, "assessment_keys", id));
                } catch (_) {}
                fetchContests();
                toast.success("Contest deleted successfully.");
            } catch (err) {
                toast.error(`Delete failed: ${err.message}`);
            }
        }
    };

    // Open create/edit modal
    const openFormModal = (challenge = null) => {
        if (challenge) {
            // Edit mode
            setEditingId(challenge.id);
            setFormId(challenge.id);
            setFormTitle(challenge.title ?? '');
            setFormDiff(challenge.difficulty || 'Easy');
            setFormDesc(challenge.description ?? '');
            setFormInst(challenge.instructions ?? '');
            setFormCons(challenge.constraints || 'Time Limit: 2.0s');
            setFormIsPremium(challenge.isPremium || false);
            setFormTestcases(challenge.testCases || [{ input: '', expected: '' }]);
            setFormBoilerplates({
                c: challenge.boilerPlates?.c ?? '',
                cpp: challenge.boilerPlates?.cpp ?? '',
                python: challenge.boilerPlates?.python ?? '',
                java: challenge.boilerPlates?.java ?? ''
            });
        } else {
            // Create mode
            setEditingId(null);
            setFormId('');
            setFormTitle('');
            setFormDiff('Easy');
            setFormDesc('');
            setFormInst('');
            setFormCons('Time Limit: 2.0s');
            setFormIsPremium(false);
            setFormTestcases([{ input: '', expected: '' }]);
            setFormBoilerplates({ c: '', cpp: '', python: '', java: '' });
        }
        setIsModalOpen(true);
    };

    // Save form submit
    const handleSaveForm = async (e) => {
        e.preventDefault();
        if (!formId.trim() || !formTitle.trim()) {
            toast.warning("Please fill in the ID and Title.");
            return;
        }

        const challengeData = {
            id: formId.trim(),
            title: formTitle.trim(),
            difficulty: formDiff,
            description: formDesc.trim(),
            instructions: formInst.trim(),
            constraints: formCons.trim(),
            isPremium: formIsPremium,
            testCases: formTestcases.map(tc => ({
                input: tc.input,
                expected: tc.expected
            })),
            boilerPlates: {
                c: formBoilerplates.c,
                cpp: formBoilerplates.cpp,
                python: formBoilerplates.python,
                java: formBoilerplates.java
            }
        };

        try {
            await setDoc(doc(db, "codingChallenges", formId.trim()), challengeData);
            toast.success("Challenge saved successfully.");
            setIsModalOpen(false);
            fetchChallenges();
        } catch (err) {
            toast.error(`Save failed: ${err.message}`);
        }
    };

    // Form test case array updates
    const addTestCaseRow = () => {
        setFormTestcases([...formTestcases, { input: '', expected: '' }]);
    };

    const removeTestCaseRow = (index) => {
        const updated = [...formTestcases];
        updated.splice(index, 1);
        setFormTestcases(updated);
    };

    const updateTestCaseRow = (index, field, value) => {
        const updated = [...formTestcases];
        updated[index][field] = value;
        setFormTestcases(updated);
    };

    // Fetch user premium status
    const handleCheckUser = async () => {
        if (!userEmail.trim()) {
            setUserMessage("Please input an email address.");
            return;
        }
        try {
            const userDoc = await getDoc(doc(db, "users", userEmail.trim()));
            if (userDoc.exists()) {
                setUserPremiumStatus(!!userDoc.data().isPremium);
                setUserMessage(`User exists. Premium Status: ${userDoc.data().isPremium ? 'Premium' : 'Free'}`);
            } else {
                setUserPremiumStatus(false);
                setUserMessage("User not registered in database, but we can set premium status.");
            }
        } catch (err) {
            setUserMessage(`Check failed: ${err.message}`);
        }
    };

    // Set user premium toggles
    const handleTogglePremium = async (newStatus) => {
        if (!userEmail.trim()) return;
        try {
            await setDoc(doc(db, "users", userEmail.trim()), {
                isPremium: newStatus
            }, { merge: true });
            setUserPremiumStatus(newStatus);
            setUserMessage(`Successfully updated status to: ${newStatus ? 'Premium' : 'Free'}`);
        } catch (err) {
            setUserMessage(`Update failed: ${err.message}`);
        }
    };

    return (
        <div className="admin-bank-wrapper">
            <header className="admin-bank-header">
                <div className="header-left">
                    <img 
                        src="https://raw.githubusercontent.com/seeditDev/SEED-Website/f3cee9002410a00df4da7bea636ac9fbc4c312ca/Plugins/SEED_Logo.webp" 
                        alt="SEED Logo" 
                        className="admin-logo" 
                    />
                    <span className="admin-brand">SEED-IT Admin Panel</span>
                    <Link to="/student/dashboard" className="back-dash-btn">
                        <FaArrowLeft /> Back to Dashboard
                    </Link>
                </div>
                <div className="header-tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('questions')}
                    >
                        Question Bank
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'contests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('contests')}
                    >
                        Contests
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        User Manager
                    </button>
                </div>
            </header>

            <main className="admin-bank-content">
                {activeTab === 'questions' && (
                    <div className="questions-tab-view animate-fade-in">
                        <div className="actions-header-row">
                            <h2>Question Bank Management</h2>
                            <div className="action-buttons-group">
                                <button className="seed-db-btn" onClick={handleReSeed}>
                                    <FaDatabase /> Seed Defaults
                                </button>
                                <button className="add-question-btn" onClick={() => openFormModal()}>
                                    <FaPlus /> Add Challenge
                                </button>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="admin-loading-spinner">
                                <div className="spinner"></div>
                                <p>Loading questions library...</p>
                            </div>
                        ) : (
                            <div className="admin-table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Title</th>
                                            <th>ID</th>
                                            <th>Difficulty</th>
                                            <th>Access Status</th>
                                            <th style={{ textAlign: 'center' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {challenges.map(ch => (
                                            <tr key={ch.id}>
                                                <td className="font-semibold">{ch.title}</td>
                                                <td className="code-badge">{ch.id}</td>
                                                <td>
                                                    <span className={`diff-badge ${ch.difficulty?.toLowerCase() || ''}`}>
                                                        {ch.difficulty}
                                                    </span>
                                                </td>
                                                <td>
                                                    {ch.isPremium ? (
                                                        <span className="access-badge premium">
                                                            <FaLock /> Premium
                                                        </span>
                                                    ) : (
                                                        <span className="access-badge free">
                                                            Free
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="actions-cell">
                                                        <button 
                                                            className="edit-btn" 
                                                            onClick={() => openFormModal(ch)}
                                                            title="Edit Challenge"
                                                        >
                                                            <FaEdit />
                                                        </button>
                                                        <button 
                                                            className="delete-btn" 
                                                            onClick={() => handleDeleteQuestion(ch.id)}
                                                            title="Delete Challenge"
                                                        >
                                                            <FaTrash />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="users-tab-view animate-fade-in">
                        <div className="user-manager-card">
                            <h2>User Premium Status Manager</h2>
                            <p className="card-description">
                                Look up a student's email to verify their premium access status or toggle their access instantly.
                            </p>
                            <div className="user-lookup-form">
                                <input 
                                    type="email" 
                                    placeholder="Enter student email (e.g. student@seedit.in)" 
                                    value={userEmail}
                                    onChange={(e) => setUserEmail(e.target.value)}
                                    className="user-email-input"
                                />
                                <button className="check-user-btn" onClick={handleCheckUser}>
                                    Check Access
                                </button>
                            </div>
                            
                            {userMessage && (
                                <div className="user-status-display">
                                    <p className="status-message">{userMessage}</p>
                                    {userPremiumStatus !== null && (
                                        <div className="toggle-actions">
                                            {userPremiumStatus ? (
                                                <button className="downgrade-btn" onClick={() => handleTogglePremium(false)}>
                                                    Downgrade to Free
                                                </button>
                                            ) : (
                                                <button className="upgrade-btn" onClick={() => handleTogglePremium(true)}>
                                                    Upgrade to Premium
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'contests' && (
                    <div className="contests-tab-view animate-fade-in">
                        <div className="actions-header-row">
                            <h2>Contest Management</h2>
                            <button className="add-question-btn" onClick={() => openContestModal()}>
                                <FaPlus /> Create Contest
                            </button>
                        </div>
                        {isLoading ? (
                            <div className="admin-loading-spinner"><div className="spinner"></div><p>Loading contests...</p></div>
                        ) : (
                            <div className="admin-table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Title</th>
                                            <th>ID</th>
                                            <th>Time Window</th>
                                            <th>Questions</th>
                                            <th style={{ textAlign: 'center' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {contests.length > 0 ? contests.map(c => (
                                            <tr key={c.id}>
                                                <td className="font-semibold">{c.title}</td>
                                                <td className="code-badge">{c.id}</td>
                                                <td>{c.startTime ? `${c.startTime} to ${c.endTime}` : 'No time set'}</td>
                                                <td>{c.questions?.length || 0}</td>
                                                <td>
                                                    <div className="actions-cell">
                                                        <button className="edit-btn" onClick={() => openContestModal(c)}><FaEdit /></button>
                                                        <button className="delete-btn" onClick={() => handleDeleteContest(c.id)}><FaTrash /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>No contests found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Modal Form Dialog */}
            {isModalOpen && (
                <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingId ? "Edit Coding Challenge" : "Add Coding Challenge"}</h3>
                            <button className="close-modal-btn" onClick={() => setIsModalOpen(false)}>
                                <FaTimes />
                            </button>
                        </div>
                        <form onSubmit={handleSaveForm} className="modal-form-body">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Challenge ID (unique, lowercase, no spaces)</label>
                                    <input 
                                        type="text" 
                                        value={formId} 
                                        onChange={(e) => setFormId(e.target.value)}
                                        disabled={editingId !== null}
                                        placeholder="e.g. two_sum"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Challenge Title</label>
                                    <input 
                                        type="text" 
                                        value={formTitle} 
                                        onChange={(e) => setFormTitle(e.target.value)}
                                        placeholder="e.g. 1. Two Sum"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Difficulty</label>
                                    <select value={formDiff} onChange={(e) => setFormDiff(e.target.value)}>
                                        <option value="Easy">Easy</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Hard">Hard</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Constraints</label>
                                    <input 
                                        type="text" 
                                        value={formCons} 
                                        onChange={(e) => setFormCons(e.target.value)}
                                        placeholder="e.g. Time Limit: 2.0s"
                                    />
                                </div>
                            </div>

                            <div className="form-group checkbox-group">
                                <input 
                                    type="checkbox" 
                                    id="premium_checkbox"
                                    checked={formIsPremium}
                                    onChange={(e) => setFormIsPremium(e.target.checked)}
                                />
                                <label htmlFor="premium_checkbox" className="premium-label">
                                    <FaLock className="lock-icon" /> Mark as Premium Challenge (Requires active user subscription)
                                </label>
                            </div>

                            <div className="form-group">
                                <label>Description</label>
                                <textarea 
                                    value={formDesc} 
                                    onChange={(e) => setFormDesc(e.target.value)}
                                    placeholder="Write a clear problem statement..."
                                    rows="3"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Instructions</label>
                                <textarea 
                                    value={formInst} 
                                    onChange={(e) => setFormInst(e.target.value)}
                                    placeholder="Input/Output directions..."
                                    rows="2"
                                />
                            </div>

                            {/* Test Cases Builder */}
                            <div className="form-test-cases-section">
                                <div className="section-header">
                                    <h4>Test Cases</h4>
                                    <button type="button" className="add-row-btn" onClick={addTestCaseRow}>
                                        <FaPlus /> Add Test Case
                                    </button>
                                </div>
                                <div className="test-cases-list-container">
                                    {formTestcases.map((tc, idx) => (
                                        <div key={idx} className="test-case-row">
                                            <div className="row-num">#{idx + 1}</div>
                                            <textarea 
                                                placeholder="Stdin Input" 
                                                value={tc.input} 
                                                onChange={(e) => updateTestCaseRow(idx, 'input', e.target.value)}
                                                rows="2"
                                            />
                                            <textarea 
                                                placeholder="Expected Output" 
                                                value={tc.expected} 
                                                onChange={(e) => updateTestCaseRow(idx, 'expected', e.target.value)}
                                                rows="2"
                                                required
                                            />
                                            {formTestcases.length > 1 && (
                                                <button type="button" className="remove-row-btn" onClick={() => removeTestCaseRow(idx)}>
                                                    <FaTrash />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Boilerplates Builder */}
                            <div className="form-boilerplates-section">
                                <h4>Boilerplate Code templates</h4>
                                <div className="boilerplates-grid">
                                    <div className="bp-input-group">
                                        <label>C++ Boilerplate</label>
                                        <textarea 
                                            value={formBoilerplates.cpp}
                                            onChange={(e) => setFormBoilerplates({ ...formBoilerplates, cpp: e.target.value })}
                                            placeholder="#include <iostream>..."
                                            rows="4"
                                        />
                                    </div>
                                    <div className="bp-input-group">
                                        <label>C Boilerplate</label>
                                        <textarea 
                                            value={formBoilerplates.c}
                                            onChange={(e) => setFormBoilerplates({ ...formBoilerplates, c: e.target.value })}
                                            placeholder="#include <stdio.h>..."
                                            rows="4"
                                        />
                                    </div>
                                    <div className="bp-input-group">
                                        <label>Python Boilerplate</label>
                                        <textarea 
                                            value={formBoilerplates.python}
                                            onChange={(e) => setFormBoilerplates({ ...formBoilerplates, python: e.target.value })}
                                            placeholder="print('hello')..."
                                            rows="4"
                                        />
                                    </div>
                                    <div className="bp-input-group">
                                        <label>Java Boilerplate</label>
                                        <textarea 
                                            value={formBoilerplates.java}
                                            onChange={(e) => setFormBoilerplates({ ...formBoilerplates, java: e.target.value })}
                                            placeholder="public class Main..."
                                            rows="4"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="modal-cancel-btn" onClick={() => setIsModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="modal-save-btn">
                                    Save Challenge
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Contest Modal Dialog */}
            {isContestModalOpen && (
                <div className="modal-backdrop" onClick={() => setIsContestModalOpen(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingContestId ? "Edit Contest" : "Create Contest"}</h3>
                            <button className="close-modal-btn" onClick={() => setIsContestModalOpen(false)}><FaTimes /></button>
                        </div>
                        <form onSubmit={handleSaveContest} className="modal-form-body">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Contest ID (unique, lowercase, no spaces)</label>
                                    <input type="text" value={contestForm.id} onChange={e => setContestForm({...contestForm, id: e.target.value})} disabled={editingContestId !== null} placeholder="e.g. weekly-contest-1" required />
                                </div>
                                <div className="form-group">
                                    <label>Contest Title</label>
                                    <input type="text" value={contestForm.title} onChange={e => setContestForm({...contestForm, title: e.target.value})} placeholder="e.g. Weekly Assessment 1" required />
                                </div>
                                <div className="form-group">
                                    <label>Start Time</label>
                                    <input type="datetime-local" value={contestForm.startTime} onChange={e => setContestForm({...contestForm, startTime: e.target.value})} />
                                </div>
                                <div className="form-group">
                                    <label>End Time</label>
                                    <input type="datetime-local" value={contestForm.endTime} onChange={e => setContestForm({...contestForm, endTime: e.target.value})} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea value={contestForm.description} onChange={e => setContestForm({...contestForm, description: e.target.value})} placeholder="Details about this assessment..." rows="2" />
                            </div>
                            <div className="form-group">
                                <label>Map Questions to Contest</label>
                                <p style={{ fontSize: '0.85rem', color: '#999', marginBottom: '10px' }}>Select questions from the bank that will appear in this contest.</p>
                                <div className="question-mapper-list" style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #333', padding: '15px', borderRadius: '4px', background: '#1e1e1e' }}>
                                    {challenges.map(ch => (
                                        <div key={ch.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                                            <input 
                                                type="checkbox" 
                                                id={`q-${ch.id}`}
                                                checked={contestForm.questions.includes(ch.id)}
                                                onChange={(e) => {
                                                    const newQ = e.target.checked 
                                                        ? [...contestForm.questions, ch.id]
                                                        : contestForm.questions.filter(id => id !== ch.id);
                                                    setContestForm({...contestForm, questions: newQ});
                                                }}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                            <label htmlFor={`q-${ch.id}`} style={{ marginLeft: '12px', cursor: 'pointer', fontSize: '0.95rem' }}>
                                                {ch.title} <span style={{ color: '#aaa', fontSize: '0.8rem', marginLeft: '5px' }}>({ch.difficulty})</span>
                                            </label>
                                        </div>
                                    ))}
                                    {challenges.length === 0 && <p style={{ color: '#666' }}>No questions available. Add questions to the bank first.</p>}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="modal-cancel-btn" onClick={() => setIsContestModalOpen(false)}>Cancel</button>
                                <button type="submit" className="modal-save-btn">Save Contest</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminQuestionBank;
