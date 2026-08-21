import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from '../router-compat';
import { FaCheck, FaPlay, FaSignOutAlt, FaUser, FaArrowLeft, FaSearch, FaBookOpen, FaLock, FaKey, FaTimes, FaShieldAlt, FaTrophy, FaStar, FaBolt } from 'react-icons/fa';
import DataService from '../services/dataService';
import { toast } from 'sonner';
import '../styles/CodingAssessmentHome.css';

const CodingAssessmentHome = () => {
    const [contests, setContests] = useState([]);
    const [completedAttempts, setCompletedAttempts] = useState({});
    const [contestAttempts, setContestAttempts] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const navigate = useNavigate();

    const getContestStatus = (contest) => {
        const now = new Date();
        const start = contest.startTime ? new Date(contest.startTime) : null;
        const end = contest.endTime ? new Date(contest.endTime) : null;

        if (start && now < start) return 'Upcoming';
        if (end && now > end) return 'Ended';
        return 'Active';
    };

    const formatDateTime = (dateTimeStr) => {
        if (!dateTimeStr) return 'Always Open';
        const date = new Date(dateTimeStr);
        return date.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    useEffect(() => {
        const loadDashboardData = async () => {
            setIsLoading(true);
            try {
                const authData = JSON.parse(localStorage.getItem("auth_data") ?? "{}");
                if (!authData.Email) {
                    navigate('/login');
                    return;
                }
                setUser(authData);

                // Load completion status from localStorage
                const cAttemptsMap = {};
                const storedKeys = Object.keys(localStorage).filter(k => k.startsWith('contest_completed_'));
                storedKeys.forEach(k => {
                    const contestId = k.replace('contest_completed_', '');
                    if (localStorage.getItem(k) === 'true') {
                        cAttemptsMap[contestId] = { status: 'completed' };
                    }
                });
                setContestAttempts(cAttemptsMap);

                // Load assessments from access_control.json
                const accessControl = await DataService.getAccessControl();
                const allowedModuleIds = accessControl?.access_control?.colleges?.[authData.College]?.[authData.Year]?.[authData.Department]?.allowed_modules || [];

                // Extract assessment tests from courses.assessments subcourses
                const assessmentsData = accessControl?.courses?.assessments;
                const testsList = [];

                if (assessmentsData?.subcourses) {
                    Object.entries(assessmentsData.subcourses).forEach(([seriesKey, series]) => {
                        if (series.modules) {
                            Object.entries(series.modules).forEach(([modKey, mod]) => {
                                // Only show modules the student is allowed to access
                                if (!allowedModuleIds.includes(mod.id)) return;

                                // Build start/end times from schedule if available
                                let startTime = null;
                                let endTime = null;
                                if (mod.schedule?.type !== 'none' && mod.schedule?.startDate) {
                                    startTime = `${mod.schedule.startDate}T${mod.schedule.startTime ?? ''}`;
                                }
                                if (mod.schedule?.endDate) {
                                    endTime = `${mod.schedule.endDate}T${mod.schedule.endTime ?? ''}`;
                                }

                                testsList.push({
                                    id: mod.id || modKey,
                                    title: mod.name || modKey,
                                    description: mod.description || `${series.title} · ${mod.type?.toUpperCase() || 'CODING'}`,
                                    startTime,
                                    endTime,
                                    questions: mod.questionIds || [],
                                    questionIds: mod.questionIds || [],
                                    url: mod.url || null,
                                    type: mod.type || 'coding',
                                    duration_minutes: mod.duration_minutes || null,
                                    passkey: mod.passkey || null,
                                    isPremium: mod.isPremium || false,
                                    seriesTitle: series.title,
                                    seriesKey,
                                });
                            });
                        }
                    });
                }

                testsList.sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0));
                setContests(testsList);
            } catch (err) {
                console.error("Failed to load assessment data:", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadDashboardData();
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem("auth_data");
        localStorage.removeItem("role");
        document.cookie = "user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "user_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        navigate("/login");
    };

    const filteredContests = contests.filter(c => {
        const attempt = contestAttempts[c.id];
        const isContestAlreadyCompleted = attempt && attempt.status === 'completed';
        const status = isContestAlreadyCompleted ? 'Completed' : getContestStatus(c);

        const matchesSearch = (c.title ?? '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (c.description ?? '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'All' || status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const totalContestsCount = contests.length;
    const activeContestsCount = contests.filter(c => getContestStatus(c) === 'Active').length;
    const completedContestsCount = contests.filter(c => {
        const questions = c.questions || [];
        const isSolvedAll = questions.length > 0 && questions.every(qid => completedAttempts[qid]);
        const isAttemptCompleted = contestAttempts[c.id] && contestAttempts[c.id].status === 'completed';
        return isSolvedAll || isAttemptCompleted;
    }).length;

    return (
        <div className="learn-home-wrapper">
            {/* Header section matching premium dashboard */}
            <header className="learn-home-header">
                <div className="header-left">
                    <img 
                        src="https://raw.githubusercontent.com/seeditDev/SEED-Website/f3cee9002410a00df4da7bea636ac9fbc4c312ca/Plugins/SEED_Logo.webp" 
                        alt="SEED Logo" 
                        className="learn-logo" 
                    />
                    <span className="learn-brand">SEED-IT Coding Assessment</span>
                    <Link to="/student/dashboard" className="back-dash-btn">
                        <FaArrowLeft /> Back to Dashboard
                    </Link>
                </div>
                <div className="header-right">
                    <div className="user-profile-circle">
                        {user?.Name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : <FaUser />}
                    </div>
                    <button className="learn-logout-btn" onClick={handleLogout} aria-label="Logout">
                        <FaSignOutAlt />
                    </button>
                </div>
            </header>

            {isLoading ? (
                <div className="learn-loading">
                    <div className="learn-spinner"></div>
                    <p>Loading scheduled assessments...</p>
                </div>
            ) : (
                <main className="learn-home-content">
                    <div className="learn-content-grid">
                        {/* Contests Table Panel */}
                        <div className="problems-panel">
                            <div className="panel-filters-row">
                                <div className="search-box-wrapper">
                                    <FaSearch className="search-icon" />
                                    <input 
                                        type="text" 
                                        placeholder="Search assessments..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                    />
                                </div>
                                <div className="filter-dropdown-wrapper">
                                    <select 
                                        value={statusFilter} 
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="diff-filter-select"
                                    >
                                        <option value="All">All Statuses</option>
                                        <option value="Active">Active</option>
                                        <option value="Upcoming">Upcoming</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Ended">Ended</option>
                                    </select>
                                </div>
                            </div>

                            <div className="table-responsive">
                                <table className="problems-table">
                                    <thead>
                                        <tr>
                                            <th className="col-status" style={{ width: '120px' }}>Status</th>
                                            <th className="col-title">Assessment Details</th>
                                            <th className="col-schedule" style={{ width: '260px' }}>Schedule Window</th>
                                            <th className="col-progress" style={{ width: '120px' }}>Progress</th>
                                            <th className="col-action" style={{ width: '150px' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredContests.length > 0 ? (
                                            filteredContests.map((c) => {
                                                const attempt = contestAttempts[c.id];
                                                const isContestAlreadyCompleted = attempt && attempt.status === 'completed';
                                                const status = isContestAlreadyCompleted ? 'Completed' : getContestStatus(c);
                                                
                                                const questions = c.questions || [];
                                                const solvedCount = questions.filter(qid => completedAttempts[qid]).length;
                                                const totalCount = questions.length;
                                                const hasQuestions = totalCount > 0;
                                                const progressPct = hasQuestions ? Math.round((solvedCount / totalCount) * 100) : 0;

                                                const handleStartTest = () => {
                                                    if (isContestAlreadyCompleted) return;
                                                    if (!hasQuestions) {
                                                        toast.warning("This contest does not contain any questions yet.");
                                                        return;
                                                    }
                                                    navigate(`/student/assessment/sandbox?contest=${c.id}&challenge=${questions[0]}`);
                                                };

                                                return (
                                                    <tr 
                                                        key={c.id} 
                                                        className="problem-row" 
                                                        onClick={(status === 'Active' && !isContestAlreadyCompleted) ? handleStartTest : undefined}
                                                        style={{ cursor: (status === 'Active' && !isContestAlreadyCompleted) ? 'pointer' : 'default' }}
                                                    >
                                                        <td className="col-status">
                                                            <span className={`contest-badge ${status.toLowerCase()}`}>
                                                                {status}
                                                            </span>
                                                        </td>
                                                        <td className="col-title">
                                                            <span className="problem-title-text">
                                                                {c.title}
                                                            </span>
                                                            {c.description && (
                                                                <div className="contest-description">
                                                                    {c.description}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="col-schedule">
                                                            <div className="schedule-time">
                                                                <strong>Start:</strong> {formatDateTime(c.startTime)}
                                                            </div>
                                                            <div className="schedule-time mt-1">
                                                                <strong>End:</strong> {formatDateTime(c.endTime)}
                                                            </div>
                                                        </td>
                                                        <td className="col-progress">
                                                            <div className="progress-fraction">
                                                                {solvedCount} / {totalCount}
                                                            </div>
                                                            {hasQuestions && (
                                                                <div className="progress-bar-container">
                                                                    <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="col-action" onClick={(e) => e.stopPropagation()}>
                                                            {isContestAlreadyCompleted ? (
                                                                <button 
                                                                    className="solve-btn submitted"
                                                                    disabled
                                                                >
                                                                    Submitted
                                                                </button>
                                                            ) : status === 'Active' ? (
                                                                <button 
                                                                    className="solve-btn active"
                                                                    onClick={handleStartTest}
                                                                >
                                                                    <FaPlay /> Enter Contest
                                                                </button>
                                                            ) : status === 'Upcoming' ? (
                                                                <button 
                                                                    className="solve-btn locked"
                                                                    disabled
                                                                >
                                                                    <FaLock /> Locked
                                                                </button>
                                                            ) : (
                                                                <button 
                                                                    className="solve-btn ended"
                                                                    disabled
                                                                >
                                                                    Ended
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan="5" className="no-records-row" style={{ padding: '40px 20px', color: '#718096' }}>
                                                    No assessments scheduled at this time.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Progress Sidebar Panel */}
                        <div className="progress-panel">
                            {(Boolean(user?.isPremium)) ? (
                                <div className="premium-status-banner premium">
                                    <FaKey className="status-banner-icon" />
                                    <span>SEED-IT Premium Active</span>
                                </div>
                            ) : (
                                <div className="premium-status-banner free">
                                    <FaLock className="status-banner-icon" />
                                    <span>Standard Free Account</span>
                                </div>
                            )}
                            <div className="stats-card">
                                <h3>Assessment Summary</h3>
                                <div className="stats-breakdown" style={{ marginTop: '15px' }}>
                                    <div className="breakdown-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span>Total Contests:</span>
                                        <strong>{totalContestsCount}</strong>
                                    </div>
                                    <div className="breakdown-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span>Active Contests:</span>
                                        <strong>{activeContestsCount}</strong>
                                    </div>
                                    <div className="breakdown-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Completed:</span>
                                        <strong>{completedContestsCount}</strong>
                                    </div>
                                </div>
                            </div>

                            <div className="guidance-card">
                                <h3><FaShieldAlt style={{ marginRight: '8px' }} /> Proctored Environment</h3>
                                <p>Assessments enforce strict full-screen mode, disable copying & pasting, and track tab switches. Please close all external tabs and chat applications before starting.</p>
                            </div>
                        </div>
                    </div>
                </main>
            )}

            {showUpgradeModal && (

                <div className="premium-modal-overlay" onClick={() => setShowUpgradeModal(false)}>
                    <div className="premium-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="premium-modal-header">
                            <h3>
                                <FaLock className="premium-lock-icon" />
                                Premium Challenge
                            </h3>
                            <button className="premium-close-btn" onClick={() => setShowUpgradeModal(false)}>
                                <FaTimes />
                            </button>
                        </div>
                        <div className="premium-modal-body">
                            <p>This practice challenge is locked for Premium accounts. To upgrade, please reach out to your Placement Department or contact your SEED-IT Training Manager.</p>
                            <div className="premium-benefits">
                                <div className="benefit-item"><FaTrophy style={{ marginRight: '8px', color: '#fbbf24' }} /> Full access to all coding challenges</div>
                                <div className="benefit-item"><FaBolt style={{ marginRight: '8px', color: '#fbbf24' }} /> Unlimited code compilations & submissions</div>
                                <div className="benefit-item"><FaBookOpen style={{ marginRight: '8px', color: '#fbbf24' }} /> Detailed solution editorials & optimal templates</div>
                            </div>
                        </div>
                        <div className="premium-modal-footer">
                            <button className="premium-modal-ok-btn" onClick={() => setShowUpgradeModal(false)} style={{ width: '100%' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CodingAssessmentHome;
