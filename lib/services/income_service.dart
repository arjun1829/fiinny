import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/income_item.dart';

/// Top-level query spec for hybrid search (server coarse + client refine).
class IncomeQuery {
  final List<String>? categories; // filters "category"
  final List<String>?
      labels; // filters "labels[]" (legacy "label" covered by text)
  final DateTime? from;
  final DateTime? to;
  final String?
      text; // searched in title, comments, note, category, labels, label, source
  final double? minAmount;
  final double? maxAmount;
  final int limit;
  final DocumentSnapshot<Map<String, dynamic>>? startAfter;

  const IncomeQuery({
    this.categories,
    this.labels,
    this.from,
    this.to,
    this.text,
    this.minAmount,
    this.maxAmount,
    this.limit = 100,
    this.startAfter,
  });
}

class IncomeService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // incomes/<userId>/incomes/*
  CollectionReference<Map<String, dynamic>> getIncomesCollection(
      String userId) {
    return _firestore.collection('users').doc(userId).collection('incomes');
  }

  // List all incomes for dashboard
  Future<List<IncomeItem>> getIncomes(String userId) async {
    final snapshot = await getIncomesCollection(userId)
        .orderBy('date', descending: true)
        .get();
    return snapshot.docs.map((doc) => IncomeItem.fromFirestore(doc)).toList();
  }

  // Add income
  Future<String> addIncome(String userId, IncomeItem income) async {
    final docRef = getIncomesCollection(userId).doc();
    final withId = income.copyWith(id: docRef.id);
    await docRef.set(withId.toJson());
    return docRef.id;
  }

  Future<void> updateIncome(String userId, IncomeItem income) async {
    await getIncomesCollection(userId).doc(income.id).update(income.toJson());
  }

  Future<void> deleteIncome(String userId, String incomeId) async {
    debugPrint('IncomeService: Deleting income $incomeId for user $userId');
    await getIncomesCollection(userId).doc(incomeId).delete();
  }

  Stream<List<IncomeItem>> getIncomesStream(String userId) {
    return getIncomesCollection(userId)
        .orderBy('date', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map((d) => IncomeItem.fromFirestore(d)).toList());
  }

  Future<List<IncomeItem>> getIncomesInDateRange(
    String userId, {
    required DateTime start,
    required DateTime end,
  }) async {
    final snap = await getIncomesCollection(userId)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(start))
        .where('date', isLessThan: Timestamp.fromDate(end))
        .orderBy('date', descending: true)
        .get();
    return snap.docs.map((d) => IncomeItem.fromFirestore(d)).toList();
  }

  // ===================== 🔎 Facets =====================

  /// Unique labels for this user (from `labels[]` + legacy `label`)
  Future<List<String>> distinctLabels(String userId,
      {int scanLimit = 1000}) async {
    final snap = await getIncomesCollection(userId).limit(scanLimit).get();
    final out = <String>{};
    for (final d in snap.docs) {
      final data = d.data();
      final raw = data['labels'];
      if (raw is List) {
        for (final v in raw) {
          if (v is String && v.trim().isNotEmpty) {
            out.add(v.trim());
          }
        }
      }
      final legacy = data['label'];
      if (legacy is String && legacy.trim().isNotEmpty) {
        out.add(legacy.trim());
      }
    }
    final list = out.toList()..sort();
    return list;
  }

  /// Unique categories for this user
  Future<List<String>> distinctCategories(String userId,
      {int scanLimit = 1000}) async {
    final snap = await getIncomesCollection(userId).limit(scanLimit).get();
    final out = <String>{};
    for (final d in snap.docs) {
      final cat = d.data()['category'];
      if (cat is String && cat.trim().isNotEmpty) {
        out.add(cat.trim());
      }
    }
    final list = out.toList()..sort();
    return list;
  }

  // ===================== 🔎 Advanced Search =====================

  Future<List<QueryDocumentSnapshot<Map<String, dynamic>>>> _rawQueryDocs(
    String userId,
    IncomeQuery q,
  ) async {
    Query<Map<String, dynamic>> ref = getIncomesCollection(userId);

    if (q.from != null) {
      ref = ref.where('date', isGreaterThanOrEqualTo: q.from);
    }
    if (q.to != null) {
      ref = ref.where('date', isLessThanOrEqualTo: q.to);
    }
    if (q.categories != null && q.categories!.isNotEmpty) {
      ref = ref.where('category', whereIn: q.categories!.take(10).toList());
    }
    if (q.labels != null && q.labels!.isNotEmpty) {
      ref = ref.where('labels', arrayContainsAny: q.labels!.take(10).toList());
    }

    ref = ref.orderBy('date', descending: true).limit(q.limit);
    if (q.startAfter != null) {
      ref = ref.startAfterDocument(q.startAfter!);
    }

    final snap = await ref.get();
    return snap.docs;
  }

  /// Hybrid filter: server-side coarse filters + client-side text/amount refine
  Future<List<IncomeItem>> queryHybrid(String userId, IncomeQuery q) async {
    final docs = await _rawQueryDocs(userId, q);
    final items = docs.map((d) => IncomeItem.fromFirestore(d)).toList();

    return items.where((e) {
      if (q.text != null && q.text!.trim().isNotEmpty) {
        final t = q.text!.toLowerCase();
        final hay = [
          e.title ?? '',
          e.comments ?? '',
          e.note, // parsed/system note
          e.category ?? '',
          e.label ?? '',
          e.source,
          ...e.labels,
        ].join(' ').toLowerCase();
        if (!hay.contains(t)) {
          return false;
        }
      }
      if (q.minAmount != null && e.amount < q.minAmount!) {
        return false;
      }
      if (q.maxAmount != null && e.amount > q.maxAmount!) {
        return false;
      }
      return true;
    }).toList();
  }

  // ===================== ✍️ Bulk Edit =====================

  /// Multi-edit incomes:
  /// - Set title/comments/category/date
  /// - Add/Remove labels (computed and de-duplicated)
  Future<void> bulkEdit(
    String userId,
    List<String> incomeIds, {
    String? title,
    String? comments,
    String? category,
    DateTime? date,
    List<String>? addLabels,
    List<String>? removeLabels,
  }) async {
    if (incomeIds.isEmpty) {
      return;
    }

    // sanitize label inputs
    final add = (addLabels ?? const [])
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toSet();
    final rem = (removeLabels ?? const [])
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toSet();

    // We’ll issue a small batch per item to keep it simple and safe.
    for (final id in incomeIds) {
      final snap = await getIncomesCollection(userId).doc(id).get();
      if (!snap.exists) {
        continue;
      }

      final data = snap.data()!;
      final base = IncomeItem.fromJson(data);

      // Compute final labels on the array field `labels` (leave legacy `label` untouched)
      final currentLabels = <String>[...base.labels];
      final seen = <String>{};

      currentLabels.addAll(add); // additions
      final filtered =
          currentLabels.where((l) => !rem.contains(l)).toList(); // removals
      final finalLabels = filtered.where((l) => seen.add(l)).toList(); // de-dup

      final update = <String, dynamic>{};
      if (title != null) {
        update['title'] = title;
      }
      if (comments != null) {
        update['comments'] = comments;
      }
      if (category != null) {
        update['category'] = category;
      }
      if (date != null) {
        update['date'] = Timestamp.fromDate(date);
      }
      update['labels'] = finalLabels;

      // Apply
      await getIncomesCollection(userId).doc(id).update(update);
    }
  }
}
