import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from './router-compat';
import Editor from '@monaco-editor/react';
import { FaPlay, FaCheck, FaTimes, FaUndo, FaArrowLeft, FaHourglassHalf, FaCode, FaListUl, FaSearch, FaLock, FaStar, FaCheckCircle, FaLightbulb } from 'react-icons/fa';
import desktopBridge, { isEngineDisconnected } from '../utils/desktopBridge';
import { fetchQuestion, fetchQuestionsIndex } from '../services/codingQuestionBankService';
import { markQuestionSolved, markQuestionAttempted, getQuestionProgress, getFullProgress, syncProgressWithFirebase, getQuestionDisplayStatus, trackQuestionTimeSpent, trackDailyActivity } from '../services/codingProgressService';
import { saveSolution } from '../services/userSolutionsService';
import { getAuthData } from '../utils/storageUtils';
import { toast } from 'sonner';
import '../styles/PracticeSandbox.css';

const FREE_BOILERPLATES = {
  c: `#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`,
  'c++': `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`,
  python: `print("Hello, World!")`,
  python3: `print("Hello, World!")`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`,
  javascript: `console.log("Hello, World!");`
};

const MONACO_LANG_MAP = {
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  java: 'java',
  python: 'python',
  python3: 'python',
  javascript: 'javascript'
};

const getBoilerplate = (boilerplatesObj, langKey) => {
  if (!langKey) return '';
  const clean = String(langKey).trim().toLowerCase();
  const b = boilerplatesObj || {};
  
  if (clean === 'java') {
    return b.java || b.Java || FREE_BOILERPLATES.java;
  }
  if (clean === 'python' || clean === 'python3' || clean === 'py') {
    return b.python3 || b.Python3 || b.python || b.Python || FREE_BOILERPLATES.python3;
  }
  if (clean === 'cpp' || clean === 'c++') {
    return b.cpp || b['C++'] || b['c++'] || FREE_BOILERPLATES.cpp;
  }
  if (clean === 'c') {
    return b.c || b.C || FREE_BOILERPLATES.c;
  }
  if (clean === 'javascript' || clean === 'js') {
    return b.javascript || b.JavaScript || b.js || FREE_BOILERPLATES.javascript;
  }
  return b[clean] || (FREE_BOILERPLATES[clean]  ?? '');
};

const normalizeQuestion = (q) => {
  if (!q) return q;
  const id = q.questionId || (q.id  ?? '');
  const title = q.title ?? '';
  let description = q.content?.problemStatement || (q.description  ?? '');

  if (description) {
    description = description.split(/#+\s*(?:videoExplanations|Video\s+Explanation|Video\s+Tutorial|video-explanation)/i)[0].trim();
  }

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

  // Valid language key names in boilerPlates — filter out non-code keys
  // Q1–Q79 boilerPlates objects may contain 'solution', '_internal', 'verified'
  // alongside real language keys. We whitelist only recognized language keys.
  const VALID_LANG_NAMES = new Set(['c', 'cpp', 'c++', 'java', 'python', 'python3', 'javascript', 'js', 'csharp', 'cs', 'ruby', 'go', 'rust', 'kotlin', 'swift', 'typescript', 'ts']);

  const rawBoilerplates = q.boilerPlates ?? {};
  const boilerplates = {};

  Object.entries(rawBoilerplates).forEach(([lang, val]) => {
    // Skip non-language keys that exist in canonical Q JSON boilerPlates
    if (!VALID_LANG_NAMES.has(String(lang).trim().toLowerCase())) return;
    if (typeof val !== 'string') return; // skip non-string values (e.g. nested objects)
    const norm = getNormalizedLangKey(lang);
    if (norm === 'python') {
      boilerplates.python = val;
      boilerplates.python3 = val;
    } else {
      boilerplates[norm] = val;
    }
  });

  // Normalize sample test cases
  const sampleTestCases = (q.content?.sampleTestCases || q.sampleTestCases || q.sampleTests || []).map(tc => ({
    ...tc,
    input: tc.input ?? '',
    expected: tc.expected || tc.output || tc.expectedOutput || (tc.expected_output  ?? '')
  }));

  // Normalize hidden test cases
  let hidden = [];
  if (q.testCases?.hidden) {
    hidden = q.testCases.hidden.map(tc => ({
      ...tc,
      id: tc.id || (tc.label  ?? ''),
      input: tc.input ?? '',
      expected: tc.expectedOutput || tc.expected || tc.output || (tc.expected_output  ?? '')
    }));
  } else if (Array.isArray(q.testCases)) {
    hidden = q.testCases.map(tc => ({
      ...tc,
      id: tc.id ?? '',
      input: tc.input ?? '',
      expected: tc.expected || tc.output || tc.expectedOutput || (tc.expected_output  ?? '')
    }));
  }

  return {
    ...q,
    id,
    title,
    description,
    constraints,
    boilerplates,
    sampleTestCases,
    sampleTests: sampleTestCases,
    hiddenTests: hidden,
    testCases: {
      ...q.testCases,
      hidden: hidden
    },
    content: q.content ? {
      ...q.content,
      problemStatement: description
    } : undefined
  };
};

const PracticeSandbox = () => {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  // Editor states
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');  // Used only for initial load, reset, and fallback
  const codeRef = useRef('');
  const editorRef = useRef(null);  // Direct editor instance — avoids setValue() on every render
  const [customInput, setCustomInput] = useState('');
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [activeLeftTab, setActiveLeftTab] = useState('description'); // 'description', 'solution'
  const [activeConsoleTab, setActiveConsoleTab] = useState('input'); // 'input', 'output', 'results', 'tutor'

  // AI Tutor state
  const [tutorHint, setTutorHint] = useState(null);
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const [tutorProgress, setTutorProgress] = useState(0);
  const [tutorError, setTutorError] = useState('');
  const [tutorMode, setTutorMode] = useState('hint'); // 'hint', 'complexity', 'review'

  useEffect(() => {
    setTutorHint(null);
    setTutorError('');
    setTutorProgress(0);
    setIsTutorLoading(false);
  }, [questionId]);

  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [exitCode, setExitCode] = useState(null);
  const [submitResults, setSubmitResults] = useState([]);
  const [submitScore, setSubmitScore] = useState(null);
  const [sampleResults, setSampleResults] = useState([]);
  const [scoringType, setScoringType] = useState('PARTIAL_SCORE');

  // Collapsible list sidebar states
  const [showSidebar, setShowSidebar] = useState(false);
  // Custom reset confirmation modal (replaces native window.confirm)
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDefaultResetConfirm, setShowDefaultResetConfirm] = useState(false);
  const [sidebarQuestions, setSidebarQuestions] = useState([]);
  const [solvedIds, setSolvedIds] = useState([]);
  const [attemptedIds, setAttemptedIds] = useState([]);
  const [problemDetails, setProblemDetails] = useState({});
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarDifficulty, setSidebarDifficulty] = useState('All');
  const [sidebarCategory, setSidebarCategory] = useState('All');
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [sidebarStatus, setSidebarStatus] = useState('All');

  // Resizable layout states
  const [leftWidth, setLeftWidth] = useState(42); // percentage
  const [editorHeight, setEditorHeight] = useState(60); // percentage
  const workspaceRef = useRef(null);
  const rightPanelRef = useRef(null);

  const isPremiumUser = Boolean(user?.isPremium);
  const hasTutorApiKey = (() => {
    if (localStorage.getItem('gemini_api_key') || localStorage.getItem('nvidia_api_key')) return true;
    try {
      const keys = JSON.parse(localStorage.getItem('user_api_keys') || '[]');
      return keys.some(k => k.active && k.value);
    } catch (e) {
      return false;
    }
  })();
  const isTutorUnlocked = isPremiumUser || hasTutorApiKey;
  const isPremiumQuestion = (questionId && String(questionId).startsWith('Q0.')) ? false : (question?.isPremium || question?.metadata?.isPremium);
  const showPremiumLock = isPremiumQuestion && !isPremiumUser;

  const startHorizontalDrag = (e) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent) => {
      if (!workspaceRef.current) return;
      const workspaceRect = workspaceRef.current.getBoundingClientRect();
      const newWidth = ((moveEvent.clientX - workspaceRect.left) / workspaceRect.width) * 100;
      if (newWidth > 15 && newWidth < 85) {
        setLeftWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const startVerticalDrag = (e) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent) => {
      if (!rightPanelRef.current) return;
      const panelRect = rightPanelRef.current.getBoundingClientRect();
      const newHeight = ((moveEvent.clientY - panelRect.top) / panelRect.height) * 100;
      if (newHeight > 20 && newHeight < 80) {
        setEditorHeight(newHeight);
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    const authData = getAuthData();
    setUser(authData);

    // Scoring override from location state if coming from module/contest
    if (location.state?.scoringType) {
      setScoringType(location.state.scoringType);
    }

    // Load sidebar questions list and user progress
    const loadSidebarData = async () => {
      try {
        // STRICT UID: canonical Practice identity is Firebase Auth UID only.
        const uid = authData?.uid ?? "";
        if (!uid) {
          console.warn('[PracticeSandbox] Firebase UID not available — progress sync skipped');
        } else if (navigator.onLine) {
          try {
            await syncProgressWithFirebase(uid);
          } catch (e) {
            console.warn('Sandbox sidebar sync failed:', e);
          }
        }
        let [indexQs, progress] = await Promise.all([
          fetchQuestionsIndex().catch(() => []),
          uid
            ? getFullProgress(uid).catch(() => ({ solvedProblems: [], problemDetails: {} }))
            : Promise.resolve({ solvedProblems: [], problemDetails: {} }),
        ]);
        if (questionId && !indexQs.some(q => q.questionId === questionId)) {
          try {
            const currentQ = await fetchQuestion(questionId);
            if (currentQ) {
              indexQs = [{
                questionId: currentQ.questionId,
                title: currentQ.title,
                category: currentQ.metadata?.category || 'Practice',
                difficulty: currentQ.metadata?.difficulty || 'Beginner'
              }, ...indexQs];
            }
          } catch (e) {}
        }
        setSidebarQuestions(indexQs);
        setSolvedIds(progress.completedQuestions || progress.solvedProblems || []);
        setAttemptedIds(progress.attemptedQuestions || []);
        setProblemDetails(progress.problemDetails || {});
      } catch (err) {
        console.warn('Failed to load sidebar data:', err);
      }
    };
    loadSidebarData();

    loadQuestionData(authData);
  }, [questionId]);

  const loadQuestionData = async (authData) => {
    setLoading(true);
    setShowContactInfo(false);
    setError(null);
    try {
      const qRaw = await fetchQuestion(questionId);
      if (!qRaw) {
        setError('Question not found or unavailable');
        setLoading(false);
        return;
      }
      const qData = normalizeQuestion(qRaw);
      setQuestion(qData);

      if (qData.scoring?.defaultScoringType) {
        setScoringType(qData.scoring.defaultScoringType);
      }

      // Detect default language
      const allowedLangs = qData.judging?.supportedLanguages || ['C', 'C++', 'Java', 'Python3', 'JavaScript'];
      const firstAllowed = allowedLangs[0] || 'Python3';
      const defaultLang = firstAllowed === 'Python3' ? 'python3' : firstAllowed === 'C++' ? 'cpp' : firstAllowed.toLowerCase();
      setLanguage(defaultLang);

      // Check if code is saved in local progress.
      const progressUid = authData?.uid ?? "";
      const progress = progressUid
        ? await getQuestionProgress(progressUid, questionId).catch(() => null)
        : null;
      if (!progressUid) {
        console.warn('[PracticeSandbox] No Firebase UID — saved code not loaded for question:', questionId);
      }
      let initialCode;
      if (progress && progress.submittedCode) {
        initialCode = progress.submittedCode.replace(/\r\n/g, '\n');
      } else {
        // Fallback to question-specific boilerplate, then free standard boilerplate template
        initialCode = getBoilerplate(qData.boilerplates, defaultLang).replace(/\r\n/g, '\n');
      }
      setCode(initialCode);
      // Push directly to editor model if already mounted (e.g. navigating between questions)
      if (editorRef.current) {
        editorRef.current.setValue(initialCode);
      }
    } catch (err) {
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        setError('This question is not yet configured or is temporarily unavailable in the sandbox.');
      } else {
        setError('Could not load question: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const prevLangRef = useRef(language);
  const prevQuestionIdRef = useRef(questionId);

  // Switch template only on manual language or questionId change
  // Uses editorRef.setValue() directly — never triggers a React re-render or cursor reset
  useEffect(() => {
    if (!question) return;
    if (prevLangRef.current !== language || prevQuestionIdRef.current !== questionId) {
      prevLangRef.current = language;
      prevQuestionIdRef.current = questionId;
      const newCode = getBoilerplate(question.boilerplates, language).replace(/\r\n/g, '\n');
      setCode(newCode);
      if (editorRef.current) {
        editorRef.current.setValue(newCode);
      }
      setStdout('');
      setStderr('');
      setExitCode(null);
      setSubmitResults([]);
      setSubmitScore(null);
    }
  }, [language, questionId, question]);

  const handleResetCode = () => {
    const defaultCode = getBoilerplate(question?.boilerplates, language).replace(/\r\n/g, '\n');
    setCode(defaultCode);
    if (editorRef.current) editorRef.current.setValue(defaultCode);
  };

  const handleResetToDefault = () => {
    const defaultCode = (FREE_BOILERPLATES[language] || FREE_BOILERPLATES[language === 'python3' ? 'python' : 'python3'] || '').replace(/\r\n/g, '\n');
    setCode(defaultCode);
    if (editorRef.current) editorRef.current.setValue(defaultCode);
  };

  const triggerTutorHint = async (overrideMode = null) => {
    if (!question) return;
    const modeToUse = overrideMode || tutorMode;
    if (!isTutorUnlocked) return;
    setIsTutorLoading(true);
    setTutorError('');
    setTutorHint(null);
    setTutorProgress(0);

    try {
      const { aiTutorService } = await import('../services/aiTutorService');
      
      const sampleTestCases = question.content?.sampleTestCases || [];
      const explanation = question.content?.explanation || sampleTestCases.map((s, idx) => s.explanation).filter(Boolean).join('\n') || '';
      
      const liveCode = editorRef.current ? editorRef.current.getValue() : code;
      const res = await aiTutorService.getHint({
        problemTitle: question.title,
        problemStatement: question.content?.problemStatement || (question.description  ?? ''),
        explanation: explanation,
        sampleTestCases: sampleTestCases,
        userCode: liveCode,
        compilerStderr: stderr ?? '',
        language: language,
        tutorMode: modeToUse,
        onProgress: (p) => setTutorProgress(p)
      });
      setTutorHint(res);
    } catch (err) {
      console.error("AI Tutor Hint fetch failed:", err);
      setTutorError("Failed to initialize or execute the AI Tutor. Please try again.");
    } finally {
      setIsTutorLoading(false);
    }
  };

  const renderTutorBody = () => {
    if (!isTutorUnlocked) {
      return (
        <div className="compiler-output-display tutor-panel-body" style={{ textAlign: 'center', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '180px', gap: '12px' }}>
          <FaLock style={{ color: '#fbbf24', fontSize: '32px', marginBottom: '8px' }} />
          <h5 style={{ color: 'var(--ps-text, #f8fafc)', margin: 0, fontWeight: 'bold' }}>AI Tutor is a Premium Feature</h5>
          <p style={{ color: 'var(--ps-text-dim, #94a3b8)', fontSize: '13px', maxWidth: '400px', margin: '0 auto', lineHeight: '1.5' }}>
            Upgrade your account to Premium Edition or connect your own API Key (Gemini/NVIDIA) in Portal Settings to get real-time explanations, complexity analysis, and code optimization hints.
          </p>
        </div>
      );
    }

    const activeStyle = {
      background: 'var(--ps-accent, #fbbf24)',
      color: '#000',
      border: 'none',
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer'
    };

    const inactiveStyle = {
      background: 'transparent',
      color: 'var(--ps-text-dim, #94a3b8)',
      border: '1px solid var(--ps-border, rgba(255,255,255,0.15))',
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer'
    };

    const handleModeSwitch = (mode) => {
      setTutorMode(mode);
      triggerTutorHint(mode);
    };

    let hintTitle = "Concept Hint & Error Explanation";
    let hintDisclaimer = "Tip: Try to solve the problem by typing code manually in the editor based on the hint above.";
    if (tutorMode === 'complexity') {
      hintTitle = "Time & Space Complexity Analysis";
      hintDisclaimer = "Tip: Look for redundant loops, nested operations, or unnecessary allocations.";
    } else if (tutorMode === 'review') {
      hintTitle = "Code Review & Optimization Suggestion";
      hintDisclaimer = "Tip: Optimize variable scopes, clean logic branching, and handle boundary checks.";
    }

    return (
      <div className="compiler-output-display tutor-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Mode Selector Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--ps-border, rgba(255,255,255,0.1))', paddingBottom: '12px' }}>
          <button style={tutorMode === 'hint' ? activeStyle : inactiveStyle} onClick={() => handleModeSwitch('hint')}>
            Concept Hint
          </button>
          <button style={tutorMode === 'complexity' ? activeStyle : inactiveStyle} onClick={() => handleModeSwitch('complexity')}>
            Complexity Analysis
          </button>
          <button style={tutorMode === 'review' ? activeStyle : inactiveStyle} onClick={() => handleModeSwitch('review')}>
            Code Review
          </button>
        </div>

        {/* Content Box */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {isTutorLoading ? (
            <div className="tutor-loading-container" style={{ padding: '20px 0' }}>
              <div className="tutor-spinner"></div>
              <p>Generating {tutorMode === 'hint' ? 'Concept Hint' : tutorMode === 'complexity' ? 'Complexity Analysis' : 'Code Review'}...</p>
              {tutorProgress > 0 && (
                <div className="tutor-progress-bar-container">
                  <div className="tutor-progress-bar-fill" style={{ width: `${tutorProgress}%` }}></div>
                  <span className="tutor-progress-text">{tutorProgress}% loaded</span>
                </div>
              )}
            </div>
          ) : tutorError ? (
            <div className="tutor-error-message" style={{ padding: '20px 0' }}>
              <FaTimes style={{ color: 'var(--ps-error, #ef4444)' }} />
              <p>{tutorError}</p>
              <button onClick={() => triggerTutorHint()} className="tutor-retry-btn">Retry</button>
            </div>
          ) : tutorHint ? (
            <div className="tutor-hint-container" style={{ margin: 0, padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--ps-border, rgba(255,255,255,0.1))', borderRadius: '10px' }}>
              <div className="tutor-hint-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <FaLightbulb className="tutor-hint-icon-glow" style={{ color: 'var(--ps-accent, #fbbf24)', marginRight: '8px', fontSize: '18px' }} />
                <strong style={{ fontSize: '14px', color: 'var(--ps-text, #f8fafc)' }}>{hintTitle}</strong>
              </div>
              <div className="tutor-hint-content">
                <p className="tutor-hint-text" style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--ps-text-dim, #cbd5e1)', whiteSpace: 'pre-wrap', margin: '0 0 12px 0' }}>{tutorHint.hint}</p>
                <span className="tutor-hint-disclaimer" style={{ fontSize: '11px', color: 'var(--ps-text-muted, #94a3b8)', fontStyle: 'italic' }}>
                  {hintDisclaimer}
                </span>
              </div>
            </div>
          ) : (
            <div className="tutor-idle-container" style={{ padding: '24px 0', textAlign: 'center' }}>
              <FaLightbulb className="tutor-idle-icon" style={{ fontSize: '36px', color: 'var(--ps-text-dim, #94a3b8)', marginBottom: '12px' }} />
              <p style={{ fontSize: '13.5px', color: 'var(--ps-text-dim, #cbd5e1)', marginBottom: '16px' }}>
                {tutorMode === 'hint' 
                  ? 'Having trouble passing the tests or debugging syntax errors?' 
                  : tutorMode === 'complexity' 
                    ? 'Analyze runtime complexity and space usage of your code.' 
                    : 'Get constructive feedback on logic flow, quality, and optimizations.'}
              </p>
              <button onClick={() => triggerTutorHint()} className="tutor-generate-btn">
                Analyze & Assist
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Yield a paint frame so the browser can update the UI (camera preview etc) before heavy execution
  const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  // Compile and run custom input or sample cases
  const handleRunCode = async () => {
    setIsRunning(true);
    setActiveConsoleTab('output');
    setStdout('Running execution...');
    setStderr('');
    setExitCode(null);
    setSampleResults([]);

    try {
      const bridgeLang = language === 'python3' ? 'python' : language;
      const currentCode = editorRef.current ? editorRef.current.getValue() : code;

      // Yield to browser paint loop before heavy execution so camera/UI stays live
      await yieldFrame();

      if (useCustomInput || !question.sampleTestCases || question.sampleTestCases.length === 0) {
        const result = await Promise.race([
          desktopBridge.runDirectSandbox(bridgeLang, currentCode, customInput),
          new Promise(resolve => setTimeout(() => resolve({ error: 'Execution Timed Out (Limit 6s)', stderr: 'Execution Timed Out (Limit 6s)', exit_code: -1 }), 6000))
        ]);
        setStdout(result.stdout || (result.exit_code === 0 && !result.stderr ? 'Execution completed with no output.' : ''));
        setStderr(result.stderr || (result.error  ?? ''));
        setExitCode(result.exit_code === undefined ? null : result.exit_code);
      } else {
        const results = [];
        const samples = question.sampleTestCases || [];
        for (let i = 0; i < samples.length; i++) {
          const tc = samples[i];
          // Yield between each test case to keep UI responsive
          if (i > 0) await yieldFrame();
          const res = await Promise.race([
            desktopBridge.runDirectSandbox(bridgeLang, currentCode, tc.input),
            new Promise(resolve => setTimeout(() => resolve({ error: 'Execution Timed Out (Limit 6s)', stderr: 'Execution Timed Out (Limit 6s)', exit_code: -1 }), 6000))
          ]);

          if (isEngineDisconnected(res)) {
            results.push({
              index: i + 1,
              input: tc.input,
              expected: (tc.expected || (tc.expectedOutput  ?? '')).toString().replace(/\r\n/g, '\n').trim(),
              actual: '',
              stderr: 'Evaluation engine not connected. Please restart the application or rerun the code.',
              passed: false,
              exitCode: -1
            });
            break; // Stop running further sample test cases!
          }

          const actualClean = (res.stdout ?? '').replace(/\r\n/g, '\n').trim();
          const expectedClean = (tc.expected || (tc.expectedOutput  ?? '')).toString().replace(/\r\n/g, '\n').trim();
          const isPassed = actualClean === expectedClean && res.exit_code === 0;

          results.push({
            index: i + 1,
            input: tc.input,
            expected: expectedClean,
            actual: res.stdout ?? '',
            stderr: res.stderr || (res.error  ?? ''),
            passed: isPassed,
            exitCode: res.exit_code
          });
        }
        setSampleResults(results);

        // Populate exitCode, stdout, stderr with last sample case for fallback
        const last = results[results.length - 1];
        if (last) {
          setStdout(last.actual);
          setStderr(last.stderr);
          setExitCode(last.exitCode);
        }
      }
    } catch (err) {
      setStderr(`Execution Failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

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

  // Submit code against hidden test cases
  const handleSubmitCode = async () => {
    if (!question) return;
    setIsSubmitting(true);
    setActiveConsoleTab('results');
    setSubmitResults([]);
    setSubmitScore(null);

    const testCases = question.testCases?.hidden || [];
    const results = [];
    let passedCount = 0;
    let totalWeight = 0;
    let earnedWeight = 0;

    // Canonical Practice identity: user prop -> getAuthData() -> Firebase Auth UID
    const authStorage = getAuthData();
    const uid = user?.uid ?? authStorage?.uid ?? '';
    if (!uid) {
      console.warn('[PracticeSandbox] No authenticated UID at submit — progress may not sync');
    }

    try {
      const bridgeLang = language === 'python3' ? 'python' : language;
      const currentCode = editorRef.current ? editorRef.current.getValue() : code;
      const isBlank = isCodeBlankOrEmpty(currentCode);

      await yieldFrame();
      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const tcWeight = tc.weight || 10;
        totalWeight += tcWeight;

        // Yield between each hidden test case to keep UI/camera responsive
        if (i > 0) await yieldFrame();
        const res = isBlank
          ? { stdout: '', stderr: 'No code submitted in editor.', exit_code: 1 }
          : await Promise.race([
              desktopBridge.runDirectSandbox(bridgeLang, currentCode, tc.input),
              new Promise(resolve => setTimeout(() => resolve({ error: 'Time Limit Exceeded (5s)', stderr: 'Time Limit Exceeded (5s)', exit_code: -1 }), 5000))
            ]);

        if (isEngineDisconnected(res)) {
          results.push({
            id: tc.id || `tc_${i + 1}`,
            passed: false,
            input: tc.input,
            expected: (tc.expected || (tc.expectedOutput  ?? '')).toString().replace(/\r\n/g, '\n').trim(),
            actual: '',
            stderr: 'Evaluation engine not connected. Please restart the application or rerun the code.'
          });
          break; // Stop running further hidden test cases!
        }

        const actualClean = (res.stdout ?? '').replace(/\r\n/g, '\n').trim();
        const expectedClean = (tc.expected || (tc.expectedOutput  ?? '')).toString().replace(/\r\n/g, '\n').trim();
        const isPassed = !isBlank && (actualClean === expectedClean) && res.exit_code === 0 && !res.error;

        if (isPassed) {
          passedCount++;
          earnedWeight += tcWeight;
        }

        results.push({
          id: tc.id || `tc_${i + 1}`,
          passed: isPassed,
          input: tc.input,
          expected: expectedClean,
          actual: actualClean,
          stderr: isBlank ? 'No code submitted in editor.' : (res.stderr || (res.error  ?? ''))
        });
      }

      setSubmitResults(results);

      // Compute score based on scoring type
      let score = 0;
      if (scoringType === 'FULL_SCORE') {
        score = (passedCount === testCases.length) ? 100 : 0;
      } else {
        score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
      }
      setSubmitScore(score);

      // Save progress (currentCode already captured at start of try block)
      if (uid) {
        const nowMs = Date.now();
        const questionOpenedAt = window._practiceQuestionOpenedAt || nowMs;
        const timeSpentMs = nowMs - questionOpenedAt;

        const qMeta = {
          difficulty: question?.difficulty || 'Easy',
          category: question?.category ?? '',
          title: question?.title || question?.name || questionId
        };

        if (score === 100) {
          await markQuestionSolved(uid, questionId, language, score, 1, qMeta);
          setSolvedIds(prev => [...new Set([...prev, questionId])]);
          setAttemptedIds(prev => prev.filter(id => id !== questionId));

          // LeetCode-style: store accepted solution in Firestore
          await saveSolution(uid, {
            questionId,
            questionTitle: question?.title || question?.name || questionId,
            language,
            code: currentCode,
            status: 'accepted',
            testsPassed: passedCount,
            testsTotal: testCases.length,
            executionTimeMs: 0,
            isPractice: true,
          });
        } else {
          await markQuestionAttempted(uid, questionId, language, score, 1, qMeta);
          if (!solvedIds.includes(questionId)) {
            setAttemptedIds(prev => [...new Set([...prev, questionId])]);
          }

          // Store wrong-answer submission too
          await saveSolution(uid, {
            questionId,
            questionTitle: question?.title || question?.name || questionId,
            language,
            code: currentCode,
            status: score > 0 ? 'partial' : 'wrong_answer',
            testsPassed: passedCount,
            testsTotal: testCases.length,
            executionTimeMs: 0,
            isPractice: true,
          });
        }

        // Track time + daily activity
        await trackQuestionTimeSpent(uid, questionId, timeSpentMs);
        await trackDailyActivity(uid, { questionsAttempted: 1, timeSpentMs });
        window._practiceQuestionOpenedAt = nowMs; // reset timer for next attempt

        setProblemDetails(prev => ({
          ...prev,
          [questionId]: {
            ...prev[questionId],
            bestScore: Math.max(score, prev[questionId]?.bestScore || 0)
          }
        }));
      }
    } catch (err) {
      toast.error('Testing failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="psb-root" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="psb-spinner" style={{ width: '40px', height: '40px' }} />
        <p style={{ marginTop: '16px', color: '#94a3b8' }}>Loading workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="psb-root" style={{ justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
        <p style={{ color: '#f87171' }}>{error}</p>
        <button className="psb-back-btn" onClick={() => navigate(-1)}>← Go Back</button>
      </div>
    );
  }

  const supportedLanguages = question.judging?.supportedLanguages || ['C', 'C++', 'Java', 'Python3', 'JavaScript'];

  // Filter sidebar questions
  const filteredSidebarQuestions = sidebarQuestions.filter(q => {
    const isSolved = solvedIds.includes(q.questionId);
    const isAttempted = attemptedIds.includes(q.questionId) || (Object.keys(problemDetails).includes(q.questionId) && !isSolved);
    const status = isSolved ? 'SOLVED' : isAttempted ? 'ATTEMPTED' : 'UNSOLVED';

    const matchesSearch = !sidebarSearch ||
      q.title?.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
      q.questionId?.toLowerCase().includes(sidebarSearch.toLowerCase());
    const matchesDiff = sidebarDifficulty === 'All' || q.difficulty === sidebarDifficulty;
    const matchesCat = sidebarCategory === 'All' || q.category === sidebarCategory;
    const matchesStatus = sidebarStatus === 'All' || status === sidebarStatus;
    return matchesSearch && matchesDiff && matchesCat && matchesStatus;
  });

  const sidebarCategories = [...new Set(sidebarQuestions.map(q => q.category).filter(Boolean))];

  return (
    <div className="psb-root">
      {/* Header */}
      <div className="psb-header">
        <button className="psb-back-btn" onClick={() => navigate('/student/dashboard', { state: { tab: 'practice' } })}>Home</button>
        <button className="psb-back-btn" onClick={() => navigate(-1)}>← Back</button>

        {/* Toggle Sidebar Button */}
        <button
          className={`psb-back-btn ${showSidebar ? 'active' : ''}`}
          onClick={() => setShowSidebar(!showSidebar)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          title="Toggle Problem List"
        >
          <FaListUl /> {showSidebar ? 'Hide List' : 'Problem List'}
        </button>

        <div className="psb-title">
          {question.questionId} – {question.title}
        </div>
        <div className="psb-q-nav">
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="psb-lang-select"
          >
            {supportedLanguages.map(lang => {
              const val = lang === 'Python3' ? 'python3' : (lang === 'JavaScript' || lang === 'JS' ? 'javascript' : lang.toLowerCase());
              return <option key={val} value={val}>{lang}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="psb-main" ref={workspaceRef}>

        {/* Collapsible Problems List Sidebar */}
        <div className={`psb-sidebar ${!showSidebar ? 'collapsed' : ''}`}>
          <div className="psb-sidebar-header">
            <div className="psb-sidebar-title-row">
              <span className="psb-sidebar-title">Problem List</span>
              <span className="psb-sidebar-solved-count">
                {solvedIds.length}/{sidebarQuestions.length} Solved
              </span>
            </div>
            <div className="psb-sidebar-search-wrap">
              <FaSearch className="psb-sidebar-search-icon" />
              <input
                type="text"
                placeholder="Search questions..."
                value={sidebarSearch}
                onChange={e => setSidebarSearch(e.target.value)}
                className="psb-sidebar-search"
              />
            </div>
            {/* Filter Row */}
            <div className="psb-sidebar-filters">
              <select
                value={sidebarDifficulty}
                onChange={e => setSidebarDifficulty(e.target.value)}
                className="psb-sidebar-filter-select"
              >
                <option value="All">All Difficulty</option>
                <option value="Beginner">Beginner</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
              <select
                value={sidebarStatus}
                onChange={e => setSidebarStatus(e.target.value)}
                className="psb-sidebar-filter-select"
              >
                <option value="All">All Status</option>
                <option value="SOLVED">Solved</option>
                <option value="ATTEMPTED">Attempted</option>
                <option value="UNSOLVED">Todo</option>
              </select>
              <select
                value={sidebarCategory}
                onChange={e => setSidebarCategory(e.target.value)}
                className="psb-sidebar-filter-select"
              >
                <option value="All">All Topics</option>
                {sidebarCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>
          <div className="psb-sidebar-list">
            {filteredSidebarQuestions.map((q, idx) => {
              const isActive = q.questionId === questionId;
              const status = getQuestionDisplayStatus(q.questionId, solvedIds, problemDetails, q.isPremium || q.metadata?.isPremium, isPremiumUser, attemptedIds);

              return (
                <div
                  key={q.questionId ? `${q.questionId}-${idx}` : `q-${idx}`}
                  className={`psb-sidebar-item ${isActive ? 'active' : ''} ${status === 'LOCKED' ? 'locked' : ''}`}
                  onClick={() => navigate(`/student/practice/solve/${q.questionId}`, { state: { scoringType } })}
                >
                  <span className="psb-sidebar-item-status" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {status === 'SOLVED' ? <FaCheckCircle style={{ color: 'var(--ps-success)' }} /> : status === 'ATTEMPTED' ? <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24' }}></span> : status === 'LOCKED' ? <FaLock style={{ color: 'var(--ps-text-dim)', fontSize: '11px' }} /> : <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', border: '2px solid var(--ps-text-dim)', opacity: 0.6 }}></span>}
                  </span>
                  <span className="psb-sidebar-item-title">
                    {idx + 1}. {q.title} {(q.isPremium || q.metadata?.isPremium) && <FaStar style={{ color: '#fbbf24', marginLeft: '4px', fontSize: '11px' }} />}
                  </span>
                  <span className={`psb-sidebar-item-diff ${q.difficulty?.toLowerCase() || 'easy'}`}>
                    {q.difficulty ?? ''}
                  </span>
                </div>
              );
            })}
            {filteredSidebarQuestions.length === 0 && (
              <div style={{ color: 'var(--ps-text-dim)', textAlign: 'center', padding: '20px', fontSize: '13px' }}>
                No questions match search.
              </div>
            )}
          </div>
        </div>

        {/* Left Side - Description */}
        <div className="psb-problem-panel" style={{ width: `${leftWidth}%` }} onClick={() => setShowSidebar(false)}>
          <div className="psb-problem-tabs">
            <div className={`psb-problem-tab ${activeLeftTab === 'description' ? 'active' : ''}`} onClick={() => setActiveLeftTab('description')}>
              Problem Description
            </div>
            <div className={`psb-problem-tab ${activeLeftTab === 'solution' ? 'active' : ''}`} onClick={() => setActiveLeftTab('solution')}>
              Editorial Solution
            </div>
          </div>

          <div className="psb-problem-content" style={{ position: 'relative' }}>
            <div style={{ filter: showPremiumLock ? 'blur(6px)' : 'none', pointerEvents: showPremiumLock ? 'none' : 'auto', transition: 'filter 0.3s', height: '100%' }}>
              {activeLeftTab === 'description' ? (
                <>
                  <h2 className="psb-problem-title">{question.title}</h2>
                  <div className="psb-q-badges">
                    <span className={`psb-badge ${question.metadata?.difficulty?.toLowerCase() || 'easy'}`}>
                      {question.metadata?.difficulty}
                    </span>
                    <span className="psb-badge cat">{question.metadata?.category}</span>
                    {question.metadata?.isPremium && <span className="psb-badge premium" style={{ display: 'inline-flex', alignItems: 'center' }}><FaStar style={{ marginRight: '4px' }} /> Premium</span>}
                  </div>

                  <div className="psb-section-label">Problem Statement</div>
                  <div className="psb-problem-text">{question.content?.problemStatement}</div>

                  <div className="psb-section-label">Input Format</div>
                  <div className="psb-problem-text">{question.content?.inputFormat ?? ''}</div>

                  <div className="psb-section-label">Output Format</div>
                  <div className="psb-problem-text">{question.content?.outputFormat || 'Print standard output.'}</div>

                  {question.content?.constraints && (
                    <>
                      <div className="psb-section-label">Constraints</div>
                      {Array.isArray(question.content.constraints) ? (
                        question.content.constraints.length > 0 && (
                          <ul className="psb-constraints-list">
                            {question.content.constraints.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        )
                      ) : (
                        <div className="psb-problem-text">{String(question.content.constraints)}</div>
                      )}
                    </>
                  )}

                  {question.content?.sampleTestCases && question.content.sampleTestCases.map((s, i) => (
                    <div className="psb-sample" key={i}>
                      <div className="psb-sample-label">Sample Case {i + 1}</div>
                      <div className="psb-sample-row">
                        <div className="psb-sample-col">
                          <label>Input</label>
                          <pre>{s.input ?? ''}</pre>
                        </div>
                        <div className="psb-sample-col">
                          <label>Expected Output</label>
                          <pre>{s.output}</pre>
                        </div>
                      </div>
                      {s.explanation && (
                        <div className="psb-sample-explanation">
                          <strong>Explanation:</strong> {s.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <h3 style={{ marginBottom: '12px' }}>Editorial Solution</h3>
                  {solvedIds.includes(question.questionId) ? (
                    question.solution?.approach ? (
                      <>
                        <div className="psb-section-label">Approach</div>
                        <div className="psb-problem-text">{question.solution.approach}</div>
                        <div className="psb-section-label">Complexity</div>
                        <div className="psb-problem-text">
                          Time Complexity: <code>{question.solution.timeComplexity ?? ''}</code>
                          <br />
                          Space Complexity: <code>{question.solution.spaceComplexity ?? ''}</code>
                        </div>
                      </>
                    ) : (
                      <p style={{ color: 'var(--ps-text-dim)' }}>Editorial solution details not supplied for this question.</p>
                    )
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px 20px',
                      textAlign: 'center',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '12px',
                      border: '1px dashed rgba(255,255,255,0.08)',
                      marginTop: '20px'
                    }}>
                      <div style={{ fontSize: '28px', marginBottom: '16px', color: 'var(--ps-text-dim)', display: 'inline-flex', alignItems: 'center' }}><FaLock /></div>
                      <h4 style={{ color: 'var(--ps-text)', marginBottom: '8px' }}>Editorial Solution Locked</h4>
                      <p style={{ color: 'var(--ps-text-dim)', fontSize: '13px', maxWidth: '300px', margin: '0 auto' }}>
                        You need to successfully solve this problem and pass all test cases to unlock the editorial approach and complexity analysis.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {showPremiumLock && (
              <div className="premium-lock-overlay" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.45)',
                backdropFilter: 'blur(4px)',
                color: '#1f2937',
                padding: '24px',
                textAlign: 'center',
                zIndex: 10,
                borderRadius: '8px'
              }}>
                <div style={{
                  fontSize: '36px',
                  marginBottom: '16px',
                  color: '#1e1b4b'
                }}>
                  <FaLock />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#1e1b4b' }}>
                  Premium Practice Question
                </h3>
                <p style={{ fontSize: '14px', color: '#4b5563', maxWidth: '320px', marginBottom: '20px', lineHeight: '1.5', textAlign: 'center' }}>
                  This question is reserved for Premium subscribers. Please upgrade to unlock this and all other standard coding practice questions.
                </p>
                <button
                  onClick={() => setShowContactInfo(true)}
                  style={{
                    background: 'var(--ps-primary)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    padding: '10px 20px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(124,107,255,0.2)',
                    transition: 'all 0.2s',
                    marginBottom: '12px'
                  }}
                >
                  Upgrade to Premium
                </button>
                {showContactInfo && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '13px',
                    color: '#dc2626',
                    fontWeight: '600',
                    maxWidth: '300px',
                    background: 'rgba(220,38,38,0.08)',
                    border: '1px solid rgba(220,38,38,0.2)',
                    borderRadius: '6px',
                    padding: '8px 12px'
                  }}>
                    To upgrade, please reach out to your Placement Department or contact your SEED-IT Training Manager.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drag Divider Horizontal */}
        <div className="psb-resizer-h" onMouseDown={startHorizontalDrag} />

        {/* Right Side - Monaco Editor + Outputs */}
        <div className="psb-editor-panel" ref={rightPanelRef} style={{ width: `${100 - leftWidth}%` }} onClick={() => setShowSidebar(false)}>
          <div className="psb-editor-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="psb-run-btn"
              onClick={handleRunCode}
              disabled={isRunning || isSubmitting || showPremiumLock}
              style={{ opacity: showPremiumLock ? 0.6 : 1, cursor: showPremiumLock ? 'not-allowed' : 'pointer' }}
            >
              {isRunning ? <div className="psb-spinner" /> : <FaPlay />} Run Code
            </button>
            <button
              className="psb-submit-btn"
              onClick={handleSubmitCode}
              disabled={isRunning || isSubmitting || showPremiumLock}
              style={{ opacity: showPremiumLock ? 0.6 : 1, cursor: showPremiumLock ? 'not-allowed' : 'pointer' }}
            >
              {isSubmitting ? <div className="psb-spinner" /> : <FaCheck />} Submit Answers
            </button>
            <button className="psb-reset-btn" onClick={handleResetCode} disabled={showPremiumLock}>
              <FaUndo /> Reset Template
            </button>
            <button className="psb-reset-btn" onClick={handleResetToDefault} disabled={showPremiumLock} title="Reset to empty main function template">
              <FaCode /> Reset to Default
            </button>
          </div>

          <div className="psb-editor-wrap" style={{ height: `${editorHeight}%` }}>
            <Editor
              key={`${questionId}_${language}`}
              height="100%"
              language={MONACO_LANG_MAP[language] ?? ''}
              theme={['light', 'red-light'].includes(localStorage.getItem('portal_theme')) ? 'light' : 'vs-dark'}
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
                readOnly: showPremiumLock,
                wordWrap: 'off'
              }}
            />
          </div>

          {/* Drag Divider Vertical */}
          <div className="psb-resizer-v" onMouseDown={startVerticalDrag} />

          {/* Console / Outputs */}
          <div className="psb-results" style={{ height: `${100 - editorHeight}%`, maxHeight: 'none' }}>
            <div className="psb-results-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span className={`psb-problem-tab ${activeConsoleTab === 'input' ? 'active' : ''}`} onClick={() => setActiveConsoleTab('input')}>
                  Custom Input
                </span>
                <span className={`psb-problem-tab ${activeConsoleTab === 'output' ? 'active' : ''}`} onClick={() => setActiveConsoleTab('output')}>
                  Run Output
                </span>
                <span className={`psb-problem-tab ${activeConsoleTab === 'results' ? 'active' : ''}`} onClick={() => setActiveConsoleTab('results')}>
                  Submit Results ({submitResults.length})
                </span>
                <span className={`psb-problem-tab ${activeConsoleTab === 'tutor' ? 'active' : ''}`} onClick={() => setActiveConsoleTab('tutor')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FaLightbulb style={{ color: 'var(--ps-accent, #fbbf24)' }} /> AI Tutor
                  {!isTutorUnlocked && <FaStar style={{ color: '#fbbf24', fontSize: '10px' }} title="Premium Feature" />}
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ps-text-dim)', cursor: 'pointer', userSelect: 'none', marginRight: '10px' }}>
                <input
                  type="checkbox"
                  checked={useCustomInput}
                  onChange={(e) => {
                    setUseCustomInput(e.target.checked);
                    if (e.target.checked) {
                      setActiveConsoleTab('input');
                    }
                  }}
                />
                <span>Run custom testcase</span>
              </label>
            </div>

            <div style={{ padding: '12px', height: 'calc(100% - 40px)', overflowY: 'auto' }}>
              {activeConsoleTab === 'input' && (
                <textarea
                  style={{
                    width: '100%',
                    height: 'calc(100% - 10px)',
                    minHeight: '80px',
                    background: 'var(--ps-bg)',
                    border: '1px solid var(--ps-border)',
                    borderRadius: '8px',
                    color: 'var(--ps-text)',
                    padding: '8px',
                    fontFamily: 'var(--ps-mono)',
                    fontSize: '13px',
                    resize: 'none',
                    outline: 'none'
                  }}
                  placeholder="Provide input arguments to inject into standard input (stdin)..."
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                />
              )}

              {activeConsoleTab === 'output' && (
                <div style={{ background: 'var(--ps-bg)', padding: '12px', borderRadius: '8px', minHeight: '80px', overflowY: 'auto' }}>
                  {stderr && (
                    <div className="tutor-prompt-banner" style={{
                      background: 'rgba(251, 191, 36, 0.08)',
                      border: '1px solid rgba(251, 191, 36, 0.25)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaLightbulb style={{ color: '#fbbf24', fontSize: '16px', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: 'var(--ps-text-dim, #94a3b8)', fontWeight: '500' }}>
                          Confused by this compilation error? Get a concept hint from the AI Tutor.
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setActiveConsoleTab('tutor');
                          if (isTutorUnlocked) {
                            triggerTutorHint();
                          }
                        }}
                        style={{
                          background: 'var(--ps-accent, #fbbf24)',
                          color: '#000',
                          border: 'none',
                          padding: '4px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                         Ask AI Tutor {!isTutorUnlocked && <FaStar style={{ fontSize: '10px' }} />}
                      </button>
                    </div>
                  )}
                  {isRunning ? (
                    <div style={{ color: 'var(--ps-text-dim)' }}>Executing sandbox environment...</div>
                  ) : sampleResults && sampleResults.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {sampleResults.map((res) => (
                        <div key={res.index} style={{
                          border: '1px solid var(--ps-border)',
                          borderRadius: '8px',
                          padding: '12px',
                          background: 'var(--ps-panel)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--ps-text)' }}>Sample Case {res.index}</strong>
                            <span style={{
                              color: res.passed ? 'var(--ps-success)' : 'var(--ps-error)',
                              fontWeight: 'bold',
                              fontSize: '13px'
                            }}>
                              {res.passed ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                            <div>
                              <div style={{ color: 'var(--ps-text-dim)', marginBottom: '4px' }}>Input:</div>
                              <pre style={{ background: 'var(--ps-card)', color: 'var(--ps-text)', padding: '6px', borderRadius: '4px', margin: 0, fontFamily: 'var(--ps-mono)' }}>{res.input ?? ''}</pre>
                            </div>
                            <div>
                              <div style={{ color: 'var(--ps-text-dim)', marginBottom: '4px' }}>Expected Output:</div>
                              <pre style={{ background: 'var(--ps-card)', color: 'var(--ps-text)', padding: '6px', borderRadius: '4px', margin: 0, fontFamily: 'var(--ps-mono)' }}>{res.expected}</pre>
                            </div>
                          </div>
                          <div style={{ marginTop: '8px', fontSize: '12px' }}>
                            <div style={{ color: 'var(--ps-text-dim)', marginBottom: '4px' }}>Actual Output:</div>
                            <pre style={{
                              background: 'var(--ps-card)',
                              padding: '6px',
                              borderRadius: '4px',
                              margin: 0,
                              fontFamily: 'var(--ps-mono)',
                              color: res.passed ? 'var(--ps-text)' : 'var(--ps-error)'
                            }}>{res.actual ?? ''}</pre>
                          </div>
                          {res.stderr && (
                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ps-error)' }}>
                              <strong>Error:</strong>
                              <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--ps-card)', color: 'var(--ps-error)', padding: '6px', borderRadius: '4px', marginTop: '4px', fontFamily: 'var(--ps-mono)' }}>{res.stderr}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : stderr ? (
                    <div style={{ color: 'var(--ps-error)' }}>
                      <strong>Compile / Runtime Error:</strong>
                      <pre style={{ whiteSpace: 'pre-wrap', marginTop: '6px', fontFamily: 'var(--ps-mono)' }}>{stderr}</pre>
                    </div>
                  ) : stdout ? (
                    <div>
                      <div style={{ color: 'var(--ps-success)', fontWeight: 'bold' }}>Exit Code: {exitCode}</div>
                      <pre style={{ whiteSpace: 'pre-wrap', marginTop: '6px', fontFamily: 'var(--ps-mono)', color: 'var(--ps-text)' }}>{stdout}</pre>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--ps-text-dim)' }}>Click "Run Code" to compile standard inputs.</div>
                  )}
                </div>
              )}

              {activeConsoleTab === 'tutor' && renderTutorBody()}

              {activeConsoleTab === 'results' && (
                <div>
                  {isSubmitting ? (
                    <div style={{ color: 'var(--ps-text-dim)', textAlign: 'center', padding: '20px' }}>
                      <div className="psb-spinner" style={{ marginRight: '8px' }} /> Checking all hidden test cases...
                    </div>
                  ) : submitResults.length === 0 ? (
                    <div style={{ color: 'var(--ps-text-dim)' }}>Click "Submit Answers" to validate compilation against test suites.</div>
                  ) : (
                    <div>
                      <div className={`psb-score-banner ${submitScore === 100 ? 'pass' : submitScore > 0 ? 'partial' : 'fail'}`}>
                        {submitScore === 100 ? 'All Test Cases Passed!' : `Partial Score: ${submitScore}/100`}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', maxHeight: '150px', overflowY: 'auto' }}>
                        {submitResults.map((tr, i) => (
                          <div key={tr.id} className="psb-test-case-row" style={{
                            borderLeft: `3px solid ${tr.passed ? 'var(--ps-success)' : 'var(--ps-error)'}`
                          }}>
                            <span>Test Case {i + 1} ({tr.id})</span>
                            <span className="psb-test-case-status" style={{ color: tr.passed ? 'var(--ps-success)' : 'var(--ps-error)', fontWeight: 'bold' }}>
                              {tr.passed ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PracticeSandbox;
