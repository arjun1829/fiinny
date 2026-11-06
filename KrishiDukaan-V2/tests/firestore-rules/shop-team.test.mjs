import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, writeBatch, increment } from 'firebase/firestore';

const OWNER = '+919000000001', STAFF = '+919000000002', STRANGER = '+919000000003', PAUSED = '+919000000004', ORDERS = '+919000000005', SHOPPAGE = '+919000000006';
const env = await initializeTestEnvironment({ projectId: 'kd-rules-test', firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 } });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const u = (uid, phone, role) => Promise.all([setDoc(doc(db, 'uidIndex', uid), { phone }), setDoc(doc(db, 'users', phone), { role, uid, phone, isPaid: role !== 'customer' })]);
  await u('ownerUid', OWNER, 'retailer');
  await u('staffUid', STAFF, 'customer');
  await u('strangerUid', STRANGER, 'customer');
  await u('pausedUid', PAUSED, 'customer');
  await u('ordersUid', ORDERS, 'customer');
  await u('shopUid', SHOPPAGE, 'customer');
  const rec = (permissions, status = 'active') => ({ ownerPhone: OWNER, ownerUid: 'ownerUid', ownerRole: 'retailer', ownerName: 'Shop', staffName: 'H', permissions, status });
  await setDoc(doc(db, 'staffIndex', STAFF), rec(['products', 'reels']));
  await setDoc(doc(db, 'staffIndex', PAUSED), rec(['products', 'orders', 'reels', 'shopPage', 'analytics'], 'paused'));
  await setDoc(doc(db, 'staffIndex', ORDERS), rec(['orders']));
  await setDoc(doc(db, 'staffIndex', SHOPPAGE), rec(['shopPage']));
  await setDoc(doc(db, 'shopTeams', OWNER, 'members', STAFF), { name: 'H' });
  await setDoc(doc(db, 'products', 'p1'), { ownerId: 'ownerUid', retailerPhone: OWNER, name: 'Urea', price: 10 });
  await setDoc(doc(db, 'products', 'p2'), { ownerId: 'otherUid', retailerPhone: '+919888888888', name: 'DAP', price: 20 });
  await setDoc(doc(db, 'products', 'p3'), { ownerId: 'mfrUid', manufacturerPhone: '+919777777777', name: 'Seed', availability: [{ storeId: 'x', storePhone: '+919888888888', sellingPrice: 5 }] });
  await setDoc(doc(db, 'inventory', 'i1'), { ownerId: 'ownerUid', stockQuantity: 3 });
  await setDoc(doc(db, 'orders', 'o1'), { sellerPhone: OWNER, sellerId: 'ownerUid', customerPhone: STRANGER, status: 'placed', payment: { status: 'paid' } });
  await setDoc(doc(db, 'orders', 'o2'), { sellerPhone: '+919888888888', customerPhone: STRANGER, status: 'placed' });
  await setDoc(doc(db, 'reels', 'r1'), { shopOwnerId: OWNER, caption: 'a', moderationStatus: 'ok' });
  await setDoc(doc(db, 'retailerBrandPages', OWNER), { enabled: false, tagline: 'x' });
  await setDoc(doc(db, 'subscriptions', 's1'), { ownerPhone: OWNER, ownerType: 'retailer' });
  await setDoc(doc(db, 'enquiries', 'e1'), { sellerPhone: OWNER, sellerPhones: [OWNER, '9000000001'], status: 'new' });
  await setDoc(doc(db, 'sellerStats', OWNER), { revenue: 100 });
  await setDoc(doc(db, 'profiles', OWNER), { phone: OWNER, role: 'retailer', shopName: 'Shop' });
  await u('ret2Uid', '+919888888888', 'retailer');
  await setDoc(doc(db, 'reels', 'rv'), { shopOwnerId: '+919888888888', viewsCount: 1, likesCount: 0 });
  await setDoc(doc(db, 'products', 'p4'), { ownerId: 'mfrUid', manufacturerPhone: '+919777777777', name: 'Seed2', availability: [] });
  await setDoc(doc(db, 'inventory', 'i2'), { ownerId: 'ownerUid', stockQuantity: 3 });
});

const as = (uid, phone, staff = false) => env.authenticatedContext(uid, staff ? { phone_number: phone, kdStaff: true } : { phone_number: phone }).firestore();
const owner = as('ownerUid', OWNER), staff = as('staffUid', STAFF, true), stranger = as('strangerUid', STRANGER), paused = as('pausedUid', PAUSED, true), orders = as('ordersUid', ORDERS, true), shop = as('shopUid', SHOPPAGE, true);

let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '-', String(e?.message ?? e).slice(0, 400)); } }

