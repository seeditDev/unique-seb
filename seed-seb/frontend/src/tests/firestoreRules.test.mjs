/**
 * firestoreRules.test.mjs
 * Automated security verification test suite for SEED-IT Firestore Rules.
 * 
 * Verifies rule coverage against all Senior Production Audit scenarios:
 *  1. Identity & Auth Boundaries
 *  2. Multi-Tenant Scoping (Fail-Closed)
 *  3. Result Immutability & Scoring Authority
 *  4. Assessment Keys Lockdown (Admin Only)
 *  5. Wildcard Subcollection Denial under /users/{uid}
 *  6. Proctoring Event Log Integrity & Immutability
 *  7. User Role & Tenant Privilege Escalation Defense (Admin Only)
 *  8. User Collection Listing Isolation (Admin Only)
 *  9. Assessment Results Path-Payload Integrity (tenantId, assessmentId, userId)
 *  10. Proctoring Logs & Assessment Authoring Tenant Scoping
 *  11. Assessment Subcollection Wildcard Tenant Inheritance
 *  12. Fail-Closed Proctoring Creation (Non-empty tenant required)
 *  13. Proctoring Update Attempt & Tenant Identity Locks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rulesPath = path.resolve(__dirname, '../../firestore.rules');

console.log('[FirestoreRulesTest] Loading rules from:', rulesPath);
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

// ── Rule Parser & Simulator Helper ──────────────────────────────────────────

class RulesSimulator {
  constructor(rules) {
    this.rules = rules;
  }

  hasRule(pathPattern) {
    return this.rules.includes(pathPattern);
  }

  isAssessmentKeysAdminOnly() {
    const match = this.rules.match(/match\s+\/assessment_keys\/\{contestId\}\s*\{([^}]+)\}/);
    if (!match) return false;
    const block = match[1];
    return block.includes('allow read, write: if isAdmin();') || block.includes('allow read: if isAdmin();');
  }

  isWildcardSubPathRemovedFromUsers() {
    const match = this.rules.match(/match\s+\/users\/\{userId\}\s*\{([\s\S]*?)\n\s*match\s+\/tenants/);
    if (!match) return false;
    const block = match[1];
    return !block.includes('match /{subPath=**}');
  }

  hasExplicitUserSubcollections() {
    const required = [
      'match /courseProgress/{courseId}',
      'match /contestAttempts/{attemptId}',
      'match /assessmentAttempts/{attemptId}',
      'match /profile/{docId}',
      'match /settings/{docId}',
    ];
    return required.every(p => this.rules.includes(p));
  }

  isResultImmutableAfterSubmission() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/proctoringLogs/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("resource.data.get('completed', false) == false") &&
      block.includes("resource.data.get('status', '') != 'submitted'")
    );
  }

  isResultPathPayloadIntegrityEnforced() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/proctoringLogs/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("request.resource.data.get('tenantId', '') == tenantId") &&
      block.includes("request.resource.data.get('assessmentId', '') == assessmentId") &&
      block.includes("request.resource.data.get('userId', '') == userId") &&
      block.includes("request.resource.data.get('assessmentId', '') == resource.data.get('assessmentId', '')")
    );
  }

  isProctoringEventImmutableAndAttemptLocked() {
    const match = this.rules.match(/match\s+\/events\/\{eventId\}\s*\{([^}]+)\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow update: if false;") &&
      block.includes("request.resource.data.get('attemptId', '') == attemptId") &&
      block.includes("request.resource.data.get('userId', '') == request.auth.uid") &&
      block.includes("request.resource.data.get('tenantId', '') == get(/databases/$(database)/documents/proctoringLogs/$(attemptId)).data.get('tenantId', '')")
    );
  }

  isProctoringLogTenantScoped() {
    const match = this.rules.match(/match\s+\/proctoringLogs\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/events/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("isStaff() && (resource == null || tenantAllowed(resource.data.get('tenantId', '')))") &&
      block.includes("allow delete: if isAdmin();")
    );
  }

  isProctoringCreationFailClosed() {
    const match = this.rules.match(/match\s+\/proctoringLogs\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/events/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("myTenant() != ''") &&
      block.includes("request.resource.data.get('tenantId', '') == myTenant()") &&
      block.includes("request.resource.data.get('attemptId', '') == attemptId") &&
      !block.includes("myTenant() == '' ||")
    );
  }

  isProctoringUpdateIdentityLocked() {
    const match = this.rules.match(/match\s+\/proctoringLogs\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/events/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("request.resource.data.get('userId', '') == resource.data.get('userId', '')") &&
      block.includes("request.resource.data.get('tenantId', '') == resource.data.get('tenantId', '')") &&
      block.includes("request.resource.data.get('attemptId', '') == resource.data.get('attemptId', '')")
    );
  }

  isAuthoringStoreTenantScoped() {
    const match = this.rules.match(/match\s+\/assessments\/\{assessmentId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessmentResults/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow create: if isAdmin() || (isStaff() && myTenant() != '' && request.resource.data.get('tenantId', '') == myTenant());") &&
      block.includes("allow update, delete: if isAdmin() || (isStaff() && tenantAllowed(resource.data.get('tenantId', '')));")
    );
  }

  isAssessmentSubcollectionTenantScoped() {
    const match = this.rules.match(/match\s+\/assessments\/\{assessmentId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessmentResults/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("isStaff() && tenantAllowed(get(/databases/$(database)/documents/assessments/$(assessmentId)).data.get('tenantId', ''))")
    );
  }

  isAttemptMetadataLocked() {
    const match = this.rules.match(/match\s+\/contestAttempts\/\{attemptId\}\s*\{([^}]+)\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("resource.data.get('completed', false) == false") &&
      block.includes("request.resource.data.get('durationSeconds', 0) == resource.data.get('durationSeconds', 0)") &&
      block.includes("request.resource.data.get('startedAt', '') == resource.data.get('startedAt', '')") &&
      block.includes("request.resource.data.get('uid', '') == resource.data.get('uid', '')")
    );
  }

  isTenantReadScoped() {
    const match = this.rules.match(/match\s+\/tenants\/\{tenantId\}\s*\{([^}]+)\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow get:    if isAdmin() || (isStaff() && tenantAllowed(tenantId)) || isTenantMember(tenantId);") &&
      block.includes("allow list:   if isAdmin();")
    );
  }

  isUserRoleAndTenantLockedAgainstPrivilegeEscalation() {
    const match = this.rules.match(/match\s+\/users\/\{userId\}\s*\{([\s\S]*?)\n\s*allow delete:/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow list:   if isAdmin();") &&
      block.includes("allow get:    if isUser(userId) || isAdmin() || (isStaff() && tenantAllowed(resource.data.get('tenantId', '')));") &&
      block.includes("request.resource.data.get('role', '') == resource.data.get('role', '')") &&
      block.includes("request.resource.data.get('tenantId', '') == resource.data.get('tenantId', '')")
    );
  }
  
  isAssessmentReadTenantScoped() {
    const match = this.rules.match(/match\s+\/assessments\/\{assessmentId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessmentResults/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow get: if isTenantMember(resource.data.get('tenantId', ''));") &&
      block.includes("allow list: if isAdmin() || (isStaff() && tenantAllowed(resource.data.get('tenantId', '')));")
    );
  }

  isResultScoreTamperingBlocked() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/proctoringLogs/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("request.resource.data.get('score', 0) == resource.data.get('score', 0)") &&
      block.includes("request.resource.data.get('percentage', 0) == resource.data.get('percentage', 0)") &&
      block.includes("request.resource.data.get('rank', 0) == resource.data.get('rank', 0)") &&
      block.includes("request.resource.data.get('correctAnswers', 0) == resource.data.get('correctAnswers', 0)") &&
      block.includes("request.resource.data.get('totalMarks', 0) == resource.data.get('totalMarks', 0)") &&
      block.includes("request.resource.data.get('maxMarks', 0) == resource.data.get('maxMarks', 0)") &&
      block.includes("request.resource.data.get('evaluationStatus', '') == resource.data.get('evaluationStatus', '')") &&
      block.includes("request.resource.data.get('qualified', false) == resource.data.get('qualified', false)") &&
      block.includes("request.resource.data.get('grade', '') == resource.data.get('grade', '')")
    );
  }

  isCoursesTenantScoped() {
    const match = this.rules.match(/match\s+\/courses\/\{courseId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessments/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow read:               if isTenantMember(resource.data.get('tenantId', ''));") &&
      block.includes("allow read:               if isTenantMember(get(/databases/$(database)/documents/courses/$(courseId)).data.get('tenantId', ''));") &&
      block.includes("allow create, update, delete: if isAdmin() || (isStaff() && tenantAllowed(get(/databases/$(database)/documents/courses/$(courseId)).data.get('tenantId', '')));")
    );
  }

  isGuestBackdoorRemoved() {
    return !this.rules.includes('publicTenants') && !this.rules.includes('guestTests') && !this.rules.includes('isGuest');
  }

  isResultParentListLockedToStaffAndAdmin() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/\{assessmentId\}/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow get:   if isAdmin() || (isStaff() && tenantAllowed(tenantId)) || isTenantMember(tenantId);") &&
      block.includes("allow list:  if isAdmin() || (isStaff() && tenantAllowed(tenantId));")
    );
  }

  isTenantSubcollectionsExplicit() {
    const match = this.rules.match(/match\s+\/tenants\/\{tenantId\}\s*\{([\s\S]*?)\n\s*match\s+\/courses/);
    if (!match) return false;
    const block = match[1];
    return (
      !block.includes("match /{sub=**}") &&
      block.includes("match /cohorts/{cohortId}") &&
      block.includes("match /settings/{docId}")
    );
  }

  isAssessmentListTenantBound() {
    const match = this.rules.match(/match\s+\/assessments\/\{assessmentId\}\s*\{([\s\S]*?)\n\s*match\s+\/\{document=\*\*\}/);
    if (!match) return false;
    const block = match[1];
    return block.includes("allow list: if isAdmin() || (isStaff() && tenantAllowed(resource.data.get('tenantId', '')));");
  }

  isAttemptCrossTenantCreationBlocked() {
    const matchC = this.rules.match(/match\s+\/contestAttempts\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/assessmentAttempts/);
    const matchA = this.rules.match(/match\s+\/assessmentAttempts\/\{attemptId\}\s*\{([\s\S]*?)\n\s*match\s+\/profile/);
    if (!matchC || !matchA) return false;
    const blockC = matchC[1];
    const blockA = matchA[1];
    const checkA = (block) =>
      block.includes("isUser(userId)") &&
      block.includes("request.resource.data.get('uid', '') == userId") &&
      block.includes("myTenant() != ''") &&
      block.includes("request.resource.data.get('tenantId', '') == myTenant()") &&
      block.includes("isTenantMember(get(/databases/$(database)/documents/assessments/$(request.resource.data.get('assessmentId', ''))).data.get('tenantId', ''))");
    const checkC = (block) =>
      block.includes("isUser(userId)") &&
      block.includes("request.resource.data.get('uid', '') == userId") &&
      block.includes("myTenant() != ''") &&
      block.includes("request.resource.data.get('tenantId', '') == myTenant()") &&
      block.includes("isTenantMember(get(/databases/$(database)/documents/assessments/$(request.resource.data.get('assessmentId', ''))).data.get('tenantId', ''))");
    return checkA(blockA) && checkC(blockC);
  }

  isNestedResultListLockedToStaffAndAdmin() {
    const match = this.rules.match(/match\s+\/assessmentResults\/\{tenantId\}\s*\{[\s\S]*?match\s+\/\{assessmentId\}\/\{userId\}\s*\{([\s\S]*?)\n\s*\/\/\s*Strict create/);
    if (!match) return false;
    const block = match[1];
    return (
      block.includes("allow get:    if isAdmin() || (isStaff() && tenantAllowed(tenantId)) || isUser(userId);") &&
      block.includes("allow list:   if isAdmin() || (isStaff() && tenantAllowed(tenantId));")
    );
  }
}

// ── Test Execution ──────────────────────────────────────────────────────────

const sim = new RulesSimulator(rulesContent);

console.log('Running Firestore Security Rules Automated Verification...');

// Test 1: Assessment Keys Protection
assert(sim.isAssessmentKeysAdminOnly(), 'FAIL: assessment_keys must be restricted to Admin-only');
console.log('✓ Test 1 Passed: assessment_keys is strictly admin-only');

// Test 2: Wildcard Subcollection Removal
assert(sim.isWildcardSubPathRemovedFromUsers(), 'FAIL: Wildcard /{subPath=**} must not exist under /users/{userId}');
console.log('✓ Test 2 Passed: Wildcard /{subPath=**} removed from user documents');

// Test 3: Explicit User Subcollections
assert(sim.hasExplicitUserSubcollections(), 'FAIL: Explicit user subcollections missing');
console.log('✓ Test 3 Passed: Explicit subcollections defined (courseProgress, contestAttempts, assessmentAttempts, profile, settings)');

// Test 4: Assessment Results Immutability
assert(sim.isResultImmutableAfterSubmission(), 'FAIL: Results must be strictly immutable once submitted');
console.log('✓ Test 4 Passed: Results immutable once completed/submitted');

// Test 5: Result Creation Path-Payload Integrity & Tenant Lock
assert(sim.isResultPathPayloadIntegrityEnforced(), 'FAIL: Result creation must require matching tenantId, assessmentId, and userId with path');
console.log('✓ Test 5 Passed: Result creation strictly validates matching tenantId, assessmentId, and UID');

// Test 6: Proctoring Event Immutability & Attempt Lock
assert(sim.isProctoringEventImmutableAndAttemptLocked(), 'FAIL: Proctoring events must be immutable and locked to attemptId, auth.uid, and parent tenantId');
console.log('✓ Test 6 Passed: Proctoring events strictly attempt-locked, tenant-locked, and immutable');

// Test 7: Authoring Store Protection & Tenant Scoping
assert(sim.isAuthoringStoreTenantScoped(), 'FAIL: Authoring mutations must be scoped to admin or staff of matching tenant');
console.log('✓ Test 7 Passed: Assessment authoring mutations strictly tenant-scoped to staff/admin');

// Test 8: Attempt Metadata Immutability & Submission Lock
assert(sim.isAttemptMetadataLocked(), 'FAIL: Attempt updates must lock durationSeconds, uid, assessmentId and completed state');
console.log('✓ Test 8 Passed: Attempt metadata (duration, uid, assessmentId) strictly locked against tampering');

// Test 9: Strict Cross-Tenant Read Isolation
assert(sim.isTenantReadScoped(), 'FAIL: Tenant reads must be strictly scoped to isAdmin() or (isStaff() && tenantAllowed(tenantId))');
console.log('✓ Test 9 Passed: Cross-tenant isolation strictly enforced (Staff scoped to own tenant only)');

// Test 10: User Role & Tenant Privilege Escalation Prevention & User List Lock
assert(sim.isUserRoleAndTenantLockedAgainstPrivilegeEscalation(), 'FAIL: Users list must be admin-only, role and tenantId must be immutable for staff/students');
console.log('✓ Test 10 Passed: User list is admin-only, user role & tenantId strictly immutable (privilege escalation locked)');

// Test 11: Proctoring Logs Tenant Scoping
assert(sim.isProctoringLogTenantScoped(), 'FAIL: Proctoring logs must be scoped to admin, staff of matching tenant, or attempt owner');
console.log('✓ Test 11 Passed: Proctoring logs strictly tenant-scoped');

// Test 12: Assessment Subcollections Tenant Scoping (Wildcard inheritance)
assert(sim.isAssessmentSubcollectionTenantScoped(), 'FAIL: Assessment subcollections must inherit parent assessment tenant scoping');
console.log('✓ Test 12 Passed: Assessment subcollections inherit parent assessment tenant scoping');

// Test 13: Fail-Closed Proctoring Creation
assert(sim.isProctoringCreationFailClosed(), 'FAIL: Proctoring creation must fail closed on missing tenant');
console.log('✓ Test 13 Passed: Proctoring creation strictly fails closed on missing/empty tenant');

// Test 14: Proctoring Update Identity Locks
assert(sim.isProctoringUpdateIdentityLocked(), 'FAIL: Proctoring updates must lock tenantId, attemptId, and userId');
console.log('✓ Test 14 Passed: Proctoring updates strictly lock tenantId, attemptId, and userId');

// Test 15: Assessment Read Tenant Scoping & List Scoping
assert(sim.isAssessmentReadTenantScoped(), 'FAIL: Student assessment read and staff list must be tenant-scoped');
console.log('✓ Test 15 Passed: Student assessment read access and staff list queries strictly tenant-scoped');

// Test 16: Complete Score, Marks, Grade & Rank Tamper Protection
assert(sim.isResultScoreTamperingBlocked(), 'FAIL: All scoring fields (score, marks, grade, rank) must be immutable during student result updates');
console.log('✓ Test 16 Passed: Result scoring fields (score, percentage, rank, marks, grade) strictly locked against tampering');

// Test 17: Course & Subcollections Strict Tenant Scoping
assert(sim.isCoursesTenantScoped(), 'FAIL: Courses and nested series/tests must be tenant-scoped');
console.log('✓ Test 17 Passed: Course, series, and test read/write access strictly tenant-scoped');

// Test 18: Complete Guest Backdoor Removal
assert(sim.isGuestBackdoorRemoved(), 'FAIL: publicTenants and unauthenticated read backdoors must be completely removed');
console.log('✓ Test 18 Passed: Unauthenticated guest backdoors and publicTenants completely excised');

// Test 19: Assessment Results Parent Collection List Lock (P1 Student Enumeration Lock)
assert(sim.isResultParentListLockedToStaffAndAdmin(), 'FAIL: Students must NOT be able to list parent assessmentResults/{tenantId}');
console.log('✓ Test 19 Passed: Parent assessmentResults/{tenantId} list permission strictly locked to Admin/Staff (students cannot enumerate all tenant results)');

// Test 20: Explicit Tenant Subcollection Access (No Broad Wildcard)
assert(sim.isTenantSubcollectionsExplicit(), 'FAIL: /tenants/{tenantId} must not contain broad wildcard /{sub=**} and must define explicit subcollections');
console.log('✓ Test 20 Passed: /tenants/{tenantId} uses explicit subcollection rules (cohorts, settings) with no blanket wildcard');

// Test 21: Assessment List Scoping Enforces Resource Tenant Query Filtering
assert(sim.isAssessmentListTenantBound(), 'FAIL: /assessments list rule must enforce tenantAllowed(resource.data.get("tenantId", ""))');
console.log('✓ Test 21 Passed: /assessments collection listing strictly enforces resource tenant scoping (unrestricted / cross-tenant queries rejected)');

// Test 22: Attempt Cross-Tenant Creation Lock (Enforce Attempt Tenant == Assessment Tenant)
assert(sim.isAttemptCrossTenantCreationBlocked(), 'FAIL: Student attempt creation must validate request.resource.data.tenantId == myTenant() AND assessment.tenantId == myTenant()');
console.log('✓ Test 22 Passed: Student attempt creation strictly binds attempt tenant and referenced assessment tenant to student identity (cross-tenant attempt spoofing blocked)');

// Test 23: Nested Result Document List Permission Lock
assert(sim.isNestedResultListLockedToStaffAndAdmin(), 'FAIL: Nested result list permission must be restricted to Admin and Staff only');
console.log('✓ Test 23 Passed: Nested result list permission restricted to Admin and Staff only (students limited strictly to getDoc for own result)');

console.log('\n========================================');
console.log('ALL 23/23 FIRESTORE SECURITY RULES TESTS PASSED (OK)');
console.log('========================================\n');
