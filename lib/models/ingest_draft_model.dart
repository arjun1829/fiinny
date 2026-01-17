// lib/models/ingest_draft_model.dart
import 'package:cloud_firestore/cloud_firestore.dart';

class IngestDraft {
  // Firestore doc id (we also expose it as `key` for convenience)
  final String id;
  String get key => id;

  // Core fields
  final String direction; // 'debit' | 'credit'
  final double? amount; // INR amount (can be null if only FX found)
  final String? currency; // defaults to 'INR' in most writes
  final DateTime date; // derived from 'time' (or 'date') in Firestore
  final String note;

  // Optional enrichments
  final String? bank;
  final String? last4;
  final Map<String, dynamic>? brain; // category/tags/etc. from Brain
  final Map<String, dynamic>?
      fxOriginal; // {currency:'USD', amount: 23.6} if detected
  final List<dynamic> sources; // merged array of source records

  // Lifecycle / status
  final String status; // 'new' | 'posted' | 'rejected'
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? finalDocPath; // path to the posted expense/income

  IngestDraft({
    required this.id,
    required this.direction,
    required this.amount,
    required this.currency,
    required this.date,
    required this.note,
    this.bank,
    this.last4,
    this.brain,
    this.fxOriginal,
    required this.sources,
    required this.status,
    this.createdAt,
    this.updatedAt,
    this.finalDocPath,
  });

  /// Safe Firestore → model conversion. Works with both `time` and legacy `date` fields.
  static IngestDraft fromFirestore(Map<String, dynamic> data, String id) {
    // Pull timestamp from 'time' (preferred) or 'date' (legacy)
    DateTime readTimestamp(dynamic v) {
      if (v is Timestamp) return v.toDate();
      if (v is DateTime) return v;
      return DateTime.now();
    }

    final ts = data['time'] ?? data['date'];

    return IngestDraft(
      id: id,
      direction: (data['direction'] as String?) ?? 'debit',
      amount:
          (data['amount'] is num) ? (data['amount'] as num).toDouble() : null,
      currency: data['currency'] as String? ?? 'INR',
      date: readTimestamp(ts),
      note: (data['note'] as String?) ?? '',
      bank: data['bank'] as String?,
      last4: data['last4'] as String?,
      brain: (data['brain'] is Map)
          ? Map<String, dynamic>.from(data['brain'] as Map)
          : null,
      fxOriginal: (data['fxOriginal'] is Map)
          ? Map<String, dynamic>.from(data['fxOriginal'] as Map)
          : null,
      sources: (data['sources'] is Iterable)
          ? List<dynamic>.from(data['sources'])
          : const [],
      status: (data['status'] as String?) ?? 'new',
      createdAt: data['createdAt'] is Timestamp
          ? (data['createdAt'] as Timestamp).toDate()
          : null,
      updatedAt: data['updatedAt'] is Timestamp
          ? (data['updatedAt'] as Timestamp).toDate()
          : null,
      finalDocPath: data['finalDocPath'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'direction': direction,
      if (amount != null) 'amount': amount,
      if (currency != null) 'currency': currency,
      'time': Timestamp.fromDate(date),
      'note': note,
      if (bank != null) 'bank': bank,
      if (last4 != null) 'last4': last4,
      if (brain != null) 'brain': brain,
      if (fxOriginal != null) 'fxOriginal': fxOriginal,
      'sources': sources,
      'status': status,
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
      if (finalDocPath != null) 'finalDocPath': finalDocPath,
    };
  }

  bool get needsAmount => amount == null;
}
