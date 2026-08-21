/**
 * assessmentSessionService.js
 *
 * Firestore-backed attempt lifecycle management for SEED SEB.
 *
 * ─── Schema: users/{uid}/contestAttempts/{uid}_{assessmentId} ────────────────
 * {
 *   uid,               // Firebase Auth UID — canonical identity
 *   assessmentId,
 *   assessmentTitle,
 *   type:              'mcq' | 'msa' | 'coding',
 *   slug,
 *   tenantId,
 *   cohortId,
 *   email,             // stored for reporting only; NOT used as identity
 *   status,            // ATTEMPT_STATES value (see attemptStateMachine.js)
 *   startedAt:         serverTimestamp,   // authoritative start
 *   durationSeconds:   number,            // total exam time
 *   //
 *   // NOTE: timeRemainingSeconds is NOT stored here.
 *   //   Remaining time on resume = durationSeconds - elapsed(now - startedAt)
 *   //   Client timer is a display mechanism only.
 *   //
 *   sections:          { [sectionId]: { status, startedAt, completedAt, durationSeconds } },
 *   sectionAnswers:    { [sectionId]: { [qIdx]: selectedOptionIdx } },
 *   activeSection:     { id, idx, startedAt, durationSeconds } | null,
 *   completed:         boolean,
 *   autoSubmitted:     boolean,
 *   autoSubmitReason:  string | null,
 *   lastSavedAt:       serverTimestamp,
 *   scoring_authority: 'client_provisional',  // always set; see limitation notice
 * }
 *
 * ─── Create-Once Rule ────────────────────────────────────────────────────────
 * startAssessmentSession() MUST NOT overwrite an existing active or completed attempt.
 * It reads the existing document first and only creates if:
 *   1. No document exists, OR
 *   2. The existing document is in NOT_STARTED state.
 * Any other existing state causes it to return the existing attempt for resume handling.
 *
 * ─── LIMITATION ──────────────────────────────────────────────────────────────
 * All scoring is client_provisional. This client computes scores locally.
 * A trusted server-side scoring pipeline is not yet implemented.
 * The scoring_authority field clearly marks this in every attempt document.
 */

import { auth, db } from '../lib/firebase-config';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import {
  ATTEMPT_STATES,
  TERMINAL_STATES,
  RESUMABLE_STATES,
  isValidTransition,
  isTerminal,
  isResumable,
  attemptDocId,
  buildAttemptEnvelope,
  withRetry,
  saveLocalSubmissionEnvelope,
  clearLocalSubmissionEnvelope,
  calcAuthoritativeRemainingSeconds,
} from './attemptStateMachine';

// ─────────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get current user ID: Firebase Auth UID.
 * MUST be auth.currentUser.uid — never fall back to email or localStorage.
 *
 * @returns {string|null}
 */
function getCurrentUid() {
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    console.error('[SessionService] No Firebase Auth user. Student must be logged in via Firebase Auth before any attempt operation.');
    return null;
  }
  return uid;
}

function getAttemptRef(uid, assessmentId) {
  const docId = attemptDocId(uid, assessmentId);
  return doc(db, 'users', uid, 'contestAttempts', docId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a new assessment attempt — CREATE ONCE.
 *
 * Returns an object describing the outcome:
 *   { outcome: 'created',  attempt: data }  — new attempt, exam can begin
 *   { outcome: 'resumed',  attempt: data }  — existing resumable attempt found
 *   { outcome: 'blocked',  attempt: data, reason }  — submitted/terminal, cannot proceed
 *   { outcome: 'error',    error }
 *
 * NEVER overwrites an existing active or submitted attempt.
 *
 * @param {object} assessment — { id, name, type, duration_minutes, sections }
 * @param {string} slug       — route slug
 * @returns {Promise<{outcome, attempt?, reason?, error?}>}
 */
export async function startAssessmentSession(assessment, slug = '') {
  const uid = getCurrentUid();
  if (!uid) {
    return { outcome: 'error', error: 'Not authenticated. Please log in before starting an assessment.' };
  }
  if (!assessment?.id) {
    return { outcome: 'error', error: 'Invalid assessment: missing id.' };
  }

  try {
    const ref = getAttemptRef(uid, assessment.id);

    // ── Existence check (create-once) ───────────────────────────────────────
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const data = existing.data();
      const currentStatus = data.status || (data.completed ? ATTEMPT_STATES.SUBMITTED : ATTEMPT_STATES.IN_PROGRESS);

      if (isTerminal(currentStatus)) {
        console.log(`[SessionService] Attempt for ${assessment.id} is in terminal state: ${currentStatus}. Blocking.`);
        return {
          outcome: 'blocked',
          attempt: data,
          reason: currentStatus === ATTEMPT_STATES.SUBMITTED
            ? 'This assessment has already been submitted.'
            : currentStatus === ATTEMPT_STATES.AUTO_SUBMITTED
              ? 'This assessment was auto-submitted.'
              : `Assessment is in a final state: ${currentStatus}.`,
        };
      }

      if (isResumable(currentStatus)) {
        console.log(`[SessionService] Resumable attempt found for ${assessment.id} (status: ${currentStatus}).`);
        return { outcome: 'resumed', attempt: data };
      }

      // STARTING / SUBMITTING / EXPIRED — do not interfere
      console.log(`[SessionService] Attempt in non-resumable active state: ${currentStatus}. Not creating new attempt.`);
      return { outcome: 'resumed', attempt: data };
    }

    // ── Create new attempt ─────────────────────────────────────────────────
    const profile = auth.currentUser;
    const authProfile = {
      tenantId:    null, // filled below from Firestore if needed; not trusted from localStorage
      cohortId:    null,
      email:       profile?.email ?? '',
      displayName: profile?.name ?? '',
    };

    // Read profile fields from Firestore (single read, not from localStorage)
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const user = userSnap.data();
        authProfile.tenantId = user.tenantId ?? '';
        authProfile.cohortId = user.cohortId ?? '';
      }
    } catch (profileErr) {
      console.warn('[SessionService] Could not read user profile for attempt envelope:', profileErr?.message);
    }

    const envelope = buildAttemptEnvelope(uid, assessment.id, authProfile, assessment, slug);

    await withRetry(() =>
      setDoc(ref, {
        ...envelope,
        startedAt:   serverTimestamp(),
        lastSavedAt: serverTimestamp(),
      })
    );

    console.log('[SessionService] New attempt created for assessment', assessment.id, '| uid:', uid);
    return { outcome: 'created', attempt: envelope };

  } catch (err) {
    console.error('[SessionService] startAssessmentSession failed:', err?.message);
    return { outcome: 'error', error: err?.message || 'Failed to start assessment session.' };
  }
}

