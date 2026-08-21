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
import { db, auth } from '../lib/firebase-config';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import timeService from './timeService';


/**
 * getCurrentUid — resolve Firebase Auth UID for Firestore path construction.
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
function getCurrentUid(explicitUid) {
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
     * Firestore path — tenant-scoped (4 segments).
     *
     * assessmentResults/{tenantId}/{assessmentId}/{userId}
     *
     * @param {string} assessmentId
     * @param {string} userId      — MUST be Firebase Auth UID
     * @param {string} tenantId   — student's college/tenant code (e.g. "KGKITE")
     */
    static getResultPath(assessmentId, userId, tenantId) {
        if (!assessmentId) throw new Error('[MCQService] getResultPath: assessmentId is required');
        if (!userId) throw new Error('[MCQService] getResultPath: userId (Firebase Auth UID) is required');
        if (!tenantId) throw new Error('[MCQService] getResultPath: tenantId is required');
        return `assessmentResults/${tenantId}/${assessmentId}/${userId}`;
    }


    /**
     * Write result to the single result path.
     *
     * assessmentResults/{tenantId}/{assessmentId}/{userId}
     *
     * @param {object} payload
     * @param {{ assessmentId: string, userId: string, userProfile: object }} ctx
     *   userId MUST be auth.currentUser.uid — verified at the call site.
     */
    static async writeResult(payload, { assessmentId, userId, userProfile }) {
        if (!userProfile?.tenantId) {
            throw new Error('[MCQService] writeResult: userProfile.tenantId is required');
        }
        const uid = getCurrentUid(userId);
        const tenantId = userProfile.tenantId;
        const resRef = doc(db, this.getResultPath(assessmentId, uid, tenantId));
        await setDoc(resRef, { ...payload, userId: uid, tenantId });

        // Mark attempt in the completion index so dashboard shows Completed
        try {
            const { markAssessmentCompleted, invalidateCompletionCache } = await import('./attemptStatusService');
            const email = userProfile.email;
            if (email) {
                await markAssessmentCompleted(userProfile, assessmentId);
                invalidateCompletionCache(email);
            }
        } catch (_) { /* non-fatal */ }

        return this.getResultPath(assessmentId, uid, tenantId);
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
            const tenantId = guestSession.tenantId ?? '_guest_';
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
     * Non-fatal — does not throw. Call after any writeResult or writeGuestResult.
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
            const { markTestComplete } = await import('../lib/firestore/courseProgress');
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

            const uid = auth?.currentUser?.uid;

            if (uid && college) {
                try {
                    const resRef = doc(db, this.getResultPath(assessmentId, uid, college));
                    const resSnap = await getDoc(resRef);
                    if (resSnap.exists()) {
                        const data = resSnap.data();
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
     * @returns {Promise<object>}
     */
    static async fetchUserAttempts(email, college, year, department) {
        return {};
    }

    /**
     * Create initial test attempt document when test starts.
     * Uses Firebase Auth UID as the canonical document identity.
     *
     * @param {object} userData - User data
     * @param {object} testData - Test information
     * @returns {Promise<{success: boolean, docPath: string}>}
     */
    static async createInitialAttempt(userData, testData) {
        try {
            const uid = getCurrentUid();
            const { email, college, year, department, name, rollNumber, tenantId, cohortId } = userData;
            const effectiveTenantId = tenantId || college;
            if (!effectiveTenantId) {
                throw new Error('[MCQService] createInitialAttempt: tenantId is required');
            }
            const assessmentId = testData.testInfo?.id || testData.id || 'unknown';

            const existing = await this.checkExistingAttempt(email, assessmentId, effectiveTenantId, year, department);

            if (existing.exists && existing.completed) {
                throw new Error('DUPLICATE_SUBMISSION: Test already completed. You cannot retake this test.');
            }

            if (existing.exists && !existing.completed) {
                console.log('[MCQService] Resuming existing in-progress MCQ attempt for assessmentId:', assessmentId);
                return {
                    success: true,
                    docPath: this.getResultPath(assessmentId, uid, effectiveTenantId),
                    resumed: true,
                    existing: existing.data,
                };
            }

            const initialData = {
                userId: uid,
                email: email || '',
                rollNumber: rollNumber || '',
                name: name || '',
                college: college || '',
                year: year || '',
                department: department || '',
                tenantId: effectiveTenantId,
                cohortId: cohortId || '',
                assessmentId,
                assessmentTitle: testData.name || testData.testInfo?.name || 'Unknown Test',
                totalQuestions: testData.questions?.length || testData.totalQuestions || 0,
                type: 'mcq',
                startedAt: timeService.getNow().toISOString(),
                status: 'started',
                completed: false,
                submitted: false,
                attempts: 1,
                from: 'student',
                syncedToSheets: false,
                createdAt: serverTimestamp(),
            };

            const docPath = await this.writeResult(
                initialData,
                { assessmentId, userId: uid, userProfile: { ...userData, tenantId: effectiveTenantId } }
            );

            console.log('[MCQService] Initial attempt created:', docPath);
            return { success: true, docPath, resumed: false };
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
            const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const liveUid = auth?.currentUser?.uid || authData.uid || '';
            const tenantId = authData.tenantId || college || '';
            if (!tenantId) return false;
            const update = {
                status: 'submitting',
                lastUpdatedAt: serverTimestamp(),
            };
            await this.writeResult(update, {
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
                answers,
                autoSubmitted
            } = resultData;

            const tenantId = resultData.tenantId || college;
            if (!tenantId) {
                throw new Error('[MCQService] saveResultToFirestore: tenantId is required');
            }

            try {
                const existing = await this.checkExistingAttempt(email, assessmentId, tenantId, year, department);
                if (existing.exists && existing.completed && !existing.offline && existing.data?.status !== 'submitting') {
                    throw new Error('DUPLICATE_SUBMISSION: Test has already been submitted. Multiple submissions are not allowed.');
                }
            } catch (checkError) {
                if (checkError.message?.includes('NETWORK_ERROR') || !navigator.onLine) {
                    throw new Error('NETWORK_ERROR: No internet connection. Your answers will be saved and submitted when connection is restored.');
                }
                if (checkError.message?.includes('DUPLICATE_SUBMISSION')) {
                    throw checkError;
                }
                console.warn('[MCQService] Error checking existing attempt during save, continuing:', checkError);
            }

            let existingData = null;
            try {
                const existingCheck = await this.checkExistingAttempt(email, assessmentId, tenantId, year, department);
                if (existingCheck.exists) {
                    existingData = existingCheck.data;
                }
            } catch (e) { /* ignore */ }

            const { partialScore, fullScore } = this.computeScoreFields(
                score, resultData.maxScore || resultData.totalQuestions || 0, percentage
            );

            const uid = getCurrentUid();

            const resultDocument = {
                userId: uid,
                email: email || '',
                rollNumber: rollNumber || '',
                name: name || '',
                college: college || '',
                year: year || '',
                department: department || '',
                tenantId: tenantId,
                cohortId: resultData.cohortId || '',
                assessmentId,
                assessmentTitle: testName || 'Unknown Test',
                type: 'mcq',
                score: score || 0,
                totalScore: score || 0,
                totalQuestions: totalQuestions || 0,
                maxScore: resultData.maxScore || resultData.totalQuestions || 0,
                correctAnswers: correctAnswers || 0,
                incorrectAnswers: incorrectAnswers || 0,
                percentage: percentage || 0,
                passed: percentage >= (resultData.passMark || 50),
                partialScore,
                fullScore,
                timeTaken: timeTaken || 0,
                timeTakenSeconds: timeTaken || 0,
                timeTakenFormatted: this.formatTime(timeTaken || 0),
                startedAt: resultData.startedAt || timeService.getNow().toISOString(),
                submittedAt: timeService.getNow().toISOString(),
                status: 'submitted',
                completed: true,
                submitted: true,
                autoSubmitted: Boolean(autoSubmitted),
                submissionReason: autoSubmitted ? (resultData.autoSubmitReason || 'timer_expired') : 'manual',
                attempts: existingData?.attempts || 1,
                from: 'student',
                syncedToSheets: false,
                answers: answers || {},
                questions: resultData.questions || [],
                violationCount: resultData.violationCount || 0,
                totalNoFace: resultData.totalNoFace || 0,
                totalMultipleFaces: resultData.totalMultipleFaces || 0,
                violations: resultData.violations || [],
                proctorSummary: resultData.proctorSummary || null,
                updatedAt: serverTimestamp(),
            };

            const docPath = await this.writeResult(
                resultDocument,
                { assessmentId, userId: uid, userProfile: { uid, email, tenantId } }
            );
            console.log('[MCQService] Result saved to result path:', docPath);

            return { success: true, docId: docPath };
        } catch (error) {
            console.error('[MCQService] Error saving to Firestore:', error);
            throw error;
        }
    }


    /**
     * Save in-progress MCQ data to Firestore.
     *
     * @param {object} progressData
     */
    static async saveProgressToFirestore(progressData) {
        const uid = getCurrentUid(progressData.uid);

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
            answers
        } = progressData;

        const tenantId = progressData.tenantId || college;
        if (!tenantId) {
            throw new Error('[MCQService] saveProgressToFirestore: tenantId is required');
        }
        const docPath = this.getResultPath(assessmentId, uid, tenantId);
        const docRef = doc(db, docPath);

        // Fetch existing document to prevent overwriting completed/submitted status
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const existingData = docSnap.data();
                if (existingData.completed === true || existingData.submitted === true || existingData.status === 'submitted') {
                    console.warn('[MCQService] Skipping progress sync: attempt is already submitted in Firestore. Path:', docPath);
                    return { success: true, skipped: true };
                }
            }
        } catch (e) {
            console.warn('[MCQService] Error checking existing status during progress sync, proceeding with caution:', e);
        }

        const progressDocument = {
            userId: uid,
            email: email || '',
            rollNumber: rollNumber || '',
            name: name || '',
            college: college || '',
            year: year || '',
            department: department || '',
            tenantId: tenantId,
            assessmentId,
            assessmentTitle: testName || 'Unknown Test',
            totalQuestions: totalQuestions || 0,
            inProgressScore: score || 0,
            inProgressPercentage: percentage || 0,
            correctAnswers: correctAnswers || 0,
            incorrectAnswers: incorrectAnswers || 0,
            progressTimeTaken: timeTaken || 0,
            progressTimeTakenFormatted: this.formatTime(timeTaken || 0),
            startedAt: progressData.startedAt || timeService.getNow().toISOString(),
            lastProgressAt: timeService.getNow().toISOString(),
            answers: answers || {},
            status: 'in_progress',
            completed: false,
            submitted: false,
            syncedToSheets: false,
            updatedAt: serverTimestamp(),
            autoSubmitReason: progressData.autoSubmitReason || '',
        };

        await setDoc(docRef, progressDocument, { merge: true });
        console.log('[MCQService] Progress saved to path:', docPath);
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
                    const { db: firestoreDb } = await import('../lib/firebase-config');
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
