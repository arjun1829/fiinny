// READ-ONLY pre-deploy check for the 2026-10-25 tenant-isolation rules.
//
// The new rules grant nothing to a user doc without a tenantId, and root
// (master-tenant) collections now require tenantId == 'master'. Before that,
// root rules checked role only, so a legacy staff/portal doc with a role but no
// tenantId still worked. Any doc this script lists will be locked out by the
// new rules until its tenantId is set (to 'master' for KaranArjun staff).
//
// Usage (needs ADC: `gcloud auth application-default login`):
//   node scripts/audit-user-tenants.mjs [projectId]
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const projectId = process.argv[2] ?? 'karanarjun-pvt-ltd';
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const snap = await db.collection('users').get();
const byTenant = new Map();
const tenantless = [];
const master = [];
const row = (d, u) => ({ uid: d.id, email: u.email ?? '', name: u.name ?? '', role: u.role ?? '', linkedId: u.linkedId ?? '' });
for (const d of snap.docs) {
    const u = d.data();
    const tid = u.tenantId ?? null;
    byTenant.set(tid, (byTenant.get(tid) ?? 0) + 1);
    if (tid === null) tenantless.push(row(d, u));
    if (tid === 'master') master.push(row(d, u));
}

console.log(`project ${projectId}: ${snap.size} user docs`);
console.log('by tenantId:', Object.fromEntries([...byTenant].map(([k, v]) => [String(k), v])));
// 'analyst' is also the default role of a fresh sign-up, so a tenantless analyst is
// either an abandoned sign-up (harmless) or legacy staff (will be locked out).
console.log(`\nNo tenantId (${tenantless.length}) — any real KaranArjun staff here needs tenantId 'master':`);
console.table(tenantless);
console.log(`\nMaster tenant (${master.length}) — confirm the owner accounts are role 'admin':`);
console.table(master);