/**
 * Retrieve the current attempt for the authenticated student.
 * Returns null if none exists.
 *
 * @param {string} assessmentId
 * @returns {Promise<object|null>}
 */
export async function getActiveAttempt(assessmentId) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return null;
  try {
    const snap = await getDoc(getAttemptRef(uid, assessmentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    console.warn('[SessionService] getActiveAttempt failed:', err?.message);
    return null;
  }
}

/**
 * Transition the attempt state in Firestore.
 * Validates the transition against the state machine before writing.
 *
 * @param {string} assessmentId
 * @param {string} toState        — target ATTEMPT_STATES value
 * @param {object} [extraData]    — additional fields to merge
 * @returns {Promise<boolean>}    — true on success
 */
export async function transitionAttemptState(assessmentId, toState, extraData = {}) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return false;

  try {
    const ref = getAttemptRef(uid, assessmentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.warn('[SessionService] transitionAttemptState: attempt doc does not exist.');
      return false;
    }

    const current = snap.data();
    const fromState = current.status || ATTEMPT_STATES.IN_PROGRESS;

    if (!isValidTransition(fromState, toState)) {
      console.warn(`[SessionService] Invalid state transition ${fromState} → ${toState} rejected.`);
      return false;
    }

    await withRetry(() =>
      updateDoc(ref, {
        status:      toState,
        lastSavedAt: serverTimestamp(),
        ...extraData,
      })
    );

    console.log(`[SessionService] Attempt state: ${fromState} → ${toState}`);
    return true;
  } catch (err) {
    console.error('[SessionService] transitionAttemptState failed:', err?.message);
    return false;
  }
}

/**
 * Call when a section begins.
 * @param {string} assessmentId
 * @param {{ sectionId, name, secIdx, durationMinutes }} section
 */
export async function markSectionStarted(assessmentId, section) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return;
  try {
    const now = new Date().toISOString();
    await setDoc(getAttemptRef(uid, assessmentId), {
      [`sections.${section.sectionId}.status`]:          ATTEMPT_STATES.IN_PROGRESS,
      [`sections.${section.sectionId}.startedAt`]:       now,
      [`sections.${section.sectionId}.durationSeconds`]: (section.durationMinutes || 30) * 60,
      activeSection: {
        id:              section.sectionId,
        name:            section.name ?? '',
        idx:             section.secIdx,
        startedAt:       now,
        durationSeconds: (section.durationMinutes || 30) * 60,
      },
      lastSavedAt: serverTimestamp(),
    }, { merge: true });
    console.log('[SessionService] Section started:', section.sectionId);
  } catch (err) {
    console.warn('[SessionService] markSectionStarted failed (non-fatal):', err?.message);
  }
}

/**
 * Save current section answers to Firestore.
 * Does NOT store timeRemainingSeconds — authoritative time comes from startedAt + durationSeconds.
 *
 * @param {string} assessmentId
 * @param {string} sectionId
 * @param {object} answers  — { [qIdx]: selectedOptionIdx | null }
 */
