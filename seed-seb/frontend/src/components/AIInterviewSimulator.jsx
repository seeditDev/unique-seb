import React, { useState, useEffect, useRef } from 'react';
import { 
  FaUserTie, 
  FaPaperPlane, 
  FaMicrophone, 
  FaVolumeUp, 
  FaVolumeMute, 
  FaArrowLeft, 
  FaChartLine, 
  FaAward, 
  FaHistory, 
  FaGraduationCap, 
  FaStar,
  FaCheckCircle,
  FaLightbulb,
  FaBug,
  FaKeyboard
} from 'react-icons/fa';
import { aiInterviewService } from '../services/aiInterviewService';
import { toast } from 'sonner';
import '../styles/AIInterviewSimulator.css';

const DOMAINS = ['Java', 'DSA', 'SQL', 'C', 'Python', 'HR', 'System Design'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const COMPANIES = ['Freshers', 'Zoho', 'TCS', 'Amazon', 'Google', 'Mixed'];

const AIInterviewSimulator = ({ user }) => {
  // Navigation: 'setup' | 'interview' | 'evaluation' | 'history'
  const [stage, setStage] = useState('setup');
  
  // Setup config
  const [domain, setDomain] = useState('Java');
  const [difficulty, setDifficulty] = useState('Medium');
  const [company, setCompany] = useState('Freshers');
  const [aiMode, setAiMode] = useState(() => {
    const savedKey = localStorage.getItem('ai_interview_api_key');
    return savedKey ? 'cloud' : 'local';
  });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ai_interview_api_key') || '');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  
  // Active session
  const [chatHistory, setChatHistory] = useState([]);
  const [answerInput, setAnswerInput] = useState('');
  const [interviewerStatus, setInterviewerStatus] = useState('talking'); // 'talking' | 'listening' | 'evaluating'
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  
  // Progress tracker for WebLLM
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadingModel, setDownloadingModel] = useState(false);
  
  // Results / Evaluation
  const [evaluationScores, setEvaluationScores] = useState(null);
  const [historyAttempts, setHistoryAttempts] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingResult, setSavingResult] = useState(false);

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Load history attempts on mount/stage changes
  useEffect(() => {
    if (user && (stage === 'setup' || stage === 'history')) {
      const loadHistory = async () => {
        setLoadingHistory(true);
        const data = await aiInterviewService.fetchAttempts(user.email);
        setHistoryAttempts(data);
        setLoadingHistory(false);
      };
      loadHistory();
    }
  }, [user, stage]);

  // Handle Speech-to-Text setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => setIsListening(true);
      rec.onend = () => setIsListening(false);
      rec.onresult = (event) => {
        const text = event.results[0][0].transcript;
        setAnswerInput(prev => (prev ? prev + ' ' : '') + text);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Browser Text-To-Speech Synthesis helper
  const speakText = (text) => {
    if (!voiceEnabled) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      const voices = window.speechSynthesis.getVoices();
      const bestVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("TTS synthesis failed:", e);
    }
  };

  // Toggle Microphone
  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setInterviewerStatus('listening');
      recognitionRef.current.start();
    }
  };

  // Start interview session
  const handleStartInterview = async () => {
    setLoading(true);
    setSessionStartTime(Date.now());
    
    // Save API key locally if entered and cloud mode active
    if (aiMode === 'cloud' && apiKey.trim()) {
      localStorage.setItem('ai_interview_api_key', apiKey.trim());
    } else if (aiMode !== 'cloud') {
      localStorage.removeItem('ai_interview_api_key');
    }

    setChatHistory([]);
    setInterviewerStatus('talking');

    const useLocalModel = aiMode === 'local';
    
    // Trigger in-browser WASM download loader if local LLM selected
    if (useLocalModel) {
      setDownloadingModel(true);
      setDownloadProgress(0);
      try {
        await aiInterviewService.initLocalModel((progress) => {
          setDownloadProgress(progress);
        });
      } catch (err) {
        console.warn("Failed to load WASM model locally. Switching to static heuristics sandbox.", err);
        setAiMode('static');
      } finally {
        setDownloadingModel(false);
      }
    }

    setStage('interview');

    // Get the first question
    const firstQuestion = await aiInterviewService.getNextQuestion(
      [], 
      domain, 
      difficulty, 
      company, 
      apiKey, 
      useLocalModel, 
      (p) => setDownloadProgress(p)
    );
    
    setChatHistory([{ role: 'assistant', content: firstQuestion }]);
    setLoading(false);
    speakText(firstQuestion);
  };

  // Handle user response submission
  const handleSendResponse = async () => {
    if (!answerInput.trim() || loading) return;

    const userText = answerInput.trim();
    setAnswerInput('');
    setInterviewerStatus('talking');
    
    const updatedHistory = [...chatHistory, { role: 'user', content: userText }];
    setChatHistory(updatedHistory);
    setLoading(true);

    const useLocalModel = aiMode === 'local';

    // Get next question or close prompt
    const nextQuestion = await aiInterviewService.getNextQuestion(
      updatedHistory, 
      domain, 
      difficulty, 
      company, 
      apiKey, 
      useLocalModel,
      (p) => setDownloadProgress(p)
    );
    
    setChatHistory([...updatedHistory, { role: 'assistant', content: nextQuestion }]);
    setLoading(false);
    speakText(nextQuestion);

    // If final message, candidate triggers evaluation
    if (nextQuestion.toLowerCase().includes("evaluation report") || nextQuestion.toLowerCase().includes("interview is now complete")) {
      setInterviewerStatus('evaluating');
    }
  };

  // Submit and evaluate interview session
  const handleGenerateEvaluation = async () => {
    setLoading(true);
    const durationSeconds = Math.round((Date.now() - sessionStartTime) / 1000);
    
    const useLocalModel = aiMode === 'local';
    const evaluation = await aiInterviewService.getEvaluationReport(chatHistory, domain, difficulty, company, apiKey, useLocalModel);
    setEvaluationScores(evaluation);

    // Save results to local history
    setSavingResult(true);
    try {
      await aiInterviewService.saveResults(user, domain, difficulty, company, evaluation, chatHistory, durationSeconds);
    } catch (e) {
      console.error("Failed to auto-save placement scorecard:", e);
    } finally {
      setSavingResult(false);
    }

    setStage('evaluation');
    setLoading(false);
  };

  const handlePrintCertificate = () => {
    window.print();
  };

  return (
    <div className="ai-interview-container">
      {/* LOCAL MODEL DOWNLOAD OVERLAY (OPTION 1 PROGRESS) */}
      {downloadingModel && (
        <div className="lw-overlay" style={{ zIndex: 1600 }}>
          <div className="lw-card" style={{ maxWidth: '520px', textAlign: 'center', padding: '30px' }}>
            <div className="lw-loader-container">
              <div className="lw-spinner-outer"></div>
              <div className="lw-spinner-inner" style={{ borderBottomColor: 'var(--accent-coding)' }}></div>
              <div className="lw-spinner-center" style={{ background: 'var(--accent-coding)' }}></div>
            </div>
            <h3 className="lw-title" style={{ marginTop: '24px', justifyContent: 'center' }}>
              Initializing AI Evaluation Engine
            </h3>
            <p className="lw-subtitle" style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Preparing AI model resources for intelligent interview evaluation.
            </p>
            <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '5px', marginTop: '20px', overflow: 'hidden' }}>
              <div style={{ width: `${downloadProgress}%`, height: '100%', background: 'var(--accent-coding)', transition: 'width 0.2s' }}></div>
            </div>
            <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-main)' }}>
              Downloading weights: {downloadProgress}%
            </div>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ color: 'var(--text-main)', fontSize: '24px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span></span> AI Placement Interview Simulator
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Evaluate your placement readiness under expert mock interview bots powered by premium language models.
          </p>
        </div>

        {stage !== 'setup' && (
          <button 
            className="lw-btn-secondary" 
            onClick={() => {
              window.speechSynthesis.cancel();
              setStage('setup');
            }}
            style={{ padding: '8px 16px', fontSize: '12px' }}
          >
            <FaArrowLeft style={{ marginRight: '6px' }} /> Back to Setup
          </button>
        )}
      </div>

      {/* STAGE 1: SETUP SCREEN */}
      {stage === 'setup' && (
        <div className="ai-glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Configure Interview Round</h3>
            <button className="lw-btn-secondary" onClick={() => setStage('history')} style={{ fontSize: '12px', padding: '6px 14px' }}>
              <FaHistory style={{ marginRight: '6px' }} /> View Past Scorecards
            </button>
          </div>

          <div className="ai-config-grid">
            <div className="config-group">
              <label>Select Domain / Subject</label>
              <select value={domain} onChange={e => setDomain(e.target.value)} className="config-select">
                {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="config-group">
              <label>Target Difficulty</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="config-select">
                {DIFFICULTIES.map(diff => <option key={diff} value={diff}>{diff}</option>)}
              </select>
            </div>

            <div className="config-group">
              <label>Target Company Context</label>
              <select value={company} onChange={e => setCompany(e.target.value)} className="config-select">
                {COMPANIES.map(c => <option key={c} value={c}>{c === 'Mixed' ? 'General Placements' : `${c} Placement Round`}</option>)}
              </select>
            </div>

            <div className="config-group">
              <label>AI Interview Engine Mode</label>
              <select value={aiMode} onChange={e => setAiMode(e.target.value)} className="config-select">
                <option value="local">Local Browser AI (WebAssembly WASM Model)</option>
                <option value="cloud">Cloud AI Mode (Groq / OpenAI API Keys)</option>
                <option value="static">Static Practice Mode (Rule Heuristics)</option>
              </select>
            </div>

            {aiMode === 'cloud' && (
              <div className="config-group" style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cloud API Key</span>
                  <a href="https://console.groq.com/" target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent-coding)', textDecoration: 'none' }}>Get Free Groq Key</a>
                </label>
                <input 
                  type="password" 
                  placeholder="Enter Groq Key gsk_... or OpenAI Key sk-..." 
                  value={apiKey} 
                  onChange={e => setApiKey(e.target.value)}
                  className="config-input"
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                onClick={() => setVoiceEnabled(!voiceEnabled)} 
                className={`chat-action-btn ${voiceEnabled ? 'send' : 'mic'}`}
                style={{ width: '36px', height: '36px', borderRadius: '50%' }}
                title={voiceEnabled ? "Mute Voice" : "Enable Voice Output"}
              >
                {voiceEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: '600' }}>
                Text-to-Speech Output {voiceEnabled ? 'Activated' : 'Muted'}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, flex: 1 }}>
              {aiMode === 'local' 
                ? "Running 100% offline in browser (launches WASM models on your local hardware). Best on computers with 8GB+ RAM." 
                : aiMode === 'cloud'
                  ? "Uses cloud APIs for rapid completion and premium reasoning capabilities." 
                  : "Uses predefined question banks with smart assessment analysis."
              }
            </p>
          </div>

          <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="lw-btn-primary" onClick={handleStartInterview} disabled={loading} style={{ padding: '12px 32px', fontSize: '15px' }}>
              Launch AI Interview Session
            </button>
          </div>
        </div>
      )}

      {/* STAGE 2: ACTIVE INTERVIEW CHAT SESSION */}
      {stage === 'interview' && (
        <div className="ai-glass-card">
          <div className="interview-grid">
            <div className="interviewer-panel">
              <div className="interviewer-avatar">
                <FaUserTie />
                {interviewerStatus === 'talking' && <div className="avatar-pulse"></div>}
              </div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 4px' }}>AI Technical Panelist</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>{domain} ({difficulty})</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>STATUS</span>
                {interviewerStatus === 'talking' && (
                  <span className="status-indicator talking"> Interviewer Speaking</span>
                )}
                {interviewerStatus === 'listening' && (
                  <span className="status-indicator listening"> Listening Response</span>
                )}
                {interviewerStatus === 'evaluating' && (
                  <span className="status-indicator evaluating"> Evaluation Ready</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="chat-window">
                <div className="chat-bubble-area">
                  {chatHistory.map((msg, index) => (
                    <div key={index} className={`chat-bubble ${msg.role}`}>
                      {msg.content}
                    </div>
                  ))}
                  {loading && (
                    <div className="chat-bubble assistant" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="lw-mini-spinner" style={{ margin: 0 }}></span> Generating bot reply...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="chat-input-bar">
                  {interviewerStatus === 'evaluating' ? (
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                      <button className="lw-btn-success" onClick={handleGenerateEvaluation} style={{ padding: '12px 28px', fontSize: '14px' }}>
                        Compile Scorecard & Evaluation Report
                      </button>
                    </div>
                  ) : (
                    <>
                      <button 
                        className={`chat-action-btn mic ${isListening ? 'listening' : ''}`}
                        onClick={toggleListening}
                        title={isListening ? "Stop Microphone" : "Speak Response (Voice)"}
                        disabled={loading}
                      >
                        <FaMicrophone />
                      </button>
                      <textarea
                        className="chat-textarea"
                        placeholder={isListening ? "Listening to voice input..." : "Type your technical response here..."}
                        value={answerInput}
                        onChange={e => setAnswerInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendResponse();
                          }
                        }}
                        disabled={loading}
                      />
                      <button 
                        className="chat-action-btn send"
                        onClick={handleSendResponse}
                        disabled={!answerInput.trim() || loading}
                      >
                        <FaPaperPlane />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3: EVALUATION REPORT & CERTIFICATE */}
      {stage === 'evaluation' && evaluationScores && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="ai-glass-card">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaChartLine style={{ color: 'var(--accent-coding)' }} /> Placement Readiness Scorecard
            </h3>

            <p style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.6', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px', margin: '0 0 20px' }}>
              <strong>AI Panelist Summary:</strong> {evaluationScores.summary}
            </p>

            <div className="score-cards-grid">
              <div className="metric-score-card" style={{ borderTop: '4px solid var(--accent-coding)' }}>
                <span className="metric-label">TECHNICAL</span>
                <span className="metric-value">{evaluationScores.score_technical}/10</span>
              </div>
              <div className="metric-score-card" style={{ borderTop: '4px solid var(--accent-mcq)' }}>
                <span className="metric-label">COMMUNICATION</span>
                <span className="metric-value">{evaluationScores.score_communication}/10</span>
              </div>
              <div className="metric-score-card" style={{ borderTop: '4px solid #10b981' }}>
                <span className="metric-label">PROBLEM SOLVING</span>
                <span className="metric-value">{evaluationScores.score_problem_solving}/10</span>
              </div>
              <div className="metric-score-card" style={{ borderTop: '4px solid #eab308' }}>
                <span className="metric-label">CONFIDENCE</span>
                <span className="metric-value">{evaluationScores.score_confidence}/10</span>
              </div>
              <div className="metric-score-card" style={{ borderTop: '4px solid #f43f5e', background: 'rgba(244, 63, 94, 0.03)' }}>
                <span className="metric-label" style={{ color: '#f43f5e' }}>OVERALL RATING</span>
                <span className="metric-value" style={{ color: '#f43f5e', fontSize: '28px' }}>{evaluationScores.score_overall}/10</span>
              </div>
            </div>

            <div className="strengths-weaknesses-row">
              <div className="feedback-bullet-box strengths">
                <h4 style={{ color: '#10b981' }}> Strengths Identified</h4>
                <ul className="feedback-list">
                  {evaluationScores.strengths?.map((str, idx) => <li key={idx}>{str}</li>)}
                </ul>
              </div>
              <div className="feedback-bullet-box weaknesses">
                <h4 style={{ color: '#ef4444' }}> Areas of Improvement</h4>
                <ul className="feedback-list">
                  {evaluationScores.weaknesses?.map((weak, idx) => <li key={idx}>{weak}</li>)}
                </ul>
              </div>
            </div>

            <div style={{ marginTop: '24px', padding: '16px 20px', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.02)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FaLightbulb style={{ color: '#facc15' }} /> Recommended Tips
              </h4>
              <ul className="feedback-list" style={{ paddingLeft: '18px' }}>
                {evaluationScores.tips?.map((tip, idx) => <li key={idx} style={{ color: 'var(--text-main)' }}>{tip}</li>)}
              </ul>
            </div>
          </div>

          {parseFloat(evaluationScores.score_overall || 0) >= 6.5 && (
            <div className="ai-glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FaAward style={{ color: '#f59e0b' }} /> Placement Readiness Certificate
                </h3>
                <button className="lw-btn-primary" onClick={handlePrintCertificate} style={{ fontSize: '12px', padding: '8px 18px' }}>
                  Print / Save Certificate PDF
                </button>
              </div>

              <div className="certificate-preview-box">
                <div className="cert-frame">
                  <div className="cert-title">CERTIFICATE OF SEED ALIGNMENT</div>
                  <div className="cert-subtitle">AI Placement Readiness Verification</div>
                  
                  <div className="cert-name">{user?.name || "Student Candidate"}</div>
                  
                  <div className="cert-text">
                    This credential verifies that the candidate has successfully completed a placement simulation round in the domain of <strong>{domain}</strong> under difficulty level <strong>{difficulty}</strong>, scoring an overall evaluation score of <strong>{evaluationScores.score_overall}/10</strong>.
                  </div>

                  <div className="cert-meta-row">
                    <div className="cert-meta-item">
                      <div className="cert-signature" style={{ fontSize: '18px' }}>{new Date().toLocaleDateString()}</div>
                      <div className="cert-meta-label">Verification Date</div>
                    </div>
                    
                    <div className="cert-badge"></div>
                    
                    <div className="cert-meta-item">
                      <div className="cert-signature">SEED-AI BOT</div>
                      <div className="cert-meta-label">Evaluation Engine</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STAGE 4: HISTORY VIEW */}
      {stage === 'history' && (
        <div className="ai-glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Past Performance Scorecards</h3>
            <button className="lw-btn-secondary" onClick={() => setStage('setup')} style={{ fontSize: '12px', padding: '6px 14px' }}>
              Back to Interview Room
            </button>
          </div>

          {loadingHistory ? (
            <div className="learn-loading">
              <div className="learn-spinner"></div>
              <p>Fetching logs...</p>
            </div>
          ) : historyAttempts.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px 20px', textAlign: 'center' }}>
              <span style={{ fontSize: '48px', marginBottom: '12px' }}></span>
              <h4 style={{ color: 'var(--text-main)' }}>No Attempts Logged Yet</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '400px' }}>
                Launch a placement round in the setup lobby. Your completed scores, strengths, and certificates will accumulate here.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="attempts-table">
                <thead>
                  <tr>
                    <th>Verification Date</th>
                    <th>Technical Domain</th>
                    <th>Difficulty</th>
                    <th>Rating Score</th>
                    <th>Placement Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyAttempts.map(att => {
                    const overall = parseFloat(att.score_overall || 0);
                    const dateStr = new Date(att.created_at).toLocaleDateString();
                    return (
                      <tr key={att.id}>
                        <td>{dateStr}</td>
                        <td><strong>{att.domain}</strong> ({att.company})</td>
                        <td>{att.difficulty}</td>
                        <td>
                          <span className={`badge-overall-pill ${overall >= 6.5 ? 'success' : 'warning'}`}>
                            {overall}/10
                          </span>
                        </td>
                        <td>
                          {overall >= 6.5 ? (
                            <span style={{ color: '#10b981', fontWeight: 'bold' }}> Verified Ready</span>
                          ) : (
                            <span style={{ color: '#f59e0b', fontWeight: 'bold' }}> Support Needed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIInterviewSimulator;
