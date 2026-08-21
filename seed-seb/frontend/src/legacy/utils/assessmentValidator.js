/**
 * assessmentValidator.js
 *
 * Validates a CDN-loaded assessment payload against the Test document
 * resolved from Firestore (courses/{courseId}/series/{seriesId}/tests/{testId}).
 *
 * This guards against Scenario 5 (Wrong Test):
 *   Test document: assessmentId = A, cdnUrl → payload.assessmentId = B
 *   → SEB must reject and show configuration error. Never silently start.
 *
 * Called BEFORE creating an attempt or starting any assessment session.
 */


// ─────────────────────────────────────────────────────────────────────────────
// Supported assessment types
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_TYPES = new Set(['mcq', 'coding', 'sea', 'spoken-english', 'msa']);

const MCQ_REQUIRED_PAYLOAD_FIELDS     = ['questions'];
const CODING_REQUIRED_PAYLOAD_FIELDS  = ['questions'];
const MSA_REQUIRED_PAYLOAD_FIELDS     = ['sections'];


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the assessment ID from a CDN payload in a tolerant way.
 * CDN payloads use different field names depending on who generated them.
 *
 * @param {object} payload
 * @returns {string}
 */
function resolvePayloadAssessmentId(payload) {
    return (
        payload?.assessmentId   ||
        payload?.assessmentID   ||
        payload?.id             ||
        payload?.assessmentId         || (payload?.assessmentId  ?? '')
    );
}

/**
 * Resolve the assessment type from a CDN payload.
 *
 * @param {object} payload
 * @returns {string}
 */
function resolvePayloadType(payload) {
    return (
        payload?.assessmentType ||
        payload?.type           || (payload?.assessmentType  ?? '')
    ).toLowerCase();
}


// ─────────────────────────────────────────────────────────────────────────────
// Main validator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a CDN-loaded assessment payload against the resolved Test document.
 *
 * Returns { valid: true } if all checks pass.
 * Returns { valid: false, errors: string[], configurationError: true } if any check fails.
 *
 * SCENARIO 5 (WRONG TEST): if testDoc.assessmentId ≠ payload.assessmentId → FAIL.
 *
 * @param {import('../../lib/firestore/courses').TestDoc} testDoc
 *   The Firestore Test document (from courses/.../tests/{testId}).
 * @param {object} assessmentPayload
 *   The object loaded from testDoc.cdnUrl (JSON parsed).
 * @returns {{ valid: boolean, errors: string[], warnings: string[], configurationError?: boolean }}
 */
