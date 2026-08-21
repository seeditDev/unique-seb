import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from '../router-compat';
import { fetchPracticeContest, fetchQuestionsForContest } from '../services/codingQuestionBankService';
import { getSolvedQuestionIds, getFullProgress, getQuestionDisplayStatus } from '../services/codingProgressService';
import { getAuthData } from '../utils/storageUtils';
import '../styles/PracticeContestPage.css';

const DIFF_CLASS = {
  Beginner: 'diff-beginner', Easy: 'diff-easy', Medium: 'diff-medium', Hard: 'diff-hard',
};

const STATUS_ICON = {
  SOLVED: 'SOLVED', ATTEMPTED: 'ATTEMPTED', UNSOLVED: 'UNSOLVED', LOCKED: 'LOCKED',
};

const PracticeContestPage = () => {
  const navigate = useNavigate();
  const { courseId, moduleId, contestId } = useParams();

  const [contest, setContest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [solvedIds, setSolvedIds] = useState([]);
  const [attemptedIds, setAttemptedIds] = useState([]);
  const [problemDetails, setProblemDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  useEffect(() => {
    const authData = getAuthData();
    setUser(authData);
    loadData(authData);
  }, [courseId, moduleId, contestId]);

  const loadData = async (authData) => {
    setLoading(true);
    setError(null);
    try {
      const [contestData, progressData] = await Promise.all([
        fetchPracticeContest(courseId, moduleId, contestId),
        // STRICT UID: canonical Practice identity is Firebase Auth UID only.
        // Do NOT fall back to email — that reads a different/legacy document.
        (() => {
          const uid = authData?.uid;
          if (!uid) {
            console.warn('[PracticeContestPage] Firebase UID not available — progress not loaded');
            return Promise.resolve({ completedQuestions: [], solvedProblems: [], attemptedQuestions: [], problemDetails: {} });
          }
          return getFullProgress(uid).catch(() => ({ completedQuestions: [], solvedProblems: [], attemptedQuestions: [], problemDetails: {} }));
        })(),
      ]);

      setContest(contestData);
      setSolvedIds(progressData.completedQuestions || progressData.solvedProblems || []);
      setAttemptedIds(progressData.attemptedQuestions || []);
      setProblemDetails(progressData.problemDetails || {});

      // Fetch actual question data
      const qs = await fetchQuestionsForContest(contestData.questionIds || []);
      setQuestions(qs);
    } catch (err) {
      setError('Failed to load contest: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const isPremiumUser = Boolean(user?.isPremium);

  const handleQuestionClick = (q, status) => {
    if (status === 'LOCKED') {
      setShowPremiumModal(true);
      return;
    }
    // Navigate to practice sandbox with question context
    navigate(`/student/practice/solve/${q.questionId}`, {
      state: { courseId, moduleId, contestId, scoringType: contest?.defaultScoringType },
    });
  };

  // Progress stats
  const statCounts = questions.reduce((acc, q) => {
    const st = getQuestionDisplayStatus(q.questionId, solvedIds, problemDetails, q.metadata?.isPremium, isPremiumUser, attemptedIds);
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  const solvedCount = statCounts['SOLVED'] || 0;
  const progressPct = questions.length > 0 ? (solvedCount / questions.length) * 100 : 0;

  if (loading) {
    return (
      <div className="pcont-root">
        <div className="pcont-center">
          <div className="pcont-spinner" />
          <p>Loading contest questions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pcont-root">
        <div className="pcont-center">
          <p style={{ color: '#f87171' }}> {error}</p>
          <button className="pcont-back-btn" onClick={() => navigate(-1)}>← Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pcont-root">
      {/* Header */}
      <div className="pcont-header">
        <button className="pcont-back-btn" onClick={() => navigate(-1)}>← Back</button>
        <div className="pcont-header-info">
          <div className="pcont-header-title">{contest?.title ?? ''}</div>
          <div className="pcont-header-sub">
            {questions.length} question{questions.length !== 1 ? 's' : ''} · {contest?.defaultScoringType?.replace('_', ' ') || 'Partial Score'}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="pcont-progress-bar">
        <div className="pcont-progress-stats">
          <div className="pcont-stat">
            <div className="pcont-stat-dot solved" />
            <span>Solved: {solvedCount}</span>
          </div>
          <div className="pcont-stat">
            <div className="pcont-stat-dot attempted" />
            <span>Attempted: {statCounts['ATTEMPTED'] || 0}</span>
          </div>
          <div className="pcont-stat">
            <div className="pcont-stat-dot unsolved" />
            <span>Remaining: {statCounts['UNSOLVED'] || 0}</span>
          </div>
          {statCounts['LOCKED'] > 0 && (
            <div className="pcont-stat">
              <div className="pcont-stat-dot locked" />
              <span>Locked: {statCounts['LOCKED']}</span>
            </div>
          )}
        </div>
        <div className="pcont-track">
          <div className="pcont-track-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Question List */}
      <div className="pcont-list">
        {questions.length === 0 ? (
          <div className="pcont-center">
            <p style={{ fontSize: 48 }}></p>
            <p>No questions in this contest yet.</p>
          </div>
        ) : (
          questions.map((q, idx) => {
            const status = getQuestionDisplayStatus(q.questionId, solvedIds, problemDetails, q.metadata?.isPremium, isPremiumUser, attemptedIds);
            const bestScore = problemDetails[q.questionId]?.bestScore;
            const lang = problemDetails[q.questionId]?.language;

            return (
              <div
                key={q.questionId}
                className={`pcont-q-row ${status.toLowerCase()}`}
                onClick={() => handleQuestionClick(q, status)}
              >
                <div className="pcont-q-num">{idx + 1}</div>
                <div className={`pcont-q-status-icon ${status.toLowerCase()}`}>
                  {STATUS_ICON[status]}
                </div>
                <div className="pcont-q-info">
                  <div className="pcont-q-title">{q.title}</div>
                  <div className="pcont-q-meta">
                    <span className={`pcont-q-tag cat`}>{q.metadata?.category}</span>
                    <span className={`pcont-q-tag ${DIFF_CLASS[q.metadata?.difficulty] ?? ''}`}>
                      {q.metadata?.difficulty}
                    </span>
                    {q.metadata?.isPremium && <span className="pcont-q-tag premium"> Premium</span>}
                    {bestScore !== undefined && (
                      <span className="pcont-q-tag score">
                        Best: {bestScore}% {lang && `· ${lang}`}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--pc-text-dim)' }}>
                      {q.testCases?.totalTestCases || 0} test cases
                    </span>
                  </div>
                </div>
                <div className="pcont-q-arrow">›</div>
              </div>
            );
          })
        )}
      </div>

      {/* Premium Modal */}
      {showPremiumModal && (
        <div className="pcont-modal-overlay" onClick={() => setShowPremiumModal(false)}>
          <div className="pcont-modal" onClick={e => e.stopPropagation()}>
            <div className="pcont-modal-icon"></div>
            <div className="pcont-modal-title">Premium Content Required</div>
            <div className="pcont-modal-desc" style={{ marginBottom: '20px', lineHeight: '1.5' }}>
              This question is available exclusively to Premium members.
              To upgrade, please reach out to your Placement Department or contact your SEED-IT Training Manager.
            </div>
            <button className="pcont-modal-btn primary" onClick={() => setShowPremiumModal(false)} style={{ width: '100%' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeContestPage;
