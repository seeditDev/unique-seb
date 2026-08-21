/**
 * buildResultDoc.js
 *
 * Builds the canonical Firestore result document.
 * All inputs MUST already be canonical — no normalization, no fallbacks.
 *
 * @param {object} params
 * @param {object} params.user       - Canonical user object (from users/{uid})
 * @param {object} params.assessment - Canonical assessment object
 * @param {object} params.scores     - { totalScore, maxScore, percentage, passed }
 * @param {object} params.timing     - { startedAt (ISO), timeTakenSeconds }
 * @param {object} params.submission - { autoSubmitted, submissionReason }
 * @param {Array}  params.sections   - Array of canonical SectionResult objects
 * @param {Array}  params.questions  - Array of QuestionResult objects (MCQ)
 * @param {Array}  params.codingSubmissions - Array of CodingSubmission objects
 * @param {object} params.proctoring - { violationCount, totalNoFace, totalMultipleFaces, violations }
 * @param {object} params.speech     - { cefrLevel, cefrName, wpm, fillerCount } (SEA only)
 * @returns {object} Canonical Firestore result document
 */
export function buildResultDoc({
  user,
  assessment,
  scores,
  timing,
  submission,
  sections = [],
  questions = [],
  codingSubmissions = [],
  proctoring = {},
  speech = {},
}) {
  const uid = user.uid;
  const submittedAt = new Date().toISOString();

  return {
    // Identity
    userId:      uid,
    email:       user.email,
    name:        user.name,
    rollNumber:  user.rollNumber,
    tenantId:    user.tenantId,
    college:     user.college,
    department:  user.department,
    year:        user.year,
    cohortId:    user.cohortId,

    // Assessment reference
    assessmentId:    assessment.id,
    assessmentTitle: assessment.title,
    assessmentType:  assessment.assessmentType || 'mcq',
    attemptId:       `${assessment.id}_${uid}_${new Date(timing.startedAt).getTime()}`,

    // Timing
    startedAt:        timing.startedAt,
    submittedAt:      submittedAt,
    timeTakenSeconds: timing.timeTakenSeconds,

    // Submission
    status:           'submitted',
    autoSubmitted:    Boolean(submission.autoSubmitted),
    submissionReason: submission.submissionReason || 'manual',
    completed:        true,

    // Scores
    totalScore: scores.totalScore,
    maxScore:   scores.maxScore,
    percentage: scores.percentage,
    passed:     scores.passed,

    // Detail arrays
    sections,
    questions,
    codingSubmissions,

    // Proctoring
    violationCount:      proctoring.violationCount      || 0,
    totalNoFace:         proctoring.totalNoFace         || 0,
    totalMultipleFaces:  proctoring.totalMultipleFaces  || 0,
    violations:          proctoring.violations          || [],

    // Spoken English (empty for non-SEA types)
    cefrLevel:   speech.cefrLevel ?? '',
    cefrName:    speech.cefrName ?? '',
    wpm:         speech.wpm         || 0,
    fillerCount: speech.fillerCount || 0,
  };
}

/**
 * Builds a canonical SectionResult object.
 * Used inside sections[] of the result doc.
 */
export function buildSectionResult({ sectionName, type, totalScore, maxScore, timeTakenSeconds, startedAt, submittedAt }) {
  return { sectionName, type, totalScore, maxScore, timeTakenSeconds, startedAt, submittedAt };
}

/**
 * Builds a canonical QuestionResult object for MCQ detail.
 * correctAnswer is intentionally excluded — never stored in result docs.
 */
export function buildQuestionResult({ question, selectedAnswer, isCorrect, topic, difficulty, timeSpent }) {
  return { question, selectedAnswer, isCorrect, topic, difficulty, timeSpent };
}

/**
 * Builds a canonical CodingSubmission object.
 */
export function buildCodingSubmission({ questionNumber, problemTitle, language, status, testsPassed, totalTests, totalScore, maxScore, timeTakenSeconds }) {
  return { questionNumber, problemTitle, language, status, testsPassed, totalTests, totalScore, maxScore, timeTakenSeconds };
}
