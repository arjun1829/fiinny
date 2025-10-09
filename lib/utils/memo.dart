import 'dart:async';

/// Tiny in-memory memoization with optional TTL.
/// Usage:
///   final memo = Memo();
//   final kpis = memo.get('kpis:$hash', () => computeKpis(items), ttl: Duration(seconds: 10));
class Memo<T> {
  final _store = <String, _Entry<T>>{};

  T get(String key, T Function() compute, {Duration? ttl}) {
    final now = DateTime.now();
    final hit = _store[key];
    if (hit != null && (hit.ttl == null || now.isBefore(hit.expiry))) {
      return hit.value;
    }
    final value = compute();
    _store[key] = _Entry(value, ttl == null ? null : now.add(ttl));
    return value;
  }

  Future<T> getAsync(String key, Future<T> Function() compute,
      {Duration? ttl}) async {
    final now = DateTime.now();
    final hit = _store[key];
    if (hit != null && (hit.ttl == null || now.isBefore(hit.expiry))) {
      return hit.value;
    }
    final value = await compute();
    _store[key] = _Entry(value, ttl == null ? null : now.add(ttl));
    return value;
  }

  void clear([String? key]) {
    if (key == null) {
      _store.clear();
    } else {
      _store.remove(key);
    }
  }
}

class _Entry<T> {
  final T value;
  final DateTime? ttl;
  late final DateTime expiry;
  _Entry(this.value, this.ttl) {
    expiry = ttl ?? DateTime.fromMillisecondsSinceEpoch(0);
  }
}