export async function saveSessionProgress(assessmentId, sectionId, answers) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return;
  try {
    await setDoc(getAttemptRef(uid, assessmentId), {
      [`sectionAnswers.${sectionId}`]: answers || {},
      lastSavedAt: serverTimestamp(),
    }, { merge: true });
    console.log('[SessionService] Progress saved for section', sectionId);
  } catch (err) {
    console.warn('[SessionService] saveSessionProgress failed (non-fatal):', err?.message);
  }
}

/**
 * Call when a section is submitted (normal or auto-submit).
 * @param {string} assessmentId
 * @param {string} sectionId
 */
export async function markSectionCompleted(assessmentId, sectionId) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return;
  try {
    await updateDoc(getAttemptRef(uid, assessmentId), {
      [`sections.${sectionId}.status`]:      ATTEMPT_STATES.SUBMITTED,
      [`sections.${sectionId}.completedAt`]: new Date().toISOString(),
      [`sectionAnswers.${sectionId}`]:       deleteField(), // already in results collection
      activeSection:                         null,
      lastSavedAt:                           serverTimestamp(),
    }).catch(async () => {
      await setDoc(getAttemptRef(uid, assessmentId), {
        [`sections.${sectionId}.status`]:      ATTEMPT_STATES.SUBMITTED,
        [`sections.${sectionId}.completedAt`]: new Date().toISOString(),
        activeSection:                         null,
        lastSavedAt:                           serverTimestamp(),
      }, { merge: true });
    });
  } catch (err) {
    console.warn('[SessionService] markSectionCompleted failed (non-fatal):', err?.message);
  }
}

/**
 * Mark the entire assessment as fully submitted.
 * Uses the state machine transition SUBMITTING → SUBMITTED or AUTO_SUBMITTED.
 * This is a CRITICAL write — retried with exponential backoff.
 * The student MUST NOT be shown "submitted" until this succeeds.
 *
 * @param {string} assessmentId
 * @param {{ autoSubmitted?: boolean, reason?: string, finalPayload?: object }} [opts]
 * @returns {Promise<{ success: boolean, pending?: boolean }>}
 */
export async function completeAssessmentSession(assessmentId, opts = {}) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return { success: false };

  const targetState = opts.autoSubmitted
    ? ATTEMPT_STATES.AUTO_SUBMITTED
    : ATTEMPT_STATES.SUBMITTED;

  const attemptRef = getAttemptRef(uid, assessmentId);

  // Idempotency check: if already submitted, return success immediately
  try {
    const snap = await getDoc(attemptRef);
    if (snap.exists()) {
      const current = snap.data();
      if (isTerminal(current?.status) || current?.completed === true) {
        console.log('[SessionService] Attempt already finalized for assessment', assessmentId, '| status:', current?.status);
        clearLocalSubmissionEnvelope(uid, assessmentId);
        return { success: true, alreadySubmitted: true };
      }
    }
  } catch (err) {
    console.warn('[SessionService] Pre-submission idempotency check notice:', err?.message);
  }

  const updateData = {
    status:           targetState,
    completed:        true,
    autoSubmitted:    opts.autoSubmitted || false,
    autoSubmitReason: opts.reason || null,
    completedAt:      serverTimestamp(),
    submittedAt:      new Date().toISOString(),
    activeSection:    null,
    lastSavedAt:      serverTimestamp(),
    scoring_authority: 'client_provisional',
  };

  // Persist envelope locally before attempting the write (crash recovery)
  saveLocalSubmissionEnvelope(uid, assessmentId, {
    assessmentId,
    uid,
    status:         targetState,
    submittedAt:    updateData.submittedAt,
    ...(opts.finalPayload || {}),
  });

  try {
    await withRetry(() => updateDoc(attemptRef, updateData));
    clearLocalSubmissionEnvelope(uid, assessmentId);
    console.log('[SessionService] Session completed for assessment', assessmentId, '| state:', targetState);
    return { success: true };
  } catch (err) {
    console.error('[SessionService] completeAssessmentSession FAILED after retries:', err?.message);
    // Envelope remains in localStorage for retry on next boot.
    return { success: false, pending: true };
  }
}

/**
 * Calculate authoritative remaining seconds for an assessment/section.
 * Uses server-recorded startedAt + durationSeconds — NOT client-stored timeRemainingSeconds.
 *
 * @param {object} attemptData — Firestore attempt document data
 * @returns {number}
 */
export { calcAuthoritativeRemainingSeconds };

/**
 * Threshold (in seconds remaining) at which the 1/3-mark save fires.
 * @param {number} totalDurationSeconds
 * @returns {number}
 */
export function oneThirdSaveThreshold(totalDurationSeconds) {
  return Math.round(totalDurationSeconds * (2 / 3));
}

export default {
  startAssessmentSession,
  getActiveAttempt,
  transitionAttemptState,
  markSectionStarted,
  saveSessionProgress,
  markSectionCompleted,
  completeAssessmentSession,
  calcAuthoritativeRemainingSeconds,
  oneThirdSaveThreshold,
};
