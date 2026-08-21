/**
 * codingProgressService.js
 *
 * Local Storage First service for tracking student practice progress,
 * with sync hooks to Firebase Firestore for cross-device persistence.
 *
 * Schema: codingProgress/{uid}
 * {
 *   completedQuestions: string[],    // Array of completed / solved question IDs
 *   attemptedQuestions: string[],    // Array of attempted question IDs
 *   solvedProblems: string[],        // Backward compatibility mirror of completedQuestions
 *   solvedCount: number,             // Total completed count
 *   attemptedCount: number,          // Total attempted count
 *   cacheId: number,                 // Monotonically incrementing cache sequence ID
 *   problemDetails: {
 *     [questionId]: {
 *       status: 'SOLVED' | 'ATTEMPTED' | 'IN_PROGRESS',
 *       language: string,
 *       attempts: number,
 *       bestScore: number,
 *       lastSolvedAt?: string,
 *       lastAttemptedAt?: string,
 *       totalTimeMs?: number
 *     }
 *   },
 *   activity: { [dateStr]: { hours: number, problemsSolved: number } },
 *   activityByDate: { [dateStr]: { questionsAttempted: number, timeSpentMs: number } },
 *   sheetSolvedDicts: { [sheetId]: { [problemId]: boolean } },
 *   updatedAt: string
 * }
 */

import { db } from '../firebase-config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import desktopBridge from '../utils/desktopBridge';

const COLLECTION = 'codingProgress';

// Helper: Resolve effective UID
const resolveEffectiveUid = (uid) => {
  if (uid && typeof uid === 'string' && uid.trim() !== '') return uid.trim();
  try {
    const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
    if (authData.uid) return authData.uid;
    if (authData.UID) return authData.UID;
    if (authData.userId) return authData.userId;
    if (authData.Email) return authData.Email.replace(/[@.]/g, '_');
  } catch (_) {}
  return '';
};

// Helper: Standardize local progress structure
const normalizeProgressStructure = (rawObj) => {
  const parsed = rawObj && typeof rawObj === 'object' ? rawObj : {};
  
  // Normalize completed/solved list
  const solved = Array.isArray(parsed.completedQuestions) 
    ? parsed.completedQuestions 
    : (Array.isArray(parsed.solvedProblems) ? parsed.solvedProblems : []);
  const uniqueSolved = [...new Set(solved.map(String))].filter(Boolean);

  // Normalize attempted list
  const attempted = Array.isArray(parsed.attemptedQuestions) 
    ? parsed.attemptedQuestions 
    : [];
  // Exclude solved from attempted
  const uniqueAttempted = [...new Set(attempted.map(String))].filter(id => id && !uniqueSolved.includes(id));

  const details = parsed.problemDetails || {};
  const cacheId = Number(parsed.cacheId) || 1;

  return {
    completedQuestions: uniqueSolved,
    solvedProblems: uniqueSolved, // backward compatibility
    attemptedQuestions: uniqueAttempted,
    solvedCount: uniqueSolved.length,
    attemptedCount: uniqueAttempted.length,
    cacheId,
    problemDetails: details,
    activity: parsed.activity || {},
    activityByDate: parsed.activityByDate || {},
    sheetSolvedDicts: parsed.sheetSolvedDicts || {},
    updatedAt: parsed.updatedAt || new Date().toISOString()
  };
};

// Helper: Get local progress structure
const getLocalProgress = (uid) => {
  const effectiveUid = resolveEffectiveUid(uid);
  if (!effectiveUid) return normalizeProgressStructure({});
  try {
    let raw = localStorage.getItem(`practice_progress_${effectiveUid}`);
    if (!raw && uid && uid !== effectiveUid) {
      raw = localStorage.getItem(`practice_progress_${uid}`);
    }
    if (!raw) return normalizeProgressStructure({});
    const parsed = JSON.parse(raw);
    return normalizeProgressStructure(parsed);
  } catch (_) {
    return normalizeProgressStructure({});
  }
};

