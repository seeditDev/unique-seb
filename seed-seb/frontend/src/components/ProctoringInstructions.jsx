import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { FaCheckCircle, FaTimesCircle, FaCamera, FaExclamationTriangle, FaSpinner, FaSync, FaClock, FaLaptopCode, FaClipboardList } from 'react-icons/fa';
import '../styles/ProctoringInstructions.css';
import * as faceapi from 'face-api.js';
import { setProctorCacheExpiry } from '../utils/proctorCache';

// Helper to resolve models directory path under both file:// and http/https protocols
const getModelsPath = (subPath) => {
  if (window.location.protocol === 'file:') {
    const path = window.location.pathname;
    const buildIndex = path.indexOf('/build/');
    if (buildIndex !== -1) {
      const basePath = path.substring(0, buildIndex + 7); // includes "/build/"
      return `file://${basePath}${subPath}`;
    }
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash !== -1) {
      const basePath = path.substring(0, lastSlash + 1);
      return `file://${basePath}${subPath}`;
    }
  }
  return `/${subPath}`;
};

const ProctoringInstructions = ({ assessment, onContinue, onCancel }) => {
  const [cameraStatus, setCameraStatus] = useState('requesting'); // requesting, granted, denied, error
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [canContinue, setCanContinue] = useState(false);
  const verificationIntervalRef = useRef(null);
  const contentRef = useRef(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  
  // Single reducer for all photo state — batches into one render to prevent video flicker
  const [photoState, dispatchPhoto] = useReducer(
    (state, action) => ({ ...state, ...action }),
    { status: 'pending', url: null, error: '', capturing: false }
  );
  // Aliases for backwards-compatibility with JSX references
  const photoStatus = photoState.status;
  const photoURL = photoState.url;
  const captureError = photoState.error;
  const isCapturing = photoState.capturing;

  // Track if we are proceeding to test (must not stop camera on unmount if proceeding)
  const isProceedingRef = useRef(false);

  const [currentStep, setCurrentStep] = useState(1); // 1 = Face capture, 2 = Guidelines agreement

  useEffect(() => {
    // Request camera access when component mounts
    requestCameraAccess();

    // Cleanup on unmount - stop stream if not proceeding to the test
    return () => {
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
      }
      
      if (!isProceedingRef.current) {
        console.log('[ProctoringInstructions] Unmounting guidelines without proceeding. Shutting down camera...');
        if (streamRef.current) {
          try {
            streamRef.current.getTracks().forEach(track => {
              track.onended = null;
              track.stop();
            });
          } catch (e) {
            console.warn('[ProctoringInstructions] Error stopping stream on unmount:', e);
          }
        }
        if (window.cameraStream) {
          try {
            window.cameraStream.getTracks().forEach(track => {
              track.onended = null;
              track.stop();
            });
          } catch (_) {}
          window.cameraStream = null;
        }
      }
    };
  }, []);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) {
      return;
    }
    // If content is short (no scroll), allow immediately
    if (contentEl.scrollHeight <= contentEl.clientHeight) {
      setHasScrolledToBottom(true);
    }
  }, [currentStep]);

  const handleContentScroll = () => {
    const el = contentRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
      setHasScrolledToBottom(true);
    }
  };

  const requestCameraAccess = async () => {
    try {
      setCameraStatus('requesting');
      setCameraError(null);
      setCanContinue(false);

      console.log('[ProctoringInstructions] Requesting camera access...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      console.log('[ProctoringInstructions] Camera access granted.');

      // Store stream globally so ProctoringEngine can reuse it
      window.cameraStream = stream;
      streamRef.current = stream;
      setCameraStatus('granted');
      setCanContinue(true);
    } catch (error) {
      console.error('[ProctoringInstructions] Camera access error:', error);
      setCameraStatus('denied');
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraError('Camera access denied. Please allow camera access to continue.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraError('No camera found. Please connect a camera to continue.');
      } else {
        setCameraError('Failed to access camera. Please check your camera settings.');
      }
      setCanContinue(false);
    }
  };

 

  const loadFaceApiForPhoto = async () => {
    try {
      if (!window.faceApiLoaded) {
        console.log('[ProctoringInstructions] Loading faceapi models...');
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(getModelsPath('models/face-api')),
          faceapi.nets.faceLandmark68Net.loadFromUri(getModelsPath('models/face-api')),
          faceapi.nets.faceRecognitionNet.loadFromUri(getModelsPath('models/face-api'))
        ]);
        window.faceApiLoaded = true;
      }
      return true;
    } catch (err) {
      console.error('[ProctoringInstructions] Error loading faceapi models:', err);
      return false;
    }
  };

  // Bind stream to video element when videoRef becomes available after permission is granted
  useEffect(() => {
    if (cameraStatus === 'granted' && streamRef.current && videoRef.current) {
      const video = videoRef.current;
      
      if (video.srcObject !== streamRef.current) {
        console.log('[ProctoringInstructions] Binding stream to video preview element...');
        video.srcObject = streamRef.current;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        
        video.play().then(() => {
          console.log('[ProctoringInstructions] Video preview play() successful');
        }).catch(error => {
          console.error('[ProctoringInstructions] Video preview play() failed:', error);
        });
      }
    }
  }, [cameraStatus]);

  const captureReferencePhoto = useCallback(async () => {
    dispatchPhoto({ error: '', capturing: true });
    
    const modelsReady = await loadFaceApiForPhoto();
    if (!modelsReady) {
      dispatchPhoto({ error: "AI face-detection models failed to load. Please check your connection.", status: 'failed', capturing: false });
      return;
    }
    
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      dispatchPhoto({ error: "Camera stream is not ready yet. Please wait.", capturing: false });
      return;
    }
    
    try {
      console.log('[ProctoringInstructions] Executing manual face capture...');
      const detection = await faceapi.detectSingleFace(
        video,
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.75 })
      ).withFaceLandmarks().withFaceDescriptor();
      
      if (!detection) {
        dispatchPhoto({ error: "No face detected in the frame. Please look directly at the camera and try again.", status: 'failed', capturing: false });
        return;
      }
      
      const box = detection.detection.box;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      // 1. Verify margins (Face too close to edges)
      const borderThresholdX = videoWidth * 0.05;
      const borderThresholdY = videoHeight * 0.05;
      if (
        box.x < borderThresholdX || 
        box.y < borderThresholdY || 
        (box.x + box.width) > (videoWidth - borderThresholdX) || 
        (box.y + box.height) > (videoHeight - borderThresholdY)
      ) {
        dispatchPhoto({ error: "Face is too close to boundaries. Please center your face inside the guide.", status: 'failed', capturing: false });
        return;
      }

      // 2. Verify pose/symmetry (Looking straight check)
      const landmarks = detection.landmarks;
      const leftEye = landmarks.getLeftEye()[0];
      const rightEye = landmarks.getRightEye()[3];
      const nose = landmarks.getNose()[0];
      
      const distLeft = Math.abs(nose.x - leftEye.x);
      const distRight = Math.abs(rightEye.x - nose.x);
      
      if (distLeft > 0 && distRight > 0) {
        const ratio = distLeft / distRight;
        console.log('[ProctoringInstructions] Manual capture symmetry ratio:', ratio);
        if (ratio < 0.55 || ratio > 1.8) {
          dispatchPhoto({ error: "Please look straight at the camera. Side-facing photos are rejected.", status: 'failed', capturing: false });
          return;
        }
      }
      
      // Draw image to canvas
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      const assessmentId = assessment?.id || 'unknown';
      localStorage.setItem('proctor_reference_photo_' + assessmentId, dataUrl);
      localStorage.setItem('proctor_reference_descriptor_' + assessmentId, JSON.stringify(Array.from(detection.descriptor)));
      
      const duration = assessment?.duration || 60;
      setProctorCacheExpiry(duration, assessmentId);
      
      // Single dispatch — one React render for all photo state changes (prevents flicker)
      dispatchPhoto({ url: dataUrl, status: 'captured', error: '', capturing: false });
      console.log('[ProctoringInstructions] Reference photo manually captured and validated!');
    } catch (err) {
      console.error('[ProctoringInstructions] Error during manual face capture:', err);
      dispatchPhoto({ error: "An error occurred during verification. Please try again.", status: 'failed', capturing: false });
    }
  }, [assessment]);

  useEffect(() => {
    // Pre-load photo from cache if present
    const assessmentId = assessment?.id;
    if (assessmentId) {
      const existingPhoto = localStorage.getItem('proctor_reference_photo_' + assessmentId);
      const existingDescriptor = localStorage.getItem('proctor_reference_descriptor_' + assessmentId);
      if (existingPhoto && existingDescriptor) {
        // Single dispatch — avoids two renders
        dispatchPhoto({ url: existingPhoto, status: 'captured' });
      }
    }
  }, [assessment?.id]);

  const handleContinue = () => {
    if (canContinue && streamRef.current && hasScrolledToBottom && isAcknowledged && photoStatus === 'captured') {
      console.log('[ProctoringInstructions] Continuing to test');
      isProceedingRef.current = true;
      // Don't stop the stream here - let ProctoringEngine use it
      onContinue();
    } else {
      console.warn('[ProctoringInstructions] Cannot continue:', {
        canContinue,
        hasStream: !!streamRef.current,
        hasScrolledToBottom,
        isAcknowledged,
        photoStatus
      });
    }
  };

  const handleRetry = () => {
    if (verificationIntervalRef.current) {
      clearInterval(verificationIntervalRef.current);
      verificationIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (window.cameraStream) {
      window.cameraStream.getTracks().forEach(track => track.stop());
      window.cameraStream = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCanContinue(false);
    requestCameraAccess();
  };
  return (
    <div className="proctoring-instructions-overlay">
      <div className="proctoring-instructions-modal">
        <div className="instructions-header">
          <h2>
            <FaCamera className="header-icon" />
            Exam Entry & Proctoring Guidelines
          </h2>
          <p className="instructions-subtitle">Follow the steps below to verify your identity and start your assessment</p>
        </div>

        {/* Wizard Progress Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '16px 24px',
          background: 'var(--bg-primary, #0f172a)',
          borderBottom: '1px solid var(--border-color, #334155)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: photoStatus === 'captured' ? '#10b981' : 'var(--accent-coding, #10b981)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: '700'
            }}>
              {photoStatus === 'captured' ? '' : '1'}
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: '600', color: currentStep === 1 ? 'var(--text-main, #f1f5f9)' : 'var(--text-muted, #94a3b8)' }}>
              Face Registration
            </span>
          </div>

          <div style={{ width: '60px', height: '2px', background: currentStep === 2 ? '#10b981' : 'var(--border-color, #334155)' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: currentStep === 2 ? 'var(--accent-coding, #10b981)' : 'var(--bg-secondary, #1e293b)',
              border: currentStep === 2 ? 'none' : '1px solid var(--border-color, #334155)',
              color: currentStep === 2 ? 'white' : 'var(--text-muted, #94a3b8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: '700'
            }}>
              2
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: '600', color: currentStep === 2 ? 'var(--text-main, #f1f5f9)' : 'var(--text-muted, #94a3b8)' }}>
              Proctoring Guidelines
            </span>
          </div>
        </div>

        {/* STEP 1: IDENTITY VERIFICATION & CAPTURE */}
        {currentStep === 1 && (
          <div className="instructions-content">
            <div className="registration-grid-layout">
              {/* Left Column: Camera Preview */}
              <div className="camera-preview-section" style={{ margin: 0 }}>
                <h3>
                  <FaCamera className="section-icon" />
                  Camera Registration Preview
                </h3>
                <div className="camera-preview-container">
                  {cameraStatus === 'requesting' && (
                    <div className="camera-status-message">
                      <FaSpinner className="spinner-icon" />
                      <p>Requesting camera access...</p>
                      <p className="camera-status-hint">Please allow camera access when prompted by the browser.</p>
                    </div>
                  )}

                  {cameraStatus === 'granted' && (
                    <div className="camera-preview-wrapper" style={{ maxWidth: '100%', width: '100%' }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="instructions-video-preview"
                        style={{ willChange: 'transform', transform: 'translateZ(0)' }}
                      />
                      
                      {photoStatus !== 'captured' && (
                        <>
                          {/* Vignette: separate static div so it never repaints during state updates */}
                          <div className="face-guide-vignette" aria-hidden="true" />
                          <div className="face-guide-oval">
                            <div className="guide-text">Position face inside oval</div>
                          </div>
                        </>
                      )}

                      <div className="photo-capture-overlay">
                        {photoStatus === 'captured' && (
                          <div className="photo-scan-status scan-captured">
                            <FaCheckCircle className="scan-success-icon" />
                            <span> Identity Verified & Registered!</span>
                          </div>
                        )}
                      </div>
                      {photoURL && (
                        <div className="photo-thumbnail">
                          <img src={photoURL} alt="Registered Identity" />
                          <span className="thumbnail-label">REGISTERED</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {cameraStatus === 'denied' && (
                    <div className="camera-status-error">
                      <FaExclamationTriangle className="error-icon" />
                      <p>{cameraError || 'Camera access is required'}</p>
                      <button className="retry-camera-btn" onClick={handleRetry}>
                        Retry Camera Access
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Controls & Verification Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{
                  background: 'var(--bg-primary, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '12px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  <h4 style={{ color: 'var(--text-main, #f1f5f9)', fontSize: '15px', fontWeight: 700, margin: 0 }}>
                    Register Face Profile
                  </h4>
                  <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', margin: 0, lineHeight: '1.4' }}>
                    Ensure you are in a well-lit room, looking straight at the camera. Click the button below to register your face structure.
                  </p>

                  <div className="camera-controls-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {captureError && (
                      <div className="lw-error-row" style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                      }}>
                        <FaExclamationTriangle style={{ flexShrink: 0 }} /> {captureError}
                      </div>
                    )}

                    {photoStatus !== 'captured' ? (
                      <button 
                        className="lw-btn-primary" 
                        style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '12px', background: 'var(--accent-coding, #10b981)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600' }}
                        onClick={captureReferencePhoto}
                        disabled={isCapturing || cameraStatus !== 'granted'}
                      >
                        {isCapturing ? (
                          <>
                            <FaSpinner className="spinner-icon pulse" style={{ fontSize: '16px', margin: 0 }} />
                            <span>Verifying face quality...</span>
                          </>
                        ) : (
                          <>
                            <FaCamera />
                            <span>Capture Registration Photo</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button 
                        className="lw-btn-secondary" 
                        style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '12px', background: 'rgba(51, 65, 85, 0.65)', border: '1px solid rgba(100, 116, 139, 0.35)', color: '#cbd5e1', borderRadius: '8px' }}
                        onClick={() => {
                          dispatchPhoto({ status: 'pending', url: null, error: '' });
                          const assessmentId = assessment?.id || 'unknown';
                          localStorage.removeItem('proctor_reference_photo_' + assessmentId);
                          localStorage.removeItem('proctor_reference_descriptor_' + assessmentId);
                        }}
                      >
                        <FaSync />
                        <span>Retake Registration Photo</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Checks */}
                <div className="camera-verification-checklist" style={{ margin: 0 }}>
                  <h4>Verification Steps</h4>
                  <ul>
                    <li className={cameraStatus === 'granted' ? 'passed' : 'pending'}>
                      <span className="badge-bullet"></span>
                      <span className="badge-text">Webcam Access Permission</span>
                      <span className="badge-status">{cameraStatus === 'granted' ? ' Passed' : '○ Pending'}</span>
                    </li>
                    <li className={photoStatus === 'captured' ? 'passed' : 'pending'}>
                      <span className="badge-bullet"></span>
                      <span className="badge-text">Offline Face Registration</span>
                      <span className="badge-status">{photoStatus === 'captured' ? ' Registered' : isCapturing ? ' Verifying...' : '○ Pending'}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: GUIDELINES & AGREEMENT */}
        {currentStep === 2 && (
          <>
            <div
              className="instructions-content"
              ref={contentRef}
              onScroll={handleContentScroll}
              tabIndex={0}
            >
              <div className="instructions-scroll-hint">
                <FaExclamationTriangle className="hint-icon" />
                <span>Scroll through the guidelines and check the box at the bottom to start.</span>
              </div>

              <div className="instructions-grid-layout">
                <div className="instructions-left-column">
                  {assessment && (
                    <div className="instructions-assessment-card" style={{
                      background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)',
                      borderRadius: '16px',
                      padding: '24px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                      position: 'relative',
                      overflow: 'hidden',
                      color: '#ffffff',
                      border: '1px solid var(--border-color)'
                    }}>
                      <span style={{ 
                        fontSize: '0.72rem', 
                        color: '#c7d2fe', 
                        fontWeight: '700', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.15em',
                        display: 'block',
                        marginBottom: '8px',
                        textAlign: 'left'
                      }}>Selected Assessment</span>
                      
                      <h4 style={{
                        margin: '0 0 20px',
                        fontSize: '1.45rem',
                        color: '#ffffff',
                        fontWeight: '800',
                        lineHeight: '1.3',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                        paddingBottom: '14px',
                        textAlign: 'left'
                      }}>{assessment.name}</h4>
                      
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px'
                      }}>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '12px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          textAlign: 'center'
                        }}>
                          <FaLaptopCode style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }} />
                          <span style={{ fontSize: '0.7rem', color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</span>
                          <span style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: '700', marginTop: '4px', textTransform: 'capitalize' }}>{assessment.type}</span>
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '12px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          textAlign: 'center'
                        }}>
                          <FaClock style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }} />
                          <span style={{ fontSize: '0.7rem', color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</span>
                          <span style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: '700', marginTop: '4px' }}>{assessment.duration} Mins</span>
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '12px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          textAlign: 'center'
                        }}>
                          <FaClipboardList style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }} />
                          <span style={{ fontSize: '0.7rem', color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions</span>
                          <span style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: '700', marginTop: '4px' }}>{assessment.questions ?? ''} Qs</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section details for Multi-Section Assessments */}
                  {assessment.isMultiSection && assessment.sections && assessment.sections.length > 0 && (
                    <div style={{ marginTop: '0px', background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <h4 style={{ color: 'var(--accent-coding)', margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: '700', letterSpacing: '-0.01em', textAlign: 'left' }}>Assessment Sections</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {assessment.sections.map((sec, idx) => {
                          const secQCount = Array.isArray(sec.questionIds) ? sec.questionIds.length : (Array.isArray(sec.questions) ? sec.questions.length : (Number(sec.questions) || 0));
                          return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: '700', fontSize: '0.85rem' }}>#{idx + 1}</span>
                                <span style={{ color: 'var(--text-main)', fontWeight: '600', fontSize: '0.9rem' }}>{sec.name}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                                <span> {sec.duration_minutes || sec.duration || 0}m</span>
                                <span> {secQCount > 0 ? `${secQCount} Qs` : sec.type?.toUpperCase()}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="instructions-right-column">
                  <div className="instructions-section">
                    <h3>
                      <FaCheckCircle className="section-icon check-icon" />
                      What You MUST Do:
                    </h3>
                    <ul className="instructions-list do-list">
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Keep yourself clearly visible in front of the camera at all times</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Ensure good lighting so you are clearly visible</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Stay in front of the camera throughout the entire test</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Make sure only you are visible in the camera view</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Keep your eyes on the screen</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Ensure a stable internet connection</span>
                      </li>
                    </ul>
                  </div>

                  <div className="instructions-section">
                    <h3>
                      <FaTimesCircle className="section-icon dont-icon" />
                      What You MUST NOT Do:
                    </h3>
                    <ul className="instructions-list dont-list">
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not leave your seat or move away from the camera</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not allow anyone else to appear in the camera view</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not cover yourself or turn away from the camera</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not use mobile phones or other devices during the test</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not switch tabs or minimize the browser window</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not communicate with anyone during the test</span>
                      </li>
                    </ul>
                  </div>

                  <div className="instructions-section warning-section">
                    <h3>
                      <FaExclamationTriangle className="section-icon warning-icon" />
                      Important Notes:
                    </h3>
                    <ul className="instructions-list warning-list">
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Camera access is mandatory - the test cannot proceed without it</span>
                      </li>
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Violations are tracked automatically (no person detected, multiple people detected)</span>
                      </li>
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>After 15 violations, your test will be automatically submitted</span>
                      </li>
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>A mini camera view will be displayed during the test</span>
                      </li>
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Your test session is being monitored for integrity</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className={`instructions-acknowledgement ${!hasScrolledToBottom ? 'disabled' : ''}`}>
              <label>
                <input
                  type="checkbox"
                  checked={isAcknowledged}
                  disabled={!hasScrolledToBottom}
                  onChange={(e) => setIsAcknowledged(e.target.checked)}
                />
                I have read and accept the proctoring guidelines
              </label>
              {!hasScrolledToBottom && (
                <small>Scroll to the bottom of the guidelines to enable agreement.</small>
              )}
            </div>
          </>
        )}

        {/* Footer controls based on active wizard step */}
        <div className="instructions-footer">
          {currentStep === 1 ? (
            <>
              <button 
                className="instructions-btn cancel-btn"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button 
                className={`instructions-btn continue-btn ${(!canContinue || photoStatus !== 'captured') ? 'disabled' : ''}`}
                onClick={() => setCurrentStep(2)}
                disabled={!canContinue || photoStatus !== 'captured'}
              >
                Proceed to Guidelines
              </button>
            </>
          ) : (
            <>
              <button 
                className="instructions-btn cancel-btn"
                onClick={() => setCurrentStep(1)}
              >
                Back to Registration
              </button>
              <button 
                className={`instructions-btn continue-btn ${(!hasScrolledToBottom || !isAcknowledged) ? 'disabled' : ''}`}
                onClick={handleContinue}
                disabled={!hasScrolledToBottom || !isAcknowledged}
              >
                I Understand, Start Test
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProctoringInstructions;
