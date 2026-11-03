// Firestore rules tests for the writes the Flutter app (krishidukan_erp_app)
// makes. Each case replays the exact documents one mobile action touches —
// see lib/features/billing/billing_repository.dart and
// lib/features/customers/customers_repository.dart — and checks it against
// the role matrix in lib/core/roles.dart: the app must never offer an action
// these rules reject halfway through, and a role the app blocks must also be
// blocked here.
//
// Run with `npm run test:rules` (starts the Firestore emulator; needs Java).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
    assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
    collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch,
    type Firestore,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

const USERS: Record<string, Record<string, unknown>> = {
    admin:   { role: 'admin', tenantId: 'master', name: 'Admin' },
    analyst: { role: 'analyst', tenantId: 'master', name: 'Analyst' },
    shop:    { role: 'shopkeeper', tenantId: 'master', name: 'Shop' },
    sales:   { role: 'sales', tenantId: 'master', name: 'Sales', assignedRetailers: ['r1'] },
    portal:  { role: 'retailer', tenantId: 'master', linkedId: 'r1' },
    alice:   { role: 'admin', tenantId: 'tenant_alice', name: 'Alice' },
};

const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore();

// tenantPath.ts / lib/core/tenant_path.dart: master lives at the root.
const col = (db: Firestore, tenant: string, name: string) =>
    tenant === 'master' ? collection(db, name) : collection(db, 'tenants', tenant, name);
const ref = (db: Firestore, tenant: string, name: string, id: string) => doc(col(db, tenant, name), id);