// Helper: Save local progress structure with incrementing cacheId
const saveLocalProgress = (uid, progress) => {
  const effectiveUid = resolveEffectiveUid(uid);
  if (!effectiveUid) return;

  // Bump cacheId and update summary counts
  progress.cacheId = (Number(progress.cacheId) || 0) + 1;
  progress.solvedCount = (progress.completedQuestions || []).length;
  progress.attemptedCount = (progress.attemptedQuestions || []).length;
  progress.updatedAt = new Date().toISOString();

  const serialized = JSON.stringify(progress);
  localStorage.setItem(`practice_progress_${effectiveUid}`, serialized);
  if (uid && uid !== effectiveUid) {
    localStorage.setItem(`practice_progress_${uid}`, serialized);
  }

  // Persist to local disk under user_profile/{uid}/daily_activity.json
  try {
    desktopBridge.saveUserProfileCache(effectiveUid, 'daily_activity', progress);
  } catch (_) {}

  // Broadcast change event to dashboard & other tabs in the window
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('coding_progress_updated', {
      detail: { uid: effectiveUid, progress }
    }));
  }
};

// ── Read Operations ────────────────────────────────────────────────────────────

/**
 * Get completed / solved question IDs from Local Storage.
 */
export const getCompletedQuestionIds = async (uid) => {
  const local = getLocalProgress(uid);
  return local.completedQuestions;
};

/**
 * Backward-compatible alias for getCompletedQuestionIds.
 */
export const getSolvedQuestionIds = async (uid) => {
  const local = getLocalProgress(uid);
  return local.completedQuestions;
};

/**
 * Get attempted question IDs from Local Storage.
 */
export const getAttemptedQuestionIds = async (uid) => {
  const local = getLocalProgress(uid);
  return local.attemptedQuestions;
};

/**
 * Get full progress from Local Storage or disk user_profile cache.
 */
export const getFullProgress = async (uid) => {
  return await loadPersistedUserActivity(uid);
};

/**
 * Load persisted user daily activity & coding progress from:
 * 1. Local memory / localStorage
 * 2. Disk user_profile/{uid}/daily_activity.json
 * 3. Remote Firebase Firestore (if online and cache miss)
 */
export const loadPersistedUserActivity = async (uid) => {
  const effectiveUid = resolveEffectiveUid(uid);
  if (!effectiveUid) return normalizeProgressStructure({});

  // 1. Check in-memory / localStorage first
  const local = getLocalProgress(effectiveUid);
  if ((local.completedQuestions && local.completedQuestions.length > 0) || (local.activityByDate && Object.keys(local.activityByDate).length > 0)) {
    return local;
  }

  // 2. Check local disk cache in user_profile/{uid}/daily_activity.json
  try {
    const diskCache = await desktopBridge.loadUserProfileCache(effectiveUid, 'daily_activity');
    if (diskCache && typeof diskCache === 'object') {
      const normalized = normalizeProgressStructure(diskCache);
      saveLocalProgress(effectiveUid, normalized);
      return normalized;
    }
  } catch (_) {}

  // 3. Fallback to Firebase sync
  if (navigator.onLine) {
    try {
      const res = await syncProgressWithFirebase(effectiveUid);
      if (res?.progress) return res.progress;
    } catch (_) {}
  }

  return local;
};

/**
 * Get quick summary stats (solvedCount, attemptedCount, cacheId).
 */
export const getProgressSummary = async (uid) => {
  const local = getLocalProgress(uid);
  return {
    solvedCount: local.solvedCount,
    attemptedCount: local.attemptedCount,
    completedQuestions: local.completedQuestions,
    attemptedQuestions: local.attemptedQuestions,
    cacheId: local.cacheId,
    updatedAt: local.updatedAt
  };
};

/**
 * Get the current incrementing cacheId.
 */
export const getCacheId = (uid) => {
  const local = getLocalProgress(uid);
  return local.cacheId;
};

/**
 * Get question-specific progress from Local Storage.
 */
export const getQuestionProgress = async (uid, questionId) => {
  const local = getLocalProgress(uid);
  return local.problemDetails[questionId] || null;
};

// ── Write Operations ───────────────────────────────────────────────────────────

/**
 * Mark a question as solved / completed.
 */
