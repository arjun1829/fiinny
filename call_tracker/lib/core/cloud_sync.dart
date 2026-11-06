import 'dart:async';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import 'app_config.dart';
import 'local_db.dart';
import 'models.dart';
import 'prefs.dart';

/// Pushes this phone's calls and contact edits to the team's own Firestore
/// database and pulls everyone else's.
class CloudSync {
  static const _timeout = Duration(seconds: 40);

  /// Re-read a little before the last pull: server timestamps are commit
  /// times, and inserts are idempotent, so the overlap only costs reads.
  static const _overlapMs = 2 * 60 * 1000;

  static FirebaseFirestore? _fs;

  static Future<FirebaseFirestore?> _ready() async {
    if (!AppConfig.cloudEnabled) return null;
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: AppConfig.firebaseApiKey,
          appId: AppConfig.firebaseAppId,
          messagingSenderId: AppConfig.firebaseSenderId,
          projectId: AppConfig.firebaseProjectId,
          storageBucket: AppConfig.firebaseStorageBucket,
        ),
      );
    }
    // No login screen: a silent anonymous sign-in is what the rules require.
    final auth = FirebaseAuth.instance;
    if (auth.currentUser == null) await auth.signInAnonymously().timeout(_timeout);

    if (_fs == null) {
      final fs = FirebaseFirestore.instanceFor(
          app: Firebase.app(), databaseId: AppConfig.firestoreDatabase);
      // The local SQLite db is the offline store; Firestore's own cache
      // would make writes look done before the server has them.
      fs.settings = const Settings(persistenceEnabled: false);
      _fs = fs;
    }
    return _fs;
  }

  static DocumentReference<Map<String, dynamic>> _team(FirebaseFirestore fs) =>
      fs.collection('teams').doc(AppConfig.teamCode);

  /// Returns how many records were pulled from other phones.
  static Future<int> sync(LocalDb db, Prefs prefs) async {
    final fs = await _ready();
    if (fs == null) return 0;
    final team = _team(fs);

    await _pushCalls(db, team);
    await _pushContacts(db, team);
    final pulled = await _pullCalls(db, prefs, team) + await _pullContacts(db, prefs, team);

    await team.collection('devices').doc(prefs.deviceId).set({
      'name': prefs.deviceName,
      'lastSyncAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true)).timeout(_timeout);
    return pulled;
  }

  static Future<void> _pushCalls(LocalDb db, DocumentReference team) async {
    while (true) {
      final pending = await db.unsyncedCalls();
      if (pending.isEmpty) return;
      final batch = team.firestore.batch();
      for (final c in pending) {
        batch.set(team.collection('calls').doc(c.id), {
          ...c.toCloud(),
          'syncedAt': FieldValue.serverTimestamp(),
        });
      }
      await batch.commit().timeout(_timeout);
      await db.markCallsSynced(pending.map((c) => c.id).toList());
    }
  }

  static Future<void> _pushContacts(LocalDb db, DocumentReference team) async {
    final pending = await db.unsyncedContacts();
    for (var i = 0; i < pending.length; i += 400) {
      final chunk = pending.skip(i).take(400).toList();
      final batch = team.firestore.batch();
      for (final c in chunk) {
        batch.set(team.collection('contacts').doc(c.numberKey), {
          ...c.toCloud(),
          'syncedAt': FieldValue.serverTimestamp(),
        });
      }
      await batch.commit().timeout(_timeout);
      for (final c in chunk) {
        await db.markContactSynced(c.numberKey, c.updatedAt);
      }
    }
  }

  static Future<int> _pullCalls(LocalDb db, Prefs prefs, DocumentReference team) async {
    var total = 0;
    await _pull(team.collection('calls'), prefs.lastCallsPull, prefs.setLastCallsPull,
        (docs) async {
      total += await db.insertCalls(docs.map((d) => CallRecord.fromCloud(d.id, d.data())).toList());
    });
    return total;
  }

  static Future<int> _pullContacts(LocalDb db, Prefs prefs, DocumentReference team) async {
    var total = 0;
    await _pull(team.collection('contacts'), prefs.lastContactsPull, prefs.setLastContactsPull,
        (docs) async {
      for (final d in docs) {
        final remote = ContactInfo.fromCloud(d.id, d.data());
        final local = await db.contact(d.id);
        // An edit made on this phone that is newer wins.
        if (local != null && local.updatedAt > remote.updatedAt) continue;
        if (local != null && local.synced && local.updatedAt == remote.updatedAt) continue;
        await db.upsertContact(remote.copyWith(savedToPhone: local?.savedToPhone ?? false));
        total++;
      }
    });
    return total;
  }

  /// Reads everything written since [since] (minus the overlap), 500 at a
  /// time. Pages continue from the last document, not the last timestamp:
  /// a backfill upload gives hundreds of docs the same commit time.
  static Future<void> _pull(
    CollectionReference<Map<String, dynamic>> col,
    int since,
    Future<void> Function(int) saveCursor,
    Future<void> Function(List<QueryDocumentSnapshot<Map<String, dynamic>>>) apply,
  ) async {
    final from = Timestamp.fromMillisecondsSinceEpoch(max(0, since - _overlapMs));
    var query = col.where('syncedAt', isGreaterThan: from).orderBy('syncedAt').limit(500);
    while (true) {
      final snap = await query.get().timeout(_timeout);
      if (snap.docs.isEmpty) return;
      await apply(snap.docs);
      final last = snap.docs.last;
      await saveCursor((last.data()['syncedAt'] as Timestamp).millisecondsSinceEpoch);
      if (snap.docs.length < 500) return;
      query = query.startAfterDocument(last);
    }
  }
}
