/**
 * Cursor pagination by COMPLETE product-name groups.
 *
 * Marketplace cards are deduped by product name (manufacturer + retailer + admin
 * copies of one name collapse into a single card — see marketplace-merge.ts). To
 * paginate without ever splitting a card across two pages, we read raw docs
 * ordered by `name` (so every copy of a name is adjacent) and only emit
 * name-groups we know are whole: a group is complete once a later (greater) name
 * has appeared, or the collection has ended.
 *
 * This is a pure function — the caller injects `fetchChunk` (one bounded
 * Firestore query with startAfter) so the algorithm is trivially testable.
 */

export type PageDoc<T> = { id: string; name: string; data: T };
export type GroupCursor = { name: string; id: string };

export interface CollectOptions {
  pageSize: number;
  /** Raw docs read per internal query (a page needs a few extra for copies). */
  chunk: number;
  /** Safety cap so one giant name-group can't loop forever. */
  maxChunks: number;
  startCursor: GroupCursor | null;
}

export interface CollectResult<T> {
  /** Raw docs of the emitted (complete) name-groups, in order. */
  emitted: PageDoc<T>[];
  /** Cursor to pass as startCursor for the next page, or null at the end. */
  nextCursor: GroupCursor | null;
  hasMore: boolean;
  /** Diagnostics. */
  rawDocsRead: number;
  /** The last raw doc actually consumed from Firestore this call (may be beyond
   *  the last emitted group — those extra groups are re-read next page). */
  lastConsumedCursor: GroupCursor | null;
  /** Total name-groups seen this call (emitted + held-back). */
  groupsSeen: number;
}

const nameKeyOf = (name: string) => name.toLowerCase().trim();

export async function collectNameGroups<T>(
  fetchChunk: (after: GroupCursor | null, limit: number) => Promise<PageDoc<T>[]>,
  opts: CollectOptions,
): Promise<CollectResult<T>> {
  const { pageSize, chunk, maxChunks } = opts;

  const groupOrder: string[] = [];
  const groupDocs = new Map<string, PageDoc<T>[]>();
  let last: GroupCursor | null = opts.startCursor;
  let reachedEnd = false;
  let rawDocsRead = 0;

  for (let i = 0; i < maxChunks; i++) {
    const docs = await fetchChunk(last, chunk);
    if (docs.length === 0) {
      reachedEnd = true;
      break;
    }
    rawDocsRead += docs.length;
    for (const doc of docs) {
      const key = nameKeyOf(doc.name);
      if (!groupDocs.has(key)) {
        groupDocs.set(key, []);
        groupOrder.push(key);
      }
      groupDocs.get(key)!.push(doc);
      last = { name: doc.name, id: doc.id };
    }
    if (docs.length < chunk) {
      reachedEnd = true;
      break;
    }
    // A group is known-complete only once a later group has begun, so complete
    // groups = (total groups − 1) until the collection ends.
    if (groupOrder.length - 1 >= pageSize) break;
  }

  const lastConsumedCursor = last;
  const completeGroups = reachedEnd ? groupOrder.length : Math.max(0, groupOrder.length - 1);
  let emitKeys = groupOrder.slice(0, Math.min(pageSize, completeGroups));
  let emitted = emitKeys.flatMap((k) => groupDocs.get(k)!);

  // Progress guard: we read a full window but held EVERY group back as
  // "possibly incomplete" (a single oversized name-group filled the whole read
  // budget). Emitting nothing here would set hasMore=false and terminate the
  // whole feed early. Emit what we have and advance by the last consumed doc so
  // the next page continues instead of stopping.
  if (!reachedEnd && emitted.length === 0 && groupOrder.length > 0) {
    emitKeys = groupOrder.slice();
    emitted = emitKeys.flatMap((k) => groupDocs.get(k)!);
    return {
      emitted,
      nextCursor: lastConsumedCursor,
      hasMore: true,
      rawDocsRead,
      lastConsumedCursor,
      groupsSeen: groupOrder.length,
    };
  }

  const lastDoc = emitted[emitted.length - 1];
  const nextCursor = lastDoc ? { name: lastDoc.name, id: lastDoc.id } : null;

  // More pages exist if we deliberately held groups back, or the collection
  // wasn't exhausted. If nothing was emitted, there is nothing more.
  const hasMore = emitted.length > 0 && (emitKeys.length < groupOrder.length || !reachedEnd);

  return {
    emitted,
    nextCursor: hasMore ? nextCursor : null,
    hasMore,
    rawDocsRead,
    lastConsumedCursor,
    groupsSeen: groupOrder.length,
  };
}

