/**
 * submitGuard.js — Single in-flight submission guard for assessment submits.
 *
 * BUG FIXED (original): MCQ / Coding / Multi-Section auto-submit could fire
 * from several effects at once (timer, per-question timer, visibility, proctor
 * violation). The `disabled` attribute on the submit button does not protect
 * programmatic paths, so multiple final result documents were written for the
 * same attempt.
 *
 * IDENTITY CHANGE:
 * attemptDocId() previously used student email as part of the document ID.
 * It now uses Firebase Auth UID (uid), which is the canonical identity in the
 * Firestore security model. Using email was a cross-tenant data integrity risk.
 *
 * Usage:
 *   const guard = useSubmitGuard();
 *   if (!guard.begin('timer')) return;      // already submitting / already done
 *   try { ...submit... ; guard.complete(); }
 *   catch (e) { guard.fail(); throw e; }
 */
import { useRef } from 'react';

export function createSubmitGuard() {
  const state = { inFlight: false, done: false, reason: null };
  return {
    get isInFlight() { return state.inFlight; },
    get isDone()     { return state.done; },
    get reason()     { return state.reason; },

    /**
     * Attempt to take ownership of the submission.
     * @param {string} reason — e.g. 'manual', 'timer', 'proctor', 'violation'
     * @returns {boolean} true when the caller owns the submission
     */
    begin(reason = 'manual') {
      if (state.inFlight || state.done) return false;
      state.inFlight = true;
      state.reason   = reason;
      console.log('[SubmitGuard] Submission started, reason:', reason);
      return true;
    },

    /** Mark the attempt as finally submitted — no further submits allowed. */
    complete() {
      state.inFlight = false;
      state.done     = true;
      console.log('[SubmitGuard] Submission completed. Further submit attempts blocked.');
    },

    /** Release the lock after a recoverable failure so a retry can run. */
    fail() {
      state.inFlight = false;
      console.log('[SubmitGuard] Submission failed (recoverable). Lock released for retry.');
    },

    /** Full reset — only for testing or explicit admin-forced restart. */
    reset() {
      state.inFlight = false;
      state.done     = false;
      state.reason   = null;
    },
  };
}

export function useSubmitGuard() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createSubmitGuard();
  return ref.current;
}

/**
 * Deterministic attempt document ID using Firebase Auth UID.
 *
 * Format: {uid}_{testId}
 *
 * IMPORTANT: uid MUST be auth.currentUser.uid — not email, not a sanitised
 * email, not a value from localStorage. Using the Firebase Auth UID ensures:
 *   1. Document ID is stable across email changes.
 *   2. No cross-tenant path collisions.
 *   3. A repeat submit writes to the same document (idempotent overwrite).
 *
 * @param {string} uid    — Firebase Auth UID (required)
 * @param {string} testId — Assessment/test ID (required)
 * @returns {string}
 * @throws {Error} if uid is falsy
 */
export function attemptDocId(uid, testId) {
  if (!uid || typeof uid !== 'string') {
    throw new Error('[SubmitGuard] attemptDocId: uid is required. Use auth.currentUser.uid — do not substitute email.');
  }
  return `${uid}_${String(testId || 'unknown')}`;
}

/**
 * Generate a stable idempotency key for critical write deduplication.
 * Identical to attemptDocId — they share the same deterministic format.
 * @param {string} uid
 * @param {string} testId
 * @returns {string}
 */
export function generateIdempotencyKey(uid, testId) {
  return attemptDocId(uid, testId);
}

export default useSubmitGuard;
