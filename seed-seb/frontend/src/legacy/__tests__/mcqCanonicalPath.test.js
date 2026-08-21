/**
 * mcqCanonicalPath.test.js — MCQ canonical path regression tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted() is evaluated BEFORE vi.mock() factories run.
// Any variable that a vi.mock() factory needs must be declared here.
const { mockAuth, mockSetDoc, mockGetDoc } = vi.hoisted(() => {
    const mockAuth   = { currentUser: { uid: 'firebase_uid_abc123' } };
    const mockSetDoc = vi.fn().mockResolvedValue(undefined);
    const mockGetDoc = vi.fn();
    return { mockAuth, mockSetDoc, mockGetDoc };
});

vi.mock('../firebase-config', () => ({
    db:   {},
    auth: mockAuth,
}));

vi.mock('firebase/firestore', () => ({
    doc:             vi.fn((_db, path) => ({ path })),
    setDoc:          mockSetDoc,
    getDoc:          mockGetDoc,
    serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
    collection:      vi.fn(),
    getDocs:         vi.fn(),
    writeBatch:      vi.fn(),
}));


vi.mock('../services/timeService', () => ({
    default: {
        getNow: () => new Date(),
        now:    () => Date.now(),
        init:   () => Promise.resolve(),
    },
}));

vi.mock('../services/tenantResultsService', () => ({
    writeTenantResult:        vi.fn().mockResolvedValue(undefined),
    buildTenantResultPayload: vi.fn(() => ({})),
}));

vi.mock('../services/attemptStatusService', () => ({
    markAssessmentCompleted:   vi.fn().mockResolvedValue(true),
    invalidateCompletionCache: vi.fn(),
}));

// Import ONCE at module scope — after vi.mock() calls
import MCQService from '../services/mcqService';

function setAuthUid(uid) {
    mockAuth.currentUser = uid ? { uid } : null;
}

describe('MCQService — Canonical Path', () => {

    beforeEach(() => {
        mockSetDoc.mockClear();
        mockGetDoc.mockClear();
        setAuthUid('firebase_uid_abc123');
    });

    afterEach(() => {
        setAuthUid(null);
    });

    // ── Test 1: canonicalPath ─────────────────────────────────────────────────

    it('canonicalPath(assessmentId, userId, tenantId) produces correct Firestore path', () => {
        const path = MCQService.canonicalPath('test-001', 'firebase_uid_abc123', 'KGKITE');
        expect(path).toBe('assessmentResults/KGKITE/test-001/firebase_uid_abc123');
    });

    it('canonicalPath() NEVER uses email as userId', () => {
        const correctPath = MCQService.canonicalPath('test-001', 'firebase_uid_abc123', 'KGKITE');
        expect(correctPath).not.toContain('student@example.com');
        expect(correctPath).toContain('firebase_uid_abc123');
    });

    it('canonicalPath() throws when userId is missing', () => {
        expect(() => MCQService.canonicalPath('test-001', '', 'KGKITE')).toThrow();
        expect(() => MCQService.canonicalPath('test-001', null, 'KGKITE')).toThrow();
        expect(() => MCQService.canonicalPath('test-001', undefined, 'KGKITE')).toThrow();
    });

    it('canonicalPath() throws when assessmentId is missing', () => {
        expect(() => MCQService.canonicalPath('', 'firebase_uid_abc123', 'KGKITE')).toThrow();
        expect(() => MCQService.canonicalPath(null, 'firebase_uid_abc123', 'KGKITE')).toThrow();
    });

    // ── Test 2: saveProgressToFirestore ───────────────────────────────────────

    it('saveProgressToFirestore writes to UID-keyed canonical path, NOT college-keyed', async () => {
        setAuthUid('firebase_uid_abc123');
        mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });

        await MCQService.saveProgressToFirestore({
            email:          'student@example.com',
            college:        'KGKITE',
            year:           '2024',
            department:     'CSE',
            assessmentId:         'mcq-test-001',
            assessmentTitle:       'Test 1',
            score:          5,
            totalQuestions: 10,
            correctAnswers: 5,
            incorrectAnswers: 5,
            percentage:     50,
            timeTaken:      120,
            answers:        { 0: 1, 1: 2 },
        });

        expect(mockSetDoc).toHaveBeenCalledTimes(1);
        const writtenRef  = mockSetDoc.mock.calls[0][0];
        const writtenData = mockSetDoc.mock.calls[0][1];

        expect(writtenRef.path).toBe('assessmentResults/KGKITE/mcq-test-001/firebase_uid_abc123');
        expect(writtenRef.path).not.toContain('student@example.com');
        expect(writtenData.userId).toBe('firebase_uid_abc123');
        expect(writtenData.uid).toBe('firebase_uid_abc123');
    });

    it('saveProgressToFirestore throws when not authenticated (no Firebase UID)', async () => {
        setAuthUid(null);
        await expect(
            MCQService.saveProgressToFirestore({
                email: 'student@example.com', college: 'KGKITE',
                assessmentId: 'mcq-test-001', answers: {},
            })
        ).rejects.toThrow(/Firebase Auth UID/);
    });

    // ── Test 3: writeCanonicalResult ──────────────────────────────────────────

    it('writeCanonicalResult throws when Firebase Auth UID is not available', async () => {
        setAuthUid(null);
        await expect(
            MCQService.writeCanonicalResult(
                { score: 5 },
                { assessmentId: 'test-001', userId: '', userProfile: { email: 'x@y.com' } }
            )
        ).rejects.toThrow(/Firebase Auth UID/);
    });

    it('writeCanonicalResult writes single canonical document with correct UID and tenantId', async () => {
        setAuthUid('firebase_uid_abc123');
        mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });

        await MCQService.writeCanonicalResult(
            { score: 5, totalMarks: 10, tenantId: 'KGKITE' },
            { assessmentId: 'test-001', userId: 'firebase_uid_abc123', userProfile: { email: 'x@y.com', tenantId: 'KGKITE' } }
        );

        expect(mockSetDoc).toHaveBeenCalledTimes(1);
        const writtenRef = mockSetDoc.mock.calls[0][0];
        expect(writtenRef.path).toBe('assessmentResults/KGKITE/test-001/firebase_uid_abc123');
    });

    // ── Test 4: submitted doc is never overwritten ────────────────────────────

    it('saveProgressToFirestore skips write when document is already submitted', async () => {
        setAuthUid('firebase_uid_abc123');
        mockGetDoc.mockResolvedValue({
            exists: () => true,
            data:   () => ({ completed: true, submitted: true, status: 'submitted' }),
        });

        const result = await MCQService.saveProgressToFirestore({
            email: 'student@example.com', college: 'KGKITE',
            assessmentId: 'mcq-test-001', answers: {},
        });

        expect(mockSetDoc).not.toHaveBeenCalled();
        expect(result.skipped).toBe(true);
    });

    // ── Test 5: checkExistingAttempt ──────────────────────────────────────────

    it('checkExistingAttempt checks canonical UID path first', async () => {
        setAuthUid('firebase_uid_abc123');
        mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });

        // checkExistingAttempt has an early-return guard: if (!navigator.onLine) return offline.
        // In vitest's Node environment navigator.onLine is false by default — mock it.
        const origOnline = navigator.onLine;
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

        await MCQService.checkExistingAttempt('x@y.com', 'test-001', 'KGKITE', '2024', 'CSE');

        Object.defineProperty(navigator, 'onLine', { value: origOnline, writable: true, configurable: true });

        expect(mockGetDoc).toHaveBeenCalled();
        const firstCallRef = mockGetDoc.mock.calls[0][0];
        expect(firstCallRef.path).toBe('assessmentResults/KGKITE/test-001/firebase_uid_abc123');
    });


    // ── Test 6: Legacy v1 path is never written ───────────────────────────────

    it('legacy v1 path is never written to during progress sync or result save', async () => {
        setAuthUid('firebase_uid_abc123');
        mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });

        await MCQService.saveProgressToFirestore({
            email: 'x@y.com', college: 'KGKITE', year: '2024', department: 'CSE',
            assessmentId: 'test-001', answers: {},
        });

        for (const call of mockSetDoc.mock.calls) {
            expect(call[0].path).not.toMatch(/AssessmentResults/);
            expect(call[0].path).not.toMatch(/colleges\//);
        }
    });

    // ── Test 7: resultTransformer canonical fields ────────────────────────────

    it('buildUnifiedResultPayload produces canonical score fields', () => {
        setAuthUid('firebase_uid_abc123');

        const result = buildResultDoc({
            email:        'x@y.com',
            assessmentId: 'test-001',
            score:        5,
            totalMarks:   10,
        });

        // Canonical assessmentId and score fields
        expect(result.assessmentId).toBe('test-001');
        expect(result.totalScore).toBe(5);
        expect(result.maxScore).toBe(10);
        // userId and uid must exist as string fields
        expect(typeof result.userId).toBe('string');
        expect(typeof result.uid).toBe('string');
    });
});
