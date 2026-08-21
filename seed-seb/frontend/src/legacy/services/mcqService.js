/**
 * @deprecated mcqService.js
 *
 * This service is DEPRECATED as of the One Assessment Module consolidation.
 * MCQ is no longer a top-level assessment type — it is a section type within
 * the unified Assessment runtime (MultiSectionAssessment.jsx).
 *
 * All new result writes go to:
 *   assessmentResults/{tenantId}/{assessmentId}/{uid}
 * via assessmentSessionService.js and MultiSectionAssessment.jsx.
 *
 * This file is kept in place for historical reference only.
 * Do NOT call these methods from any new code.
 */
import { db, auth } from '../firebase-config';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import timeService from './timeService';


/**
 * getCanonicalUid — resolve Firebase Auth UID for Firestore path construction.
 *
 * PRIORITY:
 *   1. auth.currentUser.uid  (live Firebase Auth — canonical)
 *   2. explicitly passed uid  (verified by caller from auth.currentUser.uid)
 *
 * NEVER falls back to:
 *   - email
 *   - college / year / department
 *   - localStorage-derived strings
 *
 * @param {string} [explicitUid] — optional pre-resolved UID from auth.currentUser.uid
 * @returns {string}
 * @throws {Error} when no UID is available
 */
function getCanonicalUid(explicitUid) {
    const uid = explicitUid || auth?.currentUser?.uid;
    if (!uid) {
        throw new Error(
            '[MCQService] Firebase Auth UID is required for Firestore path construction. ' +
            'The student must be authenticated before any attempt operation. ' +
            'Do not pass college / email / year as a substitute.'
        );
    }
    return uid;
}


class MCQService {
    /**
     * Compute partialScore and fullScore from result data.
     * partialScore = actual score earned.
     * fullScore    = totalMarks only if 100% achieved, else 0.
     */
    static computeScoreFields(score, totalMarks, percentage) {
        const partialScore = score || 0;
        const fullScore = (percentage >= 100 || (totalMarks > 0 && score >= totalMarks)) ? (totalMarks || 0) : 0;
        return { partialScore, fullScore };
    }

    /**
     * Canonical Firestore path — tenant-first scoped (4 segments).
     *
     * assessmentResults/{tenantId}/{assessmentId}/{userId}
     *
     * @param {string} assessmentId
     * @param {string} userId      — MUST be Firebase Auth UID
     * @param {string} tenantId   — student's college/tenant code (e.g. "KGKITE")
     */
    static canonicalPath(assessmentId, userId, tenantId = 'SEED-SEB') {
        if (!assessmentId) throw new Error('[MCQService] canonicalPath: assessmentId is required');
        if (!userId) throw new Error('[MCQService] canonicalPath: userId (Firebase Auth UID) is required');
        const rawTid = String(tenantId ?? '').trim();
        const tid = (rawTid && !rawTid.includes(' ') && rawTid !== '_unknown_') ? rawTid : 'SEED-SEB';
        return `assessmentResults/${tid}/${assessmentId}/${userId}`;
    }


    /**
     * Write result to the single canonical path.
     *
     * assessmentResults/{tenantId}/{assessmentId}/{userId}
     *
     * This is the ONLY Firestore write on submission. No secondary mirrors.
     * Admin, Staff, and Student all read from this single document.
     *
     * @param {object} payload
     * @param {{ assessmentId: string, userId: string, userProfile: object }} ctx
     *   userId MUST be auth.currentUser.uid — verified at the call site.
     */
    static async writeCanonicalResult(payload, { assessmentId, userId, userProfile }) {
        // Belt-and-braces: validate UID one more time at write boundary
        const canonicalUid = getCanonicalUid(userId);
        const normUser = userProfile || {};
        const tenantId = user.tenantId;
        const canonRef = doc(db, this.canonicalPath(assessmentId, canonicalUid, tenantId));
        await setDoc(canonRef, { ...payload, userId: canonicalUid, tenantId }, { merge: true });

        // Mark attempt in the completion index so dashboard shows Completed
        try {
            const { markAssessmentCompleted, invalidateCompletionCache } = await import('./attemptStatusService');
            const email = user.email ?? '';
            if (email) {
                await markAssessmentCompleted(normUser, assessmentId);
                invalidateCompletionCache(email);
            }
        } catch (_) { /* non-fatal */ }

        return this.canonicalPath(assessmentId, canonicalUid, tenantId);
    }


