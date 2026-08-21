/**
 * MultiSectionAssessment.jsx
 *
 * Multi-section exam orchestrator.
 * MCQ sections use the built-in MCQSectionView.
 * Coding sections mount CodingAssessmentSandbox in embedded mode for full feature parity.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { buildResultDoc, buildSectionResult, buildQuestionResult, buildCodingSubmission } from '../utils/buildResultDoc.js';
import { useNavigate } from './router-compat';
import { toast } from 'sonner';
import {
  FaClock, FaCheckCircle, FaLock, FaBookOpen, FaCode,
  FaArrowLeft, FaArrowRight, FaBookmark,
  FaChevronRight, FaFileAlt, FaListUl, FaShieldAlt, FaLightbulb, FaSignOutAlt, FaFlag
} from 'react-icons/fa';
import '../styles/MultiSectionAssessment.css';
import '../styles/MCQPage.css';
import '../styles/CodingAssessmentSandbox.css';
import { db, auth } from '../lib/firebase-config';
import { doc, setDoc, getDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { fetchQuestionsForContest } from '../services/codingQuestionBankService';
import ProctoringEngine from './ProctoringEngine';
import AudioProctoringEngine from './AudioProctoringEngine';
import CodingAssessmentPage from './CodingAssessmentPage';
import SpokenEnglishAssessment from './SpokenEnglishAssessment';
import timeService from '../services/timeService';
import { getViolations, writeViolationToFirestore } from '../utils/proctorCache';
import { renderMathAndCode } from '../utils/mathAndCodeRenderer';
import { normalizeTestCaseArray } from '../utils/testCaseUtils';
import SecurityWatermark from './SecurityWatermark';
import { requireTenant, resolveTenant } from '../utils/tenant';
import { fetchContentJSON, fetchJSONFile } from '../utils/contentApi';
import { createSubmitGuard } from '../utils/submitGuard';
import DOMPurify from 'dompurify';
import {
  startAssessmentSession,
  markSectionStarted,
  saveSessionProgress,
  markSectionCompleted,
  completeAssessmentSession,
  oneThirdSaveThreshold,
} from '../services/assessmentSessionService';
import { markAssessmentCompleted, invalidateCompletionCache } from '../services/attemptStatusService';
import { stopAllMediaAndAI } from '../utils/hardwareTeardown';
import { savePendingEnvelope } from '../utils/safeStorage';


// ─── Helpers ────────────────────────────────────────────────────────────────

const slugify = (val = '') =>
  val.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';


const formatTime = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatSecs = (val) => {
  const m = Math.floor(val / 60);
  const s = val % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const isTruthy = (val) => {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1';
};

/**
 * Normalises a raw coding question from JSON into the internal schema.
 */
const normalizeQuestion = (q) => {
  if (!q) return q;
  const id = q.questionId || (q.id  ?? '');
  const title = q.title || q.name || (q.content?.title  ?? '');
  const description = q.content?.problemStatement || q.description || (q.problemStatement  ?? '');
  const instructions = q.content?.inputFormat || (q.instructions  ?? '');
  const constraints = Array.isArray(q.content?.constraints)
    ? q.content.constraints.join('\n')
    : (q.constraints ?? '');

  // Normalize boilerPlates robustly supporting camelCase, lowerCase, and standard language keys
  const getNormalizedLangKey = (k) => {
    const clean = String(k).trim().toLowerCase();
    if (clean === 'c') return 'c';
    if (clean === 'cpp' || clean === 'c++') return 'cpp';
    if (clean === 'java') return 'java';
    if (clean === 'python' || clean === 'python3') return 'python';
    if (clean === 'javascript' || clean === 'js') return 'javascript';
    return clean;
  };

  const VALID_LANG_NAMES = new Set(['c', 'cpp', 'c++', 'java', 'python', 'python3', 'javascript', 'js', 'csharp', 'cs', 'ruby', 'go', 'rust', 'kotlin', 'swift', 'typescript', 'ts']);

  const rawBoilerplates = q.boilerPlates ?? {};
  const boilerplates = {};

  Object.entries(rawBoilerplates).forEach(([lang, val]) => {
    if (!VALID_LANG_NAMES.has(String(lang).trim().toLowerCase())) return;
    if (typeof val !== 'string') return;
    const norm = getNormalizedLangKey(lang);
    if (norm === 'python') {
      boilerPlates.python = val;
      boilerPlates.python3 = val;
    } else {
      boilerPlates[norm] = val;
    }
  });

  const testCases = normalizeTestCaseArray(q.content?.sampleTestCases || q.sampleTestCases || q.sampleTests || q.testCases?.sample || []);

  let hidden = [];
  if (q.testCases?.hidden) {
    hidden = normalizeTestCaseArray(q.testCases.hidden);
  } else if (Array.isArray(q.testCases)) {
    hidden = normalizeTestCaseArray(q.testCases);
  }

  return {
    ...q,
    id,
    title,
    description,
    instructions,
    constraints,
    boilerPlates,
    sampleTestCases: testCases,
    sampleTests: testCases,
    testCases: {
      ...q.testCases,
      sample: testCases,
      hidden
    },
    hiddenTests: hidden
  };
};


// ─── MCQ Section Renderer ────────────────────────────────────────────────────

