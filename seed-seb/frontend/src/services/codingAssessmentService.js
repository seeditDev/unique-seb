/**
 * @deprecated codingAssessmentService.js
 *
 * This service is DEPRECATED as of the One Assessment Module consolidation.
 * Coding is no longer a top-level assessment type — it is a section type within
 * the unified Assessment runtime (MultiSectionAssessment.jsx).
 *
 * All new result writes go to:
 *   assessmentResults/{tenantId}/{assessmentId}/{uid}
 * via assessmentSessionService.js and MultiSectionAssessment.jsx.
 */
import { db, auth } from '../lib/firebase-config';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import timeService from './timeService';

class CodingAssessmentService {
    /**
     * Helper: compute partialScore and fullScore
     * partialScore  = actual earned score
     * fullScore     = maxScore only if student scored 100% (all hidden tests passed), else 0
     */
    static computeScoreFields(score, maxScore, percentage) {
        const partialScore = score || 0;
        const fullScore = (percentage >= 100 || (maxScore > 0 && score >= maxScore)) ? (maxScore || 0) : 0;
        return { partialScore, fullScore };
    }

    /**
     * Firestore path — tenant-scoped (4 segments).
     * assessmentResults/{tenantId}/{assessmentId}/{userId}
     */
    static getResultPath(assessmentId, userId, tenantId) {
        if (!assessmentId) throw new Error('[CodingAssessmentService] getResultPath: assessmentId is required');
        if (!userId) throw new Error('[CodingAssessmentService] getResultPath: userId (Firebase Auth UID) is required');
        if (!tenantId) throw new Error('[CodingAssessmentService] getResultPath: tenantId is required');
        return `assessmentResults/${tenantId}/${assessmentId}/${userId}`;
    }

    /**
     * Write result to the single result path.
     * assessmentResults/{tenantId}/{assessmentId}/{userId}
     */
    static async writeResult(payload, { assessmentId, userId, userProfile }) {
        if (!userProfile?.tenantId) {
            throw new Error('[CodingAssessmentService] writeResult: userProfile.tenantId is required');
        }
        const tenantId = userProfile.tenantId;
        const resRef = doc(db, this.getResultPath(assessmentId, userId, tenantId));
        await setDoc(resRef, { ...payload, id: assessmentId, assessmentId, userId, tenantId });
        return this.getResultPath(assessmentId, userId, tenantId);
    }