    /**
     * Write a guest result to assessmentResults/{tenantId}/{testId}/{guestId}.
     * Called from guest assessment submissions — no Firebase Auth UID.
     * @param {object} payload - Assessment result payload
     * @param {string} testId - The Firestore testId from courses/.../tests/
     * @param {object} guestSession - Guest session from localStorage (name, rollNo, college, etc.)
     */
    static async writeGuestResult(payload, testId, guestSession) {
        try {
            const guestId = guestSession.guestId || `guest_${Date.now()}`;
            const tenantId = guestSession.college || guestSession.tenantId || '_guest_';
            const guestRef = doc(db, `assessmentResults/${tenantId}/${testId}/${guestId}`);
            await setDoc(guestRef, {
                ...payload,
                isGuest: true,
                guestId,
                name: guestSession.name ?? '',
                rollNumber: guestSession.rollNumber ?? '',
                college: guestSession.college ?? '',
                department: guestSession.department ?? '',
                year: guestSession.year ?? '',
                email: guestSession.email || null,
                assessmentCode: guestSession.assessmentCode ?? '',
                courseId: guestSession.courseId ?? '',
                seriesId: guestSession.seriesId ?? '',
                submittedAt: serverTimestamp(),
                status: 'submitted',
            }, { merge: true });

            // ── Lock re-attempts in localStorage ──────────────────────────────
            try {
                localStorage.setItem(`guest_done_${testId}_${guestId}`, 'true');
                localStorage.removeItem('guest_session');
            } catch (_) { /* non-fatal */ }

            return `assessmentResults/${tenantId}/${testId}/guests/${guestId}`;
        } catch (err) {
            console.error('[MCQService] writeGuestResult error:', err);
            return null;
        }
    }

    /**
     * Mark course progress after a test submission.
     * Non-fatal — does not throw. Call after any writeCanonicalResult or writeGuestResult.
     * @param {object} params
     * @param {string} params.uid - Firebase UID (null for guests — skipped)
     * @param {string} params.courseId - From TestDoc
     * @param {string} params.seriesId - From TestDoc
     * @param {string} params.assessmentId - From TestDoc
     * @param {number} params.score
     * @param {number} params.maxScore
     */
    static async markCourseProgress({ uid, courseId, seriesId, testId, score, maxScore }) {
        if (!uid || courseId === '__legacy__') return;
        try {
            const { markTestComplete } = await import('../../lib/firestore/courseProgress');
            await markTestComplete({ uid, courseId, seriesId, testId, score, maxScore });
        } catch (err) {
            console.warn('[MCQService] markCourseProgress error (non-fatal):', err);
        }
    }

    /**
     * Check if student has already attempted the test.
     *
     * Identity: uses auth.currentUser.uid (primary) then localStorage uid (secondary).
     * Legacy v1 fallback is READ-ONLY for backward compat — never written.
     *
     * @param {string} email
     * @param {string} assessmentId
     * @param {string} college  (for legacy v1 fallback read only)
     * @param {string} year     (for legacy v1 fallback read only)
     * @param {string} department (unused — kept for call-site signature compat)
     * @returns {Promise<{exists: boolean, data: object|null, completed: boolean}>}
     */
    static async checkExistingAttempt(email, assessmentId, college, year, department) {
        try {
            if (!navigator.onLine) {
                console.warn('[MCQService] Client is offline, cannot check existing attempt');
                return { exists: false, data: null, completed: false, offline: true };
            }

            // CANONICAL: Firebase Auth UID is the identity for Firestore paths
            const uid = auth?.currentUser?.uid;

            // 1. Try canonical path with Firebase Auth UID
            if (uid) {
                try {
                    const tenantId = college || '_unknown_';
                    const v2Ref = doc(db, this.canonicalPath(assessmentId, uid, tenantId));
                    const v2Snap = await getDoc(v2Ref);
                    if (v2Snap.exists()) {
                        const data = v2Snap.data();
                        return {
                            exists: true,
                            data,
                            completed: data.completed === true || data.submitted === true || data.status === 'submitting' || data.status === 'submitted'
                        };
                    }
                } catch (e) { /* fall through */ }
            }

            return { exists: false, data: null, completed: false };
        } catch (error) {
            console.error('[MCQService] Error checking existing attempt:', error);
            if (error.code === 'unavailable' || error.message?.includes('offline') || error.message?.includes('network')) {
                return { exists: false, data: null, completed: false, offline: true };
            }
            return { exists: false, data: null, completed: false, error: error.message };
        }
    }

