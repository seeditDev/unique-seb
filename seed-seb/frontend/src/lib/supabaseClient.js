/**
 * supabaseClient.js — TOMBSTONE
 *
 * Supabase has been fully removed from SEED-SEB.
 * All persistence is via Firestore:
 *   • assessmentResults/{assessmentId}/students/{uid}   — final results
 *   • users/{uid}/assessmentAttempts/{assessmentId}     — attempt mirror
 *   • proctoringLogs/{attemptId}/events/{eventId}       — proctor events
 *
 * This file exists only to prevent broken imports from causing a hard build error.
 * Any import of { safeUpsert } or { supabase } from this module will receive a
 * no-op stub and a console error so it is visible during development.
 *
 * TODO: Remove all remaining callers and then delete this file.
 */

const _warn = (fn) => {
  console.error(
    `[SEED-SEB] supabaseClient.${fn}() called. ` +
    'Supabase has been removed. This is a no-op. ' +
    'Fix the caller to use Firestore.'
  );
};

export const supabase = {
  from: (table) => {
    _warn(`from('${table}')`);
    const noop = () => Promise.resolve({ data: [], error: null });
    const chain = { select: noop, insert: noop, upsert: noop, delete: noop };
    chain.eq = () => chain;
    chain.order = () => chain;
    return chain;
  }
};

/**
 * @deprecated Supabase has been removed. This function is a no-op.
 * Use MCQService.writeCanonicalResult() or setDoc() to Firestore instead.
 */
export async function safeUpsert(table) {
  _warn(`safeUpsert('${table}')`);
  return { data: null, error: null };
}
