import React, { useState, useEffect, useRef, useCallback } from 'react';
import { buildResultDoc, buildSectionResult, buildQuestionResult, buildCodingSubmission } from '../utils/buildResultDoc.js';
import { useNavigate, useParams, useLocation } from './router-compat';
import { 
    FaArrowLeft, FaArrowRight, FaCheck, FaSearch, FaBookmark, FaTimes, 
    FaClock, FaChartBar, FaLock, FaExclamationTriangle, FaCheckCircle, 
    FaHome, FaFileAlt, FaListUl, FaShieldAlt, FaLightbulb, FaSignOutAlt, FaFlag 
} from 'react-icons/fa';
import '../styles/MCQPage.css';
import DataService from '../services/dataService';
import MCQService from '../services/mcqService';
import ProctoringEngine from './ProctoringEngine';
import AudioProctoringEngine from './AudioProctoringEngine';
import ProctoringInstructions from './ProctoringInstructions';
import timeService from '../services/timeService';
import { clearAllProctorCache, getViolations, recordViolation } from '../utils/proctorCache';
import { renderMathAndCode } from '../utils/mathAndCodeRenderer';
import { getAuthData } from '../utils/storageUtils';
import { fetchContentJSON } from '../utils/contentApi';
import { gradeMcqAttempt } from '../utils/mcqGrading';
import { readJSON, savePendingEnvelope } from '../utils/safeStorage';
import { throttledLocalStorageSet, flushThrottledWrites } from '../utils/throttle';
import { createSubmitGuard } from '../utils/submitGuard';
import { markAssessmentCompleted } from '../services/attemptStatusService';
import * as AttemptStatusService from '../services/attemptStatusService';
import { auth } from '../lib/firebase-config';
import SecurityWatermark from './SecurityWatermark';
import { stopAllMediaAndAI } from '../utils/hardwareTeardown';
import { toast } from 'sonner';

// ========================================
// PROCTORING CONFIGURATION
// ========================================
// Set to false to disable all proctoring features (camera, face detection, instructions)
// Set to true to enable proctoring for tests with passkeys
const ENABLE_PROCTORING = true;
// ========================================

// Content URLs configuration
const LOCAL_BASE_URL = '/seed-contents';
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';

const slugify = (value = '') => {
    if (!value) return 'mcq-test';
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'mcq-test';
};

const MCQ_ROUTE_BASE = '/student/mcq';
const AUTO_SUBMIT_NOTICE_KEY = 'mcqAutoSubmitNotice';
const RELOAD_GRACE_DURATION_MS = 90 * 1000;

const AUTO_SUBMIT_REASON_LABELS = {
    timer: 'Timer expired before submission',
    navigation: 'User navigated away from the MCQ page',
    'network-timeout': 'Network reconnect timeout exceeded',
    'grace-expired': 'Reload grace period expired',
    'offline-pending': 'Pending attempt auto-submitted while offline',
    default: 'Automatic submission completed',
};

const getAutoSubmitReasonLabel = (reason) => {
    if (!reason) return AUTO_SUBMIT_REASON_LABELS.default;
    return AUTO_SUBMIT_REASON_LABELS[reason] || AUTO_SUBMIT_REASON_LABELS.default;
};

