/**
 * proctorService.js — SEED SEB Proctoring Event Logger
 *
 * v2 Firestore path:  proctoringLogs/{attemptId}/events/{eventId}
 *   where attemptId = {assessmentId}_{uid}   (Firebase Auth UID — NOT email)
 *
 * Identity rule:
 *   uid must be passed in from the authenticated component that holds
 *   auth.currentUser.uid. This service MUST NOT read localStorage to
 *   derive identity. localStorage is untrusted by policy.
 *
 * Offline queue:
 *   Events that fail to upload are queued in localStorage under a key
 *   scoped to {uid}_{assessmentId} to prevent cross-user contamination.
 *   They are retried idempotently on reconnect using the stored eventId.
 *
 * Append-only rule:
 *   Events are written with addDoc (auto-generated ID) or setDoc with
 *   a client-generated UUID. They are NEVER updated after creation.
 *   Historical events must not be modified.
 */

import { db, storage } from '../firebase-config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, setDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';

// ─── Offline Queue ─────────────────────────────────────────────────────────────

const OFFLINE_QUEUE_PREFIX = 'proctor_offline_';
const MAX_RETRY_COUNT      = 5;

function offlineQueueKey(uid, assessmentId) {
  // Scoped to uid + assessmentId to prevent cross-user contamination
  return `${OFFLINE_QUEUE_PREFIX}${uid}_${assessmentId}`;
}

