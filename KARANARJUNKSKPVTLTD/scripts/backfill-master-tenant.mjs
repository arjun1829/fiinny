// Moves listed tenantless user docs into the master tenant (tenantId 'master').
// Companion to scripts/audit-user-tenants.mjs: run that first and pass only the
// uids of real KaranArjun staff. Never touches a doc that already has a tenant.
//
// Dry run by default; add --apply to write. Needs ADC.
//   node scripts/backfill-master-tenant.mjs <uid> [<uid> ...]
//   node scripts/backfill-master-tenant.mjs <uid> [<uid> ...] --apply
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const apply = process.argv.includes('--apply');
const uids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (uids.length === 0) {
    console.error('usage: node scripts/backfill-master-tenant.mjs <uid> [<uid> ...] [--apply]');
    process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: 'karanarjun-pvt-ltd' });
const db = getFirestore();

for (const uid of uids) {
    const ref = db.collection('users').doc(uid);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return 'SKIP: no such user doc';
        const u = snap.data();
        if ((u.tenantId ?? null) !== null) return `SKIP: already in tenant '${u.tenantId}'`;
        if (apply) {
            tx.update(ref, { tenantId: 'master', updatedAt: FieldValue.serverTimestamp() });
            return `UPDATED: ${u.email ?? ''} (${u.role ?? 'no role'}) -> tenantId 'master'`;
        }
        return `WOULD UPDATE: ${u.email ?? ''} (${u.role ?? 'no role'}) -> tenantId 'master'`;
    });
    console.log(`${uid}  ${result}`);
}
if (!apply) console.log('\nDry run only. Re-run with --apply to write.');