/**
 * Cursor pagination over name-groups that MATCH a predicate — the server-side
 * search path. Same completeness discipline as collectNameGroups (a group is
 * only finalized once a greater name has appeared, or the collection ends), but
 * only groups for which `matches(groupDocs)` returns true count toward pageSize
 * and are emitted. Non-matching complete groups are skipped yet still advance the
 * scan cursor so they are never re-read.
 *
 * Firestore can't substring-search, so this scans name-ordered chunks server-side
 * (Admin SDK) and filters in memory. The browser never reads the collection — it
 * just requests `?search=<query>&cursor=<opaque>` pages like any other feed page.
 */
export async function collectMatchingNameGroups<T>(
  fetchChunk: (after: GroupCursor | null, limit: number) => Promise<PageDoc<T>[]>,
  matches: (docs: PageDoc<T>[]) => boolean,
  opts: CollectOptions,
): Promise<CollectResult<T>> {
  const { pageSize, chunk, maxChunks } = opts;

  let last: GroupCursor | null = opts.startCursor;
  let reachedEnd = false;
  let rawDocsRead = 0;
  let groupsSeen = 0;

  const emittedGroups: PageDoc<T>[][] = [];
  // Advances only past COMPLETE groups we've fully processed, so the trailing
  // (possibly incomplete) buffered group is re-read on the next page.
  let processedCursor: GroupCursor | null = opts.startCursor;
  let reachedPageSize = false;

  // Buffer for the in-progress name-group (docs sharing one name key). A group
  // spans chunk boundaries, so this lives outside the chunk loop.
  let curKey: string | null = null;
  let curDocs: PageDoc<T>[] = [];

  const finalizeGroup = (): void => {
    if (curDocs.length === 0) return;
    groupsSeen++;
    if (matches(curDocs)) emittedGroups.push(curDocs);
    const lastDoc = curDocs[curDocs.length - 1];
    processedCursor = { name: lastDoc.name, id: lastDoc.id };
    curKey = null;
    curDocs = [];
    if (emittedGroups.length >= pageSize) reachedPageSize = true;
  };

  for (let i = 0; i < maxChunks && !reachedPageSize; i++) {
    const docs = await fetchChunk(last, chunk);
    if (docs.length === 0) {
      reachedEnd = true;
      break;
    }
    rawDocsRead += docs.length;
    for (const doc of docs) {
      const key = nameKeyOf(doc.name);
      if (curKey === null) {
        curKey = key;
        curDocs = [doc];
      } else if (key === curKey) {
        curDocs.push(doc);
      } else {
        // A greater name started → the previous group is complete.
        finalizeGroup();
        curKey = key;
        curDocs = [doc];
        if (reachedPageSize) break;
      }
      last = { name: doc.name, id: doc.id };
    }
    if (reachedPageSize) break;
    if (docs.length < chunk) {
      reachedEnd = true;
      break;
    }
  }

  // At the true end of the collection the trailing buffered group is complete too.
  if (reachedEnd) finalizeGroup();

  // Progress guard: the whole read budget was spent without completing a single
  // group (one pathologically oversized name-group). Finalize the buffer anyway so
  // the cursor advances and the feed doesn't stall on the same cursor forever.
  const cursorsEqual = (a: GroupCursor | null, b: GroupCursor | null) =>
    (!a && !b) || (!!a && !!b && a.name === b.name && a.id === b.id);
  if (
    !reachedEnd &&
    !reachedPageSize &&
    cursorsEqual(processedCursor, opts.startCursor) &&
    curDocs.length > 0
  ) {
    finalizeGroup();
  }

  const emitted = emittedGroups.slice(0, pageSize).flat();
  // More pages exist as long as the collection wasn't fully scanned. When we
  // stopped early on pageSize, there may be more matches; when we scanned to the
  // end, there are none.
  const hasMore = !reachedEnd;

  return {
    emitted,
    nextCursor: hasMore ? processedCursor : null,
    hasMore,
    rawDocsRead,
    lastConsumedCursor: last,
    groupsSeen,
  };
}