beforeAll(async () => {
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
    env = await initializeTestEnvironment({
        projectId: 'demo-erp-mobile-rules',
        firestore: {
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
        for (const t of ['master', 'tenant_alice']) {
            await setDoc(ref(db, t, 'products', 'p1'), { name: 'Urea', loosePieces: 30, sellingPrice: 266.5 });
            await setDoc(ref(db, t, 'inventoryBatches', 'b1'), { productId: 'p1', batchNumber: 'B1', quantity: 30 });
            await setDoc(ref(db, t, 'retailers', 'r1'), { name: 'Shree Agro', totalSales: 0, totalPaid: 0, outstandingAmount: 0 });
            await setDoc(ref(db, t, 'counters', 'posBillCounter'), { lastBillNumber: 41 });
            await setDoc(ref(db, t, 'counters', 'b2bInvoiceCounter'), { lastInvoiceNumber: 9 });
            await setDoc(ref(db, t, 'salesOrders', 'khata1'), { retailerName: 'Ramesh', grandTotal: 800, amountPaid: 300 });
        }
    });
});

/** BillingRepository.createPosBill — one atomic commit. */
function posSale(db: Firestore, tenant = 'master') {
    const b = writeBatch(db);
    b.set(ref(db, tenant, 'counters', 'posBillCounter'), { lastBillNumber: 42 }, { merge: true });
    b.set(doc(col(db, tenant, 'salesOrders')), {
        orderNumber: 'KA-0042', retailerName: 'Shree Agro', retailerId: 'r1', grandTotal: 533,
        amountPaid: 533, paymentStatus: 'Paid', paymentMethod: 'Cash', status: 'delivered',
        lineItems: [{ productId: 'p1', productName: 'Urea', quantity: 2, mrp: 266.5, amount: 533 }],
        createdAt: serverTimestamp(), invoiceDate: '2026-10-31',
    });
    b.update(ref(db, tenant, 'inventoryBatches', 'b1'), { quantity: 28, updatedAt: serverTimestamp() });
    b.update(ref(db, tenant, 'products', 'p1'), { loosePieces: 28, updatedAt: serverTimestamp() });
    b.update(ref(db, tenant, 'retailers', 'r1'), { totalSales: 533, totalPaid: 533, outstandingAmount: 0, lastOrderedAt: serverTimestamp() });
    return b.commit();
}

/** BillingRepository.createB2bInvoice with a Cash auto-payment. */
function b2bCashInvoice(db: Firestore, tenant = 'master') {
    const b = writeBatch(db);
    const order = doc(col(db, tenant, 'salesOrders'));
    b.set(ref(db, tenant, 'counters', 'b2bInvoiceCounter'), { lastInvoiceNumber: 10 }, { merge: true });
    b.set(order, {
        orderNumber: 'SIPL/26-27/010', invoiceType: 'B2B_GST', retailerId: 'r1', netAmount: 750, grandTotal: 750,
        status: 'paid', paymentStatus: 'Paid', amountPaid: 750, createdAt: serverTimestamp(),
    });
    b.update(ref(db, tenant, 'inventoryBatches', 'b1'), { quantity: 27, updatedAt: serverTimestamp() });
    b.update(ref(db, tenant, 'products', 'p1'), { loosePieces: 27, updatedAt: serverTimestamp() });
    b.update(ref(db, tenant, 'retailers', 'r1'), { totalSales: 750, totalPaid: 750, outstandingAmount: 0, lastOrderedAt: serverTimestamp() });
    b.set(doc(collection(ref(db, tenant, 'retailers', 'r1'), 'payments')), {
        amount: 750, paymentMethod: 'Cash', orderId: order.id, source: 'b2b_invoice_cash', createdAt: serverTimestamp(),
    });
    return b.commit();
}

/** CustomersRepository.recordPartnerPayment. */
function partnerPayment(db: Firestore, tenant = 'master') {
    const b = writeBatch(db);
    b.set(ref(db, tenant, 'settings', 'paymentCounter'), { seq_2026: 1 }, { merge: true });
    b.set(doc(collection(ref(db, tenant, 'retailers', 'r1'), 'payments')), {
        paymentId: 'PAY-2026-0001', amount: 1000, paymentMethod: 'UPI', unallocatedAmount: 1000, createdAt: serverTimestamp(),
    });
    b.update(ref(db, tenant, 'retailers', 'r1'), { totalPaid: 1000, outstandingAmount: 0 });
    return b.commit();
}

/** CustomersRepository.collectKhataPayment. */
function khataCollection(db: Firestore, tenant = 'master') {
    const b = writeBatch(db);
    b.update(ref(db, tenant, 'salesOrders', 'khata1'), {
        amountPaid: 800, paymentStatus: 'Paid', paymentMethod: 'Cash', paymentDate: '2026-10-31', updatedAt: serverTimestamp(),
    });
    return b.commit();
}

describe('billing (POS + B2B): admin/analyst only, because stock moves in the same commit', () => {
    it('admin and analyst can bill', async () => {
        await assertSucceeds(posSale(as('admin')));
        await assertSucceeds(b2bCashInvoice(as('analyst')));
    });
    it('shopkeeper cannot (products/inventoryBatches are admin-only) — app hides billing', async () => {
        await assertFails(posSale(as('shop')));
        await assertFails(b2bCashInvoice(as('shop')));
    });
    it('sales and portal users cannot', async () => {
        await assertFails(posSale(as('sales')));
        await assertFails(posSale(as('portal')));
    });
    it('a sale is all-or-nothing: the rejected shopkeeper sale left no bill and no counter bump', async () => {
        await assertFails(posSale(as('shop')));
        const db = as('admin');
        const counter = await getDoc(doc(db, 'counters', 'posBillCounter'));
        if (counter.data()?.lastBillNumber !== 41) throw new Error('counter moved on a rejected sale');
        const bills = await getDocs(query(collection(db, 'salesOrders'), where('orderNumber', '==', 'KA-0042')));
        if (!bills.empty) throw new Error('half-saved bill exists');
    });
});

describe('payments', () => {
    it('partner payments: admin only', async () => {
        await assertSucceeds(partnerPayment(as('admin')));
        await assertFails(partnerPayment(as('shop')));
        await assertFails(partnerPayment(as('sales')));
    });
    it('khata collection: admin and shopkeeper', async () => {
        await assertSucceeds(khataCollection(as('admin')));
        await assertSucceeds(khataCollection(as('shop')));
        await assertFails(khataCollection(as('portal')));
    });
});

describe('masters', () => {
    it('products: admin writes; shopkeeper and sales only read', async () => {
        await assertSucceeds(setDoc(doc(collection(as('admin'), 'products')), { name: 'New', productNumber: 'KA-004' }));
        await assertFails(setDoc(doc(collection(as('shop'), 'products')), { name: 'New' }));
        await assertSucceeds(getDocs(collection(as('sales'), 'products')));
    });
    it('customers: admin and shopkeeper write; sales reads only', async () => {
        await assertSucceeds(setDoc(doc(collection(as('shop'), 'retailers')), { name: 'Walk-in', channel: 'pos' }));
        await assertFails(setDoc(doc(collection(as('sales'), 'retailers')), { name: 'X' }));
        await assertSucceeds(getDocs(collection(as('sales'), 'retailers')));
    });
    it('batches: shopkeeper reads, sales does not (app hides batches for sales)', async () => {
        await assertSucceeds(getDocs(query(collection(as('shop'), 'inventoryBatches'), where('productId', '==', 'p1'))));
        await assertFails(getDocs(query(collection(as('sales'), 'inventoryBatches'), where('productId', '==', 'p1'))));
    });
    it('payments ledger is hidden from sales (app falls back to the cached balance)', async () => {
        await assertFails(getDocs(collection(doc(as('sales'), 'retailers', 'r1'), 'payments')));
    });
    it('salesperson list: admin can list its own tenant users', async () => {
        await assertSucceeds(getDocs(query(collection(as('admin'), 'users'),
            where('tenantId', '==', 'master'), where('role', '==', 'sales'))));
    });
    it('audit log and stock movements', async () => {
        await assertSucceeds(setDoc(doc(collection(as('shop'), 'auditLogs')), { module: 'POS Billing', action: 'Create' }));
        await assertSucceeds(setDoc(doc(collection(as('admin'), 'stockMovements')), { productId: 'p1', qtyOut: 2 }));
    });
});

describe('ledgers & records screens', () => {
    /** CustomersRepository.addUdhari — salesOrders + retailers upsert. */
    const addUdhari = async (db: Firestore) => {
        await setDoc(doc(collection(db, 'salesOrders')), {
            retailerName: 'Walk-in', phoneNumber: '9123456780', grandTotal: 200, amountPaid: 0,
            source: 'khata', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        await setDoc(doc(collection(db, 'retailers')), { name: 'Walk-in', number: '9123456780', channel: 'pos', totalSales: 0 });
    };
    it('Add Udhari: admin and shopkeeper; not sales (no retailers write)', async () => {
        await assertSucceeds(addUdhari(as('admin')));
        await assertSucceeds(addUdhari(as('shop')));
        await assertFails(addUdhari(as('sales')));
    });
    it('Khata table reads every salesOrder: admin and shopkeeper', async () => {
        await assertSucceeds(getDocs(collection(as('shop'), 'salesOrders')));
    });
    it('expenses: admin/analyst only (create, edit, delete)', async () => {
        const ref = doc(collection(as('admin'), 'expenses'));
        await assertSucceeds(setDoc(ref, { name: 'Diesel', category: 'Travel', amount: 500, date: '2026-10-31' }));
        await assertFails(setDoc(doc(collection(as('shop'), 'expenses')), { name: 'x', amount: 1 }));
        await assertFails(getDocs(collection(as('shop'), 'expenses')));
    });
    it('supplier ledger, stock movement, online orders: admin/analyst read only', async () => {
        for (const name of ['suppliers', 'supplierInvoices', 'supplierPayments', 'purchaseOrders', 'stockMovements', 'onlineOrders']) {
            await assertSucceeds(getDocs(collection(as('analyst'), name)));
            await assertFails(getDocs(collection(as('shop'), name)));
            await assertFails(getDocs(collection(as('sales'), name)));
        }
    });
});

describe('tenant isolation for a new customer business', () => {
    it('a non-master tenant bills inside its own /tenants path', async () => {
        await assertSucceeds(posSale(as('alice'), 'tenant_alice'));
        await assertSucceeds(b2bCashInvoice(as('alice'), 'tenant_alice'));
        await assertSucceeds(partnerPayment(as('alice'), 'tenant_alice'));
    });
    it('…and can never touch the master books', async () => {
        await assertFails(posSale(as('alice')));
        await assertFails(getDocs(collection(as('alice'), 'retailers')));
        await assertFails(getDocs(collection(as('alice'), 'salesOrders')));
    });
    it('master staff can never touch another tenant', async () => {
        await assertFails(posSale(as('admin'), 'tenant_alice'));
        await assertFails(getDocs(collection(as('admin'), 'tenants', 'tenant_alice', 'retailers')));
    });
});
