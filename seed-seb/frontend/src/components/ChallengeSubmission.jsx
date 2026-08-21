import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from './router-compat';
import '../styles/ChallengeSubmission.css';
import timeService from '../services/timeService';

const GOOGLE_APPS_SCRIPT_CHALLENGE_URL = "https://script.google.com/macros/s/AKfycbwI5RdohQT3s0OsuQP35VOyP4oezP7d2nBM4JDhQuN7mgVMzFhlHh5QorgFG83AY7T0xw/exec";

const ChallengeSubmission = () => {
  const [formData, setFormData] = useState({
    challengeName: '',
    description: '',
    problemStatement: '',
    inputFormat: '',
    constraints: '',
    outputFormat: '',
    tags: '',
    date: timeService.getNow().toISOString().slice(0, 10),
    language: '',
    solution: ''
  });

  const [testCases, setTestCases] = useState(Array.from({ length: 8 }, () => ({ input: '', output: '' })));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();

  // History state
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});

  const userInfo = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('auth_data') ?? '{}');
    } catch {
      return {};
    }
  }, []);

  const getUserHackerRankId = (u) => {
    if (!u) return null;
    const candidates = [
      u.HackerRankID,
      u.hackerRankID,
      u.hackerrank_id,
      u['HackerRank ID'],
      u['Hackerrank ID'],
      u['HackerRank ID '],
      u['HackerrankID']
    ];
    return candidates.find(Boolean) || null;
  };

  const getAvatarInitials = () => {
    if (userInfo?.Name) {
      const parts = String(userInfo.Name).trim().split(/\s+/);
      return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
    }
    return 'TR';
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('auth_data');
      localStorage.removeItem('role');
      sessionStorage.clear();
    } catch {}
    navigate('/login');
  };

  useEffect(() => {
    // Ensure exactly 8 testcases are always present
    setTestCases(prev => {
      if (prev.length === 8) return prev;
      const copy = Array.from({ length: 8 }, (_, i) => prev[i] || { input: '', output: '' });
      return copy;
    });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTestCaseChange = (index, field, value) => {
    setTestCases(prev => prev.map((tc, i) => i === index ? { ...tc, [field]: value } : tc));
  };

  const validate = () => {
    if (!formData.challengeName.trim()) return 'Challenge Name is required';
    if (!formData.description.trim()) return 'Description is required';
    if (!formData.problemStatement.trim()) return 'Problem Statement is required';
    if (!formData.inputFormat.trim()) return 'Input Format is required';
    if (!formData.constraints.trim()) return 'Constraints are required';
    if (!formData.outputFormat.trim()) return 'Output Format is required';
    if (!formData.tags.trim()) return 'Tags are required';
    if (!formData.date) return 'Date is required';
    if (!formData.language.trim()) return 'Language is required';
    if (!formData.solution.trim()) return 'Solution is required';
    if (!Array.isArray(testCases) || testCases.length !== 8) return 'Exactly 8 testcases are required';
    for (let i = 0; i < 8; i++) {
      const tc = testCases[i] || {};
      if (!tc.input || !tc.input.trim()) return `Testcase ${i + 1}: Input is required`;
      if (!tc.output || !tc.output.trim()) return `Testcase ${i + 1}: Expected Output is required`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const error = validate();
    if (error) {
      setSubmitError(error);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const userId = getUserHackerRankId(userInfo) || userInfo?.Email || null;
    const payload = {
      challengeName: formData.challengeName,
      description: formData.description,
      problemStatement: formData.problemStatement,
      inputFormat: formData.inputFormat,
      constraints: formData.constraints,
      outputFormat: formData.outputFormat,
      tags: formData.tags,
      testCases: testCases.map((tc, idx) => ({ index: idx + 1, input: tc.input, output: tc.output })),
      language: formData.language,
      solution: formData.solution,
      name: userInfo?.Name || null,
      userId,
      date: formData.date,
      timestamp: timeService.getNow().toISOString()
    };

    try {
      await fetch(GOOGLE_APPS_SCRIPT_CHALLENGE_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setSubmitted(true);
      setShowPreview(false);
      setFormData({
        challengeName: '',
        description: '',
        problemStatement: '',
        inputFormat: '',
        constraints: '',
        outputFormat: '',
        tags: '',
        date: timeService.getNow().toISOString().slice(0, 10),
        language: '',
        solution: ''
      });
      setTestCases(Array.from({ length: 8 }, () => ({ input: '', output: '' })));
    } catch (err) {
      setSubmitError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Fetch history from Apps Script (requires doGet support on server)
  const fetchHistory = async (limit = 50) => {
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const url = `${GOOGLE_APPS_SCRIPT_CHALLENGE_URL}?action=list&limit=${encodeURIComponent(limit)}`;
      const res = await fetch(url, { method: 'GET', mode: 'cors' });
      const data = await res.json().catch(() => null);
      if (!data || data.ok !== true || !Array.isArray(data.items)) {
        throw new Error('Invalid response');
      }
      setHistoryItems(data.items);
    } catch (err) {
      setHistoryError('Failed to load submissions');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory(50);
    }
  }, [activeTab]);

  const toggleExpand = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="challenge-root">
      <header className="challenge-header-container">
        <div className="challenge-header-inner">
          <div className="challenge-header-left">
            <img
              src="https://raw.githubusercontent.com/seeditDev/SEED-Website/f3cee9002410a00df4da7bea636ac9fbc4c312ca/Plugins/SEED_Logo.webp"
              alt="SEED Logo"
              className="challenge-logo"
            />
            <span className="challenge-portal-title">SEED-IT Challenge Portal</span>
          </div>
          <div className="challenge-header-right">
            <span style={{ color: '#cbd5e1', fontSize: 12 }}>{timeService.getNow().toLocaleString()}</span>
            <div className="challenge-avatar">{getAvatarInitials()}</div>
            <button className="challenge-logout-btn" title="Logout" onClick={handleLogout}>
              
            </button>
          </div>
        </div>
      </header>

      <div className="challenge-layout">
        <aside className="challenge-sidebar-container">
          <div className="challenge-sidebar-title">Analytics</div>
          <nav className="challenge-nav">
            <button
              className={`challenge-nav-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`challenge-nav-item ${activeTab === 'submit' ? 'active' : ''}`}
              onClick={() => setActiveTab('submit')}
            >
              Submit Challenge
            </button>
            <div className="challenge-sidebar-title">Learning</div>
            <button
              className={`challenge-nav-item ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Submission History
            </button>
            <div className="challenge-sidebar-title">Settings</div>
            <button
              className={`challenge-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Preferences
            </button>
          </nav>
        </aside>
        <main className="challenge-main-content">
          <div className="challenge-container">
            {activeTab === 'overview' && (
              <>
                <div className="challenge-card challenge-grid two-col">
                  <div className="input-box">
                    <label>Your Name</label>
                    <input type="text" value={userInfo?.Name ?? ''} readOnly />
                  </div>
                  <div className="input-box">
                    <label>User ID</label>
                    <input type="text" value={getUserHackerRankId(userInfo) || (userInfo?.Email  ?? '')} readOnly />
                  </div>
                  <div className="input-box">
                    <label>Today</label>
                    <input type="text" value={`${formData.date} • ${timeService.getNow().toLocaleTimeString()}`} readOnly />
                  </div>
                </div>

                <div className="challenge-card">
                  <h3 style={{ marginTop: 0 }}>Welcome, Trainer</h3>
                  <p>Use the sidebar to submit new coding challenges or review previous submissions.</p>
                </div>
              </>
            )}
            {activeTab === 'submit' && (
              <>
                <div className="challenge-header">
                  <h2 className="challenge-title">Submit Coding Challenge</h2>
                </div>
      {/* User info overview - dashboard style */}
      <div className="challenge-card challenge-grid two-col">
        <div className="input-box">
          <label>Your Name</label>
          <input type="text" value={userInfo?.Name ?? ''} readOnly />
        </div>
        <div className="input-box">
          <label>User ID</label>
          <input type="text" value={getUserHackerRankId(userInfo) || (userInfo?.Email  ?? '')} readOnly />
        </div>
        <div className="input-box">
          <label>Date</label>
          <input type="text" value={formData.date} readOnly />
        </div>
      </div>
      {!submitted ? (
        <form onSubmit={handleSubmit}>
          <div className="challenge-card challenge-grid two-col">
            <div className="input-box">
              <label>Challenge Name</label>
              <input
                type="text"
                name="challengeName"
                value={formData.challengeName}
                onChange={handleChange}
                placeholder="Enter challenge title"
                required
              />
            </div>

            <div className="input-box">
              <label>Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Short description"
                required
              />
            </div>

            <div className="input-box" style={{ gridColumn: '1 / -1' }}>
              <label>Problem Statement</label>
              <textarea
                name="problemStatement"
                value={formData.problemStatement}
                onChange={handleChange}
                rows={6}
                placeholder="Full problem statement"
                required
              />
            </div>

            <div className="input-box">
              <label>Input Format</label>
              <textarea
                name="inputFormat"
                value={formData.inputFormat}
                onChange={handleChange}
                rows={3}
                placeholder="Describe input format"
                required
              />
            </div>

            <div className="input-box">
              <label>Constraints</label>
              <textarea
                name="constraints"
                value={formData.constraints}
                onChange={handleChange}
                rows={3}
                placeholder="List constraints"
                required
              />
            </div>

            <div className="input-box">
              <label>Output Format</label>
              <textarea
                name="outputFormat"
                value={formData.outputFormat}
                onChange={handleChange}
                rows={3}
                placeholder="Describe output format"
                required
              />
            </div>

            <div className="input-box">
              <label>Tags</label>
              <input
                type="text"
                name="tags"
                value={formData.tags}
                onChange={handleChange}
                placeholder="e.g., arrays, strings, dp"
                required
              />
            </div>
          </div>

          <div className="challenge-card">
            <div className="challenge-grid two-col">
            {testCases.map((tc, idx) => (
              <div key={idx} className="testcase-item">
                <h4 className="testcase-title">Testcase {idx + 1}</h4>
                <div className="input-box">
                  <label>Input</label>
                  <textarea
                    value={tc.input}
                    onChange={(e) => handleTestCaseChange(idx, 'input', e.target.value)}
                    rows={3}
                    placeholder="Input"
                    required
                  />
                </div>
                <div className="input-box">
                  <label>Expected Output</label>
                  <textarea
                    value={tc.output}
                    onChange={(e) => handleTestCaseChange(idx, 'output', e.target.value)}
                    rows={3}
                    placeholder="Expected output"
                    required
                  />
                </div>
              </div>
            ))}
            </div>
          </div>

          <div className="challenge-card challenge-grid two-col">
            <div className="input-box">
              <label>Language</label>
              <select name="language" value={formData.language} onChange={handleChange} required>
                <option value="">Select language</option>
                <option value="C">C</option>
                <option value="C++">C++</option>
                <option value="Java">Java</option>
                <option value="Python">Python</option>
                <option value="C#">C#</option>
              </select>
            </div>
            <div className="input-box" style={{ gridColumn: '1 / -1' }}>
              <label>Solution</label>
              <textarea
                name="solution"
                value={formData.solution}
                onChange={handleChange}
                rows={8}
                placeholder="Paste your reference solution here"
                required
              />
            </div>
          </div>

          {submitError && (
            <div className="error-inline">{submitError}</div>
          )}

          <div className="actions">
            <button type="button" className="btn-secondary" onClick={() => setShowPreview(true)}>
              Preview
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Challenge'}
            </button>
          </div>
        </form>
      ) : (
        <div className="success-message">
          <h3> Challenge submitted!</h3>
          <p>Thank you for your contribution.</p>
          <button className="register-btn" onClick={() => setSubmitted(false)}>Submit Another</button>
        </div>
      )}

      {showPreview && (
        <div className="preview-overlay" onClick={() => !submitting && setShowPreview(false)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h3 style={{ margin: 0 }}>Preview Challenge</h3>
              <div className="actions">
                <button className="btn-secondary" onClick={() => setShowPreview(false)}>Close</button>
                <button className="btn-primary" onClick={() => handleSubmit()} disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Confirm & Submit'}
                </button>
              </div>
            </div>
            <div className="preview-body">
              <div className="preview-row"><h4>Challenge Name</h4><div>{formData.challengeName ?? ''}</div></div>
              <div className="preview-row"><h4>Description</h4><div>{formData.description ?? ''}</div></div>
              <div className="preview-row"><h4>Problem Statement</h4><div className="preview-code">{formData.problemStatement ?? ''}</div></div>
              <div className="preview-row"><h4>Input Format</h4><div className="preview-code">{formData.inputFormat ?? ''}</div></div>
              <div className="preview-row"><h4>Constraints</h4><div className="preview-code">{formData.constraints ?? ''}</div></div>
              <div className="preview-row"><h4>Output Format</h4><div className="preview-code">{formData.outputFormat ?? ''}</div></div>
              <div className="preview-row"><h4>Tags</h4><div>{formData.tags ?? ''}</div></div>
              <div className="preview-row"><h4>Language</h4><div>{formData.language ?? ''}</div></div>
              <div className="preview-row"><h4>Solution</h4><div className="preview-code">{formData.solution ?? ''}</div></div>
              <div className="preview-row"><h4>Name</h4><div>{userInfo?.Name ?? ''}</div></div>
              <div className="preview-row"><h4>User ID</h4><div>{getUserHackerRankId(userInfo) || userInfo?.Email || '-'}</div></div>
              <div className="preview-row"><h4>Date</h4><div>{formData.date ?? ''}</div></div>
              <div className="preview-row">
                <h4>Testcases ({testCases.length})</h4>
                {testCases.map((tc, idx) => (
                  <div key={idx} className="challenge-card">
                    <strong>#{idx + 1}</strong>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ marginBottom: 6 }}>Input</div>
                      <div className="preview-code">{tc.input ?? ''}</div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ marginBottom: 6 }}>Expected Output</div>
                      <div className="preview-code">{tc.output ?? ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
              </>
            )}
            {activeTab === 'history' && (
              <div className="challenge-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ marginTop: 0 }}>Recent Submissions</h3>
                  <div className="actions">
                    <button className="btn-secondary" onClick={() => fetchHistory(50)} disabled={historyLoading}>Refresh</button>
                  </div>
                </div>
                {historyLoading && <p>Loading...</p>}
                {historyError && <div className="error-inline">{historyError}</div>}
                {!historyLoading && !historyError && historyItems.length === 0 && (
                  <p style={{ color: '#6b7280' }}>No submissions found.</p>
                )}
                {!historyLoading && !historyError && historyItems.length > 0 && (
                  <div className="staff-table-wrapper">
                    <table className="staff-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Trainer</th>
                          <th>User ID</th>
                          <th>Challenge</th>
                          <th>Lang</th>
                          <th>Tags</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyItems.map((item, idx) => {
                          const id = item.ChallengeID || `row_${idx}`;
                          const dt = String(item.Date ?? '').trim();
                          const ts = String(item.Timestamp ?? '').trim();
                          return (
                            <React.Fragment key={id}>
                              <tr>
                                <td>{dt}</td>
                                <td>{ts.replace(/T/, ' ').replace(/\.\d+Z?$/, '')}</td>
                                <td>{item.TrainerName || item.Name || '-'}</td>
                                <td>{item.UserID ?? ''}</td>
                                <td>{item.ChallengeName ?? ''}</td>
                                <td>{item.Language ?? ''}</td>
                                <td>{item.Tags ?? ''}</td>
                                <td>
                                  <button className="btn-secondary" onClick={() => toggleExpand(id)}>
                                    {expandedRows[id] ? 'Hide' : 'View'}
                                  </button>
                                </td>
                              </tr>
                              {expandedRows[id] && (
                                <tr>
                                  <td colSpan={8}>
                                    <div className="challenge-grid two-col">
                                      <div className="input-box">
                                        <label>Description</label>
                                        <textarea readOnly rows={3} value={item.Description ?? ''} />
                                      </div>
                                      <div className="input-box">
                                        <label>Problem Statement</label>
                                        <textarea readOnly rows={6} value={item.ProblemStatement ?? ''} />
                                      </div>
                                      <div className="input-box">
                                        <label>Input Format</label>
                                        <textarea readOnly rows={3} value={item.InputFormat ?? ''} />
                                      </div>
                                      <div className="input-box">
                                        <label>Constraints</label>
                                        <textarea readOnly rows={3} value={item.Constraints ?? ''} />
                                      </div>
                                      <div className="input-box" style={{ gridColumn: '1 / -1' }}>
                                        <label>Output Format</label>
                                        <textarea readOnly rows={3} value={item.OutputFormat ?? ''} />
                                      </div>
                                      <div className="input-box" style={{ gridColumn: '1 / -1' }}>
                                        <label>Solution</label>
                                        <textarea readOnly rows={8} value={item.Solution ?? ''} />
                                      </div>
                                    </div>
                                    <div className="challenge-grid two-col" style={{ marginTop: 12 }}>
                                      {Array.from({ length: 8 }).map((_, i) => (
                                        <div key={i} className="testcase-item">
                                          <h4 className="testcase-title">Testcase {i + 1}</h4>
                                          <div className="input-box">
                                            <label>Input</label>
                                            <textarea readOnly rows={3} value={item[`TC${i + 1}_Input`] || ''} />
                                          </div>
                                          <div className="input-box">
                                            <label>Expected Output</label>
                                            <textarea readOnly rows={3} value={item[`TC${i + 1}_Output`] || ''} />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="challenge-card">
                <h3 style={{ marginTop: 0 }}>Preferences</h3>
                <p>Configure trainer preferences. (Coming soon)</p>
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="challenge-footer">
        <div className="challenge-footer-inner">
          © 2023-2025 SEED Innovating Technologies and Educational Services (SEED-IT). All Rights Reserved.
        </div>
      </footer>
    </div>
  );
};

export default ChallengeSubmission; 