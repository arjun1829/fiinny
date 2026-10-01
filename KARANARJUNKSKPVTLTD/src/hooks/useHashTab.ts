import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hash-based tab state — syncs the active tab with the URL hash and localStorage.
 *
 * Priority on initial load: URL hash → localStorage → first permitted tab → defaultTab.
 * Switching tabs updates the hash (pushState) so browser Back/Forward work.
 * Refreshing the page reopens the same tab via the hash.
 * localStorage provides a fallback when the page is opened without a hash.
 *
 * @param validTabs   Exhaustive list of valid tab IDs for this module.
 * @param defaultTab  Fallback when no permitted tab can be resolved.
 * @param storageKey  localStorage key — use a unique key per module (e.g. 'fiinny-tab-worklist').
 * @param isAllowed   Optional permission gate (from useFeaturePermissions or a custom
 *                    role check). When provided:
 *                    - Initial resolution skips denied tabs and falls to the first
 *                      permitted one — denied content is never shown on first paint.
 *                    - Hashchange events from the address bar are silently ignored for
 *                      denied tabs so direct-URL navigation cannot bypass permissions.
 *                    - setActiveTab calls for denied tabs are no-ops.
 *                    The function is stored in a ref so it never needs to be in a
 *                    dependency array, which prevents infinite re-renders when the
 *                    caller passes an inline function.
 */
export function useHashTab<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
  storageKey: string,
  isAllowed?: (tab: T) => boolean,
): [T, (tab: T) => void] {
  // Ref keeps the latest permission check accessible inside stable closures without
  // being in their dependency arrays.
  const isAllowedRef = useRef(isAllowed);
  isAllowedRef.current = isAllowed;

  const resolve = (): T => {
    const allowed = isAllowedRef.current ?? (() => true);
    const hash = window.location.hash.slice(1) as T;
    if (validTabs.includes(hash) && allowed(hash)) return hash;
    const stored = localStorage.getItem(storageKey) as T | null;
    if (stored && validTabs.includes(stored) && allowed(stored)) return stored;
    // Fall to the first tab the current role can see.
    const first = validTabs.find(t => allowed(t));
    return first ?? defaultTab;
  };

  const [activeTab, setLocalTab] = useState<T>(resolve);

  const setActiveTab = useCallback(
    (tab: T) => {
      // Block programmatic navigation to a denied tab.
      if (isAllowedRef.current && !isAllowedRef.current(tab)) return;
      history.pushState(null, '', `${window.location.pathname}${window.location.search}#${tab}`);
      localStorage.setItem(storageKey, tab);
      setLocalTab(tab);
    },
    [storageKey],
  );

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1) as T;
      // Only switch when the hash is both a valid tab AND the role is allowed.
      // Denied or unrecognised hashes are silently ignored — the page stays on
      // whichever permitted tab was already active.
      if (validTabs.includes(hash) && (!isAllowedRef.current || isAllowedRef.current(hash))) {
        setLocalTab(hash);
        localStorage.setItem(storageKey, hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [validTabs, storageKey]);

  return [activeTab, setActiveTab];
}
