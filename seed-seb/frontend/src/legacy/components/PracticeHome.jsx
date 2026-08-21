import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from '../router-compat';
import { fetchQuestionsIndex } from '../services/codingQuestionBankService';
import { getFullProgress, syncProgressWithFirebase, getQuestionDisplayStatus, saveSheetProgress } from '../services/codingProgressService';
import DataService from '../services/dataService';
import { fetchArticleFile, fetchArticleJson } from '../utils/articleFetcher';
import {
  FaSearch, FaCheckCircle,
  FaFileAlt, FaBookOpen,
  FaAngleRight, FaAngleDown, FaChevronLeft, FaChevronRight, FaChevronDown,
  FaLock, FaStar, FaFolderOpen, FaFolder,
  FaRocket, FaPython, FaCoffee, FaDatabase,
  FaReact, FaHtml5, FaJs, FaTerminal, FaRust, FaBrain, FaNetworkWired, FaCode, FaLaptopCode,
  FaThLarge, FaTasks, FaTachometerAlt, FaClock, FaCheck,
  FaCheckSquare, FaChartLine, FaSyncAlt, FaEye
} from 'react-icons/fa';
import roadmapsData from './roadmaps_data.json';
import '../styles/PracticeHome.css';
import { CATEGORIZED_SHEETS } from '../config/sheetsData';
import { getAuthData } from '../utils/storageUtils';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';

const CATEGORIES = [
  'Arrays', 'Strings', 'Sorting', 'Searching', 'Recursion',
  'Dynamic Programming', 'Graphs', 'Trees', 'Linked List',
  'Stack', 'Queue', 'Greedy', 'Math', 'Bit Manipulation',
];

const DIFFICULTIES = ['Beginner', 'Easy', 'Medium', 'Hard'];

const STATUS_ICONS = {
  SOLVED: 'SOLVED',
  ATTEMPTED: 'ATTEMPTED',
  UNSOLVED: 'UNSOLVED',
  LOCKED: 'LOCKED',
};


// Structured sheets are configured inside sheetsData.js

const getRoadmapStyle = (slug) => {
  const norm = slug.toLowerCase();
  if (norm.includes('react')) return { icon: <FaReact style={{ color: '#61dafb' }} />, color: '#61dafb' };
  if (norm.includes('python')) return { icon: <FaPython style={{ color: '#3776ab' }} />, color: '#3776ab' };
  if (norm.includes('cpp')) return { icon: <FaCode style={{ color: '#00599c' }} />, color: '#00599c' };
  if (norm.includes('javascript') || norm.includes('js')) return { icon: <FaJs style={{ color: '#f7df1e' }} />, color: '#f7df1e' };
  if (norm.includes('java')) return { icon: <FaCoffee style={{ color: '#f89820' }} />, color: '#f89820' };
  if (norm.includes('c-') || norm.includes('c-sharp')) return { icon: <FaTerminal style={{ color: '#178600' }} />, color: '#178600' };
  if (norm === 'c' || norm.includes('c-dsa')) return { icon: <FaCode style={{ color: '#a8b9cc' }} />, color: '#a8b9cc' };
  if (norm.includes('sql')) return { icon: <FaDatabase style={{ color: '#00758f' }} />, color: '#00758f' };
  if (norm.includes('html')) return { icon: <FaHtml5 style={{ color: '#e34c26' }} />, color: '#e34c26' };
  if (norm.includes('star')) return { icon: <FaStar style={{ color: '#fbbf24' }} />, color: '#fbbf24' };
  if (norm.includes('rust')) return { icon: <FaRust style={{ color: '#dea584' }} />, color: '#dea584' };
  if (norm.includes('machine-learning') || norm.includes('brain') || norm.includes('ml-')) return { icon: <FaBrain style={{ color: '#ec4899' }} />, color: '#ec4899' };
  if (norm.includes('full-stack')) return { icon: <FaLaptopCode style={{ color: '#0d9488' }} />, color: '#0d9488' };
  if (norm.includes('dsa') || norm.includes('data-structures') || norm.includes('algorithms')) return { icon: <FaNetworkWired style={{ color: '#3b82f6' }} />, color: '#3b82f6' };
  return { icon: <FaRocket style={{ color: '#64748b' }} />, color: '#64748b' };
};

const getCorrectArticleForProblem = (courseId, prob) => {
  if (!prob) return '';
  if (prob.article) return prob.article;

  const cid = String(courseId ?? '').toLowerCase();
  const pName = String(prob.title || (prob.name  ?? '')).toLowerCase();
  const pid = String(prob.id ?? '').toLowerCase();

  const inAny = (...keywords) => keywords.some(k => pName.includes(k) || pid.includes(k));

  if (cid.includes('python') || cid.includes('learn_python')) {
    if (inAny('numpy', 'array', 'matrix', 'ndarray')) return 'gfg-sub-python-numpy-tutorial';
    if (inAny('pandas', 'dataframe', 'series', 'csv')) return 'gfg-sub-python-pandas-tutorial';
    if (inAny('pytorch', 'tensor', 'neural', 'deep learning')) return 'gfg-sub-python-getting-started-with-pytorch';
    if (inAny('django', 'mysql', 'database', 'web')) return 'gfg-sub-python-how-to-integrate-mysql-database-with-django';
    if (inAny('function', 'closure', 'lambda', 'inner', 'loop', 'recursion')) return 'gfg-sub-python-python-inner-functions';
    return 'gfg-python';
  }
  if (cid.includes('java') && !cid.includes('javascript')) {
    if (inAny('io', 'input', 'output', 'print', 'scanner', 'stream', 'buffered')) return 'gfg-sub-java-java-io-input-output-in-java-with-examples';
    if (inAny('jdbc', 'database', 'sql', 'connection', 'statement')) return 'gfg-sub-java-types-of-statements-in-jdbc';
    if (inAny('date', 'time', 'format', 'datetime')) return 'gfg-sub-java-java-time-format-datetimeformatterbuilder-class-in-java';
    if (inAny('career', 'job', 'interview')) return 'gfg-sub-java-careers-jobs-in-java';
    if (inAny('compare', 'vs', 'difference', 'versus', 'python', 'c++')) return 'gfg-sub-java-c-vs-java-vs-python';
    if (inAny('image', 'processing', 'face', 'detection')) return 'gfg-sub-java-image-processing-in-java-face-detection';
    return 'gfg-java';
  }
  if (cid.includes('dsa') || cid.includes('data-struct') || cid.includes('algorithm') || cid.includes('arrays') || cid.includes('trees') || cid.includes('linked-list') || cid.includes('stacks') || cid.includes('graphs') || cid.includes('binary-search') || cid.includes('recursion') || cid.includes('hashing') || cid.includes('greedy') || cid.includes('dynamic')) {
    if (inAny('linked list', 'circular', 'singly', 'doubly')) return 'gfg-sub-dsa-circular-linked-list';
    if (inAny('stack', 'queue', 'infix', 'postfix', 'prefix')) return 'gfg-sub-dsa-convert-infix-expression-to-postfix-expression';
    if (inAny('dp', 'dynamic', 'common substring', 'lcs', 'knapsack')) return 'gfg-sub-dsa-longest-common-substring-dp-29';
    if (inAny('matrix', '2d', 'rectangle', 'subarray')) return 'gfg-sub-dsa-maximum-sum-rectangle-in-a-2d-matrix';
    if (inAny('bst', 'binary search tree', 'tree merge')) return 'gfg-sub-dsa-merge-two-bsts-with-limited-extra-space';
    if (inAny('trailing zero', 'factorial')) return 'gfg-sub-dsa-count-trailing-zeroes-factorial-number';
    return 'gfg-dsa';
  }
  if (cid.includes('ml') || cid.includes('machine-learning') || cid.includes('ai') || cid.includes('deep-learning') || cid.includes('data-science')) {
    if (inAny('eda', 'exploratory', 'visualization', 'seaborn', 'matplotlib')) return 'gfg-sub-machine-learning-eda-with-numpy-pandas-matplotlib-seaborn';
    if (inAny('ai', 'artificial intelligence', 'agi')) return 'gfg-sub-machine-learning-artificial-intelligence';
    if (inAny('interview', 'question', 'prep')) return 'gfg-sub-machine-learning-data-science-interview-questions-and-answers';
    if (inAny('gradio', 'ui', 'interface', 'deploy')) return 'gfg-sub-machine-learning-python-creating-user-interfaces-for-ai-models-using-gradio';
    if (inAny('r ', 'r-project', 'rstudio')) return 'gfg-sub-machine-learning-30-r-projects-with-source-code-2026';
    return 'gfg-machine-learning';
  }
  if (cid.includes('web') || cid.includes('html') || cid.includes('css') || cid.includes('react') || cid.includes('javascript') || cid.includes('nodejs') || cid.includes('ux') || cid.includes('frontend')) {
    if (inAny('css', 'style', 'flexbox', 'grid', 'sass')) return 'gfg-sub-web-tech-css-tutorial';
    if (inAny('mongodb', 'mongo', 'nosql', 'document')) return 'gfg-sub-web-tech-mongodb-tutorial';
    if (inAny('postgresql', 'postgres', 'relational db')) return 'gfg-sub-web-tech-postgresql-tutorial';
    if (inAny('redis', 'cache', 'in-memory')) return 'gfg-sub-web-tech-introduction-to-redis-server';
    if (inAny('cassandra', 'nosql', 'wide column')) return 'gfg-sub-web-tech-apache-cassandra-nosql-database';
    if (inAny('dbms', 'database', 'sql', 'relation')) return 'gfg-sub-web-tech-introduction-of-dbms-database-management-system-set-1';
    return 'gfg-web-tech';
  }
  if (cid.includes('sql') || cid.includes('dbms') || cid.includes('database') || cid.includes('operating-system')) {
    if (inAny('dbms', 'database management')) return 'gfg-sub-cs-subjects-dbms';
    if (inAny('linux', 'unix', 'bash', 'shell', 'os', 'operating system')) return 'gfg-sub-cs-subjects-linux-tutorial';
    if (inAny('math', 'discrete', 'logic', 'combinatorics')) return 'gfg-sub-cs-subjects-mathematics-for-computer-science';
    if (inAny('software engineering', 'sdlc', 'agile', 'scrum')) return 'gfg-sub-cs-subjects-software-engineering';
    if (inAny('machine learning', 'ml', 'ai')) return 'gfg-sub-cs-subjects-machine-learning';
    return 'gfg-cs-subjects';
  }
  if (cid.includes('devops') || cid.includes('git') || cid.includes('docker') || cid.includes('kubernetes') || cid.includes('ci-cd')) {
    if (inAny('jenkins', 'pipeline', 'plugin', 'build')) return 'gfg-sub-devops-working-with-jenkins-plugins';
    if (inAny('microservice', 'micro service', 'api gateway')) return 'gfg-sub-devops-microservices';
    if (inAny('linux', 'bash', 'shell', 'monitor', 'system info')) return 'gfg-sub-devops-system-information-and-monitoring-in-linux';
    if (inAny('event driven', 'event-driven', 'message', 'kafka')) return 'gfg-sub-devops-event-driven-architecture-system-design';
    if (inAny('github', 'git', 'version control', 'branch', 'merge')) return 'gfg-sub-devops-useful-github-commands';
    return 'gfg-devops';
  }
  if (cid.includes('typescript')) return 'gfg-sub-programming-languages-typescript-tutorial';
  if (cid.includes('php')) return 'gfg-sub-programming-languages-php-tutorial';
  if (cid.includes('r-language') || (cid.includes('learn_r') && !cid.includes('rust'))) return 'gfg-sub-programming-languages-r-programming-language-introduction';
  if (cid.includes('cuda') || cid.includes('gpu')) return 'gfg-sub-programming-languages-cuda-tutorial';
  if (cid.includes('figma') || cid.includes('ui-ux') || cid.includes('design')) return 'gfg-sub-software-tools-figma-tutorial';
  if (cid.includes('powershell') || cid.includes('windows')) return 'gfg-sub-software-tools-windows-powershell-tutorial';
  if (cid.includes('gemini') || cid.includes('copilot') || cid.includes('llm') || cid.includes('ai-tools')) return 'gfg-sub-software-tools-what-is-google-gemini-ai';

  if (inAny('loop', 'iteration', 'while', 'for')) return 'gfg-sub-python-python-inner-functions';
  if (inAny('conditional', 'if else', 'switch')) return 'gfg-sub-java-c-vs-java-vs-python';
  if (inAny('array', 'list', 'linked')) return 'gfg-sub-dsa-circular-linked-list';
  if (inAny('stack', 'queue')) return 'gfg-sub-dsa-convert-infix-expression-to-postfix-expression';
  if (inAny('sql', 'query', 'select')) return 'gfg-sub-cs-subjects-dbms';
  if (inAny('git', 'version', 'deploy')) return 'gfg-sub-devops-useful-github-commands';

  return 'gfg-dsa';
};

