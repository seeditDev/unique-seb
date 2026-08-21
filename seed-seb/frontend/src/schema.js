/**
 * schema.js — SEED-IT Canonical Field Contract
 *
 * This is the ONLY place field names are defined.
 * Every file in this app reads from objects that already match this schema.
 * There is NO normalization, NO fallback chains, NO aliases.
 *
 * Sources that write to Firestore are responsible for producing canonical docs.
 * Sources that read from Firestore/JSON receive canonical docs — read directly.
 */

// ─── User (Firestore: users/{uid}) ───────────────────────────────────────────
export const USER_FIELDS = Object.freeze({
  uid:            'uid',
  email:          'email',
  name:           'name',
  rollNumber:     'rollNumber',
  tenantId:       'tenantId',
  college:        'college',
  cohortId:       'cohortId',
  year:           'year',
  department:     'department',
  role:           'role',
  isPremium:      'isPremium',
  seedCredits:    'seedCredits',
  streak:         'streak',
  lastStreakDate: 'lastStreakDate',
  photoURL:       'photoURL',
});

// ─── MCQ Assessment (JSON file) ───────────────────────────────────────────────
export const MCQ_ASSESSMENT_FIELDS = Object.freeze({
  id:             'id',
  title:          'name',         // MCQ JSON uses "name"
  section:        'section',
  topic:          'topic',
  difficulty:     'difficulty',
  duration:       'duration',     // minutes
  totalQuestions: 'totalQuestions',
  questions:      'questions',
});

export const MCQ_QUESTION_FIELDS = Object.freeze({
  id:            'id',
  question:      'question',
  options:       'options',
  correctAnswer: 'correctAnswer',
  explanation:   'explanation',
});

// ─── Coding Question (JSON file: seed-contents/coding/questions/{id}.json) ───
export const CODING_QUESTION_FIELDS = Object.freeze({
  questionId:    'questionId',
  title:         'title',
  slug:          'slug',
  version:       'version',
  metadata:      'metadata',
  content:       'content',
  testCases:     'testCases',
  scoring:       'scoring',
  judging:       'judging',
  boilerPlates:  'boilerPlates',  // capital P — matches JSON exactly
  solution:      'solution',
  hints:         'hints',
});

export const CODING_CONTENT_FIELDS = Object.freeze({
  problemStatement: 'problemStatement',
  constraints:      'constraints',
  inputFormat:      'inputFormat',
  outputFormat:     'outputFormat',
  notes:            'notes',
  sampleTestCases:  'sampleTestCases',
});

export const CODING_SAMPLE_TC_FIELDS = Object.freeze({
  id:          'id',
  type:        'type',
  input:       'input',
  output:      'output',         // visible to student
  explanation: 'explanation',
});

export const CODING_HIDDEN_TC_FIELDS = Object.freeze({
  id:             'id',
  type:           'type',
  label:          'label',
  input:          'input',
  expectedOutput: 'expectedOutput',  // graded — never sent to student
  weight:         'weight',
});

export const CODING_METADATA_FIELDS = Object.freeze({
  category:   'category',
  difficulty: 'difficulty',
  isPremium:  'isPremium',
  tags:       'tags',
  QBCategory: 'QBCategory',
});

// ─── Spoken English Assessment (JSON file) ────────────────────────────────────
export const SEA_ASSESSMENT_FIELDS = Object.freeze({
  id:              'id',
  name:            'name',
  description:     'description',
  durationMinutes: 'duration_minutes',
  difficulty:      'difficulty',
  totalMarks:      'totalMarks',
  questions:       'questions',
});

export const SEA_QUESTION_FIELDS = Object.freeze({
  id:          'id',
  type:        'type',      // "read_aloud" | "repeat_sentence" | "describe_image" | "answer_question"
  moduleTitle: 'moduleTitle',
  text:        'text',      // for read_aloud / answer_question
  audioText:   'audioText', // for repeat_sentence
  durationMax: 'durationMax',
  maxAttempts: 'maxAttempts',
});

// ─── Assessment Result (Firestore: assessmentResults/{tenantId}/{assessmentId}/{uid}) ─
export const RESULT_FIELDS = Object.freeze({
  userId:           'userId',
  email:            'email',
  name:             'name',
  rollNumber:       'rollNumber',
  tenantId:         'tenantId',
  college:          'college',
  department:       'department',
  year:             'year',
  cohortId:         'cohortId',
  assessmentId:     'assessmentId',
  assessmentTitle:  'assessmentTitle',
  assessmentType:   'assessmentType',
  attemptId:        'attemptId',
  startedAt:        'startedAt',
  submittedAt:      'submittedAt',
  timeTakenSeconds: 'timeTakenSeconds',
  status:           'status',
  autoSubmitted:    'autoSubmitted',
  submissionReason: 'submissionReason',
  completed:        'completed',
  totalScore:       'totalScore',
  maxScore:         'maxScore',
  percentage:       'percentage',
  passed:           'passed',
  sections:         'sections',
  questions:        'questions',
  codingSubmissions:'codingSubmissions',
  violationCount:   'violationCount',
  totalNoFace:      'totalNoFace',
  totalMultipleFaces:'totalMultipleFaces',
  violations:       'violations',
  cefrLevel:        'cefrLevel',
  cefrName:         'cefrName',
  wpm:              'wpm',
  fillerCount:      'fillerCount',
});

export const RESULT_SECTION_FIELDS = Object.freeze({
  sectionName:      'sectionName',
  type:             'type',
  totalScore:       'totalScore',
  maxScore:         'maxScore',
  timeTakenSeconds: 'timeTakenSeconds',
  startedAt:        'startedAt',
  submittedAt:      'submittedAt',
});

// ─── Live Session (Firestore: users/{uid}/contestAttempts/{assessmentId}) ─────
export const SESSION_FIELDS = Object.freeze({
  assessmentId:         'assessmentId',
  assessmentTitle:      'assessmentTitle',
  startedAt:            'startedAt',
  lastSavedAt:          'lastSavedAt',
  timeRemainingSeconds: 'timeRemainingSeconds',
  completed:            'completed',
  autoSubmitted:        'autoSubmitted',
  sections:             'sections',
});

// ─── Firestore Paths ──────────────────────────────────────────────────────────
/**
 * Returns the canonical Firestore path for a result document.
 * @param {string} tenantId - College code (from user.tenantId)
 * @param {string} assessmentId - Assessment ID (from assessment.id)
 * @param {string} uid - Firebase Auth UID
 */
export function resultDocPath(tenantId, assessmentId, uid) {
  if (!tenantId || !assessmentId || !uid) {
    throw new Error(`[schema] resultDocPath: missing required segment — tenantId=${tenantId}, assessmentId=${assessmentId}, uid=${uid}`);
  }
  return `assessmentResults/${tenantId}/${assessmentId}/${uid}`;
}

/**
 * Returns the canonical Firestore path for a live session document.
 * @param {string} uid
 * @param {string} assessmentId
 */
export function sessionDocPath(uid, assessmentId) {
  if (!uid || !assessmentId) {
    throw new Error(`[schema] sessionDocPath: missing required segment — uid=${uid}, assessmentId=${assessmentId}`);
  }
  return `users/${uid}/contestAttempts/${assessmentId}`;
}
