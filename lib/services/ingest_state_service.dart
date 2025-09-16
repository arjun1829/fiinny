import 'package:cloud_firestore/cloud_firestore.dart';

class IngestState {
  final DateTime baselineCutoff;     // first-run baseline; review starts after this
  final bool reviewEnabled;          // once true, new txns go to review
  final DateTime? lastSmsAt;         // last processed SMS timestamp
  final DateTime? lastGmailAt;       // last processed Gmail timestamp

  IngestState({
    required this.baselineCutoff,
    this.reviewEnabled = false,
    this.lastSmsAt,
    this.lastGmailAt,
  });

  static DateTime? _asDate(dynamic v) {
    if (v == null) return null;
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  factory IngestState.from(Map<String, dynamic> json) {
    final cutoff = _asDate(json['baselineCutoff']) ?? DateTime.now();
    return IngestState(
      baselineCutoff: cutoff,
      reviewEnabled: (json['reviewEnabled'] as bool?) ?? false,
      lastSmsAt: _asDate(json['lastSmsAt']),
      lastGmailAt: _asDate(json['lastGmailAt']),
    );
  }

  Map<String, dynamic> toJson() => {
    'baselineCutoff': Timestamp.fromDate(baselineCutoff),
    'reviewEnabled': reviewEnabled,
    if (lastSmsAt != null) 'lastSmsAt': Timestamp.fromDate(lastSmsAt!),
    if (lastGmailAt != null) 'lastGmailAt': Timestamp.fromDate(lastGmailAt!),
  };
}

class IngestStateService {
  IngestStateService._();
  static final IngestStateService instance = IngestStateService._();

  final FirebaseFirestore _db = FirebaseFirestore.instance;

  DocumentReference<Map<String, dynamic>> _doc(String userId) =>
      _db.collection('users').doc(userId).collection('ingest').doc('state');

  /// Load if exists; else create with a default cutoff (now).
  Future<IngestState> getOrCreate(String userId, {DateTime? defaultCutoff}) async {
    final snap = await _doc(userId).get();
    if (snap.exists && snap.data() != null) {
      return IngestState.from(snap.data()!);
    }
    return await ensureCutoff(userId, cutoff: defaultCutoff ?? DateTime.now());
  }

  /// Alias used by older callers.
  Future<IngestState> get(String userId) => getOrCreate(userId);

  /// Ensure we have a baseline cutoff document.
  Future<IngestState> ensureCutoff(String userId, {DateTime? cutoff}) async {
    final cut = cutoff ?? DateTime.now();
    await _doc(userId).set({
      'baselineCutoff': Timestamp.fromDate(cut),
      'reviewEnabled': false,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
    return IngestState(baselineCutoff: cut, reviewEnabled: false);
  }

  /// Turn on review mode (used after the initial backfill).
  Future<void> enableReview(String userId) async {
    await _doc(userId).set({
      'reviewEnabled': true,
      'reviewEnabledAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  /// Update progress timestamps (both optional).
  Future<void> setProgress(String userId, {DateTime? lastSmsTs, DateTime? lastGmailTs}) async {
    final update = <String, dynamic>{
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (lastSmsTs != null) update['lastSmsAt'] = Timestamp.fromDate(lastSmsTs);
    if (lastGmailTs != null) update['lastGmailAt'] = Timestamp.fromDate(lastGmailTs);
    await _doc(userId).set(update, SetOptions(merge: true));
  }

  /// Helpers if you want explicit mark methods
  Future<void> markSmsSeen(String userId, DateTime at) => setProgress(userId, lastSmsTs: at);
  Future<void> markGmailSeen(String userId, DateTime at) => setProgress(userId, lastGmailTs: at);
}
