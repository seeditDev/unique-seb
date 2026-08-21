import React, { useEffect, useRef, useCallback } from "react";

// AudioProctoringEngine
// Monitors student microphone using Web Audio API (AudioContext + AnalyserNode).
// Flags violations for: sustained noise/talking, mic disconnected, permission denied.
//
// KEY DESIGN: mic permission is requested once when isTestActive first becomes true.
// The stream is kept alive for the entire exam. Sampling is paused when !isTestActive
// but the mic is NOT torn down – avoids repeated permission prompts between sections.

const SAMPLE_INTERVAL_MS = 250;
const NOISE_HOLD_FRAMES = 4;   // ~1s of sustained noise
const NOISE_THRESHOLD   = 0.015;
const COOLDOWN_MS       = 4000;

const AudioProctoringEngine = ({
  uid,
  assessmentId,
  isTestActive = true,
  isProctorActive = true,
  maxViolations = 5,
  onViolationUpdate,
  onReady,
}) => {
  // Keep latest callbacks in refs so closures never go stale
  const onViolationRef = useRef(onViolationUpdate);
  const onReadyRef     = useRef(onReady);
  useEffect(() => { onViolationRef.current = onViolationUpdate; }, [onViolationUpdate]);
  useEffect(() => { onReadyRef.current = onReady; },             [onReady]);

  // Internal resources
  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const streamRef      = useRef(null);
  const intervalRef    = useRef(null);

  // Counters / guards
  const noiseFramesRef    = useRef(0);
  const lastViolationRef  = useRef(0);
  const violationCountRef = useRef(0);
  const initializedRef    = useRef(false);  // mic stream acquired
  const initStartedRef    = useRef(false);  // getUserMedia in-flight

  // ── Violation reporter ────────────────────────────────────────────────────
  const reportViolation = useCallback((type) => {
    const now = Date.now();
    if (now - lastViolationRef.current < COOLDOWN_MS) return;
    lastViolationRef.current = now;
    const newCount = ++violationCountRef.current;
    console.warn(`[AudioProctor] Violation #${newCount}: ${type}`);
    onViolationRef.current?.({ type, count: newCount, maxViolations, timestamp: new Date().toISOString(), uid, assessmentId });
  }, [maxViolations, uid, assessmentId]);

  // ── RMS helper ────────────────────────────────────────────────────────────
  const getRMS = useCallback(() => {
    if (!analyserRef.current) return 0;
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    const data = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }, []);

  // ── Sampling loop ─────────────────────────────────────────────────────────
  const startSampling = useCallback(() => {
    if (intervalRef.current) return;   // already running
    intervalRef.current = setInterval(() => {
      // Track disconnected?
      if (streamRef.current) {
        const tracks = streamRef.current.getAudioTracks();
        if (!tracks.length || tracks[0].readyState === "ended") {
          reportViolation("audio-mic-disconnected");
          return;
        }
      }
      const rms = getRMS();
      if (rms > NOISE_THRESHOLD) {
        if (++noiseFramesRef.current >= NOISE_HOLD_FRAMES) {
          reportViolation("audio-noise-detected");
          noiseFramesRef.current = 0;
        }
      } else {
        noiseFramesRef.current = Math.max(0, noiseFramesRef.current - 1);
      }
    }, SAMPLE_INTERVAL_MS);
  }, [getRMS, reportViolation]);

  const stopSampling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Mic initialisation (runs once) ────────────────────────────────────────
  const initMicrophone = useCallback(async () => {
    try {
      console.log("[AudioProctor] Requesting mic permission...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      initializedRef.current = true;

      console.log("[AudioProctor] Mic initialized, firing onReady");
      onReadyRef.current?.();
      startSampling();
    } catch (err) {
      console.error("[AudioProctor] Mic init failed:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        reportViolation("audio-permission-denied");
      } else {
        reportViolation("audio-mic-disconnected");
      }
      // Always fire onReady so prelaunch countdown does not hang forever
      console.log("[AudioProctor] Mic init failed, still firing onReady to unblock prelaunch");
      onReadyRef.current?.();
    }
    initStartedRef.current = false;
  }, [startSampling, reportViolation]);

  // ── Effect: start mic on first activation, pause/resume sampling ──────────
  useEffect(() => {
    const active = isTestActive && isProctorActive;

    if (active) {
      if (!initializedRef.current && !initStartedRef.current) {
        initStartedRef.current = true;
        initMicrophone();
      } else if (initializedRef.current) {
        startSampling();
      }
    } else {
      // Pause sampling but keep the mic stream alive
      stopSampling();
    }
  }, [isTestActive, isProctorActive, initMicrophone, startSampling, stopSampling]);

  // ── Teardown on unmount or submission event ──────────────────────────────
  useEffect(() => {
    const handleHardwareTeardown = () => {
      console.log("[AudioProctor] Hardware teardown event received — stopping microphone");
      stopSampling();
      streamRef.current?.getTracks().forEach(t => {
        t.onended = null;
        t.stop();
      });
      streamRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
      initializedRef.current = false;
      initStartedRef.current = false;
    };

    window.addEventListener('seb:stop-proctoring-hardware', handleHardwareTeardown);

    return () => {
      console.log("[AudioProctor] Unmounting — releasing mic resources");
      window.removeEventListener('seb:stop-proctoring-hardware', handleHardwareTeardown);
      stopSampling();
      streamRef.current?.getTracks().forEach(t => {
        t.onended = null;
        t.stop();
      });
      streamRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
      initializedRef.current = false;
      initStartedRef.current = false;
    };
  }, [stopSampling]);

  return null;
};

export default React.memo(AudioProctoringEngine);
