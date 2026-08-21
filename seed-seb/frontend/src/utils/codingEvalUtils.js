/**
 * codingEvalUtils.js
 *
 * Pure functions for coding question evaluation logic.
 * Extracted from CodingAssessmentPage.jsx for testability.
 *
 * SECTION 18 RULE:
 *   Official scoring MUST use `q.hiddenTests` exclusively.
 *   `q.sampleTests` MUST NEVER silently substitute for hidden tests in scoring.
 *   If `hiddenTests` is absent or empty → invalidConfig: true, score: 0.
 */

/**
 * Validate that a coding question has usable hidden tests for scoring.
 *
 * @param {object} q — Coding question object from CDN payload
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateHiddenTests(q) {
    const hidden = Array.isArray(q?.hiddenTests) ? q.hiddenTests : [];
    if (hidden.length === 0) {
        return {
            valid: false,
            reason: 'no_hidden_tests',
            message: `Question ${q?.id ?? ''} has no hiddenTests. ` +
                     'Scoring is invalid. sampleTests must NOT be used as a fallback.',
        };
    }
    return { valid: true, hidden };
}

/**
 * Produce an invalid-config score record for a question that cannot be scored.
 *
 * @param {object} q — Coding question object
 * @param {string} reason — Why scoring failed
 * @returns {{ score: number, percentage: number, passed: number, total: number, submitted: boolean, invalidConfig: boolean, invalidReason: string }}
 */
export function invalidConfigScore(q, reason = 'no_hidden_tests') {
    return {
        score: 0,
        percentage: 0,
        passed: 0,
        total: 0,
        submitted: true,
        invalidConfig: true,
        invalidReason: reason,
    };
}

/**
 * Compute the score for a coding question given its hidden test results.
 *
 * @param {object}  q       — Coding question (must have `hiddenTests` array and optional `weight`)
 * @param {number}  passes  — Number of hidden tests that passed
 * @returns {{ score: number, percentage: number, passed: number, total: number, submitted: boolean, invalidConfig?: boolean }}
 */
export function scoreCodingQuestion(q, passes) {
    const validation = validateHiddenTests(q);

    if (!validation.valid) {
        // SECTION 18: never substitute sampleTests
        console.error(`[CodingEval] ${validation.message}`);
        return invalidConfigScore(q, validation.reason);
    }

    const hidden = validation.hidden;
    const weight = typeof q.weight === 'number' ? q.weight : 20;

    const score      = passes > 0 ? (passes / hidden.length) * weight : 0;
    const percentage = Math.round((passes / hidden.length) * 100);

    return {
        score,
        percentage,
        passed: passes,
        total:  hidden.length,
        submitted: true,
    };
}
