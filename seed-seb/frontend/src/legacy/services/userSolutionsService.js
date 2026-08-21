/**
 * userSolutionsService.js
 *
 * LeetCode-style "My Submissions" tracker.
 *
 * Firestore path:
 *   userSolutions/{uid}/solutions/{questionId}  →  latest ACCEPTED solution
 *   userSolutions/{uid}/allSubmissions/{autoId}  →  every submission (any status)
 *
 * Rules (add to firestore.rules):
 *   match /userSolutions/{uid}/{sub=**} {
 *     allow read, write: if request.auth.uid == uid || isStaffOrAdmin();
 *   }
 */

import { db } from '../firebase-config';
import {
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Types (JSDoc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SolutionRecord
 * @property {string}  questionId
 * @property {string}  questionTitle
 * @property {string}  language       - 'c' | 'cpp' | 'java' | 'python3' | ...
 * @property {string}  code           - Full submitted code
 * @property {string}  status         - 'accepted' | 'wrong_answer' | 'tle' | 'mle' | 'error'
 * @property {number}  testsPassed
 * @property {number}  testsTotal
 * @property {number}  executionTimeMs
 * @property {string}  submittedAt    - ISO string
 * @property {string}  [assessmentId] - Which assessment (if contest)
 * @property {boolean} [isPractice]
 */

// ─────────────────────────────────────────────────────────────────────────────
// Write: save a submission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save any code submission (accepted or not) to allSubmissions.
 * If status === 'accepted', also update/overwrite the bestSolution.
 *
 * @param {string} uid
 * @param {SolutionRecord} solution
 */
export async function saveSolution(uid, solution) {
  if (!uid || !solution?.questionId) return;
  try {
    const payload = {
      ...solution,
      uid,
      submittedAt: serverTimestamp(),
    };

    // 1. Add to allSubmissions (append-only log)
    await addDoc(collection(db, `userSolutions/${uid}/allSubmissions`), payload);

    // 2. If accepted → update best solution (overwrite if new or better pass rate)
    if (solution.status === 'accepted') {
      const bestRef = doc(db, `userSolutions/${uid}/solutions/${solution.questionId}`);
      const existing = await getDoc(bestRef);
      const existingPct = existing.exists()
        ? (existing.data().testsPassed || 0) / Math.max(existing.data().testsTotal || 1, 1)
        : 0;
      const newPct = (solution.testsPassed || 0) / Math.max(solution.testsTotal || 1, 1);

      if (!existing.exists() || newPct >= existingPct) {
        await setDoc(bestRef, {
          ...payload,
          savedAt: serverTimestamp(),
          isAccepted: true,
        });
      }
    }
  } catch (err) {
    console.error('[userSolutionsService] saveSolution error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read: fetch solutions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the best (accepted) solution for a specific question.
 * @param {string} uid
 * @param {string} questionId
 * @returns {Promise<SolutionRecord|null>}
 */
export async function getBestSolution(uid, questionId) {
  if (!uid || !questionId) return null;
  try {
    const snap = await getDoc(doc(db, `userSolutions/${uid}/solutions/${questionId}`));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error('[userSolutionsService] getBestSolution error:', err);
    return null;
  }
}

/**
 * Get the N most recent submissions for a question.
 * @param {string} uid
 * @param {string} questionId
 * @param {number} [n=10]
 * @returns {Promise<SolutionRecord[]>}
 */
export async function getRecentSubmissions(uid, questionId, n = 10) {
  if (!uid || !questionId) return [];
  try {
    const q = query(
      collection(db, `userSolutions/${uid}/allSubmissions`),
      orderBy('submittedAt', 'desc'),
      limit(n),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => d.data())
      .filter(d => d.questionId === questionId);
  } catch (err) {
    console.error('[userSolutionsService] getRecentSubmissions error:', err);
    return [];
  }
}

/**
 * Get all accepted questions for a user (their solved set).
 * @param {string} uid
 * @returns {Promise<string[]>} Array of questionIds
 */
export async function getSolvedQuestionIds(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, `userSolutions/${uid}/solutions`));
    return snap.docs.map(d => d.id);
  } catch (err) {
    console.error('[userSolutionsService] getSolvedQuestionIds error:', err);
    return [];
  }
}

/**
 * Get all solutions (accepted only) — for the profile/stats page.
 * @param {string} uid
 * @returns {Promise<SolutionRecord[]>}
 */
export async function getAllAcceptedSolutions(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, `userSolutions/${uid}/solutions`));
    return snap.docs.map(d => ({ ...d.data(), questionId: d.id }));
  } catch (err) {
    console.error('[userSolutionsService] getAllAcceptedSolutions error:', err);
    return [];
  }
}
