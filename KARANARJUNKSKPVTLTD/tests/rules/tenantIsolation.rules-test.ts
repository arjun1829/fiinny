// Firestore rules tests for tenant isolation and the /users privilege fields.
// Run with `npm run test:rules` (starts the Firestore emulator; needs Java).
//
// Each attack below worked against the rules deployed before 2026-10-25:
//   - any signed-in user could write role/tenantId on their own /users doc and
//     become master admin (and so platform super admin);
//   - root master-tenant collections checked role only, not tenant, so the
//     admin of any tenant could read the master tenant's retailers and invoices;
//   - portal checks trusted linkedId without checking tenant membership.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
    assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
    collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

const USERS: Record<string, Record<string, unknown>> = {
    masterAdmin:  { role: 'admin', tenantId: 'master' },
    masterShop:   { role: 'shopkeeper', tenantId: 'master' },
    masterPortal: { role: 'retailer', tenantId: 'master', linkedId: 'r1' },
    alice:        { role: 'admin', tenantId: 'tenant_alice' },          // another business's owner
    aliceShop:    { role: 'shopkeeper', tenantId: 'tenant_alice' },
    alicePortal:  { role: 'retailer', tenantId: 'tenant_alice', linkedId: 'ra1' },
    // Portal users alice could mint in her own tenant, pointed at other tenants' ids.
    aliceSpyR1:   { role: 'retailer', tenantId: 'tenant_alice', linkedId: 'r1' },
    aliceSpyRb1:  { role: 'retailer', tenantId: 'tenant_alice', linkedId: 'rb1' },
    fresh:        { role: 'admin' },                                    // signed up, not onboarded
};

const as = (uid: string, email = `${uid}@example.com`) =>
    env.authenticatedContext(uid, { email }).firestore();

beforeAll(async () => {
    // emulators:exec exports FIRESTORE_EMULATOR_HOST; fall back to firebase.json's port.
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
    env = await initializeTestEnvironment({
        projectId: 'demo-erp-rules',
        firestore: {
            // RULES_FILE lets the suite run against another ruleset, e.g. the deployed one.
            rules: readFileSync(process.env.RULES_FILE ?? resolve(__dirname, '../../firestore.rules'), 'utf8'),
            host,
            port: Number(port),
        },
    });
});

afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        for (const [uid, data] of Object.entries(USERS)) await setDoc(doc(db, 'users', uid), data);
        await setDoc(doc(db, 'tenants', 'tenant_alice'), { ownerId: 'alice' });
        await setDoc(doc(db, 'tenants', 'tenant_bob'), { ownerId: 'bob' });
        // Master tenant data lives at the root.
        await setDoc(doc(db, 'retailers', 'r1'), { name: 'Master retailer' });
        await setDoc(doc(db, 'retailers', 'r1', 'payments', 'pay1'), { amount: 100 });
        await setDoc(doc(db, 'manufacturers', 'm1'), { name: 'Master mfr' });
        await setDoc(doc(db, 'salesOrders', 'so1'), { retailerId: 'r1', grandTotal: 5000 });
        await setDoc(doc(db, 'orders', 'o1'), { retailerId: 'r1' });
        await setDoc(doc(db, 'products', 'p1'), { name: 'Urea', purchasePrice: 240 });
        await setDoc(doc(db, 'onlineOrders', 'oo1'), { total: 10 });
        await setDoc(doc(db, 'accounts', 'r1'), { arBalance: 0, apBalance: 0 });
        // Other tenants.
        await setDoc(doc(db, 'tenants', 'tenant_alice', 'retailers', 'ra1'), { name: 'Alice retailer' });
        await setDoc(doc(db, 'tenants', 'tenant_bob', 'retailers', 'rb1'), { name: 'Bob retailer' });
        await setDoc(doc(db, 'tenants', 'tenant_bob', 'salesOrders', 'sob1'), { retailerId: 'rb1' });
    });
});