export const markQuestionSolved = async (uid, questionId, language, score, attempts = 1, metadata = {}) => {
  if (!uid || !questionId) return { success: false };
  
  const strQId = String(questionId).trim();
  const local = getLocalProgress(uid);
  const existing = local.problemDetails[strQId];
  const now = new Date().toISOString();

  const meta = (typeof attempts === 'object' && attempts !== null) ? attempts : (metadata || {});
  const numAttempts = typeof attempts === 'number' ? attempts : (typeof attempts === 'string' && !isNaN(attempts) ? Number(attempts) : 1);

  const detail = {
    status: 'SOLVED',
    language: language || existing?.language || 'cpp',
    difficulty: meta.difficulty || existing?.difficulty || (strQId.startsWith('Q0.') ? 'Easy' : 'Easy'),
    category: meta.category || (existing?.category  ?? ''),
    title: meta.title || meta.name || existing?.title || strQId,
    attempts: (existing?.attempts || 0) + numAttempts,
    bestScore: Math.max(typeof score === 'number' ? score : 100, existing?.bestScore || 0),
    lastSolvedAt: now,
    lastAttemptedAt: now
  };

  local.problemDetails[strQId] = detail;
  
  // Add to completedQuestions / solvedProblems
  if (!local.completedQuestions.includes(strQId)) {
    local.completedQuestions.push(strQId);
  }
  local.solvedProblems = local.completedQuestions;

  // Remove from attemptedQuestions since it's now completed
  local.attemptedQuestions = local.attemptedQuestions.filter(id => id !== strQId);
  
  // Track activity solved count
  if (!local.activity) local.activity = {};
  const today = now.split('T')[0];
  if (!local.activity[today]) {
    local.activity[today] = { hours: 0, problemsSolved: 0 };
  }
  local.activity[today].problemsSolved += 1;

  saveLocalProgress(uid, local);
  console.log(`[CodingProgressService] ${strQId} marked as SOLVED (cacheId: ${local.cacheId})`);

  // Log activity to userActivities/{uid}/
  import('./activityLoggerService').then(mod => {
    mod.logUserActivity(uid, 'QUESTION_SOLVED', { questionId: strQId, language, score, attempts: numAttempts });
  }).catch(() => {});

  // Background sync with Firestore if online
  if (navigator.onLine) {
    try {
      const docRef = doc(db, COLLECTION, uid);
      await setDoc(docRef, local, { merge: true });
    } catch (e) {
      console.warn('[CodingProgressService] Background sync failed (will sync later):', e.message);
    }
  }

  return { success: true, progress: local };
};

/**
 * Mark a question as attempted / in-progress.
 */
export const markQuestionAttempted = async (uid, questionId, language, score, attempts = 1, metadata = {}) => {
  if (!uid || !questionId) return { success: false };
  
  const strQId = String(questionId).trim();
  const local = getLocalProgress(uid);
  const existing = local.problemDetails[strQId];
  const now = new Date().toISOString();

  const meta = (typeof attempts === 'object' && attempts !== null) ? attempts : (metadata || {});
  const numAttempts = typeof attempts === 'number' ? attempts : 1;

  const isAlreadySolved = local.completedQuestions.includes(strQId) || existing?.status === 'SOLVED';

  const detail = {
    status: isAlreadySolved ? 'SOLVED' : 'ATTEMPTED',
    language: language || existing?.language || 'cpp',
    difficulty: meta.difficulty || existing?.difficulty || (strQId.startsWith('Q0.') ? 'Easy' : 'Easy'),
    category: meta.category || (existing?.category  ?? ''),
    title: meta.title || meta.name || existing?.title || strQId,
    attempts: (existing?.attempts || 0) + numAttempts,
    bestScore: Math.max(typeof score === 'number' ? score : 0, existing?.bestScore || 0),
    lastAttemptedAt: now,
    lastSolvedAt: existing?.lastSolvedAt || (isAlreadySolved ? now : undefined)
  };

  local.problemDetails[strQId] = detail;

  // If not already completed, add to attemptedQuestions
  if (!isAlreadySolved && !local.attemptedQuestions.includes(strQId)) {
    local.attemptedQuestions.push(strQId);
  }

  saveLocalProgress(uid, local);

  // Log activity to userActivities/{uid}/
  import('./activityLoggerService').then(mod => {
    mod.logUserActivity(uid, 'QUESTION_ATTEMPT', { questionId: strQId, language, score });
  }).catch(() => {});

  // Background sync with Firestore if online
  if (navigator.onLine) {
    try {
      const docRef = doc(db, COLLECTION, uid);
      await setDoc(docRef, local, { merge: true });
    } catch (e) {
      console.warn('[CodingProgressService] Background sync failed:', e.message);
    }
  }

  return { success: true, progress: local };
};

