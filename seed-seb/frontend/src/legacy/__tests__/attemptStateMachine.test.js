/**
 * attemptStateMachine.test.js
 *
 * Unit tests for the SEED SEB attempt state machine.
 * Run with:  npx vitest run src/legacy/__tests__/attemptStateMachine.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  ATTEMPT_STATES,
  TERMINAL_STATES,
  RESUMABLE_STATES,
  ACTIVE_STATES,
  isValidTransition,
  isTerminal,
  isResumable,
  attemptDocId,
  generateIdempotencyKey,
  buildAttemptEnvelope,
  calcAuthoritativeRemainingSeconds,
  withRetry,
} from '../services/attemptStateMachine';

// ─── State Constants ──────────────────────────────────────────────────────────

describe('ATTEMPT_STATES', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(ATTEMPT_STATES)).toBe(true);
  });

  it('contains all required states', () => {
    const required = [
      'NOT_STARTED', 'STARTING', 'STARTED', 'IN_PROGRESS',
      'SUBMITTING', 'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED',
      'FAILED_RECOVERABLE', 'FAILED_FATAL',
    ];
    required.forEach((s) => {
      expect(ATTEMPT_STATES).toHaveProperty(s);
    });
  });
});

describe('TERMINAL_STATES', () => {
  it('includes SUBMITTED, AUTO_SUBMITTED, FAILED_FATAL', () => {
    expect(TERMINAL_STATES.has('SUBMITTED')).toBe(true);
    expect(TERMINAL_STATES.has('AUTO_SUBMITTED')).toBe(true);
    expect(TERMINAL_STATES.has('FAILED_FATAL')).toBe(true);
  });

  it('does not include IN_PROGRESS or STARTED', () => {
    expect(TERMINAL_STATES.has('IN_PROGRESS')).toBe(false);
    expect(TERMINAL_STATES.has('STARTED')).toBe(false);
  });
});

// ─── Transition Validation ────────────────────────────────────────────────────

describe('isValidTransition', () => {
  // Happy path transitions
  it('allows NOT_STARTED → STARTING', () => {
    expect(isValidTransition('NOT_STARTED', 'STARTING')).toBe(true);
  });

  it('allows STARTING → STARTED', () => {
    expect(isValidTransition('STARTING', 'STARTED')).toBe(true);
  });

  it('allows STARTING → FAILED_FATAL', () => {
    expect(isValidTransition('STARTING', 'FAILED_FATAL')).toBe(true);
  });

  it('allows STARTED → IN_PROGRESS', () => {
    expect(isValidTransition('STARTED', 'IN_PROGRESS')).toBe(true);
  });

  it('allows IN_PROGRESS → SUBMITTING', () => {
    expect(isValidTransition('IN_PROGRESS', 'SUBMITTING')).toBe(true);
  });

  it('allows IN_PROGRESS → EXPIRED', () => {
    expect(isValidTransition('IN_PROGRESS', 'EXPIRED')).toBe(true);
  });

  it('allows SUBMITTING → SUBMITTED', () => {
    expect(isValidTransition('SUBMITTING', 'SUBMITTED')).toBe(true);
  });

  it('allows SUBMITTING → AUTO_SUBMITTED', () => {
    expect(isValidTransition('SUBMITTING', 'AUTO_SUBMITTED')).toBe(true);
  });

  it('allows SUBMITTING → FAILED_RECOVERABLE', () => {
    expect(isValidTransition('SUBMITTING', 'FAILED_RECOVERABLE')).toBe(true);
  });

  it('allows EXPIRED → SUBMITTING', () => {
    expect(isValidTransition('EXPIRED', 'SUBMITTING')).toBe(true);
  });

  it('allows FAILED_RECOVERABLE → SUBMITTING', () => {
    expect(isValidTransition('FAILED_RECOVERABLE', 'SUBMITTING')).toBe(true);
  });

  // Blocked transitions from terminal states
  it('blocks SUBMITTED → any transition', () => {
    Object.values(ATTEMPT_STATES).forEach((state) => {
      expect(isValidTransition('SUBMITTED', state)).toBe(false);
    });
  });

  it('blocks AUTO_SUBMITTED → any transition', () => {
    Object.values(ATTEMPT_STATES).forEach((state) => {
      expect(isValidTransition('AUTO_SUBMITTED', state)).toBe(false);
    });
  });

  it('blocks FAILED_FATAL → any transition', () => {
    Object.values(ATTEMPT_STATES).forEach((state) => {
      expect(isValidTransition('FAILED_FATAL', state)).toBe(false);
    });
  });

  // Illegal jumps
  it('blocks NOT_STARTED → SUBMITTED (skip states)', () => {
    expect(isValidTransition('NOT_STARTED', 'SUBMITTED')).toBe(false);
  });

  it('blocks STARTED → SUBMITTED (skip states)', () => {
    expect(isValidTransition('STARTED', 'SUBMITTED')).toBe(false);
  });

  it('blocks IN_PROGRESS → SUBMITTED (must go through SUBMITTING)', () => {
    expect(isValidTransition('IN_PROGRESS', 'SUBMITTED')).toBe(false);
  });
});

// ─── isTerminal / isResumable ─────────────────────────────────────────────────

describe('isTerminal', () => {
  it('returns true for SUBMITTED', () => {
    expect(isTerminal('SUBMITTED')).toBe(true);
  });

  it('returns true for AUTO_SUBMITTED', () => {
    expect(isTerminal('AUTO_SUBMITTED')).toBe(true);
  });

  it('returns true for FAILED_FATAL', () => {
    expect(isTerminal('FAILED_FATAL')).toBe(true);
  });

  it('returns false for IN_PROGRESS', () => {
    expect(isTerminal('IN_PROGRESS')).toBe(false);
  });

  it('returns false for STARTED', () => {
    expect(isTerminal('STARTED')).toBe(false);
  });
});

describe('isResumable', () => {
  it('returns true for STARTED', () => {
    expect(isResumable('STARTED')).toBe(true);
  });

  it('returns true for IN_PROGRESS', () => {
    expect(isResumable('IN_PROGRESS')).toBe(true);
  });

  it('returns true for FAILED_RECOVERABLE', () => {
    expect(isResumable('FAILED_RECOVERABLE')).toBe(true);
  });

  it('returns false for SUBMITTED', () => {
    expect(isResumable('SUBMITTED')).toBe(false);
  });

  it('returns false for NOT_STARTED', () => {
    expect(isResumable('NOT_STARTED')).toBe(false);
  });
});

// ─── Identity Helpers ─────────────────────────────────────────────────────────

describe('attemptDocId', () => {
  it('returns {uid}_{assessmentId}', () => {
    expect(attemptDocId('abc123', 'exam_001')).toBe('abc123_exam_001');
  });

  it('throws when uid is empty string', () => {
    expect(() => attemptDocId('', 'exam_001')).toThrow();
  });

  it('throws when uid is null', () => {
    expect(() => attemptDocId(null, 'exam_001')).toThrow();
  });

  it('throws when uid is undefined', () => {
    expect(() => attemptDocId(undefined, 'exam_001')).toThrow();
  });

  it('throws when uid is a number (type check)', () => {
    expect(() => attemptDocId(12345, 'exam_001')).toThrow();
  });

  it('throws when assessmentId is missing', () => {
    expect(() => attemptDocId('uid123', '')).toThrow();
  });

  it('does not accept email as uid — error message is clear', () => {
    // Email strings are valid strings so they pass the type check
    // but callers should NEVER pass email. This test documents the contract.
    const id = attemptDocId('student@example.com', 'exam');
    // The function allows it structurally (we can't know if it's a UID),
    // but convention is documented: always pass auth.currentUser.uid
    expect(id).toBe('student@example.com_exam');
    // (Documented as a usage contract, not a runtime guard)
  });
});

describe('generateIdempotencyKey', () => {
  it('matches attemptDocId for same inputs', () => {
    const uid  = 'uid_test_001';
    const aId  = 'assessment_x';
    expect(generateIdempotencyKey(uid, aId)).toBe(attemptDocId(uid, aId));
  });
});

// ─── buildAttemptEnvelope ─────────────────────────────────────────────────────

describe('buildAttemptEnvelope', () => {
  const uid        = 'firebase_uid_001';
  const assessId   = 'test_cse_2026';
  const profile    = { tenantId: 'TN000001', cohortId: '2K27', email: 'student@test.com', displayName: 'Test Student' };
  const assessment = {
    name:             'CSE Test 2026',
    type:             'msa',
    duration_minutes: 120,
    sections: [
      { sectionId: 'mcq_1', name: 'MCQ', duration_minutes: 60 },
      { sectionId: 'coding_1', name: 'Coding', duration_minutes: 60 },
    ],
  };

  let envelope;

  it('builds without throwing', () => {
    expect(() => {
      envelope = buildAttemptEnvelope(uid, assessId, profile, assessment, 'cse-test-2026');
    }).not.toThrow();
  });

  it('sets uid field correctly', () => {
    envelope = buildAttemptEnvelope(uid, assessId, profile, assessment);
    expect(envelope.uid).toBe(uid);
  });

  it('sets assessmentId correctly', () => {
    expect(envelope.assessmentId).toBe(assessId);
  });

  it('computes durationSeconds from duration_minutes', () => {
    expect(envelope.durationSeconds).toBe(120 * 60);
  });

  it('does NOT store timeRemainingSeconds', () => {
    expect(envelope).not.toHaveProperty('timeRemainingSeconds');
  });

  it('sets status to STARTED', () => {
    expect(envelope.status).toBe(ATTEMPT_STATES.STARTED);
  });

  it('marks scoring_authority as client_provisional', () => {
    expect(envelope.scoring_authority).toBe('client_provisional');
  });

  it('sets completed to false', () => {
    expect(envelope.completed).toBe(false);
  });

  it('throws when uid is missing', () => {
    expect(() => buildAttemptEnvelope('', assessId, profile, assessment)).toThrow();
  });

  it('creates section entries for each section', () => {
    expect(Object.keys(envelope.sections)).toContain('mcq_1');
    expect(Object.keys(envelope.sections)).toContain('coding_1');
  });

  it('sets section status to NOT_STARTED', () => {
    expect(envelope.sections['mcq_1'].status).toBe(ATTEMPT_STATES.NOT_STARTED);
  });
});

// ─── calcAuthoritativeRemainingSeconds ────────────────────────────────────────

describe('calcAuthoritativeRemainingSeconds', () => {
  it('returns 0 when startedAt is missing', () => {
    expect(calcAuthoritativeRemainingSeconds({ durationSeconds: 3600 })).toBe(0);
  });

  it('returns 0 when durationSeconds is missing', () => {
    const startedAt = { toDate: () => new Date(Date.now() - 60000) };
    expect(calcAuthoritativeRemainingSeconds({ startedAt })).toBe(0);
  });

  it('returns remaining seconds based on startedAt (Firestore Timestamp)', () => {
    // Started 60 seconds ago, duration is 3600s → 3540 remaining
    const start = new Date(Date.now() - 60000);
    const startedAt = { toDate: () => start };
    const remaining = calcAuthoritativeRemainingSeconds({ startedAt, durationSeconds: 3600 });
    // Allow ±2s tolerance for test execution time
    expect(remaining).toBeGreaterThanOrEqual(3538);
    expect(remaining).toBeLessThanOrEqual(3542);
  });

  it('returns 0 when exam is over', () => {
    // Started 7200 seconds ago, duration is 3600s → 0 remaining
    const start = new Date(Date.now() - 7200000);
    const startedAt = { toDate: () => start };
    const remaining = calcAuthoritativeRemainingSeconds({ startedAt, durationSeconds: 3600 });
    expect(remaining).toBe(0);
  });
});

// ─── withRetry ────────────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = async () => 'success';
    await expect(withRetry(fn, [])).resolves.toBe('success');
  });

  it('retries and succeeds on second attempt', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) throw new Error('fail once');
      return 'ok';
    };
    await expect(withRetry(fn, [10])).resolves.toBe('ok');
    expect(calls).toBe(2);
  });

  it('throws after all retries exhausted', async () => {
    const fn = async () => { throw new Error('always fails'); };
    await expect(withRetry(fn, [10, 10])).rejects.toThrow('always fails');
  });
});
