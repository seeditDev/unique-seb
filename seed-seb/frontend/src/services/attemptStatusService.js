import { db, auth } from '../lib/firebase-config';
import {
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { requireTenant } from '../utils/tenant';


/**
 * Batched assessment-completion lookup.
 *
 * BUG FIXED (P0): StudentDashboard looped every assessment through a
 * Promise.all of per-item getDoc / MCQService.checkExistingAttempt /
 * CodingAssessmentService.checkExistingAttempt. 30 assessments cost 30-90
 * uncached Firestore reads on EVERY dashboard mount and every tab switch.
 *
 * This module replaces that with:
 *   1. a single read of the denormalised `completedAssessmentIds` array on the
 *      student's user document (fast path, 1 read), and
 *   2. a bounded fallback: at most one `documentId() in [...]` query per
 *      student-scoped result collection, chunked at 30 ids (Firestore's limit).
 *
 * A 60s sessionStorage cache stops tab switches from re-fetching at all.
 */

const CACHE_PREFIX = 'assessmentCompletion_';
const CACHE_TTL_MS = 60 * 1000;
const IN_CHUNK = 30;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const isCompletedDoc = (data) =>
  data?.completed === true ||
  data?.submitted === true ||
  data?.status === 'submitted' ||
  data?.status === 'submitting';

function cacheKey(email) {
  return `${CACHE_PREFIX}${String(email ?? '').toLowerCase()}`;
}

export function readCompletionCache(email) {
  try {
    const raw = sessionStorage.getItem(cacheKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.map || null;
  } catch (_) {
    return null;
  }
}

function writeCompletionCache(email, map) {
  try {
    sessionStorage.setItem(cacheKey(email), JSON.stringify({ at: Date.now(), map }));
  } catch (_) { }
}

export function invalidateCompletionCache(email) {
  try {
    sessionStorage.removeItem(cacheKey(email));
  } catch (_) { }
}

/**
 * Canonical fallback: for each unknown assessmentId, read
 * assessmentResults/{assessmentId}/students/{uid} directly.
 *
 * Replaces the legacy colleges/{college}/years/{year}/... path which is no
 * longer written by any assessment engine.
 *
 * @param {string} uid          — Firebase Auth UID
 * @param {string[]} ids        — assessment IDs to check
 * @returns {Promise<Record<string,boolean>>} id -> completed
 */
async function queryResultPaths(uid, ids, tenantId) {
  const found = {};
  if (!uid || !ids?.length || !tenantId) return found;
  // Batch: up to IN_CHUNK parallel reads (4 segments: assessmentResults/{tenantId}/{id}/{uid})
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const batch = ids.slice(i, i + IN_CHUNK);
    const snaps = await Promise.allSettled(
      batch.map((id) => getDoc(doc(db, `assessmentResults/${tenantId}/${id}/${uid}`)))
    );
    snaps.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value.exists()) {
        if (isCompletedDoc(result.value.data())) {
          found[batch[idx]] = true;
        }
      }
    });
  }
  return found;
}

/**
 * @param {object} userData signed-in profile
 * @param {string[]} assessmentIds ids shown on the dashboard
 * @param {{force?:boolean}} [options]
 * @returns {Promise<Record<string, boolean>>} id -> completed
 */
