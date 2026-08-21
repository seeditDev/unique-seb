import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import '../styles/ProctoringEngine.css';
import timeService from '../services/timeService';
import { recordViolation, getViolations } from '../utils/proctorCache';

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

const DETECTION_INTERVAL_MS = 2000; // no longer used for tight loop, kept for reference
const CONSECUTIVE_DETECTIONS_REQUIRED = 2; // legacy, not used in new strategy
const VIOLATION_RESET_WINDOW_MS = 6000; // legacy, not used in new strategy
const CHECK_INTERVAL_MS = 4000; // 4 seconds between proctor checks
const SEQUENCE_GAP_MS = 1500; // 1.5 seconds between the 2 images in a sequence
const MAX_VIOLATIONS = 5;

// Global model loading state to prevent multiple loads
let globalModelsLoaded = false;
let globalModelsLoading = false;

// CPU-based Non-Maximum Suppression (NMS) helper
const calculateIoU = (box1, box2) => {
  const [x1_1, y1_1, x2_1, y2_1] = box1;
  const [x1_2, y1_2, x2_2, y2_2] = box2;
  
  const xMin = Math.max(x1_1, x1_2);
  const yMin = Math.max(y1_1, y1_2);
  const xMax = Math.min(x2_1, x2_2);
  const yMax = Math.min(y2_1, y2_2);
  
  const intersectionArea = Math.max(0, xMax - xMin) * Math.max(0, yMax - yMin);
  const area1 = (x2_1 - x1_1) * (y2_1 - y1_1);
  const area2 = (x2_2 - x1_2) * (y2_2 - y1_2);
  const unionArea = area1 + area2 - intersectionArea;
  
  if (unionArea === 0) return 0;
  return intersectionArea / unionArea;
};

const cpuNMS = (candidates, iouThreshold = 0.5) => {
  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);
  
  const selected = [];
  for (const candidate of candidates) {
    let keep = true;
    for (const active of selected) {
      if (candidate.classId === active.classId) {
        const iou = calculateIoU(candidate.box, active.box);
        if (iou > iouThreshold) {
          keep = false;
          break;
        }
      }
    }
    if (keep) {
      selected.push(candidate);
    }
  }
  return selected;
};

