/**
 * DOM-level tab-switch / focus-loss detection.
 *
 * BUG FIXED: the primary coding flow (CodingAssessmentPage.jsx) had NO
 * visibilitychange listener at all; tab-switch detection was delegated entirely
 * to the webcam ML pipeline in ProctoringEngine, which soft-fails to
 * 'camera_only' / 'failed'. When the webcam mode degraded, students could
 * alt-tab freely. The sandbox variant did have a listener, so the two flows
 * behaved differently. This hook is webcam-independent and is used by both.
 *
 * It also covers what a browser `visibilitychange` alone misses: window blur
 * (another app on top without hiding the tab) and fullscreen exit.
 */
import { useEffect, useRef } from 'react';

/**
 * @param {object} options
 * @param {boolean} options.enabled
 * @param {(info:{type:string,count:number,at:number,hiddenMs?:number})=>void} options.onViolation
 * @param {number} [options.minIntervalMs=1500] de-dupe window (blur+visibilitychange fire together)
 * @param {boolean} [options.watchBlur=true]
 * @param {boolean} [options.watchFullscreen=true]
 */
export function useTabSwitchGuard({
  enabled,
  onViolation,
  minIntervalMs = 1500,
  watchBlur = true,
  watchFullscreen = true,
}) {
  const countRef = useRef(0);
  const lastRef = useRef(0);
  const hiddenAtRef = useRef(0);
  const handlerRef = useRef(onViolation);
  handlerRef.current = onViolation;

  useEffect(() => {
    if (!enabled) return undefined;

    const report = (type, extra = {}) => {
      const now = Date.now();
      if (now - lastRef.current < minIntervalMs) return;
      lastRef.current = now;
      countRef.current += 1;
      try {
        handlerRef.current?.({ type, count: countRef.current, at: now, ...extra });
      } catch (e) {
        console.warn('[useTabSwitchGuard] handler threw', e?.message);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        report('tab_switch');
      } else if (hiddenAtRef.current) {
        const hiddenMs = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = 0;
        report('tab_return', { hiddenMs });
      }
    };
    const onBlur = () => report('window_blur');
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) report('fullscreen_exit');
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (watchBlur) window.addEventListener('blur', onBlur);
    if (watchFullscreen) document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (watchBlur) window.removeEventListener('blur', onBlur);
      if (watchFullscreen) document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [enabled, minIntervalMs, watchBlur, watchFullscreen]);

  return { getCount: () => countRef.current };
}

export default useTabSwitchGuard;
