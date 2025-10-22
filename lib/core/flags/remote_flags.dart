// lib/core/flags/remote_flags.dart
import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

class RemoteFlags {
  RemoteFlags._();

  static final instance = RemoteFlags._();

  final _cache = <String, Object?>{};
  final _subs = <String, StreamSubscription>{};

  /// Reads global then user overrides; caches results.
  Future<T> get<T>(String key, {required T fallback, String? userId}) async {
    final userKey = userId == null ? null : 'user:$userId:$key';
    if (userKey != null && _cache.containsKey(userKey)) {
      return _cache[userKey] as T;
    }
    if (_cache.containsKey('global:$key')) {
      final globalVal = _cache['global:$key'] as T;
      if (userKey == null) {
        return globalVal;
      }
    }

    final globalDoc = await FirebaseFirestore.instance.collection('app').doc('flags').get();
    if (globalDoc.exists) {
      final data = globalDoc.data() ?? <String, dynamic>{};
      final value = data[key];
      if (value != null) {
        _cache['global:$key'] = value;
      }
    }

    if (userId != null) {
      final userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .collection('meta')
          .doc('flags')
          .get();
      if (userDoc.exists) {
        final data = userDoc.data() ?? <String, dynamic>{};
        final value = data[key];
        if (value != null) {
          _cache['user:$userId:$key'] = value;
          return value as T;
        }
      }
    }

    final cachedGlobal = _cache['global:$key'];
    if (cachedGlobal is T) {
      return cachedGlobal;
    }
    return fallback;
  }

  /// Live updates for a flag. Emits initial value then updates.
  Stream<T> on<T>(String key, {String? userId, required T fallback}) {
    final controller = StreamController<T>.broadcast();

    final globalPath = 'app/flags';
    final globalCacheKey = 'global:$key';
    _subs.putIfAbsent(globalPath, () {
      return FirebaseFirestore.instance.collection('app').doc('flags').snapshots().listen((snapshot) {
        final value = (snapshot.data() ?? <String, dynamic>{})[key];
        if (value != null) {
          _cache[globalCacheKey] = value;
          if (userId == null) {
            controller.add(value as T);
          }
        }
      });
    });

    if (userId != null) {
      final userPath = 'users/$userId/meta/flags';
      final userCacheKey = 'user:$userId:$key';
      _subs.putIfAbsent(userPath, () {
        return FirebaseFirestore.instance
            .collection('users')
            .doc(userId)
            .collection('meta')
            .doc('flags')
            .snapshots()
            .listen((snapshot) {
          final value = (snapshot.data() ?? <String, dynamic>{})[key];
          if (value != null) {
            _cache[userCacheKey] = value;
            controller.add(value as T);
          } else {
            final globalValue = _cache[globalCacheKey];
            controller.add(globalValue is T ? globalValue : fallback);
          }
        });
      });
    }

    () async {
      final initial = await get<T>(key, fallback: fallback, userId: userId);
      controller.add(initial);
    }();

    return controller.stream;
  }
}