/**
 * Track time spent on a specific question (accumulated across sessions).
 */
export const trackQuestionTimeSpent = async (uid, questionId, timeSpentMs) => {
  if (!uid || !questionId || !timeSpentMs || timeSpentMs <= 0) return;
  const strQId = String(questionId).trim();
  const local = getLocalProgress(uid);
  const existing = local.problemDetails[strQId] || {};
  local.problemDetails[strQId] = {
    ...existing,
    totalTimeMs: (existing.totalTimeMs || 0) + timeSpentMs,
  };
  saveLocalProgress(uid, local);

  // Background sync
  if (navigator.onLine) {
    try {
      await setDoc(doc(db, COLLECTION, uid), local, { merge: true });
    } catch (_) {}
  }
};

/**
 * Record daily practice activity — questions attempted and time spent today.
 */
export const trackDailyActivity = async (uid, delta = {}) => {
  if (!uid) return;
  const local = getLocalProgress(uid);
  if (!local.activityByDate) local.activityByDate = {};
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const existing = local.activityByDate[today] || { questionsAttempted: 0, timeSpentMs: 0 };
  local.activityByDate[today] = {
    questionsAttempted: (existing.questionsAttempted || 0) + (delta.questionsAttempted || 0),
    timeSpentMs:        (existing.timeSpentMs || 0)        + (delta.timeSpentMs || 0),
  };
  // Also update legacy activity map (hours) for backward compat with heatmap
  if (!local.activity) local.activity = {};
  if (!local.activity[today]) local.activity[today] = { hours: 0, problemsSolved: 0 };
  local.activity[today].hours = Math.min(
    24,
    (local.activity[today].hours || 0) + (delta.timeSpentMs || 0) / 3_600_000
  );
  saveLocalProgress(uid, local);
  if (navigator.onLine) {
    try {
      await setDoc(doc(db, COLLECTION, uid), local, { merge: true });
    } catch (_) {}
  }
};

// ── Sync Operations ────────────────────────────────────────────────────────────

/**
 * Synchronize Local Storage progress with Firebase Firestore.
 * Merges both copies taking the union of completed and attempted questions.
 */
