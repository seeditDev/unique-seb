/**
 * hardwareTeardown.js
 * Comprehensive hardware and AI shutdown utility.
 * Stops all Camera streams, Microphone streams, AudioContexts, MediaRecorders,
 * SpeechRecognition engines, and AI Detection loops instantly upon test submission
 * (both manual and auto-submit).
 */

export function stopAllMediaAndAI() {
  console.log('[hardwareTeardown] Stopping all camera, microphone, and AI proctoring engines...');

  // 1. Dispatch custom event so React components can synchronously clean up internal hooks/refs
  try {
    window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
  } catch (_) {}

  // 2. Stop window.cameraStream
  if (window.cameraStream) {
    try {
      window.cameraStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
        console.log('[hardwareTeardown] Stopped cameraStream track:', track.label);
      });
    } catch (err) {
      console.warn('[hardwareTeardown] Error stopping window.cameraStream:', err);
    }
    window.cameraStream = null;
  }

  // 3. Stop window.audioStream / window.micStream if attached
  if (window.audioStream) {
    try {
      window.audioStream.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
    } catch (_) {}
    window.audioStream = null;
  }

  if (window.micStream) {
    try {
      window.micStream.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
    } catch (_) {}
    window.micStream = null;
  }

  // 4. Find all <video> and <audio> elements in DOM and stop their MediaStream tracks
  try {
    const mediaElements = document.querySelectorAll('video, audio');
    mediaElements.forEach((el) => {
      if (el.srcObject) {
        if (typeof el.srcObject.getTracks === 'function') {
          el.srcObject.getTracks().forEach((track) => {
            track.onended = null;
            track.stop();
            console.log('[hardwareTeardown] Stopped DOM media track:', track.label);
          });
        }
        el.srcObject = null;
      }
      try {
        el.pause();
      } catch (_) {}
    });
  } catch (err) {
    console.warn('[hardwareTeardown] Error cleaning DOM media elements:', err);
  }

  // 5. Close any active AudioContexts on window
  if (window.__sebAudioContext && typeof window.__sebAudioContext.close === 'function') {
    try {
      window.__sebAudioContext.close();
    } catch (_) {}
    window.__sebAudioContext = null;
  }

  // 6. Stop any global media streams tracked in window.__globalMediaStreams
  if (Array.isArray(window.__globalMediaStreams)) {
    window.__globalMediaStreams.forEach((stream) => {
      try {
        if (stream && typeof stream.getTracks === 'function') {
          stream.getTracks().forEach((t) => {
            t.onended = null;
            t.stop();
          });
        }
      } catch (_) {}
    });
    window.__globalMediaStreams = [];
  }
}

export default stopAllMediaAndAI;