export async function fetchCompletionMap(userData, assessmentIds = [], options = {}) {
  // ── Tenant resolution ─────────────────────────────────────────────────────
  // If College/Year are missing the student still gets their assessment list;
  // we just cannot look up completions in the per-college Firestore paths.
  // Return a map of all-false ("not completed") gracefully instead of throwing.
  let tenant;
  try {
    tenant = requireTenant(userData);
  } catch (e) {
    // TENANT_INCOMPLETE — profile not fully populated yet (normal for new
    // students whose enrichProfile background fetch hasn't resolved).
    // Log once at debug level and return empty-completion map.
    console.debug('[attemptStatusService] profile incomplete, skipping completion lookup:', e?.message?.split('.')[0]);
    const ids = Array.from(new Set(assessmentIds.filter(Boolean).map(String)));
    const map = {};
    ids.forEach((id) => { map[id] = false; });
    return map;
  }
  const ids = Array.from(new Set(assessmentIds.filter(Boolean).map(String)));
  if (ids.length === 0) return {};

  const map = {};
  ids.forEach((id) => { map[id] = false; });

  // 0. Merge from local storage completion list
  const localKey = `completed_assessments_${tenant.email.toLowerCase()}`;
  try {
    const localList = JSON.parse(localStorage.getItem(localKey) || '[]');
    if (Array.isArray(localList)) {
      localList.forEach((id) => {
        if (id in map) map[id] = true;
      });
    }
  } catch (_) { }

  if (!options.force) {
    const cached = readCompletionCache(tenant.email);
    if (cached) {
      const covered = ids.every((id) => id in cached);
      if (covered) {
        Object.keys(cached).forEach((id) => {
          if (cached[id]) map[id] = true;
        });
        return { ...cached, ...map };
      }
    }
  }

  // 1. Fast path — denormalised completion list on the user doc (1 read).
  let denormalisedComplete = false;
  const user = userData;
  const userKey = user.uid || tenant.email;
  try {
    let userSnap = await getDoc(doc(db, 'users', userKey));
    if (!userSnap.exists() && userKey !== tenant.email && tenant.email) {
      userSnap = await getDoc(doc(db, 'users', tenant.email));
    }
    const list = userSnap.exists() ? userSnap.data()?.completedAssessmentIds : null;
    if (Array.isArray(list)) {
      list.forEach((id) => {
        if (id in map) map[id] = true;
      });
      denormalisedComplete = userSnap.data()?.completionIndexComplete === true;
    }
  } catch (e) {
    if (e?.code !== 'permission-denied') {
      console.warn('[attemptStatusService] user completion index unavailable:', e?.message);
    }
  }

  // 2. Result lookup: read assessmentResults/{tenantId}/{id}/{uid} for each
  // unknown assessment. Capped at 50 items to prevent runaway reads.
  if (!denormalisedComplete) {
    // Only read up to 50 unknown IDs to bound Firestore cost
    const unknown = ids.filter((id) => !map[id]).slice(0, 50);
    if (unknown.length > 0) {
      const liveUid = auth?.currentUser?.uid || userKey;
      const tenantId = userData?.tenantId || user?.tenantId;
      if (tenantId) {
        try {
          const resFound = await queryResultPaths(liveUid, unknown, tenantId);
          Object.keys(resFound).forEach((id) => { map[id] = true; });
        } catch (e) {
          console.warn('[attemptStatusService] result lookup failed:', e?.message);
        }
      }
    }
  }

  writeCompletionCache(tenant.email, map);
  return map;
}

/**
 * Record completion on the student's user document so the dashboard never has
 * to fan out per-assessment reads again. Written transactionally at submission.
 * Always persists locally to localStorage so permissions or network issues never lose progress.
 */
export async function markAssessmentCompleted(userData, assessmentId) {
  if (!assessmentId) return false;
  let tenant;
  try {
    tenant = requireTenant(userData);
  } catch (e) {
    console.warn('[attemptStatusService] cannot index completion:', e.message);
    return false;
  }

  // 1. ALWAYS update local cache FIRST (localStorage + sessionStorage)
  const localKey = `completed_assessments_${tenant.email.toLowerCase()}`;
  try {
    const localList = JSON.parse(localStorage.getItem(localKey) || '[]');
    if (Array.isArray(localList) && !localList.includes(assessmentId)) {
      localList.push(assessmentId);
      localStorage.setItem(localKey, JSON.stringify(localList));
    }
  } catch (_) { }

  const cached = readCompletionCache(tenant.email) || {};
  writeCompletionCache(tenant.email, { ...cached, [assessmentId]: true });

  // 2. Try updating Firestore remote user document
  const userKey = userData?.uid || tenant.email;
  const ref = doc(db, 'users', userKey);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists() && Array.isArray(snap.data()?.completedAssessmentIds)
        ? snap.data().completedAssessmentIds
        : [];
      if (existing.includes(assessmentId)) return;
      tx.set(
        ref,
        {
          email: tenant.email,
          college: tenant.college,
          year: tenant.year,
          completedAssessmentIds: [...existing, assessmentId],
          completionIndexUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  } catch (e) {
    if (e?.code !== 'permission-denied') {
      console.warn('[attemptStatusService] transaction failed, using arrayUnion:', e?.message);
    }
    try {
      await setDoc(

        ref,
        {
          email: tenant.email,
          completedAssessmentIds: arrayUnion(assessmentId),
          completionIndexUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e2) {
      if (e2?.code === 'permission-denied' || e2?.message?.includes('permission') || e2?.message?.includes('403')) {
        console.info('[attemptStatusService] Firestore rules restricted remote write for', tenant.email, '- completion saved locally.');
      } else {
        console.warn('[attemptStatusService] completion index write failed:', e2?.message);
      }
    }
  }

  return true;
}

export default { fetchCompletionMap, markAssessmentCompleted, invalidateCompletionCache };
