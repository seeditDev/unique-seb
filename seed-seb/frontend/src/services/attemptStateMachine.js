/**
 * attemptStateMachine.js
 *
 * Canonical assessment attempt state machine for SEED SEB.
 *
 * States:
 *   NOT_STARTED        — no attempt document in Firestore yet
 *   STARTING           — create-once write in flight
 *   STARTED            — attempt document created, exam not yet entered
 *   IN_PROGRESS        — student is actively answering
 *   SUBMITTING         — final submission write in flight
 *   SUBMITTED          — confirmed by Firestore write success
 *   AUTO_SUBMITTED     — timer or proctor violation triggered submit
 *   EXPIRED            — time limit exceeded, transitioning to auto-submit
 *   FAILED_RECOVERABLE — submission write failed; retry allowed
 *   FAILED_FATAL       — unrecoverable failure; student must contact admin
 *
 * Transition table (from → allowed tos):
 *   NOT_STARTED        → STARTING
 *   STARTING           → STARTED | FAILED_FATAL
 *   STARTED            → IN_PROGRESS
 *   IN_PROGRESS        → SUBMITTING | EXPIRED
 *   SUBMITTING         → SUBMITTED | AUTO_SUBMITTED | FAILED_RECOVERABLE
 *   EXPIRED            → SUBMITTING
 *   FAILED_RECOVERABLE → SUBMITTING
 *
 * Terminal states (no further transitions allowed):
 *   SUBMITTED, AUTO_SUBMITTED, FAILED_FATAL
 *
 * Identity rule:
 *   attemptDocId() always uses Firebase Auth UID — NEVER email or sanitised email.
 *   If UID is missing, throw immediately; do not substitute.
 */

// ─── State Constants ──────────────────────────────────────────────────────────

export const ATTEMPT_STATES = Object.freeze({
  NOT_STARTED:        'NOT_STARTED',
  STARTING:           'STARTING',
  STARTED:            'STARTED',
  IN_PROGRESS:        'IN_PROGRESS',
  SUBMITTING:         'SUBMITTING',
  SUBMITTED:          'SUBMITTED',
  AUTO_SUBMITTED:     'AUTO_SUBMITTED',
  EXPIRED:            'EXPIRED',
  FAILED_RECOVERABLE: 'FAILED_RECOVERABLE',
  FAILED_FATAL:       'FAILED_FATAL',
});

/** States from which no further submit is possible. */
export const TERMINAL_STATES = new Set([
  ATTEMPT_STATES.SUBMITTED,
  ATTEMPT_STATES.AUTO_SUBMITTED,
  ATTEMPT_STATES.FAILED_FATAL,
]);

/** States that are considered "active" (exam in flight). */
export const ACTIVE_STATES = new Set([
  ATTEMPT_STATES.STARTING,
  ATTEMPT_STATES.STARTED,
  ATTEMPT_STATES.IN_PROGRESS,
  ATTEMPT_STATES.SUBMITTING,
  ATTEMPT_STATES.EXPIRED,
  ATTEMPT_STATES.FAILED_RECOVERABLE,
]);

/** States that can be resumed by the student. */
export const RESUMABLE_STATES = new Set([
  ATTEMPT_STATES.STARTED,
  ATTEMPT_STATES.IN_PROGRESS,
  ATTEMPT_STATES.FAILED_RECOVERABLE,
]);

// ─── Transition Map ───────────────────────────────────────────────────────────

const TRANSITIONS = {
  [ATTEMPT_STATES.NOT_STARTED]:        [ATTEMPT_STATES.STARTING],
  [ATTEMPT_STATES.STARTING]:           [ATTEMPT_STATES.STARTED,    ATTEMPT_STATES.FAILED_FATAL],
  [ATTEMPT_STATES.STARTED]:            [ATTEMPT_STATES.IN_PROGRESS],
  [ATTEMPT_STATES.IN_PROGRESS]:        [ATTEMPT_STATES.SUBMITTING, ATTEMPT_STATES.EXPIRED],
  [ATTEMPT_STATES.SUBMITTING]:         [ATTEMPT_STATES.SUBMITTED,  ATTEMPT_STATES.AUTO_SUBMITTED, ATTEMPT_STATES.FAILED_RECOVERABLE],
  [ATTEMPT_STATES.EXPIRED]:            [ATTEMPT_STATES.SUBMITTING],
  [ATTEMPT_STATES.FAILED_RECOVERABLE]: [ATTEMPT_STATES.SUBMITTING],
};

