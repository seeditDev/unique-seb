// ────────────────────────────────────────────────────────────────────────────
// Firestore Collection Names (v2 schema)
// ────────────────────────────────────────────────────────────────────────────
export const COLLECTIONS = {
    TENANTS: 'tenants',
    USERS: 'users',
    ASSESSMENTS: 'assessments',
    ASSESSMENT_RESULTS: 'assessmentResults',
    CODING_CHALLENGES: 'codingChallenges',
    CODING_PROGRESS: 'codingProgress',
    LIVE_PRESENCE: 'livePresence',
    PROCTORING_LOGS: 'proctoringLogs',
    SYSTEM_CONFIG: 'systemConfig',
    // ── New centralized course schema (Admin Portal v3) ──
    COURSES: 'courses',                   // courses/{courseId}/series/{seriesId}/tests/{testId}
    CONTENT_URLS: 'contentUrls',          // CDN URL registry populated by MCQ/Coding/SEA creators
    QUESTION_BANK: 'questionBank',        // MCQ question bank (QBCategory: custom etc.)
    CODING_CHALLENGES_BANK: 'codingChallenges', // Coding challenge bank
};

// ────────────────────────────────────────────────────────────────────────────
// GitHub CDN — ONLY for practice content (seed-contents repo, read-only CDN)
// DO NOT add SEEDDB URLs here — all user data now lives in Firestore.
// ────────────────────────────────────────────────────────────────────────────
export const SEED_CONTENTS_BASE_URL = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';

// ────────────────────────────────────────────────────────────────────────────
// Academic Years (display labels; actual cohort IDs are stored in Firestore)
// ────────────────────────────────────────────────────────────────────────────
export const ACADEMIC_YEARS = {
    '2K26': '2026 Batch',
    '2K27': '2027 Batch',
    '2K28': '2028 Batch',
    '2K29': '2029 Batch'
};

// ────────────────────────────────────────────────────────────────────────────
// Colleges (display labels; actual tenant slugs are stored in Firestore)
// These are kept for legacy UI display only — auth no longer uses them.
// ────────────────────────────────────────────────────────────────────────────
export const COLLEGES = {
    'SEEDIT': 'SEED Innovating Technologies and Educational Services (SEED-IT)',
    'KITE': 'KGiSL Institute of Technology (KITE)'
};

// ────────────────────────────────────────────────────────────────────────────
// Cache Config (for practice content only)
// ────────────────────────────────────────────────────────────────────────────
export const CACHE_CONFIG = {
    EXPIRY_TIME: 30 * 60 * 1000, // 30 minutes
    PREFIX: {
        PROFILES: 'college_profiles_',
        ACCESS: 'college_access_',
        SCORES: 'college_scores_',
        FULL_DB: 'college_fulldb_'
    }
};

// ────────────────────────────────────────────────────────────────────────────
// User Roles
// ────────────────────────────────────────────────────────────────────────────
export const ROLES = {
    STUDENT: 'student',
    STAFF: 'staff',
    ADMIN: 'admin',
};

// ────────────────────────────────────────────────────────────────────────────
// Assessment Status Values
// ────────────────────────────────────────────────────────────────────────────
export const ASSESSMENT_STATUS = {
    DRAFT: 'draft',
    ACTIVE: 'active',
    CLOSED: 'closed',
};

// ────────────────────────────────────────────────────────────────────────────
// Assessment Types
// ────────────────────────────────────────────────────────────────────────────
export const ASSESSMENT_TYPES = {
    MCQ: 'mcq',
    CODING: 'coding',
    MULTI_SECTION: 'multi-section',
    SPOKEN_ENGLISH: 'spoken-english',
};

// ────────────────────────────────────────────────────────────────────────────
// Access Control Module Types (kept for display labels)
// ────────────────────────────────────────────────────────────────────────────
export const ACCESS_CONTROL = {
    MODULE_TYPES: {
        FUNDAMENTALS: 'F',
        DSA: 'D',
        ADVANCED: 'T',
        PROJECTS: 'P',
        ASSESSMENTS: 'A',
        COMPANY: 'C',
        SPECIAL: 'S',
        MCQS: 'M'
    }
};

// ────────────────────────────────────────────────────────────────────────────
// FILE_TYPES kept for backward compat with any remaining legacy code that
// reads these constants. New code must NOT use these for GitHub fetches.
// ────────────────────────────────────────────────────────────────────────────
export const FILE_TYPES = {
    PROFILES: 'profiles',
    ACCESS: 'access',
    SCORES: 'scores',
    FULL_DB: 'fullDB'
};