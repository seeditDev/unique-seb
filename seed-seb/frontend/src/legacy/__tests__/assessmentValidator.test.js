/**
 * assessmentValidator.test.js
 *
 * Unit tests for assessmentValidator.js
 *
 * Tests:
 *   1. validateTestDoc: missing fields → invalid
 *   2. validateAssessmentPayload: matching assessmentId → valid
 *   3. validateAssessmentPayload: MISMATCHED assessmentId → WRONG_ASSESSMENT error (Scenario 5)
 *   4. validateAssessmentPayload: missing questions for MCQ → invalid
 *   5. validateAssessmentPayload: expired schedule → SCHEDULE_EXPIRED error (Scenario 8)
 *   6. validateAssessmentPayload: not-yet-started → SCHEDULE_NOT_STARTED error
 *   7. validateStudentTestAccess: test not in allowedModules → blocked (Scenario 6)
 *   8. validateStudentTestAccess: test in allowedModules → allowed
 *   9. validateStudentTestAccess: schedule expired → blocked
 */

import { describe, it, expect } from 'vitest';
import {
    validateTestDoc,
    validateAssessmentPayload,
    validateStudentTestAccess,
} from '../utils/assessmentValidator';


// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const validTestDoc = {
    id:               'test-doc-001',
    assessmentId:     'assessment-A',
    cdnUrl:           'https://cdn.seed.example.com/assessment-A.json',
    duration_minutes: 60,
    type:             'mcq',
    totalMarks:       20,
};

const validMcqPayload = {
    assessmentId: 'assessment-A',
    type:         'mcq',
    questions:    [
        { question: 'Q1', options: ['a', 'b', 'c', 'd'], correctAnswer: 'a' },
    ],
};


// ─────────────────────────────────────────────────────────────────────────────
// validateTestDoc
// ─────────────────────────────────────────────────────────────────────────────