    /**
     * Fetch MCQ completion status for the current student.
     *
     * @deprecated  The legacy `colleges/.../mcq_results` path is never written by the
     *   current system. This method now returns an empty map and logs a deprecation notice.
     *   Callers should use `attemptStatusService.fetchCompletionMap()` which reads from
     *   `users/{uid}/assessmentAttempts` — the canonical completion index.
     *
     * @returns {Promise<object>} Empty object — use fetchCompletionMap() instead.
     */
    static async fetchUserAttempts(email, college, year, department) {
        console.warn(
            '[MCQService] fetchUserAttempts() is deprecated and returns empty. ' +
            'Use attemptStatusService.fetchCompletionMap() which reads from ' +
            'users/{uid}/assessmentAttempts — the canonical completion index.'
        );
        return {};
    }

    /**
     * Create initial test attempt document when test starts.
     * Uses Firebase Auth UID as the canonical document identity.
     *
     * @param {object} userData - User data from auth_data (Name, Email, College, etc.)
     * @param {object} testData - Test information
     * @returns {Promise<{success: boolean, docPath: string}>}
     */
    static async createInitialAttempt(userData, testData) {
        try {
            // CANONICAL: require live Firebase Auth UID
            const uid = getCanonicalUid();

            const { email, college, year, department, name, rollNumber, tenantId, cohortId } = userData;
            const assessmentId = testData.testInfo?.id || testData.id || 'unknown';

            // CREATE-ONCE guard:
            // Check if already exists (using UID-keyed canonical path)
            const existing = await this.checkExistingAttempt(Email, assessmentId, College, Year, Department);

            if (existing.exists && existing.completed) {
                // Terminal state — submission already confirmed. Block.
                throw new Error('DUPLICATE_SUBMISSION: Test already completed. You cannot retake this test.');
            }

            if (existing.exists && !existing.completed) {
                // Active/in-progress attempt already exists — RESUME, never overwrite.
                // This handles: reload, crash-recovery, dashboard → MCQ re-entry.
                console.log('[MCQService] Resuming existing in-progress MCQ attempt for assessmentId:', assessmentId);
                return {
                    success: true,
                    docPath: this.canonicalPath(assessmentId, uid),
                    resumed: true,
                    existing: existing.data,
                };
            }

            const initialData = {
                // ── Identity (canonical) ──────────────────────────────────────
                userId: uid,
                uid,
                email: Email,
                // ── Profile (for reporting) ───────────────────────────────────
                rollNumber: rollNumber ?? '',
                name: Name ?? '',
                college: College,
                year: Year,
                department: Department,
                tenantId: tenantId ?? '',
                cohortId: cohortId ?? '',
                // ── Assessment ────────────────────────────────────────────────
                assessmentId,
                assessmentId: assessmentId,
                assessmentTitle: testData.name || testData.testInfo?.name || 'Unknown Test',
                assessmentTitle: testData.name || testData.testInfo?.name || 'Unknown Test',
                totalQuestions: testData.questions?.length || testData.totalQuestions || 0,
                type: 'mcq',
                // ── Attempt lifecycle ─────────────────────────────────────────
                startedAt: serverTimestamp(),
                timeStarted: serverTimestamp(),
                startedAt: timeService.getNow().toISOString(),
                status: 'started',
                completed: false,
                submitted: false,
                attempts: 1,
                from: 'student',
                syncedToSheets: false,
                createdAt: serverTimestamp(),
            };

            const canonPath = await this.writeCanonicalResult(
                initialData,
                { assessmentId: assessmentId, userId: uid, userProfile: userData }
            );

            console.log('[MCQService] Initial attempt created:', canonPath);
            return { success: true, docPath: canonPath, resumed: false };
        } catch (error) {
            console.error('[MCQService] Error creating initial attempt:', error);
            throw error;
        }
    }

