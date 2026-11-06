import {
  getDocs,
  limit,
  query,
  startAfter,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

/**
 * Pages through several queries that each return the same kind of doc
 * ordered newest first (e.g. a seller's orders filed under sellerId and under
 * sellerPhone), as one list: every query reads `pageSize` docs at a time, and
 * a doc is only shown once every query that may still hold a newer one has
 * been read past it, so the merged list stays in order without reading
 * everything.
 *
 * A stream may name a `split`: if Firestore refuses the query (a security
 * rule rejects an "in" list when one value isn't the caller's), it is
 * replaced by the split queries (e.g. one per value).
 */
export type PagerStream = { query: Query<DocumentData>; split?: () => Query<DocumentData>[] };

type State = {
  query: Query<DocumentData>;
  split?: () => Query<DocumentData>[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  exhausted: boolean;
  started: boolean;
  buffer: QueryDocumentSnapshot<DocumentData>[];
};

export class MergedPager {
  private states: State[];
  private seen = new Set<string>();
  private failures = 0;
  private reads = 0;

  constructor(
    streams: PagerStream[],
    private readonly pageSize: number,
    /** Sort key of a doc, larger = newer (e.g. createdAt millis). */
    private readonly keyOf: (d: QueryDocumentSnapshot<DocumentData>) => number,
  ) {
    this.states = streams.map((s) => ({ ...s, cursor: null, exhausted: false, started: false, buffer: [] }));
  }

  get hasMore(): boolean {
    return this.states.some((s) => !s.exhausted || s.buffer.length > 0);
  }

  private async fill(state: State): Promise<void> {
    try {
      const q = state.cursor
        ? query(state.query, startAfter(state.cursor), limit(this.pageSize))
        : query(state.query, limit(this.pageSize));
      const snap = await getDocs(q);
      this.reads++;
      state.started = true;
      state.buffer.push(...snap.docs);
      if (snap.docs.length) state.cursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < this.pageSize) state.exhausted = true;
    } catch (err) {
      state.exhausted = true;
      if (!state.started && state.split) {
        const parts = state.split();
        state.split = undefined;
        const added = parts.map((q) => ({ query: q, cursor: null, exhausted: false, started: false, buffer: [] }) as State);
        this.states.push(...added);
        await Promise.all(added.map((s) => this.fill(s)));
      } else {
        this.failures++;
      }
    }
  }

  /** The next docs in order: at least one page's worth when there is one. */
  async next(): Promise<QueryDocumentSnapshot<DocumentData>[]> {
    const out: QueryDocumentSnapshot<DocumentData>[] = [];
    for (let round = 0; round < 10 && out.length < this.pageSize && this.hasMore; round++) {
      await Promise.all(
        this.states.filter((s) => !s.exhausted && s.buffer.length < this.pageSize).map((s) => this.fill(s)),
      );
      if (this.reads === 0 && this.failures > 0) throw new Error("Could not read any of the queries.");
      // Safe to show everything at least as new as the oldest doc read so far
      // from each query that still has more.
      const open = this.states.filter((s) => !s.exhausted);
      const frontier = open.length
        ? Math.max(...open.map((s) => (s.buffer.length ? this.keyOf(s.buffer[s.buffer.length - 1]) : Infinity)))
        : -Infinity;
      for (const s of this.states) {
        const keep: QueryDocumentSnapshot<DocumentData>[] = [];
        for (const d of s.buffer) {
          if (this.keyOf(d) >= frontier) {
            if (!this.seen.has(d.id)) {
              this.seen.add(d.id);
              out.push(d);
            }
          } else {
            keep.push(d);
          }
        }
        s.buffer = keep;
      }
    }
    return out.sort((a, b) => this.keyOf(b) - this.keyOf(a));
  }
}
