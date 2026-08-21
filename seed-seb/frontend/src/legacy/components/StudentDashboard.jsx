import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, Link, useLocation } from '../router-compat';
import { APP_VERSION } from "../AppShell";
import { fetchArticleFile } from '../utils/articleFetcher';
import { auth } from '../firebase-config';
import {
  FaBars,
  FaUser,
  FaSignOutAlt,
  FaLaptopCode,
  FaQuestionCircle,
  FaClipboardList,
  FaClock,
  FaCalendarAlt,
  FaSearch,
  FaFilter,
  FaLock,
  FaShieldAlt,
  FaTimes,
  FaCheck,
  FaCheckCircle,
  FaArrowLeft,
  FaArrowUp,
  FaExclamationTriangle,
  FaWifi,
  FaPlug,
  FaCamera,
  FaMicrophone,
  FaUserShield,
  FaCog,
  FaUserTie,
  FaAward,
  FaStar,
  FaTrophy,
  FaBookOpen,
  FaRocket,
  FaCrown,
  FaGraduationCap,
  FaGem,
  FaSyncAlt,
  FaChevronDown,
  FaChevronRight,
  FaBell,
  FaSun,
  FaMoon,
  FaFire,
  FaBullseye,
  FaKey,
  FaThLarge,
  FaTachometerAlt,
  FaMobileAlt,
  FaCode
} from "react-icons/fa";
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/StudentDashboard.css';
import '../styles/PracticeHome.css';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase-config';
import TrackingService from '../services/trackingService';
import DataService from '../services/dataService';
import MCQService from '../services/mcqService';
import CodingAssessmentService from '../services/codingAssessmentService';
import timeService from '../services/timeService';
import ProctoringInstructions from './ProctoringInstructions';
import PracticeHome from './PracticeHome';
import AIInterviewSimulator from './AIInterviewSimulator';
import { fetchContentJSON } from '../utils/contentApi';
import { fetchCompletionMap, invalidateCompletionCache } from '../services/attemptStatusService';
import { requireTenant } from '../utils/tenant';
import { RESUMABLE_STATES, ATTEMPT_STATES } from '../services/attemptStateMachine';
import { validateAssessmentPayload, validateTestDoc, validateMSASections } from '../utils/assessmentValidator';
import { loadUserDailyGoals, saveUserDailyGoals, getDailyGoalsForDate } from '../utils/dailyGoalsPool';
import { toast } from 'sonner';
import { getAuthData } from '../utils/storageUtils';

const LOCAL_BASE_URL = '/seed-contents';
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';


const slugify = (value = '') => {
  if (!value) return 'test';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'test';
};

