"use client";

/**
 * Cached accessors for the admin portal's remaining collection reads.
 *
 * Tables load 50 rows at a time (use-paged-query.ts) and search with queries
 * (admin-queries.ts); what is left here is small or explicitly whole:
 *  - getUsers: every user, only for the WhatsApp "App update" and "Reel promo"
 *    templates, whose audience is every user (read when that template opens).
 *  - getPlans: the few subscription plans.
 *  - getRoleCounts: count queries for the Users tab chips.
 *
 * Pass `force` (wired to each page's Refresh button) to bypass the cache.
 */

import {
  fetchAllUsers,
  fetchAllPlans,
  fetchUserRoleCounts,
} from "../../firebase";
import { CACHE_KEYS, cachedFetch, cacheAge, invalidateCache } from "./admin-cache";

export { CACHE_KEYS, cacheAge, invalidateCache } from "./admin-cache";

type Opts = { force?: boolean };

export function getUsers(opts: Opts = {}): Promise<any[]> {
  return cachedFetch(CACHE_KEYS.users, fetchAllUsers, opts);
}

export function getPlans(opts: Opts = {}): Promise<any[]> {
  return cachedFetch(CACHE_KEYS.plans, fetchAllPlans, opts);
}

export function getRoleCounts(opts: Opts = {}) {
  return cachedFetch(CACHE_KEYS.roleCounts, fetchUserRoleCounts, opts);
}

/** Call after any admin write that changes the users collection. */
export function invalidateUsers() {
  invalidateCache(CACHE_KEYS.users);
  invalidateCache(CACHE_KEYS.roleCounts);
}

/** Call after any admin write that changes the products collection. */
export function invalidateProducts() {
  invalidateCache(CACHE_KEYS.products);
}

/** Call after any admin write that changes subscriptions. */
export function invalidateSubscriptions() {
  invalidateCache(CACHE_KEYS.subscriptions);
}

/** Newest cache timestamp across a set of datasets — drives the "Updated …" label. */
export function newestAge(...keys: string[]): number | null {
  const ages = keys.map(cacheAge).filter((a): a is number => a !== null);
  return ages.length ? Math.max(...ages) : null;
}
