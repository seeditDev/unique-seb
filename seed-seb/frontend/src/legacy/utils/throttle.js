/**
 * Throttled / debounced persistence helpers.
 *
 * BUG FIXED: several hot paths wrote to localStorage on every keystroke or
 * every timer tick (mcqLastActiveTime once per second, the full coding-editor
 * code map on every change, compile counters on every state update). Each write
 * is a synchronous, serialising main-thread operation — with multi-KB solutions
 * this produced visible input lag.
 */

/** Fire at most once per `waitMs`, always flushing the final call. */
export function throttle(fn, waitMs = 1000) {
  let last = 0;
  let timer = null;
  let pendingArgs = null;

  const invoke = () => {
    last = Date.now();
    timer = null;
    const args = pendingArgs;
    pendingArgs = null;
    fn(...(args || []));
  };

  const throttled = (...args) => {
    pendingArgs = args;
    const elapsed = Date.now() - last;
    if (elapsed >= waitMs) {
      invoke();
    } else if (!timer) {
      timer = setTimeout(invoke, waitMs - elapsed);
    }
  };

  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer);
      invoke();
    }
  };
  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };

  return throttled;
}

export function debounce(fn, waitMs = 500) {
  let timer = null;
  let pendingArgs = null;
  const debounced = (...args) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...(pendingArgs || []));
      pendingArgs = null;
    }, waitMs);
  };
  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      fn(...(pendingArgs || []));
      pendingArgs = null;
    }
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  return debounced;
}

const writers = new Map();

/**
 * Throttled localStorage write, keyed by storage key so repeated calls for the
 * same key collapse into one write per interval. Always flushed on pagehide.
 */
export function throttledLocalStorageSet(key, value, waitMs = 5000) {
  let writer = writers.get(key);
  if (!writer) {
    writer = throttle((v) => {
      try {
        localStorage.setItem(key, v);
      } catch (e) {
        console.warn('[throttledLocalStorageSet] write failed for', key, e?.message);
      }
    }, waitMs);
    writers.set(key, writer);
  }
  writer(typeof value === 'string' ? value : JSON.stringify(value));
}

/** Flush every pending throttled write immediately (call before unload/submit). */
export function flushThrottledWrites() {
  writers.forEach((w) => {
    try { w.flush(); } catch (_) {}
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushThrottledWrites);
  window.addEventListener('beforeunload', flushThrottledWrites);
}

export default throttle;
