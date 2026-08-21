/**
 * THE single MCQ scoring implementation.
 *
 * BUG FIXED: MCQPage.jsx contained five independent, drifting score
 * calculations (manual submit, timer auto-submit, reload-recovery submit,
 * embedded submit, stored-attempt recovery). Some read from React `answers`
 * state and some from the raw localStorage blob, and the 1s timer interval
 * raced the 120s sync interval, so the same attempt could be graded to
 * different totals depending on which path fired.
 *
 * Every path now calls gradeMcqAttempt(). One implementation, one result shape.
 */

/** Normalise an answer map that may be keyed by index or by question id. */
function selectedIndexFor(answers, index, question) {
  if (!answers) return undefined;
  if (answers[index] !== undefined) return answers[index];
  const qid = question?.id ?? question?.questionId;
  if (qid !== undefined && answers[qid] !== undefined) return answers[qid];
  return undefined;
}

function marksFor(question) {
  const m = Number(question?.marks ?? question?.mark ?? 1);
  return Number.isFinite(m) && m > 0 ? m : 1;
}

/**
 * @param {object} params
 * @param {Array}  params.questions   question set (must contain correctAnswer)
 * @param {object} params.answers     map of questionIndex -> selected option index
 * @param {object} [params.timeSpentPerQuestion] map of index -> seconds
 * @param {object} [params.meta]      difficulty/topic fallbacks
 * @returns {{score:number,totalMarks:number,totalQuestions:number,correctAnswers:number,
 *            incorrectAnswers:number,unanswered:number,percentage:number,questionsDetails:Array}}
 */
export function gradeMcqAttempt({ questions, answers, timeSpentPerQuestion = {}, meta = {} } = {}) {
  const questionSet = Array.isArray(questions) ? questions : [];
  const totalQuestions = questionSet.length;

  let correctAnswers = 0;
  let answered = 0;
  let score = 0;
  let totalMarks = 0;

  const questionsDetails = questionSet.map((q, idx) => {
    const marks = marksFor(q);
    totalMarks += marks;

    const selectedIdx = selectedIndexFor(answers, idx, q);
    const hasAnswer = selectedIdx !== undefined && selectedIdx !== null && selectedIdx !== '';
    const options = Array.isArray(q?.options) ? q.options : [];
    const selectedAnswer = hasAnswer ? (options[selectedIdx] ?? '') : '';
    const correctAnswer = q?.correctAnswer ?? '';

    // Compare by option value; fall back to index comparison when the bank
    // stores the correct answer as an index.
    let isCorrect = false;
    if (hasAnswer) {
      answered += 1;
      if (typeof correctAnswer === 'number') {
        isCorrect = Number(selectedIdx) === correctAnswer;
      } else {
        isCorrect = selectedAnswer !== '' && selectedAnswer === correctAnswer;
      }
    }
    if (isCorrect) {
      correctAnswers += 1;
      score += marks;
    }

    return {
      questionNumber: idx + 1,
      questionText: q?.question || (q?.text  ?? ''),
      difficulty: String(q?.difficulty || meta.difficulty || 'medium').toLowerCase(),
      topic: q?.topic || q?.tag || (Array.isArray(q?.tags) ? q.tags[0] : q?.tags) || 'General',
      tags: Array.isArray(q?.tags) ? q.tags : (q?.tags ? [q.tags] : (q?.topic ? [q.topic] : ['General'])),
      marks,
      isCorrect,
      selectedAnswer,
      correctAnswer: typeof correctAnswer === 'number' ? (options[correctAnswer] ?? '') : (correctAnswer ?? ''),
      timeSpent: Number(timeSpentPerQuestion?.[idx] || 0),
    };
  });

  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;

  return {
    score,
    totalMarks,
    totalQuestions,
    correctAnswers,
    incorrectAnswers: Math.max(0, answered - correctAnswers),
    unanswered: Math.max(0, totalQuestions - answered),
    percentage,
    questionsDetails,
  };
}

export default gradeMcqAttempt;