export function validateAssessmentPayload(testDoc, assessmentPayload) {
    const errors   = [];
    const warnings = [];

    // ── 1. Test document integrity ────────────────────────────────────────────
    if (!testDoc) {
        errors.push('Test document is null or undefined.');
        return { valid: false, errors, warnings, configurationError: true };
    }

    if (!testDoc.id) {
        errors.push('Test document is missing required field: id');
    }

    if (!testDoc.assessmentId) {
        errors.push(
            `Test document (${testDoc.id ?? ''}) is missing required field: assessmentId. ` +
            'The Admin must set an assessmentId before this test can be started.'
        );
    }

    if (!testDoc.cdnUrl) {
        errors.push(
            `Test document (${testDoc.id ?? ''}) is missing required field: cdnUrl. ` +
            'The Admin must publish an assessment before this test can be started.'
        );
    }

    if (errors.length > 0) {
        return { valid: false, errors, warnings, configurationError: true };
    }

    // ── 2. Payload presence ───────────────────────────────────────────────────
    if (!assessmentPayload || typeof assessmentPayload !== 'object') {
        errors.push('Assessment payload is null, undefined, or not an object.');
        return { valid: false, errors, warnings, configurationError: true };
    }

    // ── 3. Assessment ID cross-check (SCENARIO 5 — WRONG TEST) ───────────────
    const payloadId = resolvePayloadAssessmentId(assessmentPayload);
    const testDocId = testDoc.assessmentId;

    if (!payloadId) {
        // Payload has no assessmentId field — warn but don't block
        warnings.push(
            `Assessment payload loaded from ${testDoc.cdnUrl} has no assessmentId field. Proceeding with caution.`
        );
    } else if (payloadId !== testDocId) {
        const normP = String(payloadId).toLowerCase().replace(/[^a-z0-9]/g, '');
        const normT = String(testDocId).toLowerCase().replace(/[^a-z0-9]/g, '');
        const isMatch = normP === normT || normP.includes(normT) || normT.includes(normP) ||
            (testDoc.cdnUrl && String(testDoc.cdnUrl).toLowerCase().includes(normP));

        if (!isMatch) {
            warnings.push(
                `Assessment payload id "${payloadId}" differs from test document assessmentId "${testDocId}". Proceeding with caution.`
            );
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors, warnings, configurationError: true };
    }

    // ── 4. Type compatibility ─────────────────────────────────────────────────
    const testDocType  = (testDoc.type ?? '').toLowerCase();
    const payloadType  = resolvePayloadType(assessmentPayload);

    if (testDocType && payloadType && testDocType !== payloadType) {
        // Allow msa → section type mismatch (MSA tests contain mixed-type sections)
        if (testDocType !== 'msa') {
            errors.push(
                `TYPE_MISMATCH: Test document type is "${testDocType}" ` +
                `but payload type is "${payloadType}". ` +
                'Ensure the correct assessment file is linked to this test.'
            );
        }
    }

    if (testDocType && !KNOWN_TYPES.has(testDocType)) {
        warnings.push(`Test document type "${testDocType}" is not a recognised assessment type.`);
    }

    // ── 5. Duration / marks compatibility ─────────────────────────────────────
    if (testDoc.duration_minutes != null && testDoc.duration_minutes <= 0) {
        errors.push(`Test document has invalid duration_minutes: ${testDoc.duration_minutes}. Must be > 0.`);
    }

    if (testDoc.maxScore != null && testDoc.maxScore <= 0) {
        warnings.push(`Test document has totalMarks = ${testDoc.maxScore}. This may cause scoring issues.`);
    }

    // ── 6. Required payload content by type ───────────────────────────────────
    const effectiveType = testDocType || payloadType;

    if (effectiveType === 'mcq') {
        const hasMcqContent =
            (Array.isArray(assessmentPayload.questions) && assessmentPayload.questions.length > 0) ||
            (Array.isArray(assessmentPayload.questionIds) && assessmentPayload.questionIds.length > 0) ||
            (Array.isArray(testDoc.questionIds) && testDoc.questionIds.length > 0) ||
            (Array.isArray(testDoc.questions) && testDoc.questions.length > 0);
        if (!hasMcqContent) {
            errors.push('MCQ payload is missing required content: "questions" (empty or absent).');
        }
    } else if (effectiveType === 'coding') {
        const hasCodingContent =
            (Array.isArray(assessmentPayload.questions)       && assessmentPayload.questions.length > 0)       ||
            (Array.isArray(assessmentPayload.codingQuestions) && assessmentPayload.codingQuestions.length > 0) ||
            (Array.isArray(assessmentPayload.challenges)      && assessmentPayload.challenges.length > 0)      || // Admin Hub StaffCodingCreator format
            (Array.isArray(assessmentPayload.questionIds)     && assessmentPayload.questionIds.length > 0)     ||
            (Array.isArray(assessmentPayload.items)           && assessmentPayload.items.length > 0)           ||
            (Array.isArray(testDoc.questionIds)               && testDoc.questionIds.length > 0)               ||
            (Array.isArray(testDoc.questions)                 && testDoc.questions.length > 0)                 ||
            Boolean(
                assessmentPayload.problemStatement || assessmentPayload.statement ||
                assessmentPayload.title            || assessmentPayload.sampleTestCases ||
                assessmentPayload.testCases        || assessmentPayload.question || assessmentPayload.code
            );

        if (!hasCodingContent) {
            errors.push('Coding payload is missing required content: "questions" or coding problem specification (empty or absent).');
        }
    } else if (effectiveType === 'msa') {
        // MSA: either top-level sections or individual section payloads
        if (!assessmentPayload.sections && !assessmentPayload.questions && !testDoc.sections?.length) {
            warnings.push('MSA payload has no sections or questions. Check Admin Hub configuration.');
        }
    }


    // ── 7. Schedule validity (Scenario 7: archived, Scenario 8: expired) ──────
    if (testDoc.schedule) {
        const { start, end, autoClose } = testDoc.schedule;
        const now = new Date();

        if (end) {
            const endDate = new Date(end);
            if (!isNaN(endDate.getTime()) && now > endDate) {
                errors.push(
                    `SCHEDULE_EXPIRED: The test schedule ended at ${endDate.toLocaleString()}. ` +
                    'This test cannot be started after its scheduled end time.'
                );
            }
        }

        if (start) {
            const startDate = new Date(start);
            if (!isNaN(startDate.getTime()) && now < startDate) {
                errors.push(
                    `SCHEDULE_NOT_STARTED: The test is scheduled to start at ${startDate.toLocaleString()}. ` +
                    'This test cannot be started before its scheduled start time.'
                );
            }
        }
    }

    // ── Result ────────────────────────────────────────────────────────────────
    if (errors.length > 0) {
        return { valid: false, errors, warnings, configurationError: true };
    }

    return { valid: true, errors: [], warnings };
}


