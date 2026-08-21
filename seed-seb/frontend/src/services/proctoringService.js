/**
 * proctoringService.js — LEGACY / DEPRECATED
 *
 * @deprecated This file has NO callers in the current codebase.
 *   All proctoring events are logged via proctorService.js which writes to:
 *   proctoringLogs/{attemptId}/events/{eventId}   (UID-keyed, Firestore v2)
 *
 * The legacy paths written here (colleges/.../mcq_results/.../proctor_events)
 * are NOT written by any active assessment engine. They exist only for
 * historical audit reads from old submissions.
 *
 * DO NOT add new callers to this file.
 * DO NOT remove this file until legacy data migration is complete.
 */
import { db } from '../lib/firebase-config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import timeService from './timeService';

class ProctoringService {

    /**
     * Log a proctoring event to Firestore
     * @param {string} studentEmail - Student email
     * @param {string} assessmentId - Test ID
     * @param {string} college - College name
     * @param {string} year - Academic year
     * @param {string} department - Department name
     * @param {object} eventData - Event data
     * @returns {Promise<{success: boolean, docId: string}>}
     */
    static async logProctorEvent(studentEmail, assessmentId, college, year, department, eventData) {
        try {
            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${studentEmail}/mcq_results/${assessmentId}/proctor_events`;
            const eventsRef = collection(db, docPath);

            const eventDocument = {
                ...eventData,
                timestamp: serverTimestamp(),
                timestampISO: timeService.getNow().toISOString(),
                studentEmail,
                assessmentId,
                college,
                year,
                department
            };

            const docRef = await addDoc(eventsRef, eventDocument);
            console.log('[ProctoringService] Event logged:', docRef.id);
            return { success: true, docId: docRef.id };
        } catch (error) {
            console.error('[ProctoringService] Error logging event:', error);
            
            // Save to localStorage for retry if offline
            if (!navigator.onLine || error.code === 'unavailable') {
                this.saveEventToLocalStorage(studentEmail, assessmentId, college, year, department, eventData);
            }
            
            throw error;
        }
    }

    /**
     * Save event to localStorage for offline retry
     */
    static saveEventToLocalStorage(studentEmail, assessmentId, college, year, department, eventData) {
        try {
            const key = `proctor_events_${studentEmail}_${assessmentId}`;
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push({
                ...eventData,
                timestampISO: timeService.getNow().toISOString(),
                studentEmail,
                assessmentId,
                college,
                year,
                department
            });
            localStorage.setItem(key, JSON.stringify(existing));
            console.log('[ProctoringService] Event saved to localStorage for retry');
        } catch (error) {
            console.error('[ProctoringService] Error saving to localStorage:', error);
        }
    }

    /**
     * Retry syncing offline events
     */
    static async syncOfflineEvents(studentEmail, assessmentId) {
        try {
            const key = `proctor_events_${studentEmail}_${assessmentId}`;
            const events = JSON.parse(localStorage.getItem(key) || '[]');
            if (events.length === 0) return { synced: 0, failed: 0 };

            let synced = 0;
            let failed = 0;
            const remaining = [];

            for (const event of events) {
                try {
                    await this.logProctorEvent(
                        event.studentEmail,
                        event.assessmentId,
                        event.college,
                        event.year,
                        event.department,
                        {
                            eventType: event.eventType,
                            severity: event.severity,
                            count: event.count,
                            details: event.details,
                            snapshot: event.snapshot
                        }
                    );
                    synced++;
                } catch (error) {
                    console.error('[ProctoringService] Retry failed:', error);
                    remaining.push(event);
                    failed++;
                }
            }

            if (remaining.length > 0) {
                localStorage.setItem(key, JSON.stringify(remaining));
            } else {
                localStorage.removeItem(key);
            }

            return { synced, failed };
        } catch (error) {
            console.error('[ProctoringService] Error syncing offline events:', error);
            return { synced: 0, failed: 0 };
        }
    }

    /**
     * Update test result with proctoring summary
     * @param {string} studentEmail - Student email
     * @param {string} assessmentId - Test ID
     * @param {string} college - College name
     * @param {string} year - Academic year
     * @param {string} department - Department name
     * @param {object} proctoringSummary - Summary data
     */
    static async updateTestResultWithProctoring(studentEmail, assessmentId, college, year, department, proctoringSummary) {
        try {
            const { doc, setDoc } = await import('firebase/firestore');
            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${studentEmail}/mcq_results/${assessmentId}`;
            const docRef = doc(db, docPath);

            await setDoc(docRef, {
                proctoring: {
                    ...proctoringSummary,
                    updatedAt: serverTimestamp(),
                    updatedAtISO: timeService.getNow().toISOString()
                }
            }, { merge: true });

            console.log('[ProctoringService] Proctoring summary updated');
        } catch (error) {
            console.error('[ProctoringService] Error updating proctoring summary:', error);
            throw error;
        }
    }
}

export default ProctoringService;
