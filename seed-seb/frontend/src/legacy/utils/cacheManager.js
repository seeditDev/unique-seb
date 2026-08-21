import { db } from '../firebase-config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { APP_VERSION, compareVersions } from '../AppShell';
import { CACHE_CONFIG } from '../config/constants';

class CacheManager {
    constructor() {
        this.memoryCache = new Map();
        this.CACHE_TIMEOUT = 1000 * 60 * 30; // 30 minutes
        this.STATIC_CACHE_TIMEOUT = 1000 * 60 * 60 * 24 * 7; // 7 days
        this.PDF_CACHE_PREFIX = 'seed-pdf-';
        this.USER_CACHE_PREFIX = 'seed-user-';
        this.ASSET_CACHE_PREFIX = 'seed-asset-';
        this.CACHE_VERSION_KEY = 'cache_version';
    }

    // Memory Cache Methods
    setMemoryCache(key, data, timeout = this.CACHE_TIMEOUT) {
        this.memoryCache.set(key, {
            data,
            timestamp: Date.now(),
            version: APP_VERSION,
            timeout
        });
    }

    getMemoryCache(key) {
        const cached = this.memoryCache.get(key);
        if (!cached) return null;

        const timeout = cached.timeout || this.CACHE_TIMEOUT;
        if (Date.now() - cached.timestamp > timeout) {
            this.memoryCache.delete(key);
            return null;
        }

        // Version check
        if (cached.version !== APP_VERSION) {
            this.memoryCache.delete(key);
            return null;
        }

        return cached.data;
    }

    clearMemoryCache() {
        this.memoryCache.clear();
    }

    // Local Storage Cache Methods
    setLocalCache(key, data, prefix = '', timeout = this.CACHE_TIMEOUT) {
        try {
            const cacheKey = prefix + key;
            const cacheData = {
                data,
                timestamp: Date.now(),
                version: APP_VERSION,
                timeout
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            return true;
        } catch (error) {
            console.error('Error setting local cache:', error);
            return false;
        }
    }

    getLocalCache(key, prefix = '') {
        try {
            const cacheKey = prefix + key;
            const cached = localStorage.getItem(cacheKey);
            if (!cached) return null;

            const { data, timestamp, version, timeout = this.CACHE_TIMEOUT } = JSON.parse(cached);
            const now = Date.now();

            // Check if cache has expired
            if (now - timestamp > timeout) {
                localStorage.removeItem(cacheKey);
                return null;
            }

            // Version check
            if (version !== APP_VERSION) {
                localStorage.removeItem(cacheKey);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Error getting local cache:', error);
            return null;
        }
    }

    // Version Management Methods
    clearCacheOnVersionChange(oldVersion, newVersion) {
        if (!oldVersion || !newVersion || compareVersions(newVersion, oldVersion) !== 0) {
            console.log(`Clearing cache due to version change: ${oldVersion} -> ${newVersion}`);
            
            // Clear memory cache
            this.clearMemoryCache();
            
            // Clear local storage cache
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (
                    key.startsWith(this.PDF_CACHE_PREFIX) || 
                    key.startsWith(this.USER_CACHE_PREFIX) ||
                    key.startsWith(this.ASSET_CACHE_PREFIX)
                )) {
                    localStorage.removeItem(key);
                }
            }

            // Update cache version
            localStorage.setItem(this.CACHE_VERSION_KEY, newVersion);
            return true;
        }
        return false;
    }