export const syncProgressWithFirebase = async (uid) => {
  if (!uid) return { success: false, error: 'No user ID' };
  if (!navigator.onLine) return { success: false, error: 'Device is offline' };

  try {
    const docRef = doc(db, COLLECTION, uid);
    const docSnap = await getDoc(docRef);

    const local = getLocalProgress(uid);

    // ── Legacy migration (idempotent) ───────────────────────────────────────
    let remote = docSnap.exists() ? docSnap.data() : { completedQuestions: [], solvedProblems: [], problemDetails: {} };
    if (!docSnap.exists() || !((remote.completedQuestions?.length > 0) || (remote.solvedProblems?.length > 0))) {
      try {
        const { auth } = await import('../firebase-config');
        const email = auth.currentUser?.email;
        if (email) {
          const legacyKey = email.replace(/[@.]/g, '_');
          const legacyCandidates = [email, legacyKey];
          for (const candidate of legacyCandidates) {
            if (candidate === uid) continue;
            try {
              const legacySnap = await getDoc(doc(db, COLLECTION, candidate));
              if (legacySnap.exists()) {
                const legacyData = legacySnap.data();
                console.log('[CodingProgressService] Migrating legacy email-based progress:', candidate, '->', uid);
                remote = {
                  completedQuestions: [...new Set([
                    ...(legacyData.completedQuestions || legacyData.solvedProblems || []),
                    ...(remote.completedQuestions || remote.solvedProblems || []),
                  ])],
                  attemptedQuestions: [...new Set([
                    ...(legacyData.attemptedQuestions || []),
                    ...(remote.attemptedQuestions || []),
                  ])],
                  solvedProblems: [...new Set([
                    ...(legacyData.solvedProblems || legacyData.completedQuestions || []),
                    ...(remote.solvedProblems || remote.completedQuestions || []),
                  ])],
                  problemDetails: { ...(legacyData.problemDetails || {}), ...(remote.problemDetails || {}) },
                  activity: { ...(legacyData.activity || {}), ...(remote.activity || {}) },
                  sheetSolvedDicts: { ...(legacyData.sheetSolvedDicts || {}), ...(remote.sheetSolvedDicts || {}) },
                };
                break;
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    // Merge completedQuestions / solvedProblems
    const remoteSolved = remote.completedQuestions || remote.solvedProblems || [];
    const mergedSolved = [...new Set([...(local.completedQuestions || []), ...remoteSolved])];

    // Merge attemptedQuestions (exclude completed)
    const remoteAttempted = remote.attemptedQuestions || [];
    const mergedAttempted = [...new Set([...(local.attemptedQuestions || []), ...remoteAttempted])]
      .filter(id => !mergedSolved.includes(id));

    // Merge problemDetails taking highest attempts and best score
    const mergedDetails = { ...(remote.problemDetails || {}), ...(local.problemDetails || {}) };
    const allKeys = new Set([...Object.keys(local.problemDetails || {}), ...Object.keys(remote.problemDetails || {})]);
    for (const key of allKeys) {
      const lDet = local.problemDetails?.[key];
      const rDet = remote.problemDetails?.[key];

      if (lDet && rDet) {
        const isSolved = lDet.status === 'SOLVED' || rDet.status === 'SOLVED' || mergedSolved.includes(key);
        mergedDetails[key] = {
          status: isSolved ? 'SOLVED' : 'ATTEMPTED',
          language: lDet.bestScore >= (rDet.bestScore || 0) ? lDet.language : (rDet.language || lDet.language),
          attempts: Math.max(lDet.attempts || 1, rDet.attempts || 1),
          bestScore: Math.max(lDet.bestScore || 0, rDet.bestScore || 0),
          lastSolvedAt: lDet.lastSolvedAt || rDet.lastSolvedAt,
          lastAttemptedAt: lDet.lastAttemptedAt || rDet.lastAttemptedAt
        };
      }
    }

    // Merge activity maps
    const localActivity = local.activity || {};
    const remoteActivity = remote.activity || {};
    const mergedActivity = { ...remoteActivity, ...localActivity };
    const activityDates = new Set([...Object.keys(localActivity), ...Object.keys(remoteActivity)]);
    for (const date of activityDates) {
      const lAct = localActivity[date] || { hours: 0, problemsSolved: 0 };
      const rAct = remoteActivity[date] || { hours: 0, problemsSolved: 0 };
      mergedActivity[date] = {
        hours: Math.max(lAct.hours || 0, rAct.hours || 0),
        problemsSolved: Math.max(lAct.problemsSolved || 0, rAct.problemsSolved || 0)
      };
    }

    // Merge sheetSolvedDicts
    const localSheets = local.sheetSolvedDicts || {};
    const remoteSheets = remote.sheetSolvedDicts || {};
    const mergedSheets = { ...remoteSheets, ...localSheets };
    const allSheetKeys = new Set([...Object.keys(localSheets), ...Object.keys(remoteSheets)]);
    for (const sheetId of allSheetKeys) {
      mergedSheets[sheetId] = { ...(remoteSheets[sheetId] || {}), ...(localSheets[sheetId] || {}) };
    }

    const nextCacheId = Math.max(Number(local.cacheId) || 0, Number(remote.cacheId) || 0) + 1;

    const mergedProgress = {
      completedQuestions: mergedSolved,
      solvedProblems: mergedSolved,
      attemptedQuestions: mergedAttempted,
      solvedCount: mergedSolved.length,
      attemptedCount: mergedAttempted.length,
      cacheId: nextCacheId,
      problemDetails: mergedDetails,
      activity: mergedActivity,
      sheetSolvedDicts: mergedSheets,
      updatedAt: new Date().toISOString()
    };

    // Save to LocalStorage and Firestore
    const effectiveUid = resolveEffectiveUid(uid);
    localStorage.setItem(`practice_progress_${effectiveUid}`, JSON.stringify(mergedProgress));
    await setDoc(docRef, mergedProgress, { merge: true });

    console.log('[CodingProgressService] Sync completed. Solved:', mergedProgress.solvedCount, 'Attempted:', mergedProgress.attemptedCount, 'cacheId:', nextCacheId);
    return { success: true, progress: mergedProgress };
  } catch (error) {
    console.error('[CodingProgressService] Sync failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get question status for UI display.
 * Returns: 'SOLVED' | 'ATTEMPTED' | 'IN_PROGRESS' | 'UNSOLVED' | 'LOCKED'
 */
export const getQuestionDisplayStatus = (
  questionId, 
  solvedIds = [], 
  problemDetails = {}, 
  isPremium = false, 
  userIsPremium = false,
  attemptedIds = []
) => {
  if (!questionId) return 'UNSOLVED';
  const strId = String(questionId).trim();

  if (strId.startsWith('Q0.')) {
    isPremium = false;
  }
  if (isPremium && !userIsPremium) return 'LOCKED';

  const solvedSet = Array.isArray(solvedIds) ? new Set(solvedIds.map(String)) : (solvedIds instanceof Set ? solvedIds : new Set());
  const attemptedSet = Array.isArray(attemptedIds) ? new Set(attemptedIds.map(String)) : (attemptedIds instanceof Set ? attemptedIds : new Set());

  if (solvedSet.has(strId) || problemDetails[strId]?.status === 'SOLVED' || problemDetails[strId]?.lastSolvedAt) return 'SOLVED';
  if (attemptedSet.has(strId) || problemDetails[strId]?.status === 'ATTEMPTED') return 'ATTEMPTED';
  if (problemDetails[strId]?.status === 'IN_PROGRESS') return 'IN_PROGRESS';
  return 'UNSOLVED';
};

/**
 * Log portal usage time (in minutes) for today.
 */
export const logPortalActivityTime = async (uid, minutes = 1) => {
  if (!uid) return { success: false };
  
  const local = getLocalProgress(uid);
  if (!local.activity) {
    local.activity = {};
  }
  
  const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
  if (!local.activity[today]) {
    local.activity[today] = {
      hours: 0,
      problemsSolved: 0
    };
  }
  
  local.activity[today].hours = (local.activity[today].hours || 0) + (minutes / 60);
  
  saveLocalProgress(uid, local);

  // Log activity to userActivities/{uid}/
  import('./activityLoggerService').then(mod => {
    mod.logUserActivity(uid, 'TIME_SPENT', { minutes, totalHoursToday: local.activity[today].hours });
  }).catch(() => {});
  
  // Fire-and-forget sync — only if user is authenticated
  if (navigator.onLine) {
    try {
      const { auth } = await import('../firebase-config');
      if (!auth.currentUser) return { success: true };
      const docRef = doc(db, COLLECTION, uid);
      await setDoc(docRef, local, { merge: true });
    } catch (e) {
      console.warn('[CodingProgressService] Background sync failed:', e.message);
    }
  }
  return { success: true };
};

/**
 * Mark a sheet problem solved/unsolved and sync.
 */
export const saveSheetProgress = async (uid, sheetId, problemId, isSolved) => {
  if (!uid || !sheetId || !problemId) return { success: false };
  const local = getLocalProgress(uid);
  if (!local.sheetSolvedDicts) local.sheetSolvedDicts = {};
  if (!local.sheetSolvedDicts[sheetId]) local.sheetSolvedDicts[sheetId] = {};
  
  if (isSolved) {
    local.sheetSolvedDicts[sheetId][problemId] = true;
  } else {
    delete local.sheetSolvedDicts[sheetId][problemId];
  }

  saveLocalProgress(uid, local);

  // Fire-and-forget sync
  if (navigator.onLine) {
    try {
      const docRef = doc(db, COLLECTION, uid);
      await setDoc(docRef, local, { merge: true });
    } catch (e) {
      console.warn('[CodingProgressService] Background sync failed:', e.message);
    }
  }
  return { success: true };
};

export default {
  getCompletedQuestionIds,
  getSolvedQuestionIds,
  getAttemptedQuestionIds,
  getFullProgress,
  getProgressSummary,
  getCacheId,
  getQuestionProgress,
  markQuestionSolved,
  markQuestionAttempted,
  syncProgressWithFirebase,
  getQuestionDisplayStatus,
  logPortalActivityTime,
  saveSheetProgress,
};