console.log('identity');
await t('helper reads owner uidIndex', assertSucceeds(getDoc(doc(staff, 'uidIndex', 'ownerUid'))));
await t('helper reads owner profile', assertSucceeds(getDoc(doc(staff, 'users', OWNER))));
await t('helper reads missing legacy users/{uid}', assertSucceeds(getDoc(doc(staff, 'users', 'ownerUid'))));
await t('stranger cannot read owner uidIndex', assertFails(getDoc(doc(stranger, 'uidIndex', 'ownerUid'))));
await t('stranger cannot read owner profile', assertFails(getDoc(doc(stranger, 'users', OWNER))));
await t('paused helper cannot read owner profile', assertFails(getDoc(doc(paused, 'users', OWNER))));
await t('helper reads own staffIndex', assertSucceeds(getDoc(doc(staff, 'staffIndex', STAFF))));
await t('helper cannot read other staffIndex', assertFails(getDoc(doc(staff, 'staffIndex', ORDERS))));
await t('helper cannot write staffIndex', assertFails(updateDoc(doc(staff, 'staffIndex', STAFF), { permissions: ['orders'] })));
await t('owner reads team list', assertSucceeds(getDocs(collection(owner, 'shopTeams', OWNER, 'members'))));
await t('helper cannot read team list', assertFails(getDocs(collection(staff, 'shopTeams', OWNER, 'members'))));

console.log('products');
await t('owner edits own product', assertSucceeds(updateDoc(doc(owner, 'products', 'p1'), { price: 11 })));
await t('helper edits shop product', assertSucceeds(updateDoc(doc(staff, 'products', 'p1'), { price: 12 })));
await t('helper cannot change product identity (canonicalId)', assertFails(updateDoc(doc(staff, 'products', 'p1'), { canonicalId: 'other-product' })));
await t('helper cannot edit other shop product', assertFails(updateDoc(doc(staff, 'products', 'p2'), { price: 1 })));
await t('stranger cannot edit shop product', assertFails(updateDoc(doc(stranger, 'products', 'p1'), { price: 1 })));
await t('orders-only helper cannot edit product', assertFails(updateDoc(doc(orders, 'products', 'p1'), { price: 1 })));
await t('paused helper cannot edit product', assertFails(updateDoc(doc(paused, 'products', 'p1'), { price: 1 })));
await t('helper adds shop entry to other seller availability', assertSucceeds(updateDoc(doc(staff, 'products', 'p3'), { availability: [{ storeId: 'x', storePhone: '+919888888888', sellingPrice: 5 }, { storeId: OWNER, storePhone: OWNER, sellingPrice: 7 }] })));
await t('helper cannot change another seller entry', assertFails(updateDoc(doc(staff, 'products', 'p3'), { availability: [{ storeId: 'x', storePhone: '+919888888888', sellingPrice: 1 }, { storeId: OWNER, storePhone: OWNER, sellingPrice: 7 }] })));
await t('helper updates inventory', assertSucceeds(updateDoc(doc(staff, 'inventory', 'i1'), { stockQuantity: 9 })));
await t('stranger cannot update inventory', assertFails(updateDoc(doc(stranger, 'inventory', 'i1'), { stockQuantity: 0 })));
await t('helper writes retailers/{shop}/products', assertSucceeds(setDoc(doc(staff, 'retailers', OWNER, 'products', 'x'), { a: 1 })));
await t('helper creates seat listing for shop', assertSucceeds(setDoc(doc(staff, 'retailerSeatListings', 'l1'), { ownerId: 'ownerUid', productId: 'p1' })));
await t('helper cannot create seat listing for other shop', assertFails(setDoc(doc(staff, 'retailerSeatListings', 'l2'), { ownerId: 'otherUid' })));
await t('helper lists shop inventory by ownerId', assertSucceeds(getDocs(query(collection(staff, 'inventory'), where('ownerId', '==', 'ownerUid')))));
await t('stranger cannot list shop inventory', assertFails(getDocs(query(collection(stranger, 'inventory'), where('ownerId', '==', 'ownerUid')))));
await t('helper lists shop seat listings', assertSucceeds(getDocs(query(collection(staff, 'retailerSeatListings'), where('ownerId', '==', 'ownerUid')))));
await t('helper reads shop subscription', assertSucceeds(getDoc(doc(staff, 'subscriptions', 's1'))));
await t('stranger cannot read shop subscription', assertFails(getDoc(doc(stranger, 'subscriptions', 's1'))));
await t('helper deletes shop product', assertSucceeds(deleteDoc(doc(staff, 'products', 'p1'))));

console.log('orders');
await t('products-only helper cannot read order', assertFails(getDoc(doc(staff, 'orders', 'o1'))));
await t('orders helper reads order', assertSucceeds(getDoc(doc(orders, 'orders', 'o1'))));
await t('orders helper lists shop orders', assertSucceeds(getDocs(query(collection(orders, 'orders'), where('sellerPhone', '==', OWNER)))));
await t('orders helper cannot read other shop order', assertFails(getDoc(doc(orders, 'orders', 'o2'))));
await t('orders helper cannot change payment', assertFails(updateDoc(doc(orders, 'orders', 'o1'), { status: 'accepted', payment: { status: 'refunded' } })));
await t('orders helper cannot reject directly', assertFails(updateDoc(doc(orders, 'orders', 'o1'), { status: 'rejected' })));
await t('orders helper accepts order', assertSucceeds(updateDoc(doc(orders, 'orders', 'o1'), { status: 'accepted' })));
await t('owner dispatches order', assertSucceeds(updateDoc(doc(owner, 'orders', 'o1'), { status: 'dispatched' })));
await t('paused helper cannot read order', assertFails(getDoc(doc(paused, 'orders', 'o1'))));
await t('orders helper lists enquiries', assertSucceeds(getDocs(query(collection(orders, 'enquiries'), where('sellerPhones', 'array-contains', OWNER)))));
await t('products helper cannot list enquiries', assertFails(getDocs(query(collection(staff, 'enquiries'), where('sellerPhones', 'array-contains', OWNER)))));
await t('orders helper updates enquiry status', assertSucceeds(updateDoc(doc(orders, 'enquiries', 'e1'), { status: 'contacted' })));

