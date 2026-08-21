/**
 * dataService.js — SEED-IT Platform (v2 — Firestore migration)
 *
 * All user data, credentials, and access control now come from Firebase
 * Firestore and Firebase Auth. GitHub fetches remain ONLY for practice
 * content (seed-contents repo), handled by contentApi / codingQuestionBankService.
 */

import {
    auth,
    db,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
} from '../lib/firebase-config';
import {
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    where,
    getDocs,
    updateDoc,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { COLLECTIONS, ROLES } from '../config/constants';
import { cacheManager } from '../utils/cacheManager';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Merges Firebase Auth identity with the canonical Firestore user document.
 * Strictly canonical fields only — no legacy alias chains.
 */
function buildAuthData(firebaseUser, profile = {}) {
    return {
        ...profile,
        uid:             firebaseUser.uid,
        email:           (firebaseUser.email ?? profile.email ?? '').toLowerCase(),
        tenantId:        profile.tenantId ?? '',
        college:         profile.college ?? '',
        name:            profile.name ?? '',
        rollNumber:      profile.rollNumber ?? '',
        cohortId:        profile.cohortId ?? '',
        year:            profile.year ?? '',
        department:      profile.department ?? '',
        role:            profile.role ?? 'student',
        isPremium:       Boolean(profile.isPremium),
        seedCredits:     typeof profile.seedCredits === 'number' ? profile.seedCredits : 0,
        streak:          typeof profile.streak === 'number' ? profile.streak : 0,
        lastStreakDate:  profile.lastStreakDate ?? null,
        photoURL:        firebaseUser.photoURL ?? profile.photoURL ?? '',
        isAuthenticated: true,
    };
}




// ────────────────────────────────────────────────────────────────────────────
// Auth
// ────────────────────────────────────────────────────────────────────────────

class DataService {
    /**
     * Sign in with Firebase Auth (email + password).
     * Reads the user profile from Firestore users/{userId}.
     * Returns the unified auth_data object on success, null on failure.
     */
    static async validateCredentials(email, password /*, role (ignored — role from Firestore) */) {
        try {
            sessionStorage.setItem('is_logging_in', 'true');

            // 1. Single-System Login Enforcement: Generate activeSessionId immediately
            const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
            localStorage.setItem('active_session_id', sessionId);
            sessionStorage.setItem('active_session_id', sessionId);

            // 2. Firebase Auth sign-in
            const credential = await signInWithEmailAndPassword(auth, email, password);
            const firebaseUser = credential.user;

            // 3. Read Firestore profile
            let profile = await DataService.getUserProfile(firebaseUser.uid);
            if (!profile && firebaseUser.email) {
                profile = await DataService.getUserProfileByEmail(firebaseUser.email.toLowerCase());
            }

            try {
                await setDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid), {
                    activeSessionId: sessionId,
                    lastLoginAt: serverTimestamp(),
                    lastLoginDevice: {
                        platform: typeof navigator !== 'undefined' ? navigator.platform : 'desktop',
                        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'SEED-SEB Desktop',
                        loginTimeISO: new Date().toISOString()
                    }
                }, { merge: true });

                // Record session in activityLogging subcollection
                await setDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid, 'activityLogging', sessionId), {
                    sessionId: sessionId,
                    loginAt: serverTimestamp(),
                    loginAtISO: new Date().toISOString(),
                    status: 'active',
                    platform: typeof navigator !== 'undefined' ? navigator.platform : 'desktop',
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'SEED-SEB Desktop'
                });
            } catch (writeErr) {
                console.warn('[DataService] Failed to record active session in Firestore:', writeErr);
            }

            const authData = buildAuthData(firebaseUser, profile);
            localStorage.setItem('auth_data', JSON.stringify(authData));

            setTimeout(() => {
                sessionStorage.removeItem('is_logging_in');
            }, 3000);

            return authData;
        } catch (error) {
            sessionStorage.removeItem('is_logging_in');
            console.error('[DataService] validateCredentials error:', error?.code || error);
            return null;
        }
    }

    /**
     * Sign out the current Firebase Auth user and clear ALL student session data.
     * This prevents a subsequent login from inheriting data belonging to the
     * previous student (stale auth_data, proctor queues, active attempt cache).
     */
    static async signOut() {
        try {
            // Read UID before clearing so ProctorService can wipe its queues
            let prevUid = null;
            try {
                const raw = localStorage.getItem('auth_data');
                if (raw) prevUid = JSON.parse(raw)?.uid || null;
            } catch (_) {}

            await signOut(auth);

            // Clear proctor offline queues for the previous user
            if (prevUid) {
                try {
                    const { default: ProctorService } = await import('./proctorService');
                    ProctorService.clearUserQueues(prevUid);
                } catch (_) {}
            }

            // Clear all student session keys from localStorage
            DataService._clearAllStudentLocalData();

        } catch (error) {
            console.error('[DataService] signOut error:', error);
            // Always clear local data even if Firebase signOut fails
            DataService._clearAllStudentLocalData();
        }
    }

    /**
     * Clear all student session keys from localStorage.
     * Called on signOut and on stale-auth detection.
     */
    static _clearAllStudentLocalData() {
        const prefixes = [
            'msaProgress_',
            'msaActiveAssessment_',
            'msa_',
            'proctor_',
            'proctor_offline_',
            'proctor_snapshots_offline_',
            'proctor_unsynced_',
            'seed_submission_envelope_',
            'completed_assessments_',
            'mcqCompleted_',
            'mcq_',
            'mcqTest',
            'practice_progress_',
            'user_activities_',
            'user_profile_',
            'seed_daily_goals_',
            'assessment_',
            'assessmentCompletion_',
            'codingAssessment',
            'coding_',
            'guest_',
            'seed_'
        ];
        const exactKeys = [
            'auth_data',
            'role',
            'active_session_id',
            'cache_version',
            'rememberedUser',
            'codingAssessmentData',
            'codingAssessmentStartTime',
            'codingAssessmentTimer',
            'codingLastActiveTime',
            'mcqTestCourseCtx',
            'mcqTestStartTime',
            'mcqTeststartedAt',
            'mcqTestDuration',
            'mcqTestData',
            'mcqTestAnswers',
            'mcqActiveTestSlug',
            'mcqLastProgressSync',
            'mcqLastActiveTime',
            'mcqPendingSubmission',
            'mcqReloadGraceDeadline',
            'mcqAutoSubmitNotice',
        ];
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (exactKeys.includes(key) || prefixes.some((p) => key.startsWith(p))) {
                toRemove.push(key);
            }
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
        try {
            sessionStorage.clear();
        } catch (_) {}
        console.log('[DataService] Cleared', toRemove.length, 'student session keys on sign-out.');
    }

    /**
     * Subscribe to auth state changes.
     * Returns the unsubscribe function.
     */
    static onAuthStateChanged(callback) {
        return onAuthStateChanged(auth, callback);
    }

    /**
     * Rebuild auth_data from the live Firebase Auth user + Firestore profile.
     * Call when the stored UID may be stale (e.g. AppShell UID mismatch detection).
     *
     * @returns {Promise<object|null>} fresh auth_data or null if not signed in
     */
    static async refreshAuthData() {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
            console.warn('[DataService] refreshAuthData: no Firebase Auth user.');
            return null;
        }
        try {
            let profile  = await DataService.getUserProfile(firebaseUser.uid);
            if (!profile && firebaseUser.email) {
                profile = await DataService.getUserProfileByEmail(firebaseUser.email.toLowerCase());
            }
            const authData = buildAuthData(firebaseUser, profile || {});
            localStorage.setItem('auth_data', JSON.stringify(authData));
            console.log('[DataService] refreshAuthData: auth_data rebuilt for uid:', firebaseUser.uid, 'tenantId:', authData.tenantId);
            return authData;
        } catch (err) {
            console.error('[DataService] refreshAuthData error:', err?.code || err);
            return null;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // User Profile (Firestore)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Read users/{userId} from Firestore.
     * Returns null if not found.
     */
    static async getUserProfile(userId) {
        try {
            const snap = await getDoc(doc(db, COLLECTIONS.USERS, userId));
            return snap.exists() ? snap.data() : null;
        } catch (error) {
            console.error('[DataService] getUserProfile error:', error);
            return null;
        }
    }

    /**
     * Get the user's Firestore profile using their email as the lookup key.
     * Falls back to querying by email field if UID lookup fails.
     */
    static async getUserProfileByEmail(email) {
        try {
            const q = query(
                collection(db, COLLECTIONS.USERS),
                where('email', '==', email)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                return { id: snap.docs[0].id, ...snap.docs[0].data() };
            }
            return null;
        } catch (error) {
            console.error('[DataService] getUserProfileByEmail error:', error);
            return null;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Tenant & Access Control (Firestore)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Read tenants/{tenantId} from Firestore.
     */
    static async getTenant(tenantId) {
        try {
            const snap = await getDoc(doc(db, COLLECTIONS.TENANTS, tenantId));
            return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        } catch (error) {
            console.error('[DataService] getTenant error:', error);
            return null;
        }
    }

    /**
     * Read tenants/{tenantId}/cohorts/{cohortId} from Firestore.
     * Supports direct tenant ID document lookup and name-based tenant resolution.
     */
    static async getTenantCohort(tenantId, cohortId) {
        try {
            if (!tenantId || !cohortId) return null;

            // 1. Direct lookup by tenantId document
            const snap = await getDoc(
                doc(db, COLLECTIONS.TENANTS, tenantId, 'cohorts', cohortId)
            );
            if (snap.exists()) return { id: snap.id, ...snap.data(), tenantId };

            // 2. Fallback: if tenantId was passed as a human-readable College Name (e.g. "KGISL Institute of Technology")
            try {
                const q = query(
                    collection(db, 'publicTenants'),
                    where('name', '==', tenantId)
                );
                const nameSnap = await getDocs(q);
                if (!nameSnap.empty) {
                    const actualTenantId = nameSnap.docs[0].id;
                    const cohortSnap = await getDoc(
                        doc(db, COLLECTIONS.TENANTS, actualTenantId, 'cohorts', cohortId)
                    );
                    if (cohortSnap.exists()) {
                        return { id: cohortSnap.id, ...cohortSnap.data(), tenantId: actualTenantId };
                    }
                }
            } catch (_) {}

            return null;
        } catch (error) {
            console.error('[DataService] getTenantCohort error:', error);
            return null;
        }
    }

    /**
     * Get access data for the current user from Firestore.
     * Returns cohort info with allowedModules (courseId::seriesId::testId keys).
     */
    static async getUserAccess(email, college) {
        try {
            const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
            const { tenantId, cohortId, year, department } = authData;

            if (!tenantId || !cohortId) {
                throw new Error('User profile is missing tenantId/cohortId. Please log in again.');
            }

            const cohort = await DataService.getTenantCohort(tenantId, cohortId);
            if (!cohort) {
                throw new Error('No access configuration found for your department. Please contact support.');
            }

            const accessData = {
                user_info: {
                    email: authData.email,
                    year: year || cohort.year,
                    department: department || cohort.department,
                    college: college || authData.college,
                    batch_start: cohort.batchStart || null,
                    batch_end: cohort.batchEnd || null,
                },
                allowed_modules: cohort.allowedModules || [],
                assessment_controls: cohort.assessmentControls || {},
            };

            const updatedAuthData = { ...authData, access: accessData };
            localStorage.setItem('auth_data', JSON.stringify(updatedAuthData));
            return accessData;
        } catch (error) {
            console.error('[DataService] getUserAccess error:', error);
            throw error;
        }
    }

    /**
     * PRIMARY DASHBOARD METHOD (v3).
     * Fetches all TestDocs for the current user from the new courses schema.
     * Returns a flat array of TestDoc objects enriched with courseTitle + seriesTitle.
     * 
     * Uses: courses/{courseId}/series/{seriesId}/tests/{testId}
     * Keys from: tenants/{tenantId}/cohorts/{cohortId}.allowedModules
     * Format: "courseId::seriesId::testId"
     *
     * SECURITY: Verifies auth.currentUser.uid matches auth_data.uid before
     * using any cached tenantId/cohortId. Prevents stale-cache test loading
     * after a user switch on the same machine.
     */
    static async getAllowedTestDocs() {
        try {
            let authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
            const liveUid = auth?.currentUser?.uid;
            const effectiveUid = liveUid || authData.uid;

            if (!effectiveUid) {
                console.warn('[DataService] getAllowedTestDocs: no authenticated Firebase user. Returning empty.');
                return [];
            }

            // If cached UID exists and doesn't match live Auth UID, rebuild cache from Firestore
            if (liveUid && authData.uid && authData.uid !== liveUid) {
                console.warn(
                    '[DataService] getAllowedTestDocs: auth_data.uid mismatch — ' +
                    `cached="${authData.uid}" live="${liveUid}". Refreshing auth_data.`
                );
                const fresh = await DataService.refreshAuthData();
                if (!fresh) {
                    console.error('[DataService] getAllowedTestDocs: failed to refresh auth_data. Returning empty.');
                    return [];
                }
                authData = fresh;
            }

            const { getAllowedTests } = await import('../lib/firestore/courses');
            const { tenantId, cohortId } = authData;

            // ── Primary path: cohort allowedModules from courses schema ───────────
            // SCENARIO 6: Only tests explicitly listed in allowedModules are returned.
            // If allowedModules is empty, the student sees no tests.
            // Do NOT fall back to loading all tests for the tenant.
            if (tenantId && cohortId) {
                const cohort = await DataService.getTenantCohort(tenantId, cohortId);
                const allowedModules = cohort?.allowedModules || [];
                if (allowedModules.length > 0) {
                    return await getAllowedTests(allowedModules);
                }
                // No allowed modules — correct behaviour: student sees nothing
                console.warn(
                    '[DataService] getAllowedTestDocs: allowedModules is empty for ' +
                    `tenantId=${tenantId} cohortId=${cohortId}. ` +
                    'No tests are assigned to this cohort. Contact admin to configure allowedModules.'
                );
                return [];
            }

            // No tenantId/cohortId — user profile incomplete
            console.warn('[DataService] getAllowedTestDocs: auth_data missing tenantId or cohortId. Returning empty.');
            return [];
        } catch (err) {
            console.error('[DataService] getAllowedTestDocs error:', err);
            return [];
        }
    }


    /**
     * Legacy getAccessControl — kept for call sites that haven't migrated.
     * New code should call getAllowedTestDocs() instead.
     * Now reads from courses schema; falls back to empty assessments.
     */
    static async getAccessControl() {
        try {
            const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
            const { College, Year, Department, college, year, department, tenantId, cohortId } = authData;

            const targetCollege = College || college || tenantId || 'DEFAULT';
            const targetYear = Year || year || cohortId || 'DEFAULT';
            const targetDept = Department || department || 'ALL';

            // Fetch allowedModules from cohort (new courseId::seriesId::testId keys)
            let allowedModules = [];
            if (tenantId && cohortId) {
                const cohort = await DataService.getTenantCohort(tenantId, cohortId);
                if (cohort) allowedModules = cohort.allowedModules || [];
            }

            // Load static practice content index
            let coursesData = {};
            try {
                const localRes = await fetch('/seed-contents/courses.json');
                if (localRes.ok) {
                    coursesData = await localRes.json();
                } else {
                    const rawRes = await fetch('https://raw.githubusercontent.com/seeditDev/seed-contents/main/courses.json');
                    if (rawRes.ok) coursesData = await rawRes.json();
                }
            } catch (_) {}

            // Ensure assessments section exists
            if (!coursesData.assessments) {
                coursesData.assessments = { title: 'Assessments', isAssessment: true, modules: {} };
            }
            if (!coursesData.assessments.modules) {
                coursesData.assessments.modules = {};
            }

            return {
                access_control: {
                    colleges: {
                        [targetCollege]: {
                            [targetYear]: {
                                [targetDept]: { allowed_modules: allowedModules }
                            }
                        }
                    }
                },
                courses: coursesData
            };
        } catch (error) {
            console.error('[DataService] getAccessControl error:', error);
            return { access_control: { colleges: {} }, courses: {} };
        }
    }


    /**
     * Check if a specific module is in the user's allowed_modules list.
     */
    static async checkModuleAccess(moduleId) {
        try {
            const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
            const allowed = authData?.access?.allowed_modules;
            if (!allowed) return false;
            return allowed.includes(moduleId);
        } catch {
            return false;
        }
    }

    /**
     * Check if the user can access a specific assessment.
     * Now reads from assessments/{assessmentId} in Firestore.
     */
    static async checkAssessmentAccess(assessmentId) {
        try {
            const snap = await getDoc(doc(db, COLLECTIONS.ASSESSMENTS, assessmentId));
            if (!snap.exists()) {
                return { allowed: false, reason: 'Assessment not found' };
            }
            const assessment = snap.data();
            const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');

            // Tenant check
            if (assessment.tenantId && assessment.tenantId !== authData.tenantId) {
                return { allowed: false, reason: 'Assessment not available for your institution' };
            }

            // Status check
            if (assessment.status !== 'active') {
                return { allowed: false, reason: `Assessment is ${assessment.status}` };
            }

            const now = new Date();
            const startTime = assessment.scheduledStart?.toDate ? assessment.scheduledStart.toDate() : new Date(assessment.scheduledStart);
            const endTime = assessment.scheduledEnd?.toDate ? assessment.scheduledEnd.toDate() : new Date(assessment.scheduledEnd);

            if (now < startTime) {
                return {
                    allowed: false,
                    reason: `Assessment starts at ${startTime.toLocaleString()}`,
                    startTime,
                    endTime,
                    duration: assessment.durationMinutes,
                };
            }

            if (now > endTime) {
                return { allowed: false, reason: `Assessment ended at ${endTime.toLocaleString()}` };
            }

            return {
                allowed: true,
                startTime,
                endTime,
                duration: assessment.durationMinutes,
                totalMarks: assessment.maxScore,
            };
        } catch (error) {
            console.error('[DataService] checkAssessmentAccess error:', error);
            return { allowed: false, reason: 'Error checking assessment access' };
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Assessments (Firestore)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Get all active assessments for the current user's tenant.
     */
    static async getActiveAssessments(tenantId) {
        try {
            const q = query(
                collection(db, COLLECTIONS.ASSESSMENTS),
                where('tenantId', '==', tenantId),
                where('status', '==', 'active')
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (error) {
            console.error('[DataService] getActiveAssessments error:', error);
            return [];
        }
    }

    /**
     * Get assessment definition including its sections.
     */
    static async getAssessment(assessmentId) {
        try {
            const snap = await getDoc(doc(db, COLLECTIONS.ASSESSMENTS, assessmentId));
            if (!snap.exists()) return null;

            const data = { id: snap.id, ...snap.data() };

            // Load sections subcollection
            const sectionsSnap = await getDocs(
                collection(db, COLLECTIONS.ASSESSMENTS, assessmentId, 'sections')
            );
            data.sections = sectionsSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.order || 0) - (b.order || 0));

            return data;
        } catch (error) {
            console.error('[DataService] getAssessment error:', error);
            return null;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // User's Assessment Attempts (Firestore)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Get all assessment attempts for a user.
     * Reads from users/{userId}/assessmentAttempts subcollection.
     */
    static async getAssessmentAttempts(userId) {
        try {
            const snap = await getDocs(
                collection(db, COLLECTIONS.USERS, userId, 'assessmentAttempts')
            );
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (error) {
            console.error('[DataService] getAssessmentAttempts error:', error);
            return [];
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Portal Links (Firestore or static fallback)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Get portal links from Firestore systemConfig/portalLinks.
     * Falls back to the GitHub CDN if Firestore doesn't have the doc.
     */
    static async getPortalLinks() {
        try {
            const sessionData = sessionStorage.getItem('portal_links');
            if (sessionData) {
                return JSON.parse(sessionData);
            }

            // Try Firestore systemConfig
            try {
                const snap = await getDoc(doc(db, COLLECTIONS.SYSTEM_CONFIG, 'portalLinks'));
                if (snap.exists()) {
                    const links = snap.data();
                    sessionStorage.setItem('portal_links', JSON.stringify(links));
                    return links;
                }
            } catch (_) {
                // Fall through to CDN
            }

            // Fallback: raw GitHub CDN
            const url = 'https://raw.githubusercontent.com/seeditDev/SEEDDB/main/portalLinks/portalLinks.json';
            const response = await fetch(url);
            if (response.ok) {
                const links = await response.json();
                sessionStorage.setItem('portal_links', JSON.stringify(links));
                return links;
            }

            throw new Error('Failed to fetch portal links from all sources');
        } catch (error) {
            console.error('[DataService] getPortalLinks error:', error);
            throw error;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Legacy compatibility shims
    // (kept so callers that still reference old method names don't break)
    // ────────────────────────────────────────────────────────────────────────

    /** @deprecated Use getUserProfile(uid) instead */
    static async getUserData(email) {
        const cacheKey = `auth_${email}`;
        return cacheManager.getLocalCache(cacheKey);
    }

    /** @deprecated Use signOut() instead */
    static clearUserData(email) {
        const cacheKey = `auth_${email}`;
        cacheManager.clearCache(cacheKey);
    }

    /**
     * fetchWithFallback — ONLY used for seed-contents (practice articles).
     * Do NOT add SEEDDB URLs here.
     */
    static async fetchWithFallback(localUrl, githubApiUrl, githubUrl, cacheKey) {
        try {
            const cachedData = cacheManager.getLocalCache(cacheKey);
            if (cachedData) return cachedData;

            try {
                const localResponse = await fetch(localUrl);
                if (localResponse.ok) {
                    const data = await localResponse.json();
                    cacheManager.setLocalCache(cacheKey, data);
                    return data;
                }
            } catch (_) {}

            try {
                const rawResponse = await fetch(`${githubUrl}?t=${Date.now()}`);
                if (rawResponse.ok) {
                    const data = await rawResponse.json();
                    cacheManager.setLocalCache(cacheKey, data);
                    return data;
                }
            } catch (_) {}

            try {
                const parsedData = await fetchContentJSON(githubApiUrl, { localFirst: false, repo: CONTENT_REPOS.SEED_CONTENTS });
                if (parsedData !== undefined) {
                    cacheManager.setLocalCache(cacheKey, parsedData);
                    return parsedData;
                }
            } catch (_) {}

            throw new Error('All fetch attempts failed');
        } catch (error) {
            console.error('[DataService] fetchWithFallback failed:', error);
            throw error;
        }
    }
}

export default DataService;
