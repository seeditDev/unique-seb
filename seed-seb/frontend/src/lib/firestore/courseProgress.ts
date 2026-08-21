/**
 * courseProgress.ts — SEB course completion tracking
 *
 * Writes to: users/{uid}/courseProgress/{courseId}
 * Called after every MCQ / Coding / SEA submission.
 */

import { getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

function getDb() {
  const apps = getApps();
  if (!apps.length) throw new Error("[courseProgress.ts] Firebase not initialised");
  return getFirestore(apps[0]!);
}

export interface TestProgress {
  status: "completed" | "attempted";
  score: number;
  maxScore: number;
  submittedAt: unknown; // Firestore Timestamp
}

export interface SeriesProgress {
  total: number;
  completed: number;
  tests: Record<string, TestProgress>;
}

export interface CourseProgress {
  courseId: string;
  lastUpdated: unknown;
  series: Record<string, SeriesProgress>;
}

/** Get course progress for a user. Returns null if not started yet. */
export async function getCourseProgress(
  uid: string,
  courseId: string,
): Promise<CourseProgress | null> {
  try {
    const snap = await getDoc(doc(getDb(), "users", uid, "courseProgress", courseId));
    if (!snap.exists()) return null;
    return snap.data() as CourseProgress;
  } catch (err) {
    console.error("[courseProgress.ts] getCourseProgress error:", err);
    return null;
  }
}

/**
 * Mark a test as completed and update the series completion counter.
 * Safe to call multiple times — only updates score if new score is higher.
 */
export async function markTestComplete(params: {
  uid: string;
  courseId: string;
  seriesId: string;
  assessmentId: string;
  score: number;
  maxScore: number;
  totalTestsInSeries?: number;
}): Promise<void> {
  const { uid, courseId, seriesId, testId, score, maxScore, totalTestsInSeries } = params;
  try {
    const db = getDb();
    const ref = doc(db, "users", uid, "courseProgress", courseId);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data() as CourseProgress) : null;

    const existingSeries: SeriesProgress = existing?.series?.[seriesId] ?? {
      total: totalTestsInSeries ?? 0,
      completed: 0,
      tests: {},
    };

    const existingTest = existingSeries.tests?.[testId];
    const wasCompleted = existingTest?.status === "completed";

    // Only increment completed count if this is a new completion
    const newCompleted = wasCompleted ? existingSeries.completed : existingSeries.completed + 1;

    const updatedTest: TestProgress = {
      status: "completed",
      score: Math.max(existingTest?.score ?? 0, score), // keep highest score
      maxScore,
      submittedAt: serverTimestamp(),
    };

    await setDoc(
      ref,
      {
        courseId,
        lastUpdated: serverTimestamp(),
        series: {
          [seriesId]: {
            total: totalTestsInSeries ?? existingSeries.total,
            completed: newCompleted,
            tests: {
              [testId]: updatedTest,
            },
          },
        },
      },
      { merge: true },
    );
  } catch (err) {
    console.error("[courseProgress.ts] markTestComplete error:", err);
  }
}

/** Get completion percentage for a specific series. */
export function getSeriesCompletionPct(progress: CourseProgress | null, seriesId: string): number {
  const sp = progress?.series?.[seriesId];
  if (!sp || sp.total === 0) return 0;
  return Math.round((sp.completed / sp.total) * 100);
}