console.log('reels / shop page / analytics');
await t('reels helper creates shop reel', assertSucceeds(setDoc(doc(staff, 'reels', 'r2'), { shopOwnerId: OWNER, caption: 'b' })));
await t('reels helper cannot create reel for other shop', assertFails(setDoc(doc(staff, 'reels', 'r3'), { shopOwnerId: '+919888888888' })));
await t('reels helper cannot clear moderation', assertFails(updateDoc(doc(staff, 'reels', 'r1'), { moderationStatus: 'cleared' })));
await t('reels helper edits caption', assertSucceeds(updateDoc(doc(staff, 'reels', 'r1'), { caption: 'c' })));
await t('orders helper cannot delete reel', assertFails(deleteDoc(doc(orders, 'reels', 'r1'))));
await t('reels helper deletes reel', assertSucceeds(deleteDoc(doc(staff, 'reels', 'r1'))));
await t('shopPage helper reads hidden brand page', assertSucceeds(getDoc(doc(shop, 'retailerBrandPages', OWNER))));
await t('shopPage helper edits brand page', assertSucceeds(setDoc(doc(shop, 'retailerBrandPages', OWNER), { enabled: true, tagline: 'Best seeds' })));
await t('products helper cannot edit brand page', assertFails(setDoc(doc(staff, 'retailerBrandPages', OWNER), { enabled: true, tagline: 'x' })));
await t('helper without analytics cannot read sellerStats', assertFails(getDoc(doc(staff, 'sellerStats', OWNER))));
await t('owner reads sellerStats', assertSucceeds(getDoc(doc(owner, 'sellerStats', OWNER))));

console.log('web add-product batch (inventory-firestore.ts)');
async function addProductBatch(db, ownerPhone) {
  const b = writeBatch(db);
  b.set(doc(db, 'products', 'np1'), { ownerId: 'ownerUid', retailerId: 'ownerUid', ownerPhone, name: 'New', price: 5 });
  b.set(doc(db, 'inventory', 'ni1'), { ownerId: 'ownerUid', productId: 'np1', stockQuantity: 4 });
  b.set(doc(db, 'retailerSeatListings', 'nl1'), { ownerId: 'ownerUid', retailerId: 'ownerUid', productId: 'np1' });
  b.set(doc(db, 'users', ownerPhone), { productCount: increment(1), updatedAt: serverTimestamp() }, { merge: true });
  b.set(doc(db, 'retailers', ownerPhone, 'products', 'np1'), { productId: 'np1', name: 'New' });
  b.set(doc(db, 'profiles', ownerPhone), { phone: ownerPhone, role: 'retailer', updatedAt: serverTimestamp() }, { merge: true });
  return b.commit();
}
await t('helper adds a product (whole batch)', assertSucceeds(addProductBatch(staff, OWNER)));
await t('orders-only helper cannot add a product', assertFails(addProductBatch(orders, OWNER)));
await t('helper cannot change owner plan via users doc', assertFails(updateDoc(doc(staff, 'users', OWNER), { isPaid: true, totalSeats: 99 })));
await t('helper cannot change owner role via profiles', assertFails(updateDoc(doc(staff, 'profiles', OWNER), { role: 'manufacturer' })));

console.log('forged flag / regressions');
const forged = as('forgedUid', '+919000000007', true);
await t('forged kdStaff flag without team record gets nothing', assertFails(updateDoc(doc(forged, 'products', 'p2'), { price: 0 })));
await t('forged kdStaff flag cannot read shop order', assertFails(getDoc(doc(forged, 'orders', 'o1'))));
await t('shopper bumps reel views (no staff cost path)', assertSucceeds(updateDoc(doc(stranger, 'reels', 'rv'), { viewsCount: 2 })));
await t('shopper bumps product counters', assertSucceeds(updateDoc(doc(stranger, 'products', 'p2'), { impressions: 1 })));
const ret2 = as('ret2Uid', '+919888888888');
await t('normal retailer adds own availability entry', assertSucceeds(updateDoc(doc(ret2, 'products', 'p4'), { availability: [{ storeId: 'ret2Uid', storePhone: '+919888888888', sellingPrice: 9 }] })));
await t('owner updates inventory', assertSucceeds(updateDoc(doc(owner, 'inventory', 'i2'), { stockQuantity: 1 })));
await t('owner reads own reels-free path: owner edits reel', assertSucceeds(updateDoc(doc(ret2, 'reels', 'rv'), { caption: 'mine' })));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
