import { db } from '../lib/firebase-config';
import {
    doc,
    setDoc,
    serverTimestamp,
    collection,
    query,
    where,
    getCountFromServer
} from 'firebase/firestore';
import timeService from './timeService';
import { resolveTenant } from '../utils/tenant';

const HEARTBEAT_MS = 30000;
const LIVE_COUNT_POLL_MS = 60000;
const LIVE_COUNT_MIN_INTERVAL_MS = 20000;

/**
 * Presence + live-user tracking.
 *
 * BUGS FIXED
 *  - P0 read fan-out: `subscribeToLiveCount` opened an `onSnapshot` on
 *    `collectionGroup('users')`. Every homepage/dashboard mount streamed one
 *    document per online student, and every heartbeat from every student
 *    re-delivered the whole result set to every listener — O(users^2) billed
 *    reads. It now uses `getCountFromServer`, which is billed as one read per
 *    1000 matched documents, on a slow poll with a shared subscriber list so N
 *    components cost one query.
 *  - P1 writes while hidden/idle: the 30s heartbeat fired regardless of tab
 *    visibility, so a backgrounded exam window kept writing forever and
 *    inflated DailyDuration with time the student was not present. Heartbeats
 *    are now skipped while the document is hidden and elapsed time is only
 *    accrued for visible periods.
 *  - P1 leaked timers: repeated `startTracking` calls stacked intervals. Start
 *    is now idempotent and listeners are torn down on stop.
 *  - P1 lost sessions: the browser/PyQt window closing left `IsOnline: true`
 *    forever, permanently over-counting. `pagehide` now flushes an offline mark.
 */
class TrackingService {
    constructor() {
        this.heartbeatTimer = null;
        this.currentUser = null;
        this.sessionStartTime = null;
        this.lastHeartbeatTime = null;
        this.visibleSinceLastBeat = 0;
        this.visibilityHandler = null;
        this.pagehideHandler = null;
        this.lastVisibleAt = null;

        // Shared live-count polling state.
        this.liveCountSubscribers = new Set();
        this.liveCountTimer = null;
        this.liveCountLastFetchedAt = 0;
        this.liveCountLastValue = 0;
        this.liveCountInFlight = null;
    }

    isHidden() {
        return typeof document !== 'undefined' && document.visibilityState === 'hidden';
    }

    // ISO date string YYYY-MM-DD (Firestore TTL compatible)
    getDateString() {
        const now = timeService.getNow();
        return now.toISOString().slice(0, 10);
    }

    // v2: livePresence/{dateStr}/sessions/{sessionId}
    getLivePresenceDocRef(dateStr, sessionId) {
        return doc(db, 'livePresence', dateStr, 'sessions', sessionId);
    }