describe('/users self-writes cannot grant privilege', () => {
    it('a new user cannot create their doc already inside a tenant', async () => {
        await assertFails(setDoc(doc(as('mallory'), 'users', 'mallory'), { role: 'admin', tenantId: 'master' }));
        await assertFails(setDoc(doc(as('mallory'), 'users', 'mallory'), { role: 'admin', tenantId: 'tenant_bob' }));
        await assertFails(setDoc(doc(as('mallory'), 'users', 'mallory'), { role: 'retailer', linkedId: 'r1' }));
    });

    it('a tenantless user cannot move themselves into an existing tenant', async () => {
        const db = as('fresh');
        await assertFails(updateDoc(doc(db, 'users', 'fresh'), { tenantId: 'master' }));
        await assertFails(updateDoc(doc(db, 'users', 'fresh'), { tenantId: 'master', role: 'admin' }));
        await assertFails(updateDoc(doc(db, 'users', 'fresh'), { tenantId: 'tenant_alice', role: 'admin' }));
        await assertFails(updateDoc(doc(db, 'users', 'fresh'), { linkedId: 'r1', role: 'retailer' }));
    });

    it('a tenant member cannot change their own role, tenant, link or data scope', async () => {
        const db = as('aliceShop');
        await assertFails(updateDoc(doc(db, 'users', 'aliceShop'), { role: 'admin' }));
        await assertFails(updateDoc(doc(db, 'users', 'aliceShop'), { tenantId: 'master' }));
        await assertFails(updateDoc(doc(db, 'users', 'aliceShop'), { linkedId: 'r1' }));
        await assertFails(updateDoc(doc(db, 'users', 'aliceShop'), { assignedRetailers: ['ra1'] }));
        await assertFails(setDoc(doc(db, 'users', 'aliceShop'), { role: 'admin', tenantId: 'tenant_alice' }));
    });

    it('a tenant member may still edit their own profile fields', async () => {
        await assertSucceeds(updateDoc(doc(as('aliceShop'), 'users', 'aliceShop'), { name: 'Sam', phone: '9999999999' }));
    });

    it('cannot claim a tenant they did not create', async () => {
        // tenant_<uid> that does not exist yet.
        await assertFails(updateDoc(doc(as('fresh'), 'users', 'fresh'), { tenantId: 'tenant_fresh', role: 'admin' }));
        // Someone else's tenant id under the tenant_<uid> naming.
        await env.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'tenants', 'tenant_fresh'), { ownerId: 'someoneElse' });
        });
        await assertFails(updateDoc(doc(as('fresh'), 'users', 'fresh'), { tenantId: 'tenant_fresh', role: 'admin' }));
    });

    it('a tenant member cannot jump to a fresh tenant of their own', async () => {
        await assertSucceeds(setDoc(doc(as('aliceShop'), 'tenants', 'tenant_aliceShop'), { ownerId: 'aliceShop' }));
        await assertFails(updateDoc(doc(as('aliceShop'), 'users', 'aliceShop'), { tenantId: 'tenant_aliceShop', role: 'admin' }));
    });
});

describe('legitimate sign-up and onboarding still work', () => {
    it('sign-up and first-login writes may race in either order', async () => {
        const db = as('newbie');
        // AuthContext first-login create, then LoginPage sign-up overwrite.
        await assertSucceeds(setDoc(doc(db, 'users', 'newbie'), { role: 'analyst', tenantId: null, linkedId: null }, { merge: true }));
        await assertSucceeds(setDoc(doc(db, 'users', 'newbie'), { role: 'admin', name: 'New', email: 'newbie@example.com' }));
        // And the reverse order.
        await assertSucceeds(setDoc(doc(db, 'users', 'newbie'), { role: 'analyst', tenantId: null, linkedId: null }, { merge: true }));
    });

    it('ClientOnboardingPage: create own tenant, become its admin, seed products', async () => {
        const db = as('newbie');
        await assertSucceeds(setDoc(doc(db, 'users', 'newbie'), { role: 'admin', name: 'New' }));
        await assertSucceeds(setDoc(doc(db, 'tenants', 'tenant_newbie'), { businessName: 'New Shop', ownerId: 'newbie' }));
        await assertSucceeds(updateDoc(doc(db, 'users', 'newbie'), { tenantId: 'tenant_newbie', role: 'admin' }));
        const batch = writeBatch(db);
        batch.set(doc(collection(db, 'tenants', 'tenant_newbie', 'products')), { name: 'DAP' });
        await assertSucceeds(batch.commit());
    });

    it('a tenant can only be created under the caller\'s own uid', async () => {
        await assertFails(setDoc(doc(as('newbie'), 'tenants', 'tenant_alice2'), { ownerId: 'newbie' }));
    });
});

