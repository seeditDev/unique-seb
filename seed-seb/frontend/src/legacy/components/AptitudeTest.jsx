import React, { useState, useEffect } from 'react';
import { FaArrowLeft, FaArrowRight, FaCheck, FaSearch, FaBookmark, FaTimes, FaClock, FaChartBar } from 'react-icons/fa';
import '../styles/AptitudeTest.css';
import timeService from '../services/timeService';
import { fetchContentJSON } from '../utils/contentApi';

// Content URLs configuration
const LOCAL_BASE_URL = '/seed-contents';
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';

const AptitudeTest = () => {
    // State variables
    const [currentTest, setCurrentTest] = useState(null);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('quantitative');
    const [startTime, setStartTime] = useState(null);
    const [currentTopicPath, setCurrentTopicPath] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [selectedTopic, setSelectedTopic] = useState('');
    const [selectedTest, setSelectedTest] = useState('');
    const [availableTests, setAvailableTests] = useState([]);
    const [bookmarkedQuestions, setBookmarkedQuestions] = useState([]);
    const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
    const [showReviewAnswers, setShowReviewAnswers] = useState(false);
    const [questionStartTimes, setQuestionStartTimes] = useState({});
    const [previousAttempts, setPreviousAttempts] = useState([]);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [showDetailedAnswers, setShowDetailedAnswers] = useState(false);

    // Topics data structure
    const topics = {
        quantitative: [
            "time-and-work", "time-speed-distance", "averages", "ratios-proportions",
            "sequence-series-progressions", "co-ordinate-geometry", "statistics",
            "combinatorics", "linear-algebra", "probability", "percentages",
            "permutations-combinations", "numbers", "functions", "mensuration",
            "sudoku", "trigonometry", "set-theory", "theory-of-equation",
            "logarithm", "functions-and-graph", "data-interpretation-multiple-charts",
            "profit-and-loss", "simple-equation", "algebra", "geometry",
            "data-interpretation", "alligations-and-mixtures", "simple-compound-interest",
            "pipes-and-cisterns", "problems-on-hcf-lcm", "areas-shapes-perimeter",
            "height-and-distance", "partnership", "races-and-games", "simplification",
            "clocks-calendars", "problems-on-ages", "surds-indices", "data-sufficiency",
            "problems-on-trains", "cryptarithmetic", "divisibility",
            "numbers-and-decimal-fractions", "spatial-ability", "chain-rule"
        ],
        reasoning: [
            "data-arrangements", "number-series", "lr-arrangements", "lr-ranking",
            "assertion-and-reason", "team-formations", "conditional-syllogisms",
            "statement-and-conclusions", "statement-courses-of-action", "syllogism",
            "statement-and-assumptions", "critical-reasoning", "coding-decoding",
            "odd-man-out", "direction-sense", "image-based-problems", "blood-relationship",
            "seating-arrangements", "logical-deduction", "character-puzzles",
            "clock-puzzles", "dot-situation", "embedded-images", "figure-matrix",
            "grouping-of-images", "image-analysis", "logical-puzzles", "mirror-water-images",
            "missing-letters-puzzles", "number-puzzles", "paper-cutting", "paper-folding",
            "pattern-completion", "playing-cards-puzzles", "rule-detection",
            "shape-construction", "attention-to-details", "flowcharts", "puzzles",
            "cubes", "sequence-and-series", "statements", "venn-diagrams", "analogies",
            "data-sufficiency", "inferred-meaning", "logical-order", "mathematical-operations",
            "logical-choice", "analytical-reasoning"
        ],
        verbal: [
            "paragraph-formation", "sentence-completion", "reading-comprehensions",
            "sentence-correction", "spotting-errors", "sentence-selection",
            "antonyms", "synonyms", "jumbled-sentences", "selecting-words",
            "sentence-improvement", "odd-words", "sentence-formation",
            "fact-inference-judgement", "fill-in-the-blanks", "one-word-substitution",
            "theme-detection", "parts-of-speech", "idioms-and-phrases", "spellings"
        ],
        "company-specific": [
            "tcs", "infosys", "wipro", "hcl", "accenture", "capgemini", "tata-consultancy-services",
            "cognizant", "deloitte", "kpmg", "ey", "pwc"
        ],
        "practice-tests": [
            "set-1", "set-2", "set-3", "set-4", "set-5", "set-6", "set-7", "set-8", "set-9", "set-10"
        ]
    };

    // Topic display names mapping
    const topicDisplayNames = {
        "time-and-work": "Time and Work",
        "time-speed-distance": "Time, Speed, Distance",
        "averages": "Averages",
        "ratios-proportions": "Ratios & Proportions",
        "sequence-series-progressions": "Sequence, Series, Progressions",
        "co-ordinate-geometry": "Co-ordinate Geometry",
        "statistics": "Statistics",
        "combinatorics": "Combinatorics",
        "linear-algebra": "Linear Algebra",
        "probability": "Probability",
        "percentages": "Percentages",
        "permutations-combinations": "Permutations & Combinations",
        "numbers": "Numbers",
        "functions": "Functions",
        "mensuration": "Mensuration",
        "sudoku": "Sudoku",
        "trigonometry": "Trigonometry",
        "set-theory": "Set Theory",
        "theory-of-equation": "Theory of Equation",
        "logarithm": "Logarithm",
        "functions-and-graph": "Functions and Graph",
        "data-interpretation-multiple-charts": "Data Interpretation (Multiple Charts)",
        "profit-and-loss": "Profit and Loss",
        "simple-equation": "Simple Equation",
        "algebra": "Algebra",
        "geometry": "Geometry",
        "data-interpretation": "Data Interpretation",
        "alligations-and-mixtures": "Alligations and Mixtures",
        "simple-compound-interest": "Simple & Compound Interest",
        "pipes-and-cisterns": "Pipes and Cisterns",
        "problems-on-hcf-lcm": "Problems on HCF & LCM",
        "areas-shapes-perimeter": "Areas, Shapes, Perimeter",
        "height-and-distance": "Height and Distance",
        "partnership": "Partnership",
        "races-and-games": "Races and Games",
        "simplification": "Simplification",
        "clocks-calendars": "Clocks & Calendars",
        "problems-on-ages": "Problems on Ages",
        "surds-indices": "Surds & Indices",
        "data-sufficiency": "Data Sufficiency",
        "problems-on-trains": "Problems on Trains",
        "cryptarithmetic": "Cryptarithmetic",
        "divisibility": "Divisibility",
        "numbers-and-decimal-fractions": "Numbers and Decimal Fractions",
        "spatial-ability": "Spatial Ability",
        "chain-rule": "Chain Rule",
        "data-arrangements": "Data Arrangements",
        "number-series": "Number Series",
        "lr-arrangements": "LR Arrangements",
        "lr-ranking": "LR Ranking",
        "assertion-and-reason": "Assertion and Reason",
        "team-formations": "Team Formations",
        "conditional-syllogisms": "Conditional Syllogisms",
        "statement-and-conclusions": "Statement and Conclusions",
        "statement-courses-of-action": "Statement Courses of Action",
        "syllogism": "Syllogism",
        "statement-and-assumptions": "Statement and Assumptions",
        "critical-reasoning": "Critical Reasoning",
        "coding-decoding": "Coding Decoding",
        "odd-man-out": "Odd Man Out",
        "direction-sense": "Direction Sense",
        "image-based-problems": "Image Based Problems",
        "blood-relationship": "Blood Relationship",
        "seating-arrangements": "Seating Arrangements",
        "logical-deduction": "Logical Deduction",
        "character-puzzles": "Character Puzzles",
        "clock-puzzles": "Clock Puzzles",
        "dot-situation": "Dot Situation",
        "embedded-images": "Embedded Images",
        "figure-matrix": "Figure Matrix",
        "grouping-of-images": "Grouping of Images",
        "image-analysis": "Image Analysis",
        "logical-puzzles": "Logical Puzzles",
        "mirror-water-images": "Mirror & Water Images",
        "missing-letters-puzzles": "Missing Letters Puzzles",
        "number-puzzles": "Number Puzzles",
        "paper-cutting": "Paper Cutting",
        "paper-folding": "Paper Folding",
        "pattern-completion": "Pattern Completion",
        "playing-cards-puzzles": "Playing Cards Puzzles",
        "rule-detection": "Rule Detection",
        "shape-construction": "Shape Construction",
        "attention-to-details": "Attention to Details",
        "flowcharts": "Flowcharts",
        "puzzles": "Puzzles",
        "cubes": "Cubes",
        "sequence-and-series": "Sequence and Series",
        "statements": "Statements",
        "venn-diagrams": "Venn Diagrams",
        "analogies": "Analogies",
        "inferred-meaning": "Inferred Meaning",
        "logical-order": "Logical Order",
        "mathematical-operations": "Mathematical Operations",
        "logical-choice": "Logical Choice",
        "analytical-reasoning": "Analytical Reasoning",
        "paragraph-formation": "Paragraph Formation",
        "sentence-completion": "Sentence Completion",
        "reading-comprehensions": "Reading Comprehensions",
        "sentence-correction": "Sentence Correction",
        "spotting-errors": "Spotting Errors",
        "sentence-selection": "Sentence Selection",
        "antonyms": "Antonyms",
        "synonyms": "Synonyms",
        "jumbled-sentences": "Jumbled Sentences",
        "selecting-words": "Selecting Words",
        "sentence-improvement": "Sentence Improvement",
        "odd-words": "Odd Words",
        "sentence-formation": "Sentence Formation",
        "fact-inference-judgement": "Fact, Inference, Judgement",
        "fill-in-the-blanks": "Fill in the Blanks",
        "one-word-substitution": "One Word Substitution",
        "theme-detection": "Theme Detection",
        "parts-of-speech": "Parts of Speech",
        "idioms-and-phrases": "Idioms and Phrases",
        "spellings": "Spellings",
        "tcs": "TCS",
        "infosys": "Infosys",
        "wipro": "Wipro",
        "hcl": "HCL",
        "accenture": "Accenture",
        "capgemini": "Capgemini",
        "tata-consultancy-services": "Tata Consultancy Services",
        "cognizant": "Cognizant",
        "deloitte": "Deloitte",
        "kpmg": "KPMG",
        "ey": "EY",
        "pwc": "PwC",
        "set-1": "Practice Set 1",
        "set-2": "Practice Set 2",
        "set-3": "Practice Set 3",
        "set-4": "Practice Set 4",
        "set-5": "Practice Set 5",
        "set-6": "Practice Set 6",
        "set-7": "Practice Set 7",
        "set-8": "Practice Set 8",
        "set-9": "Practice Set 9",
        "set-10": "Practice Set 10"
    };

    // Set default category to quantitative on component mount
    useEffect(() => {
        setActiveTab('quantitative');
    }, []);

    // Handle tab change
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSelectedTopic('');
        setSelectedTest('');
        setAvailableTests([]);
    };

    // Handle topic selection
    const handleTopicSelect = (topic) => {
        setSelectedTopic(topic);
        setSelectedTest('');
        // Generate available tests for the selected topic
        const tests = Array.from({ length: 10 }, (_, i) => `Test ${i + 1}`);
        setAvailableTests(tests);
    };

    // Try to fetch from local path first, then fall back to GitHub
    const fetchTestData = async (testNumber) => {
        try {
            // First try local path
            const localUrl = `${LOCAL_BASE_URL}/${activeTab}/${selectedTopic}/test${testNumber}.json`;
            console.log('[AptitudeTest] Trying local fetch from:', localUrl);
            
            try {
                const localResponse = await fetch(localUrl);
                if (localResponse.ok) {
                    console.log('[AptitudeTest] Local fetch successful');
                    const data = await localResponse.json();
                    return data;
                }
                console.log('[AptitudeTest] Local fetch failed, falling back to GitHub');
            } catch (localError) {
                console.log('[AptitudeTest] Local fetch error:', localError);
                console.log('[AptitudeTest] Falling back to GitHub');
            }

            // Authenticated fallback via the server-side content proxy.
            // SECURITY: no GitHub token is present in the client bundle any more.
            console.log('[AptitudeTest] Attempting proxied content fetch');
            try {
                const proxied = await fetchContentJSON(`${activeTab}/${selectedTopic}/test${testNumber}.json`, { localFirst: false });
                if (proxied !== undefined) return proxied;
            } catch (proxyErr) {
                console.log('[AptitudeTest] Proxied content fetch failed:', proxyErr?.message);
            }

            // If GitHub API fails, try raw GitHub URL
            console.log('[AptitudeTest] GitHub API failed, trying raw URL');
            const rawUrl = `${GITHUB_BASE_URL}/${activeTab}/${selectedTopic}/test${testNumber}.json`;
            console.log('[AptitudeTest] Trying raw GitHub URL:', rawUrl);
            
            const rawResponse = await fetch(rawUrl);
            if (!rawResponse.ok) {
                throw new Error(`Failed to fetch test data: ${rawResponse.status}`);
            }
            
            console.log('[AptitudeTest] Raw GitHub fetch successful');
            return await rawResponse.json();
            
        } catch (error) {
            console.error('[AptitudeTest] All fetch attempts failed:', error);
            console.error('[AptitudeTest] Error details:', {
                message: error.message,
                stack: error.stack,
                type: error.name
            });
            throw error;
        }
    };

    // Handle test selection
    const handleTestSelect = async (test) => {
        setSelectedTest(test);
        setLoading(true);
        setError(null);
        
        try {
            const testNumber = test.split(' ')[1];
            const testData = await fetchTestData(testNumber);
            
            setCurrentTest(testData);
            setQuestionIndex(0);
            setAnswers({});
            setStartTime(timeService.now());
            setLoading(false);
        } catch (error) {
            console.error('Error loading test:', error);
            setError('Error loading test. Please check your connection and try again.');
            setLoading(false);
        }
    };

    // Handle option selection
    const handleSelectOption = (option) => {
        setAnswers({
            ...answers,
            [questionIndex]: option
        });
    };

    // Handle navigation
    const handleNavigateQuestion = (direction) => {
        if (direction === 'prev' && questionIndex > 0) {
            setQuestionIndex(questionIndex - 1);
        } else if (direction === 'next' && questionIndex < currentTest?.questions?.length - 1) {
            setQuestionIndex(questionIndex + 1);
        }
    };

    // Add this useEffect to track question start times
    useEffect(() => {
        if (currentTest && questionIndex !== undefined) {
            setQuestionStartTimes(prev => ({
                ...prev,
                [questionIndex]: prev[questionIndex] || timeService.now()
            }));
        }
    }, [questionIndex, currentTest]);

    // Add this function to handle bookmarking
    const toggleBookmark = (questionIndex) => {
        setBookmarkedQuestions(prev => {
            if (prev.includes(questionIndex)) {
                return prev.filter(q => q !== questionIndex);
            }
            return [...prev, questionIndex];
        });
    };

    // Add this function to calculate time taken per question
    const getTimeTaken = (questionIndex) => {
        const startTime = questionStartTimes[questionIndex];
        if (!startTime) return 0;
        return Math.round((timeService.now() - startTime) / 1000); // in seconds
    };

    // Handle test submission
    const handleSubmit = () => {
        // If we're not in review mode and not showing confirm dialog, show confirm dialog
        if (!showReviewAnswers && !showConfirmSubmit) {
            setShowConfirmSubmit(true);
            return;
        }

        // If we're showing confirm dialog, switch to review mode
        if (showConfirmSubmit) {
            setShowReviewAnswers(true);
            setShowConfirmSubmit(false);
            return;
        }

        // If we're in review mode, proceed with actual submission
        if (showReviewAnswers) {
            const score = calculateScore();
            const timeTaken = Math.round((timeService.now() - startTime) / 1000);
            
            // Save attempt to previous attempts
            setPreviousAttempts(prev => [...prev, {
                assessmentId: currentTest.id,
                score,
                timeTaken,
                answers,
                questionTimes: questionStartTimes,
                date: timeService.getNow().toISOString()
            }]);

            // Update current test with results
            setCurrentTest(prev => ({
                ...prev,
                score,
                timeTaken,
                submitted: true
            }));
            
            setShowConfirmSubmit(false);
            setShowReviewAnswers(false);
        }
    };

    const handleReviewAnswers = () => {
        setShowReviewAnswers(true);
        setShowConfirmSubmit(false); // Close the confirm dialog when showing review
    };

    const handleCancelReview = () => {
        setShowReviewAnswers(false);
    };

    // Calculate score
    const calculateScore = () => {
        if (!currentTest?.questions) return 0;
        let score = 0;
        currentTest.questions.forEach((question, index) => {
            if (answers[index] !== undefined && 
                question.options[answers[index]] === question.correctAnswer) {
                score++;
            }
        });
        return Math.floor((score / currentTest.questions.length) * 100);
    };

    // Filter topics based on search term
    const filteredTopics = () => {
        if (!searchTerm) return topics[activeTab];
        
        return topics[activeTab].filter(topic => 
            topicDisplayNames[topic]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            topic.toLowerCase().includes(searchTerm.toLowerCase())
        );
    };

    // Render test selector
    const renderTestSelector = () => {
        return (
            <div className="aptitude-test-selection">
                <h2>Aptitude Test Selection</h2>
                
                <div className="aptitude-side-by-side">
                    <div className="aptitude-selection-container">
                        {/* Section Selection Box */}
                        <div className="aptitude-selection-box">
                            <h3>Sections</h3>
                            <div className="aptitude-search-box">
                                <FaSearch className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search sections..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <ul className="aptitude-selection-list">
                                {Object.entries(topics).map(([key, value]) => (
                                    <li
                                        key={key}
                                        className={`aptitude-selection-item ${activeTab === key ? 'aptitude-selected' : ''}`}
                                        onClick={() => handleTabChange(key)}
                                    >
                                        <span className="aptitude-item-title">{key.charAt(0).toUpperCase() + key.slice(1).replace('-', ' ')}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        
                        {/* Topic Selection Box */}
                        <div className="aptitude-selection-box">
                            <h3>Topics</h3>
                            <div className="aptitude-search-box">
                                <FaSearch className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search topics..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <ul className="aptitude-selection-list">
                                {filteredTopics().map((topic) => (
                                    <li
                                        key={topic}
                                        className={`aptitude-selection-item ${selectedTopic === topic ? 'aptitude-selected' : ''}`}
                                        onClick={() => handleTopicSelect(topic)}
                                    >
                                        <span className="aptitude-item-title">
                                            {topicDisplayNames[topic] || topic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        
                        {/* Test Selection Box */}
                        <div className="aptitude-selection-box">
                            <h3>Tests</h3>
                            <div className="aptitude-search-box">
                                <FaSearch className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search tests..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <ul className="aptitude-selection-list">
                                {availableTests.map((test) => (
                                    <li
                                        key={test}
                                        className={`aptitude-selection-item ${selectedTest === test ? 'aptitude-selected' : ''}`}
                                        onClick={() => handleTestSelect(test)}
                                    >
                                        <div>
                                            <span className="aptitude-item-title">{test}</span>
                                            <div className="aptitude-test-details">
                                                <span>30 questions</span>
                                                <span>No time limit</span>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                                {availableTests.length === 0 && (
                                    <li className="aptitude-selection-item">
                                        <span className="aptitude-item-title">Select a topic first</span>
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Add this function to render the progress indicator
    const renderProgressIndicator = () => {
        if (!currentTest) return null;
        
        const totalQuestions = currentTest.questions.length;
        const answeredQuestions = Object.keys(answers).length;
        const progress = (answeredQuestions / totalQuestions) * 100;

        return (
            <div className="aptitude-progress-container">
                <div className="aptitude-progress-bar">
                    <div 
                        className="aptitude-progress-fill"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="aptitude-progress-text">
                    {answeredQuestions} of {totalQuestions} questions answered
                </div>
            </div>
        );
    };

    // Update the renderConfirmDialog function
    const renderConfirmDialog = () => {
        if (!showConfirmSubmit) return null;

        return (
            <div className="aptitude-confirm-dialog">
                <div className="aptitude-confirm-content">
                    <h3>Submit Test?</h3>
                    <p>Are you sure you want to submit your test? You can review your answers before final submission.</p>
                    <div className="aptitude-confirm-buttons">
                        <button onClick={() => setShowConfirmSubmit(false)}>Cancel</button>
                        <button onClick={handleReviewAnswers}>Review Answers</button>
                    </div>
                </div>
            </div>
        );
    };

    // Update the renderReviewAnswers function
    const renderReviewAnswers = () => {
        if (!showReviewAnswers) return null;

        return (
            <div className="aptitude-review-container">
                <h3>Review Your Answers</h3>
                <div className="aptitude-review-list">
                    {currentTest.questions.map((question, index) => (
                        <div key={index} className="aptitude-review-item">
                            <div className="aptitude-review-header">
                                <span>Question {index + 1}</span>
                                <span>{getTimeTaken(index)}s</span>
                            </div>
                            <p>{question.question}</p>
                            <div className="aptitude-review-answer">
                                Your answer: {answers[index] !== undefined ? question.options[answers[index]] : 'Not answered'}
                            </div>
                            <div className="aptitude-review-actions">
                                <button onClick={() => {
                                    setQuestionIndex(index);
                                    setShowReviewAnswers(false);
                                }}>Go to Question</button>
                                <button 
                                    className={bookmarkedQuestions.includes(index) ? 'bookmarked' : ''}
                                    onClick={() => toggleBookmark(index)}
                                >
                                    <FaBookmark /> {bookmarkedQuestions.includes(index) ? 'Bookmarked' : 'Bookmark'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="aptitude-review-actions">
                    <button onClick={handleCancelReview}>Back to Test</button>
                    <button onClick={handleSubmit}>Submit Test</button>
                </div>
            </div>
        );
    };

    // Update the handleBackToSelection function
    const handleBackToSelection = () => {
        setCurrentTest(null);
        setQuestionIndex(0);
        setAnswers({});
        setStartTime(null);
        setShowConfirmSubmit(false);
        setShowReviewAnswers(false);
    };

    // Add this function to render question navigation box
    const renderQuestionNavigation = () => {
        if (!currentTest?.questions) return null;

        return (
            <div className="aptitude-question-nav">
                <div className="aptitude-question-nav-grid">
                    {currentTest.questions.map((_, index) => (
                        <button
                            key={index}
                            className={`aptitude-question-nav-item ${
                                answers[index] !== undefined ? 'attempted' : 'not-attempted'
                            } ${questionIndex === index ? 'current' : ''} ${
                                bookmarkedQuestions.includes(index) ? 'bookmarked' : ''
                            }`}
                            onClick={() => setQuestionIndex(index)}
                        >
                            {index + 1}
                        </button>
                    ))}
                </div>
                <div className="aptitude-nav-legend">
                    <div className="aptitude-nav-legend-item">
                        <div className="aptitude-nav-legend-color attempted"></div>
                        <span>Attempted</span>
                    </div>
                    <div className="aptitude-nav-legend-item">
                        <div className="aptitude-nav-legend-color not-attempted"></div>
                        <span>Not Attempted</span>
                    </div>
                    <div className="aptitude-nav-legend-item">
                        <div className="aptitude-nav-legend-color current"></div>
                        <span>Current Question</span>
                    </div>
                    <div className="aptitude-nav-legend-item">
                        <div className="aptitude-nav-legend-color bookmarked"></div>
                        <span>Bookmarked</span>
                    </div>
                </div>
            </div>
        );
    };

    useEffect(() => {
        let timer;
        if (currentTest) {
            timer = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [currentTest]);

    const formatTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const renderStatusSummary = () => {
        if (!currentTest) return null;
        const attempted = Object.keys(answers).length;
        const bookmarked = bookmarkedQuestions.length;
        
        return (
            <div className="aptitude-status-summary">
                <div className="aptitude-timer">
                    <FaClock /> {formatTime(elapsedTime)}
                </div>
                <div className="aptitude-counts">
                    <span>Attempted: {attempted}/30</span>
                    <span>Bookmarked: {bookmarked}</span>
                </div>
            </div>
        );
    };

    // Render test content
    const renderTestContent = () => {
        if (!currentTest) return null;
        
        return (
            <div className="aptitude-test-content">
                <div className="aptitude-test-header">
                    <div className="aptitude-test-info">
                        <h1>{currentTest.name}</h1>
                        {renderStatusSummary()}
                    </div>
                    <button 
                        className="aptitude-back-button"
                        onClick={handleBackToSelection}
                    >
                        <FaArrowLeft /> End Test
                    </button>
                </div>
                
                {renderQuestionNavigation()}
                
                {renderConfirmDialog()}
                
                {renderReviewAnswers()}
                
                {!showReviewAnswers && (
                    <>
                        <div className="aptitude-question-container">
                            <div className="aptitude-question-header">
                                <span className="aptitude-question-number">Question {questionIndex + 1}</span>
                                <button 
                                    className={`aptitude-bookmark-button ${bookmarkedQuestions.includes(questionIndex) ? 'bookmarked' : ''}`}
                                    onClick={() => toggleBookmark(questionIndex)}
                                >
                                    <FaBookmark />
                                </button>
                            </div>
                            <p className="aptitude-question-text">{currentTest.questions[questionIndex].question}</p>
                            <div className="aptitude-options">
                                {currentTest.questions[questionIndex].options.map((option, optionIndex) => (
                                    <button
                                        key={optionIndex}
                                        className={`aptitude-option ${answers[questionIndex] === optionIndex ? 'selected' : ''}`}
                                        onClick={() => handleSelectOption(optionIndex)}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="aptitude-navigation">
                            <button 
                                className="aptitude-nav-button"
                                onClick={() => handleNavigateQuestion('prev')}
                                disabled={questionIndex === 0}
                            >
                                Previous
                            </button>
                            {Object.keys(answers).length === currentTest.questions.length && (
                                <button 
                                    className="aptitude-submit-button"
                                    onClick={handleSubmit}
                                >
                                    Submit Test
                                </button>
                            )}
                            <button 
                                className="aptitude-nav-button"
                                onClick={() => handleNavigateQuestion('next')}
                                disabled={questionIndex === currentTest.questions.length - 1}
                            >
                                Next
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    };

    // Render results view
    const renderResults = () => {
        if (!currentTest?.submitted) return null;

        const score = currentTest.score;
        const timeTaken = currentTest.timeTaken;
        const totalQuestions = currentTest.questions.length;
        const correctAnswers = Math.floor((score * totalQuestions) / 100);
        const incorrectAnswers = totalQuestions - correctAnswers;

        return (
            <div className="aptitude-results-container">
                <div className="aptitude-results-header">
                    <h2>Test Results</h2>
                    <button 
                        className="aptitude-back-button"
                        onClick={handleBackToSelection}
                    >
                        <FaArrowLeft /> Back to Selection
                    </button>
                </div>

                <div className="aptitude-results-summary">
                    <div className="aptitude-score-card">
                        <div className="aptitude-score-circle">
                            <div className="aptitude-score-value">{score}%</div>
                        </div>
                        <div className="aptitude-score-details">
                            <div className="aptitude-score-item">
                                <FaCheck className="aptitude-icon correct" />
                                <span>Correct: {correctAnswers}</span>
                            </div>
                            <div className="aptitude-score-item">
                                <FaTimes className="aptitude-icon incorrect" />
                                <span>Incorrect: {incorrectAnswers}</span>
                            </div>
                            <div className="aptitude-score-item">
                                <FaClock className="aptitude-icon" />
                                <span>Time: {formatTime(timeTaken)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="aptitude-results-actions">
                    <button 
                        className="aptitude-see-answers-button"
                        onClick={() => setShowDetailedAnswers(!showDetailedAnswers)}
                    >
                        {showDetailedAnswers ? 'Hide Answers' : 'See Answers with Explanations'}
                    </button>
                </div>

                {showDetailedAnswers && (
                    <div className="aptitude-results-breakdown">
                        <h3>Question-wise Breakdown</h3>
                        <div className="aptitude-results-list">
                            {currentTest.questions.map((question, index) => {
                                const isCorrect = answers[index] !== undefined && 
                                    question.options[answers[index]] === question.correctAnswer;
                                const timeSpent = getTimeTaken(index);

                                return (
                                    <div 
                                        key={index} 
                                        className={`aptitude-result-item ${isCorrect ? 'correct' : 'incorrect'}`}
                                    >
                                        <div className="aptitude-result-header">
                                            <div className="aptitude-result-status">
                                                <span className="aptitude-question-number">Question {index + 1}</span>
                                                {isCorrect ? 
                                                    <FaCheck className="aptitude-icon correct" /> : 
                                                    <FaTimes className="aptitude-icon incorrect" />
                                                }
                                            </div>
                                            <span className="aptitude-time-spent">{formatTime(timeSpent)}</span>
                                        </div>
                                        <div className="aptitude-question-content">
                                            <p className="aptitude-question-text">{question.question}</p>
                                            <div className="aptitude-answer-details">
                                                <div className="aptitude-answer-row">
                                                    <span className="aptitude-answer-label">Your answer:</span>
                                                    <span className={`aptitude-answer-value ${isCorrect ? 'correct' : 'incorrect'}`}>
                                                        {answers[index] !== undefined ? question.options[answers[index]] : 'Not answered'}
                                                    </span>
                                                </div>
                                                <div className="aptitude-answer-row">
                                                    <span className="aptitude-answer-label">Correct answer:</span>
                                                    <span className="aptitude-answer-value correct">{question.correctAnswer}</span>
                                                </div>
                                                {question.explanation && (
                                                    <div className="aptitude-explanation">
                                                        <span className="aptitude-explanation-label">Explanation:</span>
                                                        <p className="aptitude-explanation-text">{question.explanation}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Main render
    return (
        <div className="aptitude-container">
            {loading ? (
                <div className="aptitude-loading">Loading...</div>
            ) : error ? (
                <div className="aptitude-error">{error}</div>
            ) : currentTest?.submitted ? (
                renderResults()
            ) : currentTest ? (
                renderTestContent()
            ) : (
                renderTestSelector()
            )}
        </div>
    );
};

export default AptitudeTest; 