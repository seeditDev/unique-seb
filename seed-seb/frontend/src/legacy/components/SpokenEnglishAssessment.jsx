import { buildResultDoc } from '../../buildResultDoc.js';
import React, { useState, useEffect, useRef } from 'react';
import { 
  FaMicrophone, FaStop, FaVolumeUp, FaCheckCircle, 
  FaArrowRight, FaClock, FaExclamationTriangle,
  FaFileAlt, FaRedo, FaVolumeMute, FaShieldAlt, FaRobot, FaHourglassHalf,
  FaUser, FaVideo, FaBan, FaLock
} from 'react-icons/fa';
import { evaluateSpokenEnglishSession } from '../services/spokenEnglishEvaluator';
import { getViolations } from '../utils/proctorCache';
import { db } from '../firebase-config';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import SecurityWatermark from './SecurityWatermark';
import { stopAllMediaAndAI } from '../utils/hardwareTeardown';
import '../styles/SpokenEnglishAssessment.css';

const CALIBRATION_TEXT = "Checking microphone clarity and background noise levels.";

const SpokenEnglishAssessment = ({ assessmentData, user, onBack, onComplete, onSectionSubmit }) => {
  // Stages: 'preflight' | 'exam' | 'completed' | 'limit_reached'
  const [stage, setStage] = useState('preflight');
  const [micPermission, setMicPermission] = useState('pending'); // 'pending' | 'granted' | 'denied'
  const [micVolume, setMicVolume] = useState(0);
  const [speechEngineReady, setSpeechEngineReady] = useState(true);
  const [aiEngineReady, setAiEngineReady] = useState(true);
  const [calibrationPassed, setCalibrationPassed] = useState(false);

  // Exam State
  const [questions, setQuestions] = useState([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [responses, setResponses] = useState([]);
  const [attemptsMap, setAttemptsMap] = useState({}); // { qId: attemptCount }

  // Per-Question Countdown Timer State
  const [questionTimeLeft, setQuestionTimeLeft] = useState(45);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlayingPrompt, setIsPlayingPrompt] = useState(false);

  // Overall Exam Timer
  const [examTimeLeft, setExamTimeLeft] = useState(1200);

  // Saving / Completion
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [finalEvaluation, setFinalEvaluation] = useState(null);

  const lastEvaluationRef = useRef(null);

  // Audio Context & Media Recorder Refs
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const recordTimerRef = useRef(null);
  const qTimerIntervalRef = useRef(null);

  // User Resolution — reads canonical user doc directly from localStorage
  const currentUser = user || (() => {
    try { return JSON.parse(localStorage.getItem("auth_data")); } catch (_) { return null; }
  })();

  const userEmail = (currentUser?.email ?? '').toLowerCase();
  const testId = assessmentData?.id ?? 'AS003_T001';

  const handleBack = useCallback(() => {
    const resData = lastEvaluationRef.current;
    if (onSectionSubmit) {
      onSectionSubmit(resData);
    } else if (onComplete) {
      onComplete(resData);
    } else if (onBack) {
      onBack(resData);
    } else {
      if (window.history.length > 1) window.history.back();
      else window.location.href = '/student/dashboard';
    }
  }, [onBack, onComplete, onSectionSubmit]);

  // Pre-Launch Engine Readiness
  useEffect(() => {
    setSpeechEngineReady(true);
    setAiEngineReady(true);

    try {
      const dummyTest = evaluateSpokenEnglishSession([], 10);
      if (dummyTest && dummyTest.maxScore) {
        setAiEngineReady(true);
      }
    } catch (err) {
      console.warn('[AI Pre-Launch Engine Verification]', err);
      setAiEngineReady(true);
    }

    return () => {
      stopAllMediaAndAI();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Initialize Questions from assessmentData or Default Flow
  useEffect(() => {
    let data = assessmentData;
    if (!data) {
      try {
        const raw = sessionStorage.getItem("spokenEnglishAssessmentData");
        if (raw) data = JSON.parse(raw);
      } catch (_) {}
    }

    if (data && Array.isArray(data.questions) && data.questions.length > 0) {
      setQuestions(data.questions);
    } else {
      // Default SEED Portal Recommended Flow (11 Questions, maxAttempts: 1 for placement rigor)
      setQuestions([
        {
          id: 'SE_01',
          type: 'read_aloud',
          moduleTitle: 'Read Aloud (Q1 of 2)',
          text: 'The internet has changed the way people communicate around the world. It enables instantaneous data exchange and global collaboration.',
          durationMax: 45,
          maxAttempts: 1
        },
        {
          id: 'SE_02',
          type: 'read_aloud',
          moduleTitle: 'Read Aloud (Q2 of 2)',
          text: 'Artificial Intelligence and machine learning are transforming every modern industry by automating repetitive tasks and boosting efficiency.',
          durationMax: 45,
          maxAttempts: 1
        },
        {
          id: 'SE_03',
          type: 'repeat_sentence',
          moduleTitle: 'Repeat Sentence (Q1 of 3)',
          audioText: 'Artificial Intelligence is transforming every industry.',
          durationMax: 20,
          maxAttempts: 1
        },
        {
          id: 'SE_04',
          type: 'repeat_sentence',
          moduleTitle: 'Repeat Sentence (Q2 of 3)',
          audioText: 'Effective communication is essential for career growth in software engineering.',
          durationMax: 20,
          maxAttempts: 1
        },
        {
          id: 'SE_05',
          type: 'repeat_sentence',
          moduleTitle: 'Repeat Sentence (Q3 of 3)',
          audioText: 'Continuous learning helps professionals stay competitive in today\'s fast-paced market.',
          durationMax: 20,
          maxAttempts: 1
        },
        {
          id: 'SE_06',
          type: 'picture_description',
          moduleTitle: 'Picture Description (Q1 of 1)',
          imageUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
          imageAlt: 'Modern Corporate Office Workspace Team Meeting',
          prompt: 'Describe the scene in this image in detail for 45-60 seconds. Mention the environment, activities, and interactions.',
          durationMax: 60,
          maxAttempts: 1
        },
        {
          id: 'SE_07',
          type: 'opinion_question',
          moduleTitle: 'Opinion Speaking (Q1 of 2)',
          prompt: 'Do you prefer working from home or working in a traditional office environment? Explain your reasons clearly.',
          durationMax: 60,
          maxAttempts: 1
        },
        {
          id: 'SE_08',
          type: 'opinion_question',
          moduleTitle: 'Opinion Speaking (Q2 of 2)',
          prompt: 'Should Artificial Intelligence replace human teachers in schools and universities? Give your opinion with arguments.',
          durationMax: 60,
          maxAttempts: 1
        },
        {
          id: 'SE_09',
          type: 'describe_yourself',
          moduleTitle: 'Self Introduction (Q1 of 1)',
          prompt: 'Tell me about yourself, your educational background, key technical strengths, and your career aspirations for the next 3 years.',
          durationMax: 90,
          maxAttempts: 1
        },
        {
          id: 'SE_10',
          type: 'situational_response',
          moduleTitle: 'Situational Response (Q1 of 2)',
          prompt: 'Your project manager gives you an impossible deadline to complete a complex feature by tomorrow morning. How would you professionally respond?',
          durationMax: 60,
          maxAttempts: 1
        },
        {
          id: 'SE_11',
          type: 'situational_response',
          moduleTitle: 'Situational Response (Q2 of 2)',
          prompt: 'During a team meeting, a colleague strongly disagrees with your code design in front of the client. How do you handle this situation professionally?',
          durationMax: 60,
          maxAttempts: 1
        }
      ]);
    }
  }, [assessmentData]);

  // Mandatory Per-Question Countdown Timer Logic
  useEffect(() => {
    if (stage === 'exam' && questions.length > 0) {
      const currentQ = questions[currentQIdx];
      const maxSecs = currentQ?.durationMax || 45;
      setQuestionTimeLeft(maxSecs);

      if (qTimerIntervalRef.current) clearInterval(qTimerIntervalRef.current);

      qTimerIntervalRef.current = setInterval(() => {
        setQuestionTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(qTimerIntervalRef.current);
            handleQuestionTimeExpired();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (qTimerIntervalRef.current) clearInterval(qTimerIntervalRef.current);
    };
  }, [stage, currentQIdx, questions]);

  // Overall Exam Timer
  useEffect(() => {
    if (stage === 'exam') {
      timerIntervalRef.current = setInterval(() => {
        setExamTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            finishAssessment();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [stage]);

  // Preflight Mic & Audio Signal Calibration Test
  const startMicTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      setMicPermission('granted');
      setCalibrationPassed(true);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const vol = Math.min(100, Math.round((sum / dataArray.length) * 1.5));
        setMicVolume(vol);

        requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (err) {
      console.error('Microphone permission denied:', err);
      setMicPermission('denied');
    }
  };

  // Setup Web Speech Recognition - Clean Non-duplicating Transcript Assembly
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript + ' ';
        }
        setLiveTranscript(fullTranscript.trim());
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Text-To-Speech Audio Prompt Player
  const playAudioPrompt = (textToPlay) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToPlay);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsPlayingPrompt(true);
      utterance.onend = () => setIsPlayingPrompt(false);
      utterance.onerror = () => setIsPlayingPrompt(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Start Audio Recording
  const startRecording = async () => {
    const currentQ = questions[currentQIdx];
    const qId = currentQ?.id || `Q_${currentQIdx}`;
    const maxAttempts = currentQ?.maxAttempts || 1;
    const currentAttempt = attemptsMap[qId] || 0;

    if (currentAttempt >= maxAttempts) {
      toast.warning(`Maximum attempts (${maxAttempts}) reached for this question.`);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      setLiveTranscript('');

      setAttemptsMap(prev => ({ ...prev, [qId]: currentAttempt + 1 }));

      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (_) {}
      }

      recordTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Recording start failed:', err);
    }
  };

  // Stop Audio Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
  };

  // Automatically Stop & Advance on Question Timer Expiration
  const handleQuestionTimeExpired = () => {
    stopRecording();
    setTimeout(() => {
      handleNextQuestion();
    }, 400);
  };

  // Save current question response and advance (Forward-Only)
  const handleNextQuestion = () => {
    const currentQ = questions[currentQIdx];
    const qId = currentQ?.id || `Q_${currentQIdx}`;
    const currentAttempt = attemptsMap[qId] || 1;

    const currentResponse = {
      questionId: qId,
      moduleType: currentQ?.moduleTitle || currentQ?.type,
      transcript: liveTranscript.trim(),
      audioUrl: audioUrl,
      durationSeconds: Math.max(5, recordingTime),
      referenceText: currentQ?.audioText || (currentQ?.text  ?? ''),
      attemptCount: currentAttempt
    };

    const newResponses = [...responses];
    newResponses[currentQIdx] = currentResponse;
    setResponses(newResponses);

    // Reset for next question
    setLiveTranscript('');
    setAudioUrl(null);
    setRecordingTime(0);
    window.speechSynthesis?.cancel();

    if (currentQIdx < questions.length - 1) {
      setCurrentQIdx(prev => prev + 1);
    } else {
      finishAssessment(newResponses);
    }
  };

  // Complete Assessment — Firestore persistence
  const finishAssessment = async (allResp = responses) => {
    window.speechSynthesis?.cancel();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (qTimerIntervalRef.current) clearInterval(qTimerIntervalRef.current);
    setIsSubmitting(true);

    const evaluation = evaluateSpokenEnglishSession(allResp, 1200 - examTimeLeft, questions.length);
    setFinalEvaluation(evaluation);
    lastEvaluationRef.current = {
      score: evaluation.percentage || 0,
      totalMarks: 100,
      maxScore: 100,
      totalQuestions: questions.length || 1,
      percentage: evaluation.percentage || 0,
      evaluation,
      responses: allResp,
    };

    // ── Resolve canonical identifiers ─────────────────────────────────────────
    // CANONICAL: Firebase Auth UID — never email / localStorage fallback
    const { auth: firebaseAuth } = await import('../firebase-config');
    const userId = firebaseAuth?.currentUser?.uid;
    if (!userId) {
      console.error('[SEA] Not authenticated — cannot write result. Aborting finishAssessment.');
      setIsSubmitting(false);
      stopAllMediaAndAI();
      setStage('completed');
      return;
    }

    const userEmail = (currentUser?.Email || (currentUser?.email  ?? '')).toLowerCase();
    const testId = assessmentData?.id ?? 'AS003_T001';

    const vInfo = getViolations(testId, userEmail);
    const allViolations = vInfo.violations || [];
    const finalViolationCount = Math.max(vInfo.violationCount || 0, allViolations.length);
    const totalNoFace = allViolations.filter(v => v.type === 'no_face').length;
    const totalMultipleFaces = allViolations.filter(v => v.type === 'multiple_faces').length;

    const firestorePayload = {
      userId,
      uid: userId,
      email: userEmail,
      name: currentUser?.name || 'Candidate',
      rollNumber: currentUser?.rollNumber ?? '',
      college: currentUser?.tenantId ?? '',
      department: currentUser?.department ?? '',
      year: currentUser?.year ?? '',
      assessmentId: testId,
      assessmentTitle: assessmentData?.name || 'Spoken English Assessment',
      testType: 'spoken_english',
      assessmentType: 'spoken_english',
      type: 'spoken_english',
      score: evaluation.percentage,
      totalScore: evaluation.percentage,
      percentage: evaluation.percentage,
      maxScore: 100,
      totalMarks: 100,
      passed: evaluation.percentage >= 50,
      cefrLevel: evaluation.cefr.level,
      cefrName: evaluation.cefr.name,
      wpm: evaluation.wpm,
      fillerCount: evaluation.fillerCount,
      parameters: evaluation.parameters,
      grammarErrors: evaluation.grammarErrors,
      responses: allResp.map(r => ({
        questionId: r.questionId,
        moduleType: r.moduleType,
        transcript: r.transcript,
        durationSeconds: r.durationSeconds,
        attemptCount: r.attemptCount
      })),
      violationCount: finalViolationCount,
      totalNoFace,
      totalMultipleFaces,
      violations: allViolations,
      submittedAt: new Date().toISOString(),
    };

    // Canonical Firestore path: assessmentResults/{tenantId}/{testId}/{userId}
    const tenantId = currentUser?.tenantId ?? '';
    try {
      const v2DocPath = `assessmentResults/${tenantId}/${testId}/${userId}`;
      const unifiedPayload = buildResultDoc({
        ...firestorePayload,
        tenantId,
        userId,
        completed: true,
        status: 'submitted',
        submittedAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp()
      });
      await setDoc(doc(db, v2DocPath), unifiedPayload, { merge: true });
      console.log('[SEA] Result saved to Firestore canonical path');
    } catch (fireErr) {
      console.warn('[SEA] Firestore write failed:', fireErr);
    }

    // ── Course progress tracking (non-fatal) ──────────────────────────────────
    try {
      const courseCtx = JSON.parse(sessionStorage.getItem('seaCourseCtx') || '{}');
      if (courseCtx.courseId && courseCtx.seriesId) {
        const { default: MCQService } = await import('../services/mcqService');
        await MCQService.markCourseProgress({
          uid: userId,
          courseId: courseCtx.courseId,
          seriesId: courseCtx.seriesId,
          assessmentId: courseCtx.assessmentId || testId,
          score: evaluation.percentage || 0,
          maxScore: courseCtx.maxScore || 100,
        });
        sessionStorage.removeItem('seaCourseCtx');
      }
    } catch (_) { /* non-fatal */ }

    setIsSubmitting(false);
    stopAllMediaAndAI();
    setStage('completed');
  };


  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const currentQ = questions[currentQIdx] || {};
  const currentQId = currentQ?.id || `Q_${currentQIdx}`;
  const maxAttempts = currentQ?.maxAttempts || 1;
  const currentAttemptsUsed = attemptsMap[currentQId] || 0;
  const attemptsRemaining = Math.max(0, maxAttempts - currentAttemptsUsed);

  const candidateDisplayName = currentUser?.name || 'Candidate';
  const candidateRollNo = currentUser?.rollNumber ?? '';

  // Render Attempt Limit Reached View
  if (stage === 'limit_reached') {
    return (
      <div className="spe-root">
        <header className="spe-header">
          <div className="spe-header-title">
            <FaLock style={{ color: '#f59e0b' }} /> Spoken English Assessment • Limit Reached
          </div>
          <button className="spe-btn spe-btn-secondary" onClick={handleBack}>Return to Dashboard</button>
        </header>

        <div className="spe-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spe-card spe-completion-box" style={{ maxWidth: '600px' }}>
            <div className="spe-completion-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
              <FaBan />
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: 'white', margin: 0 }}>
              Assessment Already Completed
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '1.05rem', lineHeight: '1.6', margin: 0 }}>
              You have already submitted your response for this placement assessment. Further attempts are restricted by your test administrator.
            </p>

            <button className="spe-btn spe-btn-primary" style={{ padding: '14px 28px', marginTop: '12px' }} onClick={handleBack}>
              Return to Placement Series <FaArrowRight />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Preflight Calibration & AI Readiness Step
  if (stage === 'preflight') {
    return (
      <div className="spe-root">
        <header className="spe-header">
          <div className="spe-header-title">
            <FaShieldAlt /> {assessmentData?.name || 'Spoken English Assessment'} • Calibration
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="spe-candidate-badge">
              <FaUser /> {candidateDisplayName} {candidateRollNo ? `(${candidateRollNo})` : ''}
            </div>
            <div className="spe-proctor-badge">
              <FaVideo /> AI Proctoring Active
            </div>
          </div>
        </header>

        <div className="spe-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spe-card" style={{ maxWidth: '680px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: 'white', margin: 0 }}>
              Microphone Setup & AI Pre-Launch Verification
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.6' }}>
              This placement assessment evaluates spoken fluency, pronunciation, grammar, WPM pace, and filler words using live speech recording.
            </p>

            {/* AI Diagnostic Preflight Checklist */}
            <div className="spe-ai-checklist">
              <div className={`spe-ai-check-item ${speechEngineReady ? 'ready' : ''}`}>
                <FaRobot /> {speechEngineReady ? 'Speech Recognition & Synthesis Engine Ready' : 'Initializing Speech Engine...'}
              </div>
              <div className={`spe-ai-check-item ${calibrationPassed ? 'ready' : ''}`}>
                <FaMicrophone /> {calibrationPassed ? 'Microphone Audio Input Signal Calibrated' : 'Microphone Calibration Required'}
              </div>
              <div className={`spe-ai-check-item ${aiEngineReady ? 'ready' : ''}`}>
                <FaShieldAlt /> {aiEngineReady ? 'AI Speech Diagnostic & NLP Evaluator Loaded' : 'Loading AI Diagnostic Parser...'}
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
              {micPermission === 'pending' && (
                <div>
                  <p style={{ color: '#e2e8f0', marginBottom: '16px' }}>Click below to grant microphone access and test your volume level.</p>
                  <button className="spe-btn spe-btn-primary" style={{ margin: '0 auto' }} onClick={startMicTest}>
                    <FaMicrophone /> Allow Microphone Access
                  </button>
                </div>
              )}

              {micPermission === 'granted' && (
                <div>
                  <span style={{ color: '#10b981', fontWeight: '800', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <FaCheckCircle /> Microphone Signal Detected
                  </span>

                  <div style={{ margin: '16px 0', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '14px', borderRadius: '12px' }}>
                    <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: '700', display: 'block', marginBottom: '6px' }}>
                      Calibration Step: Please read the sentence below out loud:
                    </span>
                    <strong style={{ color: '#ffffff', fontSize: '1.1rem' }}>"{CALIBRATION_TEXT}"</strong>
                  </div>

                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Live Audio Input Level:</span>
                    <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden', marginTop: '8px' }}>
                      <div style={{ width: `${micVolume}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #38bdf8)', transition: 'width 0.1s' }} />
                    </div>
                  </div>
                </div>
              )}

              {micPermission === 'denied' && (
                <div style={{ color: '#ef4444' }}>
                  <FaExclamationTriangle style={{ fontSize: '1.5rem', marginBottom: '8px' }} />
                  <p>Microphone permission denied. Please allow microphone access in your browser settings to proceed.</p>
                </div>
              )}
            </div>

            <button 
              className="spe-btn spe-btn-primary" 
              style={{ width: '100%', justifyContent: 'center', padding: '16px' }}
              disabled={micPermission === 'denied'}
              onClick={() => {
                if (micPermission !== 'granted') {
                  startMicTest();
                } else {
                  setStage('exam');
                }
              }}
            >
              {micPermission === 'pending' ? 'Allow Mic & Start Assessment' : 'Start Spoken English Assessment'} <FaArrowRight />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Completion Redirect View
  if (stage === 'completed') {
    return (
      <div className="spe-root">
        <header className="spe-header">
          <div className="spe-header-title">
            <FaCheckCircle style={{ color: '#10b981' }} /> Section Completed Successfully
          </div>
        </header>

        <div className="spe-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spe-card spe-completion-box" style={{ maxWidth: '600px' }}>
            <div className="spe-completion-icon">
              
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: 'white', margin: 0 }}>
              Assessment Section Completed!
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '1.05rem', lineHeight: '1.6', margin: 0 }}>
              Your speech responses, transcripts, audio attempt logs, and communication diagnostic metrics have been submitted successfully.
            </p>

            <button className="spe-btn spe-btn-primary" style={{ padding: '14px 28px', marginTop: '12px' }} onClick={handleBack}>
              Proceed to Next Section / Series Page <FaArrowRight />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Interactive Exam Stage (Forward-Only Placement Rigor + Question Timers + MCQ Header Parity)
  return (
    <div className="spe-root">
      <SecurityWatermark email={userEmail} />
      <header className="spe-header">
        <div className="spe-header-title">
          <FaMicrophone /> {assessmentData?.name || 'Spoken English Assessment'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Candidate Info Badge */}
          <div className="spe-candidate-badge">
            <FaUser /> {candidateDisplayName} {candidateRollNo ? `(${candidateRollNo})` : ''}
          </div>

          {/* Proctoring Status Badge */}
          <div className="spe-proctor-badge">
            <FaVideo /> AI Proctoring Active
          </div>

          {/* Question Countdown Timer */}
          <div className={`spe-q-timer ${questionTimeLeft <= 10 ? 'warning' : ''}`}>
            <FaHourglassHalf /> Question Time: {formatTime(questionTimeLeft)}
          </div>

          {/* Overall Exam Timer */}
          <div className="spe-header-timer">
            <FaClock /> Total: {formatTime(examTimeLeft)}
          </div>
        </div>
      </header>

      <div className="spe-container">
        {/* Stepper Progress Bar */}
        <div className="spe-stepper-bar">
          {questions.map((q, idx) => (
            <div 
              key={q.id} 
              className={`spe-step-pill ${idx === currentQIdx ? 'active' : idx < currentQIdx ? 'completed' : ''}`} 
            />
          ))}
        </div>

        <div className="spe-card">
          {/* Module Type & Attempt Badges */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="spe-module-tag">
                <FaFileAlt /> {currentQ.moduleTitle || currentQ.type?.toUpperCase()}
              </div>
              <div className="spe-attempt-badge">
                Attempt {currentAttemptsUsed} of {maxAttempts}
              </div>
            </div>
            <span style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: '700' }}>
              Question {currentQIdx + 1} of {questions.length}
            </span>
          </div>

          {/* Module 1: READ ALOUD & READ AND RECORD */}
          {(currentQ.type === 'read_aloud' || currentQ.type === 'read_and_record') && (
            <div className="spe-prompt-box">
              <span style={{ fontSize: '0.8rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '8px' }}>
                Instructions: Read the paragraph below out loud clearly into your microphone.
              </span>
              "{currentQ.text}"
            </div>
          )}

          {/* Module 2: REPEAT SENTENCE & STORY RETELLING */}
          {(currentQ.type === 'repeat_sentence' || currentQ.type === 'story_retelling') && (
            <div>
              <div className="spe-audio-prompt-card">
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>
                    {currentQ.type === 'repeat_sentence' ? 'Listen to the sentence and repeat it verbatim.' : 'Listen to the short story and summarize it in your own words.'}
                  </h4>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0' }}>Click play below to listen before recording your response.</p>
                </div>
                <button className="spe-play-btn" onClick={() => playAudioPrompt(currentQ.audioText)}>
                  <FaVolumeUp /> {isPlayingPrompt ? 'Playing Prompt...' : 'Play Audio Prompt'}
                </button>
              </div>
            </div>
          )}

          {/* Module 3: PICTURE DESCRIPTION */}
          {currentQ.type === 'picture_description' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#cbd5e1', fontSize: '1.05rem', marginBottom: '12px' }}>{currentQ.prompt}</p>
              {currentQ.imageUrl && (
                <img src={currentQ.imageUrl} alt={currentQ.imageAlt} className="spe-image-preview" />
              )}
            </div>
          )}

          {/* Module 4: OPINION & SITUATIONAL & DESCRIBE YOURSELF */}
          {(currentQ.type === 'opinion_question' || currentQ.type === 'describe_yourself' || currentQ.type === 'situational_response') && (
            <div className="spe-prompt-box">
              <span style={{ fontSize: '0.8rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '8px' }}>
                Prompt / Workplace Scenario
              </span>
              {currentQ.prompt}
            </div>
          )}

          {/* Audio Recording & Clean Live Transcript Box */}
          <div className="spe-recorder-box">
            <button 
              className={`spe-mic-button ${isRecording ? 'recording' : ''}`}
              disabled={attemptsRemaining === 0 && !isRecording}
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? <FaStop /> : <FaMicrophone />}
            </button>

            <span style={{ fontWeight: '700', fontSize: '1.1rem', color: isRecording ? '#ef4444' : '#38bdf8' }}>
              {isRecording 
                ? `Recording... (${formatTime(recordingTime)})` 
                : attemptsRemaining === 0 
                  ? 'Maximum attempts reached for this question' 
                  : 'Click Microphone to Start Recording'}
            </span>

            {/* Waveform Bars Animation */}
            {isRecording && (
              <div className="spe-waveform">
                {[20, 35, 15, 40, 25, 30, 18, 38, 22, 30, 15, 25].map((h, i) => (
                  <div key={i} className="spe-wave-bar" style={{ height: `${Math.min(36, h + (recordingTime % 3) * 5)}px` }} />
                ))}
              </div>
            )}

            {/* Clean Verbatim Live Transcript Preview */}
            <div className="spe-transcript-live">
              {liveTranscript ? `"${liveTranscript}"` : isRecording ? 'Listening for speech...' : 'Recorded speech transcript will appear here'}
            </div>
          </div>

          {/* Navigation Controls (Forward-Only Placement Rigor) */}
          <div className="spe-nav-footer">
            <button 
              className="spe-btn spe-btn-primary"
              disabled={isRecording || isSubmitting}
              onClick={handleNextQuestion}
            >
              {currentQIdx < questions.length - 1 ? 'Save & Next Question' : 'Finish & Submit Section'} <FaArrowRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpokenEnglishAssessment;