const MCQSectionView = React.memo(({ sectionData, secTimer, secStarted = false, proctoringData = { violationCount: 0, violations: [] }, settings = {}, onSectionSubmit, assessmentName = '', assessmentId = '' }) => {
  const questions = useMemo(() => sectionData?.questions || [], [sectionData?.questions]);
  const stateKey = `msa_active_mcq_state_${assessmentId}_${sectionData?.id ?? ''}`;

  const [answers, setAnswers] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id ?? ''}`);
      if (saved) return JSON.parse(saved).answers || {};
    } catch (_) {}
    return {};
  });

  const [questionIndex, setQuestionIndex] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id ?? ''}`);
      if (saved) return JSON.parse(saved).questionIndex || 0;
    } catch (_) {}
    return 0;
  });

  const [bookmarked, setBookmarked] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id ?? ''}`);
      if (saved) return JSON.parse(saved).bookmarked || [];
    } catch (_) {}
    return [];
  });

  const [lockedQuestions, setLockedQuestions] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id ?? ''}`);
      if (saved) return JSON.parse(saved).lockedQuestions || [];
    } catch (_) {}
    return [];
  });

  const [qTimerRemaining, setQTimerRemaining] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id ?? ''}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.qTimerRemaining !== undefined) return parsed.qTimerRemaining;
      }
    } catch (_) {}
    return settings.questionTimer || 0;
  });

  const [timeSpentPerQ, setTimeSpentPerQ] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id ?? ''}`);
      if (saved) return JSON.parse(saved).timeSpentPerQ || {};
    } catch (_) {}
    return {};
  });

  // Save active MCQ section state to localStorage on changes
  useEffect(() => {
    const snapshot = {
      answers,
      questionIndex,
      bookmarked,
      lockedQuestions,
      qTimerRemaining,
      timeSpentPerQ
    };
    localStorage.setItem(stateKey, JSON.stringify(snapshot));
  }, [answers, questionIndex, bookmarked, lockedQuestions, qTimerRemaining, timeSpentPerQ, stateKey]);

  const [showReview, setShowReview] = useState(false);
  const [customNotice, setCustomNotice] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const onSubmitRef = useRef(onSectionSubmit);
  useEffect(() => { onSubmitRef.current = onSectionSubmit; }, [onSectionSubmit]);



  const hasTimerStartedRef = useRef(false);

  // Auto-submit when section timer expires
  useEffect(() => {
    if (secTimer > 0) {
      hasTimerStartedRef.current = true;
    }
    if (secTimer <= 0 && hasTimerStartedRef.current) {
      handleSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer]);

  const isFirstMount = useRef(true);
  const questionTimerStartedRef = useRef(false);

  // Mark if question timer has successfully started with a positive value
  useEffect(() => {
    if (qTimerRemaining > 0) {
      questionTimerStartedRef.current = true;
    }
  }, [qTimerRemaining]);

  // Per-question lock timer
  useEffect(() => {
    if (settings.questionTimer > 0) {
      questionTimerStartedRef.current = false; // Reset start indicator on question transition
      if (isFirstMount.current) {
        isFirstMount.current = false;
        // Don't reset if we restored a saved timer for this question index!
        const key = `msa_active_mcq_state_${assessmentId}_${sectionData?.id ?? ''}`;
        try {
          const saved = localStorage.getItem(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.questionIndex === questionIndex && parsed.qTimerRemaining !== undefined) {
              setQTimerRemaining(parsed.qTimerRemaining);
              return;
            }
          }
        } catch (_) {}
      }
      setQTimerRemaining(settings.questionTimer);
    }
  }, [questionIndex, settings.questionTimer, assessmentId, sectionData]);

  useEffect(() => {
    if (settings.questionTimer <= 0 || !secStarted) return;
    const t = setInterval(() => {
      setQTimerRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [settings.questionTimer, secStarted]);

  useEffect(() => {
    if (settings.questionTimer > 0 && qTimerRemaining === 0 && questionTimerStartedRef.current) {
      setLockedQuestions(l => {
        if (l.includes(questionIndex)) return l;
        return [...l, questionIndex];
      });
      if (questionIndex + 1 < questions.length) {
        setQuestionIndex(q => q + 1);
      } else {
        handleSubmit();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qTimerRemaining, questionIndex, questions.length, settings.questionTimer]);

  const handleSubmit = useCallback(() => {
    // ── Scoring ──────────────────────────────────────────────────────────────
    // Use per-question marks when available, falling back to 1 mark/question.
    // The section's canonical max is sectionData.maxScore (set by Admin Hub).
    // NEVER use question count as the max marks — sections can have different
    // weights (e.g. MCQ section = 40 marks, Coding section = 60 marks).
    let score = 0;
    questions.forEach((q, i) => {
      if (answers[i] !== undefined && q.options[answers[i]] === q.correctAnswer) {
        score += (Number(q.marks) > 0 ? Number(q.marks) : 1);
      }
    });
    const total = questions.length;
    // Authoritative section max from Admin Hub config; fall back to question count only
    // when sectionData.maxScore is not set (old/incomplete data).
    const sectionTotalMarks = Number(sectionData?.maxScore) > 0
      ? Number(sectionData.maxScore)
      : total;
    // Percentage based on marks, clamped, NaN-safe.
    const pct = sectionTotalMarks > 0 ? Math.min(100, Math.round((score / sectionTotalMarks) * 100)) : 0;

    const questionsDetails = questions.map((q, idx) => {
      const selectedIdx = answers[idx];
      const selectedAnswer = selectedIdx !== undefined ? (q.options?.[selectedIdx] ?? '') : '';
      const isCorrect = selectedAnswer === q.correctAnswer;
      const timeSpent = timeSpentPerQ[idx] || 0;
      return {
        questionNumber: idx + 1,
        questionText: q.question || (q.text  ?? ''),
        difficulty: (q.difficulty || 'medium').toLowerCase(),
        topic: q.topic || q.tag || (q.tags ? (Array.isArray(q.tags) ? q.tags[0] : q.tags) : 'General'),
        tags: Array.isArray(q.tags) ? q.tags : (q.tags ? [q.tags] : (q.topic ? [q.topic] : ['General'])),
        isCorrect,
        selectedAnswer,
        correctAnswer: q.correctAnswer ?? '',
        timeSpent
      };
    });
    
    // Clean up active MCQ state from localStorage
    localStorage.removeItem(stateKey);

    if (onSubmitRef.current) {
      onSubmitRef.current({
        answers,
        timeSpentPerQ,
        score,
        totalQuestions: total,
        // FIX: totalMarks = section max marks (from Admin Hub), NOT question count.
        // This is what the MSA aggregator sums to get the overall maxScore.
        maxScore: sectionTotalMarks,
        // FIX: percentage = score / sectionTotalMarks * 100, not score / totalQuestions.
        percentage: pct,
        questions: questionsDetails,
        violationCount: 0,
        totalNoFace: 0,
        totalMultipleFaces: 0,
        violations: []
      });
    }
  }, [answers, timeSpentPerQ, questions, stateKey, sectionData]);

  const questionEnterTimeRef = useRef(null);

  useEffect(() => {
    questionEnterTimeRef.current = timeService.now();
  }, [questionIndex]);

  const handleSelectOption = (optIdx) => {
    if (lockedQuestions.includes(questionIndex)) return;

    // Calculate time spent since entering or last selection on this question
    const now = timeService.now();
    const elapsedMs = now - (questionEnterTimeRef.current || now);
    const elapsedSecs = Math.max(0, Math.round(elapsedMs / 1000));

    setTimeSpentPerQ(prev => ({
      ...prev,
      [questionIndex]: (prev[questionIndex] || 0) + elapsedSecs
    }));

    // Reset enter time to now for subsequent selections
    questionEnterTimeRef.current = now;

    setAnswers(prev => ({ ...prev, [questionIndex]: optIdx }));
  };

  const navQuestion = (dir) => {
    if (settings.questionTimer > 0) return;
    if (dir === 'prev' && questionIndex > 0 && !settings.forwardOnly) setQuestionIndex(q => q - 1);
    if (dir === 'next' && questionIndex < questions.length - 1) setQuestionIndex(q => q + 1);
  };

  const renderTextWithCode = (text) => renderMathAndCode(text, false);

  if (questions.length === 0) {
    return (
      <div className="msa-loading">
        <div className="msa-spinner" />
        <p>Loading MCQ questions...</p>
      </div>
    );
  }

  const q = questions[questionIndex] || {};
  const total = questions.length;
  const attempted = Object.keys(answers).length;
  const unattempted = Math.max(0, total - attempted);
  const flaggedCount = bookmarked.length;
  const pct = total > 0 ? Math.round((attempted / total) * 100) : 0;
  const isLocked = lockedQuestions.includes(questionIndex);

  const { candidateRoll, tenantId } = useMemo(() => {
    try {
      const authData = JSON.parse(localStorage.getItem('auth_data' || '{}'));
      return {
        candidateRoll: authData.rollNumber || authData.uid || 'CANDIDATE',
        tenantId: authData.tenantId || 'SEED-SEB'
      };
    } catch (_) {
      return { candidateRoll: 'CANDIDATE', tenantId: 'SEED-SEB' };
    }
  }, []);

  return (
    <div className="mcq-ref-app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SecurityWatermark rollNumber={candidateRoll} tenantId={tenantId} />

      {/* Submit Confirmation Overlay */}
      {showSubmitConfirm && (
        <div className="mcq-confirm-dialog">
          <div className="mcq-confirm-content">
            <h3>Submit Section?</h3>
            <p>Are you sure you want to submit this section? You cannot return or modify your answers once submitted.</p>
            <div className="mcq-confirm-buttons">
              <button type="button" className="btn-cancel" onClick={() => setShowSubmitConfirm(false)}>Cancel</button>
              <button type="button" className="btn-confirm-submit" onClick={() => { setShowSubmitConfirm(false); handleSubmit(); }}>Confirm & Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Notice Overlay */}
      {customNotice && (
        <div className="mcq-confirm-dialog">
          <div className="mcq-confirm-content">
            <h3>{customNotice.title}</h3>
            <p>{customNotice.message}</p>
            <div className="mcq-confirm-buttons">
              <button
                type="button"
                className="btn-confirm-submit"
                onClick={() => { const fn = customNotice.onConfirm; setCustomNotice(null); if (fn) fn(); }}
              >Understood</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP HEADER ── */}
      <header className="mcq-ref-header">
        <div className="mcq-ref-header-left">
          <div className="mcq-brand-badge">
            <div className="mcq-brand-icon">
              <FaShieldAlt />
            </div>
            <div className="mcq-brand-text">
              <span className="mcq-brand-title">SEED-SEB</span>
              <span className="mcq-brand-subtitle">SECURE EXAMINATION &amp; BENCHMARKING</span>
            </div>
          </div>
        </div>

        <div className="mcq-ref-header-center">
          <h2 className="mcq-ref-assessment-title">{sectionData?.name || assessmentName || 'MCQ Section Assessment'}</h2>
          <div className="mcq-ref-assessment-meta">
            {assessmentName && <span>{assessmentName}</span>}
            {assessmentName && <span className="meta-dot">•</span>}
            <span>{total} Questions</span>
            <span className="meta-dot">•</span>
            <span>1 Mark Each</span>
          </div>
        </div>

        <div className="mcq-ref-header-right">
          {(settings.audioProctored || settings.proctored) && (
            <div className="mcq-proctor-pills-wrap">
              {settings.audioProctored && (
                <div className="mcq-proctor-badge" title="Audio Proctoring">
                  <span className={`status-dot ${(proctoringData?.audioViolationCount || 0) > 0 ? 'bad' : 'good'}`} />
                  Audio: {proctoringData?.audioViolationCount || 0}/{settings.maxAudioViolations || 5}
                </div>
              )}
              {settings.proctored && (
                <div className="mcq-proctor-badge" title="Camera Proctoring">
                  <span className={`status-dot ${(proctoringData?.violationCount || 0) > 0 ? 'bad' : 'good'}`} />
                  Camera: {proctoringData?.violationCount || 0}/{settings.maxViolations || 7}
                </div>
              )}
            </div>
          )}

          <div className="mcq-ref-timer-box">
            <div className="mcq-timer-icon-wrap">
              <FaClock />
            </div>
            <div className="mcq-timer-details">
              <span className="mcq-timer-label">Time Remaining</span>
              <span className={`mcq-timer-value ${secTimer <= 300 ? 'warning' : ''} ${secTimer <= 60 ? 'danger' : ''}`}>
                {formatTime(secTimer)}
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`mcq-ref-flag-btn ${bookmarked.includes(questionIndex) ? 'flagged' : ''}`}
            onClick={() => setBookmarked(prev => prev.includes(questionIndex) ? prev.filter(x => x !== questionIndex) : [...prev, questionIndex])}
          >
            <FaFlag />
            <span>{bookmarked.includes(questionIndex) ? 'Flagged' : 'Flag for Review'}</span>
          </button>

          {!settings.timerRestrictedSubmit && (
            <button
              type="button"
              className="mcq-ref-submit-btn"
              onClick={() => setShowSubmitConfirm(true)}
            >
              <FaSignOutAlt />
              <span>Submit Section</span>
            </button>
          )}
        </div>
      </header>

      {/* Review Screen */}
      {showReview ? (
        <div className="mcq-review-container" style={{ padding: '24px', maxWidth: '900px', margin: '20px auto' }}>
          <h3 style={{ color: 'var(--mcq-text-main)', marginBottom: '20px' }}>Review Your Answers</h3>
          <div className="mcq-review-list">
            {questions.map((rq, idx) => (
              <div key={idx} className="mcq-review-item">
                <div className="mcq-review-header">
                  <span>Question {idx + 1}</span>
                  <span>{formatSecs(timeSpentPerQ[idx] || 0)}</span>
                </div>
                <div className="mcq-review-question">{renderTextWithCode(rq.question)}</div>
                <div className="mcq-review-answer">
                  Your answer: {answers[idx] !== undefined ? rq.options[answers[idx]] : <span className="text-muted">Not answered</span>}
                </div>
                <div className="mcq-review-actions">
                  <button type="button" onClick={() => { setQuestionIndex(idx); setShowReview(false); }}>Go to Question</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mcq-review-bottom-nav">
            <button type="button" className="mcq-nav-button" onClick={() => setShowReview(false)}>Back to Test</button>
            <button type="button" className="mcq-submit-button" onClick={handleSubmit}>Submit Section</button>
          </div>
        </div>
      ) : (
        /* ── 3-COLUMN WORKSPACE ── */
        <div className="mcq-ref-layout-3col">
          {/* 1. LEFT SIDEBAR */}
          <aside className="mcq-ref-col-left">
            {/* Section Overview Card */}
            <div className="mcq-ref-card">
              <div className="mcq-card-head">
                <div className="mcq-card-head-icon">
                  <FaListUl />
                </div>
                <h4>Section Overview</h4>
              </div>
              <div className="mcq-overview-table">
                <div className="overview-row">
                  <span className="overview-label">Total Questions</span>
                  <strong className="overview-val">{total}</strong>
                </div>
                <div className="overview-row">
                  <span className="overview-label">Attempted</span>
                  <strong className="overview-val text-emerald">{attempted}</strong>
                </div>
                <div className="overview-row">
                  <span className="overview-label">Not Attempted</span>
                  <strong className="overview-val text-muted">{unattempted}</strong>
                </div>
                <div className="overview-row">
                  <span className="overview-label">Flagged</span>
                  <strong className="overview-val text-amber">{flaggedCount}</strong>
                </div>
              </div>
            </div>

            {/* Legend Card */}
            <div className="mcq-ref-card">
              <div className="mcq-card-head">
                <div className="mcq-card-head-icon">
                  <FaShieldAlt />
                </div>
                <h4>Legend</h4>
              </div>
              <div className="mcq-legend-list">
                <div className="legend-item">
                  <span className="legend-dot answered" />
                  <span>Answered</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot not-answered" />
                  <span>Not Answered</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot current" />
                  <span>Current Question</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot flagged" />
                  <span>Flagged for Review</span>
                </div>
              </div>
            </div>

            {/* Secure Environment Card */}
            <div className="mcq-ref-card secure-badge-card">
              <div className="mcq-card-head">
                <div className="mcq-card-head-icon">
                  <FaLock />
                </div>
                <h4>Secure Environment</h4>
              </div>
              <p className="secure-badge-text">
                Your activity is being monitored<br />
                <span className="sub">*for a fair assessment.</span>
              </p>
            </div>
          </aside>

          {/* 2. CENTER QUESTION WORKSPACE */}
          <main className="mcq-ref-col-center">
            <div className="mcq-center-question-card">
              <div className="mcq-center-card-header">
                <h3 className="mcq-q-title">Question {questionIndex + 1} of {total}</h3>
                <button
                  type="button"
                  className={`mcq-center-flag-btn ${bookmarked.includes(questionIndex) ? 'flagged' : ''}`}
                  onClick={() => setBookmarked(prev => prev.includes(questionIndex) ? prev.filter(x => x !== questionIndex) : [...prev, questionIndex])}
                >
                  <FaBookmark />
                  <span>{bookmarked.includes(questionIndex) ? 'Flagged for Review' : 'Mark for Review'}</span>
                </button>
              </div>

              <div className="mcq-center-q-body">
                {isLocked && (
                  <div className="mcq-locked-notice">
                    <FaLock />
                    <span>This question's timer expired. Your answer is locked.</span>
                  </div>
                )}

                <div className="mcq-q-text-line">
                  <span className="mcq-q-num-badge">Q{questionIndex + 1}.</span>
                  <span className="mcq-q-content">{renderTextWithCode(q.question)}</span>
                </div>

                <div className="mcq-ref-options-stack">
                  {q.options?.map((opt, oIdx) => {
                    const letter = String.fromCharCode(65 + oIdx);
                    const isSelected = answers[questionIndex] === oIdx;
                    return (
                      <button
                        type="button"
                        key={oIdx}
                        className={`mcq-ref-option-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectOption(oIdx)}
                        disabled={isLocked}
                        style={isLocked ? { cursor: 'not-allowed', opacity: 0.8 } : {}}
                      >
                        <div className="option-radio-indicator">
                          <span className="radio-circle" />
                        </div>
                        <div className="option-letter-badge">{letter}</div>
                        <div className="option-text-content">{renderMathAndCode(opt, true)}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Tip / Hint Box */}
                {(q.hint || q.explanation) ? (
                  <div className="mcq-quick-tip-card">
                    <div className="tip-icon"><FaLightbulb /></div>
                    <div className="tip-content">
                      <strong>Quick Tip</strong>
                      <p>{q.hint || q.explanation}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Bottom Nav inside Center Card */}
              <div className="mcq-center-actions-footer">
                <button
                  type="button"
                  className="mcq-btn-prev"
                  onClick={() => navQuestion('prev')}
                  disabled={questionIndex === 0 || settings.forwardOnly || settings.questionTimer > 0}
                >
                  <FaArrowLeft /> Previous
                </button>

                <button
                  type="button"
                  className="mcq-btn-save-next"
                  onClick={() => {
                    if (questionIndex === total - 1) {
                      setShowSubmitConfirm(true);
                    } else {
                      navQuestion('next');
                    }
                  }}
                >
                  <span>{questionIndex === total - 1 ? 'Submit Section' : 'Save & Next'}</span>
                  <FaArrowRight />
                </button>
              </div>
            </div>
          </main>

          {/* 3. RIGHT SIDEBAR */}
          <aside className="mcq-ref-col-right">
            {/* Question Navigator Card */}
            <div className="mcq-ref-card">
              <div className="mcq-card-head">
                <h4>Question Navigator</h4>
              </div>
              <div className="mcq-navigator-grid">
                {questions.map((_, idx) => {
                  const isAttempted = answers[idx] !== undefined;
                  const isCurrent = questionIndex === idx;
                  const isBookmarked = bookmarked.includes(idx);

                  let stateClass = '';
                  if (isCurrent) stateClass = 'current';
                  else if (isBookmarked) stateClass = 'flagged';
                  else if (isAttempted) stateClass = 'answered';
                  else stateClass = 'unanswered';

                  return (
                    <button
                      type="button"
                      key={idx}
                      className={`nav-grid-btn ${stateClass}`}
                      onClick={() => {
                        if (settings.forwardOnly || settings.questionTimer > 0) return;
                        setQuestionIndex(idx);
                        setShowReview(false);
                      }}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section Progress Card */}
            <div className="mcq-ref-card">
              <div className="progress-card-head">
                <h4>Section Progress</h4>
                <span className="progress-fraction">{attempted} / {total}</span>
              </div>
              <div className="mcq-progress-bar-track">
                <div className="mcq-progress-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="progress-percent-label">{pct}%</div>
            </div>

            {/* Section Summary Card */}
            <div className="mcq-ref-card">
              <div className="mcq-card-head">
                <h4>Section Summary</h4>
              </div>
              <div className="mcq-summary-list">
                <div className="summary-item">
                  <div className="summary-left">
                    <span className="legend-dot answered" />
                    <span>Answered</span>
                  </div>
                  <span className="summary-stat">{attempted} ({total > 0 ? Math.round((attempted / total) * 100) : 0}%)</span>
                </div>
                <div className="summary-item">
                  <div className="summary-left">
                    <span className="legend-dot not-answered" />
                    <span>Not Answered</span>
                  </div>
                  <span className="summary-stat">{unattempted} ({total > 0 ? Math.round((unattempted / total) * 100) : 0}%)</span>
                </div>
                <div className="summary-item">
                  <div className="summary-left">
                    <span className="legend-dot flagged" />
                    <span>Flagged</span>
                  </div>
                  <span className="summary-stat">{flaggedCount} ({total > 0 ? Math.round((flaggedCount / total) * 100) : 0}%)</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── BOTTOM FOOTER ── */}
      <footer className="mcq-ref-bottom-footer">
        <div className="footer-left-info">
          <span>Assessment ID: {assessmentId ?? ''}</span>
          <span className="footer-sep">•</span>
          <span>Tenant: {tenantId}</span>
          <span className="footer-sep">•</span>
          <span>Candidate: {candidateRoll}</span>
        </div>

        <div className="footer-center-hint">
          You can navigate between questions using the Question Navigator
        </div>

        <div className="footer-right-actions">
          <button
            type="button"
            className="mcq-footer-end-btn"
            onClick={() => setShowSubmitConfirm(true)}
          >
            <FaSignOutAlt />
            <span>End Section</span>
          </button>
        </div>
      </footer>
    </div>
  );
});