    // v1 legacy path — kept for backward compat (read by old staff dashboards)
    getUserDocRef(dateStr, college, year, email) {
        const normalizedCollege = (college || 'OTHER').trim().toUpperCase();
        const normalizedYear = (year || 'OTHER').toString().trim().toUpperCase();
        const normalizedEmail = String(email).toLowerCase().replace(/[.#$[\]]/g, '_');

        return doc(db, 'LiveUsers', dateStr, 'colleges', normalizedCollege, 'years', normalizedYear, 'users', normalizedEmail);
    }

    currentUserDocRef() {
        if (!this.currentUser) return null;
        const tenant = resolveTenant(this.currentUser);
        return this.getUserDocRef(
            this.getDateString(),
            tenant.college || 'OTHER',
            tenant.year || 'OTHER',
            this.currentUser.email
        );
    }

    // v2 session doc ref
    currentSessionRef() {
        if (!this.currentUser) return null;
        const dateStr = this.getDateString();
        const uid = this.currentUser.uid || (this.currentUser.email ?? '').replace(/[@.]/g, '_');
        this.sessionId = this.sessionId || `sess_${uid}_${dateStr}`;
        return this.getLivePresenceDocRef(dateStr, this.sessionId);
    }

    async startTracking(userData) {
        if (!userData) return;
        const user = userData;
        if (!user.email && !user.uid) return;

        const email = user.email;
        const uid = user.uid || email.replace(/[@.]/g, '_');

        // Idempotent: restarting for the same student must not stack intervals.
        if (this.currentUser && (this.currentUser.uid === uid || this.currentUser.email === email) && this.heartbeatTimer) {
            return;
        }
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

        this.currentUser = { ...user, uid, email };
        this.sessionId = null; // reset so currentSessionRef() generates a fresh one
        this.sessionStartTime = timeService.now();
        this.lastHeartbeatTime = timeService.now();
        this.lastVisibleAt = this.isHidden() ? null : timeService.now();
        this.visibleSinceLastBeat = 0;

        const sessionRef = this.currentSessionRef();
        if (!sessionRef) return;

        try {
            // Ensure Firebase auth is ready before any Firestore write.
            // If anonymous auth is disabled in Firebase Console, ensureAnonymousAuth()
            // resolves to null — in that case, skip livePresence writes silently.
            const { ensureAnonymousAuth, auth } = await import('../lib/firebase-config');
            await ensureAnonymousAuth();
            if (!auth.currentUser) {
                // No authenticated session — skip Firestore tracking silently.
                this.attachLifecycleListeners();
                this.startHeartbeat();
                return;
            }

            // v2: write only to canonical livePresence/{date}/sessions/{sessionId}
            await setDoc(sessionRef, {
                userId: uid,
                email: email,
                name:        this.currentUser.name ?? '',
                tenantId:    this.currentUser.tenantId ?? '',
                cohortId:    this.currentUser.cohortId ?? '',
                assessmentId: null,
                page: typeof window !== 'undefined' ? window.location.pathname : '/',
                connectedAt: serverTimestamp(),
                lastHeartbeatAt: serverTimestamp(),
                deviceInfo: {
                    os: navigator?.userAgent || 'unknown',
                    browser: navigator?.platform || 'unknown',
                },
                isOnline: true,
            }, { merge: true });
            // NOTE: LiveUsers legacy writes removed — rules deny them and they
            // caused silent permission errors on every login.

            this.attachLifecycleListeners();
            this.startHeartbeat();
        } catch (error) {
            console.error('Error starting tracking:', error);
        }
    }

    attachLifecycleListeners() {
        if (typeof document === 'undefined') return;
        this.detachLifecycleListeners();

        this.visibilityHandler = () => {
            const now = timeService.now();
            if (this.isHidden()) {
                // Bank the visible time so far, then stop the clock.
                if (this.lastVisibleAt) {
                    this.visibleSinceLastBeat += Math.max(0, Math.floor((now - this.lastVisibleAt) / 1000));
                }
                this.lastVisibleAt = null;
            } else {
                this.lastVisibleAt = now;
                // Coming back is worth one immediate beat so the dashboard is fresh.
                this.heartbeat();
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);

        // `pagehide` fires on tab close, navigation and PyQt window teardown,
        // where `beforeunload` is unreliable. Without this, IsOnline stuck true.
        this.pagehideHandler = () => { this.stopTracking(); };
        window.addEventListener('pagehide', this.pagehideHandler);
    }

    detachLifecycleListeners() {
        if (this.visibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
        }
        if (this.pagehideHandler && typeof window !== 'undefined') {
            window.removeEventListener('pagehide', this.pagehideHandler);
        }
        this.visibilityHandler = null;
        this.pagehideHandler = null;
    }

    startHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

        // Heartbeat every 30 seconds, but only while the window is visible.
        this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    }

    async heartbeat() {
        if (!this.currentUser) return;
        // Do not burn a write (or credit idle time) while the window is hidden.
        if (this.isHidden()) return;

        // Guard: skip Firestore writes when not authenticated.
        // Covers the case where anonymous auth is disabled in the Firebase project.
        const { auth } = await import('../lib/firebase-config').catch(() => ({ auth: null }));
        if (!auth?.currentUser) return;

        const now = timeService.now();
        if (this.lastVisibleAt) {
            this.visibleSinceLastBeat += Math.max(0, Math.floor((now - this.lastVisibleAt) / 1000));
        }
        this.lastVisibleAt = now;

        const visibleSeconds = this.visibleSinceLastBeat;
        if (visibleSeconds <= 0) return;
        this.visibleSinceLastBeat = 0;
        this.lastHeartbeatTime = now;

        const sessionRef = this.currentSessionRef();
        if (!sessionRef) return;

        const sessionDuration = Math.floor((now - this.sessionStartTime) / 1000);

        try {
            // v2: use setDoc+merge instead of updateDoc so this is safe even when
            // the session doc was never created (e.g. setDoc in startTracking was
            // skipped because auth.currentUser was null at that point).
            // LiveUsers legacy heartbeat writes are removed — rules deny them.
            await setDoc(sessionRef, {
                lastHeartbeatAt: serverTimestamp(),
                page: typeof window !== 'undefined' ? window.location.pathname : '/',
                sessionDurationSeconds: sessionDuration,
                isOnline: true,
            }, { merge: true });
        } catch (error) {
            // Put the time back so it is not silently lost on a transient failure.
            this.visibleSinceLastBeat += visibleSeconds;
            console.error('Heartbeat failed:', error);
        }
    }

    async stopTracking() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        this.detachLifecycleListeners();

        if (!this.currentUser) return;

        const sessionRef = this.currentSessionRef();
        const now = timeService.now();
        if (this.lastVisibleAt) {
            this.visibleSinceLastBeat += Math.max(0, Math.floor((now - this.lastVisibleAt) / 1000));
        }
        const trailing = this.visibleSinceLastBeat;
        const sessionDuration = this.sessionStartTime
            ? Math.floor((now - this.sessionStartTime) / 1000)
            : 0;
        this.visibleSinceLastBeat = 0;
        this.lastVisibleAt = null;
        this.currentUser = null;

        if (!sessionRef) return;

        // Guard: skip Firestore writes when not authenticated.
        const { auth } = await import('../lib/firebase-config').catch(() => ({ auth: null }));
        if (!auth?.currentUser) return;

        // v2: mark canonical livePresence session offline using setDoc+merge
        // to be safe if the initial setDoc was never executed (auth was null at login time).
        // LiveUsers write removed — rules deny it and it caused silent errors on logout.
        try {
            await setDoc(sessionRef, {
                isOnline: false,
                disconnectedAt: serverTimestamp(),
                sessionDurationSeconds: sessionDuration,
                ...(trailing > 0 ? { finalVisibleSeconds: trailing } : {}),
            }, { merge: true });
        } catch (error) {
            console.error('Error stopping tracking:', error);
        }
    }

    // ---------------- live count ----------------

    async fetchLiveCount() {
        // v2: count active sessions in canonical livePresence/{date}/sessions.
        // Requires Firestore index: livePresence/sessions collection group, isOnline ASC.
        const dateStr = this.getDateString();
        const sessionsCol = collection(db, 'livePresence', dateStr, 'sessions');
        const q = query(sessionsCol, where('isOnline', '==', true));
        const snapshot = await getCountFromServer(q);
        return snapshot.data().count;
    }

    async refreshLiveCount(force = false) {
        const now = Date.now();
        if (!force && now - this.liveCountLastFetchedAt < LIVE_COUNT_MIN_INTERVAL_MS) {
            return this.liveCountLastValue;
        }
        // Coalesce concurrent callers into a single query.
        if (this.liveCountInFlight) return this.liveCountInFlight;

        this.liveCountInFlight = (async () => {
            try {
                const count = await this.fetchLiveCount();
                this.liveCountLastValue = count;
                this.liveCountLastFetchedAt = Date.now();
                this.liveCountSubscribers.forEach((cb) => {
                    try { cb(count); } catch (_) {}
                });
                return count;
            } catch (error) {
                console.error('Live count query failed:', error);
                this.liveCountSubscribers.forEach((cb) => {
                    try { cb(this.liveCountLastValue); } catch (_) {}
                });
                return this.liveCountLastValue;
            } finally {
                this.liveCountInFlight = null;
            }
        })();

        return this.liveCountInFlight;
    }

    /**
     * Subscribe to the live-user count. Signature is unchanged (returns an
     * unsubscribe function) so existing call sites keep working, but the
     * transport is now a shared, visibility-aware poll rather than a realtime
     * collection-group snapshot.
     */
    subscribeToLiveCount(callback) {
        if (typeof callback !== 'function') return () => {};

        this.liveCountSubscribers.add(callback);
        // Serve the cached value instantly so the UI never flashes 0.
        if (this.liveCountLastFetchedAt) callback(this.liveCountLastValue);
        this.refreshLiveCount();

        if (!this.liveCountTimer) {
            this.liveCountTimer = setInterval(() => {
                if (this.isHidden()) return; // no polling for a hidden tab
                this.refreshLiveCount();
            }, LIVE_COUNT_POLL_MS);
        }

        let active = true;
        return () => {
            if (!active) return;
            active = false;
            this.liveCountSubscribers.delete(callback);
            if (this.liveCountSubscribers.size === 0 && this.liveCountTimer) {
                clearInterval(this.liveCountTimer);
                this.liveCountTimer = null;
            }
        };
    }
}

export default new TrackingService();