/**
 * Returns true if the transition from → to is permitted by the state machine.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isValidTransition(from, to) {
  if (TERMINAL_STATES.has(from)) return false;
  const allowed = TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * Returns whether the current attempt may be resumed by the student.
 * An attempt from a DIFFERENT UID must never be resumed regardless of state.
 * @param {string} state
 * @returns {boolean}
 */
export function isResumable(state) {
  return RESUMABLE_STATES.has(state);
}

/**
 * Returns whether the attempt is in a terminal state (no further action allowed).
 * @param {string} state
 * @returns {boolean}
 */
export function isTerminal(state) {
  return TERMINAL_STATES.has(state);
}

// ─── Canonical Identity Helpers ───────────────────────────────────────────────

/**
 * Deterministic attempt document ID.
 * Format: {uid}_{assessmentId}
 *
 * IMPORTANT: uid MUST be the Firebase Auth UID (auth.currentUser.uid).
 * Never substitute email, sanitized email, or localStorage values here.
 *
 * @param {string} uid          — Firebase Auth UID (required)
 * @param {string} assessmentId — Assessment/test ID (required)
 * @returns {string}
 * @throws {Error} if uid is empty/falsy
 */
export function attemptDocId(uid, assessmentId) {
  if (!uid || typeof uid !== 'string') {
    throw new Error('[AttemptStateMachine] attemptDocId: uid is required and must be a non-empty string (Firebase Auth UID). Do not substitute email or localStorage values.');
  }
  if (!assessmentId || typeof assessmentId !== 'string') {
    throw new Error('[AttemptStateMachine] attemptDocId: assessmentId is required.');
  }
  return `${uid}_${assessmentId}`;
}

/**
 * Stable idempotency key for submission deduplication.
 * Using the same attempt doc ID so repeated submits hit the same Firestore doc.
 * @param {string} uid
 * @param {string} assessmentId
 * @returns {string}
 */
export function generateIdempotencyKey(uid, assessmentId) {
  return attemptDocId(uid, assessmentId);
}

// ─── Attempt Envelope Builder ─────────────────────────────────────────────────

/**
 * Build the create-once attempt document payload.
 * This is the canonical shape written on first attempt creation.
 *
 * Fields NOT included (added on transition):
 *   completedAt, submittedAt, autoSubmitReason, finalAnswers
 *
 * @param {string} uid        — Firebase Auth UID
 * @param {string} assessmentId
 * @param {object} authProfile — { tenantId, cohortId, email, name }
 * @param {object} assessment  — { name, type, duration_minutes, sections }
 * @param {string} slug
 * @returns {object}
 */
export function buildAttemptEnvelope(uid, assessmentId, authProfile, assessment, slug = '') {
  if (!uid) throw new Error('[AttemptStateMachine] buildAttemptEnvelope: uid required');

  const durationSeconds = (assessment?.duration_minutes || 60) * 60;

  const sections = {};
  (assessment?.sections || []).forEach((sec) => {
    const id = sec.sectionId || sec.id || sec.name || String(sections.length);
    sections[id] = {
      status:          ATTEMPT_STATES.NOT_STARTED,
      startedAt:       null,
      completedAt:     null,
      durationSeconds: (sec.duration_minutes || 30) * 60,
    };
  });

  return {
    // ── Identity ──────────────────────────────────────────────────────────
    uid,
    assessmentId,
    tenantId:      authProfile?.tenantId ?? '',
    cohortId:      authProfile?.cohortId ?? '',
    email:         authProfile?.email ?? '',
    displayName:   authProfile?.name ?? '',

    // ── Assessment Meta ────────────────────────────────────────────────────
    assessmentTitle:   assessment?.name ?? '',
    type:             assessment?.type || 'msa',
    slug:             slug || assessmentId,

    // ── State Machine ──────────────────────────────────────────────────────
    status:           ATTEMPT_STATES.STARTED,
    // startedAt: set to serverTimestamp() by the caller
    durationSeconds,
    // NOTE: timeRemainingSeconds is NOT stored here.
    //       Remaining time = durationSeconds - elapsed(now - startedAt).
    //       The client uses this formula on resume; never trusts a stored
    //       timeRemainingSeconds as authoritative.

    // ── Sections ───────────────────────────────────────────────────────────
    sections,
    sectionAnswers:   {},
    activeSection:    null,

    // ── Flags ──────────────────────────────────────────────────────────────
    completed:        false,
    autoSubmitted:    false,
    autoSubmitReason: null,

    // ── Scoring (provisional only) ─────────────────────────────────────────
    // LIMITATION: scores produced by this client are provisional.
    // Field 'scoring_authority' = 'client_provisional' signals that this
    // result has NOT been verified by a trusted server-side pipeline.
    scoring_authority: 'client_provisional',
  };
}

