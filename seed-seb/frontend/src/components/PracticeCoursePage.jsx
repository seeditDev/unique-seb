import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from './router-compat';
import { fetchCourse, fetchModulesForCourse, fetchContestsForModule, fetchQuestionsForContest } from '../services/codingQuestionBankService';
import { getSolvedQuestionIds } from '../services/codingProgressService';
import { getAuthData } from '../utils/storageUtils';
import '../styles/PracticeHome.css'; // Reuse base styles

const PracticeCoursePage = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();

  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [solvedIds, setSolvedIds] = useState([]);
  const [moduleStats, setModuleStats] = useState({}); // moduleId → { total, solved }
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const authData = getAuthData();
    setUser(authData);
    loadData(authData);
  }, [courseId]);

  const loadData = async (authData) => {
    setLoading(true);
    try {
      // STRICT UID: canonical Practice identity is Firebase Auth UID only.
      // getSolvedQuestionIds reads codingProgress/{uid} — do NOT pass email.
      const uid = authData?.uid;
      const [courseData, solved] = await Promise.all([
        fetchCourse(courseId),
        uid
          ? getSolvedQuestionIds(uid).catch(() => [])
          : (console.warn('[PracticeCoursePage] Firebase UID not available — solved list empty'), Promise.resolve([])),
      ]);
      setCourse(courseData);
      setSolvedIds(solved);

      const mods = await fetchModulesForCourse(courseData);
      setModules(mods.sort((a, b) => (a.order || 0) - (b.order || 0)));

      // Build module stats: for each module, collect all question IDs from all contests
      const stats = {};
      await Promise.allSettled(mods.map(async (mod) => {
        const contests = await fetchContestsForModule(courseId, mod);
        const allQIds = contests.flatMap(c => c.questionIds || []);
        const uniqueQIds = [...new Set(allQIds)];
        const solvedInModule = uniqueQIds.filter(qid => solved.includes(qid)).length;
        stats[mod.moduleId] = { total: uniqueQIds.length, solved: solvedInModule };
      }));
      setModuleStats(stats);
    } catch (err) {
      console.error('[PracticeCoursePage] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="ph-root">
        <div className="ph-loading">
          <div className="ph-spinner" />
          <p className="ph-loading-text">Loading modules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ph-root">
      {/* Top Bar */}
      <div className="ph-topbar">
        <div className="ph-topbar-logo"> SEED-IT Practice</div>
        <div className="ph-topbar-nav">
          <button className="ph-topbar-btn" onClick={() => navigate('/student/practice')}>← All Courses</button>
          <button className="ph-topbar-btn" onClick={() => navigate('/student/dashboard')}>Dashboard</button>
        </div>
      </div>

      {/* Hero */}
      <div className="ph-hero">
        <div className="ph-hero-tag"> {course?.title ?? ''}</div>
        <h1 className="ph-hero-title" style={{ fontSize: 'clamp(28px,4vw,44px)' }}>
          {course?.title}
        </h1>
        <p className="ph-hero-sub">{course?.description || 'Select a module to start practicing.'}</p>
        <div className="ph-stats">
          <div className="ph-stat">
            <span className="ph-stat-num">{modules.length}</span>
            <span className="ph-stat-label">Modules</span>
          </div>
          <div className="ph-stat">
            <span className="ph-stat-num">{solvedIds.length}</span>
            <span className="ph-stat-label">Total Solved</span>
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="ph-section">
        <div className="ph-section-header">
          <h2 className="ph-section-title"> Modules</h2>
        </div>
        {modules.length === 0 ? (
          <div className="ph-empty">
            <div className="ph-empty-icon"></div>
            <div className="ph-empty-title">No modules yet</div>
            <div className="ph-empty-desc">Modules are being prepared for this course.</div>
          </div>
        ) : (
          <div className="ph-course-grid">
            {modules.map((mod, idx) => {
              const stats = moduleStats[mod.moduleId] || { total: 0, solved: 0 };
              const pct = stats.total > 0 ? (stats.solved / stats.total) * 100 : 0;

              return (
                <div
                  key={mod.moduleId}
                  className="ph-course-card"
                  onClick={() => navigate(`/student/practice/${courseId}/${mod.moduleId}`)}
                >
                  <div className="ph-course-thumb" style={{ background: `linear-gradient(135deg, hsl(${idx * 47 + 200}, 60%, 20%), hsl(${idx * 47 + 240}, 70%, 25%))` }}>
                    <span style={{ fontSize: 42 }}>
                      {['', '', '', '', '', '', '', ''][idx % 8]}
                    </span>
                  </div>
                  <div className="ph-course-body">
                    <div className="ph-course-title">{mod.title}</div>
                    <div className="ph-course-desc">{mod.description || 'Practice problems in this module.'}</div>
                    <div className="ph-course-meta">
                      <span> {mod.contestIds?.length || 0} contest{(mod.contestIds?.length || 0) !== 1 ? 's' : ''}</span>
                      {stats.total > 0 && (
                        <span style={{ color: pct === 100 ? '#4ade80' : 'inherit' }}>
                          {stats.solved}/{stats.total} solved
                        </span>
                      )}
                    </div>
                    {stats.total > 0 && (
                      <div className="ph-progress-bar-wrap">
                        <div className="ph-progress-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PracticeCoursePage;