    /**
     * Mark attempt as submitting/completed immediately to prevent refresh reattempts.
     * @returns {Promise<boolean>}
     */
    static async markTestAsSubmitting(email, assessmentId, college, year, department) {
        try {
            // BUG FIXED: this used to set `completed: true` *before* the result
            // was written. With attempt-immutability enforced in firestore.rules
            // that would lock the document and make the real result write fail;
            // it also meant a crash mid-submit left a "completed" attempt with
            // no score at all. `status: 'submitting'` is enough to block a
            // refresh re-attempt (checkExistingAttempt treats it as taken),
            // while leaving the document writable for the final result.
            const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
            const liveUid = auth?.currentUser?.uid ?? authData.uid ?? '';
            const tenantId = authData.tenantId ?? college ?? '';
            await this.writeCanonicalResult(update, {
                assessmentId: assessmentId,
                userId: liveUid,
                userProfile: { ...authData, tenantId, email }
            });
            console.log('[MCQService] Marked test as submitting to prevent refresh reattempts');
            return true;
        } catch (error) {
            console.error('[MCQService] Error marking test as submitting:', error);
            return false;
        }
    }

    /**
     * Save MCQ result to Firestore.
     *
     * Identity: uses auth.currentUser.uid via writeBothPaths() → writeCanonicalResult().
     * The path is ALWAYS assessmentResults/{assessmentId}/students/{firebase-uid}.
     *
     * @param {object} resultData - Result data object
     * @returns {Promise<{success: boolean, docId: string}>}
     */
    static async saveResultToFirestore(resultData) {
        try {
            const {
                email,
                college,
                year,
                department,
                assessmentId,
                rollNumber,
                name,
                testName,
                score,
                totalQuestions,
                correctAnswers,
                incorrectAnswers,
                percentage,
                timeTaken,
                timeStarted,
                timeEnded,
                answers,
                autoSubmitted
            } = resultData;

            // Check if document already exists and is completed
            try {
                const existing = await this.checkExistingAttempt(email, assessmentId, college, year, department);
                if (existing.exists && existing.completed && !existing.offline && existing.data?.status !== 'submitting') {
                    throw new Error('DUPLICATE_SUBMISSION: Test has already been submitted. Multiple submissions are not allowed.');
                }
            } catch (checkError) {
                // If offline, allow to proceed (will be saved to localStorage for retry)
                if (checkError.message?.includes('NETWORK_ERROR') || !navigator.onLine) {
                    throw new Error('NETWORK_ERROR: No internet connection. Your answers will be saved and submitted when connection is restored.');
                }
                // If duplicate submission error, re-throw it
                if (checkError.message?.includes('DUPLICATE_SUBMISSION')) {
                    throw checkError;
                }
                // For other errors, log and continue (Firestore will handle duplicate check)
                console.warn('[MCQService] Error checking existing attempt during save, continuing:', checkError);
            }

            // Get existing data if available (for attempts count)
            let existingData = null;
            try {
                const existingCheck = await this.checkExistingAttempt(email, assessmentId, college, year, department);
                if (existingCheck.exists) {
                    existingData = existingCheck.data;
                }
            } catch (e) { /* ignore */ }

            const { partialScore, fullScore } = this.computeScoreFields(
                score, resultData.maxScore || resultData.totalQuestions || 0, percentage
            );

            // CANONICAL: require live Firebase Auth UID
            const uid = getCanonicalUid();

            const resultDocument = {
                // ── Identity (canonical) ──────────────────────────────────────
                userId: uid,
                uid,
                email,
                rollNumber: rollNumber ?? '',
                name: name ?? '',
                college,
                year,
                department,
                tenantId: resultData.tenantId ?? '',
                cohortId: resultData.cohortId ?? '',
                // ── Assessment ────────────────────────────────────────────────
                assessmentId,
                assessmentId: assessmentId,
                assessmentTitle: testName || 'Unknown Test',
                assessmentTitle: testName || 'Unknown Test',
                type: 'mcq',
                // ── Scores ────────────────────────────────────────────────────
                score: score || 0,
                totalScore: score || 0,
                totalQuestions: totalQuestions || 0,
                maxScore: resultData.maxScore || resultData.totalQuestions || 0,
                maxScore: resultData.maxScore || resultData.totalQuestions || 0,
                correctAnswers: correctAnswers || 0,
                incorrectAnswers: incorrectAnswers || 0,
                percentage: percentage || 0,
                passed: percentage >= (resultData.passMark || 50),
                partialScore,
                fullScore,
                // ── Timing ────────────────────────────────────────────────────
                timeTaken: timeTaken || 0,
                timeTakenSeconds: timeTaken || 0,
                timeTakenFormatted: this.formatTime(timeTaken || 0),
                startedAt: timeStarted || serverTimestamp(),
                timeStarted: timeStarted || serverTimestamp(),
                startedAt: resultData.startedAt || timeService.getNow().toISOString(),
                submittedAt: serverTimestamp(),
                timeEnded: timeEnded || serverTimestamp(),
                timeEndedISO: timeService.getNow().toISOString(),
                submittedAt: timeService.getNow().toISOString(),
                // ── Status ────────────────────────────────────────────────────
                status: 'submitted',
                completed: true,
                submitted: true,
                autoSubmitted: autoSubmitted || false,
                autoSubmitReason: resultData.autoSubmitReason ?? '',
                submissionReason: autoSubmitted ? (resultData.autoSubmitReason || 'timer_expired') : 'manual',
                // ── Data ──────────────────────────────────────────────────────
                attempts: existingData?.attempts || 1,
                from: 'student',
                syncedToSheets: false,
                answers: answers || {},
                questions: resultData.questions || [],
                // ── Proctoring ────────────────────────────────────────────────
                violationCount: resultData.violationCount || 0,
                totalNoFace: resultData.totalNoFace || 0,
                totalMultipleFaces: resultData.totalMultipleFaces || 0,
                violations: resultData.violations || [],
                proctorSummary: resultData.proctorSummary || null,
                updatedAt: serverTimestamp(),
            };

            // Canonical write via writeCanonicalResult (uses uid from getCanonicalUid)
            const canonPath = await this.writeCanonicalResult(
                resultDocument,
                { assessmentId: assessmentId, userId: uid, userProfile: { uid, email, tenantId: resultData.tenantId ?? '' } }
            );
            console.log('[MCQService] Result saved to canonical path:', canonPath);

            return { success: true, docId: canonPath };
        } catch (error) {
            console.error('[MCQService] Error saving to Firestore:', error);
            throw error;
        }
    }