describe('tenant admins manage users only inside their own tenant', () => {
    it('alice creates and re-roles staff in tenant_alice', async () => {
        const db = as('alice');
        await assertSucceeds(setDoc(doc(db, 'users', 'staff1'), { role: 'sales', tenantId: 'tenant_alice' }));
        await assertSucceeds(updateDoc(doc(db, 'users', 'aliceShop'), { role: 'analyst' }));
        await assertSucceeds(updateDoc(doc(db, 'users', 'aliceShop'), { assignedRetailers: ['ra1'] }));
    });

    it('alice cannot create users in, or move users to, another tenant', async () => {
        const db = as('alice');
        await assertFails(setDoc(doc(db, 'users', 'staff2'), { role: 'admin', tenantId: 'master' }));
        await assertFails(updateDoc(doc(db, 'users', 'aliceShop'), { tenantId: 'master' }));
        await assertFails(updateDoc(doc(db, 'users', 'masterShop'), { role: 'admin' }));
        await assertFails(getDoc(doc(db, 'users', 'masterAdmin')));
    });

    it('a tenantless "admin" cannot list or manage other tenantless users', async () => {
        await assertFails(getDocs(query(collection(as('fresh'), 'users'), where('tenantId', '==', null))));
        await assertFails(setDoc(doc(as('fresh'), 'users', 'victim'), { role: 'admin' }));
    });
});

describe('master tenant root collections are closed to other tenants', () => {
    const rootReads: [string, string][] = [
        ['retailers', 'r1'], ['manufacturers', 'm1'], ['salesOrders', 'so1'], ['orders', 'o1'],
        ['products', 'p1'], ['onlineOrders', 'oo1'], ['accounts', 'r1'],
    ];

    it.each(['alice', 'aliceShop', 'fresh', 'aliceSpyR1'])('%s cannot read master root data', async (uid) => {
        const db = as(uid);
        for (const [c, id] of rootReads) await assertFails(getDoc(doc(db, c, id)));
        await assertFails(getDoc(doc(db, 'retailers', 'r1', 'payments', 'pay1')));
    });

    it('another tenant\'s admin cannot write master root data', async () => {
        const db = as('alice');
        await assertFails(setDoc(doc(db, 'salesOrders', 'evil'), { retailerId: 'r1', grandTotal: 1 }));
        await assertFails(updateDoc(doc(db, 'retailers', 'r1'), { name: 'pwned' }));
        await assertFails(deleteDoc(doc(db, 'products', 'p1')));
    });

    it('master staff keep their access', async () => {
        const admin = as('masterAdmin');
        for (const [c, id] of rootReads) await assertSucceeds(getDoc(doc(admin, c, id)));
        await assertSucceeds(setDoc(doc(admin, 'salesOrders', 'so2'), { retailerId: 'r1' }));
        await assertSucceeds(setDoc(doc(as('masterShop'), 'salesOrders', 'so3'), { retailerId: 'r1' }));
        await assertSucceeds(getDoc(doc(as('masterShop'), 'retailers', 'r1')));
    });

    it('a master retailer-portal user still sees their own records', async () => {
        const db = as('masterPortal');
        await assertSucceeds(getDoc(doc(db, 'retailers', 'r1')));
        await assertSucceeds(getDoc(doc(db, 'salesOrders', 'so1')));
        await assertSucceeds(getDoc(doc(db, 'accounts', 'r1')));
    });
});

describe('tenant-scoped data and portal links', () => {
    it('a portal user cannot use linkedId to reach another tenant', async () => {
        await assertFails(getDoc(doc(as('aliceSpyRb1'), 'tenants', 'tenant_bob', 'retailers', 'rb1')));
        await assertFails(getDoc(doc(as('aliceSpyRb1'), 'tenants', 'tenant_bob', 'salesOrders', 'sob1')));
    });

    it('a portal user still reads their own tenant\'s linked record', async () => {
        await assertSucceeds(getDoc(doc(as('alicePortal'), 'tenants', 'tenant_alice', 'retailers', 'ra1')));
    });

    it('tenant admins read their own tenant and not others', async () => {
        await assertSucceeds(getDoc(doc(as('alice'), 'tenants', 'tenant_alice', 'retailers', 'ra1')));
        await assertFails(getDoc(doc(as('alice'), 'tenants', 'tenant_bob', 'retailers', 'rb1')));
    });

    it('the platform super admin can still view any tenant', async () => {
        const db = as('platform', 'superadmin@fiinny.com');
        await assertSucceeds(getDoc(doc(db, 'tenants', 'tenant_bob', 'retailers', 'rb1')));
    });
});
