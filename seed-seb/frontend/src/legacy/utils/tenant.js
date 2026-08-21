/**
 * Tenant (college / year / department) resolution.
 *
 * The user object MUST already be a canonical user document from Firestore.
 * All fields are read directly — no normalization, no fallback chains.
 * When a required field is missing we fail loudly (no silent substitution).
 */

const norm = (v) => (v === undefined || v === null ? '' : String(v).trim());

/**
 * @param {object} user - Canonical user document from Firestore users/{uid}
 * @returns {{tenantId:string, college:string, year:string, cohortId:string, department:string, email:string, valid:boolean, missing:string[]}}
 */
export function resolveTenant(user = {}) {
  const tenantId   = norm(user.tenantId);
  const college    = norm(user.college);
  const year       = norm(user.year);
  const cohortId   = norm(user.cohortId);
  const department = norm(user.department);
  const email      = norm(user.email).toLowerCase();

  const missing = [];
  if (!tenantId) missing.push('tenantId');
  if (!email)    missing.push('email');

  return { tenantId, college, year, cohortId, department, email, valid: missing.length === 0, missing };
}

/** Same as resolveTenant but throws when the identity is incomplete. */
export function requireTenant(userData = {}) {
  const tenant = resolveTenant(userData);
  if (!tenant.valid) {
    throw new Error(
      `TENANT_INCOMPLETE: missing ${tenant.missing.join(', ')} on the signed-in profile. ` +
        'Refusing to read or write assessment data with substituted values.'
    );
  }
  return tenant;
}

/** Department is optional for canonical paths; fall back only within the same tenant. */
export function tenantDepartment(tenant) {
  return tenant.department || 'UNSPECIFIED';
}

export default resolveTenant;