// Helper to execute YOLOv8 model inference and post-process on the GPU with CPU-NMS
const runYolov8Inference = async (videoElement, model) => {
  let result = { personCount: 0, phoneDetected: false, bookDetected: false };
  
  // Helper to verify if object is a tf.Tensor without using instanceof (obfuscation safe)
  const isTensor = (obj) => {
    return obj && typeof obj.reshape === 'function' && typeof obj.dispose === 'function';
  };

  // 1. Preprocess the image and get predictions from the model
  const tensors = tf.tidy(() => {
    const img = tf.browser.fromPixels(videoElement);
    const resized = tf.image.resizeBilinear(img, [640, 640]);
    const normalized = resized.div(255.0);
    const input = normalized.expandDims(0); // Shape [1, 640, 640, 3]
    
    // Fallback between execute and predict to prevent function errors on compiled graph models
    let output;
    if (typeof model.execute === 'function') {
      output = model.execute(input);
    } else if (typeof model.predict === 'function') {
      output = model.predict(input);
    } else {
      throw new Error("Model has no execute or predict methods");
    }
    
    // Safely unpack output if it's an array or dictionary
    let outputTensor = output;
    if (Array.isArray(output)) {
      outputTensor = output[0];
    } else if (output && !isTensor(output)) {
      const keys = Object.keys(output);
      if (keys.length > 0) {
        outputTensor = output[keys[0]];
      }
    }
    
    if (!outputTensor || !isTensor(outputTensor)) {
      throw new Error("Failed to retrieve a valid tensor output from YOLOv8 model");
    }
    
    const shape = outputTensor.shape;
    let transposed;
    
    if (shape.length === 3) {
      const [, d1, d2] = shape;
      if (d1 === 84 && d2 === 8400) {
        // Format [1, 84, 8400]
        transposed = outputTensor.reshape([84, 8400]).transpose([1, 0]);
      } else if (d1 === 8400 && d2 === 84) {
        // Format [1, 8400, 84] (Already transposed)
        transposed = outputTensor.reshape([8400, 84]);
      } else {
        transposed = outputTensor.reshape([d1, d2]);
        if (d1 < d2) {
          transposed = transposed.transpose([1, 0]);
        }
      }
    } else if (shape.length === 2) {
      const [d1, d2] = shape;
      transposed = outputTensor;
      if (d1 === 84 && d2 === 8400) {
        transposed = transposed.transpose([1, 0]);
      }
    } else {
      throw new Error(`Unexpected output tensor shape: ${shape}`);
    }
    
    const boxes = transposed.slice([0, 0], [-1, 4]); // [8400, 4]
    const scores = transposed.slice([0, 4], [-1, 80]); // [8400, 80]
    const maxScores = scores.max(1); // [8400]
    const classIds = scores.argMax(1); // [8400]
    const mask = maxScores.greater(0.40); // [8400]
    
    return { boxes, maxScores, classIds, mask };
  });

  try {
    // 2. Perform async GPU-to-CPU masking
    const [filteredBoxes, filteredScores, filteredClasses] = await Promise.all([
      tf.booleanMaskAsync(tensors.boxes, tensors.mask),
      tf.booleanMaskAsync(tensors.maxScores, tensors.mask),
      tf.booleanMaskAsync(tensors.classIds, tensors.mask)
    ]);
    
    const boxesArray = await filteredBoxes.array();
    const scoresArray = await filteredScores.array();
    const classesArray = await filteredClasses.array();
    
    const candidates = [];
    
    for (let i = 0; i < classesArray.length; i++) {
      const classId = classesArray[i];
      if (classId === 0 || classId === 67 || classId === 73) {
        const [x_center, y_center, w, h] = boxesArray[i];
        const x1 = x_center - w / 2;
        const y1 = y_center - h / 2;
        const x2 = x_center + w / 2;
        const y2 = y_center + h / 2;
        
        candidates.push({
          box: [x1, y1, x2, y2],
          score: scoresArray[i],
          classId
        });
      }
    }
    
    // 3. Apply NMS
    const suppressed = cpuNMS(candidates, 0.45);
    
    let personCount = 0;
    let phoneDetected = false;
    let bookDetected = false;
    
    for (const item of suppressed) {
      if (item.classId === 0) {
        personCount++;
      } else if (item.classId === 67) {
        phoneDetected = true;
      } else if (item.classId === 73) {
        bookDetected = true;
      }
    }
    
    result = { personCount, phoneDetected, bookDetected };
    
    filteredBoxes.dispose();
    filteredScores.dispose();
    filteredClasses.dispose();
  } catch (err) {
    console.error('[ProctoringEngine] YOLOv8 post-processing error:', err);
  } finally {
    tensors.boxes.dispose();
    tensors.maxScores.dispose();
    tensors.classIds.dispose();
    tensors.mask.dispose();
  }
  
  return result;
};

