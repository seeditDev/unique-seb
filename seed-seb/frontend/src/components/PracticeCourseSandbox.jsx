import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from './router-compat';
import Editor from '@monaco-editor/react';
import { 
  FaPlay, FaCheck, FaHourglassHalf, 
  FaListUl, FaChevronRight, FaCheckCircle, FaStar
} from 'react-icons/fa';
import desktopBridge, { isEngineDisconnected } from '../utils/desktopBridge';
import { fetchQuestion } from '../services/codingQuestionBankService';
import { 
  markQuestionSolved, markQuestionAttempted, getQuestionProgress, 
  getFullProgress 
} from '../services/codingProgressService';
import { getAuthData } from '../utils/storageUtils';
import { fetchArticleFile } from '../utils/articleFetcher';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import '../styles/PracticeSandbox.css'; // Reuse core sandbox tokens and styling

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
  return b[clean] || (FREE_BOILERPLATES[clean] ?? '');
};


const EDITOR_OPTIONS = {
  fontFamily: 'var(--ps-mono)',
  fontSize: 14,
  minimap: { enabled: false },
  scrollbar: { vertical: 'visible', horizontal: 'visible' },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  tabSize: 4
};

const normalizeQuestion = (q) => {
  if (!q) return q;
  if (q.questions && Array.isArray(q.questions)) {
    return {
      ...q,
      questionId: q.id,
      title: q.name,
      source: { contentType: 'practice_test' },
      metadata: { category: 'PracticeTest' }
    };
  }
  const id = q.questionId || (q.id ?? '');
  const title = q.title ?? '';
  let description = q.content?.problemStatement || (q.description ?? '');
  
  if (description) {
    description = description.split(/#+\s*(?:videoExplanations|Video\s+Explanation|Video\s+Tutorial|video-explanation)/i)[0].trim();
  }

  const constraints = Array.isArray(q.content?.constraints)
    ? q.content.constraints.join('\n')
    : (q.constraints ?? '');

  const getNormalizedLangKey = (k) => {
    const clean = String(k).trim().toLowerCase();
    if (clean === 'c') return 'c';
    if (clean === 'cpp' || clean === 'c++') return 'cpp';
    if (clean === 'java') return 'java';
    if (clean === 'python' || clean === 'python3') return 'python';
    if (clean === 'javascript' || clean === 'js') return 'javascript';
    return clean;
  };

  // Valid language key names — filter out non-language keys that exist in canonical Q JSON
  // (e.g. 'solution', '_internal', 'verified' appear in boilerPlates of Q1-Q79)
  const VALID_LANG_NAMES = new Set(['c', 'cpp', 'c++', 'java', 'python', 'python3', 'javascript', 'js', 'csharp', 'cs', 'ruby', 'go', 'rust', 'kotlin', 'swift', 'typescript', 'ts']);

  const rawBoilerplates = q.boilerPlates || q.boilerPlates || {};
  const boilerplates = {};

  Object.entries(rawBoilerplates).forEach(([lang, val]) => {
    if (!VALID_LANG_NAMES.has(String(lang).trim().toLowerCase())) return;
    if (typeof val !== 'string') return;
    const norm = getNormalizedLangKey(lang);
    if (norm === 'python') {
      boilerplates.python = val;
      boilerplates.python3 = val;
    } else {
      boilerplates[norm] = val;
    }
  });

  const sampleTestCases = (q.content?.sampleTestCases || q.sampleTestCases || q.sampleTests || []).map(tc => ({
    ...tc,
    input: tc.input ?? '',
    expected: tc.expected || tc.output || tc.expectedOutput || (tc.expected_output ?? '')
  }));

  let hidden = [];
  if (q.testCases?.hidden) {
    hidden = q.testCases.hidden.map(tc => ({
      ...tc,
      id: tc.id || (tc.label ?? ''),
      input: tc.input ?? '',
      expected: tc.expectedOutput || tc.expected || tc.output || (tc.expected_output ?? '')
    }));
  } else if (Array.isArray(q.testCases)) {
    hidden = q.testCases.map(tc => ({
      ...tc,
      id: tc.id ?? '',
      input: tc.input ?? '',
      expected: tc.expected || tc.output || tc.expectedOutput || (tc.expected_output ?? '')
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

// Formatter to render Markdown statements cleanly
const formatProblemText = (text) => {
  if (!text) return '';
  // Simple styling replacer
  return text.split('\n\n').map((para, idx) => {
    let clean = para
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="psb-inline-code">$1</code>')
      // Render basic bullet points
      .replace(/^\s*[-*]\s+(.*)$/gm, '<li class="psb-li-item">$1</li>');

    if (clean.includes('<li class="psb-li-item">')) {
      return <ul key={idx} className="psb-para-ul" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(clean) }} />;
    }
    return <p key={idx} className="psb-para" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(clean) }} />;
  });
};

const PracticeCourseSandbox = () => {
  const { courseId, questionId } = useParams();
  const navigate = useNavigate();

  const [question, setQuestion] = useState(null);
  const [syllabusQuestions, setSyllabusQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(() => getAuthData());

  // Editor & Compile states
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');  // Used only for initial load/reset
  const codeRef = useRef('');
  const editorRef = useRef(null);  // Direct editor instance to avoid setValue() on re-renders
  const [customInput, setCustomInput] = useState('');
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState('output');

  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [exitCode, setExitCode] = useState(null);
  const [submitResults, setSubmitResults] = useState([]);
  const [submitScore, setSubmitScore] = useState(null);

  // Practice Test states
  const [testSelections, setTestSelections] = useState({});
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [testScore, setTestScore] = useState(0);

  useEffect(() => {
    setTestSelections({});
    setTestSubmitted(false);
    setTestScore(0);
  }, [questionId]);

  const [activeArticle, setActiveArticle] = useState(null);

  const handleContentClick = async (e) => {
    const target = e.target.closest('a');
    if (!target) return;
    const href = target.getAttribute('href');
    if (href && (href.startsWith('#/articles/') || href.includes('AptitudeCourses'))) {
      e.preventDefault();
      const localPath = href.replace('#/', '');
      const cleanPath = localPath.endsWith('.json') ? localPath : `${localPath}.json`;
      try {
        const response = await fetchArticleFile(cleanPath);
        if (response.ok) {
          const data = await response.json();
          setActiveArticle({
            title: data.title,
            content: data.content?.problemStatement || (data.description ?? ''),
            url: href,
            isExternal: false
          });
        }
      } catch (err) {
        console.error("Error loading linked article:", err);
      }
    }
  };

  // Sidebar / list states
  const [showSidebar, setShowSidebar] = useState(false);
  const [solvedIds, setSolvedIds] = useState([]);

  // Show course completion celebration badge modal
  const [showAwardModal, setShowAwardModal] = useState(false);

  useEffect(() => {
    const authData = getAuthData();
    setUser(authData);

    const loadCourseAndQuestion = async () => {
      setLoading(true);
      setError(null);
      try {
        // STRICT UID: canonical Practice identity is Firebase Auth UID only.
        const uid = authData?.uid ?? '';
        if (!uid) {
          console.warn('[PracticeCourseSandbox] Firebase UID not available — progress not loaded');
        }

        // 1. Fetch current question
        const qRaw = await fetchQuestion(questionId);
        if (!qRaw) {
          setError('Question not found or unavailable');
          setLoading(false);
          return;
        }
        const qData = normalizeQuestion(qRaw);
        setQuestion(qData);

        // 2. Fetch solved progress
        const progress = uid
          ? await getFullProgress(uid).catch(() => ({ solvedProblems: [], problemDetails: {} }))
          : { solvedProblems: [], problemDetails: {} };
        setSolvedIds(progress.solvedProblems || []);

        // 3. Detect default language based on Course & Question Boilerplates
        const allowedLangs = qData.judging?.supportedLanguages || ['C', 'C++', 'Java', 'Python3', 'JavaScript'];
        let firstAllowed = allowedLangs[0] || 'Python3';
        
        // Override default language matching the course type
        const courseIdLower = courseId.toLowerCase();
        if (courseIdLower.includes('cpp')) firstAllowed = 'C++';
        else if (courseIdLower.includes('java') && !courseIdLower.includes('javascript')) firstAllowed = 'Java';
        else if (courseIdLower.includes('javascript') || courseIdLower.includes('html') || courseIdLower.includes('css')) firstAllowed = 'JavaScript';
        else if (courseIdLower.includes('c-beginner') || courseIdLower.includes('college-programming-c') || courseIdLower === 'learn_c') firstAllowed = 'C';
        else if (courseIdLower.includes('rust')) firstAllowed = 'Rust';
        else if (courseIdLower.includes('go')) firstAllowed = 'Go';
        else if (courseIdLower.includes('kotlin')) firstAllowed = 'Kotlin';
        else if (courseIdLower.includes('sql')) firstAllowed = 'SQL';
        else if (courseIdLower.includes('csharp') || courseIdLower.includes('c-sharp')) firstAllowed = 'C#';

        const defaultLang = firstAllowed === 'Python3' ? 'python3' : 
                            firstAllowed === 'C++' ? 'cpp' : 
                            firstAllowed === 'C#' ? 'csharp' : 
                            firstAllowed.toLowerCase();
        setLanguage(defaultLang);

        // Check if code was previously saved
        const qProg = await getQuestionProgress(uid, questionId);
        if (qProg && qProg.submittedCode) {
          const savedCode = (qProg.submittedCode ?? '').replace(/\r\n/g, '\n');
          setCode(savedCode);
          if (editorRef.current) editorRef.current.setValue(savedCode);
        } else {
          // Check if this question is a worked example / demonstration
          const stmt = qData.description || (qData.content?.problemStatement ?? '');
          const lowerStmt = stmt.toLowerCase();
          const isExample = lowerStmt.includes('in this example') || 
                            lowerStmt.includes('we demonstrate') || 
                            lowerStmt.includes('worked example') ||
                            lowerStmt.includes('display structured message') ||
                            lowerStmt.includes('try running the code') ||
                            lowerStmt.includes('let\'s look at an example') ||
                            lowerStmt.includes('for example') ||
                            lowerStmt.includes('worked example -');

          if (isExample) {
            // Try to extract expected output block
            let expectedText = null;
            const regexList = [
              /\*\*Expected Output:\*\*\s*[\r\n]+```(?:default)?\s*([\s\S]*?)```/i,
              /\*\*When executed, the code will display[\s\S]*?:\*\*\s*[\r\n]+```(?:default)?\s*([\s\S]*?)```/i,
              /```default\s*([\s\S]*?)```/i
            ];
            for (const r of regexList) {
              const match = stmt.match(r);
              if (match && match[1]) {
                expectedText = match[1].trim();
                break;
              }
            }
            if (!expectedText) {
              expectedText = "Hello, World!";
            }

            // Generate code that prints expectedText
            const escaped = expectedText.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const lines = escaped.split('\n');
            let initialCode = '';
            if (defaultLang === 'c') {
              const prints = lines.map(line => `    printf("${line}\\n");`).join('\n');
              initialCode = `#include <stdio.h>\n\nint main() {\n${prints}\n    return 0;\n}`;
            } else if (defaultLang === 'cpp') {
              const prints = lines.map(line => `    cout << "${line}" << endl;`).join('\n');
              initialCode = `#include <iostream>\nusing namespace std;\n\nint main() {\n${prints}\n    return 0;\n}`;
            } else if (defaultLang === 'java') {
              const prints = lines.map(line => `        System.out.println("${line}");`).join('\n');
              initialCode = `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n${prints}\n    }\n}`;
            } else if (defaultLang === 'python3' || defaultLang === 'python') {
              initialCode = lines.map(line => `print("${line}")`).join('\n');
            } else {
              initialCode = getBoilerplate(qData.boilerplates, defaultLang);
            }
            const normalized = initialCode.replace(/\r\n/g, '\n');
            setCode(normalized);
            if (editorRef.current) editorRef.current.setValue(normalized);
          } else {
            const initialCode = getBoilerplate(qData.boilerplates, defaultLang);
            const normalized = initialCode.replace(/\r\n/g, '\n');
            setCode(normalized);
            if (editorRef.current) editorRef.current.setValue(normalized);
          }
        }

        // 4. Load Course Syllabus to obtain the connected sequence
        let flatSequence = [];
        if (courseId.startsWith('learn_') && courseId !== 'learn_python') {
          const courseSlug = courseId.substring(6); // remove 'learn_'
          let syllabusPath = `CourseMappingFiles/learn-${courseSlug}-syllabus.json`;
          if (courseId === 'learn_aptitude') {
            syllabusPath = 'course/AptitudeCourses/learn-aptitude-syllabus.json';
          }
          const res = await fetchArticleFile(syllabusPath);
          if (res.ok) {
            const syllabusData = await res.json();
            let firstModProblemCount = 0;
            syllabusData.modules.forEach((m, mIdx) => {
              m.submodules.forEach(s => {
                s.problems.forEach(p => {
                  let isPremium = true;
                  if (mIdx === 0) {
                    if (firstModProblemCount < 4) {
                      isPremium = false;
                    }
                    firstModProblemCount++;
                  }
                  flatSequence.push({
                    questionId: p.id,
                    title: p.name,
                    category: p.contentType === 'mcq' ? 'Concept' : 'Practice',
                    moduleName: m.name,
                    submoduleName: s.name,
                    isPremium: isPremium
                  });
                });
              });
            });
          }
        } else if (courseId === 'programming_fundamentals') {
          // Build sequence from modules
          const moduleUrls = [
            'FPS001', 'FPS002', 'FPS003', 'FPS004', 'FPS005', 'FPS006', 'FPS007'
          ];
          const moduleNames = {
            'FPS001': 'Basic Datatypes & Variables',
            'FPS002': 'Conditional Statements',
            'FPS003': 'Looping',
            'FPS004': 'Number Crunching',
            'FPS005': 'Number Based Problems',
            'FPS006': 'Arrays',
            'FPS007': 'Strings'
          };
          const modulePaths = {
            'FPS001': 'basic-datatypes.json',
            'FPS002': 'conditional-statements.json',
            'FPS003': 'looping.json',
            'FPS004': 'number-crunching.json',
            'FPS005': 'number-based-problems.json',
            'FPS006': 'arrays.json',
            'FPS007': 'strings.json'
          };

          for (const mid of moduleUrls) {
            let res;
            try {
              res = await fetch(`https://raw.githubusercontent.com/seeditDev/seed-contents/main/coding/${modulePaths[mid]}`);
            } catch (_) {}
            if (!res || !res.ok) {
              try {
                res = await fetch(`/seed-contents/coding/${modulePaths[mid]}`);
              } catch (_) {}
            }
            if (res && res.ok) {
              const data = await res.json();
              (data.questionIds || []).forEach(qid => {
                flatSequence.push({
                  questionId: qid,
                  title: `Task ${qid}`,
                  category: 'Practice',
                  moduleName: moduleNames[mid] || 'Fundamentals',
                  submoduleName: data.title ?? '',
                  isPremium: false
                });
              });
            }
          }
        }

        setSyllabusQuestions(flatSequence);

        const seqItem = flatSequence.find(item => item.questionId === questionId);
        const isPremiumQ = seqItem ? !!seqItem.isPremium : false;
        const isPremiumUser = Boolean(authData?.isPremium);

        if (isPremiumQ && !isPremiumUser) {
          throw new Error('Premium Course Module. Please upgrade your SEED-IT account to access this lesson.');
        }
      } catch (err) {
        console.error('[PracticeCourseSandbox] Error loading data:', err);
        setError('Could not load course workspace: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    loadCourseAndQuestion();
  }, [courseId, questionId]);

  const prevLangRef = useRef(language);
  const prevQuestionIdRef = useRef(questionId);

  // Switch templates on manual language or questionId change
  // Synchronizes code, codeRef.current, and editorRef.setValue()
  useEffect(() => {
    if (!question) return;
    if (prevLangRef.current !== language || prevQuestionIdRef.current !== questionId) {
      prevLangRef.current = language;
      prevQuestionIdRef.current = questionId;

      let newCode = getBoilerplate(question.boilerplates, language);

      // If worked example/demonstration, generate appropriate printing code for the language
      const stmt = question.description || (question.content?.problemStatement ?? '');
      const lowerStmt = stmt.toLowerCase();
      const isExample = lowerStmt.includes('in this example') || 
                        lowerStmt.includes('we demonstrate') || 
                        lowerStmt.includes('worked example') ||
                        lowerStmt.includes('display structured message') ||
                        lowerStmt.includes('try running the code') ||
                        lowerStmt.includes('let\'s look at an example') ||
                        lowerStmt.includes('for example') ||
                        lowerStmt.includes('worked example -');

      if (isExample && (!question.boilerplates || !question.boilerplates[language])) {
        let expectedText = null;
        const regexList = [
          /\*\*Expected Output:\*\*\s*[\r\n]+```(?:default)?\s*([\s\S]*?)```/i,
          /\*\*When executed, the code will display[\s\S]*?:\*\*\s*[\r\n]+```(?:default)?\s*([\s\S]*?)```/i,
          /```default\s*([\s\S]*?)```/i
        ];
        for (const r of regexList) {
          const match = stmt.match(r);
          if (match && match[1]) {
            expectedText = match[1].trim();
            break;
          }
        }
        if (!expectedText) expectedText = "Hello, World!";
        const escaped = expectedText.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const lines = escaped.split('\n');

        if (language === 'c') {
          const prints = lines.map(line => `    printf("${line}\\n");`).join('\n');
          newCode = `#include <stdio.h>\n\nint main() {\n${prints}\n    return 0;\n}`;
        } else if (language === 'cpp' || language === 'c++') {
          const prints = lines.map(line => `    cout << "${line}" << endl;`).join('\n');
          newCode = `#include <iostream>\nusing namespace std;\n\nint main() {\n${prints}\n    return 0;\n}`;
        } else if (language === 'java') {
          const prints = lines.map(line => `        System.out.println("${line}");`).join('\n');
          newCode = `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) {\n${prints}\n    }\n}`;
        } else if (language === 'python3' || language === 'python') {
          newCode = lines.map(line => `print("${line}")`).join('\n');
        } else if (language === 'javascript' || language === 'js') {
          newCode = lines.map(line => `console.log("${line}");`).join('\n');
        }
      }

      const cleanCode = (newCode ?? '').replace(/\r\n/g, '\n');
      setCode(cleanCode);
      codeRef.current = cleanCode;
      if (editorRef.current) {
        editorRef.current.setValue(cleanCode);
      }
      setStdout('');
      setStderr('');
      setExitCode(null);
      setSubmitResults([]);
      setSubmitScore(null);
    }
  }, [language, questionId, question]);

  const currentIndex = syllabusQuestions.findIndex(q => q.questionId === questionId);
  const nextItem = currentIndex !== -1 && currentIndex < syllabusQuestions.length - 1 ? syllabusQuestions[currentIndex + 1] : null;
  const prevItem = currentIndex > 0 ? syllabusQuestions[currentIndex - 1] : null;

  // Yield a paint frame so the browser can update UI (camera preview) before heavy execution
  const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  const handleRunCode = async () => {
    setIsRunning(true);
    setActiveConsoleTab('output');
    setStdout('Compiling and executing code...');
    setStderr('');
    setExitCode(null);

    try {
      const bridgeLang = language === 'python3' ? 'python' : language;
      const currentCode = editorRef.current ? editorRef.current.getValue() : code;

      await yieldFrame();
        if (useCustomInput || !question?.sampleTestCases || question.sampleTestCases.length === 0) {
        const result = await Promise.race([
          desktopBridge.runDirectSandbox(bridgeLang, currentCode, customInput),
          new Promise(resolve => setTimeout(() => resolve({ error: 'Execution Timed Out (Limit 6s)', stderr: 'Execution Timed Out (Limit 6s)', exit_code: -1 }), 6000))
        ]);
        setStdout(result.stdout || (result.exit_code === 0 && !result.stderr ? 'Execution completed successfully with no output.' : ''));
        setStderr(result.stderr || (result.error ?? ''));
        setExitCode(result.exit_code === undefined ? null : result.exit_code);
      } else {
        const results = [];
        const samples = question.sampleTestCases || [];
        for (let i = 0; i < samples.length; i++) {
          const tc = samples[i];
          if (i > 0) await yieldFrame();
          const res = await Promise.race([
            desktopBridge.runDirectSandbox(bridgeLang, currentCode, tc.input),
            new Promise(resolve => setTimeout(() => resolve({ error: 'Execution Timed Out (Limit 6s)', stderr: 'Execution Timed Out (Limit 6s)', exit_code: -1 }), 6000))
          ]);

          if (isEngineDisconnected(res)) {
            results.push({
              index: i + 1,
              input: tc.input,
              expected: (tc.expected || (tc.expectedOutput ?? '')).toString().replace(/\r\n/g, '\n').trim(),
              actual: '',
              stderr: 'Evaluation engine not connected. Please restart the application or rerun the code.',
              passed: false,
              exitCode: -1
            });
            break; // Stop running further sample test cases!
          }

          const actualClean = (res.stdout ?? '').replace(/\r\n/g, '\n').trim();
          const expectedClean = (tc.expected || (tc.expectedOutput ?? '')).toString().replace(/\r\n/g, '\n').trim();
          const isPassed = actualClean === expectedClean && res.exit_code === 0;

          results.push({
            index: i + 1,
            input: tc.input,
            expected: expectedClean,
            actual: res.stdout ?? '',
            stderr: res.stderr || (res.error ?? ''),
            passed: isPassed,
            exitCode: res.exit_code
          });
        }
        const last = results[results.length - 1];
        if (last) {
          setStdout(last.actual);
          setStderr(last.stderr);
          setExitCode(last.exitCode);
        }
      }
    } catch (err) {
      setStderr(`Sandbox execution failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const checkCourseCompletion = async (newSolvedIds) => {
    const isCompleted = syllabusQuestions.every(q => newSolvedIds.includes(q.questionId));
    if (isCompleted) {
      setShowAwardModal(true);
    }
  };

  const handleMarkConceptComplete = async () => {
    const uid = user?.uid ?? getAuthData()?.uid ?? "";
    if (!uid || !questionId) return;

    try {
      const pMeta = {
        difficulty: problem?.difficulty || 'Easy',
        category: problem?.category ?? '',
        title: problem?.title || problem?.name || questionId
      };
      await markQuestionSolved(uid, questionId, 'concept', 100, 1, pMeta);
      const updatedSolved = [...new Set([...solvedIds, questionId])];
      setSolvedIds(updatedSolved);
      checkCourseCompletion(updatedSolved);
      toast.success(`Concept marked as complete!`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update progress.');
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

  const handleSubmitCode = async () => {
    setIsSubmitting(true);
    setActiveConsoleTab('results');
    setSubmitResults([]);
    setSubmitScore(null);

    const testCases = question.testCases?.hidden || [];
    const results = [];
    let passedCount = 0;
    let totalWeight = 0;
    let earnedWeight = 0;
    // STRICT UID: canonical Practice identity is Firebase Auth UID only.
    const uid = user?.uid ?? getAuthData()?.uid ?? "";
    if (!uid) {
      console.warn('[PracticeCourseSandbox] No Firebase UID at submit — progress not saved');
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
            expected: (tc.expected || (tc.expectedOutput ?? '')).toString().replace(/\r\n/g, '\n').trim(),
            actual: '',
            stderr: 'Evaluation engine not connected. Please restart the application or rerun the code.'
          });
          break; // Stop running further hidden test cases!
        }

        const actualClean = (res.stdout ?? '').replace(/\r\n/g, '\n').trim();
        const expectedClean = (tc.expected || (tc.expectedOutput ?? '')).toString().replace(/\r\n/g, '\n').trim();
        
        // Handle placeholder test cases gracefully (code runs successfully & compiles)
        const isPlaceholder = expectedClean === 'expected' || expectedClean === 'expectedoutput';
        const isPassed = !isBlank && (isPlaceholder ? actualClean.length > 0 : actualClean === expectedClean) && res.exit_code === 0 && !res.error;

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
          stderr: isBlank ? 'No code submitted in editor.' : (res.stderr || (res.error ?? ''))
        });
      }

      setSubmitResults(results);
      const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : (passedCount === testCases.length ? 100 : 0);
      setSubmitScore(score);

      if (uid) {
        const pMeta = {
          difficulty: problem?.difficulty || 'Easy',
          category: problem?.category ?? '',
          title: problem?.title || problem?.name || questionId
        };

        if (score === 100) {
          await markQuestionSolved(uid, questionId, language, score, 1, pMeta);
          const updatedSolved = [...new Set([...solvedIds, questionId])];
          setSolvedIds(updatedSolved);
          checkCourseCompletion(updatedSolved);
          toast.success(` Problem Solved! 100% test cases passed.`);
        } else {
          await markQuestionAttempted(uid, questionId, language, score, 1, pMeta);
          toast.info(`Tests completed: ${passedCount}/${testCases.length} passed (${score}%).`);
        }
      }
    } catch (err) {
      toast.error('Verification test failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToCourse = () => {
    navigate('/student/dashboard', { state: { tab: 'practice', activeCourse: courseId } });
  };

  if (loading) {
    return (
      <div className="psb-root" style={{ justifyContent: 'center', alignItems: 'center', background: 'var(--ps-bg, #f8fafc)' }}>
        <div className="psb-spinner" style={{ width: '40px', height: '40px', borderTopColor: 'var(--ps-primary, #15803d)' }} />
        <p style={{ marginTop: '16px', color: 'var(--ps-text-dim, #64748b)', fontFamily: 'sans-serif' }}>Connecting code compiler & loading topics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="psb-root" style={{ justifyContent: 'center', alignItems: 'center', gap: '16px', background: '#090915' }}>
        <p style={{ color: '#f87171', fontFamily: 'sans-serif' }}>{error}</p>
        <button className="psb-back-btn" onClick={handleBackToCourse}>← Return to Course</button>
      </div>
    );
  }

  const isPracticeTest = question.source?.contentType === 'practice_test' || question.metadata?.category === 'PracticeTest';
  const isMcq = question.metadata?.category === 'Concept' || question.source?.contentType === 'mcq' || isPracticeTest;
  const isSolved = solvedIds.includes(questionId);

  return (
    <div className="psb-root" style={{ background: 'var(--ps-bg)', fontFamily: 'var(--ps-font)' }}>
      
      {/* Sleek Minimalist Header */}
      <div className="psb-header" style={{ borderBottom: '1px solid var(--ps-border)', background: 'var(--ps-panel)', padding: '0 20px', height: '56px' }}>
        <button className="psb-back-btn" onClick={handleBackToCourse} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ps-text)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ps-border)', borderRadius: '6px', padding: '6px 12px' }}>
          ← Course Curriculum
        </button>

        <button 
          className="psb-back-btn" 
          onClick={() => setShowSidebar(!showSidebar)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px', background: showSidebar ? 'var(--ps-primary-light)' : 'rgba(255,255,255,0.02)', border: '1px solid var(--ps-border)', color: showSidebar ? 'var(--ps-primary)' : 'var(--ps-text)' }}
        >
          <FaListUl /> Syllabus Topics ({currentIndex + 1}/{syllabusQuestions.length})
        </button>

        <div className="psb-title" style={{ flex: 1, textAlign: 'center', fontWeight: '700', letterSpacing: '-0.02em', fontSize: '15px' }}>
          {question.title} {isSolved && <span style={{ color: 'var(--ps-success)', marginLeft: '6px', fontSize: '12px', fontWeight: 'bold' }}>Solved</span>}
        </div>

        {!isMcq && (
          <select 
            value={language} 
            onChange={e => setLanguage(e.target.value)} 
            className="psb-lang-select"
            style={{ padding: '6px 14px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', color: 'var(--ps-text)', border: '1px solid var(--ps-border)', fontWeight: 'bold' }}
          >
            {(question.judging?.supportedLanguages || ['C', 'C++', 'Java', 'Python3', 'JavaScript']).map(lang => {
              const val = lang === 'Python3' ? 'python3' : (lang === 'JavaScript' || lang === 'JS' ? 'javascript' : lang.toLowerCase());
              return <option key={lang} value={val}>{lang}</option>;
            })}
          </select>
        )}
      </div>

      {/* Main Learning Workspace */}
      <div className="psb-main" style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        
        {/* Collapsible Course Topics Sidebar Drawer */}
        <div className={`psb-sidebar ${!showSidebar ? 'collapsed' : ''}`} style={{ background: 'var(--ps-panel)', borderRight: '1px solid var(--ps-border)', transition: 'all 0.3s ease' }}>
          <div className="psb-sidebar-header" style={{ padding: '16px', borderBottom: '1px solid var(--ps-border)' }}>
            <div className="psb-sidebar-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span className="psb-sidebar-title" style={{ fontWeight: 'bold', fontSize: '15px' }}>Course Syllabus</span>
              <span style={{ fontSize: '12px', background: 'var(--ps-primary-light)', color: 'var(--ps-primary)', padding: '2px 8px', borderRadius: '100px', fontWeight: 'bold' }}>
                {solvedIds.length}/{syllabusQuestions.length} Done
              </span>
            </div>
          </div>
          <div className="psb-sidebar-list" style={{ overflowY: 'auto', flex: 1 }}>
            {syllabusQuestions.map((s, idx) => {
              const active = s.questionId === questionId;
              const solved = solvedIds.includes(s.questionId);
              return (
                <div 
                  key={s.questionId}
                  className={`psb-sidebar-item ${active ? 'active' : ''}`}
                  onClick={() => {
                    setShowSidebar(false);
                    navigate(`/student/practice/course/${courseId}/${s.questionId}`);
                  }}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    background: active ? 'rgba(124,107,255,0.08)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {solved ? <FaCheckCircle style={{ color: 'var(--ps-success)' }} /> : <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', border: '2px solid var(--ps-text-dim)', opacity: 0.6 }} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: active ? 'var(--ps-primary)' : 'var(--ps-text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ps-text-dim)', marginTop: '2px' }}>
                      {s.moduleName} • {s.category}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Left Side: Concept & Reading Content */}
        <div className="psb-problem-panel" style={{ width: isMcq ? '100%' : '45%', borderRight: isMcq ? 'none' : '1px solid var(--ps-border)', background: 'var(--ps-panel)', display: 'flex', flexDirection: 'column' }}>
          <div className="psb-problem-tabs" style={{ padding: '0 20px', borderBottom: '1px solid var(--ps-border)', height: '40px', display: 'flex', alignItems: 'center' }}>
            <div className="psb-problem-tab active" style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Concept Lesson & Description
            </div>
          </div>
          <div className="psb-problem-content" onClick={handleContentClick} style={{ padding: '24px 30px', overflowY: 'auto', flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: '0 0 16px 0', letterSpacing: '-0.02em' }}>{question.title}</h1>
            
            <div style={{ fontSize: '14px', lineHeight: '1.7', color: 'var(--ps-text)' }}>
              {isPracticeTest ? (
                <div style={{ marginTop: '20px' }}>
                  <p style={{ color: 'var(--ps-text-dim)', marginBottom: '20px' }}>
                    Welcome to the practice test. Answer all questions correctly to complete this topic module. You have unlimited retakes.
                  </p>
                  
                  {testSubmitted && (
                    <div style={{
                      padding: '16px',
                      background: testScore === question.questions.length ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
                      border: '1px solid ' + (testScore === question.questions.length ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'),
                      borderRadius: '8px',
                      marginBottom: '24px',
                      textAlign: 'center'
                    }}>
                      <h3 style={{ margin: '0 0 8px 0', color: testScore === question.questions.length ? '#4ade80' : '#f87171' }}>
                        {testScore === question.questions.length ? ' Perfect Score!' : ' Attempt Finished'}
                      </h3>
                      <p style={{ margin: '0', fontSize: '15px', fontWeight: 'bold' }}>
                        Your Score: {testScore} / {question.questions.length}
                      </p>
                      {testScore < question.questions.length && (
                        <button
                          onClick={() => {
                            setTestSelections({});
                            setTestSubmitted(false);
                            setTestScore(0);
                          }}
                          style={{
                            marginTop: '12px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 14px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          Retake Test
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {(question.questions || []).map((q, idx) => {
                      const isCorrect = testSelections[q.id] === q.correctAnswer;
                      const selected = testSelections[q.id];
                      return (
                        <div key={q.id ? `${q.id}-${idx}` : `q-${idx}`} style={{
                          padding: '20px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--ps-border)',
                          borderRadius: '8px'
                        }}>
                          <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 'bold' }}>
                            {idx + 1}. {q.question}
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {(q.options || []).map(opt => {
                              const isOptSelected = selected === opt;
                              let optBg = 'rgba(255,255,255,0.03)';
                              let optBorder = 'var(--ps-border)';
                              if (isOptSelected) {
                                optBg = 'rgba(124,107,255,0.15)';
                                optBorder = 'var(--ps-primary)';
                              }
                              if (testSubmitted) {
                                if (opt === q.correctAnswer) {
                                  optBg = 'rgba(74,222,128,0.15)';
                                  optBorder = '#4ade80';
                                } else if (isOptSelected && opt !== q.correctAnswer) {
                                  optBg = 'rgba(239,68,68,0.15)';
                                  optBorder = '#ef4444';
                                }
                              }
                              return (
                                <label
                                  key={opt}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '12px 16px',
                                    background: optBg,
                                    border: '1px solid ' + optBorder,
                                    borderRadius: '6px',
                                    cursor: testSubmitted ? 'default' : 'pointer',
                                    fontSize: '13px'
                                  }}
                                >
                                  {!testSubmitted && (
                                    <input
                                      type="radio"
                                      name={`q_${q.id}`}
                                      value={opt}
                                      checked={isOptSelected}
                                      onChange={() => setTestSelections({ ...testSelections, [q.id]: opt })}
                                      style={{ cursor: 'pointer' }}
                                    />
                                  )}
                                  <span>{opt}</span>
                                </label>
                              );
                            })}
                          </div>

                          {testSubmitted && (
                            <div style={{
                              marginTop: '16px',
                              padding: '12px',
                              background: 'rgba(255,255,255,0.01)',
                              borderLeft: '4px solid ' + (isCorrect ? '#4ade80' : '#ef4444'),
                              fontSize: '13px'
                            }}>
                              <div style={{ fontWeight: 'bold', color: isCorrect ? '#4ade80' : '#ef4444', marginBottom: '4px' }}>
                                {isCorrect ? ' Correct' : ` Incorrect (Correct Answer: ${q.correctAnswer})`}
                              </div>
                              <div style={{ color: 'var(--ps-text-dim)' }}>
                                <strong>Explanation:</strong> {q.explanation}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!testSubmitted && (
                    <button
                      onClick={() => {
                        let score = 0;
                        (question.questions || []).forEach(q => {
                          if (testSelections[q.id] === q.correctAnswer) {
                            score++;
                          }
                        });
                        setTestScore(score);
                        setTestSubmitted(true);
                        if (score === question.questions.length) {
                          handleMarkConceptComplete();
                        }
                      }}
                      disabled={Object.keys(testSelections).length < (question.questions || []).length}
                      style={{
                        marginTop: '30px',
                        background: Object.keys(testSelections).length < (question.questions || []).length ? 'rgba(255,255,255,0.08)' : 'var(--ps-primary)',
                        color: Object.keys(testSelections).length < (question.questions || []).length ? 'rgba(255,255,255,0.3)' : 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        padding: '12px 24px',
                        cursor: Object.keys(testSelections).length < (question.questions || []).length ? 'default' : 'pointer',
                        width: '100%',
                        fontSize: '14px'
                      }}
                    >
                      {Object.keys(testSelections).length < (question.questions || []).length
                        ? `Answer All Questions to Submit (${Object.keys(testSelections).length}/${(question.questions || []).length})`
                        : 'Submit Test Answers'
                      }
                    </button>
                  )}
                </div>
              ) : (
                formatProblemText(question.description)
              )}
            </div>

            {/* Input & Output Specifications for Practice Problems */}
            {!isMcq && (
              <div style={{ marginTop: '30px', borderTop: '1px solid var(--ps-border)', paddingTop: '20px' }}>
                {question.content?.inputFormat && (
                  <>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '16px 0 6px 0', textTransform: 'uppercase', color: 'var(--ps-primary)' }}>Input Format</h3>
                    <p style={{ fontSize: '13px', color: 'var(--ps-text-dim)', margin: '0 0 16px 0' }}>{question.content.inputFormat}</p>
                  </>
                )}
                
                {question.content?.outputFormat && (
                  <>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '16px 0 6px 0', textTransform: 'uppercase', color: 'var(--ps-primary)' }}>Output Format</h3>
                    <p style={{ fontSize: '13px', color: 'var(--ps-text-dim)', margin: '0 0 16px 0' }}>{question.content.outputFormat}</p>
                  </>
                )}

                {question.content?.constraints && question.content.constraints.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '16px 0 6px 0', textTransform: 'uppercase', color: 'var(--ps-primary)' }}>Constraints</h3>
                    <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px', fontSize: '13px', color: 'var(--ps-text-dim)' }}>
                      {question.content.constraints.map((c, idx) => <li key={idx}>{c}</li>)}
                    </ul>
                  </>
                )}

                {/* Sample Test Cases UI */}
                {question.sampleTestCases && question.sampleTestCases.length > 0 && (
                  <div style={{ marginTop: '24px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 12px 0', textTransform: 'uppercase', color: 'var(--ps-primary)' }}>Sample Explanations</h3>
                    {question.sampleTestCases.map((tc, idx) => (
                      <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--ps-border)', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '8px' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--ps-text-dim)', fontWeight: 'bold' }}>Sample Input</span>
                            <pre style={{ margin: '4px 0 0 0', padding: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', fontSize: '12px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.02)' }}>{tc.input ?? ''}</pre>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--ps-text-dim)', fontWeight: 'bold' }}>Sample Output</span>
                            <pre style={{ margin: '4px 0 0 0', padding: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', fontSize: '12px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.02)' }}>{tc.expected || tc.output}</pre>
                          </div>
                        </div>
                        {tc.explanation && (
                          <div style={{ fontSize: '12px', color: 'var(--ps-text-dim)', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '6px' }}>
                            <strong>Explanation:</strong> {tc.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Concept/Reading Completion Action Button */}
            {isMcq && (
              <div style={{ marginTop: '40px', padding: '20px', background: 'rgba(124,107,255,0.08)', borderRadius: '12px', border: '1px solid rgba(124,107,255,0.15)', textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Concept Reading Completed</h4>
                <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--ps-text-dim)' }}>Make sure you read and understood the C code patterns or tutorial logic details explained above before moving next.</p>
                <button 
                  onClick={handleMarkConceptComplete}
                  style={{
                    background: 'var(--ps-primary)', color: 'white', border: 'none', borderRadius: '8px',
                    fontWeight: 'bold', fontSize: '14px', padding: '12px 30px', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(124,107,255,0.3)'
                  }}
                >
                  Mark Completed & Continue <FaChevronRight />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Code Compiler Workspace (Hidden for pure Concept readings) */}
        {!isMcq && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ps-bg)' }}>
            
            {/* Editor Workspace Panel */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: '300px' }}>
              <Editor
                key={`${questionId}_${language}`}
                height="100%"
                language={MONACO_LANG_MAP[language] ?? ''}
                theme="vs-dark"
                defaultValue={code}
                onChange={(val) => {
                  codeRef.current = val ?? '';
                }}
                onMount={(editor) => {
                  editorRef.current = editor;
                  const currentCode = codeRef.current || (code ?? '');
                  if (editor.getValue() !== currentCode) {
                    editor.setValue(currentCode);
                  }
                }}
                options={EDITOR_OPTIONS}
              />
            </div>

            {/* Terminal Runner & Output Console */}
            <div style={{ height: '240px', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--ps-border)', background: 'var(--ps-panel)' }}>
              
              {/* Console Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--ps-border)', background: 'rgba(0,0,0,0.12)', height: '36px', alignItems: 'center', padding: '0 16px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button 
                    onClick={() => setActiveConsoleTab('output')}
                    className={`psb-console-tab ${activeConsoleTab === 'output' ? 'active' : ''}`}
                    style={{ background: activeConsoleTab === 'output' ? 'rgba(255,255,255,0.06)' : 'transparent', border: 'none', color: activeConsoleTab === 'output' ? 'white' : 'var(--ps-text-dim)', fontSize: '12px', fontWeight: 'bold', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Console Output
                  </button>
                  <button 
                    onClick={() => setActiveConsoleTab('results')}
                    className={`psb-console-tab ${activeConsoleTab === 'results' ? 'active' : ''}`}
                    style={{ background: activeConsoleTab === 'results' ? 'rgba(255,255,255,0.06)' : 'transparent', border: 'none', color: activeConsoleTab === 'results' ? 'white' : 'var(--ps-text-dim)', fontSize: '12px', fontWeight: 'bold', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Verification Tests
                  </button>
                  <button 
                    onClick={() => setActiveConsoleTab('input')}
                    className={`psb-console-tab ${activeConsoleTab === 'input' ? 'active' : ''}`}
                    style={{ background: activeConsoleTab === 'input' ? 'rgba(255,255,255,0.06)' : 'transparent', border: 'none', color: activeConsoleTab === 'input' ? 'white' : 'var(--ps-text-dim)', fontSize: '12px', fontWeight: 'bold', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Custom Input {useCustomInput && '●'}
                  </button>
                </div>
              </div>

              {/* Console Panels */}
              <div style={{ flex: 1, padding: '16px', overflowY: 'auto', background: 'rgba(0,0,0,0.25)', fontFamily: 'var(--ps-mono)' }}>
                {activeConsoleTab === 'input' && (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <input 
                        type="checkbox" 
                        id="useCustomInput" 
                        checked={useCustomInput} 
                        onChange={e => setUseCustomInput(e.target.checked)} 
                      />
                      <label htmlFor="useCustomInput" style={{ fontSize: '12px', color: 'var(--ps-text)', fontWeight: 'bold', cursor: 'pointer' }}>Use Custom Stdin Input</label>
                    </div>
                    <textarea
                      placeholder="Type custom terminal input here..."
                      value={customInput}
                      onChange={e => setCustomInput(e.target.value)}
                      disabled={!useCustomInput}
                      style={{ flex: 1, width: '100%', resize: 'none', background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid var(--ps-border)', borderRadius: '6px', padding: '8px', outline: 'none', fontSize: '13px' }}
                    />
                  </div>
                )}

                {activeConsoleTab === 'output' && (
                  <div style={{ fontSize: '13px' }}>
                    {isRunning ? (
                      <div style={{ color: 'var(--ps-text-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaHourglassHalf className="psb-spin" /> Compiling... Please wait
                      </div>
                    ) : (
                      <>
                        {exitCode !== null && (
                          <div style={{ color: exitCode === 0 ? 'var(--ps-success)' : 'var(--ps-error)', fontWeight: 'bold', marginBottom: '8px', fontSize: '12px' }}>
                            Process Exited with Code {exitCode}
                          </div>
                        )}
                        {stdout && <pre style={{ margin: 0, color: '#f1f5f9', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{stdout}</pre>}
                        {stderr && <pre style={{ margin: '8px 0 0 0', color: 'var(--ps-error)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{stderr}</pre>}
                        {!stdout && !stderr && <span style={{ color: 'var(--ps-text-dim)', fontStyle: 'italic' }}>Terminal stdout is empty. Run your code to test compile.</span>}
                      </>
                    )}
                  </div>
                )}

                {activeConsoleTab === 'results' && (
                  <div style={{ fontSize: '13px' }}>
                    {isSubmitting ? (
                      <div style={{ color: 'var(--ps-text-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaHourglassHalf className="psb-spin" /> Running hidden test cases...
                      </div>
                    ) : submitScore !== null ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ps-border)', paddingBottom: '8px', marginBottom: '12px' }}>
                          <span style={{ fontWeight: 'bold' }}>Verification Score</span>
                          <span style={{ fontSize: '16px', fontWeight: 'bold', color: submitScore === 100 ? 'var(--ps-success)' : '#f59e0b' }}>
                            {submitScore}% {submitScore === 100 ? 'Passed (Solved!)' : 'Failed Case'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {submitResults.map(tc => (
                            <div key={tc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '4px', borderLeft: `3px solid ${tc.passed ? 'var(--ps-success)' : 'var(--ps-error)'}` }}>
                              <span style={{ fontSize: '12px' }}>Test Case: {tc.id}</span>
                              <span style={{ color: tc.passed ? 'var(--ps-success)' : 'var(--ps-error)', fontWeight: 'bold', fontSize: '11px' }}>
                                {tc.passed ? 'Pass' : 'Fail'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--ps-text-dim)', fontStyle: 'italic' }}>Submit code to verify correctness against hidden test cases.</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sleek bottom footer navigations */}
      <div className="psb-footer" style={{ borderTop: '1px solid var(--ps-border)', background: 'var(--ps-panel)', padding: '0 20px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button 
          className="psb-back-btn"
          disabled={!prevItem}
          onClick={() => navigate(`/student/practice/course/${courseId}/${prevItem.questionId}`)}
          style={{ opacity: prevItem ? 1 : 0.4, cursor: prevItem ? 'pointer' : 'not-allowed', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--ps-border)', color: 'var(--ps-text)' }}
        >
          ← Previous Topic
        </button>

        {!isMcq && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              disabled={isRunning || isSubmitting}
              onClick={handleRunCode}
              className="psb-action-btn run"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--ps-border)', color: 'var(--ps-text)', padding: '8px 18px', borderRadius: '6px',
                fontWeight: 'bold', fontSize: '13px', cursor: 'pointer'
              }}
            >
              <FaPlay style={{ fontSize: '11px' }} /> Run Code
            </button>
            <button 
              disabled={isRunning || isSubmitting}
              onClick={handleSubmitCode}
              className="psb-action-btn submit"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--ps-primary)',
                border: 'none', color: 'white', padding: '8px 24px', borderRadius: '6px',
                fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(124,107,255,0.25)'
              }}
            >
              <FaCheck style={{ fontSize: '11px' }} /> Verify & Submit
            </button>
          </div>
        )}

        <button 
          className="psb-back-btn"
          disabled={!nextItem}
          onClick={() => navigate(`/student/practice/course/${courseId}/${nextItem.questionId}`)}
          style={{ 
            opacity: nextItem ? 1 : 0.4, 
            cursor: nextItem ? 'pointer' : 'not-allowed', 
            background: 'var(--ps-primary)', 
            border: 'none', 
            color: 'white', 
            fontWeight: 'bold' 
          }}
        >
          Next Topic →
        </button>
      </div>

      {/* Award Badge Celebration Modal */}
      {showAwardModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(9,9,20,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            maxWidth: '440px', width: '90%', background: 'var(--ps-panel)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
            padding: '36px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'rgba(124,107,255,0.12)', border: '2px solid rgba(124,107,255,0.2)',
              color: '#fbbf24', fontSize: '32px', marginBottom: '20px'
            }}>
              <FaStar />
            </div>
            
            <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>
              Course Completed!
            </h2>
            
            <p style={{ fontSize: '14px', color: 'var(--ps-text-dim)', lineHeight: '1.6', margin: '0 0 24px 0' }}>
              Excellent work! You have completed 100% of the lessons and problems in this course pathway. You have been awarded the official completion badge!
            </p>

            <div style={{
              padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.03)', display: 'flex',
              alignItems: 'center', gap: '14px', justifyContent: 'center', marginBottom: '28px'
            }}>
              <span style={{ fontSize: '24px', display: 'inline-flex', alignItems: 'center', color: '#fbbf24' }}>
                <FaStar />
              </span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                  {courseId === 'learn_c' ? 'C Programming Master' : 'Java Development Champion'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ps-success)', fontWeight: 'bold', marginTop: '2px' }}>
                  100% Completed
                </div>
              </div>
            </div>

            <button 
              onClick={() => {
                setShowAwardModal(false);
                handleBackToCourse();
              }}
              style={{
                width: '100%', background: 'var(--ps-primary)', color: 'white',
                border: 'none', borderRadius: '10px', fontWeight: 'bold',
                padding: '12px 0', fontSize: '14px', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(124,107,255,0.3)'
              }}
            >
              Great! Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {activeArticle && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 2000, padding: '20px'
        }} onClick={() => setActiveArticle(null)}>
          <div style={{
            background: 'var(--ps-panel)', border: '1px solid var(--ps-border)',
            borderRadius: '12px', width: '90%', maxWidth: '800px', height: '90%',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 24px', borderBottom: '1px solid var(--ps-border)'
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>{activeArticle.title}</h2>
              <button 
                onClick={() => setActiveArticle(null)}
                style={{
                  background: 'transparent', color: 'var(--ps-text-dim)', border: 'none',
                  fontSize: '20px', cursor: 'pointer', fontWeight: 'bold'
                }}
              >
                ×
              </button>
            </div>
            <div style={{
              flex: 1, padding: '24px', overflowY: 'auto', fontSize: '14px',
              lineHeight: '1.7', color: 'var(--ps-text)'
            }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeArticle.content ?? '') }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeCourseSandbox;