function readOfflineQueue(uid, assessmentId) {
  try {
    const raw = localStorage.getItem(offlineQueueKey(uid, assessmentId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(uid, assessmentId, events) {
  try {
    localStorage.setItem(offlineQueueKey(uid, assessmentId), JSON.stringify(events));
  } catch (_) {}
}

function appendToOfflineQueue(uid, assessmentId, event) {
  const queue = readOfflineQueue(uid, assessmentId);
  // Deduplicate by eventId
  const existing = queue.find((e) => e.eventId === event.eventId);
  if (!existing) {
    queue.push(event);
    writeOfflineQueue(uid, assessmentId, queue);
  }
}

/**
 * Generate a UUID-like event ID for idempotent offline event handling.
 * @returns {string}
 */
function generateEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Sequence Counter ──────────────────────────────────────────────────────────

const sequenceCounters = new Map(); // key: `${uid}_${assessmentId}` → number

function nextSequence(uid, assessmentId) {
  const key = `${uid}_${assessmentId}`;
  const current = sequenceCounters.get(key) || 0;
  const next = current + 1;
  sequenceCounters.set(key, next);
  return next;
}

// ─── ProctorService ────────────────────────────────────────────────────────────

class ProctorService {
  /**
   * Upload a proctoring snapshot to Firebase Storage.
   *
   * @param {string} uid          — Firebase Auth UID (NOT email)
   * @param {string} assessmentId — Assessment ID
   * @param {Blob}   imageBlob    — Image blob
   * @param {string} filename     — Filename for the image
   * @returns {Promise<string|null>} Download URL or null on failure
   */
  static async uploadSnapshot(uid, assessmentId, imageBlob, filename) {
    if (!uid || !assessmentId) {
      console.error('[ProctorService] uploadSnapshot: uid and assessmentId are required.');
      return null;
    }
    try {
      if (!imageBlob) {
        console.warn('[ProctorService] No image blob provided');
        return null;
      }

      // Storage path scoped to UID (not email) to prevent cross-user data mixing
      const sanitizedUid        = uid.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedAssessment = assessmentId.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedFilename   = filename.replace(/[^a-zA-Z0-9]/g, '_');

      const storagePath = `proctor_snapshots/${sanitizedUid}/${sanitizedAssessment}/${sanitizedFilename}.jpg`;
      const storageRef  = ref(storage, storagePath);

      const snapshot    = await uploadBytes(storageRef, imageBlob, {
        contentType:  'image/jpeg',
        cacheControl: 'private, max-age=86400',
      });

      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log('[ProctorService] Snapshot uploaded:', storagePath);
      return downloadURL;

    } catch (error) {
      console.error('[ProctorService] Error uploading snapshot:', error);
      // Save for retry — do not pass email, use UID-scoped key
      this._saveOfflineSnapshot(uid, assessmentId, imageBlob, filename);
      return null;
    }
  }

  /**
   * Log a proctoring event to Firestore.
   *
   * v2 path: proctoringLogs/{assessmentId}_{uid}/events/{eventId}
   *
   * IDENTITY: uid MUST be auth.currentUser.uid — passed in from the
   * authenticated component. This method does NOT read localStorage.
   *
   * @param {string} uid          — Firebase Auth UID (required)
   * @param {string} assessmentId — Assessment ID (required)
   * @param {string} tenantId     — Tenant ID for the parent doc metadata
   * @param {object} eventData    — Event fields
   * @returns {Promise<string|null>} eventId or null on failure
   */
  static async logProctorEvent(uid, assessmentId, tenantId, eventData) {
    if (!uid || !assessmentId) {
      console.error('[ProctorService] logProctorEvent: uid and assessmentId are required. Not reading from localStorage.');
      return null;
    }

    const normEvent = eventData;
    const {
      eventType, misbehaviorCount,
      snapshotUrl, sectionId,
    } = eventData;

    const attemptId      = `${assessmentId}_${uid}`;
    const eventId        = generateEventId();
    const eventTimestamp = (normEvent.timestamp ? new Date(normEvent.timestamp).toISOString() : null) || new Date().toISOString();
    const seqNum         = nextSequence(uid, assessmentId);

    const logData = {
      // ── Identity (from Firebase Auth, not localStorage) ──────────────────
      uid,
      tenantId:        tenantId ?? '',
      attemptId,
      assessmentId,

      // ── Event data ───────────────────────────────────────────────────────
      eventId,
      type:            normEvent.type !== 'unknown' ? normEvent.type : (eventType || 'violation'),
      severity:        normEvent.severity,
      sequence:        seqNum,

      // ── Timestamps ───────────────────────────────────────────────────────
      timestamp:       serverTimestamp(),
      clientTimestamp: eventTimestamp,

      // ── Context ──────────────────────────────────────────────────────────
      sectionId:       sectionId || null,
      snapshotUrl:     snapshotUrl || null,
      metadata: {
        confidence:       normEvent.confidence,
        faceCount:        eventData.faceCount     || null,
        misbehaviorCount: misbehaviorCount        || 0,
      },

      synced: true,
    };

    try {
      // v2: proctoringLogs/{attemptId}/events/{eventId}
      const v2Ref  = collection(db, 'proctoringLogs', attemptId, 'events');
      const docRef = await addDoc(v2Ref, logData);

      // Ensure parent proctoringLogs doc exists with metadata (idempotent)
      const parentRef  = doc(db, 'proctoringLogs', attemptId);
      const parentSnap = await getDoc(parentRef);
      if (!parentSnap.exists()) {
        setDoc(parentRef, {
          uid,
          assessmentId,
          tenantId: tenantId ?? '',
          createdAt: serverTimestamp(),
        }, { merge: true }).catch(() => {});
      }

      console.log('[ProctorService] Event logged (v2):', attemptId, docRef.id, `seq=${seqNum}`);
      return docRef.id;

    } catch (error) {
      console.error('[ProctorService] Error logging proctor event:', error);
      // Queue for offline retry with full identity
      appendToOfflineQueue(uid, assessmentId, {
        ...logData,
        eventId,   // stable for idempotent retry
        synced:    false,
        retryCount: 0,
        timestamp:  eventTimestamp,  // client timestamp (serverTimestamp not available offline)
      });
      return null;
    }
  }

  /**
   * Flush queued offline proctoring events to Firestore.
   * Events are uploaded idempotently using their stored eventId.
   * Events that fail after MAX_RETRY_COUNT are dropped.
   *
   * @param {string} uid          — Firebase Auth UID
   * @param {string} assessmentId
   * @returns {Promise<{ uploaded: number, failed: number }>}
   */
  static async flushOfflineEvents(uid, assessmentId) {
    if (!uid || !assessmentId) return { uploaded: 0, failed: 0 };

    const queue    = readOfflineQueue(uid, assessmentId);
    if (queue.length === 0) return { uploaded: 0, failed: 0 };

    const remaining = [];
    let uploaded    = 0;
    let failed      = 0;

    for (const event of queue) {
      if (event.synced) continue; // Already uploaded in a previous run

      try {
        const attemptId = `${assessmentId}_${uid}`;
        // Use setDoc with stable eventId for idempotent write
        const eventRef = doc(db, 'proctoringLogs', attemptId, 'events', event.eventId);
        await setDoc(eventRef, {
          ...event,
          timestamp: serverTimestamp(), // Use server timestamp on upload
          synced:    true,
        }, { merge: false }); // Overwrite — idempotent by eventId

        uploaded++;
        console.log('[ProctorService] Offline event flushed:', event.eventId);

      } catch (err) {
        console.warn('[ProctorService] Offline flush failed for event:', event.eventId, err?.code);
        event.retryCount = (event.retryCount || 0) + 1;
        if (event.retryCount < MAX_RETRY_COUNT) {
          remaining.push(event);
        } else {
          console.error('[ProctorService] Event dropped after max retries:', event.eventId);
          failed++;
        }
      }
    }

    writeOfflineQueue(uid, assessmentId, remaining);
    console.log(`[ProctorService] Offline flush complete — uploaded: ${uploaded}, failed: ${failed}, queued: ${remaining.length}`);
    return { uploaded, failed };
  }

  /**
   * Clear all offline proctor queues for a specific user.
   * Call on logout to prevent previous student's data appearing for next login.
   *
   * @param {string} uid
   */
  static clearUserQueues(uid) {
    if (!uid) return;
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${OFFLINE_QUEUE_PREFIX}${uid}_`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      sequenceCounters.forEach((_, key) => {
        if (key.startsWith(uid)) sequenceCounters.delete(key);
      });
      console.log(`[ProctorService] Cleared ${keysToRemove.length} offline queue(s) for uid:`, uid);
    } catch (_) {}
  }

  // ── Private: offline snapshot queue ───────────────────────────────────────

  static _saveOfflineSnapshot(uid, assessmentId, imageBlob, filename) {
    try {
      const key      = `proctor_snapshots_offline_${uid}_${assessmentId}`;
      const unsynced = JSON.parse(localStorage.getItem(key) || '[]');

      const reader       = new FileReader();
      reader.onloadend   = () => {
        unsynced.push({
          uid,
          assessmentId,
          filename,
          imageData:   reader.result, // base64
          timestamp:   new Date().toISOString(),
          retryCount:  0,
        });
        localStorage.setItem(key, JSON.stringify(unsynced));
        console.log('[ProctorService] Saved offline snapshot for uid:', uid);
      };
      reader.readAsDataURL(imageBlob);
    } catch (error) {
      console.error('[ProctorService] Error saving offline snapshot:', error);
    }
  }

  /**
   * Retry uploading offline snapshots.
   * @param {string} uid
   * @param {string} assessmentId
   */
  static async retryOfflineSnapshots(uid, assessmentId) {
    if (!uid || !assessmentId) return;
    const key      = `proctor_snapshots_offline_${uid}_${assessmentId}`;
    const unsynced = JSON.parse(localStorage.getItem(key) || '[]');
    const remaining = [];

    for (const snapshot of unsynced) {
      // Validate this snapshot belongs to this uid (belt-and-braces)
      if (snapshot.uid !== uid) {
        console.warn('[ProctorService] Snapshot uid mismatch — skipping.');
        continue;
      }
      try {
        const response = await fetch(snapshot.imageData);
        const blob     = await response.blob();
        const url      = await this.uploadSnapshot(uid, assessmentId, blob, snapshot.filename);

        if (!url) {
          snapshot.retryCount++;
          if (snapshot.retryCount < MAX_RETRY_COUNT) remaining.push(snapshot);
        }
      } catch (error) {
        snapshot.retryCount++;
        if (snapshot.retryCount < MAX_RETRY_COUNT) remaining.push(snapshot);
      }
    }

    if (remaining.length > 0) {
      localStorage.setItem(key, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(key);
    }
  }
}

export default ProctorService;