const MCQPage = ({ isEmbedded = false, testData = null, secTimer = 0, onSectionSubmit = null, settings = {} }) => {
    const navigate = useNavigate();
    const { testSlug } = useParams();
    const location = useLocation();
    const [user, setUser] = useState(null);
    const [accessControl, setAccessControl] = useState(null);
    const [availableTests, setAvailableTests] = useState([]);
    const [filteredTests, setFilteredTests] = useState([]);
    const [currentTest, setCurrentTest] = useState(null);
    const [userAttempts, setUserAttempts] = useState({});
    const [filterDifficulty, setFilterDifficulty] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [questionIndex, setQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [startTime, setStartTime] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTest, setSelectedTest] = useState(null);
    const [bookmarkedQuestions, setBookmarkedQuestions] = useState([]);
    const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
    const [showReviewAnswers, setShowReviewAnswers] = useState(false);
    const [questionStartTimes, setQuestionStartTimes] = useState({});
    const [elapsedTime, setElapsedTime] = useState(0);
    const [remainingTime, setRemainingTime] = useState(0);
    const [testDuration, setTestDuration] = useState(0); // in seconds
    const [qTimerRemaining, setQTimerRemaining] = useState(0);
    const [lockedQuestions, setLockedQuestions] = useState([]);
    const [timeSpentPerQ, setTimeSpentPerQ] = useState({});
    const [passkey, setPasskey] = useState('');
    const [isPasskeyValidated, setIsPasskeyValidated] = useState(false);
    const [isValidatingPasskey, setIsValidatingPasskey] = useState(false);
    const [showPasskeyModal, setShowPasskeyModal] = useState(false);
    const [showInstructions, setShowInstructions] = useState(false);
    const [passkeyError, setPasskeyError] = useState('');
    const passkeyInputRef = useRef(null);
    const [proctoringData, setProctoringData] = useState({
        violationCount: 0,
        audioViolationCount: 0,
        violations: []
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionStatus, setSubmissionStatus] = useState(null); // 'success', 'error', 'duplicate'
    const [teststartedAt, setTeststartedAt] = useState(null);
    const [showVerifyingPopup, setShowVerifyingPopup] = useState(false);
    const [showSubmittingPopup, setShowSubmittingPopup] = useState(false);
    const [submissionStep, setSubmissionStep] = useState(''); // 'validating', 'generating', 'submitted'
    const [testAlreadyCompleted, setTestAlreadyCompleted] = useState(false);
    const [completedTestInfo, setCompletedTestInfo] = useState(null);
    const [startCountdown, setStartCountdown] = useState(null); // null or number (seconds)
    const [showNetworkPopup, setShowNetworkPopup] = useState(false);
    const [networkTimer, setNetworkTimer] = useState(30);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [activeTestSlug, setActiveTestSlug] = useState(sessionStorage.getItem('mcqActiveTestSlug') || null);
    const activeTestSlugRef = useRef(activeTestSlug);
    const previousPathRef = useRef(location.pathname);
    const networkTimeoutTriggeredRef = useRef(false);
    // Debounce ref: popup only appears if still offline after NETWORK_POPUP_DELAY ms
    const networkPopupDebounceRef = useRef(null);
    const NETWORK_POPUP_DELAY = 4000; // 4 seconds — covers most WiFi auto-reconnects
    const [autoSubmitNotice, setAutoSubmitNotice] = useState(null);
    const [viewingSolution, setViewingSolution] = useState(false);
    const [solutionQuestions, setSolutionQuestions] = useState([]);
    const [lastProgressSync, setLastProgressSync] = useState(sessionStorage.getItem('mcqLastProgressSync') || null);
    const progressSyncInFlight = useRef(false);

    /**
     * BUG FIXED (P0 duplicate submission): handleFinalSubmit guarded on the
     * `isSubmitting` *state*, which React updates asynchronously, and
     * handleAutoSubmit had no guard at all. A student clicking "Submit" on the
     * last second raced the 1s timer tick, so two full submit pipelines ran and
     * wrote the attempt twice (and fired two Sheets calls). A synchronous ref
     * guard is the only thing that closes this window.
     */
    const submitGuard = useRef(createSubmitGuard()).current;
    const activeProgressTestRef = useRef(null);

    // Always keep a ref to the latest onSectionSubmit callback so handleAutoSubmit
    // doesn't capture a stale version even after autoSubmitSection gets a new reference.
    const onSectionSubmitRef = useRef(onSectionSubmit);
    useEffect(() => {
        onSectionSubmitRef.current = onSectionSubmit;
    }, [onSectionSubmit]);
    const setAutoSubmitMessage = useCallback((message) => {
        sessionStorage.setItem(AUTO_SUBMIT_NOTICE_KEY, message);
        localStorage.setItem(AUTO_SUBMIT_NOTICE_KEY, message);
        setAutoSubmitNotice(message);
    }, []);
    const stopGlobalCameraStream = useCallback(() => {
        try {
            stopAllMediaAndAI();
        } catch (_) { }
    }, []);
    const clearTestSessionStorage = useCallback(() => {
        localStorage.removeItem('mcqTestStartTime');
        localStorage.removeItem('mcqTeststartedAt');
        localStorage.removeItem('mcqTestDuration');
        localStorage.removeItem('mcqTestData');
        localStorage.removeItem('mcqTestAnswers');
        localStorage.removeItem('mcqActiveTestSlug');
        localStorage.removeItem('mcqLastProgressSync');
        localStorage.removeItem('mcqLastActiveTime');
        localStorage.removeItem('mcqPendingSubmission');
        localStorage.removeItem('mcqReloadGraceDeadline');
        localStorage.removeItem('mcqTestCourseCtx');
        localStorage.removeItem('mcqAutoSubmitNotice');
        setLastProgressSync(null);
        networkTimeoutTriggeredRef.current = false;

        // Clear proctoring violation data and photo descriptors from localStorage
        if (user && currentTest) {
            const assessmentId = currentTest.testInfo?.id || currentTest.id || 'unknown';
            const proctorKey = `proctor_violations_${user.email}_${assessmentId}`;
            localStorage.removeItem(proctorKey);
        }
        clearAllProctorCache();

        // Reset proctoring data state
        setProctoringData({
            violationCount: 0,
            audioViolationCount: 0,
            violations: []
        });
    }, [setLastProgressSync, user, currentTest]);

    const startReloadGracePeriod = useCallback(() => {
        // const deadline = timeService.now() + RELOAD_GRACE_DURATION_MS;
        // localStorage.setItem('mcqReloadGraceDeadline', deadline.toString());
    }, []);

    useEffect(() => {
        activeTestSlugRef.current = activeTestSlug;
    }, [activeTestSlug]);

    useEffect(() => {
        // const storedNotice = sessionStorage.getItem(AUTO_SUBMIT_NOTICE_KEY);
        const storedNotice = localStorage.getItem(AUTO_SUBMIT_NOTICE_KEY);
        if (storedNotice) {
            setAutoSubmitNotice(storedNotice);
            // sessionStorage.removeItem(AUTO_SUBMIT_NOTICE_KEY);
            localStorage.removeItem(AUTO_SUBMIT_NOTICE_KEY);
        }
    }, []);

    useEffect(() => {
        // Debounced offline handler: only show popup if still offline after NETWORK_POPUP_DELAY
        const handleOnline = () => {
            // Cancel any pending popup debounce — connection came back in time
            if (networkPopupDebounceRef.current) {
                clearTimeout(networkPopupDebounceRef.current);
                networkPopupDebounceRef.current = null;
            }
            setIsOnline(true);
            // If popup is already showing, the auto-dismiss effect handles closing it
        };

        const handleOffline = () => {
            setIsOnline(false);
            // Start debounce: show popup only after NETWORK_POPUP_DELAY if still offline
            if (networkPopupDebounceRef.current) clearTimeout(networkPopupDebounceRef.current);
            networkPopupDebounceRef.current = setTimeout(() => {
                networkPopupDebounceRef.current = null;
                if (!navigator.onLine) {
                    setShowNetworkPopup(true);
                    setNetworkTimer(30);
                }
            }, NETWORK_POPUP_DELAY);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (networkPopupDebounceRef.current) clearTimeout(networkPopupDebounceRef.current);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (!isEmbedded) {
                try { stopAllMediaAndAI(); } catch (_) {}
            }
        };
    }, [isEmbedded]);

    // Load user data and access control
    useEffect(() => {
        if (isEmbedded) {
            const authData = getAuthData();
            setUser(authData);
            if (testData) {
                setCurrentTest({
                    ...testData,
                    testInfo: testData,
                    questions: testData.questions || []
                });
                setRemainingTime(secTimer);
                setTestDuration(secTimer);
                setIsPasskeyValidated(true);
            }
            return;
        }

        const loadData = async () => {
            try {
                // ── Determine user: guest session or registered auth ────────────
                const guestRaw = localStorage.getItem('guest_session');
                const guestSession = guestRaw ? JSON.parse(guestRaw) : null;
                let authData = null;

                if (guestSession?.isGuest) {
                    // Synthesise a minimal user object that the engines expect
                    const syntheticUser = {
                        isGuest: true,
                        guestId: guestSession.guestId,
                        Email: guestSession.email || `${guestSession.guestId}@guest.seed`,
                        Name: guestSession.name || 'Guest',
                        'Roll Number': guestSession.rollNo ?? '',
                        College: guestSession.college ?? '',
                        Department: guestSession.department ?? '',
                        Year: guestSession.year ?? '',
                        guestSession,
                    };
                    setUser(syntheticUser);
                    // Guest MCQ test data must be pending in mcqTestData
                    const hasPending = localStorage.getItem('mcqTestData');
                    if (!hasPending) { navigate('/guest'); return; }
                    // Guests skip access control & attempt fetching
                    return;
                }

                // Registered user path
                authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
                if (!authData.Email) { navigate('/login'); return; }

                // ── SCENARIO 10 (CROSS-USER DATA ISOLATION) ─────────────────
                // If the cached auth_data belongs to a different student than the
                // current Firebase Auth user, reject the stale session.
                // This prevents Student B from seeing Student A's assessment state
                // when they log in on the same machine.
                const liveFirebaseUid = auth?.currentUser?.uid;
                const cachedUid       = authData.uid;
                if (liveFirebaseUid && cachedUid && liveFirebaseUid !== cachedUid) {
                    console.warn('[MCQPage] Cross-user contamination detected: cached uid=', cachedUid,
                        'live uid=', liveFirebaseUid, '. Discarding stale session.');
                    // Clear the stale MCQ session data for the previous student
                    ['mcqTestData', 'mcqTestStartTime', 'mcqTeststartedAt',
                     'mcqTestDuration', 'mcqActiveTestSlug', 'mcqTestAnswers',
                     'mcqLastProgressSync', 'mcqTestNewLaunch'].forEach(k => localStorage.removeItem(k));
                    navigate('/student/dashboard');
                    return;
                }

                setUser(authData);

                // Redirect to unified student dashboard if no active test session exists
                const hasPending = localStorage.getItem('mcqTestData');
                if (!hasPending) { navigate('/student/dashboard'); return; }

                // Load access control
                const accessControlData = await DataService.getAccessControl();
                setAccessControl(accessControlData);

                // Load available MCQ tests
                await loadAvailableTests(accessControlData, authData);

                // Load user completion map from the canonical completion index.
                // MCQService.fetchUserAttempts() is deprecated (legacy path, never written).
                // Use attemptStatusService.fetchCompletionMap() which reads from
                // users/{uid}/assessmentAttempts — the canonical completion index.
                try {
                    const authData2 = getAuthData();
                    if (authData2) {
                        const completionMap = await AttemptStatusService.fetchCompletionMap(authData2, []);
                        setUserAttempts(completionMap || {});
                    }
                } catch (attemptsError) {
                    console.error('[MCQPage] Error loading completion map:', attemptsError);
                }

                // Try to sync any unsynced results
                try {
                    const syncResult = await MCQService.syncUnsyncedResults();
                    if (syncResult.synced > 0) {
                        console.log(`[MCQPage] Synced ${syncResult.synced} unsynced results`);
                    }
                } catch (syncError) {
                    console.error('[MCQPage] Error syncing unsynced results:', syncError);
                }
            } catch (error) {
                console.error('Error loading data:', error);
                setError('Failed to load MCQ data. Please try again.');
            }
        };

        loadData();
    }, [navigate, isEmbedded, testData, secTimer]);

    // Start countdown timer effect
    useEffect(() => {
        if (startCountdown === null) return;

        if (startCountdown <= 0) {
            // Countdown finished! Start the actual test timer
            const now = timeService.now();
            setStartTime(now);
            localStorage.setItem('mcqTestStartTime', now.toString());
            setStartCountdown(null);
            return;
        }

        const timer = setTimeout(() => {
            setStartCountdown(prev => prev - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [startCountdown]);


    // Keep route in sync with active test slug
    useEffect(() => {
        if (isEmbedded) return;
        if (currentTest && !currentTest.submitted) {
            const slug = currentTest.slug || currentTest.testInfo?.slug || slugify(currentTest.testInfo?.id || currentTest.id || currentTest.name);
            if (slug && testSlug !== slug) {
                navigate(`${MCQ_ROUTE_BASE}/${slug}`, { replace: true });
            }
        } else if (!currentTest) {
            // const storedSlug = sessionStorage.getItem('mcqActiveTestSlug');
            const storedSlug = localStorage.getItem('mcqActiveTestSlug');
            if (!storedSlug && testSlug) {
                navigate(MCQ_ROUTE_BASE, { replace: true });
            }
        }
    }, [currentTest, testSlug, navigate, isEmbedded]);

    // Intercept forward navigation when test is submitted
    useEffect(() => {
        if (currentTest?.submitted) {
            window.history.replaceState(null, '', '/student/dashboard');
            const handleForward = () => {
                window.history.pushState(null, '', '/student/dashboard');
                navigate('/student/dashboard', { replace: true });
            };
            window.addEventListener('popstate', handleForward);
            return () => window.removeEventListener('popstate', handleForward);
        }
    }, [currentTest?.submitted, navigate]);

    // Load available MCQ tests based on access control
    const loadAvailableTests = async (accessControlData, userData) => {
        try {
            if (!accessControlData?.courses?.assessments) {
                console.log('No assessments section found in access control');
                setAvailableTests([]);
                setFilteredTests([]);
                return;
            }

            // Get user's access configuration
            const departmentAccess = accessControlData?.access_control?.colleges?.[userData.College]?.[userData.Year]?.[userData.Department];
            if (!departmentAccess) {
                console.log('No department access found for:', {
                    college: userData.College,
                    year: userData.Year,
                    department: userData.Department
                });
                setAvailableTests([]);
                setFilteredTests([]);
                return;
            }

            // Helper to compile modules from direct course.modules and nested course.subcourses[subId].modules
            const extractAllModules = (course) => {
                if (!course) return {};
                const modules = {};
                if (course.modules) {
                    Object.assign(modules, course.modules);
                }
                if (course.subcourses) {
                    Object.values(course.subcourses).forEach(sub => {
                        if (sub.modules) {
                            Object.assign(modules, sub.modules);
                        }
                    });
                }
                return modules;
            };

            // Get MCQ modules from assessments in access control
            const allModules = extractAllModules(accessControlData?.courses?.assessments);
            const mcqModules = {};
            Object.entries(allModules).forEach(([key, val]) => {
                if (val.type === 'mcq') {
                    mcqModules[key] = val;
                }
            });
            const allowedModuleIds = departmentAccess.allowed_modules || [];

            // Filter tests that user has access to
            const accessibleTests = Object.entries(mcqModules)
                .filter(([key, module]) => {
                    const moduleId = module.id;
                    const isPremiumUser = Boolean(userData?.isPremium);
                    const isPremiumModule = !!module.isPremium;
                    const premiumAccess = !isPremiumModule || isPremiumUser;
                    return allowedModuleIds.includes(moduleId) && premiumAccess;
                })
                .map(([key, module]) => ({
                    key,
                    id: module.id,
                    name: module.name,
                    url: module.url,
                    passkey: module.passkey,
                    schedule: module.schedule,
                    difficulty: module.difficulty || 'Medium',
                    questions: module.questions || 0,
                    duration: module.duration_minutes || 60,
                    slug: module.slug || slugify(module.id || module.name || key),
                    proctored: module.proctored,
                    audioProctored: module.audioProctored,
                    maxViolations: module.maxViolations,
                    maxAudioViolations: module.maxAudioViolations
                }));

            console.log('Loaded accessible MCQ tests:', accessibleTests);
            setAvailableTests(accessibleTests);
            setFilteredTests(accessibleTests);
        } catch (error) {
            console.error('Error loading available tests:', error);
            setError('Failed to load available tests.');
            setAvailableTests([]);
            setFilteredTests([]);
        }
    };

    // Filter tests based on search term, difficulty, and status
    useEffect(() => {
        let filtered = [...availableTests];

        // 1. Search term filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(test =>
                test.name.toLowerCase().includes(term) ||
                (test.difficulty ?? '').toLowerCase().includes(term)
            );
        }

        // 2. Difficulty filter
        if (filterDifficulty !== 'All') {
            filtered = filtered.filter(test =>
                (test.difficulty ?? '').toLowerCase() === filterDifficulty.toLowerCase()
            );
        }

        // 3. Status filter
        if (filterStatus !== 'All') {
            filtered = filtered.filter(test => {
                const isCompleted = userAttempts[test.id]?.completed === true;
                if (filterStatus === 'Completed') {
                    return isCompleted;
                } else if (filterStatus === 'Available') {
                    return !isCompleted;
                }
                return true;
            });
        }

        setFilteredTests(filtered);
    }, [searchTerm, filterDifficulty, filterStatus, availableTests, userAttempts]);

    const autoSubmitStoredAttempt = useCallback(async ({ reason = 'grace-expired', noticeMessage } = {}) => {
        try {
            if (!user) return false;
            // const storedTestData = sessionStorage.getItem('mcqTestData');
            // const storedStartTime = sessionStorage.getItem('mcqTestStartTime');
            const storedTestData = localStorage.getItem('mcqTestData');
            const storedStartTime = localStorage.getItem('mcqTestStartTime');
            if (!storedTestData || !storedStartTime) {
                // sessionStorage.removeItem('mcqActiveTestSlug');
                localStorage.removeItem('mcqActiveTestSlug');
                return false;
            }

            const { test, testData } = JSON.parse(storedTestData);
            const questionSet = testData?.questions || [];
            if (questionSet.length === 0) {
                clearTestSessionStorage();
                // sessionStorage.removeItem('mcqActiveTestSlug');
                localStorage.removeItem('mcqActiveTestSlug');
                return false;
            }

            // const storedAnswersRaw = sessionStorage.getItem('mcqTestAnswers');
            const storedAnswersRaw = localStorage.getItem('mcqTestAnswers');
            // BUG FIXED (P0 grading drift): this recovery path had its own copy of
            // the scoring loop, reading the raw localStorage blob. A corrupt blob
            // threw out of the whole recovery, and any change to the main grader
            // silently skipped this path. Both now go through gradeMcqAttempt().
            const restoredAnswers = readJSON('mcqTestAnswers', {}) || {};
            const recoveryGrade = gradeMcqAttempt({ questions: questionSet, answers: restoredAnswers });
            const correctAnswers = recoveryGrade.correctAnswers;
            const totalQuestions = recoveryGrade.totalQuestions;
            const percentage = recoveryGrade.percentage;
            const startTimeMs = parseInt(storedStartTime, 10);
            // const durationSeconds = parseInt(sessionStorage.getItem('mcqTestDuration') || '0', 10);
            const durationSeconds = parseInt(localStorage.getItem('mcqTestDuration') || '0', 10);
            const elapsedSeconds = Math.round((timeService.now() - startTimeMs) / 1000);
            const timeTaken = durationSeconds > 0 ? Math.min(durationSeconds, elapsedSeconds) : elapsedSeconds;
            // const startedAt = sessionStorage.getItem('mcqTeststartedAt') || new Date(startTimeMs).toISOString();
            const startedAt = localStorage.getItem('mcqTeststartedAt') || new Date(startTimeMs).toISOString();
            const assessmentId = test?.id || testData?.id || 'unknown';
            const testName = testData?.name || test?.name || 'Unknown Test';

            // P1-MCQ: derive questionsDetails from gradeMcqAttempt() output.
            // This removes the last raw `selectedAnswer === q.correctAnswer`
            // comparison, leaving a single scoring authority throughout MCQPage.
            const questionsDetails = (recoveryGrade.questionsDetails || questionSet.map((q, idx) => {
                const selectedIdx = restoredAnswers[idx];
                const selectedAnswer = selectedIdx !== undefined ? (q.options?.[selectedIdx] ?? '') : '';
                return {
                    questionNumber: idx + 1,
                    questionText: q.question || (q.text  ?? ''),
                    difficulty: (q.difficulty || testData?.difficulty || test?.difficulty || 'medium').toLowerCase(),
                    topic: q.topic || q.tag || (q.tags ? (Array.isArray(q.tags) ? q.tags[0] : q.tags) : 'General'),
                    tags: Array.isArray(q.tags) ? q.tags : (q.tags ? [q.tags] : (q.topic ? [q.topic] : ['General'])),
                    isCorrect: recoveryGrade.questionResults?.[idx]?.isCorrect ?? false,
                    selectedAnswer,
                    correctAnswer: '',  // never sent — scoring is server-authoritative
                    timeSpent: 0
                };
            }));

            const resultData = {
                email: user.email,
                college: user.college,
                year: user.year,
                department: user.department,
                rollNumber: user.rollNumber ?? '',
                name: user.name ?? '',
                assessmentId,
                testName,
                score: correctAnswers,
                totalQuestions,
                correctAnswers,
                incorrectAnswers: totalQuestions - correctAnswers,
                maxScore: totalQuestions,
                percentage,
                timeTaken,
                timeStarted: startedAt,
                startedAt: startedAt,
                timeEnded: timeService.getNow().toISOString(),
                timeEndedISO: timeService.getNow().toISOString(),
                submittedAt: timeService.getNow().toISOString(),
                answers: restoredAnswers,
                questions: questionsDetails,
                autoSubmitted: true,
                autoSubmitReason: getAutoSubmitReasonLabel(reason),
                // Include proctoring data
                violationCount: proctoringData.violationCount || 0,
                totalNoFace: proctoringData.violations?.filter(v => v.type === 'no_face').length || 0,
                totalMultipleFaces: proctoringData.violations?.filter(v => v.type === 'multiple_faces').length || 0,
                violations: proctoringData.violations || []
            };

            await MCQService.submitMCQResult(resultData);
            clearTestSessionStorage();
            setActiveTestSlug(null);
            // sessionStorage.removeItem('mcqActiveTestSlug');
            // sessionStorage.removeItem('mcqReloadGraceDeadline');
            localStorage.removeItem('mcqActiveTestSlug');
            localStorage.removeItem('mcqReloadGraceDeadline');
            const message = noticeMessage || getAutoSubmitReasonLabel(reason);
            setAutoSubmitMessage(message);
            setQuestionIndex(0);
            setAnswers({});
            setBookmarkedQuestions([]);
            setStartTime(null);
            setElapsedTime(0);
            setRemainingTime(0);
            setTestDuration(0);
            setSelectedTest(null);
            setIsPasskeyValidated(false);
            setQuestionStartTimes({});
            navigate(MCQ_ROUTE_BASE, { replace: true });
            return true;
        } catch (error) {
            console.error('[MCQPage] autoSubmitStoredAttempt error:', error);
            return false;
        }
    }, [user, clearTestSessionStorage, navigate, setAutoSubmitMessage]);


    // Check if test has officially ended
    /**
     * Check if the test has ended based on schedule
     * @param {object} schedule - Test schedule object
     * @returns {boolean}
     */
    const isTestEnded = (schedule) => {
        if (!schedule || !schedule.endDate || !schedule.endTime) return false;
        try {
            const [endHours, endMinutes] = schedule.endTime.split(':').map(Number);
            const endDate = new Date(schedule.endDate);
            endDate.setHours(endHours, endMinutes, 0, 0);
            return timeService.getNow() >= endDate;
        } catch (e) {
            console.error('[MCQPage] Error checking test end time:', e);
            return false;
        }
    };

    // Check schedule access
    const checkScheduleAccess = (test) => {
        if (!test?.schedule) {
            return { allowed: true, reason: 'No schedule restrictions' };
        }

        const schedule = test.schedule;
        const now = timeService.getNow();
        const startDate = new Date(schedule.startDate + 'T' + schedule.startTime);
        const endDate = new Date(schedule.endDate + 'T' + schedule.endTime);

        if (now < startDate) {
            return {
                allowed: false,
                reason: `Test starts on ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()}`
            };
        }

        if (now > endDate) {
            return {
                allowed: false,
                reason: `Test ended on ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString()}`
            };
        }

        return { allowed: true, reason: 'Test is currently available' };
    };

    // Validate passkey
    const validatePasskey = async () => {
        if (!passkey.trim()) {
            setPasskeyError('Please enter a passkey');
            return;
        }

        if (!selectedTest) {
            setPasskeyError('Please select a test first');
            return;
        }

        setIsValidatingPasskey(true);
        setPasskeyError('');
        setError(null);

        try {
            const expectedPasskey = selectedTest.passkey;

            if (!expectedPasskey) {
                setPasskeyError('No passkey required for this test');
                setIsValidatingPasskey(false);
                return;
            }

            if (passkey.trim() === expectedPasskey) {
                setIsPasskeyValidated(true);
                setPasskeyError('');
                setError(null);
                console.log('Passkey validated successfully');
                // Show instructions screen instead of starting test directly (only if proctoring is enabled)
                setShowPasskeyModal(false);
                const isTestProctored = selectedTest && (
                    selectedTest.proctored === true ||
                    selectedTest.proctored === 1 ||
                    selectedTest.proctored === "1" ||
                    selectedTest.proctored === "true"
                );
                if (ENABLE_PROCTORING && isTestProctored) {
                    setShowInstructions(true);
                } else {
                    // Skip instructions and start test directly when proctoring is disabled
                    if (selectedTest) {
                        await startTest(selectedTest);
                    }
                }
            } else {
                setPasskeyError('Incorrect passkey');
                setIsPasskeyValidated(false);
                // Clear the passkey input on failed validation
                setPasskey('');
                // Focus back on the input field
                setTimeout(() => {
                    if (passkeyInputRef.current) {
                        passkeyInputRef.current.focus();
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Error validating passkey:', error);
            setPasskeyError('Error validating passkey. Please try again.');
            setIsPasskeyValidated(false);
        } finally {
            setIsValidatingPasskey(false);
        }
    };

    // Handle continue from instructions - camera already validated in instructions
    const handleContinueFromInstructions = async () => {
        setShowInstructions(false);

        // Camera is already validated in ProctoringInstructions component
        // Just start the test
        if (selectedTest) {
            await startTest(selectedTest);
        }
    };

    // Handle cancel from instructions
    const handleCancelFromInstructions = () => {
        setShowInstructions(false);
        setIsPasskeyValidated(false);
        setPasskey('');
        setSelectedTest(null);
        clearAllProctorCache();
    };

    // Handle test selection
    const handleTestSelect = async (test) => {
        setSelectedTest(test);
        setError(null);
        setIsPasskeyValidated(false);
        setPasskey('');

        // Check schedule access
        const scheduleAccess = checkScheduleAccess(test);
        if (!scheduleAccess.allowed) {
            setError(`Schedule restriction: ${scheduleAccess.reason}`);
            return;
        }

        // Check if passkey is required
        if (test.passkey) {
            setShowPasskeyModal(true);
            // Focus the input when modal opens
            setTimeout(() => {
                if (passkeyInputRef.current) {
                    passkeyInputRef.current.focus();
                }
            }, 100);
            return;
        }

        // If no passkey required, start test directly
        await startTest(test);
    };

    // Start test after passkey validation
    const startTest = async (test) => {
        setShowVerifyingPopup(true);
        setError(null);
        setSubmissionStatus(null);
        setTestAlreadyCompleted(false);

        try {
            // Check network connectivity first
            if (!navigator.onLine) {
                setShowVerifyingPopup(false);
                setShowNetworkPopup(true);
                setNetworkTimer(30);
                setError('No internet connection. Please connect to the internet to start the test.');
                return;
            }

            // Check if test has already been completed
            const assessmentId = test.id || 'unknown';
            let existingAttempt;

            try {
                existingAttempt = await MCQService.checkExistingAttempt(
                    user.email,
                    assessmentId,
                    user.college,
                    user.year,
                    user.department
                );
            } catch (checkError) {
                // If offline or network error, show network popup
                if (checkError.code === 'unavailable' || checkError.message?.includes('offline') || !navigator.onLine) {
                    setShowVerifyingPopup(false);
                    setShowNetworkPopup(true);
                    setNetworkTimer(30);
                    setError('Network connection required. Please check your internet connection.');
                    return;
                }
                // For other errors, log and continue (Firestore will catch duplicates on submit)
                console.warn('[MCQPage] Error checking existing attempt, continuing:', checkError);
                existingAttempt = { exists: false, data: null, completed: false };
            }

            if (existingAttempt.exists && existingAttempt.completed) {
                setShowVerifyingPopup(false);
                setTestAlreadyCompleted(true);
                setCompletedTestInfo({ test, existingAttempt: existingAttempt.data });
                return;
            }
            
            if (existingAttempt.error && !navigator.onLine) {
                setShowVerifyingPopup(false);
                setShowNetworkPopup(true);
                setNetworkTimer(30);
                return;
            }

            // Fetch test data from JSON
            const testData = await fetchTestData(test.url);

            // Use data from fetched JSON, with fallback to access_control data
            const derivedSlug = test.slug || slugify(test.id || test.name || test.key || 'mcq-test');
            const enrichedTestInfo = { ...test, slug: derivedSlug };
            const testInfo = {
                ...testData,
                name: testData.name || test.name,
                difficulty: testData.difficulty || test.difficulty,
                duration: testData.duration || test.duration_minutes,
                totalQuestions: testData.totalQuestions || testData.questions?.length || test.questions,
                questions: testData.questions || [],
                testInfo: enrichedTestInfo,
                slug: derivedSlug
            };

            setCurrentTest(testInfo);
            setQuestionIndex(0);
            setAnswers({});
            const now = timeService.now();
            const nowISO = timeService.getNow().toISOString();
            setStartCountdown(10);
            setStartTime(now + 10000);
            setTeststartedAt(nowISO);
            setElapsedTime(0);

            // Calculate test duration in seconds
            const durationMinutes = testData.duration || test.duration_minutes || 60;
            const durationSeconds = durationMinutes * 60;
            setTestDuration(durationSeconds);
            setRemainingTime(durationSeconds);

            try {
                await MCQService.createInitialAttempt(user, testInfo);
                console.log('[MCQPage] Initial attempt created in Firestore');
            } catch (initError) {
                console.error('[MCQPage] Error creating initial attempt:', initError);
                setShowVerifyingPopup(false);
                // If it's a duplicate or already completed, BLOCK entry
                if (initError.message.includes('already completed') || initError.message.includes('DUPLICATE_SUBMISSION')) {
                    setTestAlreadyCompleted(true);
                    // Try to get existing data for the popup
                    const check = await MCQService.checkExistingAttempt(user.email, test.id, user.college, user.year, user.department);
                    setCompletedTestInfo({ test, existingAttempt: check.data });
                    return;
                }
                
                // For other critical errors, block and show error
                setError(`Failed to initialize test: ${initError.message}. Please try again.`);
                return;
            }

            // Store test start info in localStorage for reload handling
            // sessionStorage.setItem('mcqTestStartTime', now.toString());
            // sessionStorage.setItem('mcqTeststartedAt', nowISO);
            // sessionStorage.setItem('mcqTestDuration', durationSeconds.toString());
            // sessionStorage.setItem('mcqTestData', JSON.stringify({
            //     test: enrichedTestInfo,
            //     testData: testData
            // }));
            localStorage.setItem('mcqTestStartTime', now.toString());
            localStorage.setItem('mcqTeststartedAt', nowISO);
            localStorage.setItem('mcqTestDuration', durationSeconds.toString());
            localStorage.setItem('mcqTestData', JSON.stringify({
                test: enrichedTestInfo,
                testData: testData
            }));

            setActiveTestSlug(derivedSlug);
            // sessionStorage.setItem('mcqActiveTestSlug', derivedSlug);
            localStorage.setItem('mcqActiveTestSlug', derivedSlug);
            navigate(`${MCQ_ROUTE_BASE}/${derivedSlug}`, { replace: true });

            setShowPasskeyModal(false);
            setShowVerifyingPopup(false);
        } catch (error) {
            console.error('Error loading test:', error);
            setShowVerifyingPopup(false);
            setError(error.message || 'Error loading test. Please check your connection and try again.');
        }
    };

    // Fetch test data from JSON
    const fetchTestData = async (url) => {
        try {
            // Extract test path from URL or use it directly
            // Assuming URL format: /mcqs/test-name.json or full URL
            let testPath = url;

            // Normalize path to plural mcqs/testBank if referencing mcq/testbank
            if (testPath && typeof testPath === 'string') {
                if (testPath.includes('mcq/testbank/')) {
                    testPath = testPath.replace('mcq/testbank/', 'mcqs/testBank/');
                } else if (testPath.includes('mcq/testbank')) {
                    testPath = testPath.replace('mcq/testbank', 'mcqs/testBank');
                } else if (testPath.startsWith('/mcq/')) {
                    testPath = '/mcqs/' + testPath.substring(5);
                } else if (testPath.startsWith('mcq/')) {
                    testPath = 'mcqs/' + testPath.substring(4);
                }
            }

            if (url.includes('http')) {
                try {
                    const response = await fetch(url);
                    if (response.ok) return await response.json();
                    throw new Error('Remote fetch failed');
                } catch (e) {
                    console.log('[MCQPage] Full URL fetch failed, attempting local fallback:', url);
                    let localFallbackUrl = null;
                    if (url.includes('/seed-contents/main/')) {
                        const relPath = url.split('/seed-contents/main/')[1];
                        localFallbackUrl = `/seed-contents/${relPath}`;
                    } else if (url.includes('/SEEDDB/main/')) {
                        const relPath = url.split('/SEEDDB/main/')[1];
                        localFallbackUrl = `/SEEDDB/${relPath}`;
                    } else if (url.includes('/contents/')) {
                        const relPath = url.split('/contents/')[1];
                        if (url.includes('seed-contents')) {
                            localFallbackUrl = `/seed-contents/${relPath}`;
                        } else if (url.includes('SEEDDB')) {
                            localFallbackUrl = `/SEEDDB/${relPath}`;
                        }
                    }
                    if (localFallbackUrl) {
                        try {
                            const response = await fetch(localFallbackUrl);
                            if (response.ok) return await response.json();
                        } catch (localErr) {
                            console.error('[MCQPage] Local fallback fetch failed:', localErr);
                        }
                    }
                    throw e;
                }
            }

            // Try local first
            const localUrl = `${LOCAL_BASE_URL}${testPath.startsWith('/') ? '' : '/'}${testPath}`;
            try {
                const localResponse = await fetch(localUrl);
                if (localResponse.ok) {
                    return await localResponse.json();
                }
            } catch (localError) {
                console.log('Local fetch failed, trying GitHub');
            }

            // Authenticated fallback via the server-side content proxy.
            // SECURITY: no GitHub token is present in the client bundle any more.
            try {
                const proxied = await fetchContentJSON(testPath, { localFirst: false });
                if (proxied !== undefined) return proxied;
            } catch (_) {}

            // Try raw GitHub URL
            const rawUrl = `${GITHUB_BASE_URL}${testPath.startsWith('/') ? '' : '/'}${testPath}`;
            const rawResponse = await fetch(rawUrl);
            if (!rawResponse.ok) {
                throw new Error(`Failed to fetch test data: ${rawResponse.status}`);
            }

            return await rawResponse.json();
        } catch (error) {
            console.error('All fetch attempts failed:', error);
            throw error;
        }
    };

    const questionEnterTimeRef = useRef(null);

    useEffect(() => {
        questionEnterTimeRef.current = timeService.now();
    }, [questionIndex]);

    // Handle option selection
    const handleSelectOption = (option) => {
        if (isEmbedded && lockedQuestions.includes(questionIndex)) {
            return;
        }

        // Calculate time spent since entering or last selection on this question
        const now = timeService.now();
        const elapsedMs = now - (questionEnterTimeRef.current || now);
        const elapsedSecs = Math.max(0, Math.round(elapsedMs / 1000));

        setTimeSpentPerQ(prev => ({
            ...prev,
            [questionIndex]: (prev[questionIndex] || 0) + elapsedSecs
        }));

        // Reset enter time to now for subsequent selections
        questionEnterTimeRef.current = now;

        setAnswers({
            ...answers,
            [questionIndex]: option
        });
    };

    // Handle navigation
    const handleNavigateQuestion = (direction) => {
        if (isEmbedded && (settings.forwardOnly || settings.questionTimer > 0)) {
            return;
        }
        if (direction === 'prev' && questionIndex > 0) {
            setQuestionIndex(questionIndex - 1);
        } else if (direction === 'next' && questionIndex < currentTest?.questions?.length - 1) {
            setQuestionIndex(questionIndex + 1);
        }
    };

    // Track question start times
    useEffect(() => {
        if (currentTest && questionIndex !== undefined) {
            setQuestionStartTimes(prev => ({
                ...prev,
                [questionIndex]: prev[questionIndex] || timeService.now()
            }));
        }
    }, [questionIndex, currentTest]);

    // Toggle bookmark
    const toggleBookmark = (questionIndex) => {
        setBookmarkedQuestions(prev => {
            if (prev.includes(questionIndex)) {
                return prev.filter(q => q !== questionIndex);
            }
            return [...prev, questionIndex];
        });
    };

    // Get time taken per question
    const getTimeTaken = (questionIndex) => {
        const startTime = questionStartTimes[questionIndex];
        if (!startTime) return 0;
        return Math.round((timeService.now() - startTime) / 1000);
    };

    /**
     * Single source of truth for this attempt's grade.
     *
     * BUG FIXED (P0 grading drift): manual submit, timer auto-submit, embedded
     * section submit and reload recovery each rebuilt the correct-answer count
     * inline. They disagreed on how to read the answer map and on how to treat
     * per-question marks, so the score stored in Firestore depended on which
     * path happened to fire. Everything now derives from gradeMcqAttempt().
     */
    const gradeAttempt = useCallback(() => gradeMcqAttempt({
        questions: currentTest?.questions,
        answers,
        timeSpentPerQuestion: timeSpentPerQ,
        meta: { difficulty: currentTest?.testInfo?.difficulty, topic: currentTest?.testInfo?.topic }
    }), [currentTest, answers, timeSpentPerQ]);

    // Kept for call-site compatibility: returns the count of correct answers.
    const calculateScore = useCallback(() => gradeAttempt().correctAnswers, [gradeAttempt]);

    const syncProgress = useCallback(async (reason = 'interval') => {
        if (!currentTest || currentTest.submitted || !user) return;
        if (!navigator.onLine) {
            console.warn(`[MCQPage] Skipping progress sync (${reason}) - offline`);
            return;
        }
        if (progressSyncInFlight.current) {
            return;
        }

        progressSyncInFlight.current = true;
        try {
            const correctAnswers = calculateScore();
            const totalQuestions = currentTest.questions.length;
            const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
            const elapsedSeconds = startTime ? Math.round((timeService.now() - startTime) / 1000) : 0;

            // BUG FIX (P0): uid MUST be present so saveProgressToFirestore
            // can call getCanonicalUid() and build the correct Firestore path.
            // Without uid, it falls back to auth.currentUser.uid directly, but
            // passing it explicitly also enables logging and future assertions.
            const uid = auth?.currentUser?.uid || (user?.uid  ?? '');

            const progressPayload = {
                uid,                          // ← Required for canonical path construction
                email: user.email,
                college: user.college,
                year: user.year,
                department: user.department,
                tenantId: user.tenantId ?? '',
                cohortId: user.cohortId ?? '',
                rollNumber: user.rollNumber ?? '',
                name: user.name ?? '',
                assessmentId: currentTest.testInfo?.id || currentTest.id || 'unknown',
                assessmentTitle: currentTest.name || currentTest.testInfo?.name || 'Unknown Test',
                score: correctAnswers,
                totalQuestions,
                correctAnswers,
                incorrectAnswers: totalQuestions - correctAnswers,
                percentage,
                timeTaken: elapsedSeconds,
                timeTakenFormatted: MCQService.formatTime ? MCQService.formatTime(elapsedSeconds) : `${elapsedSeconds}s`,
                timeStarted: teststartedAt || timeService.getNow().toISOString(),
                startedAt: teststartedAt || timeService.getNow().toISOString(),
                timeEnded: '',
                timeEndedISO: '',
                submittedAt: '',
                answers,
                autoSubmitted: false,
                timestamp: timeService.getNow().toISOString(),
                reason
            };

            await MCQService.syncProgress(progressPayload);
            const lastSyncISO = timeService.getNow().toISOString();
            setLastProgressSync(lastSyncISO);
            // sessionStorage.setItem('mcqLastProgressSync', lastSyncISO);
            localStorage.setItem('mcqLastProgressSync', lastSyncISO);
        } catch (error) {
            console.error('[MCQPage] Progress sync failed:', error);
            if (error.message?.toLowerCase().includes('network') || !navigator.onLine) {
                setIsOnline(false);
                // Debounced: only show popup if still offline after delay
                if (!networkPopupDebounceRef.current) {
                    networkPopupDebounceRef.current = setTimeout(() => {
                        networkPopupDebounceRef.current = null;
                        if (!navigator.onLine) {
                            setShowNetworkPopup(true);
                            setNetworkTimer(30);
                        }
                    }, NETWORK_POPUP_DELAY);
                }
            }
        } finally {
            progressSyncInFlight.current = false;
        }
    }, [currentTest, calculateScore, user, startTime, teststartedAt, answers]);

    const restoreTestState = useCallback(() => {
        try {
            // const storedStartTime = sessionStorage.getItem('mcqTestStartTime');
            // const storedDuration = sessionStorage.getItem('mcqTestDuration');
            // const storedTestData = sessionStorage.getItem('mcqTestData');
            const storedStartTime = localStorage.getItem('mcqTestStartTime');
            const storedDuration = localStorage.getItem('mcqTestDuration');
            const storedTestData = localStorage.getItem('mcqTestData');

            if (!storedStartTime || !storedDuration || !storedTestData) {
                return false;
            }

            const startTimeMs = parseInt(storedStartTime, 10);
            const durationSec = parseInt(storedDuration, 10);
            const { test, testData } = JSON.parse(storedTestData);

            const testId = test?.id || testData?.id;
            if (testId && localStorage.getItem(`mcqCompleted_${testId}`) === 'true') {
                navigate('/student/dashboard', { replace: true });
                return false;
            }

            const now = timeService.now();
            const storedLastActive = localStorage.getItem('mcqLastActiveTime');
            const lastActiveMs = storedLastActive ? parseInt(storedLastActive, 10) : startTimeMs;
            const elapsedOfflineSec = Math.floor((now - lastActiveMs) / 1000);

            if (elapsedOfflineSec > 300) {
                autoSubmitStoredAttempt({
                    reason: 'exit_timeout',
                    noticeMessage: 'Your MCQ attempt was auto-submitted because your offline exit window exceeded 5 minutes.'
                });
                return false;
            }

            const elapsed = Math.floor((now - startTimeMs) / 1000);
            const remaining = Math.max(0, durationSec - elapsed);

            if (remaining <= 0) {
                autoSubmitStoredAttempt({
                    reason: 'timer',
                    noticeMessage: 'Your MCQ attempt was auto-submitted because the allotted time elapsed.'
                });
                return false;
            }

            // const storedAnswers = sessionStorage.getItem('mcqTestAnswers');
            const storedAnswers = localStorage.getItem('mcqTestAnswers');
            const restoredAnswers = storedAnswers ? JSON.parse(storedAnswers) : {};
            const derivedSlug = test?.slug || slugify(test?.id || test?.name || 'mcq-test');

            const restoredTest = {
                ...testData,
                name: testData.name || test?.name,
                difficulty: testData.difficulty || test?.difficulty,
                duration: testData.duration || test?.duration_minutes,
                totalQuestions: testData.totalQuestions || testData.questions?.length || test?.questions,
                questions: testData.questions || [],
                testInfo: test,
                slug: derivedSlug
            };

            setCurrentTest(restoredTest);
            setQuestionIndex(0);
            setAnswers(restoredAnswers);
            setStartTime(startTimeMs);
            setElapsedTime(elapsed);
            setRemainingTime(remaining);
            setTestDuration(durationSec);
            setSelectedTest(test);
            // const storedstartedAt = sessionStorage.getItem('mcqTeststartedAt');
            const storedstartedAt = localStorage.getItem('mcqTeststartedAt');
            if (storedstartedAt) {
                setTeststartedAt(storedstartedAt);
            }
            setActiveTestSlug(derivedSlug);
            // sessionStorage.setItem('mcqActiveTestSlug', derivedSlug);
            // sessionStorage.removeItem('mcqReloadGraceDeadline');
            localStorage.setItem('mcqActiveTestSlug', derivedSlug);
            localStorage.removeItem('mcqReloadGraceDeadline');
            networkTimeoutTriggeredRef.current = false;
            setShowNetworkPopup(false);
            setNetworkTimer(30);
            syncProgress('restore');
            return true;
        } catch (error) {
            console.error('Error restoring test state:', error);
            return false;
        }
    }, [autoSubmitStoredAttempt, syncProgress]);

    useEffect(() => {
        if (isEmbedded) return;
        const hasPending = localStorage.getItem('mcqTestData');
        if (!currentTest && user && hasPending) {
            const isNewLaunch = localStorage.getItem("mcqTestNewLaunch") === "true";
            if (isNewLaunch) {
                localStorage.removeItem("mcqTestNewLaunch");
                const now = timeService.now();
                localStorage.setItem("mcqTestStartTime", (now + 10000).toString());
                setStartCountdown(10);
            }
            restoreTestState();
        }
    }, [user, currentTest, autoSubmitStoredAttempt, restoreTestState, isEmbedded]);

    // Handle test submission
    const handleSubmit = () => {
        if (isEmbedded) {
            const correctAnswers = calculateScore();
            const totalQuestions = currentTest.questions.length;
            const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
            const violationStats = (proctoringData.violations || []).reduce((acc, v) => {
                if (v.type === 'no_face') acc.totalNoFace++;
                else if (v.type === 'multiple_faces') acc.totalMultipleFaces++;
                return acc;
            }, { totalNoFace: 0, totalMultipleFaces: 0 });
            if (onSectionSubmitRef.current) {
                onSectionSubmitRef.current({
                    answers: answers,
                    timeSpentPerQ: timeSpentPerQ,
                    score: correctAnswers,
                    totalQuestions: totalQuestions,
                    percentage: percentage,
                    violationCount: proctoringData.violationCount || 0,
                    totalNoFace: violationStats.totalNoFace,
                    totalMultipleFaces: violationStats.totalMultipleFaces,
                    violations: proctoringData.violations || []
                });
            }
            return;
        }
        handleFinalSubmit();
    };

    // Final submission handler
    const handleFinalSubmit = async () => {
        // Synchronous claim: beats the async `isSubmitting` state update and the
        // concurrent timer auto-submit.
        if (!submitGuard.begin('manual')) {
            console.warn('[MCQPage] Submit already in progress, ignoring duplicate manual submit');
            toast.info('Submission is already being processed...');
            return;
        }
        
        if (!currentTest || !user) {
            setError('Missing test or user data. Cannot submit.');
            toast.error('Missing test or user data. Cannot submit.');
            submitGuard.fail();
            return;
        }

        toast.loading('Submitting your assessment...', { id: 'mcq-submit' });

        // Make sure throttled progress writes have landed before we grade.
        flushThrottledWrites();

        // Turn off camera immediately when user confirms final submit
        stopGlobalCameraStream();

        setIsSubmitting(true);
        setShowSubmittingPopup(true);
        setError(null);
        setSubmissionStatus(null);
        setSubmissionStep('validating');

        try {
            // ── Detect guest vs registered user once — used throughout this function ──
            const guestSession = user?.isGuest ? user.guestSession : null;
            if (guestSession) {
                // For guests, skip markTestAsSubmitting (requires auth UID)
                // Proceed straight to grading
            } else {
                // New: Mark as completed/submitting in DB immediately to prevent refresh reattempts
                await MCQService.markTestAsSubmitting(
                    user.email,
                    currentTest.testInfo?.id || currentTest.id || 'unknown',
                    user.college,
                    user.year,
                    user.department
                );
            }

            // Step 1: Validating answers
            await new Promise(resolve => setTimeout(resolve, 1000));

            setSubmissionStep('generating');
            const correctAnswers = calculateScore();
            const timeTaken = Math.round((timeService.now() - startTime) / 1000);
            const totalQuestions = currentTest.questions.length;
            const incorrectAnswers = totalQuestions - correctAnswers;
            const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

            // Step 2: Generating marks (simulate processing)
            await new Promise(resolve => setTimeout(resolve, 800));

            // Prepare result data with proctoring information from local cache + state
            const assessmentId = currentTest.testInfo?.id || currentTest.id || 'unknown';
            const vInfo = getViolations(assessmentId, user?.email);
            const allViolations = (vInfo.violations && vInfo.violations.length > 0)
                ? vInfo.violations
                : (proctoringData.violations || []);
            const finalViolationCount = Math.max(vInfo.violationCount || 0, proctoringData.violationCount || 0, allViolations.length);

            const violationStats = allViolations.reduce((acc, violation) => {
                if (violation.type === 'no_face') acc.totalNoFace++;
                else if (violation.type === 'multiple_faces') acc.totalMultipleFaces++;
                return acc;
            }, { totalNoFace: 0, totalMultipleFaces: 0 });

            const questionsDetails = (currentTest.questions || []).map((q, idx) => {
                const selectedIdx = answers[idx];
                const selectedAnswer = selectedIdx !== undefined ? (q.options?.[selectedIdx] || '') : '';
                const isCorrect = selectedAnswer === q.correctAnswer;
                const timeSpent = timeSpentPerQ[idx] || 0;
                return {
                    questionNumber: idx + 1,
                    questionText: q.question || q.text || '',
                    difficulty: (q.difficulty || currentTest.difficulty || 'medium').toLowerCase(),
                    topic: q.topic || q.tag || (Array.isArray(q.tags) ? q.tags[0] : (q.tags || 'General')),
                    tags: Array.isArray(q.tags) ? q.tags : (q.tags ? [q.tags] : [q.topic || 'General']),
                    isCorrect,
                    selectedAnswer,
                    correctAnswer: q.correctAnswer || '',
                    timeSpent
                };
            });

            const targetAssessmentId = currentTest.id || currentTest.testInfo?.id;
            const tenantId = user?.tenantId;
            if (!tenantId) {
                throw new Error('[MCQPage] Missing user.tenantId for result submission');
            }
            const userId = auth?.currentUser?.uid || user?.uid;
            if (!userId) {
                throw new Error('[MCQPage] Missing userId for result submission');
            }

            const resultData = buildResultDoc({
                user: {
                    uid: userId,
                    email: user.email || '',
                    name: user.name || '',
                    rollNumber: user.rollNumber || '',
                    tenantId: tenantId,
                    college: user.college || '',
                    department: user.department || '',
                    year: user.year || '',
                    cohortId: user.cohortId || '',
                },
                assessment: {
                    id: targetAssessmentId,
                    title: currentTest.name || currentTest.testInfo?.name || 'MCQ Assessment',
                    assessmentType: 'mcq',
                },
                scores: {
                    totalScore: correctAnswers,
                    maxScore: totalQuestions,
                    percentage: percentage,
                    passed: totalQuestions > 0 && (correctAnswers / totalQuestions >= 0.5),
                },
                timing: {
                    startedAt: teststartedAt || timeService.getNow().toISOString(),
                    timeTakenSeconds: timeTaken,
                },
                submission: {
                    autoSubmitted: Boolean(currentTest.autoSubmitted),
                    submissionReason: currentTest.autoSubmitReason || 'manual',
                },
                questions: questionsDetails,
                proctoring: {
                    violationCount: finalViolationCount,
                    totalNoFace: violationStats.totalNoFace || 0,
                    totalMultipleFaces: violationStats.totalMultipleFaces || 0,
                    violations: allViolations,
                },
            });

            console.log('[MCQPage] Submitting result:', resultData);

            // ── Guest path — write to guests subcollection ───────────────────────
            if (guestSession) {
                const testIdForGuest = currentTest.testInfo?.id || currentTest.id || 'unknown';
                await MCQService.writeGuestResult(resultData, testIdForGuest, guestSession);
                // Lock re-attempts (writeGuestResult sets localStorage, but double-stamp here)
                try {
                    localStorage.setItem(`guest_done_${testIdForGuest}_${guestSession.guestId}`, 'true');
                    localStorage.removeItem('guest_session');
                } catch (_) { /* non-fatal */ }
                setSubmissionStep('submitted');
                setCurrentTest(prev => ({ ...prev, submitted: true }));
                setShowConfirmSubmit(false);
                setShowReviewAnswers(false);
                setSubmissionStatus('success');
                submitGuard.complete();
                clearTestSessionStorage();
                setActiveTestSlug(null);
                stopGlobalCameraStream();
                toast.success('Assessment submitted successfully!', { id: 'mcq-submit' });
                return;
            }

            // Submit to both Firestore and Google Sheets
            const submissionResult = await MCQService.submitMCQResult(resultData);

            if (submissionResult.success) {
                // Step 3: Submitted successfully
                setSubmissionStep('submitted');

                // Update UI
                setCurrentTest(prev => ({
                    ...prev,
                    score: percentage,
                    correctAnswers,
                    totalQuestions,
                    timeTaken,
                    submitted: true
                }));

                setShowConfirmSubmit(false);
                setShowReviewAnswers(false);
                setSubmissionStatus('success');

                submitGuard.complete();
                const canonicalMainId = isEmbedded
                    ? (testData?.assessmentId || testData?.id)
                    : (currentTest?.assessmentId || currentTest?.testInfo?.id || currentTest?.id);
                await markAssessmentCompleted(user, canonicalMainId);

                // ── Course progress tracking ──
                try {
                    const courseCtx = JSON.parse(localStorage.getItem('mcqTestCourseCtx') || '{}');
                    if (courseCtx.courseId && courseCtx.seriesId) {
                        const { markTestComplete } = await import('../lib/firestore/courseProgress');
                        await markTestComplete({
                            uid: userId,
                            courseId: courseCtx.courseId,
                            seriesId: courseCtx.seriesId,
                            assessmentId: courseCtx.assessmentId || canonicalMainId,
                            score: correctAnswers,
                            maxScore: courseCtx.maxScore || totalQuestions,
                        });
                    }
                } catch (_) { /* non-fatal */ }

                // Clear session storage on successful submission
                clearTestSessionStorage();
                setActiveTestSlug(null);
                stopGlobalCameraStream();
                toast.success('Assessment submitted successfully!', { id: 'mcq-submit' });
            } else {
                throw new Error('Submission failed. Please try again.');
            }
        } catch (error) {
            console.error('[MCQPage] Submission error:', error);
            toast.error(error?.message || 'Submission failed. Please try again.', { id: 'mcq-submit' });
            setShowSubmittingPopup(false);

            if (error.message.includes('DUPLICATE_SUBMISSION') || error.message.includes('already been completed')) {
                setSubmissionStatus('duplicate');
                setError('This test has already been submitted. Multiple submissions are not allowed.');
                toast.error(' This test has already been submitted. You cannot submit again.');
            } else {
                // NETWORK FAILURE: save pending result locally so it survives a crash
                // and can be retried on the next launch.
                const uid = auth?.currentUser?.uid || user?.uid || 'unknown';
                const assessmentId = currentTest?.testInfo?.id || currentTest?.id || 'unknown';
                const pendingKey = `mcq_pending_submission_${uid}_${assessmentId}`;
                const pendingPayload = {
                    uid,
                    assessmentId,
                    timestamp: timeService.getNow().toISOString(),
                    retryCount: 0,
                };
                savePendingEnvelope(pendingKey, pendingPayload).catch(() => {});
                console.warn('[MCQPage] Submission failed — result saved as pending for retry:', pendingKey);

                setSubmissionStatus('pending');
                setError(
                    'Submission is pending due to a network issue. ' +
                    'Your answers are saved and will be uploaded automatically when connectivity is restored.'
                );
            }
            setIsSubmitting(false);
            submitGuard.fail();
        }
    };

    // Handle auto-submit when timer ends or when user navigates away
    const handleAutoSubmit = useCallback(async ({ reason = 'timer', skipResultView = false, noticeMessage, misbehaviorCount: proctorMisbehaviorCount } = {}) => {
        if (currentTest && !currentTest.submitted && user) {
            // Same synchronous guard as the manual path: the timer must not
            // double-submit alongside a click, and repeated proctoring
            // violations must not each trigger their own submission.
            if (!submitGuard.begin(reason)) {
                console.warn('[MCQPage] Submit already in progress, ignoring auto-submit:', reason);
                return;
            }
            const correctAnswers = calculateScore();
            const totalQuestions = currentTest.questions.length;
            const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
            if (isEmbedded) {
                if (onSectionSubmitRef.current) {
                    const violationStats = (proctoringData.violations || []).reduce((acc, v) => {
                        if (v.type === 'no_face') acc.totalNoFace++;
                        else if (v.type === 'multiple_faces') acc.totalMultipleFaces++;
                        return acc;
                    }, { totalNoFace: 0, totalMultipleFaces: 0 });
                    onSectionSubmitRef.current({
                        answers: answers,
                        timeSpentPerQ: timeSpentPerQ,
                        score: correctAnswers,
                        totalQuestions: totalQuestions,
                        percentage: percentage,
                        violationCount: proctoringData.violationCount || 0,
                        totalNoFace: violationStats.totalNoFace,
                        totalMultipleFaces: violationStats.totalMultipleFaces,
                        violations: proctoringData.violations || []
                    });
                }
                // Embedded section hand-off: the parent owns persistence, so
                // release the lock for the next section.
                submitGuard.fail();
                return;
            }
            const timeTaken = startTime ? Math.round((timeService.now() - startTime) / 1000) : 0;
            const incorrectAnswers = totalQuestions - correctAnswers;
            const reasonLabel = getAutoSubmitReasonLabel(reason);

            // Calculate proctoring violation stats
            const violationStats = (proctoringData.violations || []).reduce((acc, violation) => {
                if (violation.type === 'no_face') acc.totalNoFace++;
                else if (violation.type === 'multiple_faces') acc.totalMultipleFaces++;
                // looking_away removed - no longer tracked
                return acc;
            }, { totalNoFace: 0, totalMultipleFaces: 0 });

            // Prepare result data for auto-submit
            // Turn off camera immediately on auto submit trigger
            stopGlobalCameraStream();

            const questionsDetails = (currentTest.questions || []).map((q, idx) => {
                const selectedIdx = answers[idx];
                const selectedAnswer = selectedIdx !== undefined ? (q.options?.[selectedIdx] ?? '') : '';
                const isCorrect = selectedAnswer === q.correctAnswer;
                const timeSpent = timeSpentPerQ[idx] || 0;
                return {
                    questionNumber: idx + 1,
                    questionText: q.question || (q.text  ?? ''),
                    difficulty: (q.difficulty || currentTest.difficulty || 'medium').toLowerCase(),
                    topic: q.topic || q.tag || (q.tags ? (Array.isArray(q.tags) ? q.tags[0] : q.tags) : 'General'),
                    tags: Array.isArray(q.tags) ? q.tags : (q.tags ? [q.tags] : (q.topic ? [q.topic] : ['General'])),
                    isCorrect,
                    selectedAnswer,
                    correctAnswer: q.correctAnswer ?? '',
                    timeSpent
                };
            });

            const resultData = {
                uid: auth?.currentUser?.uid || (user?.uid  ?? ''),
                email: user.email,
                college: user.college,
                year: user.year,
                department: user.department,
                tenantId: user.tenantId ?? '',
                cohortId: user.cohortId ?? '',
                rollNumber: user.rollNumber ?? '',
                name: user.name ?? '',
                assessmentId: currentTest.testInfo?.id || currentTest.id || 'unknown',
                assessmentTitle: currentTest.name || currentTest.testInfo?.name || 'Unknown Test',
                score: correctAnswers,
                totalQuestions: totalQuestions,
                correctAnswers: correctAnswers,
                incorrectAnswers: incorrectAnswers,
                maxScore: totalQuestions,
                percentage: percentage,
                timeTaken: timeTaken,
                timeStarted: teststartedAt || timeService.getNow().toISOString(),
                startedAt: teststartedAt || timeService.getNow().toISOString(),
                timeEnded: timeService.getNow().toISOString(),
                timeEndedISO: timeService.getNow().toISOString(),
                submittedAt: timeService.getNow().toISOString(),
                answers: answers,
                questions: questionsDetails,
                timeSpentPerQ: timeSpentPerQ,
                autoSubmitted: true,
                autoSubmitReason: reasonLabel,
                submissionReason: 'auto_submit',
                // Include proctoring data
                violationCount: proctoringData.violationCount || 0,
                totalNoFace: violationStats.totalNoFace || 0,
                totalMultipleFaces: violationStats.totalMultipleFaces || 0,
                violations: proctoringData.violations || []
            };

            try {
                // Submit to both Firestore and Google Sheets
                await MCQService.submitMCQResult(resultData);
                if (reason === 'timer' && !skipResultView) {
                    setCurrentTest(prev => ({
                        ...prev,
                        score: percentage,
                        correctAnswers,
                        totalQuestions,
                        timeTaken,
                        submitted: true,
                        autoSubmitted: true
                    }));
                    setShowConfirmSubmit(false);
                    setShowReviewAnswers(false);
                    toast.warning(' Time is up! Your test has been automatically submitted.');
                } else {
                    setCurrentTest(null);
                    setShowConfirmSubmit(false);
                    setShowReviewAnswers(false);
                    setQuestionIndex(0);
                    setAnswers({});
                    setBookmarkedQuestions([]);
                    setStartTime(null);
                    setElapsedTime(0);
                    setRemainingTime(0);
                    setTestDuration(0);
                    setSelectedTest(null);
                    setIsPasskeyValidated(false);
                    setQuestionStartTimes({});
                    const message = noticeMessage || reasonLabel;
                    setAutoSubmitMessage(message);
                    navigate(MCQ_ROUTE_BASE, { replace: true });
                }

                submitGuard.complete();
                const canonicalMainId = isEmbedded
                    ? (testData?.assessmentId || testData?.mainAssessmentId || testData?.id)
                    : (currentTest?.assessmentId || currentTest?.testInfo?.id || currentTest?.id);
                await markAssessmentCompleted(user, canonicalMainId);

                clearTestSessionStorage();
                setActiveTestSlug(null);
                stopGlobalCameraStream();
            } catch (error) {
                console.error('[MCQPage] Auto-submit error:', error);
                // Even if submission fails, mark as submitted in UI
                setCurrentTest(prev => ({
                    ...prev,
                    score: percentage,
                    timeTaken,
                    submitted: true,
                    autoSubmitted: true,
                    submissionError: error.message
                }));
            }
        }
    }, [currentTest, calculateScore, startTime, user, answers, teststartedAt, clearTestSessionStorage, navigate, setAutoSubmitMessage, isEmbedded, timeSpentPerQ, submitGuard]);

    // Timer effect — wall-clock anchored countdown
    // BUG FIXED (P1 timer drift): the previous implementation used
    // elapsedTime + 1 per tick. On backgrounded tabs or under CPU load,
    // setInterval fires late and the displayed time drifts behind real time.
    // Fix: record the absolute end timestamp once when the test starts and
    // derive remaining = Math.round((endTime - Date.now()) / 1000) on every
    // tick. The interval is still 1 s — only the remaining calculation changed.
    useEffect(() => {
        if (!currentTest || currentTest.submitted || testDuration <= 0 || isEmbedded) return;

        // Wall-clock end timestamp for this test.
        // startTime is set when the test begins (ms epoch).
        const endTimeMs = (startTime || timeService.now()) + testDuration * 1000;

        const timer = setInterval(() => {
            // Throttled autosave (once every 5 s)
            throttledLocalStorageSet('mcqLastActiveTime', timeService.now().toString(), 5000);

            const newRemaining = Math.round((endTimeMs - timeService.now()) / 1000);
            setRemainingTime(Math.max(0, newRemaining));
            // Keep elapsedTime in sync for any code that reads it
            setElapsedTime(testDuration - Math.max(0, newRemaining));

            if (newRemaining <= 0) {
                handleAutoSubmit({ reason: 'timer' });
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [currentTest, testDuration, startTime, handleAutoSubmit, isEmbedded]);

    // Synchronize section remainingTime in embedded mode
    useEffect(() => {
        if (isEmbedded) {
            setRemainingTime(secTimer);
            if (secTimer <= 0) {
                handleAutoSubmit({ reason: 'timer' });
            }
        }
    }, [secTimer, isEmbedded, handleAutoSubmit]);

    // Reset question-level timer on questionIndex change
    useEffect(() => {
        if (isEmbedded && settings.questionTimer > 0 && currentTest) {
            setQTimerRemaining(settings.questionTimer);
        }
    }, [questionIndex, isEmbedded, settings.questionTimer, currentTest]);

    // Question-level lock timer loop
    useEffect(() => {
        if (isEmbedded && settings.questionTimer > 0 && currentTest && !currentTest.submitted) {
            const timer = setInterval(() => {
                setQTimerRemaining(prev => {
                    if (prev <= 1) {
                        // Lock current question!
                        setLockedQuestions(l => [...l, questionIndex]);
                        // Move to next question, or auto-submit if it's the last question
                        if (questionIndex + 1 < currentTest.questions.length) {
                            setQuestionIndex(questionIndex + 1);
                        } else {
                            handleAutoSubmit({ reason: 'timer' });
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isEmbedded, settings.questionTimer, questionIndex, currentTest, handleAutoSubmit]);



    useEffect(() => {
        if (currentTest && !currentTest.submitted) {
            const interval = setInterval(() => {
                syncProgress('interval');
                if (!navigator.onLine) {
                    setIsOnline(false);
                    setShowNetworkPopup(true);
                    setNetworkTimer(30);
                }
            }, 120000);
            return () => clearInterval(interval);
        }
    }, [currentTest, syncProgress]);

    useEffect(() => {
        if (currentTest && !currentTest.submitted) {
            const testKey = currentTest.testInfo?.id || currentTest.id;
            if (activeProgressTestRef.current !== testKey) {
                activeProgressTestRef.current = testKey;
                syncProgress('initial');
            }
        } else {
            activeProgressTestRef.current = null;
        }
    }, [currentTest, syncProgress]);

    useEffect(() => {
        if (isOnline && currentTest && !currentTest.submitted) {
            // Connection restored: cancel any pending debounce + close popup
            networkTimeoutTriggeredRef.current = false;
            if (networkPopupDebounceRef.current) {
                clearTimeout(networkPopupDebounceRef.current);
                networkPopupDebounceRef.current = null;
            }
            setShowNetworkPopup(false);
            setNetworkTimer(30);
            localStorage.removeItem('mcqReloadGraceDeadline');
            syncProgress('network-reconnect');
        } else if (!isOnline && currentTest && !currentTest.submitted) {
            // Connection lost: let the debounce timer from the event handler show the popup
            // (already started in handleOffline — we don't trigger popup directly here)
            networkTimeoutTriggeredRef.current = false;
        } else if (isOnline && !currentTest) {
            setShowNetworkPopup(false);
            setNetworkTimer(30);
            networkTimeoutTriggeredRef.current = false;
            localStorage.removeItem('mcqReloadGraceDeadline');
        }
    }, [isOnline, currentTest, syncProgress]);

    useEffect(() => {
        if (!showNetworkPopup || !currentTest || currentTest.submitted || networkTimeoutTriggeredRef.current) {
            return;
        }

        const countdown = setInterval(() => {
            setNetworkTimer(prev => {
                if (prev <= 1) {
                    clearInterval(countdown);
                    if (!networkTimeoutTriggeredRef.current) {
                        networkTimeoutTriggeredRef.current = true;
                        /* // Commented out to allow reconnection multiple times within time window
                        handleAutoSubmit({
                            reason: 'network-timeout',
                            skipResultView: true,
                            noticeMessage: 'Your MCQ attempt was auto-submitted because the connection was not restored in time.'
                        });
                        */
                        console.log('[MCQPage] Network timeout: auto-submit skipped as per lenient configuration.');
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(countdown);
    }, [showNetworkPopup, currentTest, handleAutoSubmit]);

    useEffect(() => {
        if (!showNetworkPopup) {
            networkTimeoutTriggeredRef.current = false;
            setNetworkTimer(30);
        }
    }, [showNetworkPopup]);

    // Auto-dismiss: when connection is restored, close the popup after a short grace period
    useEffect(() => {
        if (showNetworkPopup && isOnline) {
            const dismiss = setTimeout(() => {
                setShowNetworkPopup(false);
                setNetworkTimer(30);
                setError(null);
                syncProgress('network-reconnect');
            }, 1500);
            return () => clearTimeout(dismiss);
        }
    }, [showNetworkPopup, isOnline, syncProgress]);

    useEffect(() => {
        const previousPath = previousPathRef.current;
        const slug = activeTestSlugRef.current;
        if (slug && currentTest && !currentTest.submitted) {
            const testPath = `${MCQ_ROUTE_BASE}/${slug}`;
            const wasOnTestPath = previousPath.includes(testPath);
            const nowOnTestPath = location.pathname.includes(testPath);
            if (wasOnTestPath && !nowOnTestPath) {
                /* // Commented out to allow navigation away without auto-submit
                handleAutoSubmit({
                    reason: 'navigation',
                    skipResultView: true,
                    noticeMessage: 'Your MCQ attempt was auto-submitted because you navigated away from the test page.'
                });
                */
                console.log('[MCQPage] Navigation away detected: auto-submit skipped as per lenient configuration.');
            }
        }
        previousPathRef.current = location.pathname;
    }, [location.pathname, currentTest, handleAutoSubmit]);

    // Save answers to localStorage whenever they change
    useEffect(() => {
        if (currentTest && !currentTest.submitted) {
            // sessionStorage.setItem('mcqTestAnswers', JSON.stringify(answers));
            localStorage.setItem('mcqTestAnswers', JSON.stringify(answers));
        }
    }, [answers, currentTest]);

    // Monitor scheduled end time and auto-submit if it passes
    useEffect(() => {
        if (!currentTest || currentTest.submitted) return;

        const checkSchedule = setInterval(() => {
            if (isTestEnded(currentTest.schedule)) {
                console.log('[MCQPage] Scheduled end time reached, auto-submitting');
                handleAutoSubmit({ reason: 'timer' });
                clearInterval(checkSchedule);
            }
        }, 30000); // Check every 30 seconds (less frequent to save resources)

        return () => clearInterval(checkSchedule);
    }, [currentTest, handleAutoSubmit]);

    const formatTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Format countdown time with warning colors
    const formatCountdownTime = (seconds) => {
        return formatTime(seconds);
    };



    /**
     * Helper to render text with code snippets (```code```)
     * @param {string} text - Text to render
     * @returns {React.ReactNode}
     */
    const renderTextWithCode = (text) => renderMathAndCode(text, false);

    // Render test selector
    const renderTestSelector = () => {
        return (
            <div className="mcq-container">
                <div className="mcq-header">
                    <div className="mcq-header-top">
                        <button
                            className="mcq-home-button"
                            onClick={() => navigate('/student/dashboard')}
                            title="Go to Dashboard"
                        >
                            <FaHome />
                            <span>Dashboard</span>
                        </button>
                    </div>
                    <h1>MCQ Assessments</h1>
                    <p className="mcq-description">
                        Select an MCQ test from the list below. Each test includes multiple choice questions
                        to assess your knowledge and understanding.
                    </p>
                </div>

                {autoSubmitNotice && (
                    <div className="mcq-info-banner">
                        <span>{autoSubmitNotice}</span>
                        <button onClick={() => {
                            // sessionStorage.removeItem(AUTO_SUBMIT_NOTICE_KEY);
                            localStorage.removeItem(AUTO_SUBMIT_NOTICE_KEY);
                            setAutoSubmitNotice(null);
                        }}>
                            <FaTimes />
                        </button>
                    </div>
                )}

                {/* Dashboard Controls: Search & Filters */}
                <div className="mcq-dashboard-controls">
                    <div className="mcq-search-container">
                        <FaSearch className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search tests by name or difficulty..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="mcq-search-input"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck="false"
                        />
                    </div>

                    <div className="mcq-filters-panel">
                        <div className="mcq-filter-group">
                            <span className="mcq-filter-label">Difficulty:</span>
                            <div className="mcq-filter-pills">
                                {['All', 'Easy', 'Medium', 'Hard'].map((diff) => (
                                    <button
                                        key={diff}
                                        className={`mcq-filter-pill ${filterDifficulty === diff ? 'active' : ''} ${diff.toLowerCase()}`}
                                        onClick={() => setFilterDifficulty(diff)}
                                    >
                                        {diff}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mcq-filter-group">
                            <span className="mcq-filter-label">Status:</span>
                            <div className="mcq-filter-pills">
                                {['All', 'Available', 'Completed'].map((status) => (
                                    <button
                                        key={status}
                                        className={`mcq-filter-pill ${filterStatus === status ? 'active' : ''}`}
                                        onClick={() => setFilterStatus(status)}
                                    >
                                        {status}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mcq-error">
                        {error}
                    </div>
                )}

                <div className="mcq-test-list">
                    {filteredTests.length === 0 ? (
                        <div className="mcq-no-tests">
                            <p>No MCQ tests available matching your selected filters.</p>
                        </div>
                    ) : (
                        filteredTests.map((test) => {
                            const scheduleAccess = checkScheduleAccess(test);
                            const attempt = userAttempts[test.id];
                            const isCompleted = attempt?.completed === true;
                            const isStarted = attempt && !isCompleted;

                            return (
                                <div key={test.id} className="mcq-test-row">
                                    <div className="mcq-test-row-main">
                                        <div className="mcq-test-row-left">
                                            <div className="mcq-test-icon-badge">
                                                <FaChartBar />
                                            </div>
                                            <div className="mcq-test-info-block">
                                                <h3 className="mcq-test-name">{test.name}</h3>
                                                <div className="mcq-test-meta-info">
                                                    <span className="meta-item">{test.questions || 0} Questions</span>
                                                    <span className="meta-dot">•</span>
                                                    <span className="meta-item">{test.duration_minutes || test.duration || 60} Mins</span>
                                                    {test.passkey && (
                                                        <>
                                                            <span className="meta-dot">•</span>
                                                            <span className="meta-item passkey-lock-label" title="Passkey Required">
                                                                <FaLock /> Passkey Required
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mcq-test-row-right">
                                            <div className="mcq-status-badges">
                                                <span className={`mcq-difficulty mcq-difficulty-${(test.difficulty || 'medium').toLowerCase()}`}>
                                                    {test.difficulty ?? ''}
                                                </span>
                                                {isCompleted ? (
                                                    <span className="mcq-status-badge badge-completed">
                                                        Completed • {attempt.percentage}%
                                                    </span>
                                                ) : isStarted ? (
                                                    <span className="mcq-status-badge badge-in-progress">
                                                        In Progress
                                                    </span>
                                                ) : (
                                                    <span className="mcq-status-badge badge-not-started">
                                                        Not Started
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mcq-row-actions">
                                                {isCompleted ? (
                                                    <button
                                                        className="mcq-row-action-btn view-results-btn"
                                                        onClick={() => {
                                                            setCompletedTestInfo({ test, existingAttempt: attempt.data });
                                                            setTestAlreadyCompleted(true);
                                                        }}
                                                    >
                                                        View Results
                                                    </button>
                                                ) : (
                                                    <button
                                                        className={`mcq-row-action-btn start-btn ${isStarted ? 'resume' : ''}`}
                                                        onClick={async () => {
                                                            // Check network connectivity first
                                                            if (!navigator.onLine) {
                                                                setShowNetworkPopup(true);
                                                                setNetworkTimer(30);
                                                                setError('No internet connection. Please connect to the internet to start the test.');
                                                                return;
                                                            }

                                                            // Check if test already completed before starting
                                                            try {
                                                                const existingAttempt = await MCQService.checkExistingAttempt(
                                                                    user.email,
                                                                    test.id,
                                                                    user.college,
                                                                    user.year,
                                                                    user.department
                                                                );

                                                                if (existingAttempt.exists && existingAttempt.completed) {
                                                                    setTestAlreadyCompleted(true);
                                                                    setCompletedTestInfo({ test, existingAttempt: existingAttempt.data });
                                                                    return;
                                                                }

                                                                handleTestSelect(test);
                                                            } catch (checkError) {
                                                                // If offline, show network popup
                                                                if (checkError.code === 'unavailable' || checkError.message?.includes('offline') || !navigator.onLine) {
                                                                    setShowNetworkPopup(true);
                                                                    setNetworkTimer(30);
                                                                    setError('Network connection required. Please check your internet connection.');
                                                                    return;
                                                                }
                                                                console.error('Error checking existing attempt:', checkError);
                                                                handleTestSelect(test);
                                                            }
                                                        }}
                                                        disabled={!scheduleAccess.allowed || !user}
                                                    >
                                                        {isStarted ? 'Resume' : 'Start Test'}
                                                    </button>
                                                )}

                                                {isTestEnded(test.schedule) && isCompleted && (
                                                    <button
                                                        className="mcq-row-action-btn solution-btn"
                                                        onClick={() => handleViewSolution(test)}
                                                    >
                                                        Solutions
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {!scheduleAccess.allowed && (
                                        <div className="mcq-row-schedule-warning">
                                            {scheduleAccess.reason}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Passkey Modal */}
                {showPasskeyModal && selectedTest && (
                    <div className="mcq-modal-overlay">
                        <div className="mcq-modal">
                            <div className="mcq-modal-header">
                                <h3>Enter Passkey</h3>
                                <button onClick={() => {
                                    setShowPasskeyModal(false);
                                    setPasskey('');
                                    setError(null);
                                }}>
                                    <FaTimes />
                                </button>
                            </div>
                            <div className="mcq-modal-body">
                                <p>Please enter the passkey to access this test:</p>
                                <input
                                    ref={passkeyInputRef}
                                    type="password"
                                    placeholder="Enter passkey"
                                    value={passkey}
                                    onChange={(e) => {
                                        setPasskey(e.target.value);
                                        // Clear error when user starts typing
                                        if (passkeyError) setPasskeyError('');
                                    }}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            validatePasskey();
                                        }
                                    }}
                                    className={`mcq-passkey-input ${passkeyError ? 'mcq-passkey-input-error' : ''}`}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck="false"
                                />
                                {passkeyError && (
                                    <div className="mcq-error-small" style={{ color: '#f44336', marginTop: '8px' }}>
                                        {passkeyError}
                                    </div>
                                )}
                            </div>
                            <div className="mcq-modal-footer">
                                <button onClick={() => {
                                    setShowPasskeyModal(false);
                                    setPasskey('');
                                    setPasskeyError('');
                                    setError(null);
                                }}>
                                    Cancel
                                </button>
                                <button
                                    onClick={validatePasskey}
                                    disabled={isValidatingPasskey || !passkey.trim()}
                                    className="mcq-validate-btn"
                                >
                                    {isValidatingPasskey ? 'Validating...' : 'Validate'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Proctoring Instructions Modal - Only shown when ENABLE_PROCTORING is true */}
                {ENABLE_PROCTORING && showInstructions && (
                    <ProctoringInstructions
                        assessment={currentTest}
                        onContinue={handleContinueFromInstructions}
                        onCancel={handleCancelFromInstructions}
                    />
                )}
            </div>
        );
    };

    // Render test content with 3-column reference UI layout
    const renderTestContent = () => {
        if (!currentTest) return null;

        const totalQs = currentTest.questions.length;
        const attemptedQs = Object.keys(answers).length;
        const unattemptedQs = Math.max(0, totalQs - attemptedQs);
        const flaggedCount = bookmarkedQuestions.length;
        const progressPercentage = totalQs > 0 ? Math.round((attemptedQs / totalQs) * 100) : 0;

        const authUser = getAuthData();
        const candidateRoll = authUser.rollNumber ?? authUser.email ?? 'CANDIDATE';
        const tenantId = authUser.tenantId ?? 'SEED-SEB';
        const currentQ = currentTest.questions[questionIndex] || {};

        return (
            <div className="mcq-ref-app-container">
                <SecurityWatermark rollNumber={candidateRoll} tenantId={tenantId} />

                {/* ── TOP HEADER ── */}
                <header className="mcq-ref-header">
                    <div className="mcq-ref-header-left">
                        <div className="mcq-brand-badge">
                            <div className="mcq-brand-icon">
                                <FaShieldAlt />
                            </div>
                            <div className="mcq-brand-text">
                                <span className="mcq-brand-title">SEED-SEB</span>
                                <span className="mcq-brand-subtitle">SECURE EXAMINATION &amp; BENCHMARKING</span>
                            </div>
                        </div>
                    </div>

                    <div className="mcq-ref-header-center">
                        <h2 className="mcq-ref-assessment-title">{currentTest.name || currentTest.testInfo?.name || 'MCQ Section Assessment'}</h2>
                        <div className="mcq-ref-assessment-meta">
                            <span>Section 1 of 1</span>
                            <span className="meta-dot">•</span>
                            <span>{totalQs} Questions</span>
                            <span className="meta-dot">•</span>
                            <span>1 Mark Each</span>
                        </div>
                    </div>

                    <div className="mcq-ref-header-right">
                        {ENABLE_PROCTORING && (shouldUseAudioProctoring || shouldUseProctoring) && (
                            <div className="mcq-proctor-pills-wrap">
                                {shouldUseAudioProctoring && (
                                    <div className="mcq-proctor-badge" title="Audio Proctoring">
                                        <span className={`status-dot ${proctoringData.audioViolationCount > 0 ? 'bad' : 'good'}`} />
                                        Audio: {proctoringData.audioViolationCount}/{currentTest.testInfo?.maxAudioViolations || 5}
                                    </div>
                                )}
                                {shouldUseProctoring && (
                                    <div className="mcq-proctor-badge" title="Camera Proctoring">
                                        <span className={`status-dot ${proctoringData.violationCount > 0 ? 'bad' : 'good'}`} />
                                        Camera: {proctoringData.violationCount}/{currentTest.testInfo?.maxViolations || currentTest.maxViolations || 5}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mcq-ref-timer-box">
                            <div className="mcq-timer-icon-wrap">
                                <FaClock />
                            </div>
                            <div className="mcq-timer-details">
                                <span className="mcq-timer-label">Time Remaining</span>
                                <span className={`mcq-timer-value ${remainingTime <= 300 ? 'warning' : ''} ${remainingTime <= 60 ? 'danger' : ''}`}>
                                    {formatCountdownTime(remainingTime)}
                                </span>
                            </div>
                        </div>

                        <button
                            type="button"
                            className={`mcq-ref-flag-btn ${bookmarkedQuestions.includes(questionIndex) ? 'flagged' : ''}`}
                            onClick={() => toggleBookmark(questionIndex)}
                        >
                            <FaFlag />
                            <span>{bookmarkedQuestions.includes(questionIndex) ? 'Flagged' : 'Flag for Review'}</span>
                        </button>

                        <button
                            type="button"
                            className="mcq-ref-submit-btn"
                            onClick={() => setShowConfirmSubmit(true)}
                            disabled={isSubmitting}
                        >
                            <FaSignOutAlt />
                            <span>Submit Section</span>
                        </button>
                    </div>
                </header>

                {/* Confirm Dialog */}
                {showConfirmSubmit && (
                    <div className="mcq-confirm-dialog">
                        <div className="mcq-confirm-content">
                            <h3>Submit Assessment Section?</h3>
                            <p>Are you sure you want to submit your responses? You can review your answers before final submission.</p>
                            <div className="mcq-confirm-buttons">
                                <button type="button" className="btn-cancel" onClick={() => setShowConfirmSubmit(false)}>Cancel</button>
                                <button type="button" className="btn-review" onClick={() => {
                                    setShowReviewAnswers(true);
                                    setShowConfirmSubmit(false);
                                }}>Review Answers</button>
                                <button type="button" className="btn-confirm-submit" onClick={handleSubmit} disabled={isSubmitting}>
                                    {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Review Answers Screen */}
                {showReviewAnswers ? (
                    <div className="mcq-review-container">
                        <h3>Review Your Answers</h3>
                        <div className="mcq-review-list">
                            {currentTest.questions.map((question, index) => (
                                <div key={index} className="mcq-review-item">
                                    <div className="mcq-review-header">
                                        <span>Question {index + 1}</span>
                                        <span>{getTimeTaken(index)}s</span>
                                    </div>
                                    <div className="mcq-review-question">{renderTextWithCode(question.question)}</div>
                                    <div className="mcq-review-answer">
                                        Your answer: {answers[index] !== undefined ? renderMathAndCode(question.options[answers[index]], true) : <span className="text-muted">Not answered</span>}
                                    </div>
                                    <div className="mcq-review-actions">
                                        <button type="button" onClick={() => {
                                            setQuestionIndex(index);
                                            setShowReviewAnswers(false);
                                        }}>Go to Question</button>
                                        <button
                                            type="button"
                                            className={bookmarkedQuestions.includes(index) ? 'bookmarked' : ''}
                                            onClick={() => toggleBookmark(index)}
                                        >
                                            <FaBookmark /> {bookmarkedQuestions.includes(index) ? 'Flagged' : 'Flag'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mcq-review-bottom-nav">
                            <button type="button" className="mcq-nav-button" onClick={() => setShowReviewAnswers(false)}>Back to Test</button>
                            <button type="button" className="mcq-submit-button" onClick={handleSubmit} disabled={isSubmitting}>
                                {isSubmitting ? 'Submitting...' : 'Submit Test'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── 3-COLUMN WORKSPACE ── */
                    <div className="mcq-ref-layout-3col">
                        {/* 1. LEFT SIDEBAR */}
                        <aside className="mcq-ref-col-left">
                            {/* Section Overview Card */}
                            <div className="mcq-ref-card">
                                <div className="mcq-card-head">
                                    <div className="mcq-card-head-icon">
                                        <FaListUl />
                                    </div>
                                    <h4>Section Overview</h4>
                                </div>
                                <div className="mcq-overview-table">
                                    <div className="overview-row">
                                        <span className="overview-label">Total Questions</span>
                                        <strong className="overview-val">{totalQs}</strong>
                                    </div>
                                    <div className="overview-row">
                                        <span className="overview-label">Attempted</span>
                                        <strong className="overview-val text-emerald">{attemptedQs}</strong>
                                    </div>
                                    <div className="overview-row">
                                        <span className="overview-label">Not Attempted</span>
                                        <strong className="overview-val text-muted">{unattemptedQs}</strong>
                                    </div>
                                    <div className="overview-row">
                                        <span className="overview-label">Flagged</span>
                                        <strong className="overview-val text-amber">{flaggedCount}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Legend Card */}
                            <div className="mcq-ref-card">
                                <div className="mcq-card-head">
                                    <div className="mcq-card-head-icon">
                                        <FaShieldAlt />
                                    </div>
                                    <h4>Legend</h4>
                                </div>
                                <div className="mcq-legend-list">
                                    <div className="legend-item">
                                        <span className="legend-dot answered" />
                                        <span>Answered</span>
                                    </div>
                                    <div className="legend-item">
                                        <span className="legend-dot not-answered" />
                                        <span>Not Answered</span>
                                    </div>
                                    <div className="legend-item">
                                        <span className="legend-dot current" />
                                        <span>Current Question</span>
                                    </div>
                                    <div className="legend-item">
                                        <span className="legend-dot flagged" />
                                        <span>Flagged for Review</span>
                                    </div>
                                </div>
                            </div>

                            {/* Secure Environment Card */}
                            <div className="mcq-ref-card secure-badge-card">
                                <div className="mcq-card-head">
                                    <div className="mcq-card-head-icon">
                                        <FaLock />
                                    </div>
                                    <h4>Secure Environment</h4>
                                </div>
                                <p className="secure-badge-text">
                                    Your activity is being monitored<br />
                                    <span className="sub">*for a fair assessment.</span>
                                </p>
                            </div>
                        </aside>

                        {/* 2. CENTER QUESTION WORKSPACE */}
                        <main className="mcq-ref-col-center">
                            <div className="mcq-center-question-card">
                                <div className="mcq-center-card-header">
                                    <h3 className="mcq-q-title">Question {questionIndex + 1} of {totalQs}</h3>
                                    <button
                                        type="button"
                                        className={`mcq-center-flag-btn ${bookmarkedQuestions.includes(questionIndex) ? 'flagged' : ''}`}
                                        onClick={() => toggleBookmark(questionIndex)}
                                    >
                                        <FaBookmark />
                                        <span>{bookmarkedQuestions.includes(questionIndex) ? 'Flagged for Review' : 'Mark for Review'}</span>
                                    </button>
                                </div>

                                <div className="mcq-center-q-body">
                                    {isEmbedded && lockedQuestions.includes(questionIndex) && (
                                        <div className="mcq-locked-notice">
                                            <FaLock />
                                            <span>This question is locked because its timer expired. You can no longer modify your answer.</span>
                                        </div>
                                    )}

                                    <div className="mcq-q-text-line">
                                        <span className="mcq-q-num-badge">Q{questionIndex + 1}.</span>
                                        <span className="mcq-q-content">{renderTextWithCode(currentQ.question)}</span>
                                    </div>

                                    <div className="mcq-ref-options-stack">
                                        {currentQ.options && currentQ.options.map((option, optionIndex) => {
                                            const letter = String.fromCharCode(65 + optionIndex);
                                            const isSelected = answers[questionIndex] === optionIndex;
                                            const isLocked = isEmbedded && lockedQuestions.includes(questionIndex);
                                            return (
                                                <button
                                                    type="button"
                                                    key={optionIndex}
                                                    className={`mcq-ref-option-card ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => handleSelectOption(optionIndex)}
                                                    disabled={isLocked}
                                                    style={isLocked ? { cursor: 'not-allowed', opacity: 0.8 } : {}}
                                                >
                                                    <div className="option-radio-indicator">
                                                        <span className="radio-circle" />
                                                    </div>
                                                    <div className="option-letter-badge">{letter}</div>
                                                    <div className="option-text-content">{renderMathAndCode(option, true)}</div>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Quick Tip / Hint Box */}
                                    {(currentQ.hint || currentQ.explanation) ? (
                                        <div className="mcq-quick-tip-card">
                                            <div className="tip-icon"><FaLightbulb /></div>
                                            <div className="tip-content">
                                                <strong>Quick Tip</strong>
                                                <p>{currentQ.hint || currentQ.explanation}</p>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                {/* Bottom Nav inside Center Card */}
                                <div className="mcq-center-actions-footer">
                                    <button
                                        type="button"
                                        className="mcq-btn-prev"
                                        onClick={() => handleNavigateQuestion('prev')}
                                        disabled={questionIndex === 0 || isSubmitting || settings.questionTimer > 0}
                                    >
                                        <FaArrowLeft /> Previous
                                    </button>

                                    <button
                                        type="button"
                                        className="mcq-btn-save-next"
                                        onClick={() => {
                                            if (questionIndex === totalQs - 1) {
                                                setShowConfirmSubmit(true);
                                            } else {
                                                handleNavigateQuestion('next');
                                            }
                                        }}
                                        disabled={isSubmitting}
                                    >
                                        <span>{questionIndex === totalQs - 1 ? 'Submit Section' : 'Save & Next'}</span>
                                        <FaArrowRight />
                                    </button>
                                </div>
                            </div>
                        </main>

                        {/* 3. RIGHT SIDEBAR */}
                        <aside className="mcq-ref-col-right">
                            {/* Question Navigator Card */}
                            <div className="mcq-ref-card">
                                <div className="mcq-card-head">
                                    <h4>Question Navigator</h4>
                                </div>
                                <div className="mcq-navigator-grid">
                                    {currentTest.questions.map((_, index) => {
                                        const isAttempted = answers[index] !== undefined;
                                        const isCurrent = questionIndex === index;
                                        const isBookmarked = bookmarkedQuestions.includes(index);

                                        let stateClass = '';
                                        if (isCurrent) stateClass = 'current';
                                        else if (isBookmarked) stateClass = 'flagged';
                                        else if (isAttempted) stateClass = 'answered';
                                        else stateClass = 'unanswered';

                                        return (
                                            <button
                                                type="button"
                                                key={index}
                                                className={`nav-grid-btn ${stateClass}`}
                                                onClick={() => {
                                                    if (isEmbedded && (settings.forwardOnly || settings.questionTimer > 0)) {
                                                        return; // Locked jumping
                                                    }
                                                    setQuestionIndex(index);
                                                    setShowReviewAnswers(false);
                                                }}
                                            >
                                                {index + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Section Progress Card */}
                            <div className="mcq-ref-card">
                                <div className="progress-card-head">
                                    <h4>Section Progress</h4>
                                    <span className="progress-fraction">{attemptedQs} / {totalQs}</span>
                                </div>
                                <div className="mcq-progress-bar-track">
                                    <div className="mcq-progress-bar-fill" style={{ width: `${progressPercentage}%` }} />
                                </div>
                                <div className="progress-percent-label">{progressPercentage}%</div>
                            </div>

                            {/* Section Summary Card */}
                            <div className="mcq-ref-card">
                                <div className="mcq-card-head">
                                    <h4>Section Summary</h4>
                                </div>
                                <div className="mcq-summary-list">
                                    <div className="summary-item">
                                        <div className="summary-left">
                                            <span className="legend-dot answered" />
                                            <span>Answered</span>
                                        </div>
                                        <span className="summary-stat">{attemptedQs} ({totalQs > 0 ? Math.round((attemptedQs / totalQs) * 100) : 0}%)</span>
                                    </div>
                                    <div className="summary-item">
                                        <div className="summary-left">
                                            <span className="legend-dot not-answered" />
                                            <span>Not Answered</span>
                                        </div>
                                        <span className="summary-stat">{unattemptedQs} ({totalQs > 0 ? Math.round((unattemptedQs / totalQs) * 100) : 0}%)</span>
                                    </div>
                                    <div className="summary-item">
                                        <div className="summary-left">
                                            <span className="legend-dot flagged" />
                                            <span>Flagged</span>
                                        </div>
                                        <span className="summary-stat">{flaggedCount} ({totalQs > 0 ? Math.round((flaggedCount / totalQs) * 100) : 0}%)</span>
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </div>
                )}

                {/* ── BOTTOM FOOTER ── */}
                <footer className="mcq-ref-bottom-footer">
                    <div className="footer-left-info">
                        <span>Assessment ID: {isEmbedded ? (testData?.assessmentId || testData?.mainAssessmentId || testData?.id || 'MCQ-ASSESSMENT') : (currentTest.assessmentId || currentTest.testInfo?.id || currentTest.id || testSlug || 'MCQ-ASSESSMENT')}</span>
                        <span className="footer-sep">•</span>
                        <span>Tenant: {tenantId}</span>
                        <span className="footer-sep">•</span>
                        <span>Candidate: {candidateRoll}</span>
                    </div>

                    <div className="footer-center-hint">
                        You can navigate between questions using the Question Navigator
                    </div>

                    <div className="footer-right-actions">
                        <button
                            type="button"
                            className="mcq-footer-end-btn"
                            onClick={() => setShowConfirmSubmit(true)}
                            disabled={isSubmitting}
                        >
                            <FaSignOutAlt />
                            <span>End Section</span>
                        </button>
                    </div>
                </footer>
            </div>
        );
    };

    // Render results
    const renderResults = () => {
        if (!currentTest?.submitted) return null;

        const score = currentTest.score;
        const timeTaken = currentTest.timeTaken;
        const totalQuestions = currentTest.questions.length;
        const correctAnswers = currentTest.correctAnswers !== undefined ? currentTest.correctAnswers : Math.floor((score * totalQuestions) / 100);
        const incorrectAnswers = totalQuestions - correctAnswers;

        // Feedback message based on percentage score
        let feedback = "Keep practicing!";
        let feedbackClass = "poor";
        if (score >= 90) {
            feedback = "Outstanding! Perfect execution.";
            feedbackClass = "outstanding";
        } else if (score >= 75) {
            feedback = "Excellent job! Solid understanding.";
            feedbackClass = "excellent";
        } else if (score >= 50) {
            feedback = "Good effort! Room for improvement.";
            feedbackClass = "good";
        }

        const handleGoToDashboard = () => {
            setCurrentTest(null);
            setQuestionIndex(0);
            setAnswers({});
            setStartTime(null);
            setElapsedTime(0);
            setRemainingTime(0);
            setTestDuration(0);
            setSelectedTest(null);
            setIsPasskeyValidated(false);
            setBookmarkedQuestions([]);
            setQuestionStartTimes({});
            setActiveTestSlug(null);
            navigate(MCQ_ROUTE_BASE, { replace: true });
        };

        return (
            <div className="mcq-results-container">
                <div className="mcq-results-header">
                    <div>
                        <h2>Performance Analysis</h2>
                        <p className="mcq-results-subtitle">{currentTest.name || currentTest.testInfo?.name}</p>
                    </div>
                </div>

                {currentTest.autoSubmitted && (
                    <div className="mcq-results-warning-banner">
                        <FaExclamationTriangle />
                        <span>This test was automatically submitted because the allotted time expired.</span>
                    </div>
                )}

                <div className="mcq-results-content-grid">
                    {/* Score Circle Card */}
                    <div className="mcq-results-card score-main-card">
                        <h3>Overall Score</h3>
                        <div className="score-circle-wrapper">
                            <div className="score-radial-progress">
                                <div className="score-radial-value">{score}%</div>
                                <span className="score-radial-label">Final Percent</span>
                            </div>
                        </div>
                        <div className={`score-feedback-text ${feedbackClass}`}>
                            {feedback}
                        </div>
                    </div>

                    {/* Detailed Metrics Card */}
                    <div className="mcq-results-card metrics-card">
                        <h3>Assessment Summary</h3>
                        
                        <div className="metrics-detailed-list">
                            <div className="metric-detail-row">
                                <span className="metric-label">Total Questions</span>
                                <span className="metric-value total">{totalQuestions}</span>
                            </div>
                            <div className="metric-detail-row">
                                <span className="metric-label">Correct Answers</span>
                                <span className="metric-value correct">{correctAnswers}</span>
                            </div>
                            <div className="metric-detail-row">
                                <span className="metric-label">Incorrect Answers</span>
                                <span className="metric-value incorrect">{incorrectAnswers}</span>
                            </div>
                            <div className="metric-detail-row">
                                <span className="metric-label">Total Time Spent</span>
                                <span className="metric-value time">{formatTime(timeTaken)}</span>
                            </div>
                        </div>

                        {/* Progress visual bar */}
                        <div className="results-progress-visual">
                            <div className="progress-visual-bar">
                                <div className="bar-segment correct" style={{ width: `${totalQuestions > 0 ? (correctAnswers/totalQuestions)*100 : 0}%` }} title="Correct"></div>
                                <div className="bar-segment incorrect" style={{ width: `${totalQuestions > 0 ? (incorrectAnswers/totalQuestions)*100 : 0}%` }} title="Incorrect"></div>
                            </div>
                            <div className="progress-visual-legend">
                                <span><span className="dot correct"></span> Correct ({correctAnswers})</span>
                                <span><span className="dot incorrect"></span> Incorrect ({incorrectAnswers})</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mcq-results-action-row">
                    <button
                        className="mcq-results-primary-btn"
                        onClick={handleGoToDashboard}
                    >
                        <FaHome /> Go to Dashboard
                    </button>
                    {isTestEnded(currentTest.schedule) && (
                        <button
                            className="mcq-results-secondary-btn"
                            onClick={() => handleViewSolution(currentTest)}
                        >
                            <FaCheckCircle /> View Solutions
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // Render solution view (user answers vs correct answers)
    const renderSolutionView = () => {
        if (!viewingSolution || !solutionQuestions.length) return null;

        const userAnswers = completedTestInfo?.existingAttempt?.answers || {};
        const testName = completedTestInfo?.test?.name || 'Test Solution';
        const score = completedTestInfo?.existingAttempt?.percentage || 0;

        return (
            <div className="mcq-solution-page">
                <div className="mcq-solution-header">
                    <div className="mcq-solution-header-content">
                        <button
                            className="mcq-back-button"
                            onClick={() => {
                                setViewingSolution(false);
                                setSolutionQuestions([]);
                                setCompletedTestInfo(null);
                            }}
                        >
                            <FaArrowLeft /> Back to List
                        </button>
                        <div className="mcq-solution-title">
                            <h2>{testName} - Solutions</h2>
                            <div className="mcq-solution-badge">Score: {score}%</div>
                        </div>
                    </div>
                </div>

                <div className="mcq-solution-container">
                    {solutionQuestions.map((question, qIndex) => {
                        const userSelectedIndex = userAnswers[qIndex];
                        const isCorrect = userSelectedIndex !== undefined &&
                            question.options[userSelectedIndex] === question.correctAnswer;
                        const correctOptionIndex = question.options.findIndex(opt => opt === question.correctAnswer);

                        return (
                            <div key={qIndex} className={`mcq-solution-card ${isCorrect ? 'is-correct' : 'is-incorrect'}`}>
                                <div className="mcq-solution-q-header">
                                    <span className="mcq-q-number">Question {qIndex + 1}</span>
                                    {isCorrect ? (
                                        <span className="mcq-q-status status-correct"><FaCheck /> Correct</span>
                                    ) : (
                                        <span className="mcq-q-status status-incorrect"><FaTimes /> Incorrect</span>
                                    )}
                                </div>

                                <div className="mcq-solution-q-text">{renderTextWithCode(question.question)}</div>

                                <div className="mcq-solution-options">
                                    {question.options.map((option, oIndex) => {
                                        let optionClass = 'mcq-sol-option';
                                        if (oIndex === correctOptionIndex) optionClass += ' sol-correct';
                                        if (oIndex === userSelectedIndex && !isCorrect) optionClass += ' sol-incorrect';

                                        return (
                                            <div key={oIndex} className={optionClass}>
                                                <span className="option-marker">{String.fromCharCode(65 + oIndex)}.</span>
                                                <span className="option-text">{renderMathAndCode(option, true)}</span>
                                                {oIndex === correctOptionIndex && <FaCheck className="sol-icon-right" />}
                                                {oIndex === userSelectedIndex && !isCorrect && <FaTimes className="sol-icon-right" />}
                                            </div>
                                        );
                                    })}
                                </div>

                                {question.explanation && (
                                    <div className="mcq-solution-explanation">
                                        <h4>Explanation:</h4>
                                        <div className="mcq-explanation-text">{renderTextWithCode(question.explanation)}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="mcq-solution-footer">
                    <button
                        className="mcq-popup-button mcq-primary-button"
                        onClick={() => {
                            setViewingSolution(false);
                            setSolutionQuestions([]);
                            setCompletedTestInfo(null);
                        }}
                    >
                        Close Solutions
                    </button>
                </div>
            </div>
        );
    };

    // Render verifying popup
    const renderVerifyingPopup = () => {
        if (!showVerifyingPopup) return null;

        return (
            <div className="mcq-popup-overlay">
                <div className="mcq-popup-content mcq-verifying-popup">
                    <div className="mcq-popup-loader">
                        <div className="mcq-dot-loader">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                    <h3>Verifying...</h3>
                    <p>Please wait while we verify your test access</p>
                </div>
            </div>
        );
    };

    // Render submitting popup
    const renderSubmittingPopup = () => {
        if (!showSubmittingPopup) return null;

        const getStepText = () => {
            switch (submissionStep) {
                case 'validating':
                    return 'Validating the Answers';
                case 'generating':
                    return 'Generating Marks';
                case 'submitted':
                    return 'Test Submitted Successfully!';
                default:
                    return 'Submitting...';
            }
        };

        const getStepIcon = () => {
            if (submissionStep === 'submitted') {
                return <FaCheckCircle className="mcq-success-icon" />;
            }
            return (
                <div className="mcq-dot-loader">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            );
        };

        return (
            <div className="mcq-popup-overlay">
                <div className="mcq-popup-content mcq-submitting-popup">
                    <div className="mcq-popup-loader">
                        {getStepIcon()}
                    </div>
                    <h3>{getStepText()}</h3>
                    {submissionStep === 'submitted' && (
                        <>
                            <p>Your test has been successfully submitted and recorded.</p>
                            <button
                                className="mcq-popup-button mcq-primary-button"
                                onClick={() => {
                                    setShowSubmittingPopup(false);
                                    setSubmissionStep('');
                                    setIsSubmitting(false);
                                }}
                            >
                                View Results
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // Render network connectivity popup
    const renderNetworkPopup = () => {
        if (!showNetworkPopup) return null;

        const restored = isOnline;

        return (
            // Use pointer-events:none on the backdrop so the test content stays interactive (no freeze)
            <div style={{
                position: 'fixed', inset: 0,
                background: 'rgba(2,6,23,0.75)',
                backdropFilter: 'blur(6px)',
                zIndex: 99990,
                pointerEvents: 'none'
            }}>
                {/* Popup card — pointer-events re-enabled only here */}
                <div style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: '#0f172a',
                    border: `1px solid ${restored ? '#10b981' : '#ef4444'}`,
                    borderRadius: '18px',
                    padding: '36px 40px',
                    width: '420px',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
                    pointerEvents: 'all',
                    transition: 'border-color 0.4s ease'
                }}>
                    {/* Status icon */}
                    <div style={{ textAlign: 'center', fontSize: '2.5rem', marginBottom: '16px' }}>
                        {restored ? '' : ''}
                    </div>
                    <h3 style={{
                        color: restored ? '#10b981' : '#f87171',
                        fontSize: '1.15rem', fontWeight: 800,
                        textAlign: 'center', margin: '0 0 10px',
                        transition: 'color 0.4s ease'
                    }}>
                        {restored ? 'Connection Restored' : 'Network Connection Lost'}
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center', lineHeight: 1.6, margin: '0 0 24px' }}>
                        {restored
                            ? 'Reconnecting you automatically...'
                            : `Your internet connection has been lost. Please reconnect within ${networkTimer} seconds.`}
                    </p>
                    {!restored && (
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{
                                display: 'inline-block',
                                width: '64px', height: '64px',
                                borderRadius: '50%',
                                border: '4px solid #334155',
                                borderTopColor: '#ef4444',
                                animation: 'mcq-spin 1s linear infinite',
                                position: 'relative'
                            }}>
                                <span style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#f87171', fontWeight: 800, fontSize: '0.9rem'
                                }}>{networkTimer}s</span>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        {!restored && (
                            <button
                                onClick={() => { startReloadGracePeriod(); window.location.reload(); }}
                                style={{
                                    padding: '10px 22px', borderRadius: '8px', border: '1px solid #334155',
                                    background: '#1e293b', color: '#cbd5e1',
                                    fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer'
                                }}
                            >
                                ↺ Reload Page
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const handleViewSolution = async (specificTest = null, specificAttempt = null) => {
        const test = specificTest || completedTestInfo?.test;
        let attempt = specificAttempt || completedTestInfo?.existingAttempt;

        if (!test) return;

        setLoading(true);
        try {
            // Fetch attempt if not provided but test is
            if (!attempt && test.id) {
                const check = await MCQService.checkExistingAttempt(
                    user.email,
                    test.id,
                    user.college,
                    user.year,
                    user.department
                );
                if (check.exists && check.completed) {
                    attempt = check.data;
                    setCompletedTestInfo({ test, existingAttempt: attempt });
                } else {
                    setError('You haven\'t completed this test yet, or no attempt was found.');
                    setLoading(false);
                    return;
                }
            }

            const testData = await fetchTestData(test.url);
            setSolutionQuestions(testData.questions || []);
            setViewingSolution(true);
            setTestAlreadyCompleted(false);
        } catch (err) {
            console.error('Error loading solution:', err);
            setError('Failed to load test solution. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Render test already completed popup
    const renderTestCompletedPopup = () => {
        if (!testAlreadyCompleted || !completedTestInfo) return null;

        const { test, existingAttempt } = completedTestInfo;
        const score = existingAttempt?.percentage || 0;
        const correctAnswers = existingAttempt?.correctAnswers || 0;
        const totalQuestions = existingAttempt?.totalQuestions || 0;

        return (
            <div className="mcq-popup-overlay">
                <div className="mcq-popup-content mcq-completed-popup">
                    <div className="mcq-completed-icon">
                        <FaCheckCircle />
                    </div>
                    <h3>Test Already Completed</h3>
                    <p>You have already completed this test.</p>
                    <div className="mcq-completed-score">
                        <div className="mcq-score-display">
                            <span className="mcq-score-value">{score}%</span>
                            <span className="mcq-score-label">Score</span>
                        </div>
                        <div className="mcq-score-details">
                            <span>Total Questions: {totalQuestions}</span>
                        </div>
                    </div>
                    <div className="mcq-completed-actions">
                        <button
                            className="mcq-popup-button mcq-primary-button"
                            onClick={() => {
                                setTestAlreadyCompleted(false);
                                setCompletedTestInfo(null);
                                setError(null);
                                setCurrentTest(null);
                                setQuestionIndex(0);
                                setAnswers({});
                                setSelectedTest(null);
                            }}
                        >
                            Back to All Tests
                        </button>
                        {isTestEnded(test.schedule) && (
                            <button
                                className="mcq-popup-button mcq-solution-btn"
                                onClick={handleViewSolution}
                            >
                                View Solution
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Enable proctoring dynamically if the assessment metadata has proctored flag enabled
    const shouldUseProctoring = Boolean(
        isEmbedded ? settings.proctored : (
            currentTest && (
                currentTest.testInfo?.proctored === true ||
                currentTest.testInfo?.proctored === 1 ||
                currentTest.testInfo?.proctored === "1" ||
                currentTest.testInfo?.proctored === "true"
            )
        )
    );

    // Audio proctoring is INDEPENDENT of camera proctoring.
    // Only activate when audioProctored is explicitly set \u2014 never inherit from proctored (camera).
    const shouldUseAudioProctoring = Boolean(
        isEmbedded
            ? Boolean(settings.audioProctored)   // embedded: use only audioProctored, never proctored
            : (currentTest && (
                currentTest.testInfo?.audioProctored === true ||
                currentTest.testInfo?.audioProctored === 1 ||
                currentTest.testInfo?.audioProctored === "1" ||
                currentTest.testInfo?.audioProctored === "true"
                // do NOT fall back to proctored (camera) flag here
            ))
    );

    // Main render
    if (startCountdown !== null) {
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'radial-gradient(circle at center, #0f172a, #020617)',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                fontFamily: "'Inter', sans-serif"
            }}>
                <div style={{ textAlign: 'center', maxWidth: '500px', padding: '20px' }}>
                    <div className="learn-spinner" style={{ width: '60px', height: '60px', borderTopColor: '#10b981', margin: '0 auto 24px' }}></div>
                    <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '8px', color: '#10b981', letterSpacing: '-0.02em' }}>
                        Preparing Secure Environment...
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '32px', lineHeight: '1.6' }}>
                        Setting up MCQ environment, proctoring controls, and loading questions.
                    </p>
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        padding: '24px 32px',
                        display: 'inline-block',
                        boxShadow: '0 4px 30px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', fontWeight: '700' }}>
                            Assessment Starts In
                        </div>
                        <div style={{ fontSize: '3.5rem', fontWeight: '900', color: 'white', fontFamily: 'monospace', lineHeight: '1' }}>
                            {startCountdown}s
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mcq-page">
            {/* Proctoring Engine - Active only when test is running (standalone mode only) */}
            {!isEmbedded && shouldUseProctoring && currentTest && !currentTest.submitted && user && (
                <ProctoringEngine
                    uid={user.email}
                    assessmentId={currentTest.testInfo?.id || currentTest.id || 'unknown'}
                    onAutoSubmit={() => {
                        window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
                        stopGlobalCameraStream();
                        setTimeout(() => {
                            handleAutoSubmit({ reason: 'proctoring_violations' });
                        }, 300);
                    }}
                    isTestActive={!!currentTest && !currentTest.submitted}
                    maxViolations={Number(currentTest.testInfo?.maxViolations) || 5}
                    onReady={() => {
                        console.log('[MCQPage] Camera proctoring ready');
                    }}
                    onViolationUpdate={(violationInfo) => {
                        if (!violationInfo?.violationType) return;
                        const maxLimit = Number(currentTest.testInfo?.maxViolations) || 5;
                        const count = typeof violationInfo.violationCount === 'number' ? violationInfo.violationCount : 0;
                        if (count >= maxLimit) {
                            window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
                            stopGlobalCameraStream();
                            setTimeout(() => {
                                handleAutoSubmit({ reason: 'proctoring_violations' });
                            }, 300);
                        }
                        setProctoringData(prev => {
                            const isRealViolation = ['no_face', 'multiple_faces', 'tab_switch'].includes(violationInfo.violationType);
                            return {
                                ...prev,
                                violationCount: typeof violationInfo.violationCount === 'number'
                                    ? violationInfo.violationCount
                                    : prev.violationCount,
                                violations: isRealViolation
                                    ? [
                                        ...prev.violations,
                                        {
                                            type: violationInfo.violationType,
                                            timestamp: violationInfo.timestamp
                                        }
                                    ]
                                    : prev.violations
                            };
                        });
                    }}
                />
            )}
            {/* Audio Proctoring Engine - active alongside camera when audioProctored is set */}
            {!isEmbedded && shouldUseAudioProctoring && currentTest && !currentTest.submitted && user && (
                <AudioProctoringEngine
                    uid={user.email}
                    assessmentId={currentTest.testInfo?.id || currentTest.id || 'unknown'}
                    isTestActive={!!currentTest && !currentTest.submitted}
                    maxViolations={Number(currentTest.testInfo?.maxAudioViolations) || Number(currentTest.maxAudioViolations) || 5}
                    onReady={() => {
                        console.log('[MCQPage] Audio proctoring ready');
                    }}
                    onViolationUpdate={(info) => {
                        if (!info?.type) return;
                        setProctoringData(prev => {
                            const nextAudioCount = (prev.audioViolationCount || 0) + 1;
                            const maxLimit = Number(currentTest.testInfo?.maxAudioViolations) || Number(currentTest.maxAudioViolations) || 5;
                            if (nextAudioCount >= maxLimit) {
                                window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
                                stopGlobalCameraStream();
                                setTimeout(() => {
                                    handleAutoSubmit({ reason: 'proctoring_violations' });
                                }, 300);
                            }
                            return {
                                ...prev,
                                audioViolationCount: nextAudioCount,
                                violations: [
                                    ...prev.violations,
                                    { type: info.type, timestamp: info.timestamp }
                                ]
                            };
                        });
                    }}
                />
            )}
            {renderVerifyingPopup()}
            {renderSubmittingPopup()}
            {renderNetworkPopup()}
            {renderTestCompletedPopup()}
            {loading ? (
                <div className="mcq-loading">Loading...</div>
            ) : viewingSolution ? (
                renderSolutionView()
            ) : error && !currentTest && !testAlreadyCompleted ? (
                <div className="mcq-error">{error}</div>
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

export default MCQPage;