    /**
     * Save in-progress MCQ data to Firestore.
     *
     * BUG FIXED (P0): The previous implementation called:
     *   this.canonicalPath(assessmentId, college, year, email)
     * canonicalPath() takes exactly 2 args: (assessmentId, userId).
     * JavaScript silently discarded 'year' and 'email' — the second arg
     * ('college') became the userId, producing paths like:
     *   assessmentResults/{assessmentId}/students/KGKITE
     * instead of:
     *   assessmentResults/{assessmentId}/students/{firebase-uid}
     *
     * Fix: derive userId exclusively from auth.currentUser.uid.
     * Progress saves MUST NOT overwrite final submission fields.
     *
     * @param {object} progressData
     */
    static async saveProgressToFirestore(progressData) {
        // BUG FIX P0: get uid from live Firebase Auth — never from legacy args
        const uid = getCanonicalUid(progressData.uid);

        const {
            email,
            college,
            year,
            department,
            assessmentId,
            rollNumber,
            name,
            testName,
            score,
            totalQuestions,
            correctAnswers,
            incorrectAnswers,
            percentage,
            timeTaken,
            timeStarted,
            answers
        } = progressData;

        // Canonical path now uses Firebase Auth UID and tenantId
        let tenantId = progressData.tenantId ?? '';
        if (!tenantId || tenantId.includes(' ')) {
            try {
                const storedAuth = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
                tenantId = storedAuth.tenantId ?? '';
            } catch (_) {}
        }
        if (!tenantId || tenantId.includes(' ')) {
            tenantId = 'SEED-SEB';
        }
        const canonPath = this.canonicalPath(assessmentId, uid, tenantId);
        const docRef = doc(db, canonPath);

        // Fetch existing document to prevent overwriting completed/submitted status
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const existingData = docSnap.data();
                // CRITICAL: never overwrite a submitted/completed result with progress data
                if (existingData.completed === true || existingData.submitted === true || existingData.status === 'submitted') {
                    console.warn('[MCQService] Skipping progress sync: attempt is already submitted in Firestore. Path:', canonPath);
                    return { success: true, skipped: true };
                }
            }
        } catch (e) {
            console.warn('[MCQService] Error checking existing status during progress sync, proceeding with caution:', e);
        }

        const progressDocument = {
            // ── Identity ──────────────────────────────────────────────────────
            userId: uid,
            uid,
            email,
            rollNumber: rollNumber ?? '',
            name: name ?? '',
            college,
            year,
            department,
            tenantId: progressData.tenantId ?? '',
            // ── Assessment ────────────────────────────────────────────────────
            assessmentId,
            assessmentId: assessmentId,
            assessmentTitle: testName || 'Unknown Test',
            assessmentTitle: testName || 'Unknown Test',
            totalQuestions: totalQuestions || 0,
            // ── In-progress scores (prefixed to distinguish from final score) ─
            inProgressScore: score || 0,
            inProgressPercentage: percentage || 0,
            correctAnswers: correctAnswers || 0,
            incorrectAnswers: incorrectAnswers || 0,
            // ── Timing ────────────────────────────────────────────────────────
            progressTimeTaken: timeTaken || 0,
            progressTimeTakenFormatted: this.formatTime(timeTaken || 0),
            startedAt: timeStarted || serverTimestamp(),
            timeStarted: timeStarted || serverTimestamp(),
            startedAt: progressData.startedAt || timeService.getNow().toISOString(),
            lastProgressAt: serverTimestamp(),
            lastProgressAtISO: timeService.getNow().toISOString(),
            // ── Answers ───────────────────────────────────────────────────────
            answers: answers || {},
            // ── Status (must NOT set completed/submitted — only final submit does that) ──
            status: 'in_progress',
            completed: false,
            submitted: false,
            syncedToSheets: false,
            updatedAt: serverTimestamp(),
            autoSubmitReason: progressData.autoSubmitReason ?? '',
        };

        await setDoc(docRef, progressDocument, { merge: true });
        console.log('[MCQService] Progress saved to canonical path:', canonPath);
        return { success: true };
    }


    /**
     * Sync in-progress MCQ data to Firestore.
     * @param {object} progressData
     */
    static async syncProgress(progressData) {
        try {
            await this.saveProgressToFirestore(progressData);
            return { success: true };
        } catch (error) {
            console.error('[MCQService] Progress sync failed:', error);
            throw error;
        }
    }


    /**
     * @deprecated Supabase has been removed. This method is a no-op retained for
     * call-site compatibility only. Remove all callers.
     */
    static async markSyncedToSupabase() {
        console.warn('[MCQService] markSyncedToSupabase() is deprecated. Supabase has been removed.');
    }

    /**
     * Save unsynced result to localStorage for retry.
     * Keyed by uid + assessmentId to prevent cross-student contamination.
     * @param {object} resultData - Result data (must include uid field)
     */
    static saveUnsyncedResult(resultData) {
        try {
            const uid = auth?.currentUser?.uid || resultData.uid || 'unknown';
            const storageKey = `mcq_unsynced_${uid}`;
            const unsynced = JSON.parse(localStorage.getItem(storageKey) || '[]');
            unsynced.push({
                ...resultData,
                uid,
                retryCount: 0,
                lastRetry: null
            });
            localStorage.setItem(storageKey, JSON.stringify(unsynced));
            console.log('[MCQService] Saved unsynced result to localStorage key:', storageKey);
        } catch (error) {
            console.error('[MCQService] Error saving unsynced result:', error);
        }
    }

    /**
     * Retry syncing unsynced results for the current authenticated student.
     * Only retries results belonging to auth.currentUser.uid.
     *
     * Also recovers pending submission envelopes written by:
     *   - MCQPage (key: mcq_pending_submission_{uid}_{assessmentId})
     *   - attemptStateMachine.js (key: seed_submission_envelope_{uid}_{assessmentId})
     *
     * @returns {Promise<{synced: number, failed: number}>}
     */
    static async syncUnsyncedResults() {
        try {
            const uid = auth?.currentUser?.uid;
            if (!uid) return { synced: 0, failed: 0 };

            let synced = 0;
            let failed = 0;

            // ── 1. Retry mcq_unsynced_{uid} queue (legacy Phase 1 offline queue) ────────
            const storageKey = `mcq_unsynced_${uid}`;
            const unsynced = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const remaining = [];

            for (const result of unsynced) {
                if (result.uid && result.uid !== uid) {
                    console.warn('[MCQService] syncUnsyncedResults: skipping result with mismatched uid');
                    continue;
                }
                try {
                    await this.saveResultToFirestore({ ...result, uid });
                    synced++;
                } catch (error) {
                    console.error('[MCQService] Retry failed for result:', error);
                    result.retryCount = (result.retryCount || 0) + 1;
                    result.lastRetry = new Date().toISOString();
                    if (result.retryCount < 5) {
                        remaining.push(result);
                    } else {
                        failed++;
                    }
                }
            }
            if (remaining.length > 0) {
                localStorage.setItem(storageKey, JSON.stringify(remaining));
            } else {
                localStorage.removeItem(storageKey);
            }

            // ── 2. Retry seed_submission_envelope_{uid}_{assessmentId} (attemptStateMachine) ──
            // ──    mcq_pending_submission_{uid}_{assessmentId} (MCQPage Phase 1 handler) ──────────
            // ──    msa_pending_submission_{uid}_{assessmentId} (MultiSectionAssessment) ──────
            const ENVELOPE_PREFIXES = [
                `seed_submission_envelope_${uid}_`,
                `mcq_pending_submission_${uid}_`,
                `msa_pending_submission_${uid}_`,
            ];
            const envelopeKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && ENVELOPE_PREFIXES.some(p => key.startsWith(p))) {
                    envelopeKeys.push(key);
                }
            }

            for (const envKey of envelopeKeys) {
                try {
                    const raw = localStorage.getItem(envKey);
                    if (!raw) continue;
                    const envelope = JSON.parse(raw);

                    // Ownership check — must belong to current user
                    if (envelope.uid && envelope.uid !== uid) {
                        console.warn('[MCQService] syncUnsyncedResults: skipping envelope with mismatched uid:', envKey);
                        continue;
                    }

                    const assessmentId = envelope.assessmentId || envelope.assessmentId;
                    if (!assessmentId) continue;

                    // Check whether a confirmed result already exists in Firestore
                    // to avoid duplicate writes (idempotency).
                    const { doc: firestoreDoc, getDoc: firestoreGetDoc } = await import('firebase/firestore');
                    const { db: firestoreDb } = await import('../firebase-config');
                    const canonRef = firestoreDoc(firestoreDb, `assessmentResults/${assessmentId}/students/${uid}`);
                    const snap = await firestoreGetDoc(canonRef);
                    if (snap.exists()) {
                        const existingData = snap.data();
                        if (existingData.completed === true || existingData.status === 'submitted') {
                            // Already confirmed — safe to clear local envelope
                            localStorage.removeItem(envKey);
                            console.log('[MCQService] syncUnsyncedResults: confirmed result exists, cleared envelope:', envKey);
                            synced++;
                            continue;
                        }
                    }

                    // Result not confirmed yet — retry submission
                    if (envelope.resultPayload || envelope.totalScore !== undefined) {
                        const payload = envelope.resultPayload || envelope;
                        await this.saveResultToFirestore({ ...payload, uid, assessmentId });
                        localStorage.removeItem(envKey);
                        console.log('[MCQService] syncUnsyncedResults: retried and cleared envelope:', envKey);
                        synced++;
                    }
                } catch (envErr) {
                    console.error('[MCQService] syncUnsyncedResults: envelope retry failed:', envKey, envErr?.message);
                    failed++;
                }
            }

            if (synced > 0 || failed > 0) {
                console.log(`[MCQService] syncUnsyncedResults: synced=${synced} failed=${failed}`);
            }
            return { synced, failed };
        } catch (error) {
            console.error('[MCQService] Error syncing unsynced results:', error);
            return { synced: 0, failed: 0 };
        }
    }

    /**
     * Format time in seconds to readable format.
     * @param {number} seconds
     * @returns {string}
     */
    static formatTime(seconds) {
        if (!seconds || seconds < 0) return '0s';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    }

    /**
     * @deprecated Supabase has been removed. Returns empty data.
     * Use Firestore: assessmentResults/{assessmentId}/students/{uid}
     */
    static async fetchMCQResults(college) {
        return { success: true, data: [] };
    }

    /**
     * Submit MCQ test result (saves to Firestore).
     * @param {object} resultData - Complete result data
     * @returns {Promise<{success: boolean, firestore: boolean}>}
     */
    static async submitMCQResult(resultData) {
        let firestoreSuccess = false;
        try {
            await this.saveResultToFirestore(resultData);
            firestoreSuccess = true;
            console.log('[MCQService] Firestore save successful');
            return { success: firestoreSuccess, firestore: firestoreSuccess };
        } catch (error) {
            console.error('[MCQService] Submission failed:', error);
            throw error;
        }
    }
}

export default MCQService;
