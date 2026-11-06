import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

/// A list read from one or more queries that return the same kind of doc
/// (e.g. a seller's orders filed under sellerPhone and under sellerId), newest
/// first, [pageSize] docs per query at a time.
///
/// The first page of each query is a live listener, so new and changed docs
/// show up at once; [loadMore] reads older pages once (no listener). A doc
/// is shown only when every query that may still hold a newer one has been
/// read past it, so the merged list stays in order without reading
/// everything. A query the security rules refuse is skipped, so the others
/// still fill the list.
class PagedFeed<T> {
  PagedFeed({
    required List<Query<Map<String, dynamic>>> queries,
    required this.map,
    this.pageSize = 30,
    this.orderField = 'createdAt',
  }) : _streams = [for (final q in queries) _Stream(q)] {
    for (final s in _streams) {
      s.sub = s.query
          .orderBy(orderField, descending: true)
          .limit(pageSize)
          .snapshots()
          .listen((snap) {
        // Docs that slide out of the live window (newer ones arrived) stay
        // known, so nothing falls between the live page and older pages. (A
        // deleted order would stay listed until the screen is reopened.)
        for (final d in snap.docs) {
          s.live[d.id] = d;
        }
        if (!s.started) {
          s.started = true;
          s.exhausted = snap.docs.length < pageSize;
        }
        _emit();
      }, onError: (_) {
        // e.g. a query the rules refuse for this caller: skip it.
        s.started = true;
        s.exhausted = true;
        s.failed = true;
        _emit();
      });
    }
  }

  final T? Function(DocumentSnapshot<Map<String, dynamic>> doc) map;
  final int pageSize;
  final String orderField;
  final List<_Stream> _streams;
  final _controller = StreamController<List<T>>.broadcast();
  List<T>? _latest;
  bool _loadingMore = false;

  /// The current list; replays the latest value to each new listener.
  Stream<List<T>> get stream async* {
    if (_latest != null) yield _latest!;
    yield* _controller.stream;
  }

  /// True while some query may still hold older docs.
  bool get hasMore => _streams.any((s) => !s.exhausted);

  bool get loadingMore => _loadingMore;

  int _key(DocumentSnapshot<Map<String, dynamic>> d) {
    final v = d.data()?[orderField];
    if (v is Timestamp) return v.millisecondsSinceEpoch;
    if (v is String) return DateTime.tryParse(v)?.millisecondsSinceEpoch ?? 0;
    return 0;
  }

  Iterable<DocumentSnapshot<Map<String, dynamic>>> _all(_Stream s) =>
      [...s.live.values, ...s.older];

  /// Oldest key that is safe to show: every open query has been read at
  /// least that far back.
  int _frontier() {
    var frontier = -1 << 62;
    for (final s in _streams) {
      if (s.exhausted) continue;
      if (!s.started) return 1 << 62;
      final keys = _all(s).map(_key);
      final oldest = keys.isEmpty ? 1 << 62 : keys.reduce((a, b) => a < b ? a : b);
      if (oldest > frontier) frontier = oldest;
    }
    return frontier;
  }

  void _emit() {
    if (_controller.isClosed) return;
    // Wait for every live query's first answer before showing anything.
    if (_streams.any((s) => !s.started)) return;
    final frontier = _frontier();
    final byId = <String, DocumentSnapshot<Map<String, dynamic>>>{};
    for (final s in _streams) {
      for (final d in _all(s)) {
        if (_key(d) >= frontier) byId.putIfAbsent(d.id, () => d);
      }
      // Live data wins over an older read of the same doc.
      for (final d in s.live.values) {
        if (byId.containsKey(d.id)) byId[d.id] = d;
      }
    }
    final docs = byId.values.toList()..sort((a, b) => _key(b).compareTo(_key(a)));
    final list = <T>[];
    for (final d in docs) {
      try {
        final item = map(d);
        if (item != null) list.add(item);
      } catch (_) {
        // A malformed doc must not hide the rest.
      }
    }
    _latest = list;
    _controller.add(list);
  }

  /// Reads the next page of every query that may hold older docs.
  Future<void> loadMore() async {
    if (_loadingMore || !hasMore) return;
    _loadingMore = true;
    try {
      // Read until something new can be shown or every query is done.
      for (var round = 0; round < 5; round++) {
        final before = _latest?.length ?? 0;
        await Future.wait([
          for (final s in _streams.where((s) => !s.exhausted && !s.failed)) _readOlder(s),
        ]);
        _emit();
        if ((_latest?.length ?? 0) > before || !_streams.any((s) => !s.exhausted)) break;
      }
    } finally {
      _loadingMore = false;
    }
  }

  Future<void> _readOlder(_Stream s) async {
    final docs = _all(s).toList()..sort((a, b) => _key(a).compareTo(_key(b)));
    if (docs.isEmpty) {
      s.exhausted = true;
      return;
    }
    try {
      final snap = await s.query
          .orderBy(orderField, descending: true)
          .startAfterDocument(docs.first)
          .limit(pageSize)
          .get();
      s.older.addAll(snap.docs);
      if (snap.docs.length < pageSize) s.exhausted = true;
    } catch (_) {
      s.exhausted = true;
    }
  }

  void dispose() {
    for (final s in _streams) {
      s.sub?.cancel();
    }
    _controller.close();
  }
}

class _Stream {
  _Stream(this.query);
  final Query<Map<String, dynamic>> query;
  final Map<String, DocumentSnapshot<Map<String, dynamic>>> live = {};
  final List<DocumentSnapshot<Map<String, dynamic>>> older = [];
  StreamSubscription? sub;
  bool started = false;
  bool exhausted = false;
  bool failed = false;
}
