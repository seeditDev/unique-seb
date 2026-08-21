/**
 * tenantResultsService.js -- DEPRECATED
 *
 * This module is no longer used. All assessment results are written to the
 * single canonical Firestore path:
 *
 *   assessmentResults/{assessmentId}/{tenantId}/students/{userId}
 *
 * Staff reports read from assessmentResults directly via SEEDADMIN results.ts.
 *
 * Kept as a no-op stub to prevent import errors during transition.
 * Safe to delete after full verification.
 */

export async function writeTenantResult() {
    // No-op: all writes go to assessmentResults canonical path.
}

export function buildTenantResultPayload() {
    // No-op: all writes go to assessmentResults canonical path.
    return {};
}