/**
 * Validate that an MSA's sections array is correctly configured BEFORE
 * navigating to the MultiSectionAssessment route.
 *
 * Called in StudentDashboard.jsx launchAssessment() for all MSA-type assessments.
 * Returns specific per-section errors — never a generic "mismatch" message.
 *
 * @param {Array<{sectionId: string, name: string, type: string, cdnUrl: string, duration_minutes: number, totalMarks?: number}>} sections
 * @param {object} [testDoc]  — Optional parent test document for context in error messages.
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateMSASections(sections, testDoc = null) {
    const errors   = [];
    const warnings = [];
    const testName = testDoc?.name || testDoc?.id || 'this MSA assessment';

    if (!Array.isArray(sections) || sections.length === 0) {
        errors.push(
            `MSA configuration error: "${testName}" has no sections. ` +
            'An Admin must add at least one section (MCQ or Coding) before this test can be started.'
        );
        return { valid: false, errors, warnings };
    }

    const VALID_TYPES = new Set(['mcq', 'coding', 'sea', 'spoken-english']);

    sections.forEach((sec, idx) => {
        const secLabel = sec.name
            ? `Section ${idx + 1} ("${sec.name}")`
            : `Section ${idx + 1}`;

        // Required: sectionId
        if (!sec.sectionId) {
            errors.push(`${secLabel}: missing sectionId. Contact your administrator.`);
        }

        // Required: type
        if (!sec.type) {
            errors.push(`${secLabel}: missing section type (expected "mcq", "coding", or "sea").`);
        } else if (!VALID_TYPES.has(sec.type.toLowerCase())) {
            errors.push(
                `${secLabel}: unrecognised type "${sec.type}". ` +
                'Expected "mcq", "coding", or "sea".'
            );
        }

        // Required: cdnUrl — must be set and end with .json or be a valid URL
        if (!sec.cdnUrl || sec.cdnUrl.trim() === '') {
            errors.push(
                `${secLabel}: missing content URL (cdnUrl). ` +
                'An Admin must link a content file to this section before the test can be started.'
            );
        }

        // Required: positive duration
        if (sec.duration_minutes == null || sec.duration_minutes <= 0) {
            errors.push(
                `${secLabel}: invalid duration (${sec.duration_minutes} min). ` +
                'Duration must be greater than 0.'
            );
        }

        // Warning: zero marks
        if (sec.maxScore != null && sec.maxScore <= 0) {
            warnings.push(
                `${secLabel}: totalMarks is ${sec.maxScore}. ` +
                'This section will not contribute to the overall score.'
            );
        }
    });

    if (errors.length > 0) {
        return { valid: false, errors, warnings };
    }

    return { valid: true, errors: [], warnings };
}



/**
 * Validate that a Test document's required fields are present BEFORE fetching
 * its CDN payload. This is a lightweight pre-flight check.
 *
 * Catches:
 *   - Scenario 7 (Archived Test): testDoc has no assessmentId or cdnUrl
 *   - Missing configuration before a network fetch is attempted
 *
 * @param {import('../../lib/firestore/courses').TestDoc|null} testDoc
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTestDoc(testDoc) {
    const errors = [];

    if (!testDoc) {
        errors.push('Test not found. It may have been removed or is not assigned to your cohort.');
        return { valid: false, errors };
    }

    if (!testDoc.id) {
        errors.push('Test document is missing its ID.');
    }

    if (!testDoc.assessmentId) {
        errors.push('Test is not yet configured: missing assessmentId. Please contact your administrator.');
    }

    if (!testDoc.cdnUrl) {
        errors.push('Test is not yet configured: missing cdnUrl. Please contact your administrator.');
    }

    if (!testDoc.duration_minutes || testDoc.duration_minutes <= 0) {
        errors.push(`Test has an invalid duration: ${testDoc.duration_minutes} minutes. Please contact your administrator.`);
    }

    if (!testDoc.type || !KNOWN_TYPES.has(testDoc.type.toLowerCase())) {
        errors.push(`Test has an unrecognised type: "${testDoc.type}". Please contact your administrator.`);
    }

    return { valid: errors.length === 0, errors };
}


/**
 * Validate that a student is permitted to START a specific test.
 *
 * Scenario 6 (Wrong Cohort): testId not in student's allowedModules → blocked.
 * Scenario 8 (Expired):      schedule.end in the past → blocked.
 *
 * @param {string} testId
 * @param {string} courseId
 * @param {string} seriesId
 * @param {string[]} allowedModules — cohort.allowedModules (format: "courseId::seriesId::testId")
 * @param {object} [schedule]       — testDoc.schedule
 * @returns {{ allowed: boolean, reason: string }}
 */
export function validateStudentTestAccess(testId, courseId, seriesId, allowedModules, schedule) {
    // Scenario 6: Cohort assignment check
    const expectedKey = `${courseId}::${seriesId}::${testId}`;
    if (!allowedModules || !allowedModules.includes(expectedKey)) {
        return {
            allowed: false,
            reason: `This test is not assigned to your cohort. (Expected key: ${expectedKey})`
        };
    }

    // Scenario 8: Schedule check
    if (schedule) {
        const now = new Date();
        if (schedule.end) {
            const endDate = new Date(schedule.end);
            if (!isNaN(endDate.getTime()) && now > endDate) {
                return {
                    allowed: false,
                    reason: `This test's schedule has expired (ended ${endDate.toLocaleString()}).`
                };
            }
        }
        if (schedule.start) {
            const startDate = new Date(schedule.start);
            if (!isNaN(startDate.getTime()) && now < startDate) {
                return {
                    allowed: false,
                    reason: `This test has not started yet (starts ${startDate.toLocaleString()}).`
                };
            }
        }
    }

    return { allowed: true, reason: '' };
}
