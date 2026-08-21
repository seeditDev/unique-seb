/**
 * courses.ts — SEB Firestore course/series/test reader
 *
 * Mirrors the schema written by SEED Admin Portal:
 *   courses/{courseId}/series/{seriesId}/tests/{testId}
 *
 * Module key format (stored in cohort.allowedModules):
 *   "courseId::seriesId::testId"
 */

import { getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  collectionGroup,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

function getDb() {
  const apps = getApps();
  if (!apps.length) throw new Error("[courses.ts] Firebase not initialised");
  return getFirestore(apps[0]!);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleConfig {
  start: string | null;
  end: string | null;
  autoClose: boolean;
}

export interface TestSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowLanguageSwitch: boolean;
  showResultAfterSubmit: boolean;
  allowedLanguages: string[];
  forwardOnly: boolean;
  autoSubmit: boolean;
  questionTimer: number;
  questionTimerList: string;
  timerRestrictedSubmit: boolean;
}

export interface MSASection {
  id: string;
  name: string;
  type: "mcq" | "coding" | "sea";
  cdnUrl: string;
  assessmentId: string;
  duration_minutes: number;
  totalMarks: number;
  questionTimer: number;
  allowLanguageSwitch: boolean;
  questionTimerList: string;
  timerRestrictedSubmit: boolean;
  forwardOnly: boolean;
}

export interface TestDoc {
  id: string;
  courseId: string;
  seriesId: string;
  name: string;
  description: string;
  type: "mcq" | "coding" | "sea" | "spoken-english" | "msa";
  cdnUrl: string;
  assessmentId: string;
  sections: MSASection[];
  duration_minutes: number;
  totalMarks: number;
  difficulty: "Easy" | "Medium" | "Hard";
  proctored: boolean;
  audioProctored: boolean;
  maxViolations: number;
  maxAudioViolations: number;
  maxAttempts: number;
  passkey: string;
  isPremium: boolean;
  display_order: number;
  schedule: ScheduleConfig;
  settings: TestSettings;
  /** Populated at runtime with course/series metadata for UI display */
  courseTitle?: string;
  seriesTitle?: string;
}

export interface CourseDoc {
  id: string;
  title: string;
  description: string;
  display_order: number;
  active: boolean;
}

export interface SeriesDoc {
  id: string;
  courseId: string;
  title: string;
  description: string;
  type: string;
  display_order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module key parsing
// ─────────────────────────────────────────────────────────────────────────────

export interface NewModuleKey {
  isNew: true;
  courseId: string;
  seriesId: string;
  testId: string;
}

export function parseModuleKey(key: string): NewModuleKey | null {
  const parts = key.split("::");
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return { isNew: true, courseId: parts[0], seriesId: parts[1], testId: parts[2] };
  }
  return null; // Unrecognised key format — skip
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping helper
// ─────────────────────────────────────────────────────────────────────────────

function mapTest(
  id: string,
  courseId: string,
  seriesId: string,
  d: Record<string, unknown>,
): TestDoc {
  const s = (d["settings"] ?? {}) as Record<string, unknown>;
  return {
    id,
    courseId,
    seriesId,
    name: String(d["name"] ?? id),
    description: String(d["description"] ?? ""),
    type: (d["type"] as TestDoc["type"]) ?? "mcq",
    cdnUrl: String(d["cdnUrl"] ?? ""),
    assessmentId: String(d["assessmentId"] ?? ""),
    sections: Array.isArray(d["sections"]) ? (d["sections"] as MSASection[]) : [],
    duration_minutes: Number(d["duration_minutes"] ?? 60),
    totalMarks: Number(d["totalMarks"] ?? 100),
    difficulty: (d["difficulty"] as TestDoc["difficulty"]) ?? "Medium",
    proctored: Boolean(d["proctored"]),
    audioProctored: Boolean(d["audioProctored"]),
    maxViolations: Number(d["maxViolations"] ?? 5),
    maxAudioViolations: Number(d["maxAudioViolations"] ?? 3),
    maxAttempts: Number(d["maxAttempts"] ?? 1),
    passkey: String(d["passkey"] ?? ""),
    isPremium: Boolean(d["isPremium"]),
    display_order: Number(d["display_order"] ?? 999),
    schedule: (d["schedule"] as ScheduleConfig) ?? { start: null, end: null, autoClose: false },
    settings: {
      shuffleQuestions: Boolean(s["shuffleQuestions"]),
      shuffleOptions: Boolean(s["shuffleOptions"]),
      allowLanguageSwitch: s["allowLanguageSwitch"] !== false,
      showResultAfterSubmit: s["showResultAfterSubmit"] !== false,
      allowedLanguages: Array.isArray(s["allowedLanguages"])
        ? (s["allowedLanguages"] as string[])
        : ["C", "C++", "Java", "Python3"],
      forwardOnly: Boolean(s["forwardOnly"]),
      autoSubmit: Boolean(s["autoSubmit"]),
      questionTimer: Number(s["questionTimer"] ?? 0),
      questionTimerList: String(s["questionTimerList"] ?? ""),
      timerRestrictedSubmit: Boolean(s["timerRestrictedSubmit"]),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a single test from courses/{courseId}/series/{seriesId}/tests/{testId}. */
export async function getTest(
  courseId: string,
  seriesId: string,
  testId: string,
): Promise<TestDoc | null> {
  try {
    const snap = await getDoc(
      doc(getDb(), "courses", courseId, "series", seriesId, "tests", testId),
    );
    if (!snap.exists()) return null;
    return mapTest(snap.id, courseId, seriesId, snap.data() as Record<string, unknown>);
  } catch (err) {
    console.error("[courses.ts] getTest error:", err);
    return null;
  }
}

/** Fetch all tests in a series ordered by display_order. */
export async function getSeriesTests(courseId: string, seriesId: string): Promise<TestDoc[]> {
  try {
    const snap = await getDocs(
      collection(getDb(), "courses", courseId, "series", seriesId, "tests"),
    );
    return snap.docs
      .map((d) => mapTest(d.id, courseId, seriesId, d.data() as Record<string, unknown>))
      .sort((a, b) => a.display_order - b.display_order);
  } catch (err) {
    console.error("[courses.ts] getSeriesTests error:", err);
    return [];
  }
}

/**
 * Given allowedModules from a cohort, fetch all TestDocs.
 * Also fetches course + series titles for UI display.
 * Keys must be in "courseId::seriesId::testId" format. Unrecognised keys are skipped.
 */
export async function getAllowedTests(allowedModules: string[]): Promise<TestDoc[]> {
  const db = getDb();
  const parsed = allowedModules.map(parseModuleKey).filter(Boolean) as NewModuleKey[];
  if (!parsed.length) return [];

  // Collect unique courseId+seriesId pairs for title enrichment
  const seriesSet = new Map<string, { courseId: string; seriesId: string }>();
  const courseSet = new Set<string>();
  for (const k of parsed) {
    seriesSet.set(`${k.courseId}::${k.seriesId}`, { courseId: k.courseId, seriesId: k.seriesId });
    courseSet.add(k.courseId);
  }

  // Fetch course titles
  const courseTitles = new Map<string, string>();
  await Promise.all(
    Array.from(courseSet).map(async (cId) => {
      try {
        const snap = await getDoc(doc(db, "courses", cId));
        if (snap.exists()) courseTitles.set(cId, String(snap.data()["title"] ?? cId));
      } catch {
        /* skip */
      }
    }),
  );

  // Fetch series titles
  const seriesTitles = new Map<string, string>();
  await Promise.all(
    Array.from(seriesSet.values()).map(async ({ courseId, seriesId }) => {
      try {
        const snap = await getDoc(doc(db, "courses", courseId, "series", seriesId));
        if (snap.exists())
          seriesTitles.set(`${courseId}::${seriesId}`, String(snap.data()["title"] ?? seriesId));
      } catch {
        /* skip */
      }
    }),
  );

  // Fetch each test
  const results: TestDoc[] = [];
  await Promise.all(
    parsed.map(async ({ courseId, seriesId, testId }) => {
      const t = await getTest(courseId, seriesId, testId);
      if (t) {
        t.courseTitle = courseTitles.get(courseId) ?? courseId;
        t.seriesTitle = seriesTitles.get(`${courseId}::${seriesId}`) ?? seriesId;
        results.push(t);
      }
    }),
  );

  return results.sort((a, b) => a.display_order - b.display_order);
}