const PracticeHome = ({ initialTab = 'paths', initialCourse = null }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(initialTab || 'paths'); // 'paths' or 'bank'
  const [selectedCourse, setSelectedCourse] = useState(() => initialCourse ? String(initialCourse).replace(/-/g, '_') : null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialCourse) {
      const norm = String(initialCourse).replace(/-/g, '_');
      setSelectedCourse(norm);
      setActiveTab('paths');
      if (norm === 'learn_aptitude') {
        setCurriculumSubTab('aptitude');
      } else {
        setCurriculumSubTab('technical');
      }
    } else {
      setSelectedCourse(null);
    }
  }, [initialCourse]);

  const [questions, setQuestions] = useState([]);
  const [solvedIds, setSolvedIds] = useState([]);
  const [attemptedIds, setAttemptedIds] = useState([]);
  const [cacheId, setCacheId] = useState(1);
  const [problemDetails, setProblemDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState({ text: '', type: '' });
  const [user, setUser] = useState(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  // Filters for Flat Question Bank
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [tabLoading, setTabLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Structured Learning Paths State
  const [courses, setCourses] = useState([]);
  const [allowedModuleIds, setAllowedModuleIds] = useState([]);
  const [expandedCourses, setExpandedCourses] = useState({});
  const [expandedSubcourses, setExpandedSubcourses] = useState({});

  // Contest View State (When clicking a Coding Module)
  const [selectedModule, setSelectedModule] = useState(null);
  const [contestQuestions, setContestQuestions] = useState([]);
  const [contestLoading, setContestLoading] = useState(false);

  const [selectedSheet, setSelectedSheet] = useState(null);
  const [curriculumSubTab, setCurriculumSubTab] = useState('technical');
  const [expandedTopics, setExpandedTopics] = useState({});
  const [sheetSolvedDicts, setSheetSolvedDicts] = useState({});
  const [activeArticle, setActiveArticle] = useState(null);
  const [activeArticleMeta, setActiveArticleMeta] = useState(null); // { problemId, sheetId }
  const [articleLoading, setArticleLoading] = useState(false);
  const [pathModuleQuestions, setPathModuleQuestions] = useState({});
  const [scrapedSyllabus, setScrapedSyllabus] = useState(null);
  const [cQuestionIds, setCQuestionIds] = useState([]);
  const [javaQuestionIds, setJavaQuestionIds] = useState([]);
  const [cppQuestionIds, setCppQuestionIds] = useState([]);
  const [dsaQuestionIds, setDsaQuestionIds] = useState([]);
  const [courseQuestionIds, setCourseQuestionIds] = useState({});
  const [courseSearch, setCourseSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('All');
  const cQuestionIdsSet = useMemo(() => new Set(cQuestionIds), [cQuestionIds]);
  const javaQuestionIdsSet = useMemo(() => new Set(javaQuestionIds), [javaQuestionIds]);
  const cppQuestionIdsSet = useMemo(() => new Set(cppQuestionIds), [cppQuestionIds]);
  const dsaQuestionIdsSet = useMemo(() => new Set(dsaQuestionIds), [dsaQuestionIds]);
  const solvedIdsSet = useMemo(() => new Set(solvedIds), [solvedIds]);
  const questionBankIdsSet = useMemo(() => new Set(questions.map(q => q.questionId || (q.id  ?? ''))), [questions]);


  useEffect(() => {
    if (!selectedCourse) {
      setScrapedSyllabus(null);
      return;
    }
    const norm = selectedCourse.replace(/-/g, '_');
    const course = courses.find(c => c.id === selectedCourse || c.id === norm || c.id.replace(/-/g, '_') === norm);
    if (course && course.isScrapedCourse && course.syllabusUrl) {
      setLoading(true);
      fetchArticleJson(course.syllabusUrl)
        .then(data => {
          setScrapedSyllabus(data);
          setLoading(false);
          if (data && Array.isArray(data.modules) && data.modules.length > 0) {
            setExpandedTopics(prev => ({
              ...prev,
              [`scraped-${course.id}-0`]: true
            }));
          }
        })
        .catch(err => {
          console.error("Failed to load scraped course syllabus:", err);
          setLoading(false);
        });
    } else {
      setScrapedSyllabus(null);
      if (course && Array.isArray(course.modules) && course.modules.length > 0) {
        setExpandedTopics(prev => ({
          ...prev,
          [`paths-${course.id}-${course.modules[0].id}`]: true
        }));
      }
    }
  }, [selectedCourse, courses]);

  useEffect(() => {
    const initialDicts = {};
    Object.values(CATEGORIZED_SHEETS).flat().forEach(sheet => {
      const key = sheet.id === 'a2z' ? 'seed_it_a2z_solved' : `seed_it_sheet_solved_${sheet.id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          initialDicts[sheet.id] = JSON.parse(saved);
        } catch (e) { }
      } else {
        initialDicts[sheet.id] = {};
      }
    });
    setSheetSolvedDicts(initialDicts);
  }, []);

  const toggleProblemSolved = async (sheetId, problemId) => {
    const isNewSolved = !(sheetSolvedDicts[sheetId] || {})[problemId];

    setSheetSolvedDicts(prev => {
      const sheetDict = prev[sheetId] || {};
      const updatedSheetDict = { ...sheetDict, [problemId]: isNewSolved };
      return { ...prev, [sheetId]: updatedSheetDict };
    });

    // STRICT UID: canonical Practice identity is Firebase Auth UID only.
    // Do NOT fall back to email — that reads a different/legacy document.
    const uid = user?.uid;
    if (uid) {
      await saveSheetProgress(uid, sheetId, problemId, isNewSolved);
    } else {
      const key = sheetId === 'a2z' ? 'seed_it_a2z_solved' : `seed_it_sheet_solved_${sheetId}`;
      const saved = localStorage.getItem(key);
      let dict = {};
      if (saved) {
        try { dict = JSON.parse(saved); } catch (e) { }
      }
      dict[problemId] = isNewSolved;
      localStorage.setItem(key, JSON.stringify(dict));
    }
  };

  const getSheetSolvedCount = (sheet) => {
    const dict = sheetSolvedDicts[sheet.id] || {};
    let count = 0;
    if (sheet.id === 'a2z') {
      sheet.sections.forEach(sec => {
        sec.subcategories.forEach(sub => {
          sub.problems.forEach(p => {
            if (dict[p.id] || (solvedIds && solvedIds.includes(p.id))) count++;
          });
        });
      });
    } else {
      (sheet.sections || []).forEach(sec => {
        (sec.problems || []).forEach(p => {
          if (dict[p.id] || (solvedIds && solvedIds.includes(p.id))) count++;
        });
      });
    }
    return count;
  };

  const getSheetTotalProblems = (sheet) => {
    let count = 0;
    if (sheet.id === 'a2z') {
      sheet.sections.forEach(sec => {
        sec.subcategories.forEach(sub => {
          count += sub.problems.length;
        });
      });
    } else {
      (sheet.sections || []).forEach(sec => {
        count += (sec.problems || []).length;
      });
    }
    return count;
  };

  const generateDynamicNotes = (questionId, questionTitle) => {
    let title = questionTitle || "Problem Notes";
    let concept = "Programming Fundamentals";
    let logicSteps = [];
    let complexity = "O(1) time and space";

    const qidNum = parseInt(String(questionId).replace("Q0.", ""), 10) || 0;

    if (qidNum >= 1 && qidNum <= 40) {
      concept = "Basic Variables and Datatypes";
      logicSteps = [
        "Read the inputs into variables of appropriate primitive types.",
        "Check how variable storage types (int, float, char) behave during math.",
        "Format output precisely as requested, matching spacing and punctuation."
      ];
      complexity = "Time Complexity: O(1)\nSpace Complexity: O(1)";
    } else if (qidNum >= 41 && qidNum <= 80) {
      concept = "Conditional Statements (Branching)";
      logicSteps = [
        "Analyze boundary constraints and setup appropriate if-else branches.",
        "Test for boundary equality conditions carefully (e.g. >= vs >).",
        "Avoid nested ifs where flat logical operators (&&, ||) make the code cleaner."
      ];
      complexity = "Time Complexity: O(1)\nSpace Complexity: O(1)";
    } else if (qidNum >= 81 && qidNum <= 120) {
      concept = "Looping and Iterations";
      logicSteps = [
        "Initialize loop variables and identify the loop exit conditions.",
        "Perform iterative updates step-by-step to reach target values.",
        "Verify your loops exit properly to prevent time limit exceeded exceptions."
      ];
      complexity = "Time Complexity: O(N) typical loop bounds\nSpace Complexity: O(1)";
    } else if (qidNum >= 121 && qidNum <= 170) {
      concept = "Number Crunching Operations";
      logicSteps = [
        "Use mathematical operators like modulo (%) to get digits, and division (/) to reduce numbers.",
        "Be careful of integer overflow limit if accumulating sums or products.",
        "Utilize basic arithmetic logic to complete calculations in constant time if possible."
      ];
      complexity = "Time Complexity: O(log N) typical digit operations\nSpace Complexity: O(1)";
    } else if (qidNum >= 171 && qidNum <= 230) {
      concept = "Number Based Logic Problems";
      logicSteps = [
        "Identify numeric properties (prime, odd/even, divisibility, factorials).",
        "Formulate a generic algorithm to test number properties without using complex libraries.",
        "Simplify the solution using loops or basic mathematical series shortcuts."
      ];
      complexity = "Time Complexity: O(sqrt(N)) or O(N) depending on check scope\nSpace Complexity: O(1)";
    } else if (qidNum >= 231 && qidNum <= 290) {
      concept = "Arrays and Linear Sequences";
      logicSteps = [
        "Store the input numbers inside an array index sequentially.",
        "Iterate over the array using a single loop to inspect index values.",
        "Avoid accessing index values out of bounds (0 to N-1 limit)."
      ];
      complexity = "Time Complexity: O(N) array scan pass\nSpace Complexity: O(N) array storage size";
    } else if (qidNum >= 291 && qidNum <= 348) {
      concept = "Strings and Text Processing";
      logicSteps = [
        "Access input text characters sequentially like an array.",
        "Check character boundaries using standard ASCII code values.",
        "Compute length, match substrings, or reverse string contents safely."
      ];
      complexity = "Time Complexity: O(L) string length traverse\nSpace Complexity: O(L) or O(1) extra space";
    } else {
      concept = "General Logic Formulation";
      logicSteps = [
        "Understand sample test cases input and output formats.",
        "Solve small inputs manually on paper to trace correct calculations.",
        "Write correct logic flows and avoid hardcoded sample answers."
      ];
      complexity = "Time Complexity: O(N) standard\nSpace Complexity: O(1) typical";
    }

    const htmlContent = `
      <div style="font-family: sans-serif; color: var(--ph-text); line-height: 1.6;">
        <div style="background: rgba(124,107,255,0.1); border: 1px solid rgba(124,107,255,0.2); padding: 14px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 6px 0; color: var(--ph-primary);">Core Concept: ${concept}</h4>
          <p style="margin: 0; font-size: 13px; color: var(--ph-text-dim);">To solve this question, you need to understand how to apply standard programming constructs without hardcoding raw inputs.</p>
        </div>

        <h4 style="color: var(--ph-text); border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px; margin: 18px 0 10px 0;">Logic Steps to Solve</h4>
        <ol style="padding-left: 20px; margin: 0 0 20px 0; font-size: 13px; color: var(--ph-text-dim);">
          ${logicSteps.map(step => `<li style="margin-bottom: 8px;">${step}</li>`).join('')}
        </ol>

        <h4 style="color: var(--ph-text); border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px; margin: 18px 0 10px 0;">Complexity Analysis</h4>
        <pre style="background: rgba(0,0,0,0.25); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.04); font-family: monospace; font-size: 12px; margin: 0; color: #10b981;">${complexity}</pre>

        <div style="margin-top: 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px;">
          <p style="margin: 0; font-size: 12px; color: var(--ph-text-dim); font-style: italic;">Note: Try to implement the logic inside the sandbox editor. Do not use external AI generation during live execution.</p>
        </div>
      </div>
    `;

    return {
      title: `${title} - Tutorial & Notes`,
      content: htmlContent,
      isExternal: false
    };
  };

  const openArticle = async (articleUrl, problemName, problemId, sheetId) => {
    if (!articleUrl) return;
    setActiveArticleMeta({ problemId, sheetId });
    setArticleLoading(true);

    if (problemId && (problemId.startsWith('Q0.') || String(sheetId).includes('programming_fundamentals'))) {
      const dynamicNotes = generateDynamicNotes(problemId, problemName);
      setActiveArticle(dynamicNotes);
      setArticleLoading(false);
      return;
    }

    let slug = articleUrl.replace(/\/$/, '').split('/').pop();
    let fetchPath = `${slug}.json`;
    if (articleUrl.startsWith('articles/')) {
      fetchPath = articleUrl.substring(9);
    } else if (articleUrl.startsWith('/articles/')) {
      fetchPath = articleUrl.substring(10);
    }

    if (fetchPath.endsWith('.json.json')) {
      fetchPath = fetchPath.replace('.json.json', '.json');
    } else if (!fetchPath.endsWith('.json')) {
      fetchPath += '.json';
    }

    try {
      const response = await fetchArticleFile(fetchPath);
      if (!response.ok) {
        throw new Error('Not found');
      }
      const data = await response.json();
      setActiveArticle({
        ...data,
        url: articleUrl
      });
    } catch (err) {
      setActiveArticle({
        title: problemName,
        url: articleUrl,
        isExternal: true
      });
    } finally {
      setArticleLoading(false);
    }
  };

  const handleScroll = (e) => {
    const target = e.target;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 10) {
      if (activeArticleMeta) {
        const { problemId, sheetId } = activeArticleMeta;
        const isAlreadySolved = !!(sheetSolvedDicts[sheetId] || {})[problemId] || solvedIds.includes(problemId);
        if (!isAlreadySolved) {
          toggleProblemSolved(sheetId, problemId);
        }
      }
    }
  };

  const handleArticleContainerClick = (e) => {
    const tabBtn = e.target.closest('.code-tab');
    if (tabBtn) {
      const lang = tabBtn.getAttribute('data-lang');
      const parentTabsContainer = tabBtn.closest('.code-tabs');
      if (parentTabsContainer) {
        parentTabsContainer.querySelectorAll('.code-tab').forEach(btn => {
          btn.classList.remove('dsa_article_code_active');
        });
        tabBtn.classList.add('dsa_article_code_active');

        const codeSection = tabBtn.closest('.code-section') || tabBtn.closest('details') || tabBtn.closest('.common-drops');
        if (codeSection) {
          codeSection.querySelectorAll('.code-block').forEach(block => {
            if (block.getAttribute('data-lang') === lang) {
              block.classList.add('dsa_article_code_active');
            } else {
              block.classList.remove('dsa_article_code_active');
            }
          });
        }
      }
      return;
    }

    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
      const codeSection = copyBtn.closest('.code-section') || copyBtn.closest('details');
      if (codeSection) {
        const activeBlock = codeSection.querySelector('.code-block.dsa_article_code_active pre code') || codeSection.querySelector('.code-block.dsa_article_code_active pre');
        if (activeBlock) {
          navigator.clipboard.writeText(activeBlock.innerText || (activeBlock.textContent  ?? ''));
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = '<span style="font-size: 11px; color: var(--ph-success); font-weight: 700; padding: 2px 4px;">Copied!</span>';
          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
          }, 1500);
        }
      }
    }
  };

  useEffect(() => {
    const authData = getAuthData();
    setUser(authData);
    loadData(authData);
  }, []);

  useEffect(() => {
    if (location.state?.activeCourse) {
      setSelectedCourse(location.state.activeCourse);
      setActiveTab('paths');
      setExpandedCourses(prev => ({ ...prev, [location.state.activeCourse]: true }));
    }
  }, [location.state]);

  const loadData = async (authData) => {
    setLoading(true);
    try {
      // STRICT UID: canonical Practice identity is Firebase Auth UID only.
      const uid = authData?.uid || authData?.UID || (authData?.userId  ?? '');

      // Auto sync with cloud at start
      if (uid && navigator.onLine) {
        await syncProgressWithFirebase(uid);
      }

      // Fetch Question Bank, Progress, and Access Control config
      const [indexQs, progress, accessControl, cSyllabus, javaSyllabus, cppSyllabus, dsaSyllabus, courseQidsMap] = await Promise.all([
        fetchQuestionsIndex().catch(() => []),
        getFullProgress(uid).catch(() => ({ solvedProblems: [], problemDetails: {} })),
        DataService.getAccessControl().catch(() => null),
        fetchArticleFile('CourseMappingFiles/learn-c-syllabus.json').then(r => r.json()).catch(() => null),
        fetchArticleFile('CourseMappingFiles/learn-java-syllabus.json').then(r => r.json()).catch(() => null),
        fetchArticleFile('CourseMappingFiles/learn-cpp-syllabus.json').then(r => r.json()).catch(() => null),
        fetchArticleFile('CourseMappingFiles/learn-dsa-syllabus.json').then(r => r.json()).catch(() => null),
        fetchArticleFile('CourseMappingFiles/course_question_ids.json').then(r => r.json()).catch(() => ({})),
      ]);

      const cQids = [];
      if (cSyllabus) {
        cSyllabus.modules.forEach(m => m.submodules.forEach(s => s.problems.forEach(p => cQids.push(p.id))));
      }
      const javaQids = [];
      if (javaSyllabus) {
        javaSyllabus.modules.forEach(m => m.submodules.forEach(s => s.problems.forEach(p => javaQids.push(p.id))));
      }
      const cppQids = [];
      if (cppSyllabus) {
        cppSyllabus.modules.forEach(m => m.submodules.forEach(s => s.problems.forEach(p => cppQids.push(p.id))));
      }
      const dsaQids = [];
      if (dsaSyllabus) {
        dsaSyllabus.modules.forEach(m => m.submodules.forEach(s => s.problems.forEach(p => dsaQids.push(p.id))));
      }
      setCQuestionIds(cQids);
      setJavaQuestionIds(javaQids);
      setCppQuestionIds(cppQids);
      setDsaQuestionIds(dsaQids);
      setCourseQuestionIds(courseQidsMap || {});

      setQuestions(indexQs);
      const completedList = progress.completedQuestions || progress.solvedProblems || [];
      const attemptedList = progress.attemptedQuestions || [];
      setSolvedIds(completedList);
      setAttemptedIds(attemptedList);
      setProblemDetails(progress.problemDetails || {});
      setCacheId(progress.cacheId || 1);
      if (progress.sheetSolvedDicts) {
        setSheetSolvedDicts(prev => ({ ...prev, ...progress.sheetSolvedDicts }));
      }

      if (accessControl && authData) {
        const departmentAccess = accessControl?.access_control?.colleges?.[authData.College]?.[authData.Year]?.[authData.Department];
        const allowedIds = departmentAccess?.allowed_modules || [];
        setAllowedModuleIds(allowedIds);
      }

      // Process courses (always available by default)
      const pfCourse = {
        id: 'programming_fundamentals',
        title: 'Programming Fundamentals',
        display_order: 0,
        hasSubcourses: false,
        subcourses: [],
        modules: [
          { id: 'FPS001', name: 'Basic Datatypes & Variables', url: 'seed-contents/coding/basic-datatypes.json', type: 'coding', display_order: 1 },
          { id: 'FPS002', name: 'Conditional Statements', url: 'seed-contents/coding/conditional-statements.json', type: 'coding', display_order: 2 },
          { id: 'FPS003', name: 'Looping', url: 'seed-contents/coding/looping.json', type: 'coding', display_order: 3 },
          { id: 'FPS004', name: 'Number Crunching', url: 'seed-contents/coding/number-crunching.json', type: 'coding', display_order: 4 },
          { id: 'FPS005', name: 'Number Based Problems', url: 'seed-contents/coding/number-based-problems.json', type: 'coding', display_order: 5 },
          { id: 'FPS006', name: 'Arrays', url: 'seed-contents/coding/arrays.json', type: 'coding', display_order: 6 },
          { id: 'FPS007', name: 'Strings', url: 'seed-contents/coding/strings.json', type: 'coding', display_order: 7 }
        ]
      };
      const scrapedConfigs = [
        { id: 'learn_c', title: 'Learn C', syllabusUrl: 'seed-contents/coding/learn-c-syllabus.json' },
        { id: 'learn_cpp', title: 'Learn C++ & DSA Foundations', syllabusUrl: 'seed-contents/coding/learn-cpp-syllabus.json' },
        { id: 'learn_dsa', title: 'Master Data Structures & Algorithms', syllabusUrl: 'seed-contents/coding/learn-dsa-syllabus.json' },
        { id: 'learn_java', title: 'Learn Java', syllabusUrl: 'seed-contents/coding/learn-java-syllabus.json' },
        { id: 'learn_become-5-star', title: 'Become a 5-Star Coder (Roadmap)', syllabusUrl: 'seed-contents/coding/learn-become-5-star-syllabus.json' },
        { id: 'learn_python-dsa', title: 'Python Data Structures & Algorithms (Roadmap)', syllabusUrl: 'seed-contents/coding/learn-python-dsa-syllabus.json' },
        { id: 'learn_javascript-dsa', title: 'JavaScript Data Structures & Algorithms (Roadmap)', syllabusUrl: 'seed-contents/coding/learn-javascript-dsa-syllabus.json' },
        { id: 'learn_git-github', title: 'Git & GitHub', syllabusUrl: 'seed-contents/coding/learn-git-github-syllabus.json' },
        { id: 'learn_python-beginner-v2-p1', title: 'Python Programming (Part 1)', syllabusUrl: 'seed-contents/coding/learn-python-beginner-v2-p1-syllabus.json' },
        { id: 'learn_html', title: 'Learn HTML Basics', syllabusUrl: 'seed-contents/coding/learn-html-syllabus.json' },
        { id: 'learn_java-beginner-v2-p1', title: 'Java Programming (Part 1)', syllabusUrl: 'seed-contents/coding/learn-java-beginner-v2-p1-syllabus.json' },
        { id: 'learn_javascript', title: 'Learn JavaScript Essentials', syllabusUrl: 'seed-contents/coding/learn-javascript-syllabus.json' },
        { id: 'learn_cpp-beginner-v2-p1', title: 'C++ Programming (Part 1)', syllabusUrl: 'seed-contents/coding/learn-cpp-beginner-v2-p1-syllabus.json' },
        { id: 'learn_linked-lists-new', title: 'Linked Lists Practice', syllabusUrl: 'seed-contents/coding/learn-linked-lists-new-syllabus.json' },
        { id: 'learn_c-beginner-v2-p1', title: 'C Programming (Part 1)', syllabusUrl: 'seed-contents/coding/learn-c-beginner-v2-p1-syllabus.json' },
        { id: 'learn_stacks-and-queues-new', title: 'Stacks & Queues Practice', syllabusUrl: 'seed-contents/coding/learn-stacks-and-queues-new-syllabus.json' },
        { id: 'learn_time-complexity', title: 'Time & Space Complexity', syllabusUrl: 'seed-contents/coding/learn-time-complexity-syllabus.json' },
        { id: 'learn_java-development', title: 'Java Development Mastery', syllabusUrl: 'seed-contents/coding/learn-java-development-syllabus.json' },
        { id: 'learn_sql-intermediate', title: 'SQL Intermediate', syllabusUrl: 'seed-contents/coding/learn-sql-intermediate-syllabus.json' },
        { id: 'learn_python-beginner-v2-p2', title: 'Python Programming (Part 2)', syllabusUrl: 'seed-contents/coding/learn-python-beginner-v2-p2-syllabus.json' },
        { id: 'learn_sql-at-work', title: 'SQL at Work', syllabusUrl: 'seed-contents/coding/learn-sql-at-work-syllabus.json' },
        { id: 'learn_cpp-beginner-v2-p2', title: 'C++ Programming (Part 2)', syllabusUrl: 'seed-contents/coding/learn-cpp-beginner-v2-p2-syllabus.json' },
        { id: 'learn_binary-search-new', title: 'Binary Search Practice', syllabusUrl: 'seed-contents/coding/learn-binary-search-new-syllabus.json' },
        { id: 'learn_greedy-algorithms', title: 'Greedy Algorithms', syllabusUrl: 'seed-contents/coding/learn-greedy-algorithms-syllabus.json' },
        { id: 'learn_hashing', title: 'Hashing Practice', syllabusUrl: 'seed-contents/coding/learn-hashing-syllabus.json' },
        { id: 'learn_web-dev-js', title: 'Web Development with JS', syllabusUrl: 'seed-contents/coding/learn-web-dev-js-syllabus.json' },
        { id: 'learn_cpp-development', title: 'C++ Development Mastery', syllabusUrl: 'seed-contents/coding/learn-cpp-development-syllabus.json' },
        { id: 'learn_nodejs', title: 'NodeJS Backend Foundations', syllabusUrl: 'seed-contents/coding/learn-nodejs-syllabus.json' },
        { id: 'learn_college-oops-java', title: 'Object-Oriented Programming (Java)', syllabusUrl: 'seed-contents/coding/learn-college-oops-java-syllabus.json' },
        { id: 'learn_ux', title: 'UX/UI Design Foundations', syllabusUrl: 'seed-contents/coding/learn-ux-syllabus.json' },
        { id: 'learn_java-beginner-v2-p2', title: 'Java Programming (Part 2)', syllabusUrl: 'seed-contents/coding/learn-java-beginner-v2-p2-syllabus.json' },
        { id: 'learn_dynamic-programming-new', title: 'Dynamic Programming Practice', syllabusUrl: 'seed-contents/coding/learn-dynamic-programming-new-syllabus.json' },
        { id: 'learn_c-beginner-v2-p2', title: 'C Programming (Part 2)', syllabusUrl: 'seed-contents/coding/learn-c-beginner-v2-p2-syllabus.json' },
        { id: 'learn_machine-learning', title: 'Machine Learning Basics', syllabusUrl: 'seed-contents/coding/learn-machine-learning-syllabus.json' },
        { id: 'learn_css', title: 'CSS Styles & Layouts', syllabusUrl: 'seed-contents/coding/learn-css-syllabus.json' },
        { id: 'learn_advanced-python', title: 'Advanced Python', syllabusUrl: 'seed-contents/coding/learn-advanced-python-syllabus.json' },
        { id: 'learn_college-oops-cpp', title: 'Object-Oriented Programming (C++)', syllabusUrl: 'seed-contents/coding/learn-college-oops-cpp-syllabus.json' },
        { id: 'learn_graphs-new', title: 'Graphs Practice', syllabusUrl: 'seed-contents/coding/learn-graphs-new-syllabus.json' },
        { id: 'learn_cpp-stl', title: 'C++ Standard Template Library', syllabusUrl: 'seed-contents/coding/learn-cpp-stl-syllabus.json' },
        { id: 'learn_django', title: 'Django Web Development', syllabusUrl: 'seed-contents/coding/learn-django-syllabus.json' },
        { id: 'learn_oops-concepts-in-python', title: 'OOP Concepts in Python', syllabusUrl: 'seed-contents/coding/learn-oops-concepts-in-python-syllabus.json' },
        { id: 'learn_numpy', title: 'Numerical Python (NumPy)', syllabusUrl: 'seed-contents/coding/learn-numpy-syllabus.json' },
        { id: 'learn_springboot', title: 'Spring Boot Foundations', syllabusUrl: 'seed-contents/coding/learn-springboot-syllabus.json' },
        { id: 'learn_college-programming-c', title: 'College Programming with C', syllabusUrl: 'seed-contents/coding/learn-college-programming-c-syllabus.json' },
        { id: 'learn_pandas', title: 'Data Analysis with Pandas', syllabusUrl: 'seed-contents/coding/learn-pandas-syllabus.json' },
        { id: 'learn_deep-learning-ai', title: 'Deep Learning & AI', syllabusUrl: 'seed-contents/coding/learn-deep-learning-ai-syllabus.json' },
        { id: 'learn_number-theory', title: 'Number Theory', syllabusUrl: 'seed-contents/coding/learn-number-theory-syllabus.json' },
        { id: 'learn_heaps', title: 'Heaps Practice', syllabusUrl: 'seed-contents/coding/learn-heaps-syllabus.json' },
        { id: 'learn_bit-manipulation', title: 'Bit Manipulation', syllabusUrl: 'seed-contents/coding/learn-bit-manipulation-syllabus.json' },
        { id: 'learn_go', title: 'Go Programming Language', syllabusUrl: 'seed-contents/coding/learn-go-syllabus.json' },
        { id: 'learn_kotlin', title: 'Kotlin Programming', syllabusUrl: 'seed-contents/coding/learn-kotlin-syllabus.json' },
        { id: 'learn_rust', title: 'Rust Programming', syllabusUrl: 'seed-contents/coding/learn-rust-syllabus.json' },
        { id: 'learn_c-sharp-beginner-part-1', title: 'C# Programming (Part 1)', syllabusUrl: 'seed-contents/coding/learn-c-sharp-beginner-part-1-syllabus.json' },
        { id: 'learn_tries', title: 'Tries Data Structure', syllabusUrl: 'seed-contents/coding/learn-tries-syllabus.json' },
        { id: 'learn_combinatorics', title: 'Combinatorics', syllabusUrl: 'seed-contents/coding/learn-combinatorics-syllabus.json' },
        { id: 'learn_flask', title: 'Flask Web Framework', syllabusUrl: 'seed-contents/coding/learn-flask-syllabus.json' },
        { id: 'learn_matplotlib', title: 'Data Visualization with Matplotlib', syllabusUrl: 'seed-contents/coding/learn-matplotlib-syllabus.json' },
        { id: 'learn_php', title: 'PHP Basics', syllabusUrl: 'seed-contents/coding/learn-php-syllabus.json' },
        { id: 'learn_r', title: 'R Programming', syllabusUrl: 'seed-contents/coding/learn-r-syllabus.json' },
        { id: 'learn_dsu', title: 'Disjoint Set Union (DSU)', syllabusUrl: 'seed-contents/coding/learn-dsu-syllabus.json' },
        { id: 'learn_college-programming-cpp', title: 'College Programming with C++', syllabusUrl: 'seed-contents/coding/learn-college-programming-cpp-syllabus.json' },
        { id: 'learn_pl-sql', title: 'PL/SQL Databases', syllabusUrl: 'seed-contents/coding/learn-pl-sql-syllabus.json' },
        { id: 'learn_operating-system', title: 'Operating Systems', syllabusUrl: 'seed-contents/coding/learn-operating-system-syllabus.json' },
        { id: 'learn_kotlin-beginner-part-1', title: 'Kotlin Programming (Part 1)', syllabusUrl: 'seed-contents/coding/learn-kotlin-beginner-part-1-syllabus.json' },
        { id: 'learn_kotlin-beginner-part-2', title: 'Kotlin Programming (Part 2)', syllabusUrl: 'seed-contents/coding/learn-kotlin-beginner-part-2-syllabus.json' },
        { id: 'learn_advanced-javascript', title: 'Advanced JavaScript', syllabusUrl: 'seed-contents/coding/learn-advanced-javascript-syllabus.json' },
        { id: 'learn_dynamic-programming-advanced', title: 'Advanced Dynamic Programming', syllabusUrl: 'seed-contents/coding/learn-dynamic-programming-advanced-syllabus.json' },
        { id: 'learn_sorting-intermediate', title: 'Sorting Intermediate', syllabusUrl: 'seed-contents/coding/learn-sorting-intermediate-syllabus.json' },
        { id: 'learn_graphs-advanced', title: 'Advanced Graphs', syllabusUrl: 'seed-contents/coding/learn-graphs-advanced-syllabus.json' },
        { id: 'learn_recursion-new', title: 'Recursion Practice', syllabusUrl: 'seed-contents/coding/learn-recursion-new-syllabus.json' },
        { id: 'learn_searching-sorting-new', title: 'Searching & Sorting', syllabusUrl: 'seed-contents/coding/learn-searching-sorting-new-syllabus.json' },
        { id: 'learn_c-sharp', title: 'C# Mastery', syllabusUrl: 'seed-contents/coding/learn-c-sharp-syllabus.json' },
        { id: 'learn_react-js', title: 'ReactJS Development', syllabusUrl: 'seed-contents/coding/learn-react-js-syllabus.json' },
        { id: 'learn_trees-new', title: 'Trees & Binary Trees Practice', syllabusUrl: 'seed-contents/coding/learn-trees-new-syllabus.json' },
        { id: 'learn_arrays', title: 'Arrays Practice', syllabusUrl: 'seed-contents/coding/learn-arrays-syllabus.json' },
        { id: 'learn_advance-java', title: 'Advanced Java', syllabusUrl: 'seed-contents/coding/learn-advance-java-syllabus.json' }
      ];

      const mockCourses = [
        pfCourse,
        ...scrapedConfigs.map((cfg, idx) => ({
          id: cfg.id,
          title: cfg.title,
          display_order: idx + 1,
          hasSubcourses: false,
          isScrapedCourse: true,
          syllabusUrl: cfg.syllabusUrl.replace('seed-contents/coding/', 'articles/CourseMappingFiles/'),
          modules: []
        })),
        {
          id: 'learn_python',
          title: 'Learn Python',
          display_order: 1000,
          hasSubcourses: false,
          modules: [
            { id: 'PY001', name: 'Python Basics', url: 'seed-contents/coding/basic-datatypes.json', type: 'coding', display_order: 1 },
            { id: 'PY002', name: 'Control Flow in Python', url: 'seed-contents/coding/conditional-statements.json', type: 'coding', display_order: 2 }
          ]
        },
        {
          id: 'python_problem_solving',
          title: 'Problem solving in Python',
          display_order: 1001,
          hasSubcourses: false,
          modules: [
            { id: 'PYS001', name: 'Logic building exercises', url: 'seed-contents/coding/conditional-statements.json', type: 'coding', display_order: 1 },
            { id: 'PYS002', name: 'Math & Number based logic', url: 'seed-contents/coding/looping.json', type: 'coding', display_order: 2 }
          ]
        },
        {
          id: 'learn_sql',
          title: 'Learn SQL',
          display_order: 1002,
          hasSubcourses: false,
          modules: [
            { id: 'SQL001', name: 'SQL Query Basics', url: 'seed-contents/coding/basic-datatypes.json', type: 'coding', display_order: 1 },
            { id: 'SQL002', name: 'Advanced Queries & Joins', url: 'seed-contents/coding/conditional-statements.json', type: 'coding', display_order: 2 }
          ]
        },
        {
          id: 'learn_aptitude',
          title: 'Aptitude & Reasoning Mastery',
          display_order: 1005,
          hasSubcourses: false,
          isScrapedCourse: true,
          syllabusUrl: 'articles/course/AptitudeCourses/learn-aptitude-syllabus.json',
          modules: []
        }
      ];

      const coursesList = [...mockCourses];
      setCourses(coursesList);

      // Auto-expand first course
      if (coursesList.length > 0) {
        setExpandedCourses({ [coursesList[0].id]: true });
      }
    } catch (err) {
      console.error('[PracticeHome] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRoadmapStyle = (slug) => {
    const map = {
      'become-5-star': { color: '#10b981', icon: '⭐' },
      'python-dsa': { color: '#3b82f6', icon: '🐍' },
      'javascript-dsa': { color: '#f59e0b', icon: '⚡' },
      'cpp-dsa': { color: '#8b5cf6', icon: '⚙️' },
      'java-dsa': { color: '#ef4444', icon: '☕' }
    };
    return map[slug] || { color: '#10b981', icon: '🚀' };
  };

  const closeArticle = () => {
    setActiveArticle(null);
    setActiveArticleMeta(null);
  };

  const handleSync = async () => {
    // STRICT UID: canonical Practice identity is Firebase Auth UID only.
    const uid = user?.uid;
    if (!uid) {
      console.warn('[PracticeHome] Firebase UID not available — sync skipped');
      return;
    }
    setSyncing(true);
    setSyncMsg({ text: 'Syncing with cloud...', type: 'info' });
    try {
      const res = await syncProgressWithFirebase(uid);
      if (res.success) {
        setSolvedIds(res.progress.solvedProblems || []);
        setProblemDetails(res.progress.problemDetails || {});
        setSyncMsg({ text: 'Progress synced successfully!', type: 'success' });
      } else {
        setSyncMsg({ text: res.error || 'Sync failed.', type: 'error' });
      }
    } catch (err) {
      setSyncMsg({ text: err.message || 'Sync failed.', type: 'error' });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg({ text: '', type: '' }), 3000);
    }
  };

  const handleSheetCardClick = (sheet) => {
    if (sheet.buttonType === 'link') {
      window.open(sheet.link, '_blank');
    } else {
      setSelectedSheet(sheet.id);
      setExpandedTopics({});
    }
  };

  const renderSheetsTab = () => {
    if (selectedSheet) {
      const sheet = Object.values(CATEGORIZED_SHEETS).flat().find(s => s.id === selectedSheet);
      if (!sheet) return null;

      const totalSheetQuestions = getSheetTotalProblems(sheet);
      const solvedCount = getSheetSolvedCount(sheet);
      const percentage = totalSheetQuestions > 0 ? Math.round((solvedCount / totalSheetQuestions) * 100) : 0;
      const dashOffset = 251.2 - (251.2 * (solvedCount / totalSheetQuestions || 0));

      return (
        <div className="ph-section ps-sheet-detail" style={{ margin: '20px auto' }}>
          <button
            onClick={() => setSelectedSheet(null)}
            className="ph-topbar-btn"
            style={{
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '20px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--ph-text)'
            }}
          >
            <FaChevronLeft /> Back to Sheets
          </button>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
            gap: '24px',
            background: 'var(--ph-surface)',
            border: '1px solid var(--ph-border)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '30px'
          }}>
            <div>
              <span style={{
                background: `${sheet.borderColor}15`,
                color: sheet.borderColor,
                fontSize: '11px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '4px 10px',
                borderRadius: '4px',
                display: 'inline-block',
                marginBottom: '10px'
              }}>{sheet.tag}</span>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--ph-text)', margin: '0 0 10px 0' }}>{sheet.title}</h2>
              <p style={{ color: 'var(--ph-text-dim)', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>{sheet.desc}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid var(--ph-border)' }}>
              <div style={{ position: 'relative', width: '90px', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="90" height="90" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="transparent" />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke={sheet.borderColor}
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={251.2}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', fontSize: '18px', fontWeight: 'bold', color: 'var(--ph-text)' }}>
                  {percentage}%
                </div>
              </div>
              <div style={{ color: 'var(--ph-text-dim)', fontSize: '12px', marginTop: '10px', fontWeight: '600' }}>
                {solvedCount}/{totalSheetQuestions} Solved
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '40px' }}>
            {sheet.id === 'a2z' ? (
              // ─── A2Z SHEET NESTED STRUCTURE (Sections -> Subcategories -> Problems) ───
              sheet.sections.map((section, secIdx) => (
                <div key={section.title} style={{ marginBottom: '10px' }}>
                  <h3 style={{
                    fontSize: '18px',
                    fontWeight: '800',
                    color: 'var(--ph-text)',
                    marginBottom: '14px',
                    borderBottom: '2px solid var(--ph-border)',
                    paddingBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ color: sheet.borderColor }}>Step {secIdx + 1}:</span> {section.title}
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {section.subcategories.map((sub, subIdx) => {
                      const accordionKey = `${section.title}-${sub.title}`;
                      const isOpen = !!expandedTopics[accordionKey];

                      return (
                        <div
                          key={sub.title}
                          style={{
                            background: 'var(--ph-surface)',
                            border: '1px solid var(--ph-border)',
                            borderRadius: '12px',
                            overflow: 'hidden'
                          }}
                        >
                          <div
                            onClick={() => setExpandedTopics(prev => ({ ...prev, [accordionKey]: !prev[accordionKey] }))}
                            style={{
                              padding: '14px 20px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              background: 'rgba(255,255,255,0.01)',
                              borderBottom: isOpen ? '1px solid var(--ph-border)' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontSize: '16px', color: sheet.borderColor }}>
                                {isOpen ? <FaFolderOpen /> : <FaFolder />}
                              </span>
                              <strong style={{ fontSize: '14px', color: 'var(--ph-text)' }}>
                                Lecture {subIdx + 1}: {sub.title}
                              </strong>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--ph-text-dim)', fontWeight: '600' }}>
                                {sub.problems.length} Problems
                              </span>
                              <span style={{ color: 'var(--ph-text-dim)' }}>
                                {isOpen ? <FaAngleDown /> : <FaAngleRight />}
                              </span>
                            </div>
                          </div>

                          {isOpen && (
                            <div style={{ padding: '0px' }}>
                              <table className="ph-problems-table" style={{ margin: 0, border: 'none', background: 'transparent' }}>
                                <thead>
                                  <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                                    <th className="ph-col-status" style={{ width: '40px', paddingLeft: '20px' }}>Status</th>
                                    <th className="ph-col-num" style={{ width: '50px' }}>#</th>
                                    <th className="ph-col-title">Question</th>
                                    <th className="ph-col-diff" style={{ width: '100px' }}>Difficulty</th>
                                    <th className="ph-col-score" style={{ width: '160px', textAlign: 'right', paddingRight: '20px' }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sub.problems.map((p, pIdx) => {
                                    const diffClass = p.difficulty?.toLowerCase() || 'easy';
                                    const isSolved = !!(sheetSolvedDicts['a2z'] || {})[p.id] || solvedIdsSet.has(p.id);
                                    return (
                                      <tr
                                        key={p.id || pIdx}
                                        className={`ph-problem-row ${isSolved ? 'solved' : ''}`}
                                        style={{ background: 'rgba(255,255,255,0.005)' }}
                                      >
                                        <td
                                          className="ph-col-status"
                                          style={{ paddingLeft: '20px', fontSize: '14px', cursor: 'pointer' }}
                                          onClick={() => toggleProblemSolved('a2z', p.id)}
                                        >
                                          <span className="ph-status-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                            {isSolved ? (
                                              <FaCheckCircle style={{ color: 'var(--ph-success)' }} />
                                            ) : (isQuestionPremium(p.id) && !isPremiumUser) ? (
                                              <FaLock style={{ color: 'var(--ph-text-dim)', fontSize: '11px' }} />
                                            ) : (
                                              <span style={{
                                                width: '14px',
                                                height: '14px',
                                                borderRadius: '50%',
                                                border: '2px solid var(--ph-text-dim)',
                                                display: 'inline-block',
                                                opacity: 0.6
                                              }} />
                                            )}
                                          </span>
                                        </td>
                                        <td className="ph-col-num" style={{ color: 'var(--ph-text-dim)' }}>{pIdx + 1}</td>
                                        <td className="ph-col-title">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span
                                              className="ph-problem-title-text"
                                              style={{ fontWeight: '500', cursor: p.article ? 'pointer' : 'default', color: 'var(--ph-text)' }}
                                              onClick={() => p.article && openArticle(p.article, p.name, p.id, 'a2z')}
                                            >
                                              {p.name}
                                            </span>
                                            {isQuestionPremium(p.id) && <FaStar style={{ color: '#fbbf24', marginLeft: '4px', fontSize: '11px' }} />}
                                            {p.article && (
                                              <button
                                                onClick={() => openArticle(p.article, p.name, p.id, 'a2z')}
                                                style={{
                                                  background: 'none',
                                                  border: 'none',
                                                  color: 'var(--ph-primary)',
                                                  cursor: 'pointer',
                                                  padding: '2px',
                                                  fontSize: '13px',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  opacity: 0.8,
                                                  transition: 'opacity 0.2s'
                                                }}
                                                title="Read Tutorial"
                                                className="ph-article-btn"
                                              >
                                                <FaBookOpen />
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="ph-col-diff">
                                          <span className={`ph-diff-tag ${diffClass}`}>{p.difficulty ?? ''}</span>
                                        </td>
                                        <td className="ph-col-score" style={{ textAlign: 'right', paddingRight: '20px' }}>
                                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            {p.id && String(p.id).startsWith('Q') && (
                                              <button
                                                onClick={() => navigate(`/student/practice/solve/${p.id}`, { state: { scoringType: 'PARTIAL_SCORE' } })}
                                                style={{
                                                  background: 'var(--ph-primary)',
                                                  border: '1px solid rgba(124,107,255,0.4)',
                                                  borderRadius: '6px',
                                                  color: 'white',
                                                  fontSize: '11px',
                                                  fontWeight: 'bold',
                                                  padding: '4px 12px',
                                                  cursor: 'pointer',
                                                  transition: 'all 0.2s'
                                                }}
                                              >
                                                Code
                                              </button>
                                            )}
                                            <button
                                              onClick={() => toggleProblemSolved('a2z', p.id)}
                                              style={{
                                                background: isSolved ? 'rgba(74,222,128,0.1)' : 'var(--ph-primary-light)',
                                                border: isSolved ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(124,107,255,0.3)',
                                                borderRadius: '6px',
                                                color: isSolved ? 'var(--ph-success)' : 'var(--ph-primary)',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                padding: '4px 12px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                              }}
                                            >
                                              {isSolved ? 'Solved' : 'Solve'}
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              // ─── NON-A2Z SHEET FLAT STRUCTURE (Sections -> Problems) ───
              sheet.sections.map((section, secIdx) => {
                const accordionKey = `${sheet.id}-${section.title}`;
                const isOpen = !!expandedTopics[accordionKey];
                const solvedSecCount = section.problems.filter(p => (sheetSolvedDicts[sheet.id] || {})[p.id]).length;
                const pct = section.problems.length > 0 ? Math.round((solvedSecCount / section.problems.length) * 100) : 0;

                return (
                  <div
                    key={section.title}
                    style={{
                      background: 'var(--ph-surface)',
                      border: '1px solid var(--ph-border)',
                      borderRadius: '12px',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      onClick={() => setExpandedTopics(prev => ({ ...prev, [accordionKey]: !prev[accordionKey] }))}
                      style={{
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: 'rgba(255,255,255,0.01)',
                        borderBottom: isOpen ? '1px solid var(--ph-border)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '18px', color: sheet.borderColor }}>
                          {isOpen ? <FaFolderOpen /> : <FaFolder />}
                        </span>
                        <strong style={{ fontSize: '15px', color: 'var(--ph-text)' }}>
                          Step {secIdx + 1}: {section.title}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '80px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: sheet.borderColor, borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--ph-text-dim)', minWidth: '45px', textAlign: 'right' }}>
                            {solvedSecCount}/{section.problems.length}
                          </span>
                        </div>
                        <span style={{ color: 'var(--ph-text-dim)' }}>
                          {isOpen ? <FaAngleDown /> : <FaAngleRight />}
                        </span>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '0px' }}>
                        <table className="ph-problems-table" style={{ margin: 0, border: 'none', background: 'transparent' }}>
                          <thead>
                            <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                              <th className="ph-col-status" style={{ width: '40px', paddingLeft: '20px' }}>Status</th>
                              <th className="ph-col-num" style={{ width: '50px' }}>#</th>
                              <th className="ph-col-title">Question</th>
                              <th className="ph-col-diff" style={{ width: '100px' }}>Difficulty</th>
                              <th className="ph-col-score" style={{ width: '160px', textAlign: 'right', paddingRight: '20px' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.problems.map((p, pIdx) => {
                              const isSolved = !!(sheetSolvedDicts[sheet.id] || {})[p.id] || solvedIdsSet.has(p.id);
                              const diffClass = p.difficulty?.toLowerCase() || 'easy';

                              return (
                                <tr
                                  key={p.id || pIdx}
                                  className={`ph-problem-row ${isSolved ? 'solved' : ''}`}
                                  style={{ background: 'rgba(255,255,255,0.005)' }}
                                >
                                  <td
                                    className="ph-col-status"
                                    style={{ paddingLeft: '20px', fontSize: '14px', cursor: 'pointer' }}
                                    onClick={() => toggleProblemSolved(sheet.id, p.id)}
                                  >
                                    <span className="ph-status-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                      {isSolved ? (
                                        <FaCheckCircle style={{ color: 'var(--ph-success)' }} />
                                      ) : (isQuestionPremium(p.id) && !isPremiumUser) ? (
                                        <FaLock style={{ color: 'var(--ph-text-dim)', fontSize: '11px' }} />
                                      ) : (
                                        <span style={{
                                          width: '14px',
                                          height: '14px',
                                          borderRadius: '50%',
                                          border: '2px solid var(--ph-text-dim)',
                                          display: 'inline-block',
                                          opacity: 0.6
                                        }} />
                                      )}
                                    </span>
                                  </td>
                                  <td className="ph-col-num" style={{ color: 'var(--ph-text-dim)' }}>{pIdx + 1}</td>
                                  <td className="ph-col-title">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <span
                                        className="ph-problem-title-text"
                                        style={{ fontWeight: '500', cursor: p.article ? 'pointer' : 'default', color: 'var(--ph-text)' }}
                                        onClick={() => p.article && openArticle(p.article, p.name, p.id, sheet.id)}
                                      >
                                        {p.name}
                                      </span>
                                      {isQuestionPremium(p.id) && <FaStar style={{ color: '#fbbf24', marginLeft: '4px', fontSize: '11px' }} />}
                                      {p.article && (
                                        <button
                                          onClick={() => openArticle(p.article, p.name, p.id, sheet.id)}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--ph-primary)',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            fontSize: '13px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            opacity: 0.8,
                                            transition: 'opacity 0.2s'
                                          }}
                                          title="Read Tutorial"
                                          className="ph-article-btn"
                                        >
                                          <FaBookOpen />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  <td className="ph-col-diff">
                                    <span className={`ph-diff-tag ${diffClass}`}>{p.difficulty ?? ''}</span>
                                  </td>
                                  <td className="ph-col-score" style={{ textAlign: 'right', paddingRight: '20px' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                      {p.id && String(p.id).startsWith('Q') && (
                                        <button
                                          onClick={() => navigate(`/student/practice/solve/${p.id}`, { state: { scoringType: 'PARTIAL_SCORE' } })}
                                          style={{
                                            background: 'var(--ph-primary)',
                                            border: '1px solid rgba(124,107,255,0.4)',
                                            borderRadius: '6px',
                                            color: 'white',
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            padding: '4px 12px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                          }}
                                        >
                                          Code
                                        </button>
                                      )}
                                      <button
                                        onClick={() => toggleProblemSolved(sheet.id, p.id)}
                                        style={{
                                          background: isSolved ? 'rgba(74,222,128,0.1)' : 'var(--ph-primary-light)',
                                          border: isSolved ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(124,107,255,0.3)',
                                          borderRadius: '6px',
                                          color: isSolved ? 'var(--ph-success)' : 'var(--ph-primary)',
                                          fontSize: '11px',
                                          fontWeight: 'bold',
                                          padding: '4px 12px',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s'
                                        }}
                                      >
                                        {isSolved ? 'Solved' : 'Solve'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="ph-section" style={{ margin: '30px auto' }}>
        <div className="ph-hero" style={{ padding: '20px 0' }}>
          <div className="ph-hero-tag">Structured Sheets</div>
        </div>

        <div className="ps-categories-container" style={{ marginTop: '20px' }}>
          {Object.entries(CATEGORIZED_SHEETS).map(([categoryName, sheets]) => (
            <div key={categoryName} className="ps-category-group">
              <h2 className="ps-category-header">
                {categoryName}
              </h2>

              <div className="ps-cards-grid">
                {sheets.map(sheet => {
                  const totalQs = getSheetTotalProblems(sheet);
                  const solvedQs = getSheetSolvedCount(sheet);
                  const style = {
                    '--theme-border-color': sheet.borderColor,
                    '--theme-border-color-15': `${sheet.borderColor}15`,
                    '--theme-border-color-25': `${sheet.borderColor}25`,
                    '--theme-border-color-30': `${sheet.borderColor}30`,
                    '--theme-border-color-50': `${sheet.borderColor}50`
                  };

                  return (
                    <div
                      key={sheet.id}
                      className="ps-sheet-card"
                      style={style}
                    >
                      <div>
                        <h3 className="ps-card-title">{sheet.title}</h3>
                        <p className="ps-card-desc">{sheet.desc}</p>
                      </div>

                      <div className="ps-card-footer">
                        <span className="ps-card-stats">
                          {solvedQs}/{totalQs} Solved
                        </span>

                        <div className="ps-card-actions">
                          {sheet.id === 'a2z' || sheet.id === 'blind75' || sheet.id === 'sde' || sheet.id === 'striver79' ? (
                            <>
                              <button
                                onClick={() => handleSheetCardClick(sheet)}
                                className="ps-action-btn"
                                style={{ padding: '6px 10px' }}
                              >
                                Sheet
                              </button>
                              <button
                                onClick={() => handleSheetCardClick(sheet)}
                                className="ps-action-btn primary"
                                style={{ padding: '6px 10px' }}
                              >
                                Track
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleSheetCardClick(sheet)}
                              className="ps-action-btn primary"
                            >
                              Start Learning
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const isPremiumUser = user?.Premium === true || user?.Premium === 'true' || user?.Premium === 1 || user?.Premium === 'Yes' || !!user?.isPremium;
  const isQuestionPremium = (qid) => {
    if (qid && String(qid).startsWith('Q0.')) return false;
    const q = questions.find(item => item.questionId === qid);
    return q?.isPremium || q?.metadata?.isPremium || false;
  };

  const handleQuestionClick = (q, status) => {
    navigate(`/student/practice/solve/${q.questionId}`, {
      state: { scoringType: q.scoringType || 'PARTIAL_SCORE' }
    });
  };

  // Launch a course module (mcq, coding, or mixed)
  const handleModuleClick = async (mod) => {
    if (mod.isPremium && !isPremiumUser) {
      setShowPremiumModal(true);
      return;
    }

    if (mod.type === 'mcq') {
      // Redirect to MCQ page in practice mode
      navigate(`/student/mcq/${mod.slug}`, { state: { isPractice: true } });
    } else {
      // It is a coding module: Load contest questions list from mod.url
      setSelectedModule(mod);
      setContestLoading(true);
      try {
        let finalUrl = mod.url ?? '';
        // If it starts with standard relative, map it to local or fetch from URL
        if (!finalUrl.endsWith('.json')) {
          finalUrl = `coding/testbank/${mod.slug}.json`;
        }

        // Clean and prepare the path relative to the seed-contents repository root
        let cleanPath = finalUrl;
        if (cleanPath.startsWith('/seed-contents/')) {
          cleanPath = cleanPath.substring('/seed-contents/'.length);
        } else if (cleanPath.startsWith('/')) {
          cleanPath = cleanPath.substring(1);
        }

        const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';
        const LOCAL_BASE = '/seed-contents';

        const githubUrl = `${GITHUB_RAW_BASE}/${cleanPath}`;
        const localUrl = `${LOCAL_BASE}/${cleanPath}`;

        let data = null;
        try {
          // 1. Try raw GitHub CDN first
          const response = await fetch(githubUrl, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          data = await response.json();
        } catch (githubErr) {
          console.warn('[PracticeHome] GitHub raw fetch failed, trying local fallback:', githubErr.message);
          // 2. Try local desktop path fallback
          const localResponse = await fetch(localUrl);
          if (!localResponse.ok) throw new Error(`Local fetch failed: HTTP ${localResponse.status}`);
          data = await localResponse.json();
        }

        // Mapped questions array from the contest file
        let questionsList = data.questions || [];
        if (questionsList.length === 0 && Array.isArray(data.questionIds) && data.questionIds.length > 0) {
          const { fetchQuestionsForContest } = await import('../services/codingQuestionBankService');
          questionsList = await fetchQuestionsForContest(data.questionIds);
        }
        setContestQuestions(questionsList);
      } catch (err) {
        console.error('Failed to load contest questions:', err);
        toast.error('Could not fetch questions list for this practice module.');
        setSelectedModule(null);
      } finally {
        setContestLoading(false);
      }
    }
  };

  const toggleCourseExpand = (cId) => {
    setExpandedCourses(prev => ({ ...prev, [cId]: !prev[cId] }));
  };

  const toggleSubcourseExpand = (sId) => {
    setExpandedSubcourses(prev => ({ ...prev, [sId]: !prev[sId] }));
  };

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedDifficulty, selectedStatus]);

  // Tab switching with smooth loader transition
  const handleTabChange = (targetTab) => {
    if (activeTab === targetTab && !selectedModule && !selectedSheet && !selectedCourse) return;
    setTabLoading(true);
    setSelectedModule(null);
    setSelectedSheet(null);
    setSelectedCourse(null);
    setActiveTab(targetTab);
    setCurrentPage(1);

    requestAnimationFrame(() => {
      setTimeout(() => {
        setTabLoading(false);
      }, 120);
    });
  };

  // Filter flat list of questions (memoized for instant responsiveness)
  const filteredQuestions = useMemo(() => {
    if (!questions || questions.length === 0) return [];
    return questions.filter(q => {
      const matchesSearch = !searchQuery ||
        (q.title && q.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (q.questionId && q.questionId.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;

      const matchesCategory = selectedCategory === 'All' || q.category === selectedCategory;
      if (!matchesCategory) return false;

      const matchesDifficulty = selectedDifficulty === 'All' || q.difficulty === selectedDifficulty;
      if (!matchesDifficulty) return false;

      if (selectedStatus !== 'All') {
        const status = getQuestionDisplayStatus(q.questionId, solvedIds, problemDetails, q.isPremium, isPremiumUser, attemptedIds);
        if (selectedStatus === 'ATTEMPTED' || selectedStatus === 'IN_PROGRESS') {
          if (status !== 'ATTEMPTED' && status !== 'IN_PROGRESS') return false;
        } else if (status !== selectedStatus) {
          return false;
        }
      }

      return true;
    });
  }, [questions, searchQuery, selectedCategory, selectedDifficulty, selectedStatus, solvedIds, attemptedIds, problemDetails, isPremiumUser]);

  const totalPages = Math.ceil(filteredQuestions.length / pageSize) || 1;

  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredQuestions.slice(start, start + pageSize);
  }, [filteredQuestions, currentPage, pageSize]);

  return (
    <div className="ph-root">
      {/* Sub navigation bar */}
      <div className="ph-topbar" style={{ background: 'transparent', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', padding: '12px 0px', marginBottom: '20px', position: 'static' }}>
        <div className="ph-section" style={{ display: 'flex', width: '100%', justifyContent: 'flex-start', padding: '0 32px' }}>
          <div className="ph-topbar-nav" style={{ gap: '8px' }}>
            <button
              className={`ph-topbar-btn ${activeTab === 'paths' && !selectedModule ? 'active' : ''}`}
              onClick={() => handleTabChange('paths')}
              style={{ borderRadius: '8px' }}
            >
              Course Curriculum
            </button>
            <button
              className={`ph-topbar-btn ${activeTab === 'sheets' && !selectedModule ? 'active' : ''}`}
              onClick={() => handleTabChange('sheets')}
              style={{ borderRadius: '8px' }}
            >
              Structured Sheets
            </button>
            <button
              className={`ph-topbar-btn ${activeTab === 'bank' && !selectedModule ? 'active' : ''}`}
              onClick={() => handleTabChange('bank')}
              style={{ borderRadius: '8px' }}
            >
              Practice Bank
            </button>
          </div>
        </div>
      </div>

      {/* Sync Message Alert */}
      {syncMsg.text && (
        <div style={{
          padding: '10px',
          textAlign: 'center',
          backgroundColor: syncMsg.type === 'success' ? '#1b5e20' : syncMsg.type === 'error' ? '#b71c1c' : '#0d47a1',
          color: 'white',
          fontSize: '14px',
          fontWeight: 600
        }}>
          {syncMsg.text}
        </div>
      )}

      {/* Main Panel Content */}
      {tabLoading ? (
        <div className="ph-tab-loader">
          <div className="ph-spinner" style={{ width: '36px', height: '36px' }} />
          <p style={{ marginTop: '14px', color: 'var(--ph-text-dim)', fontSize: '14px', fontWeight: 500 }}>
            {activeTab === 'bank' ? 'Loading Question Bank...' : 'Loading Section...'}
          </p>
        </div>
      ) : (
        <div className="ph-tab-content-fade">
          {selectedModule ? (
        // ─── CONTEST QUESTION LIST VIEW ───
        <div className="ph-section" style={{ margin: '30px auto' }}>
          <button
            onClick={() => setSelectedModule(null)}
            style={{
              background: 'none', border: 'none', color: '#7c6bff', fontSize: '15px',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              marginBottom: '20px'
            }}
          >
            <FaChevronLeft /> Back to Learning Paths
          </button>
          <h2 style={{ fontSize: '24px', color: 'var(--ph-text)', marginBottom: '8px' }}>
            {selectedModule.name}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '24px' }}>
            Choose a problem below to solve inside the sandboxed code IDE.
          </p>

          {contestLoading ? (
            <div className="ph-loading">
              <div className="ph-spinner" />
              <p>Loading module questions...</p>
            </div>
          ) : contestQuestions.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>No questions configured in this module.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {contestQuestions.map((q, idx) => {
                const isPremiumQ = !!q.isPremium;
                const status = getQuestionDisplayStatus(q.id, solvedIds, problemDetails, isPremiumQ, isPremiumUser, attemptedIds);
                const bestScore = problemDetails[q.id]?.bestScore;

                return (
                  <div
                    key={q.id ? `${q.id}-${idx}` : `q-${idx}`}
                    onClick={() => handleQuestionClick({ questionId: q.id, scoringType: q.scoringType }, status)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px',
                      background: 'var(--ph-card)', border: '1px solid var(--ph-border)', borderRadius: '12px',
                      cursor: status === 'LOCKED' ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
                    }}
                    className="q-list-row-hover"
                  >
                    <div style={{ fontSize: '13px', color: '#94a3b8', width: '28px', textAlign: 'center' }}>
                      {idx + 1}
                    </div>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: status === 'SOLVED' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.06)',
                      color: status === 'SOLVED' ? '#4ade80' : '#94a3b8'
                    }}>
                      {STATUS_ICONS[status] ?? ''}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ph-text)' }}>
                        {q.title}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <span style={{ background: 'rgba(255,255,255,0.05)', color: '#38bdf8', fontSize: '11px', padding: '2px 8px', borderRadius: '100px' }}>
                          {q.difficulty ?? ''}
                        </span>
                        {isPremiumQ && (
                          <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: '11px', padding: '2px 8px', borderRadius: '100px', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                            <FaStar style={{ marginRight: '4px' }} /> Premium
                          </span>
                        )}
                        {bestScore !== undefined && (
                          <span style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', fontSize: '11px', padding: '2px 8px', borderRadius: '100px' }}>
                            Score: {bestScore}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '18px', display: 'flex', alignItems: 'center' }}>
                      {status === 'LOCKED' ? <FaLock style={{ fontSize: '12px' }} /> : '›'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'sheets' ? (
        renderSheetsTab()
      ) : activeTab === 'paths' ? (
        // ─── STRUCTURED LEARNING PATHS VIEW ───
        <div className="ph-section" style={{ margin: '30px auto' }}>

          {loading ? (
            <div className="ph-loading">
              <div className="ph-spinner" />
              <p>Loading course pathways...</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="ph-empty">
              <div className="ph-empty-icon"><FaFolderOpen /></div>
              <div className="ph-empty-title">No assigned courses found</div>
              <div className="ph-empty-desc">Your department hasn't mapped any learning courses to your current profile yet.</div>
            </div>
          ) : selectedCourse ? (
            // ─── COURSE DETAIL VIEW ───
            (() => {
              const norm = selectedCourse.replace(/-/g, '_');
              const course = courses.find(c => c.id === selectedCourse || c.id === norm || c.id.replace(/-/g, '_') === norm);
              if (!course) return null;

              if (course.isScrapedCourse) {
                if (!scrapedSyllabus) {
                  return (
                    <div className="ph-loading">
                      <div className="ph-spinner" />
                      <p>Loading course syllabus...</p>
                    </div>
                  );
                }

                // calculate stats
                let totalQs = 0;
                let solvedQs = 0;
                scrapedSyllabus.modules.forEach(m => {
                  m.submodules.forEach(s => {
                    s.problems.forEach(p => {
                      totalQs++;
                      if (solvedIdsSet.has(p.id)) solvedQs++;
                    });
                  });
                });

                const percentage = totalQs > 0 ? Math.round((solvedQs / totalQs) * 100) : 0;
                const dashOffset = 251.2 - (251.2 * (solvedQs / totalQs || 0));

                return (
                  <div className="ps-sheet-detail" style={{ marginTop: '10px' }}>
                    {/* Breadcrumb Navigation (View 4) */}
                    <div className="course-breadcrumb-bar">
                      <button
                        onClick={() => setSelectedCourse(null)}
                        className="breadcrumb-back-btn"
                      >
                        <FaChevronLeft />
                      </button>
                      <span className="breadcrumb-parent" onClick={() => setSelectedCourse(null)}>Course Curriculum</span>
                      <span className="breadcrumb-sep">&gt;</span>
                      <span className="breadcrumb-current">{course.title}</span>
                    </div>

                    {/* Course Hero Emerald Banner Card (View 4) */}
                    <div className="course-detail-hero-card">
                      <div className="course-hero-left">
                        <div className="course-hero-badge-row">
                          <span className="course-hero-type-badge">Technical Course</span>
                          <span className="course-hero-stat-pill">{(course.modules || []).length} Modules</span>
                          <span className="course-hero-stat-pill">Beginner</span>
                          <span className="course-hero-stat-pill">{solvedQs}/{totalQs} Solved</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px' }}>
                          <div className="course-hero-icon-box">
                            <FaCode />
                          </div>
                          <div>
                            <h2 className="course-hero-title">{course.title}</h2>
                            <p className="course-hero-desc">
                              {course.id === 'programming_fundamentals'
                                ? 'Master core programming fundamentals: basic datatypes, operators, conditionals, loops, crunching, arrays, and strings.'
                                : course.id === 'learn_aptitude'
                                  ? 'Master Quantitative Aptitude, Logical Reasoning, and Verbal Ability with standard MCQ practice sets.'
                                  : `Learn and master problem solving, logic building, and algorithms for ${course.title}.`}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="course-hero-right-gauge">
                        <div className="circular-gauge-container">
                          <svg width="84" height="84" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                            <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.2)" strokeWidth="8" fill="transparent" />
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              stroke="#ffffff"
                              strokeWidth="8"
                              fill="transparent"
                              strokeDasharray={251.2}
                              strokeDashoffset={dashOffset}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                            />
                          </svg>
                          <div className="circular-gauge-text">
                            <span className="gauge-pct">{percentage}%</span>
                            <span className="gauge-lbl">Progress</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sub-tabs Row (View 4) */}
                    <div className="course-subtabs-row">
                      <button className="course-subtab-btn active">Modules</button>
                      <button className="course-subtab-btn">About</button>
                      <button className="course-subtab-btn">Resources</button>
                    </div>

                    {/* Modules Accordion */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {scrapedSyllabus.modules.map((mod, modIdx) => {
                        const accordionKey = `scraped-${course.id}-${modIdx}`;
                        const isOpen = !!expandedTopics[accordionKey];
                        const first4ProblemIds = modIdx === 0 ? mod.submodules.flatMap(s => s.problems).slice(0, 4).map(p => p.id) : [];

                        return (
                          <div
                            key={modIdx}
                            style={{
                              background: 'var(--ph-surface)',
                              border: '1px solid var(--ph-border)',
                              borderRadius: '12px',
                              overflow: 'hidden'
                            }}
                          >
                            {/* Module header toggle */}
                            <div
                              onClick={() => setExpandedTopics(prev => ({ ...prev, [accordionKey]: !isOpen }))}
                              style={{
                                padding: '16px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                background: 'rgba(255,255,255,0.01)',
                                borderBottom: isOpen ? '1px solid var(--ph-border)' : 'none'
                              }}
                            >
                              <div>
                                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--ph-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {mod.name}
                                  {modIdx >= 1 && !isPremiumUser && (
                                    <FaLock style={{ color: 'var(--ph-text-dim)', fontSize: '12px' }} title="Premium Subscription Required" />
                                  )}
                                </h3>
                                {mod.description && (
                                  <p style={{ fontSize: '12px', color: 'var(--ph-text-dim)', margin: '4px 0 0 0' }}>{mod.description}</p>
                                )}
                              </div>
                              <span style={{ color: 'var(--ph-text-dim)' }}>
                                {isOpen ? <FaAngleDown /> : <FaAngleRight />}
                              </span>
                            </div>

                            {/* Submodules list if open */}
                            {isOpen && (
                              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(0,0,0,0.08)' }}>
                                {mod.submodules.map((sub, subIdx) => (
                                  <div
                                    key={subIdx}
                                    style={{
                                      background: 'rgba(255,255,255,0.02)',
                                      border: '1px solid rgba(255,255,255,0.04)',
                                      borderRadius: '8px',
                                      padding: '16px'
                                    }}
                                  >
                                    <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--ph-text)', margin: '0 0 12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', display: 'flex', alignItems: 'center' }}>
                                      <FaBookOpen style={{ marginRight: '6px', fontSize: '12px', color: 'var(--ph-text-dim)' }} /> {sub.name}
                                    </h4>

                                    {/* Problems Table */}
                                    <table className="ph-problems-table" style={{ margin: 0, border: 'none', background: 'transparent' }}>
                                      <thead>
                                        <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                                          <th className="ph-col-status" style={{ width: '40px', paddingLeft: '12px' }}>Status</th>
                                          <th className="ph-col-num" style={{ width: '50px' }}>#</th>
                                          <th className="ph-col-title">Task Name</th>
                                          <th className="ph-col-diff" style={{ width: '100px' }}>Type</th>
                                          <th className="ph-col-score" style={{ width: '140px', textAlign: 'right', paddingRight: '12px' }}>Action</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {sub.problems.map((prob, pIdx) => {
                                          let isPremiumQ = true;
                                          if (modIdx === 0 && first4ProblemIds.includes(prob.id)) {
                                            isPremiumQ = false;
                                          }
                                          const status = getQuestionDisplayStatus(prob.id, solvedIds, problemDetails, isPremiumQ, isPremiumUser, attemptedIds);
                                          const isAptitude = course.id === 'learn_aptitude';
                                          const articleSlug = getCorrectArticleForProblem(course.id, prob);

                                          return (
                                            <tr key={pIdx} className="ph-problem-row" style={{ background: 'rgba(255,255,255,0.005)' }}>
                                              <td className="ph-col-status" style={{ paddingLeft: '12px' }}>
                                                {status === 'SOLVED' ? (
                                                  <FaCheckCircle style={{ color: 'var(--ph-success)' }} />
                                                ) : status === 'LOCKED' ? (
                                                  <FaLock style={{ color: 'var(--ph-text-dim)', fontSize: '11px' }} />
                                                ) : (
                                                  <span style={{
                                                    width: '12px',
                                                    height: '12px',
                                                    borderRadius: '50%',
                                                    border: '2px solid var(--ph-text-dim)',
                                                    display: 'inline-block',
                                                    opacity: 0.6
                                                  }} />
                                                )}
                                              </td>
                                              <td className="ph-col-num" style={{ color: 'var(--ph-text-dim)' }}>{pIdx + 1}</td>
                                              <td className="ph-col-title">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                  <span
                                                    className="ph-problem-title-text"
                                                    style={{
                                                      fontWeight: '500',
                                                      color: 'var(--ph-text)',
                                                      cursor: isAptitude ? 'default' : (status === 'LOCKED' ? 'not-allowed' : 'pointer')
                                                    }}
                                                    onClick={() => {
                                                      if (isAptitude) return;
                                                      if (status === 'LOCKED') {
                                                        setShowPremiumModal(true);
                                                      } else {
                                                        openArticle(articleSlug, prob.name, prob.id, course.id);
                                                      }
                                                    }}
                                                  >
                                                    {prob.name}
                                                  </span>
                                                </div>
                                              </td>
                                              <td className="ph-col-diff">
                                                <span className={`ph-diff-tag ${prob.contentType === 'mcq' ? 'medium' : 'easy'}`}>
                                                  {prob.contentType === 'mcq' ? 'Concept' : 'Practice'}
                                                </span>
                                              </td>
                                              <td className="ph-col-score" style={{ textAlign: 'right', paddingRight: '12px' }}>
                                                <button
                                                  onClick={() => {
                                                    if (status === 'LOCKED') {
                                                      setShowPremiumModal(true);
                                                    } else {
                                                      navigate(`/student/practice/course/${course.id}/${prob.id}`);
                                                    }
                                                  }}
                                                  style={{
                                                    background: 'var(--ph-primary)',
                                                    border: '1px solid rgba(124,107,255,0.4)',
                                                    borderRadius: '6px',
                                                    color: 'white',
                                                    fontSize: '11px',
                                                    fontWeight: 'bold',
                                                    padding: '4px 12px',
                                                    cursor: status === 'LOCKED' ? 'not-allowed' : 'pointer',
                                                    opacity: status === 'LOCKED' ? 0.6 : 1
                                                  }}
                                                >
                                                  Solve
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // Calculate total and solved
              let totalQs = 0;
              let solvedQs = 0;

              const normCourseId = course.id ? course.id.replace(/-/g, '_') : '';
              const mappedCourseQids = courseQuestionIds[course.id] || courseQuestionIds[normCourseId] || [];

              if (course.id === 'programming_fundamentals') {
                totalQs = 348;
                solvedQs = solvedIds.filter(id => id.startsWith('Q0.')).length;
              } else if (course.hasSubcourses) {
                course.subcourses.forEach(sub => {
                  const normSubId = sub.id ? sub.id.replace(/-/g, '_') : '';
                  const qids = courseQuestionIds[sub.id] || courseQuestionIds[normSubId] || [];
                  totalQs += qids.length || (sub.modules ? sub.modules.length * 10 : 0);
                  solvedQs += qids.filter(id => solvedIdsSet.has(id)).length;
                });
              } else if (mappedCourseQids.length > 0) {
                totalQs = mappedCourseQids.length;
                solvedQs = mappedCourseQids.filter(id => solvedIdsSet.has(id)).length;
              } else {
                totalQs = (course.modules || []).length * 10;
              }

              const percentage = totalQs > 0 ? Math.round((solvedQs / totalQs) * 100) : 0;
              const dashOffset = 251.2 - (251.2 * (solvedQs / totalQs || 0));

              return (
                <div className="ps-sheet-detail" style={{ marginTop: '10px' }}>
                  {/* Breadcrumb Navigation (View 4) */}
                  <div className="course-breadcrumb-bar">
                      <button
                        onClick={() => setSelectedCourse(null)}
                        className="breadcrumb-back-btn"
                      >
                        <FaChevronLeft />
                      </button>
                      <span className="breadcrumb-parent" onClick={() => setSelectedCourse(null)}>Course Curriculum</span>
                      <span className="breadcrumb-sep">&gt;</span>
                      <span className="breadcrumb-current">{course.title}</span>
                    </div>

                    {/* Course Hero Emerald Banner Card (View 4) */}
                    <div className="course-detail-hero-card">
                      <div className="course-hero-left">
                        <div className="course-hero-badge-row">
                          <span className="course-hero-type-badge">Technical Course</span>
                          <span className="course-hero-stat-pill">{(course.modules || []).length} Modules</span>
                          <span className="course-hero-stat-pill">Beginner</span>
                          <span className="course-hero-stat-pill">{solvedQs}/{totalQs} Solved</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px' }}>
                          <div className="course-hero-icon-box">
                            <FaCode />
                          </div>
                          <div>
                            <h2 className="course-hero-title">{course.title}</h2>
                            <p className="course-hero-desc">
                              {course.id === 'programming_fundamentals'
                                ? 'Master core programming fundamentals: basic datatypes, operators, conditionals, loops, crunching, arrays, and strings.'
                                : course.id === 'learn_aptitude'
                                  ? 'Master Quantitative Aptitude, Logical Reasoning, and Verbal Ability with standard MCQ practice sets.'
                                  : `Learn and master problem solving, logic building, and algorithms for ${course.title}.`}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="course-hero-right-gauge">
                        <div className="circular-gauge-container">
                          <svg width="84" height="84" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                            <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.2)" strokeWidth="8" fill="transparent" />
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              stroke="#ffffff"
                              strokeWidth="8"
                              fill="transparent"
                              strokeDasharray={251.2}
                              strokeDashoffset={dashOffset}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                            />
                          </svg>
                          <div className="circular-gauge-text">
                            <span className="gauge-pct">{percentage}%</span>
                            <span className="gauge-lbl">Progress</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sub-tabs Row (View 4) */}
                    <div className="course-subtabs-row">
                      <button className="course-subtab-btn active">Modules</button>
                      <button className="course-subtab-btn">About</button>
                      <button className="course-subtab-btn">Resources</button>
                    </div>

                  <div style={{ padding: '0px' }}>
                    {course.id === 'programming_fundamentals' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {course.modules.map((mod, modIdx) => {
                          const accordionKey = `paths-${course.id}-${mod.id}`;
                          const isOpen = !!expandedTopics[accordionKey];
                          const qList = pathModuleQuestions[mod.id] || [];
                          const solvedSecCount = qList.filter(p => solvedIds.includes(p.id)).length;
                          const pct = qList.length > 0 ? Math.round((solvedSecCount / qList.length) * 100) : 0;

                          const handleToggleStep = async () => {
                            const nextOpen = !isOpen;
                            setExpandedTopics(prev => ({ ...prev, [accordionKey]: nextOpen }));
                            if (nextOpen && !pathModuleQuestions[mod.id]) {
                              try {
                                let items = [];
                                if (mod.id.startsWith('FPS')) {
                                  // Map Q0.1 to Q0.348 questions dynamically based on name and index ranges
                                  const q0Qs = questions.filter(item => item.questionId && item.questionId.startsWith('Q0.'));
                                  q0Qs.sort((a, b) => {
                                    const aNum = parseInt(a.questionId.replace('Q0.', ''), 10) || 0;
                                    const bNum = parseInt(b.questionId.replace('Q0.', ''), 10) || 0;
                                    return aNum - bNum;
                                  });

                                  const matchedQs = q0Qs.filter(item => {
                                    const qid = item.questionId;
                                    const qidNum = parseInt(qid.replace('Q0.', ''), 10) || 0;
                                    const lowerT = (item.title ?? '').toLowerCase();

                                    let targetMod = '';
                                    if (lowerT.includes('datatype') || qidNum <= 31) {
                                      targetMod = 'FPS001'; // Basic Datatypes
                                    } else if (lowerT.includes('conditional') || lowerT.includes('switch') || (qidNum >= 32 && qidNum <= 51)) {
                                      targetMod = 'FPS002'; // Conditionals
                                    } else if (lowerT.includes('looping') || lowerT.includes('pattern') || (qidNum >= 52 && qidNum <= 71) || (qidNum >= 72 && qidNum <= 142) || (qidNum >= 153 && qidNum <= 161)) {
                                      targetMod = 'FPS003'; // Looping & Patterns
                                    } else if (lowerT.includes('crunching') || (qidNum >= 162 && qidNum <= 191)) {
                                      targetMod = 'FPS004'; // Number Crunching
                                    } else if (lowerT.includes('number_based') || lowerT.includes('number-based') || lowerT.includes('number_problem') || lowerT.includes('math') || (qidNum >= 192 && qidNum <= 211)) {
                                      targetMod = 'FPS005'; // Number Based Problems
                                    } else if (lowerT.includes('array') || lowerT.includes('list') || lowerT.includes('tree') || lowerT.includes('node') || lowerT.includes('element') || (qidNum >= 143 && qidNum <= 152) || (qidNum >= 212 && qidNum <= 251) || [340, 341, 342, 343, 344, 345, 346, 348].includes(qidNum)) {
                                      targetMod = 'FPS006'; // Arrays
                                    } else {
                                      targetMod = 'FPS007'; // Strings / Misc
                                    }

                                    return targetMod === mod.id;
                                  });

                                  items = matchedQs.map(item => ({
                                    ...item,
                                    id: item.questionId,
                                    isPremium: false
                                  }));
                                } else {
                                  // Standard course module load from URL
                                  const url = mod.url.startsWith('/') ? mod.url : `/${mod.url}`;
                                  const modRes = await fetch(url);
                                  if (modRes.ok) {
                                    const modConf = await modRes.json();
                                    if (modConf.questions) {
                                      items = modConf.questions;
                                    } else if (modConf.questionIds) {
                                      items = modConf.questionIds.map(qid => {
                                        const indexMatch = questions.find(item => item.questionId === qid);
                                        const baseMatch = indexMatch || { id: qid, title: qid, difficulty: 'Easy', isPremium: false };
                                        return {
                                          ...baseMatch,
                                          id: qid,
                                          isPremium: qid.startsWith('Q0.') ? false : (baseMatch.isPremium || false)
                                        };
                                      });
                                    }
                                  }
                                }

                                const enrichedItems = items.map(p => {
                                  const qid = p.id || (p.questionId  ?? '');
                                  const lowerQ = String(qid).toLowerCase();
                                  const lowerMod = String(mod.id).toLowerCase();

                                  let article = getCorrectArticleForProblem(course.id, p);


                                  let youtube = p.youtube || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

                                  return {
                                    ...p,
                                    article,
                                    youtube
                                  };
                                });

                                setPathModuleQuestions(prev => ({ ...prev, [mod.id]: enrichedItems }));
                              } catch (e) {
                                console.error("Failed to load path module questions:", e);
                              }
                            }
                          };

                          return (
                            <div
                              key={mod.id}
                              style={{
                                background: 'var(--ph-surface)',
                                border: '1px solid var(--ph-border)',
                                borderRadius: '12px',
                                overflow: 'hidden'
                              }}
                            >
                              <div
                                onClick={handleToggleStep}
                                style={{
                                  padding: '12px 18px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  cursor: 'pointer',
                                  background: 'rgba(255,255,255,0.01)',
                                  borderBottom: isOpen ? '1px solid var(--ph-border)' : 'none'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <span style={{ fontSize: '16px', color: '#7c6bff' }}>
                                    {isOpen ? <FaFolderOpen /> : <FaFolder />}
                                  </span>
                                  <strong style={{ fontSize: '14px', color: 'var(--ph-text)' }}>
                                    Step {modIdx + 1}: {mod.name}
                                  </strong>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '80px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ width: `${pct}%`, height: '100%', background: '#7c6bff', borderRadius: '3px' }} />
                                    </div>
                                    <span style={{ fontSize: '12px', color: 'var(--ph-text-dim)', minWidth: '45px', textAlign: 'right' }}>
                                      {solvedSecCount}/{qList.length || 0}
                                    </span>
                                  </div>
                                  <span style={{ color: 'var(--ph-text-dim)' }}>
                                    {isOpen ? <FaAngleDown /> : <FaAngleRight />}
                                  </span>
                                </div>
                              </div>

                              {isOpen && (
                                <div style={{ padding: '0px' }}>
                                  {!pathModuleQuestions[mod.id] ? (
                                    <div style={{ padding: '16px', color: 'var(--ph-text-dim)', textAlign: 'center' }}>
                                      Loading questions...
                                    </div>
                                  ) : qList.length === 0 ? (
                                    <div style={{ padding: '16px', color: 'var(--ph-text-dim)', textAlign: 'center' }}>
                                      No questions in this module.
                                    </div>
                                  ) : (
                                    <table className="ph-problems-table" style={{ margin: 0, border: 'none', background: 'transparent' }}>
                                      <thead>
                                        <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                                          <th className="ph-col-status" style={{ width: '40px', paddingLeft: '20px' }}>Status</th>
                                          <th className="ph-col-num" style={{ width: '50px' }}>#</th>
                                          <th className="ph-col-title">Question</th>
                                          <th className="ph-col-diff" style={{ width: '100px' }}>Difficulty</th>
                                          <th className="ph-col-score" style={{ width: '160px', textAlign: 'right', paddingRight: '20px' }}>Action</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {qList.map((p, pIdx) => {
                                          const isSolved = solvedIdsSet.has(p.id);
                                          const isPremiumQ = p.isPremium;
                                          const status = getQuestionDisplayStatus(p.id, solvedIds, problemDetails, isPremiumQ, isPremiumUser, attemptedIds);
                                          const diffClass = p.difficulty?.toLowerCase() || 'easy';

                                          return (
                                            <tr
                                              key={p.id || pIdx}
                                              className={`ph-problem-row ${isSolved ? 'solved' : ''}`}
                                              style={{ background: 'rgba(255,255,255,0.005)' }}
                                            >
                                              <td
                                                className="ph-col-status"
                                                style={{ paddingLeft: '20px', fontSize: '14px', cursor: 'pointer' }}
                                              >
                                                <span className="ph-status-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                  {isSolved ? (
                                                    <FaCheckCircle style={{ color: 'var(--ph-success)' }} />
                                                  ) : status === 'LOCKED' ? (
                                                    <FaLock style={{ color: 'var(--ph-text-dim)', fontSize: '11px' }} />
                                                  ) : (
                                                    <span style={{
                                                      width: '14px',
                                                      height: '14px',
                                                      borderRadius: '50%',
                                                      border: '2px solid var(--ph-text-dim)',
                                                      display: 'inline-block',
                                                      opacity: 0.6
                                                    }} />
                                                  )}
                                                </span>
                                              </td>
                                              <td className="ph-col-num" style={{ color: 'var(--ph-text-dim)' }}>{pIdx + 1}</td>
                                              <td className="ph-col-title">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                  <span
                                                    className="ph-problem-title-text"
                                                    style={{
                                                      fontWeight: '500',
                                                      cursor: (p.contentType === 'mcq' && p.article) ? 'pointer' : 'default',
                                                      color: 'var(--ph-text)'
                                                    }}
                                                    onClick={() => {
                                                      if (p.contentType === 'mcq' && p.article && course.id === 'learn_aptitude') {
                                                        openArticle(p.article, p.title || p.name, p.id, course.id);
                                                      }
                                                    }}
                                                  >
                                                    {p.title || p.name}
                                                  </span>
                                                  {isPremiumQ && <FaStar style={{ color: '#fbbf24', marginLeft: '4px', fontSize: '11px' }} />}
                                                  {p.article && p.contentType === 'mcq' && course.id === 'learn_aptitude' && (
                                                    <button
                                                      onClick={() => openArticle(p.article, p.title || p.name, p.id, course.id)}
                                                      style={{
                                                        background: 'rgba(124,107,255,0.12)',
                                                        border: '1px solid rgba(124,107,255,0.3)',
                                                        color: 'var(--ph-primary)',
                                                        cursor: 'pointer',
                                                        padding: '2px 8px',
                                                        fontSize: '11px',
                                                        borderRadius: '4px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontWeight: '600'
                                                      }}
                                                      title="Read Theory"
                                                      className="ph-article-btn"
                                                    >
                                                      <FaBookOpen style={{ fontSize: '10px' }} /> Theory
                                                    </button>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="ph-col-diff">
                                                <span className={`ph-diff-tag ${diffClass}`}>{p.difficulty ?? ''}</span>
                                              </td>
                                              <td className="ph-col-score" style={{ textAlign: 'right', paddingRight: '20px' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                  <button
                                                    onClick={() => {
                                                      if (status === 'LOCKED') {
                                                        setShowPremiumModal(true);
                                                      } else {
                                                        navigate(`/student/practice/course/${course.id}/${p.id}`);
                                                      }
                                                    }}
                                                    style={{
                                                      background: 'var(--ph-primary)',
                                                      border: '1px solid rgba(124,107,255,0.4)',
                                                      borderRadius: '6px',
                                                      color: 'white',
                                                      fontSize: '11px',
                                                      fontWeight: 'bold',
                                                      padding: '4px 12px',
                                                      cursor: status === 'LOCKED' ? 'not-allowed' : 'pointer',
                                                      transition: 'all 0.2s'
                                                    }}
                                                  >
                                                    {course.id === 'learn_aptitude'
                                                      ? (p.contentType === 'practice_test' ? 'Take Test' : 'Study')
                                                      : 'Solve'}
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : course.hasSubcourses ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {course.subcourses.map(sub => (
                          <div key={sub.id} style={{ borderLeft: '2px solid rgba(124,107,255,0.3)', paddingLeft: '14px' }}>
                            <div
                              onClick={() => toggleSubcourseExpand(sub.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                cursor: 'pointer', padding: '6px 0', color: 'var(--ph-text)', fontWeight: 600
                              }}
                            >
                              {expandedSubcourses[sub.id] ? <FaAngleDown /> : <FaAngleRight />}
                              <span>{sub.title}</span>
                            </div>

                            {expandedSubcourses[sub.id] && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                {sub.modules.map(mod => (
                                  <div
                                    key={mod.id}
                                    onClick={() => handleModuleClick(mod)}
                                    style={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                      padding: '12px 16px', background: 'var(--ph-card)', borderRadius: '8px',
                                      cursor: 'pointer', transition: '0.2s', border: '1px solid var(--ph-border)'
                                    }}
                                    className="q-list-row-hover"
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <FaFileAlt style={{ color: mod.type === 'mcq' ? '#ff6b9d' : '#7c6bff' }} />
                                      <span style={{ fontSize: '14px', color: 'var(--ph-text)' }}>{mod.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <Chip label={mod.type.toUpperCase()} size="small" style={{ fontSize: '10px' }} />
                                      {mod.isPremium && <FaStar style={{ color: '#fbbf24', fontSize: '12px' }} />}
                                      <span style={{ color: '#94a3b8' }}>›</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {course.modules.map(mod => (
                          <div
                            key={mod.id}
                            onClick={() => handleModuleClick(mod)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '12px 16px', background: 'var(--ph-card)', borderRadius: '8px',
                              cursor: 'pointer', transition: '0.2s', border: '1px solid var(--ph-border)'
                            }}
                            className="q-list-row-hover"
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <FaFileAlt style={{ color: mod.type === 'mcq' ? '#ff6b9d' : '#7c6bff' }} />
                              <span style={{ fontSize: '14px', color: 'var(--ph-text)' }}>{mod.name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Chip label={mod.type.toUpperCase()} size="small" style={{ fontSize: '10px' }} />
                              {mod.isPremium && <FaStar style={{ color: '#fbbf24', fontSize: '12px' }} />}
                              <span style={{ color: '#94a3b8' }}>›</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            // ─── TILE GRID FOR COURSES OR ROADMAPS ───
            <div>
              {/* Sub-tab Toggle Header */}
              <div style={{
                display: 'flex',
                gap: '12px',
                borderBottom: '1px solid var(--ph-border)',
                paddingBottom: '16px',
                marginBottom: '28px'
              }}>
                <button
                  onClick={() => setCurriculumSubTab('technical')}
                  style={{
                    background: curriculumSubTab === 'technical' ? 'var(--ph-primary-light)' : 'transparent',
                    border: '1px solid ' + (curriculumSubTab === 'technical' ? 'var(--ph-primary)' : 'var(--ph-border)'),
                    color: curriculumSubTab === 'technical' ? 'var(--ph-primary)' : 'var(--ph-text)',
                    padding: '8px 18px',
                    borderRadius: '20px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  Technical Courses
                </button>
                <button
                  onClick={() => setCurriculumSubTab('aptitude')}
                  style={{
                    background: curriculumSubTab === 'aptitude' ? 'var(--ph-primary-light)' : 'transparent',
                    border: '1px solid ' + (curriculumSubTab === 'aptitude' ? 'var(--ph-primary)' : 'var(--ph-border)'),
                    color: curriculumSubTab === 'aptitude' ? 'var(--ph-primary)' : 'var(--ph-text)',
                    padding: '8px 18px',
                    borderRadius: '20px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  Aptitude Courses
                </button>
                <button
                  onClick={() => setCurriculumSubTab('roadmaps')}
                  style={{
                    background: curriculumSubTab === 'roadmaps' ? 'var(--ph-primary-light)' : 'transparent',
                    border: '1px solid ' + (curriculumSubTab === 'roadmaps' ? 'var(--ph-primary)' : 'var(--ph-border)'),
                    color: curriculumSubTab === 'roadmaps' ? 'var(--ph-primary)' : 'var(--ph-text)',
                    padding: '8px 18px',
                    borderRadius: '20px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  Career Roadmaps
                </button>
              </div>

              {(curriculumSubTab === 'technical' || curriculumSubTab === 'aptitude') ? (
                <div className="ps-categories-container">
                  <div className="ph-problems-filterbar" style={{ marginBottom: '24px', display: 'flex', gap: '16px' }}>
                    <div className="ph-problems-search-wrap" style={{ flex: 1 }}>
                      <FaSearch className="ph-problems-search-icon" />
                      <input
                        type="text"
                        placeholder="Search courses..."
                        value={courseSearch}
                        onChange={e => setCourseSearch(e.target.value)}
                        className="ph-problems-search"
                      />
                    </div>
                    <select
                      value={courseFilter}
                      onChange={e => setCourseFilter(e.target.value)}
                      className="ph-problems-select"
                      style={{ minWidth: '160px' }}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Not Started">Not Started</option>
                      <option value="In-Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>

                  <div className="ps-cards-grid">
                    {(() => {
                      const filtered = courses
                        .filter(c => curriculumSubTab === 'aptitude' ? c.id === 'learn_aptitude' : c.id !== 'learn_aptitude')
                        .filter(c => {
                          if (courseSearch && !c.title.toLowerCase().includes(courseSearch.toLowerCase())) {
                            return false;
                          }
                          if (courseFilter === 'All') return true;
                          let totalQs = 0;
                          let solvedQs = 0;
                          const normId = c.id.replace(/-/g, '_');
                          const mappedQids = courseQuestionIds[c.id] || courseQuestionIds[normId] || [];

                          if (c.id === 'programming_fundamentals') {
                            totalQs = 348;
                            solvedQs = solvedIds.filter(id => id.startsWith('Q0.')).length;
                          } else if (c.id === 'learn_c') {
                            totalQs = cQuestionIds.length || 609;
                            solvedQs = solvedIds.filter(id => cQuestionIdsSet.has(id)).length;
                          } else if (c.id === 'learn_cpp') {
                            totalQs = cppQuestionIds.length || 825;
                            solvedQs = solvedIds.filter(id => cppQuestionIdsSet.has(id)).length;
                          } else if (c.id === 'learn_dsa') {
                            totalQs = dsaQuestionIds.length || 926;
                            solvedQs = solvedIds.filter(id => dsaQuestionIdsSet.has(id)).length;
                          } else if (c.id === 'learn_java') {
                            totalQs = javaQuestionIds.length || 883;
                            solvedQs = solvedIds.filter(id => javaQuestionIdsSet.has(id)).length;
                          } else if (c.id === 'learn_aptitude') {
                            totalQs = 119;
                            solvedQs = solvedIds.filter(id => id.startsWith('Q_apt_')).length;
                          } else if (mappedQids.length > 0) {
                            totalQs = mappedQids.length;
                            solvedQs = mappedQids.filter(id => solvedIdsSet.has(id)).length;
                          } else {
                            totalQs = (c.modules || []).length * 10;
                            solvedQs = 0;
                          }

                          if (courseFilter === 'Completed') return totalQs > 0 && solvedQs === totalQs;
                          if (courseFilter === 'In-Progress') return solvedQs > 0 && solvedQs < totalQs;
                          if (courseFilter === 'Not Started') return solvedQs === 0;
                          return true;
                        });

                      if (filtered.length === 0) {
                        return (
                          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--ph-text-dim)' }}>
                            <p style={{ margin: 0, fontSize: '15px' }}>No courses found matching your query or status filter.</p>
                          </div>
                        );
                      }

                      return filtered.map(course => {
                        let totalQs = 0;
                        let solvedQs = 0;
                        const normId = course.id.replace(/-/g, '_');
                        const mappedQids = courseQuestionIds[course.id] || courseQuestionIds[normId] || [];

                        if (course.id === 'programming_fundamentals') {
                          totalQs = 348;
                          solvedQs = solvedIds.filter(id => id.startsWith('Q0.')).length;
                        } else if (course.id === 'learn_c') {
                          totalQs = cQuestionIds.length || 609;
                          solvedQs = solvedIds.filter(id => cQuestionIdsSet.has(id)).length;
                        } else if (course.id === 'learn_cpp') {
                          totalQs = cppQuestionIds.length || 825;
                          solvedQs = solvedIds.filter(id => cppQuestionIdsSet.has(id)).length;
                        } else if (course.id === 'learn_dsa') {
                          totalQs = dsaQuestionIds.length || 926;
                          solvedQs = solvedIds.filter(id => dsaQuestionIdsSet.has(id)).length;
                        } else if (course.id === 'learn_java') {
                          totalQs = javaQuestionIds.length || 883;
                          solvedQs = solvedIds.filter(id => javaQuestionIdsSet.has(id)).length;
                        } else if (course.id === 'learn_aptitude') {
                          totalQs = 119;
                          solvedQs = solvedIds.filter(id => id.startsWith('Q_apt_')).length;
                        } else if (mappedQids.length > 0) {
                          totalQs = mappedQids.length;
                          solvedQs = mappedQids.filter(id => solvedIdsSet.has(id)).length;
                        } else {
                          totalQs = (course.modules || []).length * 10;
                          solvedQs = 0;
                        }

                        const style = {
                          '--theme-border-color': 'var(--ph-primary)',
                          '--theme-border-color-15': 'var(--ph-primary-light)',
                          '--theme-border-color-25': 'var(--ph-primary-light)',
                          '--theme-border-color-30': 'var(--ph-primary-light)',
                          '--theme-border-color-50': 'var(--ph-primary-light)'
                        };

                        const isCompleted = totalQs > 0 && solvedQs === totalQs;
                        const moduleCount = mappedQids.length > 0 ? Math.ceil(mappedQids.length / 10) : (course.modules?.length || 1);

                        return (
                          <div
                            key={course.id}
                            className="ps-sheet-card"
                            style={{
                              ...style,
                              border: isCompleted ? '1px solid rgba(74,222,128,0.3)' : '1px solid var(--ph-border)',
                              boxShadow: isCompleted ? '0 4px 20px rgba(74,222,128,0.08)' : 'none'
                            }}
                          >
                            <div>
                              <h3 className="ps-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{course.title}</span>
                                {isCompleted && (
                                  <span style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontSize: '10px', padding: '3px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                    Mastered
                                  </span>
                                )}
                              </h3>
                              <p className="ps-card-desc">
                                {course.id === 'programming_fundamentals'
                                  ? 'Master core programming fundamentals: basic datatypes, operators, conditionals, loops, crunching, arrays, and strings.'
                                  : course.id === 'learn_aptitude'
                                    ? 'Master Quantitative Aptitude, Logical Reasoning, and Verbal Ability with standard MCQ practice sets.'
                                    : `Learn and master problem solving, logic building, and algorithms for ${course.title}.`}
                              </p>
                            </div>

                            <div className="ps-card-footer">
                              <span className="ps-card-stats">
                                {solvedQs}/{totalQs} Solved • {moduleCount} {moduleCount === 1 ? 'Module' : 'Modules'}
                              </span>

                              <div className="ps-card-actions">
                                <button
                                  onClick={() => setSelectedCourse(course.id)}
                                  className="ps-action-btn primary"
                                  style={{ padding: '6px 16px' }}
                                >
                                  Start Learning
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : (
                // ─── SEED-IT CAREER ROADMAPS VIEW ───
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {roadmapsData.map((roadmap, idx) => {
                    const styleInfo = getRoadmapStyle(roadmap.slug);
                    return (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--ph-surface)',
                          border: `1px solid rgba(255,255,255,0.06)`,
                          borderLeft: `4px solid ${styleInfo.color}`,
                          borderRadius: '16px',
                          padding: '24px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px',
                          transition: '0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '28px' }}>{styleInfo.icon}</span>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: 'var(--ph-text)' }}>{roadmap.title}</h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--ph-text-dim)', lineHeight: '1.5' }}>{roadmap.desc}</p>
                          </div>
                        </div>

                        {/* Course Tracker step list */}
                        {roadmap.steps && roadmap.steps.length > 0 && (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            background: 'rgba(0,0,0,0.15)',
                            padding: '20px',
                            borderRadius: '12px',
                            marginTop: '8px'
                          }}>
                            {roadmap.steps.map((step, sIdx) => {
                              const target = step.target;
                              const qids = courseQuestionIds[target] || [];
                              const total = qids.length;
                              const solved = qids.filter(id => solvedIdsSet.has(id)).length;
                              const percent = total > 0 ? Math.round((solved / total) * 100) : 0;

                              let statusText = 'Not Started';
                              let statusColor = '#94a3b8';
                              let actionText = 'Start Course';

                              if (percent === 100) {
                                statusText = 'Completed';
                                statusColor = '#10b981';
                                actionText = 'Review Course';
                              } else if (percent > 0) {
                                statusText = 'In Progress';
                                statusColor = '#3b82f6';
                                actionText = 'Continue';
                              }

                              return (
                                <div
                                  key={sIdx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '16px',
                                    padding: '12px 16px',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.04)',
                                    borderRadius: '8px',
                                    flexWrap: 'wrap'
                                  }}
                                >
                                  {/* Left: Step number & Course Name */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 300px' }}>
                                    <span style={{
                                      width: '28px',
                                      height: '28px',
                                      borderRadius: '50%',
                                      background: 'rgba(124,107,255,0.15)',
                                      color: '#7c6bff',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontWeight: 'bold',
                                      fontSize: '13px'
                                    }}>
                                      {sIdx + 1}
                                    </span>
                                    <div>
                                      <div style={{ fontWeight: '600', color: 'var(--ph-text)', fontSize: '14px' }}>
                                        {step.label}
                                      </div>
                                      <div style={{ fontSize: '12px', color: 'var(--ph-text-dim)', marginTop: '2px' }}>
                                        {total > 0 ? `${solved}/${total} Problems Solved` : 'Conceptual Syllabus'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Middle: Progress Bar */}
                                  {total > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 200px', maxWidth: '300px' }}>
                                      <div style={{
                                        flex: 1,
                                        height: '6px',
                                        background: 'rgba(255,255,255,0.08)',
                                        borderRadius: '3px',
                                        overflow: 'hidden'
                                      }}>
                                        <div style={{
                                          width: `${percent}%`,
                                          height: '100%',
                                          background: statusColor,
                                          borderRadius: '3px',
                                          transition: 'width 0.4s'
                                        }} />
                                      </div>
                                      <span style={{ fontSize: '12px', color: 'var(--ph-text-dim)', minWidth: '36px', textAlign: 'right' }}>
                                        {percent}%
                                      </span>
                                    </div>
                                  )}

                                  {/* Right: Status Tag and Launch Button */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                                    <span style={{
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      textTransform: 'uppercase',
                                      color: statusColor,
                                      background: `rgba(${statusColor === '#10b981' ? '16,185,129' : statusColor === '#3b82f6' ? '59,130,246' : '148,163,184'}, 0.1)`,
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      {percent === 100 ? <FaCheckCircle /> : <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }} />}
                                      {statusText}
                                    </span>

                                    <button
                                      onClick={() => {
                                        const courseExists = courses.some(c => c.id === step.target);
                                        if (courseExists) {
                                          setSelectedCourse(step.target);
                                        } else {
                                          const matchedCourse = courses.find(c =>
                                            c.id.toLowerCase() === step.target.toLowerCase() ||
                                            c.title.toLowerCase().includes(step.label.toLowerCase())
                                          );
                                          if (matchedCourse) {
                                            setSelectedCourse(matchedCourse.id);
                                          } else {
                                            toast.warning(`Course "${step.label}" is not currently enrolled.`);
                                          }
                                        }
                                      }}
                                      style={{
                                        background: actionText === 'Review Course' ? 'transparent' : 'var(--ph-primary)',
                                        border: actionText === 'Review Course' ? '1px solid var(--ph-border)' : 'none',
                                        color: actionText === 'Review Course' ? 'var(--ph-text)' : 'white',
                                        borderRadius: '6px',
                                        padding: '8px 14px',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: actionText === 'Review Course' ? 'none' : '0 2px 4px rgba(21,128,61,0.2)'
                                      }}
                                      className="ph-topbar-btn"
                                    >
                                      {actionText}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        // ─── FLAT PROBLEMS TABLE VIEW (LeetCode-style) ───
        <div className="ph-problems-layout">

          {/* Left Content Area */}
          <div className="ph-problems-main">

            {/* Header Title & Subtitle */}
            <div className="qb-header" style={{ marginBottom: '20px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--ph-text)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>Question Bank</h1>
              <p style={{ fontSize: '13.5px', color: 'var(--ph-text-dim)', margin: 0 }}>Explore and practice from our comprehensive question collection.</p>
            </div>

            {/* Summary Metrics Banner Bar (View 2) - 4 Cards matching design */}
            <div className="practice-summary-metrics-bar">
              <div className="practice-metric-item">
                <div className="metric-icon-box green">
                  <FaBookOpen />
                </div>
                <div className="metric-info-col">
                  <span className="metric-val">{questions.length || 9328}</span>
                  <span className="metric-lbl">Total Questions</span>
                </div>
              </div>

              <div className="practice-metric-item">
                <div className="metric-icon-box blue">
                  <FaThLarge />
                </div>
                <div className="metric-info-col">
                  <span className="metric-val">{CATEGORIES.length}</span>
                  <span className="metric-lbl">Categories</span>
                </div>
              </div>

              <div className="practice-metric-item">
                <div className="metric-icon-box purple">
                  <FaCheckSquare />
                </div>
                <div className="metric-info-col">
                  <span className="metric-val">{solvedIds.length}</span>
                  <span className="metric-lbl">Problems Solved</span>
                </div>
              </div>

              <div className="practice-metric-item">
                <div className="metric-icon-box orange">
                  <FaChartLine />
                </div>
                <div className="metric-info-col">
                  <span className="metric-val">{questions.length > 0 ? Math.round((solvedIds.length / questions.length) * 100) : 0}%</span>
                  <span className="metric-lbl">Success Rate</span>
                </div>
              </div>
            </div>

            {/* Topic Filter Chips */}
            <div className="ph-topic-chips">
              <button
                className={`ph-topic-chip ${selectedCategory === 'All' ? 'active' : ''}`}
                onClick={() => { setSelectedCategory('All'); setCurrentPage(1); }}
              >
                All Topics
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  className={`ph-topic-chip ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => { setSelectedCategory(cat); setCurrentPage(1); }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Filter Bar */}
            <div id="practice-problems-table-section" className="ph-problems-filterbar">
              {/* Search Box */}
              <div className="ph-problems-search-wrap">
                <FaSearch className="ph-problems-search-icon" />
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="ph-problems-search"
                />
              </div>

              {/* Difficulty Filter */}
              <select
                value={selectedDifficulty}
                onChange={e => { setSelectedDifficulty(e.target.value); setCurrentPage(1); }}
                className="ph-problems-select"
              >
                <option value="All">Difficulty: All</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={e => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                className="ph-problems-select"
              >
                <option value="All">Status: All</option>
                <option value="SOLVED">Solved ({solvedIds.length})</option>
                <option value="ATTEMPTED">Attempted ({attemptedIds.length})</option>
                <option value="UNSOLVED">Todo</option>
              </select>

              {/* Count */}
              <span className="ph-problems-count">
                {filteredQuestions.length} / {questions.length} (Solved: {solvedIds.length}, Attempted: {attemptedIds.length})
              </span>

              {(searchQuery || selectedCategory !== 'All' || selectedDifficulty !== 'All' || selectedStatus !== 'All') && (
                <button
                  className="ph-reset-filter-btn"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                    setSelectedDifficulty('All');
                    setSelectedStatus('All');
                    setCurrentPage(1);
                  }}
                >
                  <FaSyncAlt /> Reset Filters
                </button>
              )}
            </div>

            {/* Problems Table */}
            {loading ? (
              <div className="ph-loading">
                <div className="ph-spinner" />
                <p>Loading problems...</p>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="ph-empty">
                <div className="ph-empty-icon"><FaFileAlt /></div>
                <div className="ph-empty-title">No problems match filters</div>
              </div>
            ) : (
              <>
                <table className="ph-problems-table">
                  <thead>
                    <tr>
                      <th className="ph-col-num">#</th>
                      <th className="ph-col-title">TITLE</th>
                      <th className="ph-col-category">CATEGORY</th>
                      <th className="ph-col-diff">DIFFICULTY</th>
                      <th className="ph-col-solvedby">SOLVED BY</th>
                      <th className="ph-col-score">SCORE</th>
                      <th className="ph-col-actions">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedQuestions.map((q, idx) => {
                      const status = getQuestionDisplayStatus(q.questionId, solvedIds, problemDetails, q.isPremium, isPremiumUser, attemptedIds);
                      const bestScore = problemDetails[q.questionId]?.bestScore;

                      const diffClass = q.difficulty === 'Hard' ? 'hard'
                        : q.difficulty === 'Medium' ? 'medium'
                          : q.difficulty === 'Beginner' ? 'beginner'
                            : 'easy';

                      const itemIndex = (currentPage - 1) * pageSize + idx + 1;

                      return (
                        <tr
                          key={q.questionId ? `${q.questionId}-${idx}` : `q-${idx}`}
                          className={`ph-problem-row ${status === 'LOCKED' ? 'locked' : ''}`}
                          onClick={() => handleQuestionClick(q, status)}
                        >
                          <td className="ph-col-num">{itemIndex}</td>
                          <td className="ph-col-title">
                            <span className="ph-problem-title-text">
                              {q.questionId ? `${q.questionId} – ` : ''}{q.title}
                            </span>
                            {q.isPremium && <FaStar style={{ color: '#fbbf24', marginLeft: '6px', fontSize: '11px' }} />}
                          </td>
                          <td className="ph-col-category">
                            <span className="ph-cat-tag">{q.category ?? ''}</span>
                          </td>
                          <td className="ph-col-diff">
                            <span className={`ph-diff-tag ${diffClass}`}>{q.difficulty ?? ''}</span>
                          </td>
                          <td className="ph-col-solvedby">
                            <span style={{ color: 'var(--ph-text-dim)' }}>—</span>
                          </td>
                          <td className="ph-col-score">
                            {bestScore !== undefined ? (
                              <span className={`ph-score-tag ${bestScore === 100 ? 'perfect' : 'partial'}`}>
                                {bestScore}%
                              </span>
                            ) : (
                              <span style={{ color: 'var(--ph-text-dim)' }}>—</span>
                            )}
                          </td>
                          <td className="ph-col-actions" onClick={e => e.stopPropagation()}>
                            <button
                              className="ph-action-eye-btn"
                              title="Solve Problem"
                              onClick={() => handleQuestionClick(q, status)}
                            >
                              <FaEye />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination matching design */}
                <div className="ph-pagination-bar">
                  <div className="ph-pagination-info">
                    Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, filteredQuestions.length)}</strong> of <strong>{filteredQuestions.length}</strong> questions
                  </div>
                  
                  <div className="ph-pagination-btns">
                    <button
                      className="ph-pagination-btn"
                      disabled={currentPage === 1}
                      onClick={() => {
                        setCurrentPage(prev => Math.max(prev - 1, 1));
                        window.scrollTo({ top: 200, behavior: 'smooth' });
                      }}
                    >
                      <FaChevronLeft />
                    </button>
                    
                    {/* Render page numbers */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) pageNum = i + 1;
                      else if (currentPage <= 3) pageNum = i + 1;
                      else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                      else pageNum = currentPage - 2 + i;
                      
                      return (
                        <button
                          key={pageNum}
                          className={`ph-page-number-btn ${currentPage === pageNum ? 'active' : ''}`}
                          onClick={() => {
                            setCurrentPage(pageNum);
                            window.scrollTo({ top: 200, behavior: 'smooth' });
                          }}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    {totalPages > 5 && currentPage < totalPages - 2 && (
                      <>
                        <span className="ph-page-ellipsis">...</span>
                        <button
                          className="ph-page-number-btn"
                          onClick={() => {
                            setCurrentPage(totalPages);
                            window.scrollTo({ top: 200, behavior: 'smooth' });
                          }}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}

                    <button
                      className="ph-pagination-btn"
                      disabled={currentPage >= totalPages}
                      onClick={() => {
                        setCurrentPage(prev => Math.min(prev + 1, totalPages));
                        window.scrollTo({ top: 200, behavior: 'smooth' });
                      }}
                    >
                      <FaChevronRight />
                    </button>
                  </div>

                  <div className="ph-page-size-selector">
                    <span>Rows per page</span>
                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="ph-page-size-select"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Sidebar Stats */}
          <div className="ph-problems-sidebar">
            {/* Solved Progress Widget with SVG Circular Gauge */}
            <div className="ph-stat-card">
              <div className="ph-stat-title">MY PROGRESS</div>
              
              <div className="ph-progress-gauge-box">
                <div className="circular-gauge-container small" style={{ margin: '10px auto' }}>
                  <svg className="circular-gauge-svg" viewBox="0 0 100 100" width="120" height="120">
                    <circle className="gauge-bg-circle" cx="50" cy="50" r="42" strokeWidth="8" fill="none" />
                    <circle
                      className="gauge-bar-circle"
                      cx="50"
                      cy="50"
                      r="42"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray="263.89"
                      strokeDashoffset={263.89 - (263.89 * (questions.length > 0 ? solvedIds.length / questions.length : 0))}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="circular-gauge-text">
                    <span className="ph-stat-solved" style={{ fontSize: '26px', fontWeight: '800' }}>{solvedIds.filter(id => questionBankIdsSet.has(id)).length}</span>
                    <span className="ph-stat-total" style={{ fontSize: '13px', color: 'var(--ph-text-dim)' }}>/{questions.length}</span>
                    <span className="gauge-lbl" style={{ fontSize: '11px', marginTop: '2px' }}>Solved</span>
                  </div>
                </div>
              </div>

              <div className="ph-stat-diff-list" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {DIFFICULTIES.map(d => {
                  const total = questions.filter(q => q.difficulty === d).length;
                  const solved = questions.filter(q => q.difficulty === d && solvedIdsSet.has(q.questionId)).length;
                  const cls = d === 'Hard' ? 'hard' : d === 'Medium' ? 'medium' : d === 'Beginner' ? 'beginner' : 'easy';
                  return (
                    <div key={d} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '4px 0' }}>
                      <span className={`ph-diff-text ${cls}`} style={{ fontWeight: '700' }}>{d}</span>
                      <span style={{ color: 'var(--ph-text-dim)', fontWeight: '600' }}>{solved}/{total}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Category Links */}
            <div className="ph-stat-card" style={{ marginTop: '16px' }}>
              <div className="ph-stat-title">CATEGORIES</div>
              <div className="ph-sidebar-cats">
                {(showAllCategories ? CATEGORIES : CATEGORIES.slice(0, 14)).map(cat => {
                  const count = questions.filter(q => (q.category ?? '').toLowerCase() === cat.toLowerCase()).length;
                  return (
                    <div
                      key={cat}
                      className={`ph-sidebar-cat-row ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => { setSelectedCategory(cat); setCurrentPage(1); }}
                    >
                      <span className="ph-sidebar-cat-name">{cat}</span>
                      <span className="ph-sidebar-cat-count">{count}</span>
                    </div>
                  );
                })}
              </div>

              <button
                className="ph-view-all-cats-btn"
                onClick={() => setShowAllCategories(!showAllCategories)}
                style={{
                  width: '100%',
                  marginTop: '14px',
                  padding: '9px',
                  borderRadius: '8px',
                  border: '1px solid #10b981',
                  background: 'rgba(16, 185, 129, 0.05)',
                  color: '#10b981',
                  fontWeight: '700',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {showAllCategories ? 'Show Less' : 'View All Categories'} <FaChevronRight style={{ fontSize: '10px' }} />
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  )}

      {/* Premium Upgrade Modal */}
      {showPremiumModal && (
        <div className="pcont-modal-overlay" onClick={() => setShowPremiumModal(false)}>
          <div className="pcont-modal" onClick={e => e.stopPropagation()}>
            <div className="pcont-modal-icon"><FaStar style={{ fontSize: '32px', color: '#fbbf24' }} /></div>
            <div className="pcont-modal-title">Premium Access Required</div>
            <div className="pcont-modal-desc" style={{ marginBottom: '20px', lineHeight: '1.5' }}>
              This question or course is part of the Premium package.
              To upgrade, please reach out to your Placement Department or contact your SEED-IT Training Manager.
            </div>
            <button className="pcont-modal-btn primary" onClick={() => setShowPremiumModal(false)} style={{ width: '100%' }}>
              Close
            </button>
          </div>
        </div>
      )}
      {/* Article Reader Modal */}
      {activeArticle && (
        <div className="ph-modal-overlay" onClick={() => setActiveArticle(null)}>
          <div className="ph-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ph-article-header">
              <div className="ph-article-title-container">
                <h2 className="ph-article-title">{activeArticle.title}</h2>
                <span className="ph-article-subtitle">SEED-IT Learning Platform • Course Tutorial</span>
              </div>
              <button className="ph-article-close" onClick={() => setActiveArticle(null)} title="Close Tutorial">
                
              </button>
            </div>

            <div className="ph-article-scroll" onScroll={handleScroll}>
              {activeArticle.isExternal ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '20px', color: 'var(--ph-primary)' }}><FaBookOpen /></div>
                  <h3 style={{ border: 'none', margin: '0 0 16px 0', fontSize: '20px' }}>External Tutorial Link</h3>
                  <p style={{ color: 'var(--ph-text-dim)', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
                    This tutorial is hosted on an external source website ({new URL(activeArticle.url).hostname}). Click the button below to view it.
                  </p>
                  <a
                    href={activeArticle.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ph-topbar-btn active"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 24px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}
                  >
                    Open Tutorial Website
                  </a>
                </div>
              ) : (
                <>
                  {activeArticle.video && (() => {
                    let videoId = '';
                    const url = activeArticle.video;
                    if (url.includes('youtu.be/')) {
                      videoId = url.split('youtu.be/')[1]?.split('?')[0];
                    } else if (url.includes('watch?v=')) {
                      videoId = url.split('watch?v=')[1]?.split('&')[0];
                    } else if (url.includes('youtube.com/embed/')) {
                      videoId = url.split('youtube.com/embed/')[1]?.split('?')[0];
                    }
                    if (videoId) {
                      return (
                        <div className="ph-article-video-container">
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="YouTube Video Solution"
                            allowFullScreen
                          />
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div
                    className="ph-article-content"
                    onClick={handleArticleContainerClick}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeArticle.content ?? '') }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Article Loading Overlay */}
      {articleLoading && (
        <div className="ph-modal-overlay">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div className="ph-spinner" style={{ width: '40px', height: '40px', borderWidth: '4px' }} />
            <p style={{ color: 'white', fontWeight: 600 }}>Loading local tutorial...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeHome;
const Chip = ({ label, size, style }) => (
  <span style={{
    background: 'rgba(255,255,255,0.08)',
    color: '#e2e8f0',
    fontSize: size === 'small' ? '11px' : '13px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: 500,
    ...style
  }}>
    {label}
  </span>
);
