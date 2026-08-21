/**
 * codingEvalHiddenTests.test.js
 *
 * Tests for the Section 18 hidden-test guard in coding evaluation.
 *
 * Rules being tested:
 *   - Official scoring MUST use q.hiddenTests exclusively
 *   - q.sampleTests must NEVER silently substitute for hiddenTests in scoring
 *   - Absent or empty hiddenTests → { score: 0, invalidConfig: true, invalidReason: 'no_hidden_tests' }
 *   - Valid hiddenTests → scored normally
 */

import { describe, it, expect } from 'vitest';
import {
    validateHiddenTests,
    scoreCodingQuestion,
    invalidConfigScore,
} from '../utils/codingEvalUtils';

// ─────────────────────────────────────────────────────────────────────────────

describe('codingEvalUtils — Section 18 Hidden Test Guard', () => {

    // ── validateHiddenTests ───────────────────────────────────────────────────

    describe('validateHiddenTests', () => {
        it('returns valid:false when q.hiddenTests is undefined', () => {
            const result = validateHiddenTests({ id: 'Q1' });
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('no_hidden_tests');
        });

        it('returns valid:false when q.hiddenTests is null', () => {
            const result = validateHiddenTests({ id: 'Q1', hiddenTests: null });
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('no_hidden_tests');
        });

        it('returns valid:false when q.hiddenTests is an empty array', () => {
            const result = validateHiddenTests({ id: 'Q1', hiddenTests: [] });
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('no_hidden_tests');
        });

        it('returns valid:false even when q.sampleTests is populated (no fallback)', () => {
            const result = validateHiddenTests({
                id: 'Q1',
                hiddenTests: undefined,
                sampleTests: [{ input: '1', expected: '2' }],
            });
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('no_hidden_tests');
        });

        it('returns valid:true when hiddenTests has at least one entry', () => {
            const result = validateHiddenTests({
                id: 'Q1',
                hiddenTests: [{ input: '1', expected: '1' }],
            });
            expect(result.valid).toBe(true);
            expect(result.hidden).toHaveLength(1);
        });

        it('returns valid:true with multiple hidden test cases', () => {
            const result = validateHiddenTests({
                id: 'Q2',
                hiddenTests: [
                    { input: '2', expected: '4' },
                    { input: '3', expected: '9' },
                ],
            });
            expect(result.valid).toBe(true);
            expect(result.hidden).toHaveLength(2);
        });
    });

    // ── invalidConfigScore ────────────────────────────────────────────────────

    describe('invalidConfigScore', () => {
        it('always returns score: 0', () => {
            expect(invalidConfigScore({ id: 'Q1' }).score).toBe(0);
        });

        it('always returns percentage: 0', () => {
            expect(invalidConfigScore({ id: 'Q1' }).percentage).toBe(0);
        });

        it('sets invalidConfig: true', () => {
            expect(invalidConfigScore({ id: 'Q1' }).invalidConfig).toBe(true);
        });

        it('sets invalidReason to the provided reason', () => {
            expect(invalidConfigScore({ id: 'Q1' }, 'no_hidden_tests').invalidReason)
                .toBe('no_hidden_tests');
        });

        it('sets submitted: true', () => {
            expect(invalidConfigScore({ id: 'Q1' }).submitted).toBe(true);
        });
    });

    // ── scoreCodingQuestion ───────────────────────────────────────────────────

    describe('scoreCodingQuestion', () => {
        // Guard cases

        it('returns invalidConfig:true when hiddenTests is absent', () => {
            const result = scoreCodingQuestion({ id: 'Q1', weight: 20 }, 0);
            expect(result.invalidConfig).toBe(true);
            expect(result.score).toBe(0);
        });

        it('returns invalidConfig:true when hiddenTests is empty', () => {
            const result = scoreCodingQuestion({ id: 'Q1', hiddenTests: [], weight: 20 }, 0);
            expect(result.invalidConfig).toBe(true);
            expect(result.score).toBe(0);
        });

        it('does NOT use sampleTests as a fallback — returns invalidConfig:true', () => {
            const q = {
                id: 'Q1',
                hiddenTests: undefined,
                sampleTests: [{ input: '1', expected: '1' }],
                weight: 20,
            };
            const result = scoreCodingQuestion(q, 1);
            expect(result.invalidConfig).toBe(true);
            expect(result.score).toBe(0);
            // Must not reference sampleTests in score computation
            expect(result.total).toBe(0);
        });

        // Scoring cases

        it('scores 0 when passes=0 (all hidden tests failed)', () => {
            const q = {
                id: 'Q1',
                hiddenTests: [
                    { input: '1', expected: '1' },
                    { input: '2', expected: '4' },
                ],
                weight: 20,
            };
            const result = scoreCodingQuestion(q, 0);
            expect(result.invalidConfig).toBeUndefined();
            expect(result.score).toBe(0);
            expect(result.percentage).toBe(0);
            expect(result.passed).toBe(0);
            expect(result.total).toBe(2);
        });

        it('scores partial when some tests pass', () => {
            const q = {
                id: 'Q1',
                hiddenTests: [
                    { input: '1', expected: '1' },
                    { input: '2', expected: '4' },
                ],
                weight: 20,
            };
            const result = scoreCodingQuestion(q, 1);
            expect(result.score).toBeCloseTo(10);      // 1/2 * 20 = 10
            expect(result.percentage).toBe(50);
            expect(result.passed).toBe(1);
            expect(result.total).toBe(2);
            expect(result.invalidConfig).toBeUndefined();
        });

        it('scores full weight when all tests pass', () => {
            const q = {
                id: 'Q1',
                hiddenTests: [
                    { input: '1', expected: '1' },
                    { input: '2', expected: '4' },
                    { input: '3', expected: '9' },
                ],
                weight: 30,
            };
            const result = scoreCodingQuestion(q, 3);
            expect(result.score).toBeCloseTo(30);
            expect(result.percentage).toBe(100);
            expect(result.passed).toBe(3);
            expect(result.total).toBe(3);
        });

        it('defaults weight to 20 when not specified', () => {
            const q = {
                id: 'Q1',
                hiddenTests: [{ input: '1', expected: '1' }],
                // no weight field
            };
            const result = scoreCodingQuestion(q, 1);
            expect(result.score).toBeCloseTo(20);
        });

        it('sets submitted:true on all valid results', () => {
            const q = {
                id: 'Q1',
                hiddenTests: [{ input: '1', expected: '1' }],
                weight: 10,
            };
            expect(scoreCodingQuestion(q, 0).submitted).toBe(true);
            expect(scoreCodingQuestion(q, 1).submitted).toBe(true);
        });
    });

    // ── Integration-style: simulate the scoring loop ──────────────────────────

    describe('scoring loop simulation', () => {
        it('rejects all questions with missing hiddenTests — total earned = 0', () => {
            const questions = [
                { id: 'Q1', hiddenTests: undefined, weight: 20 },
                { id: 'Q2', hiddenTests: [],         weight: 20 },
                { id: 'Q3', sampleTests: [{}],        weight: 20 }, // sampleTests only
            ];

            let totalMaxWeight   = 0;
            let totalEarnedWeight = 0;

            for (const q of questions) {
                totalMaxWeight += (q.weight || 20);
                // Simulate the Section 18-guarded scoring loop
                const hidden = Array.isArray(q.hiddenTests) ? q.hiddenTests : [];
                let score;
                if (hidden.length === 0) {
                    score = invalidConfigScore(q);
                } else {
                    score = scoreCodingQuestion(q, 0); // pretend all fail
                }
                totalEarnedWeight += score.score;
            }

            expect(totalEarnedWeight).toBe(0);
            expect(totalMaxWeight).toBe(60);
        });

        it('correctly totals mixed valid/invalid questions', () => {
            const questions = [
                { id: 'Q1', hiddenTests: [{ input: '1', expected: '1' }], weight: 20 }, // valid, 1/1 passes
                { id: 'Q2', hiddenTests: undefined,                        weight: 20 }, // invalid
                { id: 'Q3', hiddenTests: [{ input: '2', expected: '4' }, { input: '3', expected: '9' }], weight: 20 }, // valid, 1/2 passes
            ];

            const passMap = { Q1: 1, Q2: 0, Q3: 1 };
            let totalEarnedWeight = 0;

            for (const q of questions) {
                const hidden = Array.isArray(q.hiddenTests) ? q.hiddenTests : [];
                if (hidden.length === 0) {
                    totalEarnedWeight += 0; // invalidConfig → 0
                } else {
                    const result = scoreCodingQuestion(q, passMap[q.id]);
                    totalEarnedWeight += result.score;
                }
            }

            // Q1: 1/1 * 20 = 20
            // Q2: 0 (invalid)
            // Q3: 1/2 * 20 = 10
            expect(totalEarnedWeight).toBeCloseTo(30);
        });
    });
});