    // Cache Cleanup Methods
    clearExpiredCache() {
        const currentVersion = localStorage.getItem(this.CACHE_VERSION_KEY);
        
        // Check for version mismatch
        if (currentVersion !== APP_VERSION) {
            this.clearCacheOnVersionChange(currentVersion, APP_VERSION);
            return;
        }

        // Clear expired memory cache
        for (const [key, value] of this.memoryCache.entries()) {
            if (Date.now() - value.timestamp > this.CACHE_TIMEOUT || 
                value.version !== APP_VERSION) {
                this.memoryCache.delete(key);
            }
        }

        // Clear expired local storage cache
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && (
                key.startsWith(this.PDF_CACHE_PREFIX) || 
                key.startsWith(this.USER_CACHE_PREFIX) ||
                key.startsWith(this.ASSET_CACHE_PREFIX)
            )) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    if (Date.now() - cached.timestamp > this.CACHE_TIMEOUT || 
                        cached.version !== APP_VERSION) {
                        localStorage.removeItem(key);
                    }
                } catch (error) {
                    // Invalid cache entry, remove it
                    localStorage.removeItem(key);
                }
            }
        }
    }

    // Initialize cache system
    initCacheSystem() {
        // Check and handle version changes
        const currentVersion = localStorage.getItem(this.CACHE_VERSION_KEY);
        if (currentVersion !== APP_VERSION) {
            this.clearCacheOnVersionChange(currentVersion, APP_VERSION);
        }

        // Start periodic cleanup
        setInterval(() => this.clearExpiredCache(), 1000 * 60 * 60); // Every hour
    }

    // PDF Specific Methods
    async cachePDF(pdfId, pdfData) {
        // Store in memory for quick access
        this.setMemoryCache(pdfId, pdfData);
        // Store in local storage for persistence
        return this.setLocalCache(pdfId, pdfData, this.PDF_CACHE_PREFIX);
    }

    async getPDF(pdfId) {
        // Try memory cache first
        const memoryPDF = this.getMemoryCache(pdfId);
        if (memoryPDF) return memoryPDF;

        // Try local storage
        const localPDF = this.getLocalCache(pdfId, this.PDF_CACHE_PREFIX);
        if (localPDF) {
            // Refresh memory cache
            this.setMemoryCache(pdfId, localPDF);
            return localPDF;
        }

        return null;
    }

    // User Data Methods
    async cacheUserData(userId, userData) {
        // Store in memory
        this.setMemoryCache(userId, userData);
        // Store in local storage
        return this.setLocalCache(userId, userData, this.USER_CACHE_PREFIX);
    }

    async getUserData(userId) {
        // Try memory cache
        const memoryUser = this.getMemoryCache(userId);
        if (memoryUser) return memoryUser;

        // Try local storage
        const localUser = this.getLocalCache(userId, this.USER_CACHE_PREFIX);
        if (localUser) {
            this.setMemoryCache(userId, localUser);
            return localUser;
        }

        // If not in cache, fetch from Firestore
        try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                // Cache the fresh data
                await this.cacheUserData(userId, userData);
                return userData;
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }

        return null;
    }

    // Static Asset Methods
    async cacheAsset(assetPath, assetData) {
        // Store in memory for quick access
        this.setMemoryCache(assetPath, assetData, this.STATIC_CACHE_TIMEOUT);
        // Store in local storage for persistence
        return this.setLocalCache(assetPath, assetData, this.ASSET_CACHE_PREFIX, this.STATIC_CACHE_TIMEOUT);
    }

    async getAsset(assetPath) {
        // Try memory cache first
        const memoryAsset = this.getMemoryCache(assetPath);
        if (memoryAsset) return memoryAsset;

        // Try local storage
        const localAsset = this.getLocalCache(assetPath, this.ASSET_CACHE_PREFIX);
        if (localAsset) {
            // Refresh memory cache
            this.setMemoryCache(assetPath, localAsset);
            return localAsset;
        }

        return null;
    }

    // Cache Size Management
    getCacheSize() {
        let size = 0;
        // Calculate memory cache size
        for (const [key, value] of this.memoryCache.entries()) {
            size += JSON.stringify(value).length;
        }
        // Calculate local storage size
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.PDF_CACHE_PREFIX) || key.startsWith(this.USER_CACHE_PREFIX) || key.startsWith(this.ASSET_CACHE_PREFIX)) {
                size += localStorage.getItem(key).length;
            }
        }
        return size;
    }

    static setCache(key, data) {
        const cacheData = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
    }

    static getCache(key) {
        const cachedData = localStorage.getItem(key);
        if (!cachedData) return null;

        const { data, timestamp } = JSON.parse(cachedData);
        const now = Date.now();

        // Check if cache has expired (30 minutes)
        if (now - timestamp > CACHE_CONFIG.EXPIRY_TIME) {
            localStorage.removeItem(key);
            return null;
        }

        return data;
    }

    static clearCache(key) {
        localStorage.removeItem(key);
    }

    static clearAllCache() {
        Object.values(CACHE_CONFIG.PREFIX).forEach(prefix => {
            Object.keys(localStorage)
                .filter(key => key.startsWith(prefix))
                .forEach(key => localStorage.removeItem(key));
        });
    }

    static getCacheKey(prefix, college) {
        return `${prefix}${college}`;
    }
}

export const cacheManager = new CacheManager();
export default cacheManager; 