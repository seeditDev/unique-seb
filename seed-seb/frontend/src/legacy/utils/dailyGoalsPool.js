/**
 * dailyGoalsPool.js
 * Comprehensive 50-goal pool for SEED-IT Daily Learning & Coding Goals.
 * Includes deterministic daily rotation (3 goals/day), auto-progress validation,
 * streak approval, and dual storage (Firestore users/ collection + Local Profile Folder).
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase-config';
import desktopBridge from './desktopBridge';

// ─── 3 Standard Regular Daily Goals to Achieve Streak ────────────────
export const REGULAR_DAILY_GOALS = [
  { id: 'goal_easy_1', title: 'Solve 1 Easy Problem', target: 1, type: 'difficulty', difficulty: 'Easy', points: 30 },
  { id: 'goal_medium_1', title: 'Solve 1 Medium Problem', target: 1, type: 'difficulty', difficulty: 'Medium', points: 40 },
  { id: 'goal_time_15', title: 'Spend 15 mins in portal', target: 15, type: 'time', points: 30 }
];

export const DAILY_GOALS_POOL = REGULAR_DAILY_GOALS;

/**
 * Returns the 3 standard regular daily goals for today.
 */
export const getDailyGoalsForDate = (dateStr, uid) => {
  return REGULAR_DAILY_GOALS.map(g => ({
    ...g,
    current: 0,
    completed: false,
    date: dateStr || new Date().toISOString().split('T')[0]
  }));
};

/**
 * Load today's active goals for the user.
 * Tries LocalStorage, Desktop Local Profile Folder cache, and Firestore.
 */
export const loadUserDailyGoals = async (uid) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const localKey = `seed_daily_goals_${uid ?? ''}`;

  // 1. Try local storage cache
  let savedGoals = null;
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === todayStr && Array.isArray(parsed.goals)) {
        savedGoals = parsed.goals;
      }
    }
  } catch (_) {}

  // 2. If not in localStorage, try Desktop Profile Folder
  if (!savedGoals && uid) {
    try {
      const diskData = await desktopBridge.loadUserProfileCache(uid, 'daily_goals');
      if (diskData && diskData.date === todayStr && Array.isArray(diskData.goals)) {
        savedGoals = diskData.goals;
      }
    } catch (_) {}
  }

  // 3. If not in disk, try Firestore
  if (!savedGoals && uid) {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const udata = userSnap.data();
        if (udata.dailyGoals && udata.dailyGoals.date === todayStr && Array.isArray(udata.dailyGoals.goals)) {
          savedGoals = udata.dailyGoals.goals;
        }
      }
    } catch (_) {}
  }

  // If still no valid goals for today, generate 3 fresh deterministic goals
  if (!savedGoals || savedGoals.length < 3) {
    savedGoals = getDailyGoalsForDate(todayStr, uid);
    await saveUserDailyGoals(uid, todayStr, savedGoals).catch(() => {});
  }

  return {
    date: todayStr,
    goals: savedGoals
  };
};

/**
 * Saves daily goals & streak & credits to LocalStorage, Local Profile Folder, and Firestore.
 */
export const saveUserDailyGoals = async (uid, dateStr, goals, streakOverride = null, creditsOverride = null) => {
  if (!goals) return;
  const todayStr = dateStr || new Date().toISOString().split('T')[0];
  const payload = {
    date: todayStr,
    goals,
    allCompleted: goals.every(g => g.completed === true),
    updatedAt: new Date().toISOString()
  };

  // 1. Save to LocalStorage
  const localKey = `seed_daily_goals_${uid ?? ''}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(payload));
  } catch (_) {}

  // 2. Save to Desktop Profile Folder on disk
  if (uid) {
    try {
      desktopBridge.saveUserProfileCache(uid, 'daily_goals', payload);
    } catch (_) {}
  }

  // 3. Save to Firestore users/ collection
  if (uid && db) {
    try {
      const userRef = doc(db, 'users', uid);
      const updateData = {
        dailyGoals: payload
      };
      if (streakOverride !== null) updateData.streak = streakOverride;
      if (creditsOverride !== null) updateData.seedCredits = creditsOverride;
      if (payload.allCompleted) updateData.lastStreakDate = todayStr;

      await updateDoc(userRef, updateData).catch(async () => {
        // If updateDoc fails (e.g. document does not exist yet), try setDoc with merge
        const { setDoc } = await import('firebase/firestore');
        return setDoc(userRef, updateData, { merge: true });
      });
    } catch (err) {
      console.warn('[dailyGoalsPool] Firestore update error:', err.message);
    }
  }
};