const StudentDashboard = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    return location.state?.tab || "dashboard";
  });
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState(() => getAuthData());
  const [dailyGoals, setDailyGoals] = useState([]);
  const [seedCredits, setSeedCredits] = useState(2450);
  const [todayCreditsGained, setTodayCreditsGained] = useState(120);
  const [userStreak, setUserStreak] = useState(1);
  const [goalOffset, setGoalOffset] = useState(0);
  const [progressData, setProgressData] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [loadingProfileProgress, setLoadingProfileProgress] = useState(false);
  const [showLogoutAnimation, setShowLogoutAnimation] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [userPremiumState, setUserPremiumState] = useState(null);
  const [profileSubTab, setProfileSubTab] = useState('info'); // 'info', 'utilisation', 'password'
  const [practiceInitialTab, setPracticeInitialTab] = useState('paths');
  const [practiceInitialCourse, setPracticeInitialCourse] = useState(null);
  const [primaryColor, setPrimaryColor] = useState(() => localStorage.getItem('portal_primary_color') || 'green');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('portal_font_size') || 'medium');
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [practiceReminders, setPracticeReminders] = useState(true);
  const [assessmentAlerts, setAssessmentAlerts] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('portal_theme') || 'seed-seb';
  });
  const [apiKeysList, setApiKeysList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user_api_keys')) || [];
    } catch (e) {
      return [];
    }
  });
  const [newKeyProvider, setNewKeyProvider] = useState('gemini');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [expandedSettingsSections, setExpandedSettingsSections] = useState({
    theme: true,
    aiApi: false
  });
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('+91 98765 43210');
  const [editRollNo, setEditRollNo] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      setEditName(user.name ?? '');
      setEditRollNo(user.rollNumber ?? '');
      setEditPhone(user.phone || '+91 98765 43210');
      setAvatarUrl(user.photoURL ?? '');
    }
  }, [user]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result;
      if (b64) {
        setAvatarUrl(b64);
        const updated = { ...user, photoURL: b64 };
        setUser(updated);
        localStorage.setItem('auth_data', JSON.stringify(updated));
        if (user?.uid) {
          updateDoc(doc(db, 'users', user.uid), { photoURL: b64 }).catch(() => {});
        }
        toast.success('Profile photo updated!');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      toast.error('Name cannot be empty.');
      return;
    }
    const updated = {
      ...user,
      name: editName.trim(),
      rollNumber: editRollNo.trim(),
      phone: editPhone.trim(),
      photoURL: avatarUrl
    };
    setUser(updated);
    localStorage.setItem('auth_data', JSON.stringify(updated));
    if (user?.uid) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          name: editName.trim(),
          rollNumber: editRollNo.trim(),
          phone: editPhone.trim(),
          photoURL: avatarUrl
        });
      } catch (e) {
        console.warn('Failed to update user profile in Firestore:', e);
      }
    }
    setIsEditingProfile(false);
    toast.success('Profile details saved successfully!');
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    try {
      if (auth.currentUser) {
        const { updatePassword: fbUpdatePassword } = await import('firebase/auth');
        await fbUpdatePassword(auth.currentUser, newPassword);
        toast.success('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.success('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update password. Please re-authenticate.');
    }
  };

  const handleSyncProfileProgress = async () => {
    setLoadingProfileProgress(true);
    try {
      const uid = user?.uid;
      if (uid) {
        const { syncProgressWithFirebase } = await import('../services/codingProgressService');
        const res = await syncProgressWithFirebase(uid);
        if (res.success && res.progress) {
          setProgressData(res.progress);
          toast.success('Progress synced with cloud!');
        } else {
          toast.info('Local progress is up to date.');
        }
      } else {
        toast.info('Progress up to date.');
      }
    } catch (err) {
      toast.error('Failed to sync progress.');
    } finally {
      setLoadingProfileProgress(false);
    }
  };

  // ─── Live Progress, Dynamic Streak & Daily Goals Lifecycle ───────────
  const initProgressAndGoals = useCallback(async () => {
    const uid = user?.uid || auth?.currentUser?.uid || 'guest';
    
    // 1. Load Coding Progress
    let prog = null;
    try {
      const { getFullProgress } = await import('../services/codingProgressService');
      prog = await getFullProgress(uid);
      if (prog) {
        setProgressData(prog);

        // Calculate Live Streak from actual activity dates
        const activity = prog.activity || {};
        const details = prog.problemDetails || {};
        const activeDates = new Set();
        Object.keys(activity).forEach(d => {
          if (activity[d]?.problemsSolved > 0 || activity[d]?.hours > 0) activeDates.add(d);
        });
        Object.values(details).forEach(p => {
          if ((p.status === 'SOLVED' || p.lastSolvedAt) && p.lastSolvedAt) {
            activeDates.add(p.lastSolvedAt.split('T')[0]);
          }
        });

        const todayStr = new Date().toISOString().split('T')[0];
        let computedStreak = 0;
        let currDate = new Date();

        if (activeDates.has(todayStr)) {
          computedStreak++;
          currDate.setDate(currDate.getDate() - 1);
        } else {
          currDate.setDate(currDate.getDate() - 1);
        }

        let daysChecked = 0;
        while (daysChecked < 365) {
          const dStr = currDate.toISOString().split('T')[0];
          if (activeDates.has(dStr)) {
            computedStreak++;
            currDate.setDate(currDate.getDate() - 1);
            daysChecked++;
          } else {
            break;
          }
        }

        const finalStreak = computedStreak;
        setUserStreak(finalStreak);
      }
    } catch (err) {
      console.warn('[Dashboard] Could not calculate live streak:', err);
    }

    // 2. Load and Dynamically Evaluate Daily Goals
    try {
      const data = await loadUserDailyGoals(uid);
      const todayStr = new Date().toISOString().split('T')[0];
      let baseGoals = (data && Array.isArray(data.goals)) ? data.goals : getDailyGoalsForDate(todayStr, uid, 0);
      
      // Evaluate each goal against live progress data
      const localProg = prog || (await (await import('../services/codingProgressService')).getFullProgress(uid));
      const solvedToday = Object.entries(localProg?.problemDetails || {})
        .filter(([id, p]) => (p.status === 'SOLVED' || p.lastSolvedAt) && p.lastSolvedAt && p.lastSolvedAt.startsWith(todayStr));
      const todaySolvedCount = Math.max((localProg?.activity?.[todayStr]?.problemsSolved || 0), solvedToday.length);
      const todayTimeMins = Math.round((localProg?.activity?.[todayStr]?.hours || 0) * 60);

      let allCompleted = true;
      const evaluated = baseGoals.map(g => {
        let isComp = g.completed || false;
        let curr = g.current || 0;
        const tgt = g.target || 1;
        let progLabel = '';

        if (g.type === 'solve') {
          curr = todaySolvedCount;
          if (curr >= tgt) isComp = true;
          progLabel = ` (${Math.min(curr, tgt)}/${tgt})`;
        } else if (g.type === 'time') {
          curr = todayTimeMins;
          if (curr >= tgt) isComp = true;
          progLabel = ` (${Math.min(curr, tgt)}/${tgt} mins)`;
        } else if (g.type === 'difficulty') {
          const reqDiff = (g.difficulty ?? '').toLowerCase();
          const diffCount = solvedToday.filter(([id, p]) => {
            const pDiff = (p.difficulty ?? '').toLowerCase();
            if (reqDiff === 'easy') return pDiff === 'easy' || pDiff === 'beginner' || !pDiff || id.startsWith('Q0.');
            if (reqDiff === 'medium') return pDiff === 'medium';
            return pDiff === reqDiff;
          }).length;
          curr = Math.max(diffCount, reqDiff === 'easy' ? todaySolvedCount : 0);
          if (curr >= tgt) isComp = true;
          progLabel = ` (${Math.min(curr, tgt)}/${tgt})`;
        } else if (g.type === 'category') {
          const catCount = solvedToday.filter(([id, p]) => (p.category ?? '').toLowerCase() === (g.category ?? '').toLowerCase()).length;
          curr = catCount;
          if (curr >= tgt) isComp = true;
          progLabel = ` (${Math.min(curr, tgt)}/${tgt})`;
        }

        if (!isComp) allCompleted = false;
        return { ...g, current: curr, target: tgt, completed: isComp, displayProgress: progLabel };
      });

      setDailyGoals(evaluated);

      // If all goals are completed today, ensure streak and rewards are persisted (ONCE per day)
      if (evaluated.length > 0 && allCompleted && uid && uid !== 'guest') {
        const wereAllCompletedBefore = baseGoals.every(g => g.completed);
        const alreadyAwardedToday = data?.allCompleted === true || user?.lastStreakDate === todayStr;
        if (!wereAllCompletedBefore && !alreadyAwardedToday) {
          setUserStreak(prev => {
            const nextStreak = prev + 1;
            setSeedCredits(credPrev => {
              const nextCredits = credPrev + 100;
              setTodayCreditsGained(t => t + 100);
              saveUserDailyGoals(uid, todayStr, evaluated, nextStreak, nextCredits).catch(() => {});
              return nextCredits;
            });
            return nextStreak;
          });
        }
      }

      if (user) {
        if (user.seedCredits !== undefined) setSeedCredits(user.seedCredits);
        else if (user.seedCredits !== undefined) setSeedCredits(user.seedCredits);
      }
    } catch (err) {
      console.warn('[Dashboard] Daily goals evaluation skipped:', err);
    }
  }, [user?.uid, user?.lastStreakDate]);

  useEffect(() => {
    initProgressAndGoals();

    const handleProgressUpdate = () => {
      initProgressAndGoals();
    };

    window.addEventListener('coding_progress_updated', handleProgressUpdate);
    window.addEventListener('storage', handleProgressUpdate);
    window.addEventListener('focus', handleProgressUpdate);

    return () => {
      window.removeEventListener('coding_progress_updated', handleProgressUpdate);
      window.removeEventListener('storage', handleProgressUpdate);
      window.removeEventListener('focus', handleProgressUpdate);
    };
  }, [initProgressAndGoals]);

  useEffect(() => {
    if (activeTab === 'dashboard' || activeTab === 'profile') {
      initProgressAndGoals();
    }
  }, [activeTab, initProgressAndGoals]);

  // Log activity on Tab Change
  useEffect(() => {
    const uid = user?.uid || auth?.currentUser?.uid || 'guest';
    if (uid && uid !== 'guest') {
      import('../services/activityLoggerService').then(mod => {
        mod.logUserActivity(uid, 'PAGE_VIEW', { tab: activeTab });
      }).catch(() => {});
    }
  }, [activeTab, user]);

  const handleToggleGoal = async (idx) => {
    if (!dailyGoals || !dailyGoals[idx]) return;
    const goal = dailyGoals[idx];
    
    // Toggle goal and update Firestore + Local Profile cache
    const updated = dailyGoals.map((g, i) => (i === idx ? { ...g, completed: !g.completed } : g));
    setDailyGoals(updated);

    const uid = user?.uid || auth?.currentUser?.uid || 'guest';
    const todayStr = new Date().toISOString().split('T')[0];
    const wereAllCompletedBefore = dailyGoals.every(g => g.completed);
    const areAllCompletedNow = updated.every(g => g.completed);

    let nextStreak = userStreak;
    let nextCredits = seedCredits;

    // Activity Log for Goal Toggle
    import('../services/activityLoggerService').then(mod => {
      mod.logUserActivity(uid, 'GOAL_TOGGLED', { goalId: goal.id, title: goal.title, completed: !goal.completed });
    }).catch(() => {});

    if (!wereAllCompletedBefore && areAllCompletedNow) {
      nextStreak = userStreak + 1;
      nextCredits = seedCredits + 100;
      setUserStreak(nextStreak);
      setSeedCredits(nextCredits);
      setTodayCreditsGained(prev => prev + 100);
      toast.success('🔥 Streak Approved! All daily goals completed! +100 SEED Credits awarded!');

      // Activity Log for Streak Approval
      import('../services/activityLoggerService').then(mod => {
        mod.logUserActivity(uid, 'STREAK_APPROVED', { streak: nextStreak, credits: nextCredits, date: todayStr });
      }).catch(() => {});
    } else if (wereAllCompletedBefore && !areAllCompletedNow) {
      nextStreak = Math.max(1, userStreak - 1);
      nextCredits = Math.max(0, seedCredits - 100);
      setUserStreak(nextStreak);
      setSeedCredits(nextCredits);
      setTodayCreditsGained(prev => Math.max(0, prev - 100));
    }

    await saveUserDailyGoals(uid, todayStr, updated, nextStreak, nextCredits);
  };

  const handleRefreshOrEditGoals = async () => {
    const uid = user?.uid || auth?.currentUser?.uid || 'guest';
    const todayStr = new Date().toISOString().split('T')[0];
    const nextOffset = goalOffset + 1;
    setGoalOffset(nextOffset);
    const newGoals = getDailyGoalsForDate(todayStr, uid, nextOffset);
    setDailyGoals(newGoals);
    await saveUserDailyGoals(uid, todayStr, newGoals, userStreak, seedCredits);
    toast.info('Refreshed 3 new daily goals for today!');
  };

  // ─── Course Syllabi & Dynamic Progress Mapping ───────────────────────
  const [cQuestionIds, setCQuestionIds] = useState([]);
  const [javaQuestionIds, setJavaQuestionIds] = useState([]);
  const [cppQuestionIds, setCppQuestionIds] = useState([]);
  const [dsaQuestionIds, setDsaQuestionIds] = useState([]);

  useEffect(() => {
    Promise.all([
      fetchArticleFile('CourseMappingFiles/learn-c-syllabus.json').then(r => r.json()).catch(() => null),
      fetchArticleFile('CourseMappingFiles/learn-java-syllabus.json').then(r => r.json()).catch(() => null),
      fetchArticleFile('CourseMappingFiles/learn-cpp-syllabus.json').then(r => r.json()).catch(() => null),
      fetchArticleFile('CourseMappingFiles/learn-dsa-syllabus.json').then(r => r.json()).catch(() => null),
    ]).then(([cSyllabus, javaSyllabus, cppSyllabus, dsaSyllabus]) => {
      const cQids = [];
      if (cSyllabus && cSyllabus.modules) {
        cSyllabus.modules.forEach(m => (m.submodules || []).forEach(s => (s.problems || []).forEach(p => cQids.push(p.id))));
      }
      const javaQids = [];
      if (javaSyllabus && javaSyllabus.modules) {
        javaSyllabus.modules.forEach(m => (m.submodules || []).forEach(s => (s.problems || []).forEach(p => javaQids.push(p.id))));
      }
      const cppQids = [];
      if (cppSyllabus && cppSyllabus.modules) {
        cppSyllabus.modules.forEach(m => (m.submodules || []).forEach(s => (s.problems || []).forEach(p => cppQids.push(p.id))));
      }
      const dsaQids = [];
      if (dsaSyllabus && dsaSyllabus.modules) {
        dsaSyllabus.modules.forEach(m => (m.submodules || []).forEach(s => (s.problems || []).forEach(p => dsaQids.push(p.id))));
      }
      setCQuestionIds(cQids);
      setJavaQuestionIds(javaQids);
      setCppQuestionIds(cppQids);
      setDsaQuestionIds(dsaQids);
    });
  }, []);

  // ─── Dynamic Current Week Activity Calculation ──────────────────────
  const currentWeekDays = useMemo(() => {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0: Sunday, 1: Monday, ... 6: Saturday
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - currentDayOfWeek);

    const activity = progressData?.activity || {};
    const details = progressData?.problemDetails || {};
    
    // Set of active date strings "YYYY-MM-DD"
    const activeDateSet = new Set();
    Object.keys(activity).forEach(d => {
      if (activity[d]?.problemsSolved > 0 || activity[d]?.hours > 0) activeDateSet.add(d);
    });
    Object.values(details).forEach(p => {
      if ((p.status === 'SOLVED' || p.lastSolvedAt) && p.lastSolvedAt) {
        activeDateSet.add(p.lastSolvedAt.split('T')[0]);
      }
    });

    const days = [];
    let activeDaysCount = 0;
    const todayStr = today.toISOString().split('T')[0];

    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isToday = dateStr === todayStr;
      const isActive = activeDateSet.has(dateStr);

      if (isActive) activeDaysCount++;

      days.push({
        dayLetter: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][i],
        dateNum: d.getDate(),
        dateStr,
        isActive,
        isToday
      });
    }

    return { days, activeDaysCount };
  }, [progressData]);

  // ─── Dynamic Activity Snapshot Stats ────────────────────────────────
  const activitySnapshotStats = useMemo(() => {
    const details = progressData?.problemDetails || {};
    const activity = progressData?.activity || {};
    const solvedList = progressData?.solvedProblems || [];
    const totalSolved = solvedList.length;

    // Accuracy Calculation
    const problemEntries = Object.values(details);
    let totalAttempts = 0;
    let totalScore = 0;
    let scoredProblemsCount = 0;

    problemEntries.forEach(p => {
      const attempts = typeof p.attempts === 'number' && p.attempts > 0 ? p.attempts : 1;
      totalAttempts += attempts;
      if (typeof p.bestScore === 'number') {
        totalScore += p.bestScore;
        scoredProblemsCount++;
      }
    });

    let accuracy = 0;
    if (scoredProblemsCount > 0) {
      // Average score percentage across attempted problems
      accuracy = Math.round(totalScore / scoredProblemsCount);
    } else if (totalAttempts > 0) {
      // Solved vs total attempts ratio
      accuracy = Math.min(100, Math.round((totalSolved / totalAttempts) * 100));
    } else if (totalSolved > 0) {
      accuracy = 100;
    } else {
      accuracy = 0;
    }

    // Today vs Yesterday Time & Problems
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const yestStr = yest.toISOString().split('T')[0];

    const todayHours = activity[todayStr]?.hours || 0;
    const todayMins = Math.round(todayHours * 60);
    const yestHours = activity[yestStr]?.hours || 0;
    const yestMins = Math.round(yestHours * 60);

    const todaySolvedCount = activity[todayStr]?.problemsSolved || 0;
    const yestSolvedCount = activity[yestStr]?.problemsSolved || 0;

    const solvedDiff = todaySolvedCount - yestSolvedCount;
    const timeDiffMins = todayMins - yestMins;

    return {
      totalSolved,
      todayMins,
      todayMinsFormatted: todayMins >= 60 ? `${(todayMins / 60).toFixed(1)} hrs` : `${todayMins} mins`,
      accuracy,
      solvedTrend: solvedDiff > 0 ? `+${solvedDiff} vs yesterday` : solvedDiff < 0 ? `${solvedDiff} vs yesterday` : '0 vs yesterday',
      timeTrend: timeDiffMins > 0 ? `+${timeDiffMins}m vs yesterday` : timeDiffMins < 0 ? `${timeDiffMins}m vs yesterday` : '0m vs yesterday',
      accuracyTrend: accuracy > 0 ? `${accuracy}% overall` : 'No attempts yet'
    };
  }, [progressData]);

  const solvedIdsSet = useMemo(() => {
    const ids = progressData?.solvedProblems || [];
    return new Set(ids.map(String));
  }, [progressData]);

  const rawCoursesList = useMemo(() => {
    const list = [
      {
        id: 'learn_c',
        title: 'Learn C',
        subtitle: 'Foundations & Pointers',
        icon: <FaCode />,
        boxClass: 'box-green',
        barClass: 'bar-green',
        qids: cQuestionIds,
        defaultTotal: 42
      },
      {
        id: 'learn_java',
        title: 'Learn Java',
        subtitle: 'OOP & Collections',
        icon: <FaThLarge />,
        boxClass: 'box-blue',
        barClass: 'bar-blue',
        qids: javaQuestionIds,
        defaultTotal: 40
      },
      {
        id: 'learn_cpp',
        title: 'Learn C++',
        subtitle: 'STL & Competitive Coding',
        icon: <FaRocket />,
        boxClass: 'box-purple',
        barClass: 'bar-purple',
        qids: cppQuestionIds,
        defaultTotal: 39
      },
      {
        id: 'learn_dsa',
        title: 'Data Structures & Algorithms',
        subtitle: 'Trees, Graphs & DP',
        icon: <FaGem />,
        boxClass: 'box-orange',
        barClass: 'bar-orange',
        qids: dsaQuestionIds,
        defaultTotal: 38
      }
    ];

    return list.map(c => {
      const totalTopics = c.qids.length || c.defaultTotal;
      const completedTopics = c.qids.filter(id => solvedIdsSet.has(String(id))).length;
      const pct = Math.min(100, Math.round((completedTopics / Math.max(1, totalTopics)) * 100));
      return {
        ...c,
        totalTopics,
        completedTopics,
        percentage: pct,
        isStarted: completedTopics > 0
      };
    });
  }, [cQuestionIds, javaQuestionIds, cppQuestionIds, dsaQuestionIds, solvedIdsSet]);

  const displayedCourses = useMemo(() => {
    const started = rawCoursesList.filter(c => c.isStarted);
    const unstarted = rawCoursesList.filter(c => !c.isStarted);
    const combined = [...started, ...unstarted];
    return combined.slice(0, 4);
  }, [rawCoursesList]);

  // Assessments List State
  const [assessments, setAssessments] = useState([]);
  const [filteredAssessments, setFilteredAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);

  useEffect(() => {
    setSelectedSeries(null);
    setSearchTerm("");
  }, [activeTab]);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  // ─── Welcome Popup State ──────────────────────────────────────────
  const [welcomeQuote, setWelcomeQuote] = useState("");
  const [welcomeInput, setWelcomeInput] = useState("");
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeUpdates, setWelcomeUpdates] = useState(null);
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [isAiInterviewAllowed, setIsAiInterviewAllowed] = useState(false);
  const [activeResumeSession, setActiveResumeSession] = useState(null);

  // Active assessment session detection (5-minute exit grace window)
  useEffect(() => {
    if (!user) return;
    const email = user.email ?? '';
    const nowMs = new Date().getTime();

    // 1. Check Multi-Section active session
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('msaProgress_')) {
        try {
          const progress = JSON.parse(localStorage.getItem(key) || '{}');
          if (progress.email === email && progress.currentSecIdx >= 0) {
            const lastActiveMs = progress.lastActiveTimestamp || (progress.savedAt ? new Date(progress.savedAt).getTime() : 0);
            const elapsedOfflineSec = Math.floor((nowMs - lastActiveMs) / 1000);

            if (elapsedOfflineSec <= 300) {
              const activeBackup = localStorage.getItem(`msaActiveAssessment_${progress.assessmentId}`);
              if (activeBackup) {
                const assessmentObj = JSON.parse(activeBackup);
                setActiveResumeSession({
                  type: 'multisection',
                  id: progress.assessmentId,
                  name: assessmentObj.title || assessmentObj.name || 'Multi-Section Assessment',
                  currentSecIdx: progress.currentSecIdx,
                  elapsedOfflineSec,
                  remainingSecTimer: Math.max(0, (progress.secTimer || 0) - elapsedOfflineSec),
                  assessmentData: assessmentObj,
                  slug: assessmentObj.slug || progress.assessmentId
                });
                return;
              }
            }
          }
        } catch (_) { }
      }
    }

    // 2. Check Single-Section Coding active session
    const codingData = localStorage.getItem('codingAssessmentData');
    const codingStartTime = localStorage.getItem('codingAssessmentStartTime');
    const codingTimer = localStorage.getItem('codingAssessmentTimer');
    const codingLastActive = localStorage.getItem('codingLastActiveTime');
    if (codingData && codingStartTime && codingTimer) {
      try {
        const { assessment } = JSON.parse(codingData);
        const lastActiveMs = parseInt(codingLastActive || codingStartTime, 10);
        const elapsedOfflineSec = Math.floor((nowMs - lastActiveMs) / 1000);

        if (elapsedOfflineSec <= 300) {
          const durationSec = parseInt(codingTimer, 10);
          const startTimeMs = parseInt(codingStartTime, 10);
          const totalElapsed = Math.floor((nowMs - startTimeMs) / 1000);
          const remaining = Math.max(0, durationSec - totalElapsed);

          if (remaining > 0) {
            setActiveResumeSession({
              type: 'coding',
              id: assessment.id,
              name: assessment.name || 'Coding Assessment',
              slug: assessment.slug || assessment.id,
              remainingSecTimer: remaining,
              elapsedOfflineSec
            });
            return;
          }
        }
      } catch (_) { }
    }

    // 3. Fallback: Query Firestore for Remote Active Attempt using Firebase Auth UID
    // SECURITY: Firestore path uses uid (auth.currentUser.uid), NOT email string.
    // Using email as a document path allowed cross-user data access if a student
    // knew another student's email.
    const checkRemoteActiveAttempt = async () => {
      try {
        // Require Firebase Auth UID — refuse to query with email as document key
        const uid = auth?.currentUser?.uid;
        if (!uid) {
          console.warn('[StudentDashboard] checkRemoteActiveAttempt: no Firebase Auth UID. Skipping remote check.');
          setActiveResumeSession(null);
          return;
        }

        const attemptsColRef = collection(db, 'users', uid, 'contestAttempts');
        const q = query(attemptsColRef, where('completed', '==', false));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const data = docSnap.data();

          // Validate ownership — the attempt must belong to this UID
          if (data.uid && data.uid !== uid) {
            console.warn('[StudentDashboard] Remote attempt uid mismatch — not restoring.');
            setActiveResumeSession(null);
            return;
          }

          // Only resume attempts in a resumable state
          const attemptStatus = data.status || (data.completed ? ATTEMPT_STATES.SUBMITTED : ATTEMPT_STATES.IN_PROGRESS);
          if (!RESUMABLE_STATES.has(attemptStatus)) {
            console.log('[StudentDashboard] Remote attempt is in non-resumable state:', attemptStatus);
            setActiveResumeSession(null);
            return;
          }

          const lastSavedAt = data.lastSavedAt?.toDate ? data.lastSavedAt.toDate() : null;
          const lastActiveMs = lastSavedAt ? lastSavedAt.getTime() : (data.submittedAt ? new Date(data.submittedAt).getTime() : 0);
          const elapsedOfflineSec = lastActiveMs ? Math.floor((nowMs - lastActiveMs) / 1000) : Infinity;

          if (elapsedOfflineSec <= 300) {
            setActiveResumeSession({
              type: data.type || 'multisection',
              id: data.assessmentId || docSnap.id,
              name: data.assessmentTitle || data.assessmentTitle || 'Active Assessment',
              slug: data.slug || data.assessmentId || docSnap.id,
              isRemoteRestored: true,
              elapsedOfflineSec,
              remoteSnapshot: data,
            });
            return;
          }
        }
      } catch (remoteErr) {
        console.warn('[StudentDashboard] Remote active attempt check skipped:', remoteErr.message);
      }
      setActiveResumeSession(null);
    };

    checkRemoteActiveAttempt();
  }, [user]);

  const handleResumeSession = (session) => {
    if (!session) return;
    if (session.isRemoteRestored && session.remoteSnapshot) {
      localStorage.setItem(`msaProgress_${session.id}`, JSON.stringify(session.remoteSnapshot));
      sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(session.remoteSnapshot.assessmentData || { id: session.id, name: session.name }));
      navigate(`/student/assessment/id/${session.slug}`);
      return;
    }

    if (session.assessmentData) {
      sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(session.assessmentData));
    }
    navigate(`/student/assessment/id/${session.slug}`);
  };

  useEffect(() => {
    const checkAiInterviewAccess = async () => {
      if (!user) return;
      const userEmail = (user.email ?? "").trim().toLowerCase();
      if (!userEmail) return;

      // QA Developer bypass list to help check the tab instantly
      const QA_DEVELOPERS = ["ashok@gmail.com", "student@seedit.tech", "student@gmail.com", "test@gmail.com"];
      if (QA_DEVELOPERS.includes(userEmail)) {
        setIsAiInterviewAllowed(true);
        return;
      }

      try {
        let list = null;
        try {
          const githubRes = await fetch("https://raw.githubusercontent.com/seeditDev/SEEDDB/main/Premium/ai-interview.json");
          if (githubRes.ok) {
            list = await githubRes.json();
          }
        } catch (githubErr) {
          console.warn("GitHub fetch for AI interview list failed, trying local fallback:", githubErr);
        }

        if (!list) {
          try {
            const localRes = await fetch("/SEEDDB/Premium/ai-interview.json");
            const contentType = localRes.headers.get("content-type") || "";
            if (localRes.ok && contentType.includes("application/json")) {
              list = await localRes.json();
            }
          } catch (_) {
            // Local fallback unavailable — silent fallback
          }
        }

        if (Array.isArray(list)) {
          const allowed = list.some(email => String(email).trim().toLowerCase() === userEmail);
          setIsAiInterviewAllowed(allowed);
        }
      } catch (err) {
        console.warn("Failed to check AI Interview access:", err);
      }
    };

    checkAiInterviewAccess();
  }, [user]);

  useEffect(() => {
    // Check session storage to only prompt once per browser session
    if (sessionStorage.getItem('welcome_shown')) return;

    const fetchWelcomeQuote = async () => {
      // 31 default motivational quotes
      const DEFAULT_QUOTES = [
        "Believe you can and you're halfway there.",
        "Act as if what you do makes a difference. It does.",
        "Success is not final, failure is not fatal: it is the courage to continue that counts.",
        "Never bend your head. Always hold it high. Look the world straight in the eye.",
        "What you get by achieving your goals is not as important as what you become by achieving your goals.",
        "Believe in yourself. You are braver than you think, more talented than you know.",
        "I can't change the direction of the wind, but I can adjust my sails to always reach my destination.",
        "No matter what you're going through, there's a light at the end of the tunnel.",
        "It is our attitude at the beginning of a difficult undertaking which, more than anything else, will determine its successful outcome.",
        "Life is like riding a bicycle. To keep your balance, you must keep moving.",
        "Limit your 'always' and your 'nevers.'",
        "You are never too old to set another goal or to dream a new dream.",
        "Try to be a rainbow in someone's cloud.",
        "You do not find a happy life. You make it.",
        "The most wasted of all days is one without laughter.",
        "Make each day your masterpiece.",
        "Write it on your heart that every day is the best day in the year.",
        "Keep your face always toward the sunshine—and shadows will fall behind you.",
        "The only limit to our realization of tomorrow will be our doubts of today.",
        "It always seems impossible until it's done.",
        "The best way to predict the future is to create it.",
        "You miss 100% of the shots you don't take.",
        "In the middle of difficulty lies opportunity.",
        "Success is walking from failure to failure with no loss of enthusiasm.",
        "Opportunity does not knock, it presents itself when you beat down the door.",
        "Don't count the days, make the days count.",
        "Dream big and dare to fail.",
        "Keep clean, be useful, and make a friend.",
        "Action is the foundational key to all success.",
        "Focus on the journey, not the destination.",
        "Every moment is a fresh beginning."
      ];

      const dayOfMonth = new Date().getDate(); // 1 to 31
      let quoteOfTheDay = DEFAULT_QUOTES[(dayOfMonth - 1) % 31];

      try {
        let data = null;
        try {
          const res = await fetch("https://raw.githubusercontent.com/seeditDev/seed-contents/main/welcome.json");
          if (res.ok) data = await res.json();
        } catch (githubErr) {
          console.warn("GitHub welcome fetch failed, trying local fallback:", githubErr);
        }

        if (!data) {
          try {
            const localRes = await fetch("/seed-contents/welcome.json");
            if (localRes.ok) data = await localRes.json();
          } catch (localErr) {
            console.error("Local welcome fallback failed:", localErr);
          }
        }

        if (data) {
          if (typeof data === 'object' && !Array.isArray(data)) {
            // Check if structured: { quotes: ..., updates: ... }
            if (data.quotes) {
              const qData = data.quotes;
              if (Array.isArray(qData)) {
                quoteOfTheDay = qData[(dayOfMonth - 1) % qData.length] || quoteOfTheDay;
              } else if (typeof qData === 'object') {
                quoteOfTheDay = qData[dayOfMonth] || qData[String(dayOfMonth)] || Object.values(qData)[0] || quoteOfTheDay;
              }
            } else {
              quoteOfTheDay = data[dayOfMonth] || data[String(dayOfMonth)] || Object.values(data)[0] || quoteOfTheDay;
            }

            // Save updates if present
            if (data.updates) {
              setWelcomeUpdates(data.updates);
            } else if (data.update) {
              setWelcomeUpdates(data.update);
            }
          } else if (Array.isArray(data)) {
            quoteOfTheDay = data[(dayOfMonth - 1) % data.length] || quoteOfTheDay;
          }
        }
      } catch (err) {
        console.warn("Could not fetch welcome.json, using fallback quote.", err);
      }

      setWelcomeQuote(quoteOfTheDay);
      setShowWelcomeModal(true);
    };

    fetchWelcomeQuote();
  }, []);

  const handleCloseWelcomeModal = () => {
    if (welcomeInput.trim() === welcomeQuote.trim()) {
      sessionStorage.setItem('welcome_shown', 'true');
      setShowWelcomeModal(false);
      if (welcomeUpdates) {
        setShowUpdatesModal(true);
      }
    }
  };

  const handleSkipWelcomeModal = () => {
    sessionStorage.setItem('welcome_shown', 'true');
    setShowWelcomeModal(false);
    if (welcomeUpdates) {
      setShowUpdatesModal(true);
    }
  };

  // ─── Streamlined Launch State ─────────────────────────────────────
  const [launchStep, setLaunchStep] = useState(null); // null | 'modal'
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [eligibilityError, setEligibilityError] = useState(null);
  const [isLaunching, setIsLaunching] = useState(false);

  // Passkey
  const [passkeyInput, setPasskeyInput] = useState("");
  const [passkeyError, setPasskeyError] = useState("");
  const passkeyInputRef = useRef(null);

  // Instant Pre-flight checks
  const [preflightResults, setPreflightResults] = useState({
    internet: 'pass',
    webcam: 'pass',
    microphone: 'pass',
    secureEnv: 'pass'
  });
  // ─────────────────────────────────────────────────────────────────

  const navigate = useNavigate();

  useEffect(() => {
    const authData = getAuthData() || {};
    const userEmail = (authData.email ?? '').toLowerCase();
    const userUid = authData.uid ?? auth?.currentUser?.uid ?? '';
    if (userEmail || userUid) {
      setUser(authData);
      loadAssessments(authData);

      // ── Force completion refresh when returning from an assessment ──
      if (location.state?.justCompleted) {
        if (userEmail) invalidateCompletionCache(userEmail);
        window.history.replaceState({}, '', window.location.pathname);
      }

      // ── Firestore profile enrichment (background, non-blocking) ──
      // Reads users/{uid} and merges fresh canonical profile fields into user state
      const enrichProfile = async () => {
        const lookupId = auth?.currentUser?.uid || userUid;
        if (!lookupId) {
          console.warn('[Dashboard] enrichProfile: no Firebase Auth UID. Skipping.');
          return;
        }
        try {
          const profileSnap = await getDoc(doc(db, 'users', lookupId));
          if (profileSnap.exists()) {
            const p = profileSnap.data();

            const enriched = {
              ...authData,
              ...p,
              uid: lookupId,
              email: (p.email ?? authData.email ?? userEmail).toLowerCase(),
              tenantId: p.tenantId ?? authData.tenantId ?? '',
              college: p.college ?? authData.college ?? '',
              name: p.name ?? authData.name ?? '',
              rollNumber: p.rollNumber ?? authData.rollNumber ?? '',
              cohortId: p.cohortId ?? authData.cohortId ?? '',
              year: p.year ?? authData.year ?? '',
              department: p.department ?? authData.department ?? '',
              role: p.role ?? authData.role ?? 'student',
              isPremium: Boolean(p.isPremium ?? authData.isPremium),
              seedCredits: typeof p.seedCredits === 'number' ? p.seedCredits : (typeof authData.seedCredits === 'number' ? authData.seedCredits : 0),
              streak: typeof p.streak === 'number' ? p.streak : (typeof authData.streak === 'number' ? authData.streak : 0),
              lastStreakDate: p.lastStreakDate ?? authData.lastStreakDate ?? null,
              photoURL: p.photoURL ?? authData.photoURL ?? '',
              isAuthenticated: true,
            };
            setUser(enriched);
            if (enriched.seedCredits !== undefined) setSeedCredits(enriched.seedCredits);
            if (enriched.streak !== undefined) setUserStreak(enriched.streak);
            localStorage.setItem('auth_data', JSON.stringify(enriched));

            if (!authData.tenantId && enriched.tenantId) {
              console.info('[Dashboard] Profile enriched — reloading assessments with complete tenant info.');
              loadAssessments(enriched);
            }
          }
        } catch (enrichErr) {
          console.warn('[Dashboard] Profile enrichment skipped:', enrichErr.message);
        }
      };
      enrichProfile();

      // Load user API keys from Firestore
      if (userEmail) {
        getDoc(doc(db, "userApiKeys", userEmail.trim())).then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();

            // Check if it's the new format (has a 'keys' array)
            let loadedKeys = [];
            if (Array.isArray(data.keys)) {
              loadedKeys = data.keys;
            } else {
              // Legacy format: migrate to list
              if (data.gemini) {
                loadedKeys.push({
                  id: 'legacy-gemini',
                  type: 'gemini',
                  label: 'Default Gemini Key',
                  value: data.gemini,
                  active: true
                });
              }
              if (data.nvidia) {
                loadedKeys.push({
                  id: 'legacy-nvidia',
                  type: 'nvidia',
                  label: 'Default NVIDIA Key',
                  value: data.nvidia,
                  active: true
                });
              }
            }

            localStorage.setItem('user_api_keys', JSON.stringify(loadedKeys));
            setApiKeysList(loadedKeys);
          }
        }).catch((err) => {
          /* console.error("Error loading API keys from Firestore:", err); */ void 0;
        });
      }
    } else {
      navigate("/login");
    }
  }, [navigate]);

  // Automatically load free local storage progress on tab visit to ensure instant updates
  useEffect(() => {
    if (activeTab === "profile" && user) {
      // STRICT UID: canonical Practice identity is Firebase Auth UID only.
      // Do NOT fall back to Email — that reads a different/legacy document.
      const uid = user.uid;
      if (uid) {
        import('../services/codingProgressService').then(({ getFullProgress }) => {
          getFullProgress(uid).then(progress => {
            setProgressData(progress);
          });
        });
      } else {
        console.warn('[StudentDashboard] Firebase UID not available — profile progress not loaded');
      }
    }
  }, [activeTab, user]);

  const loadAssessments = async (userData) => {
    setLoading(true);
    setError(null);
    try {
      // ── NEW: fetch TestDocs directly from courses/{courseId}/series/{seriesId}/tests/{testId}
      const testDocs = await DataService.getAllowedTestDocs();

      const isPremiumUser = Boolean(userData?.isPremium) === true;

      const combined = testDocs
        .filter(t => !t.isPremium || isPremiumUser)
        .map(t => {
          // Normalise schedule from ISO strings → shape getScheduleStatus() expects
          let schedule = null;
          if (t.schedule?.start || t.schedule?.end) {
            const s = t.schedule.start ? new Date(t.schedule.start) : null;
            const e = t.schedule.end ? new Date(t.schedule.end) : null;
            if (s || e) {
              schedule = {
                startDate: s ? s.toISOString().slice(0, 10) : '',
                startTime: s ? s.toTimeString().slice(0, 8) : '',
                endDate: e ? e.toISOString().slice(0, 10) : '',
                endTime: e ? e.toTimeString().slice(0, 8) : '',
              };
            }
          }

          // All assessments use the unified Assessment runtime (MSA).
          // 'type' is always 'assessment'; MCQ/Coding/SEA are section-level types.
          const isMultiSection = true; // every assessment routes through MultiSectionAssessment

          return {
            // ── identity ──
            id: t.id,
            courseId: t.courseId,
            seriesId: t.seriesId,
            // ── display ──
            name: t.name,
            seriesName: t.seriesTitle || t.courseTitle || 'Assessments',
            courseTitle: t.courseTitle ?? '',
            seriesKey: t.seriesId,
            difficulty: t.difficulty || 'Medium',
            // ── engine routing ──
            type: 'assessment',
            isMultiSection,
            slug: t.assessmentId || t.id,
            url: t.cdnUrl ?? '',
            cdnUrl: t.cdnUrl ?? '',
            // ── sections ──
            sections: t.sections || [],
            // ── timing ──
            duration: t.duration_minutes || 60,
            schedule,
            // ── access ──
            passkey: t.passkey ?? '',
            isPremium: t.isPremium,
            guestEnabled: t.guestEnabled,
            // ── proctor ──
            proctored: t.proctored,
            audioProctored: t.audioProctored,
            maxViolations: t.maxViolations ?? 5,
            maxAudioViolations: t.maxAudioViolations ?? 3,
            // ── settings ──
            settings: t.settings,
            display_order: t.display_order ?? 999,
            totalMarks: t.maxScore || 100,
            // ── initially false, resolved below ──
            completed: false,
          };
        });

      // Sort: Active → Upcoming → Expired, then display_order, then schedule start
      combined.sort((a, b) => {
        const pri = { Active: 0, Upcoming: 1, Expired: 2 };
        const sa = getScheduleStatus(a.schedule).status;
        const sb = getScheduleStatus(b.schedule).status;
        if (pri[sa] !== pri[sb]) return (pri[sa] ?? 99) - (pri[sb] ?? 99);
        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
        return (a.schedule?.startDate ?? '').localeCompare(b.schedule?.startDate ?? '');
      });

      // Resolve completion status (1 Firestore read via attempt index)
      // force:true when returning from assessment (cache already invalidated)
      try {
        const { fetchCompletionMap } = await import('../services/attemptStatusService');
        const forceRefresh = !!(location?.state?.justCompleted);
        const completionMap = await fetchCompletionMap(userData, combined.map(i => i.id), { force: forceRefresh });
        combined.forEach(item => { item.completed = completionMap[item.id] === true; });
      } catch (e) {
        console.warn('[loadAssessments] completion map failed:', e?.message);
      }

      setAssessments(combined);
      setFilteredAssessments(combined);
    } catch (err) {
      console.error("Failed to load assessments:", err);
      setError("Failed to retrieve your assigned assessments. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Helper: check schedule access and compute status
  const getScheduleStatus = (schedule) => {
    if (!schedule || !schedule.startDate || !schedule.startTime) {
      return { status: "Active", reason: "Always open" };
    }
    try {
      const now = timeService.getNow();
      const start = new Date(schedule.startDate + 'T' + schedule.startTime);
      const end = new Date(schedule.endDate + 'T' + schedule.endTime);

      if (now < start) {
        return {
          status: "Upcoming",
          reason: `Unlocks on ${start.toLocaleDateString()} at ${start.toLocaleTimeString()}`,
          time: start
        };
      }
      if (now > end) {
        return {
          status: "Expired",
          reason: `Ended on ${end.toLocaleDateString()} at ${end.toLocaleTimeString()}`,
          time: end
        };
      }
      return { status: "Active", reason: "Currently available" };
    } catch (e) {
      return { status: "Active", reason: "Active" };
    }
  };

  // Client-side filtering
  useEffect(() => {
    let filtered = [...assessments];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    }

    if (filterDifficulty !== "All") {
      filtered = filtered.filter(a => a.difficulty.toLowerCase() === filterDifficulty.toLowerCase());
    }

    if (filterType !== "All") {
      filtered = filtered.filter(a => a.type === filterType.toLowerCase());
    }

    if (filterStatus !== "All") {
      filtered = filtered.filter(a => {
        const sched = getScheduleStatus(a.schedule);
        return sched.status.toLowerCase() === filterStatus.toLowerCase();
      });
    }

    setFilteredAssessments(filtered);
  }, [searchTerm, filterDifficulty, filterType, filterStatus, assessments]);

  // Fetch JSON files: CDN direct (1st), authenticated GitHub API with PAT (2nd), local fallback (3rd)
  const fetchJSONFile = async (url) => {
    // ── Guard: empty URL means the test was never published ──
    if (!url || !url.trim()) {
      throw new Error('Assessment JSON URL is not set. Please ask your administrator to publish this test slug.');
    }

    // Strip to relative path (handles full CDN URLs and relative paths)
    const cleanUrl = url
      .replace(/^https?:\/\/raw\.githubusercontent\.com\/seeditDev\/[^/]+\/main\//, '')
      .replace(/^https?:\/\/api\.github\.com\/.*\/contents\//, '')
      .replace(/^\/+/, '')
      .replace(/^seed-contents\//, '')
      .replace(/^SEEDDB\//, '');

    // Helper: authenticated GitHub Contents API fetch
    const fetchViaGitHubAPI = async (repo, path) => {
      const pat = import.meta.env?.VITE_GITHUB_PAT;
      const headers = { Accept: 'application/vnd.github.v3+json' };
      if (pat) headers['Authorization'] = `token ${pat}`;
      const res = await fetch(
        `https://api.github.com/repos/seeditDev/${repo}/contents/${path}`,
        { headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.content) return null;
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
      return JSON.parse(decoded);
    };

    // 1st: If a full CDN URL is stored, hit it directly (cache-busted)
    if (url.startsWith('https://')) {
      try {
        const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`);
        if (res.ok) return await res.json();
      } catch (_) { }
    }

    const candidatePaths = [
      cleanUrl,
      cleanUrl.endsWith('.json') ? null : `${cleanUrl}.json`,
      cleanUrl.includes('/') ? null : `coding/testbank/${cleanUrl}.json`,
      cleanUrl.includes('/') ? null : `coding/testbank/${cleanUrl}`,
      cleanUrl.includes('/') ? null : `mcq/testbank/${cleanUrl}.json`,
      cleanUrl.includes('/') ? null : `mcq/testbank/${cleanUrl}`,
      cleanUrl.includes('/') ? null : `coding/questions/${cleanUrl}.json`
    ].filter(Boolean);

    for (const cPath of candidatePaths) {
      // 2nd: seed-contents CDN (public, fast)
      try {
        const rawRes = await fetch(`https://raw.githubusercontent.com/seeditDev/seed-contents/main/${cPath}?_t=${Date.now()}`);
        if (rawRes.ok) return await rawRes.json();
      } catch (_) { }

      // 3rd: SEEDDB CDN (public, fast)
      try {
        const rawRes = await fetch(`https://raw.githubusercontent.com/seeditDev/SEEDDB/main/${cPath}?_t=${Date.now()}`);
        if (rawRes.ok) return await rawRes.json();
      } catch (_) { }

      // 4th: seed-contents via authenticated GitHub API (uses VITE_GITHUB_PAT)
      try {
        const result = await fetchViaGitHubAPI('seed-contents', cPath);
        if (result) return result;
      } catch (_) { }

      // 5th: SEEDDB via authenticated GitHub API (uses VITE_GITHUB_PAT)
      try {
        const result = await fetchViaGitHubAPI('SEEDDB', cPath);
        if (result) return result;
      } catch (_) { }

      // 6th: Local public/seed-contents fallback (dev / offline)
      try {
        const localRes = await fetch(`/seed-contents/${cPath}`);
        if (localRes.ok) return await localRes.json();
      } catch (_) { }
    }

    throw new Error(`Could not download assessment JSON file: ${cleanUrl}`);
  };

  // ─────────────────────────────────────────────────────────────────
  // LAUNCH WIZARD: 5-step flow
  // Step 1: Verify no prior attempt (Firebase)
  // Step 2: Passkey (if required)
  // Step 3: Pre-flight system check
  // ─────────────────────────────────────────────────────────────────
  // STREAMLINED UNIFIED ASSESSMENT LAUNCH
  // ─────────────────────────────────────────────────────────────────

  const cancelWizard = () => {
    setLaunchStep(null);
    setSelectedAssessment(null);
    setPasskeyInput("");
    setPasskeyError("");
    setEligibilityError(null);
    setIsLaunching(false);
  };

  const runParallelPreflight = async (assessment) => {
    const isProctored = Boolean(assessment.proctored && assessment.proctored !== 'false');
    const internet = navigator.onLine ? 'pass' : 'fail';
    let webcam = 'pass';
    let microphone = 'pass';

    if (isProctored && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        webcam = devices.some(d => d.kind === 'videoinput') ? 'pass' : 'fail';
        microphone = devices.some(d => d.kind === 'audioinput') ? 'pass' : 'fail';
      } catch (_) {
        webcam = 'pass'; // Non-blocking in desktop environment
        microphone = 'pass';
      }
    }

    setPreflightResults({
      internet,
      webcam: isProctored ? webcam : 'pass',
      microphone: isProctored ? microphone : 'pass',
      secureEnv: 'pass'
    });
  };

  // Open Unified Launch Modal on test click
  const handleStartClick = (assessment) => {
    setSelectedAssessment(assessment);
    setPasskeyInput("");
    setPasskeyError("");
    setEligibilityError(null);
    setIsLaunching(false);
    setLaunchStep('modal');

    // Run parallel device & network checks in background (~50ms)
    runParallelPreflight(assessment);

    setTimeout(() => {
      if (passkeyInputRef.current) passkeyInputRef.current.focus();
    }, 120);
  };

  // Validate passkey, eligibility, and launch workspace immediately
  const handleUnifiedLaunch = async () => {
    if (!selectedAssessment || isLaunching) return;

    // 1. Mandatory passkey check if test requires it
    if (selectedAssessment.passkey) {
      if (!passkeyInput.trim()) {
        setPasskeyError("Please enter the access passkey.");
        if (passkeyInputRef.current) passkeyInputRef.current.focus();
        return;
      }
      if (passkeyInput.trim() !== selectedAssessment.passkey) {
        setPasskeyError("Incorrect passkey. Please try again.");
        return;
      }
    }

    setIsLaunching(true);
    setPasskeyError("");

    try {
      if (!navigator.onLine) {
        throw new Error("Internet connection required to launch assessment.");
      }

      const liveUid = auth?.currentUser?.uid;
      if (!liveUid) throw new Error('Authentication required. Please log in again.');

      // 2. Instant eligibility / duplicate check
      // All assessments write their result to the canonical assessmentResults path.
      const tenantId = user?.tenantId ?? '';
      const canonDocPath = `assessmentResults/${tenantId}/${selectedAssessment.id}/${liveUid}`;
      const docSnap = await getDoc(doc(db, canonDocPath));
      const isCompleted = docSnap.exists() && (docSnap.data().completed === true || docSnap.data().status === 'submitted');
      const check = { exists: docSnap.exists(), completed: isCompleted };

      if (check.exists && check.completed) {
        setIsLaunching(false);
        setEligibilityError({
          title: "Assessment Already Completed",
          message: "You have already completed and submitted this assessment. Re-attempts are not permitted."
        });
        return;
      }

      // 3. Launch directly into workspace
      await launchAssessment(selectedAssessment);
    } catch (err) {
      console.error("Launch failed:", err);
      setIsLaunching(false);
      setEligibilityError({
        title: "Launch Error",
        message: err.message || "Failed to start the assessment. Please try again."
      });
    }
  };

  // STEP 5 — Load JSON + create initial Firebase doc + navigate
  const launchAssessment = async (assessment) => {
    try {
      const now = timeService.now();
      const nowISO = timeService.getNow().toISOString();
      const durationSec = assessment.duration * 60;

      // ── UNIFIED LAUNCH (all assessments go through MultiSectionAssessment) ──
      // normalizeAssessment guarantees sections always exist. If the Firestore doc
      // has inline questions (legacy MCQ) they are wrapped in a 1-section Assessment.
      const canonicalAss = assessment;
      sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(canonicalAss));
      sessionStorage.setItem('msaCourseCtx', JSON.stringify({
        courseId: assessment.courseId ?? '',
        seriesId: assessment.seriesId ?? '',
        assessmentId: assessment.id ?? '',
        totalMarks: assessment.maxScore || 100,
        settings: assessment.settings || {},
      }));
      setLaunchStep(null);
      navigate(`/student/assessment/id/${assessment.slug}`);
      return;
    } catch (err) {
      console.error("Launch setup failed:", err);
      setLaunchStep(null);
      setEligibilityError({
        title: "Setup Error",
        message: err.message || "Could not launch the test workspace. Please check your connection."
      });
    }
  };

  const handleLogout = () => {
    setShowLogoutAnimation(true);
    TrackingService.stopTracking();
    sessionStorage.clear();

    // Clear cookies
    try {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.seedit.tech";
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.hackerrank.com";
      }
    } catch (error) {
      console.error('Error clearing cookies:', error);
    }

    // FIX P1: Use DataService.signOut() which:
    //   1. Signs out Firebase Auth (prevents next user inheriting the session)
    //   2. Clears all UID-scoped student localStorage keys
    //   3. Clears proctor offline queues scoped to the current UID
    // The previous implementation never called Firebase signOut(), meaning the
    // next login attempt inherited the previous student's Firebase session token.
    DataService.signOut().finally(() => {
      setTimeout(() => {
        setShowLogoutAnimation(false);
        navigate("/login");
      }, 800);
    });
  };

  const name = user?.name ?? "Student";
  const email = user?.email ?? "";
  const college = user?.college ?? "";
  const rollNumber = user?.rollNumber ?? "";
  const year = user?.year ?? "2027";
  const dept = user?.department ?? "CSE";

  const renderDashboardHome = () => {
    return (
      <div className="dashboard-grid-layout">
        {/* ── Left / Center Main Feed Column ── */}
        <div className="dashboard-main-col">
          {/* Welcome Header */}
          <div className="home-welcome-header">
            <h1 className="home-welcome-title">Welcome back, {name}! 👋</h1>
            <p className="home-welcome-subtitle">Stay consistent and keep building your problem solving skills.</p>
          </div>

          {/* 1. Quick Start */}
          <div className="home-section-block">
            <h3 className="home-section-heading">Quick Start</h3>
            <div className="quick-start-grid">
              <div
                className="quick-start-card"
                onClick={() => {
                  setPracticeInitialTab('bank');
                  setActiveTab('practice');
                }}
              >
                <div className="qs-icon-box qs-blue">
                  <FaClipboardList />
                </div>
                <div className="qs-info">
                  <h4 className="qs-title">Practice Bank</h4>
                  <span className="qs-sub">9000+ Questions</span>
                </div>
                <FaChevronRight className="qs-arrow" />
              </div>

              <div
                className="quick-start-card"
                onClick={() => {
                  setPracticeInitialTab('paths');
                  setPracticeInitialCourse(null);
                  setActiveTab('practice');
                }}
              >
                <div className="qs-icon-box qs-green">
                  <FaLaptopCode />
                </div>
                <div className="qs-info">
                  <h4 className="qs-title">Course Curriculum</h4>
                  <span className="qs-sub">Explore all modules</span>
                </div>
                <FaChevronRight className="qs-arrow" />
              </div>

              <div
                className="quick-start-card"
                onClick={() => setActiveTab('assessments')}
              >
                <div className="qs-icon-box qs-purple">
                  <FaBookOpen />
                </div>
                <div className="qs-info">
                  <h4 className="qs-title">Assessments</h4>
                  <span className="qs-sub">Attempt tests</span>
                </div>
                <FaChevronRight className="qs-arrow" />
              </div>

              <div
                className="quick-start-card"
                onClick={() => {
                  setPracticeInitialTab('bank');
                  setPracticeInitialCourse(null);
                  setActiveTab('practice');
                }}
              >
                <div className="qs-icon-box qs-orange">
                  <FaBullseye />
                </div>
                <div className="qs-info">
                  <h4 className="qs-title">Weak Areas</h4>
                  <span className="qs-sub">Improve your skills</span>
                </div>
                <FaChevronRight className="qs-arrow" />
              </div>
            </div>
          </div>

          {/* 2. Your Activity Snapshot */}
          <div className="home-section-block">
            <h3 className="home-section-heading">Your Activity Snapshot</h3>
            <div className="activity-snapshot-grid">
              <div className="activity-snapshot-card">
                <div className="snapshot-icon-box icon-green">
                  <FaThLarge />
                </div>
                <div className="snapshot-stat-val">{activitySnapshotStats.totalSolved}</div>
                <div className="snapshot-stat-lbl">Problems Solved</div>
                <div className="snapshot-stat-trend trend-green">
                  <FaArrowUp style={{ fontSize: '10px' }} /> {activitySnapshotStats.solvedTrend}
                </div>
              </div>

              <div className="activity-snapshot-card">
                <div className="snapshot-icon-box icon-blue">
                  <FaClock />
                </div>
                <div className="snapshot-stat-val">{activitySnapshotStats.todayMinsFormatted}</div>
                <div className="snapshot-stat-lbl">Time Spent Today</div>
                <div className="snapshot-stat-trend trend-blue">
                  <FaArrowUp style={{ fontSize: '10px' }} /> {activitySnapshotStats.timeTrend}
                </div>
              </div>

              <div className="activity-snapshot-card">
                <div className="snapshot-icon-box icon-orange">
                  <FaFire />
                </div>
                <div className="snapshot-stat-val">{userStreak} Day{userStreak === 1 ? '' : 's'}</div>
                <div className="snapshot-stat-lbl">Current Streak</div>
                <div className="snapshot-stat-trend trend-orange">
                  <FaArrowUp style={{ fontSize: '10px' }} /> {userStreak > 1 ? `${userStreak} days active` : 'Active today'}
                </div>
              </div>

              <div className="activity-snapshot-card">
                <div className="snapshot-icon-box icon-purple">
                  <FaBullseye />
                </div>
                <div className="snapshot-stat-val">{activitySnapshotStats.accuracy}%</div>
                <div className="snapshot-stat-lbl">Accuracy</div>
                <div className="snapshot-stat-trend trend-purple">
                  <FaArrowUp style={{ fontSize: '10px' }} /> {activitySnapshotStats.accuracyTrend}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Continue Learning */}
          <div className="home-section-block">
            <div className="home-section-header-row">
              <h3 className="home-section-heading">Continue Learning</h3>
              <button
                className="home-section-link-btn"
                onClick={() => {
                  setPracticeInitialTab('paths');
                  setPracticeInitialCourse(null);
                  setActiveTab('practice');
                }}
              >
                View All
              </button>
            </div>

            <div className="continue-learning-grid">
              {displayedCourses.map(course => (
                <div
                  key={course.id}
                  className="continue-course-card"
                  onClick={() => {
                    setPracticeInitialTab('paths');
                    setPracticeInitialCourse(course.id);
                    setActiveTab('practice');
                  }}
                >
                  <div className="course-card-top">
                    <div className={`course-icon-box ${course.boxClass}`}>
                      {course.icon}
                    </div>
                    <button className="course-menu-btn" onClick={(e) => e.stopPropagation()}>
                      ⋮
                    </button>
                  </div>
                  <h4 className="course-card-title">{course.title}</h4>
                  <p className="course-card-sub">{course.subtitle}</p>
                  <div className="course-progress-track">
                    <div className={`course-progress-bar ${course.barClass}`} style={{ width: `${course.percentage}%` }} />
                  </div>
                  <div className="course-card-footer">
                    <span className="course-pct-label">{course.percentage}% Completed</span>
                    <span className="course-topics-count">{course.completedTopics}/{course.totalTopics} Topics</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Recent Activity */}
          <div className="home-section-block">
            <div className="home-section-header-row">
              <h3 className="home-section-heading">Recent Activity</h3>
              <button
                className="home-section-link-btn"
                onClick={() => setActiveTab('practice')}
              >
                View All
              </button>
            </div>

            <div className="recent-activity-rows-list">
              <div
                className="recent-activity-row-item"
                onClick={() => {
                  setPracticeInitialTab('bank');
                  setActiveTab('practice');
                }}
              >
                <div className="act-avatar-box act-green">
                  <FaLaptopCode />
                </div>
                <div className="act-info-col">
                  <h4 className="act-item-title">Visited Practice Bank</h4>
                  <span className="act-item-sub">Math • 2 hours ago</span>
                </div>
                <FaChevronRight className="act-arrow" />
              </div>

              <div
                className="recent-activity-row-item"
                onClick={() => setActiveTab('profile')}
              >
                <div className="act-avatar-box act-purple">
                  <FaUser />
                </div>
                <div className="act-info-col">
                  <h4 className="act-item-title">Profile Updated</h4>
                  <span className="act-item-sub">Today</span>
                </div>
                <FaChevronRight className="act-arrow" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column (Widgets Feed) ── */}
        <div className="dashboard-side-col">
          {/* Card 1: This Week */}
          <div className="dashboard-widget-card">
            <div className="widget-card-header">
              <span className="widget-card-title">This Week</span>
              <button
                className="widget-link-btn"
                onClick={() => setActiveTab('profile')}
              >
                View Report
              </button>
            </div>

            <div className="week-tracker-days-grid">
              {currentWeekDays.days.map((d, idx) => (
                <span key={idx} className={`week-day-letter ${d.isToday ? 'today' : ''}`}>{d.dayLetter}</span>
              ))}
            </div>

            <div className="week-tracker-circles-grid">
              {currentWeekDays.days.map((d, idx) => (
                <div
                  key={idx}
                  className={`week-date-circle ${d.isActive ? 'active' : ''} ${d.isToday ? 'today' : ''}`}
                  title={`${d.dateStr}: ${d.isActive ? 'Activity logged' : 'No activity logged'}`}
                >
                  {d.dateNum}
                </div>
              ))}
            </div>

            <div className="week-streak-footer">
              {currentWeekDays.activeDaysCount > 0
                ? `Great job! ${currentWeekDays.activeDaysCount} active day${currentWeekDays.activeDaysCount === 1 ? '' : 's'} this week. 🔥`
                : `No activity yet this week. Solve a problem to light up your streak! 🔥`}
            </div>
          </div>

          {/* Card 2: Progress Overview */}
          <div className="dashboard-widget-card">
            <div className="widget-card-header">
              <span className="widget-card-title">Progress Overview</span>
            </div>

            <div className="progress-overview-wrap">
              <div className="po-donut-box">
                <svg viewBox="0 0 36 36" className="po-donut-svg">
                  <path
                    className="po-donut-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="po-donut-fill"
                    strokeDasharray="2, 100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="po-center-text">
                  <span className="po-num">0</span>
                  <span className="po-denom">/9328</span>
                </div>
              </div>

              <div className="po-legend-col">
                <div className="po-legend-item">
                  <span className="po-dot dot-green" />
                  <span className="po-label">Solved</span>
                  <span className="po-val">0 (0%)</span>
                </div>
                <div className="po-legend-item">
                  <span className="po-dot dot-blue" />
                  <span className="po-label">Attempted</span>
                  <span className="po-val">0 (0%)</span>
                </div>
                <div className="po-legend-item">
                  <span className="po-dot dot-grey" />
                  <span className="po-label">Unattempted</span>
                  <span className="po-val">9328 (100%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Skills Overview */}
          <div className="dashboard-widget-card">
            <div className="widget-card-header">
              <span className="widget-card-title">Skills Overview</span>
              <button
                className="widget-link-btn"
                onClick={() => setActiveTab('profile')}
              >
                View All
              </button>
            </div>

            <div className="skills-bar-chart-container">
              <div className="skills-y-axis">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>

              <div className="skills-bars-area">
                <div className="skills-grid-lines">
                  <div className="grid-line" />
                  <div className="grid-line" />
                  <div className="grid-line" />
                  <div className="grid-line" />
                  <div className="grid-line" />
                </div>

                <div className="skills-bar-cols">
                  {/* Math */}
                  <div className="skill-col">
                    <span className="skill-pct-tag">72%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-green" style={{ height: '72%' }} />
                    </div>
                    <span className="skill-col-label">Math</span>
                  </div>

                  {/* DSA */}
                  <div className="skill-col">
                    <span className="skill-pct-tag">58%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-blue" style={{ height: '58%' }} />
                    </div>
                    <span className="skill-col-label">DSA</span>
                  </div>

                  {/* Logic */}
                  <div className="skill-col">
                    <span className="skill-pct-tag">64%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-purple" style={{ height: '64%' }} />
                    </div>
                    <span className="skill-col-label">Logic</span>
                  </div>

                  {/* Chem */}
                  <div className="skill-col">
                    <span className="skill-pct-tag">40%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-orange" style={{ height: '40%' }} />
                    </div>
                    <span className="skill-col-label">Chem</span>
                  </div>

                  {/* Physics */}
                  <div className="skill-col">
                    <span className="skill-pct-tag">30%</span>
                    <div className="skill-bar-track">
                      <div className="skill-bar-fill fill-teal" style={{ height: '30%' }} />
                    </div>
                    <span className="skill-col-label">Physics</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Top Achievements */}
          <div className="dashboard-widget-card">
            <div className="widget-card-header">
              <span className="widget-card-title">Top Achievements</span>
              <button
                className="widget-link-btn"
                onClick={() => setActiveTab('profile')}
              >
                View All
              </button>
            </div>

            <div className="top-achievement-item">
              <div className="achievement-hex-badge">
                <span className="hex-num">1</span>
              </div>
              <div className="achievement-info-col">
                <h4 className="achievement-title">Getting Started</h4>
                <p className="achievement-desc">Complete your first question</p>
                <div className="achievement-progress-row">
                  <div className="achievement-bar-bg">
                    <div className="achievement-bar-fill" style={{ width: '100%' }} />
                  </div>
                  <span className="achievement-count-label">1/1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAssessments = () => {
    // 1. Group all loaded assessments by series key
    const seriesMap = {};
    assessments.forEach(a => {
      const sKey = a.seriesKey || 'general';
      const sName = a.seriesName || 'General Assessments';
      const sDesc = a.seriesDescription || `Practice and evaluation modules for ${sName}.`;
      if (!seriesMap[sKey]) {
        seriesMap[sKey] = {
          key: sKey,
          title: sName,
          description: sDesc,
          assessments: []
        };
      }
      seriesMap[sKey].assessments.push(a);
    });

    const seriesList = Object.values(seriesMap);

    return (
      <div className="assessments-tab-content">
        <div className="home-welcome-header" style={{ marginBottom: '20px' }}>
          <h1 className="home-welcome-title">Assigned Assessments</h1>
          <p className="home-welcome-subtitle">Review scheduled test series and start your proctored evaluation modules.</p>
        </div>

        {/* Resumable Session Banner if active */}
        {activeResumeSession && (
          <div style={{
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            border: '2px solid #F59E0B',
            borderRadius: '12px',
            padding: '16px 22px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 8px 24px rgba(245, 158, 11, 0.2)',
            color: '#FFF'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: '#FEF3C7', color: '#D97706',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', fontWeight: 'bold'
              }}>
                ⚡
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', color: '#FBBF24', fontWeight: '700' }}>
                  Active Assessment in Progress — Resumable Session
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#CBD5E1' }}>
                  You exited <strong>{activeResumeSession.name}</strong> within the 5-minute grace period.
                  {activeResumeSession.type === 'multisection' && ` Resuming Section ${activeResumeSession.currentSecIdx + 1}.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleResumeSession(activeResumeSession)}
              style={{
                background: '#F59E0B', color: '#0F172A',
                border: 'none', padding: '10px 22px', borderRadius: '8px',
                fontWeight: 'bold', fontSize: '14px', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
              }}
            >
              Resume Assessment Now →
            </button>
          </div>
        )}

        {selectedSeries === null ? (
          // ─── SERIES TILE VIEW ───
          <>
            <div className="dashboard-filters-bar" style={{ marginBottom: '16px' }}>
              <div className="search-box-wrapper" style={{ width: '100%' }}>
                <FaSearch className="search-icon" />
                <input
                  type="text"
                  placeholder="Search series by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>

            {loading ? (
              <div className="learn-loading">
                <div className="learn-spinner"></div>
                <p>Loading assessments catalog...</p>
              </div>
            ) : error ? (
              <div className="error-banner">
                <FaExclamationTriangle /> {error}
              </div>
            ) : seriesList.length > 0 ? (
              <div className="ps-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {seriesList
                  .filter(s => !searchTerm || s.title.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(series => {
                    const totalTests = series.assessments.length;
                    const completedTests = series.assessments.filter(a => a.completed).length;

                    return (
                      <div
                        key={series.key}
                        className="ps-sheet-card"
                        style={{
                          '--theme-border-color': 'var(--accent-coding)',
                          minHeight: '190px'
                        }}
                      >
                        <div>
                          <h3 className="ps-card-title">{series.title}</h3>
                          <p className="ps-card-desc" style={{ fontSize: '13px', marginTop: '6px', color: 'var(--text-muted)' }}>
                            {series.description}
                          </p>
                        </div>

                        <div className="ps-card-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '16px' }}>
                          <span className="ps-card-stats" style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
                            {completedTests}/{totalTests} Completed
                          </span>

                          <div className="ps-card-actions">
                            <button
                              onClick={() => setSelectedSeries(series.key)}
                              className="ps-action-btn primary"
                              style={{
                                padding: '8px 18px',
                                fontSize: '13px',
                                fontWeight: '700',
                                color: '#ffffff',
                                backgroundColor: '#15803d',
                                border: '1px solid #15803d',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 6px rgba(21, 128, 61, 0.25)'
                              }}
                            >
                              Explore Series →
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="no-contests-message" style={{ textAlign: 'center', padding: '40px' }}>
                No assessment series assigned to you.
              </div>
            )}
          </>
        ) : (
          // ─── ASSESSMENTS DETAIL VIEW ───
          (() => {
            const series = seriesMap[selectedSeries];
            if (!series) {
              setSelectedSeries(null);
              return null;
            }

            // Filter assessments inside this series
            let assessmentsToShow = series.assessments;
            if (searchTerm.trim()) {
              const q = searchTerm.toLowerCase();
              assessmentsToShow = assessmentsToShow.filter(a => a.name.toLowerCase().includes(q));
            }
            if (filterDifficulty !== "All") {
              assessmentsToShow = assessmentsToShow.filter(a => a.difficulty.toLowerCase() === filterDifficulty.toLowerCase());
            }
            if (filterType !== "All") {
              assessmentsToShow = assessmentsToShow.filter(a => a.type.toLowerCase() === filterType.toLowerCase());
            }
            if (filterStatus !== "All") {
              assessmentsToShow = assessmentsToShow.filter(a => {
                const sched = getScheduleStatus(a.schedule);
                return sched.status.toLowerCase() === filterStatus.toLowerCase();
              });
            }

            return (
              <>
                {/* Back button and series header */}
                <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button
                    onClick={() => { setSelectedSeries(null); setSearchTerm(""); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '13px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <FaArrowLeft /> Back to Series
                  </button>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>{series.title}</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{series.description}</p>
                  </div>
                </div>

                {/* Filters Panel for assessments inside series */}
                <div className="dashboard-filters-bar">
                  <div className="search-box-wrapper">
                    <FaSearch className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search assessment by name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="search-input"
                    />
                  </div>

                  <div className="filter-dropdowns">
                    <div className="filter-item">
                      <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="diff-filter-select">
                        <option value="All">All Types</option>
                        <option value="MCQ">MCQ Quiz</option>
                        <option value="Coding">Coding</option>
                        <option value="MSA">Multi-Section (MSA)</option>
                      </select>
                    </div>
                    <div className="filter-item">
                      <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} className="diff-filter-select">
                        <option value="All">All Difficulties</option>
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>
                    <div className="filter-item">
                      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="diff-filter-select">
                        <option value="All">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Upcoming">Upcoming</option>
                        <option value="Expired">Expired</option>
                      </select>
                    </div>
                  </div>
                </div>

                {assessmentsToShow.length > 0 ? (
                  <div className="ps-cards-grid">
                    {assessmentsToShow.map(a => {
                      const sched = getScheduleStatus(a.schedule);
                      const isExpired = sched.status === "Expired";
                      const isUpcoming = sched.status === "Upcoming";
                      const isActive = sched.status === "Active";

                      return (
                        <div
                          key={a.id}
                          className="ps-sheet-card"
                          style={{
                            '--theme-border-color': 'var(--accent-primary, #4f46e5)',
                            border: a.completed ? '1px solid var(--accent-coding)' : '1px solid var(--border-color)',
                            boxShadow: a.completed ? '0 4px 20px rgba(21, 128, 61, 0.08)' : 'none',
                            minHeight: '200px'
                          }}
                        >
                          <div>
                            <h3 className="ps-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{a.name}</span>
                              {a.completed ? (
                                <span style={{ background: 'var(--soft-green, rgba(21, 128, 61, 0.15))', color: 'var(--accent-coding, #15803d)', fontSize: '10px', padding: '3px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                  Completed
                                </span>
                              ) : (
                                <span className={`difficulty-badge diff-${a.difficulty.toLowerCase()}`}>
                                  {a.difficulty}
                                </span>
                              )}
                            </h3>
                            <p className="ps-card-desc" style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-muted)' }}>
                              {a.description || `Timed, proctored assessment. ${a.sections?.length > 1 ? `${a.sections.length} sections` : ''}`}
                            </p>

                            <div className="ps-meta-tags" style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              <span className="ps-tag" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <FaClock style={{ fontSize: '10px' }} /> {a.timeLimit ? `${a.timeLimit} mins` : '60 mins'}
                              </span>
                              <span className="ps-tag" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                Assessment
                                {a.sections?.length > 1 && ` · ${a.sections.length} Sections`}
                              </span>
                            </div>
                          </div>

                          <div className="ps-card-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '14px' }}>
                            <div className="ps-schedule-status">
                              <span className={`status-pill ${sched.status.toLowerCase()}`} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>
                                {sched.status}
                              </span>
                            </div>

                            <div className="ps-card-actions">
                              {a.completed ? (
                                <button className="ps-action-btn" disabled style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '6px 14px', borderRadius: '8px', cursor: 'default', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                                  <FaCheck /> Done
                                </button>
                              ) : isExpired ? (
                                <button className="ps-action-btn" disabled style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '6px 14px', borderRadius: '8px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                                  <FaLock /> Expired
                                </button>
                              ) : isUpcoming ? (
                                <button className="ps-action-btn" disabled style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '6px 14px', borderRadius: '8px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                                  <FaLock /> Locked
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartClick(a)}
                                  className="ps-action-btn primary"
                                  style={{
                                    padding: '7px 18px',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    color: '#ffffff',
                                    backgroundColor: '#4f46e5',
                                    border: '1px solid #4f46e5',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)'
                                  }}
                                >
                                  Start Test
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="no-contests-message" style={{ textAlign: 'center', padding: '60px' }}>
                    No assessments match your current filters in this series.
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>
    );
  };

  const loadProfileProgress = async () => {
    if (!user) return;
    // STRICT UID: canonical Practice identity is Firebase Auth UID only.
    // Do NOT fall back to Email — that reads a different/legacy document.
    const uid = user.uid;
    if (!uid) {
      console.warn('[StudentDashboard] Firebase UID not available — profile progress not loaded');
      return;
    }

    setLoadingProfileProgress(true);
    try {
      const { syncProgressWithFirebase, getFullProgress } = await import('../services/codingProgressService');
      if (navigator.onLine) {
        const syncRes = await syncProgressWithFirebase(uid);
        if (syncRes.success) {
          setProgressData(syncRes.progress);
          return;
        }
      }
      const progress = await getFullProgress(uid);
      setProgressData(progress);
    } catch (err) {
      console.warn("Failed to load user progress:", err);
    } finally {
      setLoadingProfileProgress(false);
    }
  };

  const renderProfile = () => {
    const isPremium = userPremiumState !== null ? userPremiumState : (Boolean(user?.isPremium));

    const getCompletedCourses = () => {
      const badges = [];
      const solvedCount = progressData?.solvedProblems?.length || 0;

      // 1. Solve milestones
      if (solvedCount >= 1) {
        badges.push({
          id: 'first_steps',
          title: 'First Steps',
          desc: 'Solved your first coding problem!',
          icon: <FaRocket />,
          color: '#38bdf8'
        });
      }
      if (solvedCount >= 10) {
        badges.push({
          id: 'coding_scholar',
          title: 'Coding Scholar',
          desc: 'Solved 10+ coding practice problems.',
          icon: <FaBookOpen />,
          color: '#a78bfa'
        });
      }
      if (solvedCount >= 30) {
        badges.push({
          id: 'dsa_expert',
          title: 'DSA Expert',
          desc: 'Solved 30+ coding practice problems.',
          icon: <FaTrophy />,
          color: '#fb923c'
        });
      }
      if (solvedCount >= 50) {
        badges.push({
          id: 'grandmaster',
          title: 'SEED-IT Grandmaster',
          desc: 'Solved 50+ coding practice problems.',
          icon: <FaCrown />,
          color: '#f43f5e'
        });
      }

      // 2. Assessment modules completion
      if (assessments && assessments.length > 0) {
        const completed = assessments.filter(a => a.completed);

        if (completed.length > 0 && completed.length >= Math.ceil(assessments.length / 2)) {
          badges.push({
            id: 'assessment_achiever',
            title: 'Assessment Achiever',
            desc: `Completed ${completed.length} of ${assessments.length} assessments.`,
            icon: <FaClipboardList />,
            color: '#34d399'
          });
        }

        const totalCompleted = assessments.filter(a => a.completed).length;
        if (totalCompleted > 0 && totalCompleted === assessments.length) {
          badges.push({
            id: 'seed_graduate',
            title: 'SEED-IT Graduate',
            desc: 'Completed 100% of all assigned academic courses.',
            icon: <FaGraduationCap />,
            color: '#2dd4bf'
          });
        }
      }

      // 3. Dynamic course completion badges
      const cSolved = progressData?.solvedProblems?.filter(id => cQuestionIds.includes(id)).length || 0;
      const javaSolved = progressData?.solvedProblems?.filter(id => javaQuestionIds.includes(id)).length || 0;
      const cppSolved = progressData?.solvedProblems?.filter(id => cppQuestionIds.includes(id)).length || 0;
      const dsaSolved = progressData?.solvedProblems?.filter(id => dsaQuestionIds.includes(id)).length || 0;
      const pfSolved = progressData?.solvedProblems?.filter(id => String(id).startsWith('Q0.')).length || 0;

      if (cQuestionIds.length > 0 && cSolved >= cQuestionIds.length) {
        badges.push({
          id: 'c_master',
          title: 'C Programming Master',
          desc: 'Completed 100% of Learn C course curriculum.',
          icon: <FaAward />,
          color: '#7c6bff'
        });
      }
      if (cppQuestionIds.length > 0 && cppSolved >= cppQuestionIds.length) {
        badges.push({
          id: 'cpp_master',
          title: 'C++ Foundations Master',
          desc: 'Completed 100% of C++ & DSA Foundations roadmap.',
          icon: <FaRocket />,
          color: '#3b82f6'
        });
      }
      if (dsaQuestionIds.length > 0 && dsaSolved >= dsaQuestionIds.length) {
        badges.push({
          id: 'dsa_expert',
          title: 'Data Structures Grandmaster',
          desc: 'Completed 100% of Master DSA roadmap.',
          icon: <FaGem />,
          color: '#ec4899'
        });
      }
      if (javaQuestionIds.length > 0 && javaSolved >= javaQuestionIds.length) {
        badges.push({
          id: 'java_champion',
          title: 'Java Development Champion',
          desc: 'Completed 100% of Learn Java course curriculum.',
          icon: <FaTrophy />,
          color: '#fb923c'
        });
      }
      if (pfSolved >= 348) {
        badges.push({
          id: 'pf_expert',
          title: 'Fundamentals Pioneer',
          desc: 'Completed 100% of Programming Fundamentals.',
          icon: <FaStar />,
          color: '#10b981'
        });
      }

      return badges;
    };

    // Heatmap date generation helper
    const getHeatmapDates = () => {
      const dates = [];
      const today = new Date();
      const startDate = new Date();
      startDate.setDate(today.getDate() - 182); // 26 weeks
      const startDay = startDate.getDay();
      startDate.setDate(startDate.getDate() - startDay); // Shift to nearest Sunday

      const current = new Date(startDate);
      // Run up to today
      while (current <= today) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    };

    const dates = getHeatmapDates();
    const weeks = [];
    for (let i = 0; i < dates.length; i += 7) {
      weeks.push(dates.slice(i, i + 7));
    }

    // Statistics computation
    const getSolvedCountForDate = (dateStr) => {
      let count = 0;
      if (progressData?.problemDetails) {
        Object.values(progressData.problemDetails).forEach(detail => {
          if (detail.status === 'SOLVED' && detail.lastSolvedAt) {
            const solvedDate = detail.lastSolvedAt.split('T')[0];
            if (solvedDate === dateStr) {
              count++;
            }
          }
        });
      }
      const activityCount = progressData?.activity?.[dateStr]?.problemsSolved || 0;
      return Math.max(count, activityCount);
    };

    let totalHours = 0;
    let totalProblemsSolved = progressData?.completedQuestions?.length || progressData?.solvedProblems?.length || progressData?.solvedCount || 0;
    if (progressData?.activity) {
      Object.values(progressData.activity).forEach(act => {
        totalHours += act.hours || 0;
      });
    }

    const formatUsageTime = (hoursDecimal) => {
      const totalMins = Math.round((hoursDecimal || 0) * 60);
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const hrText = hrs === 1 ? 'hr' : 'hrs';
      const minText = mins === 1 ? 'min' : 'mins';
      if (hrs === 0) return `${mins} ${minText}`;
      if (mins === 0) return `${hrs} ${hrText}`;
      return `${hrs} ${hrText} ${mins} ${minText}`;
    };

    const getStreakCount = () => {
      let streak = 0;
      const checkDate = new Date();
      for (let i = 0; i < 365; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const dayInfo = progressData?.activity?.[dateStr];
        const solved = getSolvedCountForDate(dateStr);
        if ((dayInfo && dayInfo.hours > 0) || solved > 0) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
      return streak;
    };
    const activeStreak = getStreakCount();

    // Map month headers above the weeks
    const monthHeaders = [];
    let lastMonth = -1;
    weeks.forEach((wk, wkIdx) => {
      const firstDay = wk[0];
      const m = firstDay.getMonth();
      if (m !== lastMonth) {
        monthHeaders.push({ label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m], index: wkIdx });
        lastMonth = m;
      }
    });

    return (
      <div className="profile-tab-content">
        {/* Top Profile Subtabs */}
        <div className="profile-subtabs-nav">
          <button
            className={`profile-subtab-btn ${profileSubTab === 'info' ? 'active' : ''}`}
            onClick={() => setProfileSubTab('info')}
          >
            Profile Information
          </button>
          <button
            className={`profile-subtab-btn ${profileSubTab === 'utilisation' ? 'active' : ''}`}
            onClick={() => setProfileSubTab('utilisation')}
          >
            Academic Details
          </button>
          <button
            className={`profile-subtab-btn ${profileSubTab === 'password' ? 'active' : ''}`}
            onClick={() => setProfileSubTab('password')}
          >
            Change Password
          </button>
        </div>

        {profileSubTab === 'info' ? (
          /* ─── VIEW FROM IMAGE 5: Profile Information ─── */
          <div className="profile-info-cards-stack">
            {/* Hidden file input for photo upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />

            {/* Card 1: Personal Information */}
            <div className="profile-info-card">
              <div className="card-header-with-edit">
                <h3 className="profile-card-section-title">Personal Information</h3>
                <button
                  className="btn-edit-pill"
                  onClick={() => {
                    if (isEditingProfile) {
                      handleSaveProfile();
                    } else {
                      setIsEditingProfile(true);
                    }
                  }}
                >
                  {isEditingProfile ? 'Save Changes' : 'Edit'}
                </button>
              </div>

              <div className="personal-info-grid">
                <div className="personal-fields-col">
                  <div className="info-field-row">
                    <span className="field-label">Full Name</span>
                    {isEditingProfile ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)', fontSize: '13px', width: '220px' }}
                      />
                    ) : (
                      <span className="field-value">{user?.name || "—"}</span>
                    )}
                  </div>
                  <div className="info-field-row">
                    <span className="field-label">Roll Number</span>
                    {isEditingProfile ? (
                      <input
                        type="text"
                        value={editRollNo}
                        onChange={(e) => setEditRollNo(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)', fontSize: '13px', width: '220px' }}
                      />
                    ) : (
                      <span className="field-value">{user?.rollNumber || "—"}</span>
                    )}
                  </div>
                  <div className="info-field-row">
                    <span className="field-label">Email Address</span>
                    <span className="field-value">{user?.email || email || "—"}</span>
                  </div>
                  <div className="info-field-row">
                    <span className="field-label">Phone Number</span>
                    {isEditingProfile ? (
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)', fontSize: '13px', width: '220px' }}
                      />
                    ) : (
                      <span className="field-value">{user?.phone || editPhone || '+91 98765 43210'}</span>
                    )}
                  </div>
                  {isEditingProfile && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button
                        className="feature-cta-btn btn-green-solid"
                        onClick={handleSaveProfile}
                        style={{ padding: '6px 16px', fontSize: '12px' }}
                      >
                        Save Profile
                      </button>
                      <button
                        className="btn-edit-pill"
                        onClick={() => setIsEditingProfile(false)}
                        style={{ padding: '6px 14px', fontSize: '12px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="personal-avatar-col">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile Avatar"
                      style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid #10b981'
                      }}
                    />
                  ) : (
                    <div className="profile-avatar-circle-green">
                      {(user?.name || name || 'S').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    className="btn-upload-photo"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload Photo
                  </button>
                  <span className="upload-photo-hint">JPG, PNG up to 2MB</span>
                </div>
              </div>
            </div>

            {/* Card 2: Academic Information */}
            <div className="profile-info-card">
              <div className="card-header-with-edit">
                <h3 className="profile-card-section-title">Academic Information</h3>
              </div>
              <div className="academic-fields-stack">
                <div className="info-field-row">
                  <span className="field-label">College</span>
                  <span className="field-value">{user?.college || college || "—"}</span>
                </div>
                <div className="info-field-row">
                  <span className="field-label">Department</span>
                  <span className="field-value">{user?.department || dept || "—"}</span>
                </div>
                <div className="info-field-row">
                  <span className="field-label">Graduation Year</span>
                  <span className="field-value">{user?.year || year || "—"}</span>
                </div>
              </div>
            </div>

            {/* Card 3: Account Information */}
            <div className="profile-info-card">
              <h3 className="profile-card-section-title" style={{ marginBottom: '16px' }}>Account Information</h3>
              <div className="account-fields-stack">
                <div className="info-field-row">
                  <span className="field-label">Member Since</span>
                  <span className="field-value">12 Jan 2024</span>
                </div>
                <div className="info-field-row">
                  <span className="field-label">Account Status</span>
                  <span className="status-badge-active">Active</span>
                </div>
                <div className="info-field-row">
                  <span className="field-label">Last Login</span>
                  <span className="field-value">Today, 10:32 AM</span>
                </div>
              </div>
            </div>
          </div>
        ) : profileSubTab === 'utilisation' ? (
          /* ─── VIEW FROM IMAGE 1 ROW 2 COL 1: Academic Details & Utilisation ─── */
          <div className="profile-utilisation-container">
            <div className="home-welcome-header" style={{ marginBottom: '20px' }}>
              <h1 className="home-welcome-title">Student Profile & Utilisation</h1>
              <p className="home-welcome-subtitle">Manage your academic registration info and review your daily practice dashboard.</p>
            </div>

            <div className="profile-view-layout">
              {/* Left Student Registration Details Card */}
              <div className="profile-card-left">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile Avatar"
                    style={{
                      width: '72px',
                      height: '72px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #10b981',
                      margin: '0 auto 12px'
                    }}
                  />
                ) : (
                  <div className="profile-avatar-large">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 className="profile-name-title">{name}</h3>
                <span className="profile-student-badge">STUDENT</span>

                <div className="profile-details-table">
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Roll Number</span>
                    <span className="profile-detail-val">{user?.rollNumber || rollNumber || "—"}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">College</span>
                    <span className="profile-detail-val">{user?.college || college || "—"}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Department</span>
                    <span className="profile-detail-val">{user?.department || dept || "—"}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Graduation Year</span>
                    <span className="profile-detail-val">{user?.year || year || "—"}</span>
                  </div>
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Registered Email</span>
                    <span className="profile-detail-val">{user?.email || email || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: 3 Top Stats + Heatmap */}
              <div className="profile-right-column">
                <div className="profile-three-stats-row">
                  <div className="util-stat-card">
                    <span className="util-stat-val val-green">{totalProblemsSolved}</span>
                    <span className="util-stat-lbl">Problems Solved</span>
                  </div>
                  <div className="util-stat-card">
                    <span className="util-stat-val val-blue">{formatUsageTime(totalHours)}</span>
                    <span className="util-stat-lbl">Time Spent Active</span>
                  </div>
                  <div className="util-stat-card">
                    <span className="util-stat-val val-orange">{activeStreak} Day{activeStreak === 1 ? '' : 's'}</span>
                    <span className="util-stat-lbl">Active Streak</span>
                  </div>
                </div>

                {/* Heatmap Card */}
                <div className="heatmap-card">
                  <div className="analytics-card-header" style={{ marginBottom: '14px' }}>
                    <h4 className="widget-section-title" style={{ margin: 0 }}>
                      Practice portal activity tracker (last 6 months)
                    </h4>
                    <button
                      className="btn-sync-cloud"
                      onClick={handleSyncProfileProgress}
                      disabled={loadingProfileProgress}
                    >
                      <FaSyncAlt /> {loadingProfileProgress ? 'Syncing...' : 'Sync with Cloud'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    {/* Y-axis days */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '9px', color: '#94a3b8', marginTop: '18px', width: '22px' }}>
                      <span>Sun</span>
                      <span style={{ visibility: 'hidden' }}>Mon</span>
                      <span>Tue</span>
                      <span style={{ visibility: 'hidden' }}>Wed</span>
                      <span>Thu</span>
                      <span style={{ visibility: 'hidden' }}>Fri</span>
                      <span>Sat</span>
                    </div>

                    {/* X-axis weeks */}
                    <div style={{ flex: 1, overflowX: 'auto' }}>
                      {/* Months Row */}
                      <div style={{ position: 'relative', height: '14px', marginBottom: '6px', fontSize: '10px', color: '#94a3b8' }}>
                        {monthHeaders.map(hdr => (
                          <span key={hdr.index} style={{
                            position: 'absolute',
                            left: `${hdr.index * 14}px`,
                            whiteSpace: 'nowrap'
                          }}>{hdr.label}</span>
                        ))}
                      </div>

                      {/* Grid of Weeks */}
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {weeks.map((wk, wkIdx) => (
                          <div key={wkIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {wk.map((day, dIdx) => {
                              const dateStr = day.toISOString().split('T')[0];
                              const dayInfo = progressData?.activity?.[dateStr] || { hours: 0, problemsSolved: 0 };
                              const solved = getSolvedCountForDate(dateStr);

                              let color = '#ebedf0';
                              if (solved === 1) color = '#9be9a8';
                              if (solved === 2) color = '#40c463';
                              if (solved === 3) color = '#30a14e';
                              if (solved >= 4) color = '#216e39';

                              return (
                                <div
                                  key={dIdx}
                                  style={{
                                    width: '12px',
                                    height: '12px',
                                    background: color,
                                    border: '1px solid rgba(0,0,0,0.06)',
                                    borderRadius: '2px',
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => {
                                    const rect = e.target.getBoundingClientRect();
                                    setTooltipPos({
                                      x: rect.left + window.scrollX + 6,
                                      y: rect.top + window.scrollY - 8
                                    });
                                    setHoveredDay({
                                      dateStr: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                                      dayInfo: {
                                        ...dayInfo,
                                        problemsSolved: solved
                                      }
                                    });
                                  }}
                                  onMouseLeave={() => setHoveredDay(null)}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Heatmap Legend */}
                  <div className="heatmap-footer-legend" style={{ marginTop: '12px' }}>
                    <span>Less</span>
                    <div style={{ width: '11px', height: '11px', background: '#ebedf0', borderRadius: '2px' }}></div>
                    <div style={{ width: '11px', height: '11px', background: '#9be9a8', borderRadius: '2px' }}></div>
                    <div style={{ width: '11px', height: '11px', background: '#40c463', borderRadius: '2px' }}></div>
                    <div style={{ width: '11px', height: '11px', background: '#30a14e', borderRadius: '2px' }}></div>
                    <div style={{ width: '11px', height: '11px', background: '#216e39', borderRadius: '2px' }}></div>
                    <span>More</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Overview (4 Cards Row) */}
            <div className="performance-overview-section" style={{ marginTop: '28px' }}>
              <h3 className="home-section-heading">Performance Overview</h3>
              <div className="activity-snapshot-grid">
                <div className="activity-snapshot-card">
                  <div className="snapshot-icon-box icon-purple"><FaBullseye /></div>
                  <div className="snapshot-stat-val">72%</div>
                  <div className="snapshot-stat-lbl">Accuracy</div>
                </div>
                <div className="activity-snapshot-card">
                  <div className="snapshot-icon-box icon-blue"><FaCheck /></div>
                  <div className="snapshot-stat-val">0</div>
                  <div className="snapshot-stat-lbl">Assessments Taken</div>
                </div>
                <div className="activity-snapshot-card">
                  <div className="snapshot-icon-box icon-green"><FaCode /></div>
                  <div className="snapshot-stat-val">{totalProblemsSolved}</div>
                  <div className="snapshot-stat-lbl">Coding Submissions</div>
                </div>
                <div className="activity-snapshot-card">
                  <div className="snapshot-icon-box icon-orange"><FaCalendarAlt /></div>
                  <div className="snapshot-stat-val">0</div>
                  <div className="snapshot-stat-lbl">Days in Platform</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─── CHANGE PASSWORD ─── */
          <div className="profile-info-card" style={{ maxWidth: '520px' }}>
            <h3 className="profile-card-section-title" style={{ marginBottom: '18px' }}>Change Password</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>Current Password</label>
                <input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>New Password</label>
                <input
                  type="password"
                  placeholder="Enter new password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>Confirm New Password</label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)' }}
                />
              </div>
              <button
                type="button"
                className="feature-cta-btn btn-green-solid"
                onClick={handleUpdatePassword}
                style={{ marginTop: '8px', width: 'auto', alignSelf: 'flex-start', padding: '10px 20px' }}
              >
                Update Password
              </button>
            </div>
          </div>
        )}

        {/* Absolute Floating Tooltip Card */}
        {hoveredDay && (
          <div style={{
            position: 'absolute',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            zIndex: 1000,
            transform: 'translate(-50%, -100%)',
            whiteSpace: 'nowrap'
          }}>
            <strong>{hoveredDay.dateStr}</strong>
            <div style={{ color: '#94a3b8', marginTop: '4px' }}>
              • Solved: {hoveredDay.dayInfo.problemsSolved} problems
              <br />
              • Portal Time: {formatUsageTime(hoveredDay.dayInfo.hours)}
            </div>
          </div>
        )}

        {/* Premium Upgrade & Status Modal */}
        {showPremiumModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '24px',
              maxWidth: '520px',
              width: '100%',
              padding: '32px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              color: 'var(--text-main)',
              position: 'relative'
            }}>
              <button
                type="button"
                onClick={() => setShowPremiumModal(false)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                
              </button>

              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.2))',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: '#f59e0b',
                  fontSize: '28px'
                }}>
                  <FaCrown />
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 8px 0' }}>
                  SEED-IT Premium Edition
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                  {isPremium ? 'Your student profile has active Premium Edition access.' : 'Unlock full academic & competitive coding features.'}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '20px' }}></span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px' }}>Unlimited AI Mock Interviews</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Real-time voice & coding feedback with Gemini AI</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '20px' }}></span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px' }}>AI Camera Proctoring Sandbox</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Anti-cheat detection with face monitoring</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '20px' }}></span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px' }}>Spoken English CEFR Evaluator</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pronunciation, grammar & fluency scorecard</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                {!isPremium ? (
                  <button
                    type="button"
                    onClick={() => {
                      const rawAuth = localStorage.getItem('auth_data');
                      if (rawAuth) {
                        try {
                          const parsed = JSON.parse(rawAuth);
                          parsed.Premium = true;
                          parsed.isPremium = true;
                          localStorage.setItem('auth_data', JSON.stringify(parsed));
                        } catch (e) { }
                      }
                      setUserPremiumState(true);
                      setShowPremiumModal(false);
                    }}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '15px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)'
                    }}
                  >
                     Activate Premium Edition Now
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPremiumModal(false)}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '15px',
                      cursor: 'pointer'
                    }}
                  >
                     Premium Access Active
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    );
  };

  const handleAddApiKey = async () => {
    if (!newKeyValue.trim()) return;
    const label = newKeyLabel.trim() || `${newKeyProvider === 'gemini' ? 'Gemini' : 'NVIDIA'} Key (${new Date().toLocaleDateString()})`;

    // Create new key object
    const newKey = {
      id: Date.now().toString(),
      type: newKeyProvider,
      label: label,
      value: newKeyValue.trim(),
      active: true // make active by default when added
    };

    // Set all other keys of this provider type to active = false
    const updatedKeys = apiKeysList.map(k => {
      if (k.type === newKeyProvider) {
        return { ...k, active: false };
      }
      return k;
    });

    updatedKeys.push(newKey);

    // Save to local state & local storage
    setApiKeysList(updatedKeys);
    localStorage.setItem('user_api_keys', JSON.stringify(updatedKeys));

    // Save to Firestore
    const userEmail = user?.email;
    if (userEmail) {
      try {
        await setDoc(doc(db, "userApiKeys", userEmail.trim()), {
          keys: updatedKeys,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (fsErr) {
        /* console.error("Error saving API keys to Firestore:", fsErr); */ void 0;
      }
    }

    // Reset inputs
    setNewKeyLabel('');
    setNewKeyValue('');
    setSaveSuccessMessage('API Key added successfully!');
    setTimeout(() => setSaveSuccessMessage(''), 3000);
  };

  const handleSetActiveApiKey = async (keyId, providerType) => {
    const updatedKeys = apiKeysList.map(k => {
      if (k.type === providerType) {
        return { ...k, active: k.id === keyId };
      }
      return k;
    });

    setApiKeysList(updatedKeys);
    localStorage.setItem('user_api_keys', JSON.stringify(updatedKeys));

    const userEmail = user?.email;
    if (userEmail) {
      try {
        await setDoc(doc(db, "userApiKeys", userEmail.trim()), {
          keys: updatedKeys,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (fsErr) {
        /* console.error("Error saving API keys to Firestore:", fsErr); */ void 0;
      }
    }
  };

  const handleDeleteApiKey = async (keyId) => {
    const updatedKeys = apiKeysList.filter(k => k.id !== keyId);

    // If the deleted key was active, make another key of that type active (if exists)
    const deletedKey = apiKeysList.find(k => k.id === keyId);
    if (deletedKey && deletedKey.active) {
      const remainingOfType = updatedKeys.filter(k => k.type === deletedKey.type);
      if (remainingOfType.length > 0) {
        remainingOfType[0].active = true;
      }
    }

    setApiKeysList(updatedKeys);
    localStorage.setItem('user_api_keys', JSON.stringify(updatedKeys));

    const userEmail = user?.email;
    if (userEmail) {
      try {
        await setDoc(doc(db, "userApiKeys", userEmail.trim()), {
          keys: updatedKeys,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (fsErr) {
        /* console.error("Error saving API keys to Firestore:", fsErr); */ void 0;
      }
    }
  };

  const renderSettings = () => {
    const allThemes = [
      {
        id: 'seed-seb',
        name: 'SEED-SEB Academic (Default)',
        desc: 'Clean, distraction-free examination theme with institutional SEED green accents.',
        colors: ['#f8fafc', '#ffffff', '#15803d']
      },
      {
        id: 'dark',
        name: 'Midnight Space (Dark)',
        desc: 'Futuristic slate theme with indigo highlights.',
        colors: ['#090d16', '#111827', '#6366f1']
      },
      {
        id: 'light',
        name: 'Classic Ice (Light)',
        desc: 'Sleek, high-contrast light mode for daytime coding.',
        colors: ['#f3f4f6', '#ffffff', '#4f46e5']
      },
      {
        id: 'crimson',
        name: 'Crimson Cyber (Red/Black)',
        desc: 'Pitch-black cyberpunk dashboard with blood-red accents.',
        colors: ['#0c0808', '#180f0f', '#ef4444']
      },
      {
        id: 'emerald',
        name: 'Emerald Matrix (Green/Black)',
        desc: 'Retro-terminal dark design with vibrant emerald highlights.',
        colors: ['#022c22', '#064e3b', '#10b981']
      },
      {
        id: 'red-light',
        name: 'Crimson Frost (Red/White)',
        desc: 'Clean, high-contrast light theme with rich red accents.',
        colors: ['#fdfafb', '#ffffff', '#dc2626']
      },
      {
        id: 'bw',
        name: 'Monochrome Minimalist (B&W)',
        desc: 'High-contrast, clean black & white theme.',
        colors: ['#ffffff', '#000000', '#000000']
      }
    ];

    const primaryColorOptions = [
      { id: 'green', color: '#10b981', name: 'Emerald Green' },
      { id: 'blue', color: '#3b82f6', name: 'Royal Blue' },
      { id: 'purple', color: '#8b5cf6', name: 'Amethyst Purple' },
      { id: 'orange', color: '#f97316', name: 'Sunset Orange' },
      { id: 'red', color: '#ef4444', name: 'Crimson Red' }
    ];

    const handleThemeChange = (themeId) => {
      localStorage.setItem('portal_theme', themeId);
      document.documentElement.setAttribute('data-theme', themeId);
      setCurrentTheme(themeId);
    };

    const handleColorChange = (colorId) => {
      localStorage.setItem('portal_primary_color', colorId);
      document.documentElement.setAttribute('data-color', colorId);
      setPrimaryColor(colorId);
    };

    const handleFontSizeChange = (size) => {
      localStorage.setItem('portal_font_size', size);
      document.documentElement.setAttribute('data-font-size', size);
      setFontSize(size);
    };

    const toggleSection = (sectionId) => {
      setExpandedSettingsSections(prev => ({
        ...prev,
        [sectionId]: !prev[sectionId]
      }));
    };

    return (
      <div className="settings-tab-content">
        <div className="home-welcome-header" style={{ marginBottom: '24px' }}>
          <h1 className="home-welcome-title">Portal Settings</h1>
          <p className="home-welcome-subtitle">Personalise your student workspace theme and interface appearance.</p>
        </div>

        <div className="settings-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '960px' }}>
          {/* Card 1: Workspace Appearance */}
          <div className="settings-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px' }}>
            <div className="settings-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <FaSun />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Workspace Appearance</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>Customise how the platform looks and feels for you.</p>
                </div>
              </div>
            </div>

            {/* Theme Mode row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Theme Mode</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Choose light or dark theme</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-primary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => handleThemeChange('seed-seb')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none',
                    background: (currentTheme === 'seed-seb' || currentTheme === 'light') ? 'var(--bg-secondary)' : 'transparent',
                    color: (currentTheme === 'seed-seb' || currentTheme === 'light') ? 'var(--text-main)' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: '12.5px', cursor: 'pointer',
                    boxShadow: (currentTheme === 'seed-seb' || currentTheme === 'light') ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <FaSun style={{ color: '#f59e0b' }} /> Light
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none',
                    background: (currentTheme === 'dark' || currentTheme === 'dim' || currentTheme === 'emerald') ? 'var(--bg-secondary)' : 'transparent',
                    color: (currentTheme === 'dark' || currentTheme === 'dim' || currentTheme === 'emerald') ? 'var(--text-main)' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: '12.5px', cursor: 'pointer',
                    boxShadow: (currentTheme === 'dark' || currentTheme === 'dim' || currentTheme === 'emerald') ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <FaMoon style={{ color: '#6366f1' }} /> Dark
                </button>
              </div>
            </div>

            {/* Themes Grid */}
            <div style={{ marginTop: '18px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Platform Themes (7 Themes)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>Select an optimized color palette designed for high productivity.</div>
              <div className="theme-options-grid">
                {allThemes.map(t => {
                  const active = currentTheme === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`theme-preview-card ${active ? 'active' : ''}`}
                      onClick={() => handleThemeChange(t.id)}
                    >
                      <div className="theme-card-top-row">
                        <span className="theme-name-text">{t.name}</span>
                        {active && <FaCheckCircle className="theme-check-icon" />}
                      </div>
                      <div className="theme-color-bubbles">
                        {t.colors.map((c, cIdx) => (
                          <div key={cIdx} className="theme-bubble" style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Primary Color Picker */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Primary Color</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Choose your preferred accent color</div>
              <div className="color-picker-row">
                {primaryColorOptions.map(p => (
                  <button
                    key={p.id}
                    className={`color-dot-btn ${primaryColor === p.id ? 'active' : ''}`}
                    style={{ background: p.color }}
                    onClick={() => handleColorChange(p.id)}
                    title={p.name}
                  >
                    {primaryColor === p.id && <FaCheck style={{ color: '#ffffff', fontSize: '12px' }} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size Selector */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Font Size</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Adjust the platform font size</div>
              <div className="font-size-group">
                <button
                  className={`font-size-btn ${fontSize === 'small' ? 'active' : ''}`}
                  onClick={() => handleFontSizeChange('small')}
                >
                  A- Small
                </button>
                <button
                  className={`font-size-btn ${fontSize === 'medium' ? 'active' : ''}`}
                  onClick={() => handleFontSizeChange('medium')}
                >
                  Medium
                </button>
                <button
                  className={`font-size-btn ${fontSize === 'large' ? 'active' : ''}`}
                  onClick={() => handleFontSizeChange('large')}
                >
                  A+ Large
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Notifications */}
          <div className="settings-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px' }}>
            <div className="settings-card-header" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                <FaBell />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Notifications</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>Manage how you receive important updates.</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Email Notifications</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Receive updates on assessments and results</div>
                </div>
                <label className="toggle-switch-wrapper">
                  <input
                    type="checkbox"
                    checked={emailNotifs}
                    onChange={e => setEmailNotifs(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Practice Reminders</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Get reminded about your daily practice goals</div>
                </div>
                <label className="toggle-switch-wrapper">
                  <input
                    type="checkbox"
                    checked={practiceReminders}
                    onChange={e => setPracticeReminders(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>Assessment Alerts</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Receive alerts for assessment deadlines</div>
                </div>
                <label className="toggle-switch-wrapper">
                  <input
                    type="checkbox"
                    checked={assessmentAlerts}
                    onChange={e => setAssessmentAlerts(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          {/* Card 3: AI - API Connection */}
          <div className="settings-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px' }}>
            <div className="settings-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#faf5ff', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <FaKey />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>AI - API Connection</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>Configure Google Gemini and NVIDIA NIM API keys for tutor acceleration.</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  background: apiKeysList.length > 0 ? '#ecfdf5' : '#f1f5f9',
                  color: apiKeysList.length > 0 ? '#10b981' : '#94a3b8',
                  border: `1px solid ${apiKeysList.length > 0 ? '#a7f3d0' : '#cbd5e1'}`,
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: '700'
                }}>
                  {apiKeysList.length > 0 ? `Configured (${apiKeysList.length})` : 'Not Configured'}
                </span>
                <button
                  className="feature-cta-btn btn-green-outline"
                  style={{ width: 'auto', padding: '6px 14px', fontSize: '12.5px' }}
                  onClick={() => toggleSection('aiApi')}
                >
                  Configure +
                </button>
              </div>
            </div>

            {/* Collapsible API Key Management Form */}
            {expandedSettingsSections.aiApi && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <button
                    onClick={() => setShowInstructionsModal(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <FaGraduationCap /> How to Get Keys?
                  </button>
                </div>

                {apiKeysList.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    {apiKeysList.map(k => (
                      <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ background: k.type === 'gemini' ? '#10b981' : '#6366f1', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700, textTransform: 'uppercase' }}>{k.type}</span>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>{k.label}</span>
                        </div>
                        <button onClick={() => handleDeleteApiKey(k.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><FaTimes /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <select value={newKeyProvider} onChange={e => setNewKeyProvider(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)', fontSize: '13px' }}>
                    <option value="gemini">Google Gemini</option>
                    <option value="nvidia">NVIDIA NIM</option>
                  </select>
                  <input type="text" placeholder="Key Label" value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)', fontSize: '13px' }} />
                  <input type="password" placeholder="API Key Value" value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} style={{ flex: 2, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-main)', fontSize: '13px' }} />
                  <button onClick={handleAddApiKey} className="feature-cta-btn btn-green-solid" style={{ width: 'auto', padding: '8px 16px' }}>Add</button>
                </div>
                {saveSuccessMessage && <p style={{ color: '#10b981', fontSize: '12px', marginTop: '6px' }}>{saveSuccessMessage}</p>}
              </div>
            )}
          </div>

          {/* Card 4: Privacy & Data */}
          <div className="settings-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px' }}>
            <div className="settings-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <FaShieldAlt />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Privacy & Data</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>Manage your data and account privacy.</p>
                </div>
              </div>

              <button className="feature-cta-btn btn-slate-outline" style={{ width: 'auto', padding: '8px 18px', fontSize: '13px' }}>
                Manage <FaChevronRight style={{ fontSize: '10px' }} />
              </button>
            </div>
          </div>
        </div>

        {/* SETUP INSTRUCTIONS MODAL */}
        {showInstructionsModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              background: 'var(--bg-secondary, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '32px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
              position: 'relative'
            }}>
              <button
                onClick={() => setShowInstructionsModal(false)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted, #94a3b8)',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                <FaTimes />
              </button>

              <h3 style={{ color: 'var(--text-main, #f1f5f9)', fontSize: '20px', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FaGraduationCap style={{ color: 'var(--accent-coding, #10b981)' }} /> How to Create API Keys
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <h4 style={{ color: 'var(--text-main, #cbd5e1)', fontSize: '15px', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> Google Gemini API Key
                  </h4>
                  <ol style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', paddingLeft: '20px', lineHeight: '1.6', margin: 0 }}>
                    <li>Go to <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-coding, #10b981)', textDecoration: 'underline' }}>Google AI Studio</a>.</li>
                    <li>Log in with your Google Account.</li>
                    <li>Click on the <strong>"Get API Key"</strong> button in the sidebar navigation.</li>
                    <li>Click <strong>"Create API Key"</strong>, choose a Google Cloud project (ensure the key has <strong>no expiration date</strong>), and copy your generated key.</li>
                  </ol>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color, #334155)', paddingTop: '20px' }}>
                  <h4 style={{ color: 'var(--text-main, #cbd5e1)', fontSize: '15px', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1' }} /> NVIDIA NIM API Key
                  </h4>
                  <ol style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', paddingLeft: '20px', lineHeight: '1.6', margin: 0 }}>
                    <li>Go to the <a href="https://build.nvidia.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-coding, #10b981)', textDecoration: 'underline' }}>NVIDIA Build Portal</a>.</li>
                    <li>Sign up or log in with your NVIDIA Developer account.</li>
                    <li>Select a model from the catalog (e.g. <strong>Llama 3.1 70B Instruct</strong>).</li>
                    <li>Click <strong>"Get API Key"</strong> to generate your token (ensure the key configuration has <strong>no expiration date</strong>), and click Copy. (Keys start with <code>nvapi-</code>).</li>
                  </ol>
                </div>
              </div>

              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                color: '#f59e0b',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '12.5px',
                marginTop: '20px',
                lineHeight: '1.4'
              }}>
                <strong>Crucial Note:</strong> When generating keys, please ensure you configure them with <strong>no expiration date</strong> (or unlimited validity) so that your coding sandbox connection remains continuous.
              </div>

              <button
                onClick={() => setShowInstructionsModal(false)}
                style={{
                  marginTop: '32px',
                  width: '100%',
                  background: 'var(--accent-coding, #10b981)',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                I Understand
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`dashboard-container ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Welcome Quote Verification Popup */}
      {showWelcomeModal && (
        <div className="lw-overlay" style={{ zIndex: 1500 }}>
          <div className="lw-card" style={{ maxWidth: '550px', padding: '30px', margin: '20px' }}>
            <div className="lw-card-header" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 className="lw-title" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-coding)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaStar style={{ color: 'var(--accent-coding)', fontSize: '18px' }} /> Welcome to SEED Portal
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
                Please type the exact quote of the day to close this window and enter the platform.
              </p>
            </div>
            <div className="lw-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px dashed var(--border-color)',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                fontStyle: 'italic',
                fontSize: '15px',
                fontWeight: '600',
                color: 'var(--text-main)',
                lineHeight: '1.5',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                "{welcomeQuote}"
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600' }}>
                  Verification Input:
                </label>
                <input
                  type="text"
                  className="lw-input"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Type the exact quote..."
                  value={welcomeInput}
                  onChange={e => setWelcomeInput(e.target.value)}
                  onPaste={e => e.preventDefault()}
                />
              </div>
            </div>
            <div className="lw-card-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={handleSkipWelcomeModal}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  transition: 'all 0.2s ease'
                }}
              >
                Skip
              </button>
              <button
                className="lw-btn-primary"
                disabled={welcomeInput.trim() !== welcomeQuote.trim()}
                onClick={handleCloseWelcomeModal}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  cursor: welcomeInput.trim() === welcomeQuote.trim() ? 'pointer' : 'not-allowed',
                  opacity: welcomeInput.trim() === welcomeQuote.trim() ? 1 : 0.5
                }}
              >
                Proceed to Portal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Platform Updates & Announcements Follow-up Modal */}
      {showUpdatesModal && welcomeUpdates && (
        <div className="lw-overlay" style={{ zIndex: 1500 }}>
          <div className="lw-card" style={{ maxWidth: '550px', padding: '30px', margin: '20px' }}>
            <div className="lw-card-header" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 className="lw-title" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-coding)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaAward style={{ color: 'var(--accent-coding)', fontSize: '18px' }} /> Platform Updates & News
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
                Stay up to date with the latest features, releases, and platform notifications.
              </p>
            </div>
            <div className="lw-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {Array.isArray(welcomeUpdates) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {welcomeUpdates.map((update, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      gap: '12px',
                      padding: '12px 16px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      alignItems: 'flex-start'
                    }}>
                      <FaStar style={{ fontSize: '14px', color: 'var(--accent-coding)', marginTop: '2px' }} />
                      <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.4', flex: 1 }}>
                        {update}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '16px 20px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  alignItems: 'flex-start'
                }}>
                  <FaStar style={{ fontSize: '16px', color: 'var(--accent-coding)', marginTop: '2px' }} />
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.5', flex: 1 }}>
                    {welcomeUpdates}
                  </p>
                </div>
              )}
            </div>
            <div className="lw-card-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="lw-btn-primary"
                onClick={() => setShowUpdatesModal(false)}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Close & Enter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          UNIFIED STREAMLINED ASSESSMENT LAUNCH MODAL
      ═══════════════════════════════════════════════════════════ */}
      {launchStep === 'modal' && selectedAssessment && (
        <div className="lw-overlay" style={{ zIndex: 1200 }}>
          <div className="lw-card" style={{ maxWidth: '680px', width: '100%', borderRadius: '20px', overflow: 'hidden' }}>
            {/* Header with Title & Metadata */}
            <div className="lw-card-header" style={{ padding: '22px 28px', background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="lw-step-badge" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '11px' }}>
                  {selectedAssessment.type?.toUpperCase() || 'ASSESSMENT'}
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FaClock style={{ color: '#818cf8' }} /> {selectedAssessment.duration} Mins
                  </span>
                  {selectedAssessment.proctored && (
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '4px 10px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FaShieldAlt /> Monitored
                    </span>
                  )}
                </div>
              </div>
              <h3 className="lw-title" style={{ fontSize: '1.4rem', margin: '4px 0 0 0' }}>
                {selectedAssessment.name}
              </h3>
            </div>

            <div className="lw-card-body" style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Access Passkey (if mandatory) */}
              {selectedAssessment.passkey ? (
                <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '14px', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <FaLock style={{ color: '#818cf8', fontSize: '15px' }} />
                    <span style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-main)' }}>Access Passkey</span>
                    <span style={{ fontSize: '11px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>Mandatory</span>
                  </div>
                  <input
                    type="password"
                    ref={passkeyInputRef}
                    placeholder="Enter instructor passkey to unlock..."
                    value={passkeyInput}
                    onChange={e => {
                      setPasskeyInput(e.target.value);
                      if (passkeyError) setPasskeyError("");
                    }}
                    onKeyDown={e => e.key === 'Enter' && handleUnifiedLaunch()}
                    className="lw-input"
                    style={{ padding: '12px 16px', fontSize: '1.05rem', borderRadius: '10px' }}
                    disabled={isLaunching}
                  />
                  {passkeyError && (
                    <div className="lw-error-row" style={{ marginTop: '10px', padding: '8px 14px', fontSize: '0.88rem' }}>
                      <FaExclamationTriangle /> {passkeyError}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Instant System Status Badges */}
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: '8px' }}>
                  System Status
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  {/* Internet */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '8px 12px' }}>
                    <FaWifi style={{ color: preflightResults.internet === 'pass' ? '#10b981' : '#ef4444' }} />
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '500' }}>Internet</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: '700', color: preflightResults.internet === 'pass' ? '#10b981' : '#ef4444' }}>
                      {preflightResults.internet === 'pass' ? 'Active' : 'Offline'}
                    </span>
                  </div>

                  {/* Camera / Mic (if proctored) */}
                  {selectedAssessment.proctored && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '8px 12px' }}>
                      <FaCamera style={{ color: preflightResults.webcam === 'pass' ? '#10b981' : '#f59e0b' }} />
                      <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '500' }}>Camera</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: '700', color: preflightResults.webcam === 'pass' ? '#10b981' : '#f59e0b' }}>
                        {preflightResults.webcam === 'pass' ? 'Ready' : 'Checking'}
                      </span>
                    </div>
                  )}

                  {/* Secure Sandbox */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '8px 12px' }}>
                    <FaShieldAlt style={{ color: '#10b981' }} />
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '500' }}>Secure Shell</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: '700', color: '#10b981' }}>Enforced</span>
                  </div>
                </div>
              </div>

              {/* Assessment Section Breakdown (if MSA) */}
              {selectedAssessment.isMultiSection && selectedAssessment.sections?.length > 0 && (
                <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', marginBottom: '8px' }}>
                    Sections Breakdown ({selectedAssessment.sections.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                    {selectedAssessment.sections.map((sec, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                        <span style={{ color: '#f1f5f9', fontWeight: '600' }}>{idx + 1}. {sec.name}</span>
                        <span style={{ color: '#94a3b8' }}>{sec.duration_minutes || sec.duration || 0} Mins</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Essential Rules */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '12px 16px' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f59e0b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FaExclamationTriangle /> Important Guidelines
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.84rem', color: '#94a3b8', lineHeight: '1.5' }}>
                  <li>Fullscreen mode is enforced. Tab switching and window exits are strictly tracked.</li>
                  <li>The assessment timer runs continuously and will auto-submit when time expires.</li>
                  <li>This is a single-attempt session. Ensure your power adapter is plugged in.</li>
                </ul>
              </div>

            </div>

            {/* Footer Actions */}
            <div className="lw-card-footer" style={{ padding: '16px 28px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="lw-btn-secondary"
                onClick={cancelWizard}
                disabled={isLaunching}
                style={{ padding: '10px 20px', fontSize: '0.92rem', borderRadius: '10px' }}
              >
                Cancel
              </button>
              <button
                className="lw-btn-primary"
                onClick={handleUnifiedLaunch}
                disabled={isLaunching}
                style={{
                  padding: '12px 28px',
                  fontSize: '1rem',
                  fontWeight: '700',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: isLaunching ? 'not-allowed' : 'pointer'
                }}
              >
                {isLaunching ? (
                  <>
                    <span className="lw-mini-spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></span>
                    Starting Assessment...
                  </>
                ) : (
                  <>
                    <FaCheck /> Start Assessment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Eligibility / connection error modal */}
      {eligibilityError && (
        <div className="lw-overlay" style={{ zIndex: 1300 }}>
          <div className="lw-card" style={{ maxWidth: '440px' }}>
            <div className="lw-card-header" style={{ borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
              <h3 className="lw-title" style={{ color: '#ef4444' }}>
                <FaExclamationTriangle style={{ marginRight: '8px' }} />{eligibilityError.title}
              </h3>
            </div>
            <div className="lw-card-body">
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: '1.6' }}>{eligibilityError.message}</p>
            </div>
            <div className="lw-card-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                className="lw-btn-primary"
                style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}
                onClick={() => setEligibilityError(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="dashboard-header">
        <div className="header-left">
          <button className="sidebar-toggle-btn" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle Sidebar">
            <FaBars />
          </button>
          <div className="header-brand" onClick={() => setActiveTab('dashboard')} style={{ cursor: 'pointer' }}>
            <img
              src="/SEED_Logo_Transparent.png"
              alt="SEED Logo"
              className="brand-logo-img"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/SEED_Logo.png';
              }}
            />
            <div>
              <div className="brand-title">SEED <span>SEB</span></div>
              <span className="brand-subtitle-badge">Practice Platform</span>
            </div>
          </div>
        </div>

        <div className="header-center-search">
          <FaSearch className="header-search-icon" />
          <input
            type="text"
            placeholder="Search assessments, topics, courses..."
            className="header-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="header-search-shortcut-badge">⌘K</span>
        </div>

        <div className="header-right-actions">
          <button className="header-action-icon-btn" title="Notifications">
            <FaBell />
            <span className="header-notif-count-badge">3</span>
          </button>
          <button className="header-action-icon-btn" title="Settings" onClick={() => setActiveTab('settings')}>
            <FaCog />
          </button>
          <div className="header-user-avatar-pill" onClick={() => setActiveTab('profile')}>
            <div className="header-user-avatar-circle">
              {name.charAt(0).toUpperCase()}
            </div>
            <span className="header-user-name-text">{name.toUpperCase()}</span>
            <FaChevronDown style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '2px' }} />
          </div>
        </div>
      </header>

      {/* Workspace Body */}
      <div className="dashboard-body">
        {/* Sidebar Navigation */}
        <aside className={`dashboard-sidebar ${collapsed ? "collapsed" : ""}`}>
          <div className="sidebar-top-scrollable">
            <nav className="sidebar-nav-group">
              <button
                className={`sidebar-nav-pill ${activeTab === "dashboard" ? "active" : ""}`}
                onClick={() => setActiveTab("dashboard")}
              >
                <FaThLarge />
                {!collapsed && <span>Dashboard</span>}
              </button>
              <button
                className={`sidebar-nav-pill ${activeTab === "assessments" ? "active" : ""}`}
                onClick={() => setActiveTab("assessments")}
              >
                <FaClipboardList />
                {!collapsed && <span>Assessments</span>}
              </button>
              <button
                className={`sidebar-nav-pill ${activeTab === "practice" ? "active" : ""}`}
                onClick={() => {
                  setPracticeInitialTab('bank');
                  setPracticeInitialCourse(null);
                  setActiveTab("practice");
                }}
              >
                <FaLaptopCode />
                {!collapsed && <span>Practice</span>}
              </button>
              <button
                className={`sidebar-nav-pill ${activeTab === "profile" ? "active" : ""}`}
                onClick={() => setActiveTab("profile")}
              >
                <FaUser />
                {!collapsed && <span>Profile</span>}
              </button>
              {isAiInterviewAllowed && (
                <button
                  className={`sidebar-nav-pill ${activeTab === "ai-interview" ? "active" : ""}`}
                  onClick={() => setActiveTab("ai-interview")}
                >
                  <FaUserTie />
                  {!collapsed && <span>AI Interview</span>}
                </button>
              )}
              <button
                className={`sidebar-nav-pill ${activeTab === "settings" ? "active" : ""}`}
                onClick={() => setActiveTab("settings")}
              >
                <FaCog />
                {!collapsed && <span>Settings</span>}
              </button>
            </nav>

            {!collapsed && (
              <div className="sidebar-widgets-section">
                {/* ── 1. SEED Credits Card ── */}
                <div
                  className="sidebar-credits-card"
                  onClick={() => toast.info('SEED Credits: Earn credits by practicing problems and completing daily goals!')}
                  title="SEED Credits balance"
                >
                  <div className="credits-icon-box">
                    <div className="gold-coin-circle">S</div>
                  </div>
                  <div className="credits-info-col">
                    <span className="credits-card-title">SEED Credits</span>
                    <span className="credits-card-val">{(seedCredits || 2450).toLocaleString()}</span>
                    <span className="credits-daily-badge">+{todayCreditsGained || 120} today</span>
                  </div>
                  <FaChevronRight className="credits-arrow-icon" />
                </div>

                {/* ── 2. Today's Goal Card (Automated 3 Regular Tasks) ── */}
                <div className="sidebar-goals-card">
                  <div className="goals-card-header">
                    <span className="goals-title">Today's Goal</span>
                    <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>Automated</span>
                  </div>

                  <div className="goals-progress-summary">
                    <div className="goals-mini-ring">
                      <svg viewBox="0 0 36 36" className="goals-ring-svg">
                        <path
                          className="goals-ring-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="goals-ring-fill"
                          strokeDasharray={`${Math.round(((dailyGoals.filter(g => g.completed).length) / (dailyGoals.length || 3)) * 100)}, 100`}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <span className="goals-ring-text">
                        {dailyGoals.filter(g => g.completed).length}/{dailyGoals.length || 3}
                      </span>
                    </div>
                    <div className="goals-progress-text">
                      <span className="goals-completed-label">
                        {dailyGoals.filter(g => g.completed).length}/{dailyGoals.length || 3}
                      </span>
                      <span className="goals-sub-label">Goals Completed</span>
                    </div>
                  </div>

                  <div className="goals-items-list">
                    {dailyGoals.map((goal, idx) => (
                      <div
                        key={goal.id || idx}
                        className={`goal-checkbox-row ${goal.completed ? 'completed' : ''}`}
                        onClick={() => {
                          if (goal.completed) {
                            toast.success(`✓ "${goal.title}" is completed for today!`);
                          } else {
                            toast.info(`"${goal.title}" progress: ${goal.current || 0}/${goal.target || 1}. Complete it in Practice Bank!`);
                            setPracticeInitialTab('bank');
                            setPracticeInitialCourse(null);
                            setActiveTab('practice');
                          }
                        }}
                        title={goal.completed ? 'Goal completed today' : `Automated goal (${goal.current || 0}/${goal.target || 1}) — click to practice`}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={`goal-check-circle ${goal.completed ? 'checked' : ''}`}>
                          {goal.completed ? <FaCheck /> : null}
                        </div>
                        <span className="goal-item-label">{goal.title} {goal.displayProgress ?? ''}</span>
                      </div>
                    ))}
                  </div>

                  {dailyGoals.length > 0 && dailyGoals.every(g => g.completed) && (
                    <div className="streak-approved-badge">
                      <FaFire style={{ color: '#f59e0b' }} /> Streak Approved for Today!
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="sidebar-bottom-group">
            <button className="sidebar-logout-pill" onClick={handleLogout}>
              <FaSignOutAlt />
              {!collapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        <main className="dashboard-main">
          {activeTab === "dashboard" ? renderDashboardHome() :
           activeTab === "assessments" ? renderAssessments() :
           activeTab === "practice" ? <PracticeHome initialTab={practiceInitialTab} initialCourse={practiceInitialCourse} /> :
           activeTab === "settings" ? renderSettings() :
           activeTab === "ai-interview" ? <AIInterviewSimulator user={user} /> :
           renderProfile()}
        </main>
      </div>

      {/* Logout animation screen */}
      {showLogoutAnimation && (
        <div className="logout-overlay-screen">
          <div className="logout-modal-box">
            <FaSignOutAlt className="logout-spin-icon" />
            <p>Goodbye, {name}!</p>
            <p className="sub-text">Clearing session and logging out...</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>&copy; {new Date().getFullYear()} SEED Innovating Technologies and Educational Services (SEED-IT). (v{APP_VERSION})</p>
      </footer>
    </div>
  );
};

export default StudentDashboard;