describe('validateTestDoc', () => {
    it('returns valid for a complete TestDoc', () => {
        const result = validateTestDoc(validTestDoc);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('returns invalid when testDoc is null', () => {
        const result = validateTestDoc(null);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns invalid when assessmentId is missing', () => {
        const { assessmentId: _, ...doc } = validTestDoc;
        const result = validateTestDoc(doc);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('assessmentId'))).toBe(true);
    });

    it('returns invalid when cdnUrl is missing', () => {
        const { cdnUrl: _, ...doc } = validTestDoc;
        const result = validateTestDoc(doc);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('cdnUrl'))).toBe(true);
    });

    it('returns invalid when duration_minutes is 0 or negative', () => {
        const result = validateTestDoc({ ...validTestDoc, duration_minutes: 0 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('duration'))).toBe(true);
    });

    it('returns invalid when type is unrecognised', () => {
        const result = validateTestDoc({ ...validTestDoc, type: 'unknown-type' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('type'))).toBe(true);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// validateAssessmentPayload
// ─────────────────────────────────────────────────────────────────────────────

describe('validateAssessmentPayload', () => {

    // ── Test 1: matching assessmentId → valid ─────────────────────────────────
    it('returns valid when testDoc.assessmentId matches payload.assessmentId', () => {
        const result = validateAssessmentPayload(validTestDoc, validMcqPayload);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    // ── Test 2: SCENARIO 5 — mismatched assessmentId ─────────────────────────
    it('SCENARIO 5: returns WRONG_ASSESSMENT error when assessmentIds do not match', () => {
        const mismatchedPayload = {
            assessmentId: 'assessment-B', // different from testDoc.assessmentId = 'assessment-A'
            type:         'mcq',
            questions:    [{ question: 'Q1', options: ['a', 'b'], correctAnswer: 'a' }],
        };

        const result = validateAssessmentPayload(validTestDoc, mismatchedPayload);

        expect(result.valid).toBe(false);
        expect(result.configurationError).toBe(true);
        expect(result.errors.some(e => e.includes('WRONG_ASSESSMENT'))).toBe(true);
        expect(result.errors.some(e => e.includes('assessment-A'))).toBe(true);
        expect(result.errors.some(e => e.includes('assessment-B'))).toBe(true);
    });

    // ── Test 3: missing questions for MCQ ─────────────────────────────────────
    it('returns invalid for MCQ payload with empty questions array', () => {
        const emptyQPayload = { ...validMcqPayload, questions: [] };
        const result = validateAssessmentPayload(validTestDoc, emptyQPayload);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('questions'))).toBe(true);
    });

    it('returns invalid for MCQ payload with no questions field', () => {
        const { questions: _, ...noQPayload } = validMcqPayload;
        const result = validateAssessmentPayload(validTestDoc, noQPayload);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('questions'))).toBe(true);
    });

    // ── Test 4: null payload ──────────────────────────────────────────────────
    it('returns invalid when payload is null', () => {
        const result = validateAssessmentPayload(validTestDoc, null);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    // ── Test 5: SCENARIO 8 — expired schedule ────────────────────────────────
    it('SCENARIO 8: returns SCHEDULE_EXPIRED when schedule.end is in the past', () => {
        const expiredDoc = {
            ...validTestDoc,
            schedule: {
                start:     '2024-01-01T00:00:00Z',
                end:       '2024-01-02T00:00:00Z', // definitely in the past
                autoClose: true,
            },
        };

        const result = validateAssessmentPayload(expiredDoc, validMcqPayload);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('SCHEDULE_EXPIRED'))).toBe(true);
    });

    // ── Test 6: schedule not started yet ─────────────────────────────────────
    it('returns SCHEDULE_NOT_STARTED when schedule.start is in the future', () => {
        const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // tomorrow
        const futureDoc = {
            ...validTestDoc,
            schedule: {
                start:     futureStart,
                end:       null,
                autoClose: false,
            },
        };

        const result = validateAssessmentPayload(futureDoc, validMcqPayload);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('SCHEDULE_NOT_STARTED'))).toBe(true);
    });

    // ── Test 7: no schedule → no schedule error ───────────────────────────────
    it('passes schedule check when no schedule is set', () => {
        const noScheduleDoc = { ...validTestDoc, schedule: null };
        const result = validateAssessmentPayload(noScheduleDoc, validMcqPayload);
        expect(result.valid).toBe(true);
    });

    // ── Test 8: missing testDoc.assessmentId ─────────────────────────────────
    it('returns configurationError when testDoc.assessmentId is missing', () => {
        const { assessmentId: _, ...docNoId } = validTestDoc;
        const result = validateAssessmentPayload(docNoId, validMcqPayload);
        expect(result.valid).toBe(false);
        expect(result.configurationError).toBe(true);
    });

    // ── Test 9: payload without assessmentId → warning only ─────────────────
    it('emits a warning (not an error) when payload has no assessmentId', () => {
        const { assessmentId: _, ...payloadNoId } = validMcqPayload;
        const result = validateAssessmentPayload(validTestDoc, payloadNoId);
        // Should not block (warning is forgiving for older payload formats)
        expect(result.errors.some(e => e.includes('WRONG_ASSESSMENT'))).toBe(false);
        expect(result.warnings.some(w => w.includes('assessmentId'))).toBe(true);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// validateStudentTestAccess
// ─────────────────────────────────────────────────────────────────────────────

describe('validateStudentTestAccess', () => {
    const allowedModules = [
        'course-1::series-1::test-001',
        'course-1::series-1::test-002',
    ];

    // ── Test 1: SCENARIO 6 — test not in allowedModules ─────────────────────
    it('SCENARIO 6: blocks access when test is not in allowedModules', () => {
        const result = validateStudentTestAccess(
            'test-999',           // not assigned
            'course-1',
            'series-1',
            allowedModules,
            null
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeTruthy();
    });

    // ── Test 2: test is in allowedModules → allowed ──────────────────────────
    it('allows access when test is in allowedModules', () => {
        const result = validateStudentTestAccess(
            'test-001',
            'course-1',
            'series-1',
            allowedModules,
            null
        );
        expect(result.allowed).toBe(true);
    });

    // ── Test 3: empty allowedModules → always blocked ────────────────────────
    it('blocks access when allowedModules is empty', () => {
        const result = validateStudentTestAccess('test-001', 'course-1', 'series-1', [], null);
        expect(result.allowed).toBe(false);
    });

    // ── Test 4: expired schedule → blocked even if in allowedModules ─────────
    it('blocks access when schedule has expired', () => {
        const result = validateStudentTestAccess(
            'test-001',
            'course-1',
            'series-1',
            allowedModules,
            { start: '2024-01-01T00:00:00Z', end: '2024-01-02T00:00:00Z' }
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('expired');
    });

    // ── Test 5: active schedule → allowed ────────────────────────────────────
    it('allows access when schedule is active (now is between start and end)', () => {
        const start = new Date(Date.now() - 60 * 60 * 1000).toISOString();  // 1 hour ago
        const end   = new Date(Date.now() + 60 * 60 * 1000).toISOString();  // 1 hour from now
        const result = validateStudentTestAccess(
            'test-001',
            'course-1',
            'series-1',
            allowedModules,
            { start, end }
        );
        expect(result.allowed).toBe(true);
    });
});