    /**
     * Check if student has already completed the coding assessment.
     */
    static async checkExistingAttempt(email, assessmentId, college, year, department) {
        try {
            if (!navigator.onLine) {
                console.warn('[CodingAssessmentService] Client is offline');
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
                            completed: data.completed === true || data.status === 'submitted'
                        };
                    }
                } catch (e) { /* fall through */ }
            }

            return { exists: false, data: null, completed: false };
        } catch (error) {
            console.error('[CodingAssessmentService] Error checking existing attempt:', error);
            if (error.code === 'unavailable' || error.message?.includes('offline') || error.message?.includes('network')) {
                return { exists: false, data: null, completed: false, offline: true };
            }
            return { exists: false, data: null, completed: false, error: error.message };
        }
    }

    static async fetchUserAttempts() {
        return {};
    }

    /**
     * Create initial coding attempt document when coding starts
     */
    static async createInitialAttempt(userData, assessmentData) {
        try {
            const { email, college, year, department, name, rollNumber } = userData;
            const assessmentId = assessmentData.id ?? 'unknown';

            const existing = await this.checkExistingAttempt(email, assessmentId, college, year, department);
            if (existing.exists && existing.completed) {
                throw new Error('DUPLICATE_SUBMISSION: Coding assessment already completed. Access is denied.');
            }

            const initialData = {
                id: assessmentId,
                assessmentId,
                rollNumber: rollNumber ?? '',
                name: name ?? '',
                email: email ?? '',
                college: college ?? '',
                year: year ?? '',
                department: department ?? '',
                assessmentTitle: assessmentData.title ?? assessmentData.name ?? 'Unknown Coding Assessment',
                startedAt: timeService.getNow().toISOString(),
                completed: false,
                status: 'started',
                type: 'coding',
                attempts: 1,
                from: 'student',
                createdAt: serverTimestamp()
            };

            const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const liveUid = auth?.currentUser?.uid || authData.uid || '';
            const tenantId = authData.tenantId || userData?.tenantId;
            if (!tenantId) {
                throw new Error('[CodingAssessmentService] createInitialAttempt: tenantId is required');
            }

            const docPath = await this.writeResult(initialData, {
                assessmentId,
                userId: liveUid,
                userProfile: { ...userData, tenantId }
            });

            return { success: true, docPath };
        } catch (error) {
            console.warn('[CodingAssessmentService] Could not register attempt in Firestore (non-blocking):', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Mark attempt as submitting/completed
     */
    static async markAsSubmitting(email, assessmentId, college, year, department) {
        try {
            const update = {
                status: 'submitting',
                submittedAt: serverTimestamp(),
            };
            const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const liveUid = auth?.currentUser?.uid || authData.uid || '';
            const tenantId = authData.tenantId || college;
            if (!tenantId) return false;
            await this.writeResult(update, {
                assessmentId,
                userId: liveUid,
                userProfile: { ...authData, tenantId, email }
            });

            return true;
        } catch (error) {
            console.warn('[CodingAssessmentService] markAsSubmitting skipped (non-blocking):', error.message);
            return false;
        }
    }

    /**
     * Save result to Firestore — writes to assessmentResults path
     */
    static async saveResultToFirestore(resultData) {
        try {
            const {
                email,
                college,
                year,
                department,
                rollNumber,
                name,
                assessmentTitle,
                score,
                percentage,
                timeTakenSeconds,
                autoSubmitted,
                submissionReason,
                violations,
                violationCount,
                languageUsed,
                executionStats
            } = resultData;

            const targetId = resultData.id || resultData.assessmentId || 'unknown';
            const maxScore = resultData.maxScore || 100;
            const { partialScore, fullScore } = this.computeScoreFields(score, maxScore, percentage);

            const resultDocument = {
                id: targetId,
                assessmentId: targetId,
                rollNumber: rollNumber || '',
                name: name || '',
                email: email || '',
                college: college || '',
                year: year || '',
                department: department || '',
                assessmentTitle: assessmentTitle || 'Unknown Coding Assessment',
                type: 'coding',
                totalScore: score || 0,
                maxScore,
                percentage: percentage || 0,
                partialScore,
                fullScore,
                timeTakenSeconds: timeTakenSeconds || 0,
                startedAt: resultData.startedAt || timeService.getNow().toISOString(),
                submittedAt: timeService.getNow().toISOString(),
                completed: true,
                status: 'submitted',
                autoSubmitted: Boolean(autoSubmitted),
                submissionReason: submissionReason || 'manual',
                languageUsed: languageUsed || '',
                executionStats: executionStats || {},
                coding: resultData.coding || [],
                violations: violations || [],
                violationCount: violationCount || 0,
                updatedAt: serverTimestamp()
            };

            const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const liveUid = auth?.currentUser?.uid || authData.uid || '';
            const tenantId = authData.tenantId || resultData.tenantId;
            if (!tenantId) {
                throw new Error('[CodingAssessmentService] saveResultToFirestore: tenantId is required');
            }

            const docPath = await this.writeResult(resultDocument, {
                assessmentId: targetId,
                userId: liveUid,
                userProfile: { ...authData, tenantId, email }
            });

            return { success: true, docId: docPath };
        } catch (error) {
            console.error('[CodingAssessmentService] Error saving to Firestore:', error);
            throw error;
        }
    }

    /**
     * Complete submission (saves to Firestore)
     */
    static async submitCodingResult(resultData) {
        let firestoreOk = false;
        try {
            await this.saveResultToFirestore(resultData);
            firestoreOk = true;
        } catch (err) {
            console.warn('[CodingAssessmentService] Firestore submission failed (non-blocking):', err.message);
        }
        return { success: true, firestoreOk };
    }

    /**
     * Sync progress code backing up to Firestore during the assessment
     */
    static async syncProgress(progressData) {
        try {
            const {
                email,
                college,
                year,
                department,
                rollNumber,
                name,
                assessmentTitle,
                timeTakenSeconds,
                answers,
                codeMap
            } = progressData;

            const targetId = progressData.assessmentId || 'unknown';
            const authDataSync = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const liveUid = auth?.currentUser?.uid || authDataSync.uid || '';
            const tenantId = authDataSync.tenantId || progressData.tenantId;
            if (!tenantId) {
                throw new Error('[CodingAssessmentService] syncProgress: tenantId is required');
            }

            const docPath = this.getResultPath(targetId, liveUid, tenantId);
            const docRef = doc(db, docPath);
            try {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists() && docSnap.data().completed) {
                    return { success: true, skipped: true };
                }
            } catch (e) { }

            const progressDocument = {
                id: targetId,
                assessmentId: targetId,
                rollNumber: rollNumber || '',
                name: name || '',
                email: email || '',
                college: college || '',
                year: year || '',
                department: department || '',
                assessmentTitle: assessmentTitle || 'Unknown Coding Assessment',
                type: 'coding',
                timeTakenSeconds: timeTakenSeconds || 0,
                startedAt: progressData.startedAt || timeService.getNow().toISOString(),
                lastProgressAt: timeService.getNow().toISOString(),
                answers: answers || {},
                codeMap: codeMap || {},
                completed: false,
                status: 'in_progress',
                updatedAt: serverTimestamp()
            };

            await this.writeResult(progressDocument, {
                assessmentId: targetId,
                userId: liveUid,
                userProfile: { ...authDataSync, tenantId, email }
            });

            return { success: true };
        } catch (error) {
            console.error('[CodingAssessmentService] Progress backup failed:', error);
            throw error;
        }
    }

    static formatTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return [
            hrs.toString().padStart(2, '0'),
            mins.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0')
        ].join(':');
    }
}

export default CodingAssessmentService;
