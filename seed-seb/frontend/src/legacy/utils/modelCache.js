// Model caching utility for face-api.js models
// Caches models in IndexedDB to avoid repeated CDN fetches

const DB_NAME = 'faceapi_models_cache';
const DB_VERSION = 1;
const STORE_NAME = 'models';

let dbInstance = null;

// Initialize IndexedDB
const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

// Check if model is cached
export const isModelCached = async (modelName) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(modelName);
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        resolve(request.result !== undefined);
      };
      request.onerror = () => resolve(false);
    });
  } catch (error) {
    console.warn('[ModelCache] Error checking cache:', error);
    return false;
  }
};

// Get cached model
export const getCachedModel = async (modelName) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(modelName);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result);
        } else {
          reject(new Error('Model not in cache'));
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('[ModelCache] Error getting cached model:', error);
    throw error;
  }
};

// Cache model
export const cacheModel = async (modelName, modelData) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    await store.put(modelData, modelName);
    console.log(`[ModelCache] Cached model: ${modelName}`);
  } catch (error) {
    console.warn('[ModelCache] Error caching model:', error);
  }
};

// Load model with caching
export const loadModelWithCache = async (modelName, loadFunction) => {
  try {
    // Check cache first
    const cached = await getCachedModel(modelName);
    if (cached) {
      console.log(`[ModelCache] Using cached model: ${modelName}`);
      return cached;
    }
  } catch (error) {
    // Not in cache, continue to load
  }

  // Load from source
  console.log(`[ModelCache] Loading model from source: ${modelName}`);
  const model = await loadFunction();
  
  // Cache it
  try {
    await cacheModel(modelName, model);
  } catch (error) {
    console.warn('[ModelCache] Failed to cache model, but model loaded:', error);
  }

  return model;
};

