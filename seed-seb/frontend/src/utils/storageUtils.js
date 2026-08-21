/**
 * storageUtils.js
 *
 * LocalStorage helpers for auth state persistence.
 * The user object stored and retrieved is the canonical Firestore user document.
 * All fields are canonical — no normalization on read or write.
 */

export const getStorageJson = (key, fallback = {}) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storageUtils] Error parsing storage key "${key}":`, err);
    return fallback;
  }
};

export const setStorageJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[storageUtils] Error setting storage key "${key}":`, err);
  }
};

/**
 * Returns the canonical user object from localStorage.
 * If no data, returns a null sentinel — callers must check user?.uid.
 * @returns {object|null}
 */
export const getAuthData = () => {
  const data = getStorageJson('auth_data', null);
  return data ?? null;
};

/**
 * Stores a canonical user object to localStorage.
 * The caller is responsible for passing a canonical user object.
 * @param {object} user - Canonical user document
 */
export const setAuthData = (user) => {
  setStorageJson('auth_data', user);
  return user;
};