// ─── Critical Write Utility ───────────────────────────────────────────────────

const DEFAULT_RETRY_DELAYS = [500, 1500, 4000, 10000]; // ms

/**
 * Retry a critical Firestore write with exponential backoff.
 *
 * On all retries exhausted, the caller is responsible for:
 *  1. Persisting a local submission envelope for crash recovery.
 *  2. Showing the student an explicit "Submission pending" state.
 *  3. NOT telling the student the submission succeeded.
 *
 * @param {() => Promise<any>} fn         — async function to retry
 * @param {number[]}           delays     — backoff delay list in ms
 * @returns {Promise<any>}
 * @throws {Error} after all retries exhausted
 */
export async function withRetry(fn, delays = DEFAULT_RETRY_DELAYS) {
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < delays.length) {
        const delay = delays[attempt];
        console.warn(`[AttemptStateMachine] withRetry: attempt ${attempt + 1} failed, retrying in ${delay}ms`, err?.code || err?.message);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

// ─── Local Submission Envelope (crash recovery) ────────────────────────────────

const SUBMISSION_ENVELOPE_KEY_PREFIX = 'seed_submission_envelope_';

/**
 * Persist a submission envelope locally so it can be retried after crash/restart.
 * Key is scoped to {uid}_{assessmentId} to prevent cross-user contamination.
 *
 * @param {string} uid
 * @param {string} assessmentId
 * @param {object} envelope
 */
export function saveLocalSubmissionEnvelope(uid, assessmentId, envelope) {
  try {
    const key = `${SUBMISSION_ENVELOPE_KEY_PREFIX}${uid}_${assessmentId}`;
    localStorage.setItem(key, JSON.stringify({
      ...envelope,
      savedAt:        new Date().toISOString(),
      idempotencyKey: generateIdempotencyKey(uid, assessmentId),
    }));
  } catch (e) {
    console.warn('[AttemptStateMachine] Could not save local submission envelope:', e?.message);
  }
}

/**
 * Read a pending local submission envelope.
 * Returns null if none exists.
 * @param {string} uid
 * @param {string} assessmentId
 * @returns {object|null}
 */
export function readLocalSubmissionEnvelope(uid, assessmentId) {
  try {
    const key = `${SUBMISSION_ENVELOPE_KEY_PREFIX}${uid}_${assessmentId}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Remove the local submission envelope after confirmed Firestore write.
 * @param {string} uid
 * @param {string} assessmentId
 */
export function clearLocalSubmissionEnvelope(uid, assessmentId) {
  try {
    const key = `${SUBMISSION_ENVELOPE_KEY_PREFIX}${uid}_${assessmentId}`;
    localStorage.removeItem(key);
  } catch (_) {}
}

/**
 * Calculate authoritative remaining time from stored startedAt + durationSeconds.
 *
 * @param {object} attemptData — Firestore attempt document data
 *   { startedAt: Firestore Timestamp, durationSeconds: number }
 * @returns {number} remaining seconds (≥ 0)
 */
export function calcAuthoritativeRemainingSeconds(attemptData) {
  if (!attemptData?.startedAt || typeof attemptData?.durationSeconds !== 'number') {
    return 0;
  }
  try {
    const startMs = attemptData.startedAt.toDate
      ? attemptData.startedAt.toDate().getTime()
      : new Date(attemptData.startedAt).getTime();
    const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
    return Math.max(0, attemptData.durationSeconds - elapsedSec);
  } catch {
    return 0;
  }
}

export default {
  ATTEMPT_STATES,
  TERMINAL_STATES,
  ACTIVE_STATES,
  RESUMABLE_STATES,
  isValidTransition,
  isResumable,
  isTerminal,
  attemptDocId,
  generateIdempotencyKey,
  buildAttemptEnvelope,
  withRetry,
  saveLocalSubmissionEnvelope,
  readLocalSubmissionEnvelope,
  clearLocalSubmissionEnvelope,
  calcAuthoritativeRemainingSeconds,
};