const ProctoringEngine = ({ 
  uid, 
  assessmentId, 
  onAutoSubmit,
  isTestActive = true,
  maxViolations = 5,
  onViolationUpdate,
  isProctorActive = true,
  onReady
}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const modelsLoadedRef = useRef(false);
  const initializedRef = useRef(false);
  const retryCountRef = useRef(0);
  const detectionInProgressRef = useRef(false);
  const sequenceInProgressRef = useRef(false);
  const selectedDeviceIdRef = useRef(null);

  const [violationCount, setViolationCount] = useState(() => {
    // Guarded: proctorCache is a plain localStorage utility — no async deps.
    // The try/catch protects against circular-import TDZ races in ESM bundlers.
    try {
      if (assessmentId && uid) {
        const cached = getViolations(assessmentId, uid);
        return (cached && typeof cached.violationCount === 'number') ? cached.violationCount : 0;
      }
    } catch (_) {}
    return 0;
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [isWebcamBlocked, setIsWebcamBlocked] = useState(false);
  const [modelStatus, setModelStatus] = useState(globalModelsLoaded ? 'active' : 'loading');

  const onViolationUpdateRef = useRef(onViolationUpdate);
  const onAutoSubmitRef = useRef(onAutoSubmit);
  const maxViolationsRef = useRef(maxViolations);
  const violationCountRef = useRef(violationCount);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    // Guarded: wrap in try/catch to prevent ESM TDZ or localStorage errors from
    // crashing the effect and triggering the React ErrorBoundary.
    try {
      if (assessmentId && uid) {
        const cached = getViolations(assessmentId, uid);
        const count = (cached && typeof cached.violationCount === 'number') ? cached.violationCount : 0;
        if (count > 0) {
          setViolationCount(count);
          violationCountRef.current = count;
          if (maxViolations > 0 && count >= maxViolations && onAutoSubmitRef.current) {
            console.warn(`[ProctoringEngine] Cached violation count (${count}) already meets limit (${maxViolations}). Auto-submitting...`);
            setTimeout(() => {
              if (onAutoSubmitRef.current) {
                onAutoSubmitRef.current({ reason: 'proctoring_violations', violationCount: count, violations: cached.violations || [] });
              }
            }, 1000);
          }
        }
      }
    } catch (err) {
      console.warn('[ProctoringEngine] Could not restore cached violation count:', err);
    }
  }, [assessmentId, uid, maxViolations]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);


  useEffect(() => {
    onViolationUpdateRef.current = onViolationUpdate;
  }, [onViolationUpdate]);

  useEffect(() => {
    onAutoSubmitRef.current = onAutoSubmit;
  }, [onAutoSubmit]);

  useEffect(() => {
    maxViolationsRef.current = maxViolations;
  }, [maxViolations]);

  useEffect(() => {
    violationCountRef.current = violationCount;
  }, [violationCount]);

  // Load models with global caching to prevent repeated loading
  const loadModels = useCallback(async () => {
    // Check if models are already loaded globally and both succeeded
    if (globalModelsLoaded && window.faceApiLoaded && window.yolov8Loaded) {
      modelsLoadedRef.current = true;
      setModelStatus('active');
      console.log('[ProctoringEngine] Using already loaded models');
      return true;
    }

    // If models are being loaded, wait for them
    if (globalModelsLoading) {
      console.log('[ProctoringEngine] Models are being loaded, waiting...');
      // Wait up to 30 seconds for models to load
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (globalModelsLoaded) {
          modelsLoadedRef.current = true;
          setModelStatus(window.yolov8Loaded && window.faceApiLoaded ? 'active' : window.faceApiLoaded ? 'face_only' : 'camera_only');
          return modelsLoadedRef.current;
        }
      }
      setModelStatus('failed');
      return false;
    }

    globalModelsLoading = true;
    setModelStatus('loading');
    try {
      console.log('[ProctoringEngine] Loading offline YOLOv8 and Face-API models independently...');
      await tf.ready();

      // 1. Load Face-API models offline (Primary Guard)
      try {
        console.log('[ProctoringEngine] Loading Face-API models offline...');
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(getModelsPath('models/face-api')),
          faceapi.nets.faceLandmark68Net.loadFromUri(getModelsPath('models/face-api')),
          faceapi.nets.faceRecognitionNet.loadFromUri(getModelsPath('models/face-api'))
        ]);
        window.faceApiLoaded = true;
        console.log('[ProctoringEngine] Face-API loaded successfully');
      } catch (faceErr) {
        window.faceApiLoaded = false;
        console.warn('[ProctoringEngine] Face-API loading failed:', faceErr);
      }

      // 2. Load YOLOv8 model (Offline first with online fallback)
      try {
        console.log('[ProctoringEngine] Loading YOLOv8 offline...');
        window.yolov8Model = await tf.loadGraphModel(getModelsPath('models/yolov8/model.json'));
        window.yolov8Loaded = true;
        console.log('[ProctoringEngine] YOLOv8 loaded offline successfully');
      } catch (yoloOfflineErr) {
        console.warn('[ProctoringEngine] YOLOv8 offline load failed, trying online CDN...', yoloOfflineErr.message);
        try {
          window.yolov8Model = await tf.loadGraphModel('https://hyuto.github.io/yolov8-tfjs/yolov8n_web_model/model.json');
          window.yolov8Loaded = true;
          console.log('[ProctoringEngine] YOLOv8 loaded online successfully');
        } catch (yoloOnlineErr) {
          window.yolov8Loaded = false;
          console.warn('[ProctoringEngine] YOLOv8 online CDN load also failed:', yoloOnlineErr.message);
        }
      }

      globalModelsLoaded = true;
      modelsLoadedRef.current = window.faceApiLoaded || window.yolov8Loaded;
      globalModelsLoading = false;

      const currentStatus = window.yolov8Loaded && window.faceApiLoaded 
        ? 'active' 
        : window.faceApiLoaded 
          ? 'face_only' 
          : window.yolov8Loaded 
            ? 'objects_only' 
            : 'failed';

      setModelStatus(currentStatus);
      console.log(`[ProctoringEngine] AI initialization complete. Status: ${currentStatus}`);
      return modelsLoadedRef.current;
    } catch (error) {
      globalModelsLoading = false;
      modelsLoadedRef.current = false;
      setModelStatus('failed');
      console.warn('[ProctoringEngine] Critical model loader error, running in Camera-Only mode:', error);
      setError(null);
      return false;
    }
  }, []);

  // Show alert toast
  const showAlert = useCallback((message, type = 'warning') => {
    const alertId = `${timeService.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const alert = {
      id: alertId,
      message,
      type
    };
    
    setAlerts(prev => [...prev, alert]);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    }, 3000);
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.onended = null;
          track.stop();
          console.log('[ProctoringEngine] Stopped streamRef track:', track.label);
        });
      } catch (err) {
        console.error('[ProctoringEngine] Error stopping streamRef track:', err);
      }
      streamRef.current = null;
    }

    if (window.cameraStream) {
      try {
        window.cameraStream.getTracks().forEach(track => {
          track.onended = null;
          track.stop();
          console.log('[ProctoringEngine] Explicitly stopped window.cameraStream track:', track.label);
        });
      } catch (err) {
        console.error('[ProctoringEngine] Error stopping window.cameraStream track:', err);
      }
      window.cameraStream = null;
    }
  }, []);

  const stopDetectionLoop = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  const notifyViolationEvent = useCallback(
    (violationType, countOverride) => {
      if (!violationType || !onViolationUpdateRef.current) return;
      const payloadCount =
        typeof countOverride === 'number' ? countOverride : violationCountRef.current;
      onViolationUpdateRef.current({
        violationCount: payloadCount,
        violationType,
        timestamp: timeService.getNow().toISOString()
      });
    },
    []
  );

  // Initialize webcam - with duplicate prevention and reuse existing stream
  const initializeWebcam = useCallback(async (force = false) => {
    if (force) {
      console.log('[ProctoringEngine] Forcing webcam reinitialization...');
      stopDetectionLoop();
      cleanupStream();
    }

    // Check if we already have an active stream - reuse it instead of requesting again
    if (!force && streamRef.current && streamRef.current.active) {
      console.log('[ProctoringEngine] Webcam already initialized, reusing existing stream...');
      if (videoRef.current && !videoRef.current.srcObject) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
      return true;
    }

    const attachTrackHandlers = (stream) => {
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.warn('[ProctoringEngine] Camera track ended. Attempting to reconnect...');
          setIsInitialized(false);
          setError('Camera disconnected. Attempting to reconnect...');
          setIsWebcamBlocked(true);
          retryCountRef.current = 0;
          initializeWebcam(true);
        };
      });
    };

    // Check if there's a global stream from instructions page
    if (window.cameraStream && window.cameraStream.active) {
      streamRef.current = window.cameraStream;
      attachTrackHandlers(window.cameraStream);
      if (videoRef.current) {
        videoRef.current.srcObject = window.cameraStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
      retryCountRef.current = 0;
      setIsWebcamBlocked(false);
      setError(null);
      return true;
    }

    try {
      console.log('[ProctoringEngine] Requesting webcam access...');
      
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          ...(selectedDeviceIdRef.current ? { deviceId: { exact: selectedDeviceIdRef.current } } : {})
        },
        audio: false
      };

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (deviceConstraintErr) {
        if (selectedDeviceIdRef.current && (deviceConstraintErr.name === 'OverconstrainedError' || deviceConstraintErr.name === 'NotFoundError')) {
          console.warn('[ProctoringEngine] Specific camera deviceId not found, falling back to default camera:', deviceConstraintErr.message);
          selectedDeviceIdRef.current = null;
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user'
            },
            audio: false
          });
        } else {
          throw deviceConstraintErr;
        }
      }

      // Save active camera deviceId for consistent reconnection
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : {};
        if (settings.deviceId) {
          selectedDeviceIdRef.current = settings.deviceId;
          console.log('[ProctoringEngine] Saved active camera deviceId:', settings.deviceId);
        }
      }

      // Store stream globally so it can be reused
      window.cameraStream = stream;
      attachTrackHandlers(stream);
      
      if (videoRef.current) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
        streamRef.current = stream;
        retryCountRef.current = 0;
        setIsWebcamBlocked(false);
        setError(null);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ProctoringEngine] Webcam access error:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setError('Webcam access denied. Please allow camera access to continue.');
        setIsWebcamBlocked(true);
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setError('No webcam found. Please connect a webcam to continue.');
        setIsWebcamBlocked(true);
      } else if (error.name === 'NotReadableError') {
        setError('Unable to start webcam. It may be in use by another application. Retrying...');
        setIsWebcamBlocked(true);
        if (retryCountRef.current < 3) {
          retryCountRef.current += 1;
          setTimeout(() => {
            initializeWebcam(force);
          }, 1500);
        }
      } else {
        setError('Failed to access webcam. Please check your camera settings.');
        setIsWebcamBlocked(true);
      }
      
      return false;
    }
  }, [cleanupStream, stopDetectionLoop]);

  // Helper to handle and increment violation events
  const handleViolation = useCallback((type) => {
    setViolationCount(prev => {
      const newCount = prev + 1;
      
      let msg = 'Malpractice violation detected!';
      if (type === 'no_face') {
        msg = 'Face not detected - Please stay in front of the camera';
      } else if (type === 'multiple_faces') {
        msg = 'Multiple faces / people detected in camera feed';
      } else if (type === 'cell_phone') {
        msg = 'Mobile phone detected in camera feed - Unauthorized device!';
      } else if (type === 'prohibited_object') {
        msg = 'Prohibited object (book/material) detected';
      } else if (type === 'looking_away') {
        msg = 'Suspicious activity: Student looking away from screen repeatedly';
      } else if (type === 'face_mismatch') {
        msg = 'Face verification failed: Different person detected in camera view!';
      }

      // Record to local cache for Firestore submission
      const record = recordViolation(assessmentId, uid, type, { message: msg });

      // Defer side effects to prevent updating other React components during this state transition
      setTimeout(() => {
        showAlert(msg, 'warning');
        if (onViolationUpdateRef.current) {
          onViolationUpdateRef.current({
            violationCount: newCount,
            violationType: type,
            violations: record.violations,
            timestamp: new Date().toISOString()
          });
        }

        if (newCount >= maxViolationsRef.current && onAutoSubmitRef.current) {
          console.log('[ProctoringEngine] Violation count reached limit. Auto-submitting exam...');
          showAlert('Maximum violations reached. Exam will be auto-submitted.', 'error');

          setTimeout(() => {
            if (onAutoSubmitRef.current) {
              onAutoSubmitRef.current({ reason: 'proctoring_violations', violationCount: newCount, violations: record.violations });
            }
          }, 2000);
        }
      }, 0);

      return newCount;
    });
  }, [assessmentId, uid, showAlert]);

  // Single-frame detection helper (used in scheduled sequences)
  const detectFrame = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()?.[0] || window.cameraStream?.getVideoTracks()?.[0];
    if (!isTestActive || !videoRef.current || !streamRef.current || !track || !track.enabled || track.readyState !== 'live') {
      return { violationType: null, faceCount: 0 };
    }
    if (detectionInProgressRef.current) {
      return { violationType: null, faceCount: 0 };
    }

    detectionInProgressRef.current = true;

    try {
      const video = videoRef.current;

      if (video.readyState < 2 || video.paused) {
        try {
          await video.play();
        } catch (_) {}
        if (video.readyState < 2) {
          return { violationType: null, faceCount: 0 };
        }
      }

      let faceCount = 0;
      let violationType = null;
      let lookingAway = false;

      // 1. Run Face-API detection (Offline Primary Guard)
      if (window.faceApiLoaded) {
        try {
          const faceDetections = await faceapi.detectAllFaces(
            video, 
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 })
          ).withFaceLandmarks().withFaceDescriptors();

          faceCount = faceDetections.length;
          console.log('[ProctoringEngine] Face-API detections count:', faceCount);

          if (faceCount === 0) {
            violationType = 'no_face';
          } else if (faceCount > 1) {
            violationType = 'multiple_faces';
          } else {
            // Identity Face Verification matching check
            const savedDescriptorStr = localStorage.getItem('proctor_reference_descriptor_' + assessmentId);
            if (savedDescriptorStr && faceDetections[0].descriptor) {
              try {
                const referenceDescriptor = new Float32Array(JSON.parse(savedDescriptorStr));
                const distance = faceapi.euclideanDistance(referenceDescriptor, faceDetections[0].descriptor);
                console.log('[ProctoringEngine] Face verification distance:', distance);
                if (distance > 0.6) {
                  violationType = 'face_mismatch';
                }
              } catch (err) {
                console.error('[ProctoringEngine] Error parsing reference descriptor:', err);
              }
            }

            // Check head pose (Looking Away detection)
            if (!violationType) {
              const landmarks = faceDetections[0].landmarks;
              const nose = landmarks.getNose();
              const jawOutline = landmarks.getJawOutline();
              
              if (jawOutline && jawOutline.length >= 17 && nose && nose.length >= 7) {
                const leftEdge = jawOutline[0];
                const rightEdge = jawOutline[16];
                const noseTip = nose[6];
                
                const distLeft = noseTip.x - leftEdge.x;
                const distRight = rightEdge.x - noseTip.x;
                
                if (distLeft > 0 && distRight > 0) {
                  const ratio = distLeft / distRight;
                  console.log('[ProctoringEngine] Face ratio (nose/jaw):', ratio);
                  if (ratio < 0.35 || ratio > 2.8) {
                    lookingAway = true;
                    violationType = 'looking_away';
                  }
                }
              }
            }
          }
        } catch (faceErr) {
          console.error('[ProctoringEngine] Face-API runtime error:', faceErr);
        }
      }

      // 2. Run YOLOv8 detection (Object Detection Guard)
      if (window.yolov8Model && window.yolov8Loaded && !window.yoloModelBroken) {
        try {
          const yoloResult = await runYolov8Inference(video, window.yolov8Model);
          console.log('[ProctoringEngine] YOLOv8 detection result:', yoloResult);
          
          if (!window.faceApiLoaded) {
            faceCount = yoloResult.personCount;
            if (faceCount === 0) {
              violationType = 'no_face';
            } else if (faceCount > 1) {
              violationType = 'multiple_faces';
            }
          }

          if (yoloResult.phoneDetected) {
            violationType = 'cell_phone';
          } else if (yoloResult.bookDetected && !violationType) {
            violationType = 'prohibited_object';
          }
        } catch (yoloErr) {
          console.error('[ProctoringEngine] YOLOv8 runtime error (disabling YOLOv8 engine due to backend failure):', yoloErr);
          window.yoloModelBroken = true; // Disable YOLOv8 to prevent UI thread freezing
        }
      }

      return { violationType, faceCount };
    } catch (error) {
      console.error('[ProctoringEngine] Detection error:', error);
      return { violationType: null, faceCount: 0 };
    } finally {
      detectionInProgressRef.current = false;
    }
  }, [isTestActive]);

  // Scheduled sequence: capture two frames and compare
  const runPresenceCheckSequence = useCallback(async () => {
    if (!isTestActive || sequenceInProgressRef.current) return;
    if (!videoRef.current || !streamRef.current) return;

    sequenceInProgressRef.current = true;
    try {
      const first = await detectFrame();
      
      // Handle instant critical violations immediately
      if (first.violationType && (first.violationType === 'cell_phone' || first.violationType === 'multiple_faces' || first.violationType === 'prohibited_object')) {
        handleViolation(first.violationType);
        return;
      }

      if (first.violationType) {
        notifyViolationEvent(first.violationType);
      }

      await new Promise(resolve => setTimeout(resolve, SEQUENCE_GAP_MS));

      const second = await detectFrame();
      
      // Handle instant critical violations immediately
      if (second.violationType && (second.violationType === 'cell_phone' || second.violationType === 'multiple_faces' || second.violationType === 'prohibited_object')) {
        handleViolation(second.violationType);
        return;
      }

      if (second.violationType) {
        notifyViolationEvent(second.violationType);
      }

      const noFaceFirst = first.violationType === 'no_face';
      const noFaceSecond = second.violationType === 'no_face';
      const lookingAwayFirst = first.violationType === 'looking_away';
      const lookingAwaySecond = second.violationType === 'looking_away';

      if (noFaceFirst && noFaceSecond) {
        handleViolation('no_face');
      } else if (lookingAwayFirst && lookingAwaySecond) {
        handleViolation('looking_away');
      }
    } catch (err) {
      console.error('[ProctoringEngine] Error in presence check sequence:', err);
    } finally {
      sequenceInProgressRef.current = false;
    }
  }, [detectFrame, isTestActive, notifyViolationEvent, handleViolation]);

  // Initialize proctoring system - with duplicate prevention
  useEffect(() => {
    if (!isTestActive) {
      // Stop camera and cleanup when test is not active
      console.log('[ProctoringEngine] Test not active, cleaning up...');
      
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      
      cleanupStream();
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      setIsInitialized(false);
      initializedRef.current = false;
      return;
    }

    if (initializedRef.current) {
      console.log('[ProctoringEngine] Already initialized, skipping...');
      return;
    }

    const init = async () => {
      // Mark as initializing to prevent duplicates
      initializedRef.current = true;
      
      try {
        // 1. Initialize webcam first so camera view is visible immediately
        const webcamInitialized = await initializeWebcam();
        if (!webcamInitialized) {
          initializedRef.current = false;
          return;
        }

        // 2. Wait for video to be ready and play it
        if (videoRef.current) {
          const handleLoadedMetadata = async () => {
            setIsInitialized(true);
            setError(null);
            setIsWebcamBlocked(false);
            
            // 3. Load TensorFlow models in background while video is already rendering
            const modelsLoaded = await loadModels();
            if (modelsLoaded) {
              stopDetectionLoop();
              // Run presence checks
              runPresenceCheckSequence();
              detectionIntervalRef.current = setInterval(() => {
                runPresenceCheckSequence();
              }, CHECK_INTERVAL_MS);
              console.log('[ProctoringEngine] Scheduled proctoring AI checks started');
              if (onReadyRef.current) {
                onReadyRef.current();
              }
            }
          };

          if (videoRef.current.readyState >= 2) {
            // Video already loaded
            handleLoadedMetadata();
          } else {
            videoRef.current.onloadedmetadata = handleLoadedMetadata;
          }
        }
      } catch (error) {
        console.error('[ProctoringEngine] Initialization error:', error);
        setError('Failed to initialize proctoring system.');
        initializedRef.current = false;
      }
    };

    init();

    const handleHardwareTeardown = () => {
      console.log('[ProctoringEngine] Hardware teardown event received, stopping camera and AI...');
      stopDetectionLoop();
      cleanupStream();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      initializedRef.current = false;
      setIsInitialized(false);
    };

    window.addEventListener('seb:stop-proctoring-hardware', handleHardwareTeardown);

    // Cleanup
    return () => {
      console.log('[ProctoringEngine] Cleanup running...');
      window.removeEventListener('seb:stop-proctoring-hardware', handleHardwareTeardown);
      stopDetectionLoop();
      cleanupStream();
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTestActive]);

  // Restore/Reset violation count from localStorage on mount or when test ID changes
  useEffect(() => {
    if (uid && assessmentId) {
      const key = `proctor_violations_${uid}_${assessmentId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const count = parseInt(saved, 10) || 0;
          setViolationCount(count);
          if (onViolationUpdate) {
            onViolationUpdate({
              violationCount: count,
              violationType: 'init_sync',
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error('[ProctoringEngine] Error restoring violation count:', error);
          setViolationCount(0);
        }
      } else {
        setViolationCount(0);
      }
    } else {
      setViolationCount(0);
    }
  }, [uid, assessmentId]);

  // Save violation count to localStorage
  useEffect(() => {
    if (uid && assessmentId) {
      const key = `proctor_violations_${uid}_${assessmentId}`;
      localStorage.setItem(key, violationCount.toString());
    }
  }, [uid, assessmentId, violationCount]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      if (!isTestActive) return;
      console.log('[ProctoringEngine] Media device change detected. Re-initializing camera...');
      retryCountRef.current = 0;
      initializeWebcam(true);
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [initializeWebcam, isTestActive]);

  // Draggable camera preview state
  const containerRef = useRef(null);
  const [position, setPosition] = useState(() => {
    try {
      const saved = sessionStorage.getItem('proctoring_camera_pos');
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, elemX: 0, elemY: 0 });

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    const elemX = rect ? rect.left : (window.innerWidth - 200);
    const elemY = rect ? rect.top : 65;

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elemX,
      elemY
    };
    setIsDragging(true);
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    const elemX = rect ? rect.left : (window.innerWidth - 200);
    const elemY = rect ? rect.top : 65;

    dragStartRef.current = {
      mouseX: touch.clientX,
      mouseY: touch.clientY,
      elemX,
      elemY
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect ? rect.width : 200;
      const height = rect ? rect.height : 150;

      const rawX = dragStartRef.current.elemX + deltaX;
      const rawY = dragStartRef.current.elemY + deltaY;

      const clampedX = Math.max(10, Math.min(window.innerWidth - width - 10, rawX));
      const clampedY = Math.max(10, Math.min(window.innerHeight - height - 10, rawY));

      const newPos = { x: clampedX, y: clampedY };
      setPosition(newPos);
      try {
        sessionStorage.setItem('proctoring_camera_pos', JSON.stringify(newPos));
      } catch (_) {}
    };

    const handleTouchMove = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStartRef.current.mouseX;
      const deltaY = touch.clientY - dragStartRef.current.mouseY;

      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect ? rect.width : 200;
      const height = rect ? rect.height : 150;

      const rawX = dragStartRef.current.elemX + deltaX;
      const rawY = dragStartRef.current.elemY + deltaY;

      const clampedX = Math.max(10, Math.min(window.innerWidth - width - 10, rawX));
      const clampedY = Math.max(10, Math.min(window.innerHeight - height - 10, rawY));

      const newPos = { x: clampedX, y: clampedY };
      setPosition(newPos);
      try {
        sessionStorage.setItem('proctoring_camera_pos', JSON.stringify(newPos));
      } catch (_) {}
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  // Block exam if webcam is not available
  if (isWebcamBlocked) {
    return (
      <div className="proctoring-blocked">
        <div className="blocked-content">
          <FaExclamationTriangle className="blocked-icon" />
          <h3>Webcam Required</h3>
          <p>{error || 'Webcam access is required to take this exam.'}</p>
          <p className="blocked-instructions">
            Please allow camera access and refresh the page to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="proctoring-engine">
      {/* Top Section: Violation Counter and Camera Preview - Draggable */}
      <div 
        ref={containerRef}
        className={`proctoring-top-section ${isDragging ? 'is-dragging' : ''}`}
        style={position ? { top: `${position.y}px`, left: `${position.x}px`, right: 'auto', bottom: 'auto' } : {}}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="proctoring-top-row">
          {/* Mini Camera View */}
          <div className="mini-camera-view">
            {/* Drag Handle Overlay */}
            <div className="camera-drag-handle" title="Click and drag to move camera preview anywhere on screen">
              <span className="drag-dots">⋮⋮</span>
              <span>DRAG TO MOVE</span>
            </div>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="mini-camera-video"
            />
            {/* Live recording indicator */}
            <div className="camera-label">
              <span className="camera-rec-dot" /> LIVE 
              <span style={{ marginLeft: '4px', fontSize: '9px', opacity: 0.85, fontWeight: '700' }}>
                | {modelStatus === 'active' ? 'AI ACTIVE' : modelStatus === 'face_only' ? 'AI ACTIVE (FACE ONLY)' : modelStatus === 'objects_only' ? 'AI ACTIVE (OBJECTS)' : modelStatus === 'loading' ? 'LOADING AI...' : 'CAMERA ONLY'}
              </span>
            </div>
            {/* Violation count badge overlaid on camera */}
            <div className={`camera-violation-badge ${violationCount === 0 ? 'badge-safe' : violationCount >= Math.round(maxViolations * 0.8) ? 'badge-critical' : 'badge-warn'}`}>
               {violationCount}/{maxViolations}
            </div>
          </div>
        </div>
      </div>

      {/* Alert Toasts */}
      <div className="proctor-alerts">
        {alerts.map(alert => (
          <div key={alert.id} className={`proctor-alert proctor-alert-${alert.type}`}>
            <FaExclamationTriangle />
            <span>{alert.message}</span>
            <button 
              className="alert-close"
              onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
            >
              <FaTimes />
            </button>
          </div>
        ))}
      </div>

      {/* Error State */}
      {error && !isWebcamBlocked && (
        <div className="proctor-error">
          <FaExclamationTriangle />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(ProctoringEngine);
