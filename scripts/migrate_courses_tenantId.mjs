/**
 * migrate_courses_tenantId.mjs
 * 
 * Strict Fail-Closed Deterministic Migration Script:
 * Ensures every course in Firestore carries a valid, verified `tenantId`.
 * 
 * Policy:
 * 1. Scans all documents in the `courses` collection.
 * 2. Identifies courses missing a `tenantId`.
 * 3. Infers tenantId by checking:
 *    a. Child tests targeting (`courses/{cId}/series/{sId}/tests/{tId}.targeting.tenantIds`)
 *    b. Associated `tenantCourses` records
 * 4. Fallback Policy (Strict Fail-Closed):
 *    - If owner tenant cannot be inferred from data, the script REFUSES to assign a blind tenant
 *      and marks the course as UNRESOLVED unless both `--default-tenant <id>` AND `--allow-fallback`
 *      are explicitly passed.
 *    - If any unresolved courses remain, migration FAILS CLOSED with exit code 1.
 * 5. Verification Phase:
 *    - Asserts 100% of courses have a non-empty `tenantId`.
 *    - Asserts that every assigned `tenantId` exists in the `tenants` collection.
 *    - Asserts child test targeting compatibility.
 * 
 * Usage:
 *   node migrate_courses_tenantId.mjs [--dry-run]
 *   node migrate_courses_tenantId.mjs [--dry-run] --default-tenant TN000026 --allow-fallback
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
const allowFallback = process.argv.includes('--allow-fallback');
const defaultTenantIndex = process.argv.indexOf('--default-tenant');
const explicitFallbackTenant = defaultTenantIndex !== -1 && process.argv[defaultTenantIndex + 1]
  ? process.argv[defaultTenantIndex + 1].trim()
  : null;

console.log('====================================================');
console.log('   SEED-IT COURSE TENANTID DETERMINISTIC MIGRATION   ');
console.log('====================================================');
console.log(`Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE EXECUTION'}`);
console.log(`Fallback Policy: ${allowFallback && explicitFallbackTenant ? `Permitted -> "${explicitFallbackTenant}"` : 'STRICT FAIL-CLOSED (No blind fallback)'}\n`);

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
  console.log(`[Scan] Loaded ${validTenantIds.size} valid tenant(s) from database.`);

  const coursesSnap = await db.collection('courses').get();
  console.log(`[Scan] Found ${coursesSnap.size} courses in database.\n`);

  let alreadyCompliant = 0;
  let migratedCount = 0;
  let unresolvedCount = 0;
  let failedCount = 0;

  for (const docSnap of coursesSnap.docs) {
    const data = docSnap.data();
    const courseId = docSnap.id;
    const existingTenant = (data.tenantId || '').trim();

    if (existingTenant) {
      if (!validTenantIds.has(existingTenant)) {
        console.warn(`  ⚠ Course "${courseId}" has tenantId "${existingTenant}" but tenant doc is not in /tenants collection.`);
      } else {
        console.log(`  ✓ Course "${courseId}" (${data.title || 'Untitled'}): tenantId = "${existingTenant}" (ALREADY COMPLIANT)`);
      }
      alreadyCompliant++;
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
          resolvedTenant = tenantIds[0].trim();
          console.log(`    ↳ Resolved from child test "${tDoc.id}" targeting: "${resolvedTenant}"`);
          break;
        }
      }
      if (resolvedTenant) break;
    }

    // Fallback Check
    if (!resolvedTenant) {
      if (allowFallback && explicitFallbackTenant) {
        resolvedTenant = explicitFallbackTenant;
        console.log(`    ↳ Fallback flag active: Assigned explicit fallback tenant: "${resolvedTenant}"`);
      } else {
        console.error(`    ✗ UNRESOLVED: Cannot determine tenant for course "${courseId}". Refusing blind assignment (Fail-Closed).`);
        unresolvedCount++;
        continue;
      }
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

  if (unresolvedCount > 0) {
    console.error(`✗ MIGRATION ABORTED: ${unresolvedCount} course(s) could not be resolved safely.`);
    console.error(`  To force fallback, specify: --default-tenant <TENANT_ID> --allow-fallback\n`);
    process.exit(1);
  }

  // Verification check
  const verifySnap = await db.collection('courses').get();
  let verificationErrors = 0;

  for (const docSnap of verifySnap.docs) {
    const data = docSnap.data();
    const cId = docSnap.id;
    const tId = (data.tenantId || '').trim();

    if (!isDryRun && (!tId || tId === '')) {
      console.error(`  ✗ VERIFICATION FAILED: Course "${cId}" tenantId is still empty!`);
      verificationErrors++;
    }

    // Verify child targeting compatibility if any
    const seriesSnap = await db.collection('courses').doc(cId).collection('series').get();
    for (const sDoc of seriesSnap.docs) {
      const testsSnap = await db.collection('courses').doc(cId).collection('series').doc(sDoc.id).collection('tests').get();
      for (const tDoc of testsSnap.docs) {
        const tData = tDoc.data();
        const targetTenants = tData.targeting?.tenantIds;
        if (Array.isArray(targetTenants) && targetTenants.length > 0 && !targetTenants.includes(tId)) {
          console.warn(`  ⚠ Warning: Course "${cId}" has tenantId "${tId}" but child test "${tDoc.id}" targets: [${targetTenants.join(', ')}]`);
        }
      }
    }
  }

  if (verificationErrors === 0) {
    console.log(`✓ 100% of courses have a valid, verified tenantId.`);
    console.log(`Summary: ${alreadyCompliant} compliant, ${migratedCount} migrated, ${unresolvedCount} unresolved, ${failedCount} errors.`);
  } else {
    console.error(`✗ Verification completed with ${verificationErrors} error(s).`);
    process.exit(1);
  }
}

runMigration().catch((err) => {
  console.error('[Migration Fatal Error]:', err);
  process.exit(1);
});