// ─── Coding Section Renderer ──────────────────────────────────────────────────
// Uses the real CodingAssessmentPage in embedded mode for full feature parity.

const CodingSectionView = React.memo(({ sectionData, secTimer, settings = {}, proctoringData, onSectionSubmit, assessmentName = '', assessmentId = '' }) => {
  // Normalize all possible coding content field names into a single `questions` array.
  // Admin Hub (StaffCodingCreator) uses `challenges[]`.
  // CDN JSON may use `codingQuestions[]`, `questions[]`, or `items[]`.
  // This guard ensures CodingAssessmentPage never receives an empty questions array
  // when the content exists under a different field name.
  const resolvedQuestions = (() => {
    if (Array.isArray(sectionData?.questions) && sectionData.questions.length > 0) {
      return sectionData.questions;
    }
    if (Array.isArray(sectionData?.challenges) && sectionData.challenges.length > 0) {
      return sectionData.challenges;
    }
    if (Array.isArray(sectionData?.codingQuestions) && sectionData.codingQuestions.length > 0) {
      return sectionData.codingQuestions;
    }
    if (Array.isArray(sectionData?.items) && sectionData.items.length > 0) {
      return sectionData.items;
    }
    return [];
  })();

  const testData = {
    ...sectionData,
    questions: resolvedQuestions
  };

  const embeddedSettings = {
    ...settings,
    proctored: false,
    audioProctored: false
  };

  return (
    <CodingAssessmentPage
      isEmbedded={true}
      testData={testData}
      secTimer={secTimer}
      onSectionSubmit={onSectionSubmit}
      settings={embeddedSettings}
      parentProctoringData={proctoringData}
      parentSettings={settings}
    />
  );
});


// ─── Main Orchestrator ────────────────────────────────────────────────────────

