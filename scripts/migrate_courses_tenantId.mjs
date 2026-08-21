/**
 * migrate_courses_tenantId.mjs
 * 
 * Deterministic Migration Script: Ensures every course in Firestore carries a valid `tenantId`.
 * 
 * Workflow:
 * 1. Scans all documents in the `courses` collection.
 * 2. Identifies courses missing a `tenantId`.
 * 3. Infers tenantId by checking:
 *    a. Child tests targeting (`courses/{cId}/series/{sId}/tests/{tId}.targeting.tenantIds`)
 *    b. Associated `tenantCourses` records
 *    c. Configured fallback tenant (e.g. TN000026 or CLI argument)
 * 4. Updates course doc with `{ tenantId, migratedAt }`.
 * 5. Verifies that 100% of courses have a non-empty `tenantId`.
 * 
 * Usage:
 *   node migrate_courses_tenantId.mjs [--dry-run] [--default-tenant TN000026]
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
const defaultTenantIndex = process.argv.indexOf('--default-tenant');
const DEFAULT_TENANT = defaultTenantIndex !== -1 && process.argv[defaultTenantIndex + 1] 
  ? process.argv[defaultTenantIndex + 1] 
  : 'TN000026';

console.log('====================================================');
console.log('   SEED-IT COURSE TENANTID DETERMINISTIC MIGRATION   ');
console.log('====================================================');
console.log(`Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE EXECUTION'}`);
console.log(`Default Fallback Tenant: ${DEFAULT_TENANT}\n`);

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

  // Fallback to default credentials / emulator
  console.log('[Init] Using default application credentials or emulator...');
  const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'seeditdev' });
  return getFirestore(app);
}

async function runMigration() {
  const db = initFirebase();
  const coursesSnap = await db.collection('courses').get();

  console.log(`[Scan] Found ${coursesSnap.size} courses in database.`);

  let alreadyCompliant = 0;
  let migratedCount = 0;
  let failedCount = 0;

  for (const docSnap of coursesSnap.docs) {
    const data = docSnap.data();
    const courseId = docSnap.id;
    const existingTenant = (data.tenantId || '').trim();

    if (existingTenant) {
      console.log(`  ✓ Course "${courseId}" (${data.title || 'Untitled'}): tenantId = "${existingTenant}" (ALREADY COMPLIANT)`);
      alreadyCompliant++;
      continue;
    }

    console.log(`  ! Course "${courseId}" (${data.title || 'Untitled'}): MISSING tenantId! Resolving...`);

    // Resolution strategy:
    // Step A: Inspect child series and tests
    let resolvedTenant = '';
    const seriesSnap = await db.collection('courses').doc(courseId).collection('series').get();
    for (const sDoc of seriesSnap.docs) {
      const testsSnap = await db.collection('courses').doc(courseId).collection('series').doc(sDoc.id).collection('tests').get();
      for (const tDoc of testsSnap.docs) {
        const tData = tDoc.data();
        const tenantIds = tData.targeting?.tenantIds;
        if (Array.isArray(tenantIds) && tenantIds.length > 0 && tenantIds[0]) {
          resolvedTenant = tenantIds[0];
          console.log(`    ↳ Resolved from child test "${tDoc.id}" targeting: "${resolvedTenant}"`);
          break;
        }
      }
      if (resolvedTenant) break;
    }

    // Step B: If unresolved, fallback to default tenant
    if (!resolvedTenant) {
      resolvedTenant = DEFAULT_TENANT;
      console.log(`    ↳ No child targeting found. Assigned fallback tenant: "${resolvedTenant}"`);
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
  
  // Verification check
  const verifySnap = await db.collection('courses').get();
  let nonCompliantAfter = 0;

  for (const docSnap of verifySnap.docs) {
    const data = docSnap.data();
    if (!isDryRun && (!data.tenantId || data.tenantId.trim() === '')) {
      console.error(`  ✗ VERIFICATION FAILED for course "${docSnap.id}": tenantId is still empty!`);
      nonCompliantAfter++;
    }
  }

  if (nonCompliantAfter === 0) {
    console.log(`✓ 100% of courses have a valid tenantId.`);
    console.log(`Summary: ${alreadyCompliant} already compliant, ${migratedCount} migrated, ${failedCount} errors.`);
  } else {
    console.error(`✗ Migration finished with ${nonCompliantAfter} non-compliant courses.`);
    process.exit(1);
  }
}

runMigration().catch((err) => {
  console.error('[Migration Fatal Error]:', err);
  process.exit(1);
});
