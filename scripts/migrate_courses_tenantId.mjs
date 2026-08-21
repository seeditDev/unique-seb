/**
 * migrate_courses_tenantId.mjs
 * 
 * Authoritative Deterministic Migration & Verification Script:
 * Ensures every course in Firestore carries a valid, verified `tenantId` that exists in `/tenants`.
 * 
 * Policy:
 * 1. Scans all documents in the `courses` collection.
 * 2. Identifies courses missing a `tenantId`.
 * 3. Infers tenantId by checking child tests targeting:
 *    `courses/{cId}/series/{sId}/tests/{tId}.targeting.tenantIds`
 * 4. Fallback Policy (Strict Fail-Closed, No Blind Fallbacks):
 *    - If owner tenant cannot be inferred from data, the script REFUSES to assign any tenant
 *      and marks the course as UNRESOLVED.
 *    - If any unresolved courses remain, migration FAILS CLOSED with exit code 1.
 * 5. Authoritative Verification Phase:
 *    - Asserts 100% of courses have a non-empty `tenantId`.
 *    - Asserts that every assigned `tenantId` exists in the `/tenants` collection (Fails on unknown tenant).
 *    - Asserts child test targeting compatibility (Fails on cross-tenant mismatch).
 * 
 * Usage:
 *   node migrate_courses_tenantId.mjs [--dry-run]
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arguments
const isDryRun = process.argv.includes('--dry-run');

console.log('====================================================');
console.log('   SEED-IT COURSE TENANTID DETERMINISTIC MIGRATION   ');
console.log('====================================================');
console.log(`Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE EXECUTION'}`);
console.log('Fallback Policy: STRICT FAIL-CLOSED (No blind fallbacks)\n');

// Initialize Firebase Admin
function initFirebase() {
  if (getApps().length > 0) return getFirestore();

  const possibleKeyPaths = [
    resolve(__dirname, '../../serviceAccountKey.json'),
    resolve(__dirname, '../serviceAccountKey.json'),
    resolve(process.cwd(), 'serviceAccountKey.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  for (const keyPath of possibleKeyPaths) {
    if (existsSync(keyPath)) {
      console.log(`[Init] Using Service Account credentials from: ${keyPath}`);
      const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
      const app = initializeApp({
        credential: cert(serviceAccount),
      });
      return getFirestore(app);
    }
  }

  console.log('[Init] Using default application credentials or emulator...');
  const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'seeditdev' });
  return getFirestore(app);
}

async function runMigration() {
  const db = initFirebase();

  // Load existing valid tenants for verification
  const tenantsSnap = await db.collection('tenants').get();
  const validTenantIds = new Set(tenantsSnap.docs.map((d) => d.id));
  console.log(`[Scan] Loaded ${validTenantIds.size} valid tenant(s) from /tenants collection.`);

  const coursesSnap = await db.collection('courses').get();
  console.log(`[Scan] Found ${coursesSnap.size} courses in database.\n`);

  let alreadyCompliant = 0;
  let migratedCount = 0;
  let unresolvedCount = 0;
  let failedCount = 0;
  let invalidExistingTenantCount = 0;

  for (const docSnap of coursesSnap.docs) {
    const data = docSnap.data();
    const courseId = docSnap.id;
    const existingTenant = (data.tenantId || '').trim();

    if (existingTenant) {
      if (!validTenantIds.has(existingTenant)) {
        console.error(`  ✗ Course "${courseId}" has invalid tenantId "${existingTenant}" (not found in /tenants)!`);
        invalidExistingTenantCount++;
      } else {
        console.log(`  ✓ Course "${courseId}" (${data.title || 'Untitled'}): tenantId = "${existingTenant}" (ALREADY COMPLIANT)`);
        alreadyCompliant++;
      }
      continue;
    }

    console.log(`  ! Course "${courseId}" (${data.title || 'Untitled'}): MISSING tenantId! Resolving...`);

    // Resolution Strategy: Inspect child series and tests
    let resolvedTenant = '';
    const seriesSnap = await db.collection('courses').doc(courseId).collection('series').get();
    for (const sDoc of seriesSnap.docs) {
      const testsSnap = await db.collection('courses').doc(courseId).collection('series').doc(sDoc.id).collection('tests').get();
      for (const tDoc of testsSnap.docs) {
        const tData = tDoc.data();
        const tenantIds = tData.targeting?.tenantIds;
        if (Array.isArray(tenantIds) && tenantIds.length > 0 && tenantIds[0]) {
          const candidate = tenantIds[0].trim();
          if (validTenantIds.has(candidate)) {
            resolvedTenant = candidate;
            console.log(`    ↳ Resolved from child test "${tDoc.id}" targeting: "${resolvedTenant}"`);
            break;
          }
        }
      }
      if (resolvedTenant) break;
    }

    // Fail-closed check
    if (!resolvedTenant) {
      console.error(`    ✗ UNRESOLVED: Cannot infer valid tenant for course "${courseId}". Fail-Closed.`);
      unresolvedCount++;
      continue;
    }

    if (!isDryRun) {
      try {
        await db.collection('courses').doc(courseId).set({
          tenantId: resolvedTenant,
          migratedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`    ✓ Written tenantId "${resolvedTenant}" to course "${courseId}".`);
        migratedCount++;
      } catch (err) {
        console.error(`    ✗ Error writing course "${courseId}":`, err.message);
        failedCount++;
      }
    } else {
      console.log(`    [DRY-RUN] Would write tenantId "${resolvedTenant}" to course "${courseId}".`);
      migratedCount++;
    }
  }

  console.log('\n====================================================');
  console.log('               VERIFICATION PHASE                   ');
  console.log('====================================================');

  if (unresolvedCount > 0 || invalidExistingTenantCount > 0) {
    console.error(`✗ MIGRATION ABORTED: ${unresolvedCount} unresolved course(s), ${invalidExistingTenantCount} invalid tenant reference(s).`);
    process.exit(1);
  }

  // Verification check
  const verifySnap = await db.collection('courses').get();
  let verificationErrors = 0;

  for (const docSnap of verifySnap.docs) {
    const data = docSnap.data();
    const cId = docSnap.id;
    const tId = (data.tenantId || '').trim();

    if (!tId || tId === '') {
      console.error(`  ✗ VERIFICATION FAILED: Course "${cId}" tenantId is empty!`);
      verificationErrors++;
      continue;
    }

    if (!validTenantIds.has(tId)) {
      console.error(`  ✗ VERIFICATION FAILED: Course "${cId}" has unknown tenantId "${tId}" (not in /tenants)!`);
      verificationErrors++;
      continue;
    }

    // Verify child targeting compatibility
    const seriesSnap = await db.collection('courses').doc(cId).collection('series').get();
    for (const sDoc of seriesSnap.docs) {
      const testsSnap = await db.collection('courses').doc(cId).collection('series').doc(sDoc.id).collection('tests').get();
      for (const tDoc of testsSnap.docs) {
        const tData = tDoc.data();
        const targetTenants = tData.targeting?.tenantIds;
        if (Array.isArray(targetTenants) && targetTenants.length > 0 && !targetTenants.includes(tId)) {
          console.error(`  ✗ VERIFICATION FAILED: Course "${cId}" (tenantId "${tId}") has incompatible child test "${tDoc.id}" targeting: [${targetTenants.join(', ')}]`);
          verificationErrors++;
        }
      }
    }
  }

  if (verificationErrors === 0) {
    console.log(`✓ 100% of courses have a valid, verified tenantId existing in /tenants with compatible child targeting.`);
    console.log(`Summary: ${alreadyCompliant} compliant, ${migratedCount} migrated, ${failedCount} errors.`);
  } else {
    console.error(`✗ Verification completed with ${verificationErrors} error(s).`);
    process.exit(1);
  }
}

runMigration().catch((err) => {
  console.error('[Migration Fatal Error]:', err);
  process.exit(1);
});