const MultiSectionAssessment = () => {
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // coordinator refs
  const examStartTimeRef = useRef(new Date().toISOString());
  const sectionStartTimesRef = useRef({});
  // Mirror user/assessment into refs so callbacks that run before the first
  // React state flush (e.g. grace-period auto-submit 500ms after mount) can
  // still read them synchronously.
  const userRef = useRef(null);
  const assessmentRef = useRef(null);

  // Section coordinator state
  const [currentSecIdx, setCurrentSecIdx] = useState(-1);
  const [secStarted, setSecStarted] = useState(false);
  const [secTimer, setSecTimer] = useState(0);
  const [secCompleted, setSecCompleted] = useState({});
  const [sectionCountdown, setSectionCountdown] = useState(null);
  const [countdownSecIdx, setCountdownSecIdx] = useState(-1);

  // Data stores
  const [sectionData, setSectionData] = useState({});
  const [examResults, setExamResults] = useState({});
  const [examFinished, setExamFinished] = useState(false);
  const [isSubmittingEntireExam, setIsSubmittingEntireExam] = useState(false);
  // 15-sec relaxation between sections: null = not showing, number = countdown value
  const [relaxationCountdown, setRelaxationCountdown] = useState(null);
  const [relaxationNextIdx, setRelaxationNextIdx] = useState(-1);
  const [isVisualProctorReady, setIsVisualProctorReady] = useState(false);
  const [isAudioProctorReady, setIsAudioProctorReady] = useState(false);
  const [proctoringData, setProctoringData] = useState({
    violationCount: 0,
    audioViolationCount: 0,
    violations: []
  });

  const shouldUseProctoring = useMemo(() => {
    if (!assessment) return false;
    return isTruthy(assessment.proctored) || (assessment.sections || []).some(s => isTruthy(s.proctored));
  }, [assessment]);

  const shouldUseAudioProctoring = useMemo(() => {
    if (!assessment) return false;
    // Audio proctoring is INDEPENDENT of camera proctoring.
    // Only activate if audioProctored is explicitly true at the top-level or any section.
    // Do NOT fall back to assessment.proctored — that controls camera only.
    return isTruthy(assessment.audioProctored) ||
           (assessment.sections || []).some(s => isTruthy(s.audioProctored));
  }, [assessment]);

  const maxViolations = useMemo(() => {
    if (!assessment) return 7;
    return Number(assessment.maxViolations) || 7;
  }, [assessment]);

  const maxAudioViolations = useMemo(() => {
    if (!assessment) return 5;
    return Number(assessment.maxAudioViolations) || 5;
  }, [assessment]);

  // Crash recovery
  const [restoredProgress, setRestoredProgress] = useState(null);

  const timerRef = useRef(null);
  /** Absolute wall-clock ms when the current section timer expires. Set on section start. */
  const sectionEndTimeMsRef = useRef(0);
  /** Idempotency lock: prevents timer + violation + button from all calling finalSubmit concurrently. */
  const finalSubmitLockRef = useRef(false);
  const examFinishedRef = useRef(examFinished);
  useEffect(() => { examFinishedRef.current = examFinished; }, [examFinished]);
  // Keep userRef/assessmentRef in sync with state for callback closures
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { assessmentRef.current = assessment; }, [assessment]);
  // Prevents React StrictMode double-invoke from firing the grace-period auto-submit twice
  const gracePeriodFiredRef = useRef(false);

  const autoSubmitEntireExam = useCallback(async (reason) => {
    // P0-04: Idempotency guard — prevents timer, violation handler, and button click
    // from all racing to finalize the exam simultaneously.
    if (finalSubmitLockRef.current) {
      console.warn(`[MSA] Final submit already in progress (reason=${reason}), ignoring duplicate call.`);
      return;
    }
    finalSubmitLockRef.current = true;

    if (examFinishedRef.current) return;
    examFinishedRef.current = true;
    setSecStarted(false);
    clearInterval(timerRef.current);

    // Use refs so this works even when called before the first React state flush
    // (e.g. the grace-period path calls this 500ms after mount when state is still null)
    const effectiveUser = userRef.current;
    const effectiveAssessment = assessmentRef.current;

    // BUG FIXED (P0 cross-tenant write): `user.college || 'KGKITE'` wrote one
    // college's attempt into another college's document path whenever the
    // profile field was blank. Skip the remote write instead of substituting —
    // local progress is still kept so nothing is silently lost.
    const tenant = resolveTenant(effectiveUser);
    if (effectiveUser?.email && effectiveAssessment && !tenant.valid) {
      console.error('[MSA] Incomplete profile, refusing remote write:', tenant.missing);
    }
    if (effectiveUser?.email && effectiveAssessment && tenant.valid) {
      const { college, year } = tenant;
      
      const sectionsList = Object.values(examResults).map(sec => {
        const secTime = sec.timeSpentSeconds || sec.data?.timeSpentSeconds || 0;
        const secM = Math.floor(secTime / 60);
        const secS = secTime % 60;
        return {
          sectionName: sec.sectionName ?? '',
          name: sec.sectionName ?? '',
          score: sec.data?.score || 0,
          maxScore: sec.data?.maxScore || sec.data?.totalQuestions || 0,
          maxScore: sec.data?.maxScore || sec.data?.totalQuestions || 0,
          startedAt: sec.startedAt ?? '',
          submittedAt: sec.submittedAt ?? '',
          timeSpentSeconds: secTime,
          timeTaken: secTime,
          timeTakenFormatted: `${secM}:${secS < 10 ? '0' : ''}${secS}`
        };
      });

      const aggregatedQuestions = Object.values(examResults)
        .filter(sec => sec.type === 'mcq' && sec.data?.questions)
        .reduce((acc, sec) => acc.concat(sec.data.questions), []);

      const aggregatedCoding = Object.values(examResults)
        .filter(sec => sec.type === 'coding')
        // Coding sections store resolved questions in .data.questions (normalized by processData).
        // Fall back to .data.coding for any legacy result format that used the old field name.
        .filter(sec => sec.data?.questions?.length || sec.data?.coding?.length)
        .reduce((acc, sec) => acc.concat(sec.data.questions || sec.data.coding || []), []);

      const totalMarksSum = Object.values(examResults).reduce((a, s) => a + (s.data?.maxScore || s.data?.totalQuestions || 0), 0);

      const totalScore = Object.values(examResults).reduce((a, s) => a + (s.data?.score || 0), 0);
      const totalQ = Object.values(examResults).reduce((a, s) => a + (s.data?.totalQuestions || 0), 0);
      // BUG FIX: percentage must use totalMarksSum (max marks), not totalQ (question count).
      // Example: MCQ=40 marks, Coding=60 marks → totalMarksSum=100, not totalQ=32.
      const pct = totalMarksSum > 0 ? (totalScore / totalMarksSum) : 0;
      const totalViolations = proctoringData.violationCount;

      // Scoring fields
      const partialScore = totalScore;
      const fullScore = (totalMarksSum > 0 && totalScore >= totalMarksSum) ? totalMarksSum : 0;

      const startedAt = examStartTimeRef.current;
      const timeEndedISO = new Date().toISOString();
      const timeTaken = Math.round((new Date(timeEndedISO).getTime() - new Date(startedAt).getTime()) / 1000);
      const timeM = Math.floor(timeTaken / 60);
      const timeS = timeTaken % 60;
      const timeTakenFormatted = `${timeM}:${timeS < 10 ? '0' : ''}${timeS}`;

      const totalNoFace = Object.values(examResults).reduce((a, s) => a + (s.data?.totalNoFace || 0), 0) + 
                          (proctoringData.violations.filter(v => v.type === 'no_face').length);
      const totalMultipleFaces = Object.values(examResults).reduce((a, s) => a + (s.data?.totalMultipleFaces || 0), 0) + 
                                 (proctoringData.violations.filter(v => v.type === 'multiple_faces').length);
      
      const allViolations = proctoringData.violations;

      const rawAttemptData = {
        email: effectiveUser.email, rollNumber: effectiveUser.rollNumber ?? '', name: effectiveUser.name ?? '',
        college, year, department: effectiveUser.department ?? '',
        assessmentId: effectiveAssessment.id, assessmentTitle: effectiveAssessment.name,
        assessmentId: effectiveAssessment.id, assessmentTitle: effectiveAssessment.name,
        startedAt: startedAt,
        submittedAt: serverTimestamp(), submittedAt: new Date().toISOString(),
        type: 'multisection',
        sections: examResults,
        sections: sectionsList,
        questions: aggregatedQuestions,
        coding: aggregatedCoding,
        maxScore: totalMarksSum,
        totalScore: totalScore,
        totalQuestions: totalQ,
        correctAnswers: totalScore,
        incorrectAnswers: totalQ - totalScore,
        percentage: totalMarksSum > 0 ? Math.min(100, Math.round(pct * 100)) : 0,
        partialScore,
        fullScore,
        timeTaken: timeTakenFormatted,
        timeTakenSeconds: timeTaken,
        violationCount: totalViolations,
        totalNoFace,
        totalMultipleFaces,
        violations: allViolations,
        completed: true,
        status: 'submitted',
        autoSubmitted: true,
        autoSubmitReason: reason || 'proctoring_violations'
      };

      const attemptData = buildResultDoc(rawAttemptData);

      const userId = auth?.currentUser?.uid || effectiveUser?.uid || null;
      if (!userId) {
        console.error('[MSA] autoSubmitEntireExam: not authenticated, refusing Firestore write.');
      } else {
        const tenantId = effectiveUser?.tenantId || 'SEED-SEB';
        const v2DocPath = `assessmentResults/${tenantId}/${effectiveAssessment.id}/${userId}`;

        // SECTION 13: Final submission MUST be reliable. Await the write.
        // On failure: save pending envelope for recovery on next login.
        try {
          await setDoc(doc(db, v2DocPath), attemptData, { merge: true });
          console.log('[MSA] Final result saved to Firestore canonical path');
        } catch (writeErr) {
          console.error('[MSA] Final Firestore write failed — preserving pending envelope:', writeErr);
          const envKey = `msa_pending_submission_${userId}_${effectiveAssessment.id}`;
          savePendingEnvelope(envKey, {
            uid: userId,
            assessmentId: effectiveAssessment.id,
            resultPayload: attemptData,
            savedAt: new Date().toISOString(),
            retryCount: 0,
          }).catch(() => {});
        }
      }
    }


    setExamFinished(true);
    stopAllMediaAndAI();
    sessionStorage.removeItem('multisectionAssessmentData');
    localStorage.removeItem(`msaProgress_${effectiveAssessment?.id}`);

    // ── Mark attempt completed (Firestore session + completion index) ──
    completeAssessmentSession(effectiveAssessment?.id, { autoSubmitted: true, reason: reason || 'proctoring_violations' }).catch(() => {});
    markAssessmentCompleted(effectiveUser, effectiveAssessment?.id).catch(() => {});
    if (effectiveUser?.email) invalidateCompletionCache(effectiveUser.email);

    // ── Course progress tracking (non-fatal) ──
    try {
      const courseCtx = JSON.parse(sessionStorage.getItem('msaCourseCtx') || '{}');
      if (courseCtx.courseId && courseCtx.seriesId) {
        import('../services/mcqService').then(({ default: MCQService }) => {
          const totalScore = Object.values(examResults || {}).reduce((s, sec) => s + (sec.totalScore || 0), 0);
          MCQService.markCourseProgress({
            uid: effectiveUser?.uid ?? '',
            courseId: courseCtx.courseId,
            seriesId: courseCtx.seriesId,
            assessmentId: courseCtx.assessmentId || (effectiveAssessment?.id  ?? ''),
            totalScore: totalScore,
            maxScore: courseCtx.maxScore || 100,
          }).catch(() => {});
        }).catch(() => {});
        sessionStorage.removeItem('msaCourseCtx');
      }
    } catch (_) { /* non-fatal */ }


    // Clear MCQ, Coding, and proctoring temporary workspace details
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        (effectiveAssessment?.id && key.startsWith(`msa_active_mcq_state_${effectiveAssessment.id}`)) ||
        key.startsWith(`codingAssessmentCode`) ||
        key.startsWith(`codingTimeSpentPerQ`) ||
        key.startsWith(`proctor_violations_`) ||
        key.startsWith(`proctor_events_`)
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }, [assessment, user, examResults, proctoringData]);

  const handleProctorReady = useCallback(() => {
    console.log('[MSA] Camera Proctoring is ready');
    setIsVisualProctorReady(true);
  }, []);

  const handleProctorViolationUpdate = useCallback((info) => {
    if (!info?.violationType) return;

    // ── Firestore audit trail (fire-and-forget) ───────────────────────────────
    const uid = auth?.currentUser?.uid;
    if (uid && assessment?.id) {
      writeViolationToFirestore(uid, assessment.id, {
        type:      info.violationType,
        timestamp: info.timestamp || new Date().toISOString(),
        source:    'camera',
      });
    }

    setProctoringData(prev => {
      const isReal = ['no_face', 'multiple_faces', 'tab_switch'].includes(info.violationType);
      const nextCount = typeof info.violationCount === 'number' ? info.violationCount : (prev.violationCount + 1);
      if (maxViolations > 0 && nextCount >= maxViolations) {
        console.warn(`[MSA] maxViolations (${maxViolations}) reached (count: ${nextCount}). Auto-submitting exam...`);
        window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
        stopAllMediaAndAI();
        setTimeout(() => {
          autoSubmitEntireExam('proctoring_violations');
        }, 300);
      }
      return {
        ...prev,
        violationCount: nextCount,
        violations: isReal ? [...prev.violations, { type: info.violationType, timestamp: info.timestamp }] : prev.violations
      };
    });
  }, [maxViolations, autoSubmitEntireExam, assessment?.id]);


  const handleProctorAutoSubmit = useCallback(() => {
    window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
    stopAllMediaAndAI();
    setTimeout(() => {
      autoSubmitEntireExam('proctoring_violations');
    }, 300);
  }, [autoSubmitEntireExam]);

  const handleAudioProctorReady = useCallback(() => {
    console.log('[MSA] Audio Proctoring is ready');
    setIsAudioProctorReady(true);
  }, []);

  const handleAudioProctorViolationUpdate = useCallback((info) => {
    if (!info?.type) return;

    // ── Firestore audit trail (fire-and-forget) ───────────────────────────────
    const uid = auth?.currentUser?.uid;
    if (uid && assessment?.id) {
      writeViolationToFirestore(uid, assessment.id, {
        type:      info.type,
        timestamp: info.timestamp || new Date().toISOString(),
        source:    'audio',
      });
    }

    setProctoringData(prev => {
      const nextAudioCount = (prev.audioViolationCount || 0) + 1;
      if (nextAudioCount >= maxAudioViolations) {
        window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
        stopAllMediaAndAI();
        setTimeout(() => {
          autoSubmitEntireExam('proctoring_violations');
        }, 300);
      }
      return {
        ...prev,
        audioViolationCount: nextAudioCount,
        violations: [...prev.violations, { type: info.type, timestamp: info.timestamp }]
      };
    });
  }, [maxAudioViolations, autoSubmitEntireExam]);

  // ── Tab switch & visibility change proctoring listeners (P0-06 / P1) ─────────
  useEffect(() => {
    if (!shouldUseProctoring || currentSecIdx < 0 || !secStarted || examFinished) return;

    let hiddenStartTime = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenStartTime = Date.now();
      } else {
        const awayDuration = hiddenStartTime ? Math.round((Date.now() - hiddenStartTime) / 1000) : 0;
        hiddenStartTime = 0;
        const eventData = {
          violationType: 'tab_switch',
          timestamp: new Date().toISOString(),
          awayDuration
        };
        handleProctorViolationUpdate(eventData);
      }
    };

    const handleWindowBlur = () => {
      const eventData = {
        violationType: 'tab_switch',
        timestamp: new Date().toISOString(),
        reason: 'window_blur'
      };
      handleProctorViolationUpdate(eventData);
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        const eventData = {
          violationType: 'fullscreen_exit',
          timestamp: new Date().toISOString()
        };
        handleProctorViolationUpdate(eventData);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [shouldUseProctoring, currentSecIdx, secStarted, examFinished, handleProctorViolationUpdate]);

  // ── Block back/forward navigation during exam & hide PyQt SEB nav buttons
  useEffect(() => {
    window.history.pushState({ msaActive: true }, '');
    const handler = () => window.history.pushState({ msaActive: true }, '');
    window.addEventListener('popstate', handler);

    // Hide PyQt SEB navigation controls
    window.__seedHideNavControls = true;

    return () => {
      window.removeEventListener('popstate', handler);
      window.__seedHideNavControls = false;
      try { stopAllMediaAndAI(); } catch (_) {}
    };
  }, []);

  // ── Initial load
  useEffect(() => {
    let authData = {};
    let assessmentData = null;
    try {
      authData = JSON.parse(localStorage.getItem('auth_data' || '{}'));
      assessmentData = JSON.parse(sessionStorage.getItem('multisectionAssessmentData') || 'null');

      // Fallback to persistent localStorage backup if sessionStorage was cleared by browser exit/tab close
      if (!assessmentData) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('msaActiveAssessment_')) {
            try {
              const backup = JSON.parse(localStorage.getItem(key) || 'null');
              if (backup) {
                assessmentData = backup;
                sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(backup));
                break;
              }
            } catch (_) {}
          }
        }
      }
    } catch (e) {
      console.error('[MSA] Failed to parse localStorage:', e);
    }

    if (!authData?.email || !assessmentData) {
      navigate('/student/dashboard', { replace: true });
      return;
    }

    // Immediately block if already submitted locally
    if (assessmentData.id && localStorage.getItem(`msaCompleted_${assessmentData.id}`) === 'true') {
      toast.error('You have already completed and submitted this assessment. Re-attempts are not permitted.');
      sessionStorage.removeItem('multisectionAssessmentData');
      localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
      localStorage.removeItem(`msaProgress_${assessmentData.id}`);
      navigate('/student/dashboard', { replace: true });
      return;
    }

    setUser(authData);
    setAssessment(assessmentData);
    // Mirror into refs immediately so autoSubmitEntireExam can use them
    // synchronously before React has flushed the above state updates.
    userRef.current = authData;
    assessmentRef.current = assessmentData;
    localStorage.setItem(`msaActiveAssessment_${assessmentData.id}`, JSON.stringify(assessmentData));

    // Verify if already completed/submitted on server
    const checkAttempt = async () => {
      try {
        // CANONICAL: use Firebase Auth UID for the result path.
        const uid = auth?.currentUser?.uid || authData.uid;
        if (!uid) {
          console.warn('[MSA] checkAttempt: not authenticated, skipping server check.');
          return;
        }
        const tenantId = authData.tenantId || 'SEED-SEB';
        const canonDocPath = `assessmentResults/${tenantId}/${assessmentData.id}/${uid}`;
        const docSnap = await getDoc(doc(db, canonDocPath));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.completed === true || data.status === 'submitted') {
            localStorage.setItem(`msaCompleted_${assessmentData.id}`, 'true');
            toast.error('You have already completed and submitted this assessment. Re-attempts are not permitted.');
            sessionStorage.removeItem('multisectionAssessmentData');
            localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
            localStorage.removeItem(`msaProgress_${assessmentData.id}`);
            navigate('/student/dashboard', { replace: true });
            return;
          }
        }
      } catch (err) {
        console.error('[MSA] Failed to check existing attempt:', err);
      }
    };

    checkAttempt();

    // Crash / Exit recovery with 15-minute grace period check.
    // Guard with a ref so React StrictMode's double-invoke does not fire this twice.
    const progressKey = `msaProgress_${assessmentData.id}`;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(progressKey) || 'null'); } catch (_) {}
    if (saved && saved.email && authData.Email && saved.email !== authData.Email) {
      localStorage.removeItem(progressKey);
      saved = null;
    }
    if (saved && saved.email === authData.Email) {
      const nowMs = new Date().getTime();
      const lastActiveMs = saved.lastActiveTimestamp || (saved.savedAt ? new Date(saved.savedAt).getTime() : nowMs);
      const elapsedOfflineSec = Math.floor((nowMs - lastActiveMs) / 1000);
      const GRACE_PERIOD_SEC = 900; // 15 minutes

      if (elapsedOfflineSec > GRACE_PERIOD_SEC) {
        if (gracePeriodFiredRef.current) return; // StrictMode guard
        gracePeriodFiredRef.current = true;
        console.warn(`[MSA] Offline exit duration (${elapsedOfflineSec}s) exceeded ${GRACE_PERIOD_SEC / 60}-minute grace period. Auto-submitting.`);
        toast.warning(`Your assessment was auto-submitted because your offline exit window exceeded ${GRACE_PERIOD_SEC / 60} minutes.`);
        setExamResults(saved.examResults || {});
        setSecCompleted(saved.completedSections || {});
        // Use a short delay to let React batch the state above, then submit
        setTimeout(() => {
          autoSubmitEntireExam('grace_period_exceeded');
        }, 500);
        return;
      }

      console.log(`[MSA] Restoring progress within 5-min grace period (${elapsedOfflineSec}s offline)`);
      setExamResults(saved.examResults || {});
      setSecCompleted(saved.completedSections || {});
      setRestoredProgress({
        ...saved,
        elapsedOfflineSec
      });
    }

    loadAllSections(assessmentData).then(() => {
      // Start Firestore-backed session AFTER sections are loaded
      const slug = sessionStorage.getItem('msaSlug') || (assessmentData.id  ?? '');
      startAssessmentSession(assessmentData, slug).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resume after crash / exit
  useEffect(() => {
    if (!assessment || !restoredProgress) return;
    if (restoredProgress.currentSecIdx !== undefined && restoredProgress.currentSecIdx >= 0) {
      const elapsed = restoredProgress.elapsedOfflineSec || 0;
      const adjustedTimer = Math.max(0, (restoredProgress.secTimer || 0) - elapsed);

      console.log('[MSA] Resuming active section index:', restoredProgress.currentSecIdx, 'Adjusted timer:', adjustedTimer, 's');

      if (adjustedTimer <= 0 && restoredProgress.secStarted) {
        console.warn('[MSA] Active section timer expired while offline. Submitting active section.');
        setCurrentSecIdx(restoredProgress.currentSecIdx);
        setSecStarted(true);
        setSecTimer(0);
        setSectionCountdown(null);
        setTimeout(() => autoSubmitSection(), 1000);
      } else if (restoredProgress.secStarted) {
        // Was actively in the section — restore directly without prelaunch
        setCurrentSecIdx(restoredProgress.currentSecIdx);
        setSecStarted(true);
        setSecTimer(adjustedTimer);
        setSectionCountdown(null);
      } else {
        // Was on prelaunch screen — restart prelaunch properly
        // This prevents the section view from rendering without the overlay
        handleStartSection(restoredProgress.currentSecIdx);
        if (adjustedTimer > 0) setSecTimer(adjustedTimer);
      }
    } else {
      const nextIdx = (restoredProgress.lastSectionIdx ?? -1) + 1;
      const sectionsCount = (assessment.sections || []).length;
      if (nextIdx < sectionsCount) {
        handleStartSection(nextIdx);
      } else {
        setExamFinished(true);
      }
    }
    setRestoredProgress(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment, restoredProgress]);

  // ── Continuous progress save & heartbeat to localStorage
  useEffect(() => {
    if (!assessment || currentSecIdx < 0 || !secStarted) return;
    const progressKey = `msaProgress_${assessment.id}`;
    const nowMs = new Date().getTime();
    const snapshot = {
      assessmentId: assessment.id,
      email: user?.email ?? '',
      completedSections: secCompleted,
      examResults,
      currentSecIdx,
      secStarted,
      secTimer,
      savedAt: new Date().toISOString(),
      lastActiveTimestamp: nowMs
    };
    localStorage.setItem(progressKey, JSON.stringify(snapshot));
    localStorage.setItem(`msaActiveAssessment_${assessment.id}`, JSON.stringify(assessment));
  }, [assessment, user, secCompleted, examResults, currentSecIdx, secStarted, secTimer]);

  // ── Fetch all section JSON files
  const loadAllSections = async (exam) => {
    setLoading(true);
    const loaded = {};
    try {
      await Promise.all(
        (exam.sections || []).map(async (sec, idx) => {
          const processData = async (data, secType) => {
              if (secType === 'mcq') {
                data.questions = (data.questions || []).map((q, qIdx) => q, qIdx, { isStudentView: true });
              } else if (secType === 'coding') {
                // Prefer challenges array (has cdnUrl) or questionIds
                let questionRefs = [];
                if (Array.isArray(data.challenges) && data.challenges.length > 0) {
                  questionRefs = data.challenges;
                } else if (Array.isArray(data.questionIds)) {
                  questionRefs = data.questionIds;
                } else if (Array.isArray(data.questions) && data.questions.length > 0 && typeof data.questions[0] === 'string') {
                  questionRefs = data.questions;
                }

                if (questionRefs.length > 0) {
                  try {
                    const resolved = await fetchQuestionsForContest(questionRefs);
                    data.questions = resolved.map(normalizeQuestion);
                  } catch (resErr) {
                    console.error('[MSA] Failed to resolve coding questions:', resErr);
                    data.questions = [];
                  }
                } else if (Array.isArray(data.questions) && data.questions.length > 0 && typeof data.questions[0] === 'object') {
                  data.questions = data.questions.map(normalizeQuestion);
                } else {
                  data.questions = [];
                }
              }

              // Store under all possible identifiers
              const secKeys = [sec.sectionId, sec.id, sec.name, sec.slug, String(idx)].filter(Boolean);
              secKeys.forEach(k => {
                loaded[k] = data;
              });
          };

          // 0. If section already contains inline questions/challenges, use them directly
          if (Array.isArray(sec.questions) && sec.questions.length > 0) {
            await processData({ questions: sec.questions }, sec.type);
            return;
          }
          if (Array.isArray(sec.challenges) && sec.challenges.length > 0) {
            await processData({ challenges: sec.challenges }, sec.type);
            return;
          }

          // 1. Fetch via contentApi or cdnUrl
          let fetchUrl = sec.cdnUrl || sec.url || sec.assessmentId || (sec.slug  ?? '');
          if (!fetchUrl || (!fetchUrl.endsWith('.json') && !fetchUrl.startsWith('http'))) {
            fetchUrl = sec.type === 'mcq'
              ? `mcq/testbank/${slugify(sec.name)}.json`
              : `coding/testbank/${slugify(sec.name)}.json`;
          }

          try {
            const data = await fetchContentJSON(fetchUrl);
            if (data) {
              await processData(data, sec.type);
              return;
            }
            console.warn(`[MSA] Could not load section "${sec.name}" via contentApi.`);
          } catch (e) {
            console.error(`[MSA] Failed to load section "${sec.name}":`, e);
          }
        })
      );
      setSectionData(loaded);
    } catch (err) {
      console.error('[MSA] Error loading sections:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Section timer countdown loop (drift-resistant: uses wall-clock anchor, not decrement)
  useEffect(() => {
    if (!secStarted || sectionEndTimeMsRef.current <= 0) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((sectionEndTimeMsRef.current - Date.now()) / 1000));
      setSecTimer(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
      }
    }, 500); // poll at 500ms for smooth display without significant CPU cost
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secStarted, currentSecIdx]);

  // ── Handle timer expiry (outside the state updater)
  useEffect(() => {
    if (secStarted && secTimer === 0) {
      toast(' Time up! Submitting section…', { icon: '', duration: 3000 });
      autoSubmitSection();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer, secStarted]);

  // ── 1/3-time Firestore progress save (fires once per section, non-fatal)
  const oneThirdSavedRef = useRef(false);
  const sectionTotalTimerRef = useRef(0);
  useEffect(() => {
    // Reset when section changes
    oneThirdSavedRef.current = false;
    if (assessment?.sections?.[currentSecIdx]) {
      sectionTotalTimerRef.current = (assessment.sections[currentSecIdx].duration_minutes || 30) * 60;
    }
  }, [currentSecIdx, assessment]);

  useEffect(() => {
    if (!secStarted || oneThirdSavedRef.current) return;
    const totalSecs = sectionTotalTimerRef.current;
    if (totalSecs <= 0) return;
    const saveAt = oneThirdSaveThreshold(totalSecs); // fires when 1/3 time remains
    if (secTimer <= saveAt && secTimer > 0) {
      oneThirdSavedRef.current = true;
      const activeSec = assessment?.sections?.[currentSecIdx];
      if (!activeSec || !user?.email) return;
      const sectionId = activeSec.sectionId || activeSec.name;
      // Read current MCQ answers from localStorage (MCQSectionView persists them there)
      let savedAnswers = {};
      try {
        const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
        const stateKey = `msa_active_mcq_state_${assessment.id}_${sectionId}`;
        const raw = localStorage.getItem(stateKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          savedAnswers = parsed.answers || {};
        }
        saveSessionProgress(authData, assessment.id, sectionId, savedAnswers, secTimer).catch(() => {});
      } catch (_) { /* non-fatal */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer, secStarted]);

  const countdownWaitRef = useRef(0);

  // ── Relaxation countdown between sections (15 seconds)
  useEffect(() => {
    if (relaxationCountdown === null) return;
    if (relaxationCountdown <= 0) {
      setRelaxationCountdown(null);
      handleStartSection(relaxationNextIdx);
      return;
    }
    const t = setTimeout(() => setRelaxationCountdown(prev => (prev ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relaxationCountdown]);

  // ── Pre-section countdown
  useEffect(() => {
    if (sectionCountdown === null) {
      countdownWaitRef.current = 0;
      return;
    }
    if (sectionCountdown <= 0) {
      const activeSec = assessment?.sections?.[countdownSecIdx];
      const qList = activeSec ? (sectionData[activeSec.sectionId]?.questions || sectionData[activeSec.id]?.questions || sectionData[activeSec.name]?.questions || sectionData[activeSec.slug]?.questions || sectionData[String(countdownSecIdx)]?.questions) : null;
      const questionsLoaded = Array.isArray(qList) && qList.length > 0;

      const visualReady = !shouldUseProctoring || isVisualProctorReady;
      const audioReady = !shouldUseAudioProctoring || isAudioProctorReady;

      countdownWaitRef.current += 1;

      if (questionsLoaded && ((visualReady && audioReady) || countdownWaitRef.current > 6)) {
        setSecStarted(true);
        setSectionCountdown(null);
        countdownWaitRef.current = 0;
      } else {
        const t = setTimeout(() => setSectionCountdown(0), 1000);
        return () => clearTimeout(t);
      }
      return;
    }
    const t = setTimeout(() => setSectionCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [
    sectionCountdown,
    countdownSecIdx,
    sectionData,
    shouldUseProctoring,
    isVisualProctorReady,
    shouldUseAudioProctoring,
    isAudioProctorReady,
    assessment
  ]);

  const submittingSecIdxRef = useRef(-1);

  const handleStartSection = useCallback((idx) => {
    submittingSecIdxRef.current = -1;
    sectionStartTimesRef.current[idx] = new Date().toISOString();
    setCurrentSecIdx(idx);

    // ── Firestore: mark section started ──
    const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
    if (assessment?.sections?.[idx] && authData?.email) {
      const sec = assessment.sections[idx];
      markSectionStarted(assessment.id, {
        sectionId: sec.sectionId || sec.id || sec.name,
        name:      sec.name ?? '',
        secIdx:    idx,
        durationMinutes: sec.duration_minutes || 30,
      }).catch(() => {});

      // Store coding section start time for CodingAssessmentPage timing
      if (sec.type === 'coding') {
        sessionStorage.setItem('codingSecStartTime', new Date().toISOString());
      }
    }

    if (idx === 0) {
      // Section 0: initial prelaunch check for camera/mic resources
      setCountdownSecIdx(0);
      setSectionCountdown(5);
      setIsVisualProctorReady(false);
      setIsAudioProctorReady(false);
    } else {
      // Subsequent sections: single proctoring session continues seamlessly!
      setCountdownSecIdx(idx);
      setSectionCountdown(null);
      setSecStarted(true);
    }

    if (assessment && assessment.sections) {
      const section = assessment.sections[idx];
      if (section) {
        const durationSecs = (section.durationMinutes || section.duration_minutes || section.duration || 30) * 60;
        // Anchor the wall-clock end time so the timer is drift-resistant
        sectionEndTimeMsRef.current = Date.now() + durationSecs * 1000;
        setSecTimer(durationSecs);
      }
    }
  }, [assessment]);

  const autoSubmitSection = useCallback(async (sectionResults) => {
    if (examFinishedRef.current) return;
    if (!assessment?.sections || currentSecIdx < 0 || currentSecIdx >= assessment.sections.length) return;

    if (submittingSecIdxRef.current === currentSecIdx) {
      console.warn(`[MSA] Duplicate section submission call blocked for section index ${currentSecIdx}`);
      return;
    }
    submittingSecIdxRef.current = currentSecIdx;

    const activeSection = assessment.sections[currentSecIdx];
    if (!activeSection) return;

    const secstartedAt = sectionStartTimesRef.current[currentSecIdx] || new Date().toISOString();
    const secsubmittedAt = new Date().toISOString();
    const secTimeSpentSeconds = Math.round((new Date(secsubmittedAt).getTime() - new Date(secstartedAt).getTime()) / 1000);

    const updatedResults = {
      ...examResults,
      [activeSection.sectionId]: {
        sectionName: activeSection.name,
        type: activeSection.type,
        startedAt: secstartedAt,
        submittedAt: secsubmittedAt,
        timeSpentSeconds: secTimeSpentSeconds,
        data: sectionResults || {}
      }
    };

    setExamResults(updatedResults);
    setSecCompleted(prev => ({ ...prev, [activeSection.sectionId]: true }));
    setSecStarted(false);
    clearInterval(timerRef.current);

    // ── Firestore: mark section completed ──
    const authDataSec = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
    if (authDataSec?.Email && assessment?.id) {
      markSectionCompleted(assessment.id, activeSection.sectionId || activeSection.name).catch(() => {});
    }

    const nextIdx = currentSecIdx + 1;
    const totalSections = (assessment.sections || []).length;

    if (nextIdx < totalSections) {
      // Save partial progress
      const progressKey = `msaProgress_${assessment.id}`;
      const snapshot = {
        assessmentId: assessment.id,
        email: user?.email ?? '',
        completedSections: Object.fromEntries(Object.keys(updatedResults).map(id => [id, true])),
        examResults: updatedResults,
        lastSectionIdx: currentSecIdx,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(progressKey, JSON.stringify(snapshot));

      // See autoSubmitEntireExam: never substitute a tenant, skip the write.
      const tenant = resolveTenant(user);
      if (user?.email && !tenant.valid) {
        console.error('[MSA] Incomplete profile, refusing remote write:', tenant.missing);
      }
      if (user?.email && tenant.valid) {
        const { year } = tenant;
        const tenantId = user?.tenantId ?? tenant.tenantId ?? '';
        const userId = auth?.currentUser?.uid;
        if (!userId) {
          console.error('[MSA] autoSubmitSection partial: not authenticated, refusing Firestore write.');
        } else {
          setDoc(doc(db, `assessmentResults/${tenantId}/${assessment.id}/${userId}`), {
            userId, email: user.email, rollNumber: user.rollNumber ?? '', name: user.name ?? '',
            tenantId: tenantId, cohortId: user?.cohortId ?? year ?? "",
            assessmentId: assessment.id, assessmentTitle: assessment.name,
            type: 'multisection', status: 'partial',
            sectionsCompleted: currentSecIdx + 1, totalSections,
            sections: updatedResults, lastUpdatedAt: serverTimestamp(),
            lastUpdatedAtISO: new Date().toISOString()
          }, { merge: true }).catch(e => console.error('[MSA] Partial Firestore save failed:', e));
        }
      }

      // ── 15-second inter-section relaxation ──
      const nextSec = assessment.sections[nextIdx];
      toast.success(` Section submitted! Next: "${nextSec?.name || `Section ${nextIdx + 1}`}" starts in 15 seconds.`, { duration: 5000 });
      setRelaxationNextIdx(nextIdx);
      setRelaxationCountdown(15);
      // handleStartSection(nextIdx) is called by the relaxation countdown useEffect
    } else {
      // All sections done — final submission
      setIsSubmittingEntireExam(true);
      const tenant = resolveTenant(user);
      const college = user?.college ?? tenant.college ?? '';
      const year = user?.year ?? tenant.year ?? '';
      
      try {
        const sectionsList = Object.values(updatedResults).map(sec => {
          const secTime = sec.timeSpentSeconds || sec.data?.timeSpentSeconds || 0;
          const secM = Math.floor(secTime / 60);
          const secS = secTime % 60;
          return {
            sectionName: sec.sectionName ?? '',
            name: sec.sectionName ?? '',
            score: sec.data?.score || 0,
            maxScore: sec.data?.maxScore || sec.data?.totalQuestions || 0,
            maxScore: sec.data?.maxScore || sec.data?.totalQuestions || 0,
            startedAt: sec.startedAt ?? '',
            submittedAt: sec.submittedAt ?? '',
            timeSpentSeconds: secTime,
            timeTaken: secTime,
            timeTakenFormatted: `${secM}:${secS < 10 ? '0' : ''}${secS}`
          };
        });

        const aggregatedQuestions = Object.values(updatedResults)
          .filter(sec => sec.type === 'mcq' && sec.data?.questions)
          .reduce((acc, sec) => acc.concat(sec.data.questions), []);

        const aggregatedCoding = Object.values(updatedResults)
          .filter(sec => sec.type === 'coding' && (sec.data?.questions || sec.data?.coding))
          .reduce((acc, sec) => acc.concat(sec.data.questions || sec.data.coding || []), []);

        const aggregatedSpokenEnglish = Object.values(updatedResults)
          .filter(sec => (sec.type === 'spoken_english' || sec.type === 'speech' || sec.type === 'sea'))
          .map(sec => sec.data || {});

        const totalMarksSum = Object.values(updatedResults).reduce((a, s) => a + (s.data?.maxScore || s.data?.totalQuestions || 0), 0);

        const totalScore = Object.values(updatedResults).reduce((a, s) => a + (s.data?.score || 0), 0);
        const totalQ = Object.values(updatedResults).reduce((a, s) => a + (s.data?.totalQuestions || 0), 0);
        const pct = totalMarksSum > 0 ? totalScore / totalMarksSum : 0;
        const partialScore = totalScore;
        const fullScore = (totalMarksSum > 0 && totalScore >= totalMarksSum) ? totalMarksSum : 0;

        const startedAt = examStartTimeRef.current;
        const timeEndedISO = new Date().toISOString();
        const timeTaken = Math.round((new Date(timeEndedISO).getTime() - new Date(startedAt).getTime()) / 1000);
        const timeM = Math.floor(timeTaken / 60);
        const timeS = timeTaken % 60;
        const timeTakenFormatted = `${timeM}:${timeS < 10 ? '0' : ''}${timeS}`;

        const vInfo = getViolations(assessment.id, user.email);
        const allViolations = (vInfo.violations && vInfo.violations.length > 0) ? vInfo.violations : (proctoringData.violations || []);
        const totalViolations = Math.max(vInfo.violationCount || 0, proctoringData.violationCount || 0, allViolations.length);
        const totalNoFace = allViolations.filter(v => v.type === 'no_face').length;
        const totalMultipleFaces = allViolations.filter(v => v.type === 'multiple_faces').length;

        const autoSubmitted = Object.values(updatedResults).some(s => s.data?.autoSubmitted);
        const autoSubmitReason = Object.values(updatedResults)
          .map(s => s.data?.autoSubmitReason ?? '')
          .filter(Boolean)
          .join(', ');

        const rawAttemptData = {
          email: user?.email ?? '', rollNumber: user?.rollNumber || '', name: user?.name ?? '',
          college, year, department: user?.department ?? '',
          assessmentId: assessment.id, assessmentTitle: assessment.name,
          assessmentId: assessment.id, assessmentTitle: assessment.name,
          // P1-02: deterministic attemptId = assessmentId_uid_startEpochMs
          // Allows future attempt history lookup without changing the doc path.
          attemptId: `${assessment.id}_${auth?.currentUser?.uid ?? ''}_${new Date(startedAt).getTime()}`,
          startedAt: startedAt,
          startedAtISO: startedAt,
          submittedAt: serverTimestamp(), submittedAt: timeEndedISO,
          type: 'multisection',
          sections: updatedResults,
          sections: sectionsList,
          questions: aggregatedQuestions,
          coding: aggregatedCoding,
          spokenEnglish: aggregatedSpokenEnglish.length > 0 ? aggregatedSpokenEnglish[0] : null,
          sea: aggregatedSpokenEnglish.length > 0 ? aggregatedSpokenEnglish[0] : null,
          maxScore: totalMarksSum,
          totalScore: totalScore,
          totalQuestions: totalQ,
          correctAnswers: totalScore,
          incorrectAnswers: totalQ - totalScore,
          percentage: totalMarksSum > 0 ? Math.min(100, Math.round(pct * 100)) : 0,
          partialScore,
          fullScore,
          timeTaken: timeTakenFormatted,
          timeTakenSeconds: timeTaken,
          violationCount: totalViolations,
          totalNoFace,
          totalMultipleFaces,
          violations: allViolations,
          completed: true,
          status: 'submitted',
          autoSubmitted,
          autoSubmitReason
        };

        const attemptData = buildResultDoc(rawAttemptData);

        const userId = auth?.currentUser?.uid;
        if (!userId) {
          console.error('[MSA] autoSubmitSection final: not authenticated, refusing Firestore write.');
        } else {
          let rawTid = String(user?.tenantId || (tenant?.tenantId  ?? '')).trim();
          if (!rawTid || rawTid.includes(' ')) {
            rawTid = 'SEED-SEB';
          }
          const v2DocPath = `assessmentResults/${rawTid}/${assessment.id}/${userId}`;

          try {
            await setDoc(doc(db, v2DocPath), attemptData, { merge: true });
            console.log('[MSA] Final result saved to Firestore canonical path');
          } catch (writeErr) {
            console.error('[MSA] handleFinalSubmit: Firestore write failed — preserving pending envelope:', writeErr);
            const envKey = `msa_pending_submission_${userId}_${assessment.id}`;
            savePendingEnvelope(envKey, {
              uid: userId,
              assessmentId: assessment.id,
              resultPayload: attemptData,
              savedAt: new Date().toISOString(),
              retryCount: 0,
            }).catch(() => {});
            toast.error(
              ' Submission saved — please reconnect. Your answers are safe and will sync automatically.',
              { duration: 8000 }
            );
          }
        }

        setExamFinished(true);
        toast.success(' Assessment submitted! Returning to dashboard…', { duration: 4000 });
        setTimeout(() => {
          navigate('/student/dashboard', { replace: true, state: { justCompleted: true } });
        }, 4000);
        if (assessment?.id) {
          localStorage.setItem(`msaCompleted_${assessment.id}`, 'true');
        }
        sessionStorage.removeItem('multisectionAssessmentData');
        localStorage.removeItem(`msaProgress_${assessment?.id}`);
        localStorage.removeItem(`msaActiveAssessment_${assessment?.id}`);

        // ── Mark attempt fully completed (Firestore session + completion index) ──
        completeAssessmentSession(assessment?.id).catch(() => {});
        markAssessmentCompleted(user, assessment?.id).catch(() => {});
        if (user?.email) invalidateCompletionCache(user.email);
      } finally {
        setIsSubmittingEntireExam(false);
      }

      // Clear MCQ, Coding, and proctoring temporary workspace details
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith(`msa_active_mcq_state_${assessment?.id}`) ||
          key.startsWith(`codingAssessmentCode`) ||
          key.startsWith(`codingTimeSpentPerQ`) ||
          key.startsWith(`proctor_violations_`) ||
          key.startsWith(`proctor_events_`)
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  }, [assessment, currentSecIdx, examResults, handleStartSection, user]);

  // Intercept forward navigation when exam is finished
  useEffect(() => {
    if (examFinished) {
      window.history.replaceState(null, '', '/student/dashboard');
      const handleForward = () => {
        window.history.pushState(null, '', '/student/dashboard');
        navigate('/student/dashboard', { replace: true, state: { justCompleted: true } });
      };
      window.addEventListener('popstate', handleForward);
      return () => window.removeEventListener('popstate', handleForward);
    }
  }, [examFinished, navigate]);

  // ────────────────────────── RENDER ─────────────────────────────────────────

  if (loading || !assessment) {
    return (
      <div className="msa-loading">
        <SecurityWatermark email={user?.email} />
        <div className="msa-spinner" />
        <p>Loading multi-section exam environment...</p>
      </div>
    );
  }

  // Exam finished screen
  if (examFinished) {
    return (
      <div className="msa-finished-container" style={{ maxWidth: '600px', margin: '100px auto', padding: '45px', background: '#1e293b', borderRadius: '12px', color: '#f8fafc', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', fontFamily: "'Inter',sans-serif", textAlign: 'center' }}>
        <SecurityWatermark email={user?.email} />
        <FaCheckCircle style={{ color: '#10b981', fontSize: '5rem', marginBottom: '20px' }} />
        <h1 style={{ fontSize: '2.4rem', fontWeight: '800', color: 'white', marginBottom: '15px' }}>Assessment Completed!</h1>
        <p style={{ color: '#94a3b8', fontSize: '1.2rem', lineHeight: '1.6', marginBottom: '40px' }}>
          Congratulations <strong>{user?.name}</strong>, your answers have been successfully recorded and submitted. You may now safely return to the dashboard.
        </p>
        <button
          onClick={() => {
            window.history.replaceState(null, '', '/student/dashboard');
            navigate('/student/dashboard', { replace: true, state: { justCompleted: true } });
          }}
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', padding: '14px 35px', fontSize: '1.1rem', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const activeSection = currentSecIdx >= 0 ? assessment.sections?.[currentSecIdx] : null;

  // ── Inter-section relaxation screen (15-second countdown)
  if (relaxationCountdown !== null) {
    const nextSec = assessment.sections?.[relaxationNextIdx];
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', fontFamily: "'Inter', sans-serif" }}>
        <SecurityWatermark email={user?.email} />
        <div style={{ textAlign: 'center', padding: '48px', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '520px', width: '90%' }}>
          <FaCheckCircle style={{ color: '#10b981', fontSize: '4rem', marginBottom: '20px' }} />
          <h2 style={{ color: '#f1f5f9', fontSize: '1.8rem', fontWeight: '700', margin: '0 0 12px' }}>Section Submitted!</h2>
          <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '32px' }}>
            Next section: <strong style={{ color: '#e2e8f0' }}>{nextSec?.name || `Section ${relaxationNextIdx + 1}`}</strong>
          </p>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', border: '4px solid rgba(99,102,241,0.3)', borderTop: '4px solid #6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', animation: 'spin 1s linear infinite' }}>
            <span style={{ fontSize: '2.4rem', fontWeight: '800', color: '#6366f1' }}>{relaxationCountdown}</span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Starting automatically in {relaxationCountdown} second{relaxationCountdown !== 1 ? 's' : ''}&hellip;</p>
          <button
            onClick={() => { setRelaxationCountdown(0); }}
            style={{ marginTop: '20px', background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Start Now
          </button>
        </div>
      </div>
    );
  }

  const activeSecData = activeSection
    ? (sectionData[activeSection.sectionId] || sectionData[activeSection.id] || sectionData[activeSection.name] || sectionData[activeSection.slug] || sectionData[String(currentSecIdx)] || null)
    : null;

  // ── Active section view (MCQ or Coding)
  if (activeSection) {
    const codingQTimers = (() => {
      const qCount = (activeSecData?.questions || []).length;
      if (activeSection.questionTimerList) {
        const parts = String(activeSection.questionTimerList).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
        if (parts.length > 0) return Array.from({ length: qCount }, (_, idx) => parts[idx] !== undefined ? parts[idx] : parts[parts.length - 1]);
      }
      if (activeSection.questionTimer) return Array(qCount).fill(activeSection.questionTimer);
      return [];
    })();
    const sectionSettings = activeSection.type === 'mcq'
      ? {
          timerRestrictedSubmit: isTruthy(activeSection.timerRestrictedSubmit),
          questionTimer: activeSection.questionTimer || 0,
          forwardOnly: isTruthy(activeSection.forwardOnly) || (activeSection.questionTimer > 0),
          proctored: isTruthy(assessment.proctored) || isTruthy(activeSection.proctored),
          // audioProctored is independent of camera proctoring — only use its own flag
          audioProctored: isTruthy(assessment.audioProctored) || isTruthy(activeSection.audioProctored),
          maxViolations: Number(assessment.maxViolations) || 7,
          maxAudioViolations: Number(assessment.maxAudioViolations) || 5
        }
      : {
          timerRestrictedSubmit: isTruthy(activeSection.timerRestrictedSubmit),
          questionTimers: codingQTimers,
          forwardOnly: isTruthy(activeSection.forwardOnly) || (codingQTimers.length > 0),
          proctored: isTruthy(assessment.proctored) || isTruthy(activeSection.proctored),
          maxViolations: Number(assessment.maxViolations) || 7,
          // audioProctored is independent of camera proctoring — only use its own flag
          audioProctored: isTruthy(assessment.audioProctored) || isTruthy(activeSection.audioProctored),
          maxAudioViolations: Number(assessment.maxAudioViolations) || 5
        };
    const sectionView = (activeSection.type === 'spoken_english' || activeSection.type === 'speech' || activeSection.type === 'sea')
      ? (
        <SpokenEnglishAssessment
          key={`spoken-${activeSection.sectionId}`}
          assessmentData={{ ...activeSecData, name: activeSection.name }}
          user={user}
          onSectionSubmit={(res) => autoSubmitSection(res)}
          onBack={(res) => autoSubmitSection(res)}
        />
      )
      : activeSection.type === 'mcq'
      ? (
        <MCQSectionView
          key={`mcq-${activeSection.sectionId}`}
          sectionData={activeSecData}
          secTimer={secTimer}
          secStarted={secStarted}
          proctoringData={proctoringData}
          settings={sectionSettings}
          onSectionSubmit={autoSubmitSection}
          assessmentName={assessment.name ?? ''}
          assessmentId={assessment.id ?? ''}
        />
      )
      : (
        <CodingSectionView
          key={`coding-${activeSection.sectionId}`}
          sectionData={activeSecData}
          secTimer={secTimer}
          settings={sectionSettings}
          proctoringData={proctoringData}
          onSectionSubmit={autoSubmitSection}
          assessmentName={assessment.name ?? ''}
          assessmentId={assessment.id ?? ''}
        />
      );

  return (
    <>
      <SecurityWatermark email={user?.email} />
      {shouldUseProctoring && user?.email && (
        <ProctoringEngine
          uid={user.email}
          assessmentId={assessment.id}
          isTestActive={currentSecIdx >= 0 && !examFinished}
          maxViolations={maxViolations}
          onReady={handleProctorReady}
          onViolationUpdate={handleProctorViolationUpdate}
          onAutoSubmit={handleProctorAutoSubmit}
        />
      )}
      {shouldUseAudioProctoring && user?.email && (
        <AudioProctoringEngine
          uid={user.email}
          assessmentId={assessment.id}
          isTestActive={currentSecIdx >= 0 && !examFinished}
          maxViolations={maxAudioViolations}
          onReady={handleAudioProctorReady}
          onViolationUpdate={handleAudioProctorViolationUpdate}
        />
      )}
      {sectionView}
        {/* Pre-section countdown overlay */}
        {sectionCountdown !== null && (() => {
          const activeSec = assessment?.sections?.[countdownSecIdx];
          const qList = activeSec ? (sectionData[activeSec.sectionId]?.questions || sectionData[activeSec.id]?.questions || sectionData[activeSec.name]?.questions || sectionData[activeSec.slug]?.questions || sectionData[String(countdownSecIdx)]?.questions) : null;
          const questionsLoaded = Array.isArray(qList) && qList.length > 0;
          return (
            <div style={{
              position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
              background: 'var(--bg-primary)',
              color: 'var(--text-main)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 99999, fontFamily: "'Inter',sans-serif"
            }}>
              <div style={{ textAlign: 'center', maxWidth: '500px', padding: '20px' }}>
                <div className="msa-spinner" style={{ width: '60px', height: '60px', borderTopColor: 'var(--accent-coding)', margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '8px', color: 'var(--accent-coding)', letterSpacing: '-0.02em' }}>
                  Preparing Section Workspace...
                </h2>
                {assessment?.name && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700', marginBottom: '6px' }}>
                    {assessment.name}
                  </p>
                )}
                <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '24px', lineHeight: '1.6' }}>
                  Entering Section: <strong style={{ color: 'var(--text-main)' }}>{assessment?.sections?.[countdownSecIdx]?.name}</strong>.
                  <br />Loading questions and preparing environment.
                </p>

                {/* Status indicators */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '24px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '0.9rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Section Questions:</span>
                    <span style={{ fontWeight: '600', color: questionsLoaded ? '#10b981' : '#f59e0b' }}>
                      {questionsLoaded ? 'Loaded ' : 'Fetching questions...'}
                    </span>
                  </div>
                  {shouldUseProctoring && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Camera Proctoring:</span>
                      <span style={{ fontWeight: '600', color: isVisualProctorReady ? '#10b981' : '#f59e0b' }}>
                        {isVisualProctorReady ? 'Ready ' : 'Initializing AI & models...'}
                      </span>
                    </div>
                  )}
                  {shouldUseAudioProctoring && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Microphone Proctoring:</span>
                      <span style={{ fontWeight: '600', color: isAudioProctorReady ? '#10b981' : '#f59e0b' }}>
                        {isAudioProctorReady ? 'Ready ' : 'Requesting mic permission...'}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px 32px', display: 'inline-block' }}>
                  <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '700' }}>
                    {sectionCountdown <= 0 ? 'Waiting for resources...' : 'Section Starts In'}
                  </div>
                  <div style={{ fontSize: '3.5rem', fontWeight: '900', color: 'var(--text-main)', fontFamily: 'monospace', lineHeight: '1' }}>
                    {sectionCountdown > 0 ? `${sectionCountdown}s` : '0s'}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {/* Global Submitting Overlay */}
        {isSubmittingEntireExam && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999, color: 'white', fontFamily: "'Inter', sans-serif"
          }}>
            <div style={{
              background: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px', padding: '36px 48px', textAlign: 'center', maxWidth: '460px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
              <div className="learn-spinner" style={{ width: '48px', height: '48px', borderTopColor: '#6366f1', margin: '0 auto 20px' }} />
              <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '8px', color: '#f8fafc' }}>Submitting Assessment...</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5', margin: 0 }}>
                Evaluating test responses, compiling score metrics, and syncing with the secure server. Please do not close the window.
              </p>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Welcome / Navigation screen (currentSecIdx === -1 or between sections)
  return (
    <div className="msa-root">
      <SecurityWatermark email={user?.email} />
      <header className="msa-header">
        <div className="msa-header-title">
          <span></span> {assessment.name}
        </div>
        <div className="msa-candidate-info">
          <span>{user?.name ?? ''}</span>
          <span className="msa-email">{user?.email}</span>
        </div>
      </header>

      <div className="msa-workspace">
        <aside className="msa-sidebar">
          <h3 className="msa-sidebar-title">Exam Sections</h3>
          <div className="msa-section-list">
            {(() => {
              const firstUncompletedIdx = (assessment?.sections || []).findIndex(sec => !secCompleted[sec.sectionId]);
              const activeIdx = currentSecIdx >= 0 ? currentSecIdx : (firstUncompletedIdx >= 0 ? firstUncompletedIdx : 0);
              return (assessment?.sections || []).map((sec, idx) => {
                const isCompleted = !!secCompleted[sec.sectionId];
                const isActive = idx === currentSecIdx;
                const isLocked = !isCompleted && idx > activeIdx;
                return (
                  <div key={sec.sectionId} className={`msa-sec-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}>
                    <div className="msa-sec-card-header">
                      <span className="msa-sec-icon">{sec.type === 'mcq' ? <FaBookOpen /> : <FaCode />}</span>
                      <span className="msa-sec-name">{sec.name}</span>
                    </div>
                    <div className="msa-sec-card-meta">
                      <span>{sec.duration_minutes} Mins</span>
                      <span>•</span>
                      <span>{sec.type.toUpperCase()}</span>
                    </div>
                    {isCompleted
                      ? <span className="msa-badge completed">Submitted</span>
                      : isActive
                        ? <span className="msa-badge active">Active Now</span>
                        : isLocked
                          ? <span className="msa-badge locked"><FaLock /> Locked</span>
                          : <button className="msa-start-btn" onClick={() => handleStartSection(idx)}>Start Section</button>
                    }
                  </div>
                );
              });
            })()}
          </div>
        </aside>

        <main className="msa-content">
          {currentSecIdx === -1 ? (
            <div className="msa-intro-card">
              <h2>Welcome to the Assessment</h2>
              <p>This exam consists of multiple sections. Each section has a separate countdown timer and questions.</p>
              <div className="msa-rules-box">
                <h4>Guidelines:</h4>
                <ul>
                  <li>Once you start a section, its timer starts counting down and cannot be paused.</li>
                  <li>When a section's timer expires, your progress is automatically saved and you proceed to the next section.</li>
                  <li>You cannot navigate back to a completed or submitted section.</li>
                  <li>Fullscreen mode is monitored and proctored. Tab switches will log violations.</li>
                </ul>
              </div>
              <button
                className="msa-action-btn primary"
                onClick={() => {
                  const targetIdx = (assessment?.sections || []).findIndex(sec => !secCompleted[sec.sectionId]);
                  handleStartSection(targetIdx >= 0 ? targetIdx : 0);
                }}
              >
                Proceed to Assessment Section <FaChevronRight />
              </button>
            </div>
          ) : (
            <div className="msa-intro-card">
              <h2>Section Submitted Successfully</h2>
              <p>You have finished the current section. The next section will start shortly.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MultiSectionAssessment;
