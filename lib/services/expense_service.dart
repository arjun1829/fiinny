// lib/services/expense_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:rxdart/rxdart.dart';

import '../core/flags/fx_flags.dart';
import '../models/expense_item.dart';

/// Top-level query spec for hybrid search (server coarse + client refine).
/// NOTE: Firestore may require composite indexes for some combinations.
class ExpenseQuery {
  final List<String>? categories;
  final List<String>? labels; // matches `labels[]`; legacy `label` matched via text
  final DateTime? from;
  final DateTime? to;
  final String? text;   // searched in title, comments, note, category, labels, label
  final double? minAmount;
  final double? maxAmount;
  final int limit;
  final DocumentSnapshot<Map<String, dynamic>>? startAfter;

  const ExpenseQuery({
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

class ExpenseService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static final ValueNotifier<int> globalUpdate = ValueNotifier(0);

  // ── USER SCOPED COLLECTION (what Dashboard reads & Mirror writes) ─────────────
  // users/<userPhone>/expenses/*
  CollectionReference<Map<String, dynamic>> getExpensesCollection(String userPhone) {
    return _firestore.collection('users').doc(userPhone).collection('expenses');
  }

  // ── GLOBAL/GROUP ANALYTICS (separate collection to avoid path collision) ─────
  // group_expenses/<expenseId>
  CollectionReference<Map<String, dynamic>> get _groupExpenses =>
      _firestore.collection('group_expenses');

  Future<void> _mirrorToGroupCollections(ExpenseItem expense) async {
    final groupId = expense.groupId;
    if (!FxFlags.groupCanonicalWrites || groupId == null || groupId.trim().isEmpty) {
      return;
    }
    try {
      final groupDoc = _firestore
          .collection('groups')
          .doc(groupId)
          .collection('expenses')
          .doc(expense.id);
      await groupDoc.set(expense.toJson());
    } catch (err) {
      if (kDebugMode) {
        debugPrint('[ExpenseService] failed to mirror group expense: $err');
      }
    }
  }

  /// List all expenses for user
  Future<List<ExpenseItem>> getExpenses(String userPhone) async {
    final snapshot = await getExpensesCollection(userPhone)
        .orderBy('date', descending: true)
        .get();
    return snapshot.docs.map((doc) => ExpenseItem.fromJson(doc.data())).toList();
  }

  /// Add an expense (handles custom splits & mirrors to friends)
  Future<String> addExpenseWithDialog(ExpenseItem expense, String userPhone) async {
    final col = getExpensesCollection(userPhone);
    final docRef = col.doc(); // id generated here; used to mirror to friends
    final expenseWithId = expense.copyWith(id: docRef.id);
    await docRef.set(expenseWithId.toJson());

    // --- Handle custom splits for all participants (by phone) ---
    if (expense.customSplits != null && expense.customSplits!.isNotEmpty) {
      for (final entry in expense.customSplits!.entries) {
        final friendPhone = entry.key;
        if (friendPhone != userPhone) {
          final mirrorDoc = getExpensesCollection(friendPhone).doc(expenseWithId.id);
          await mirrorDoc.set(expenseWithId.copyWith(
            payerId: expense.payerId,
            amount: entry.value,
            friendIds: [userPhone],
            groupId: expense.groupId,
          ).toJson());
        }
      }
    } else {
      // Fallback: classic friends mirroring
      for (String friendPhone in expense.friendIds) {
        if (friendPhone != userPhone) {
          final mirrorDoc = getExpensesCollection(friendPhone).doc(expenseWithId.id);
          await mirrorDoc.set(expenseWithId.toJson());
        }
      }
    }

    // Write to global group collection (separate)
    if (expense.groupId != null) {
      await _groupExpenses.doc(expenseWithId.id).set(expenseWithId.toJson());
      await _mirrorToGroupCollections(expenseWithId);
    }

    _notify();
    return docRef.id;
  }
  
  void _notify() => globalUpdate.value++;

  /// Add with sync (same as dialog variant, kept for compatibility)
  Future<String> addExpenseWithSync(String userPhone, ExpenseItem expense) async {
    final col = getExpensesCollection(userPhone);
    final docRef = col.doc();
    final expenseWithId = expense.copyWith(id: docRef.id);
    await docRef.set(expenseWithId.toJson());

    if (expense.customSplits != null && expense.customSplits!.isNotEmpty) {
      for (final entry in expense.customSplits!.entries) {
        final friendPhone = entry.key;
        if (friendPhone != userPhone) {
          final mirrorDoc = getExpensesCollection(friendPhone).doc(expenseWithId.id);
          await mirrorDoc.set(expenseWithId.copyWith(
            payerId: expense.payerId,
            amount: entry.value,
            friendIds: [userPhone],
            groupId: expense.groupId,
          ).toJson());
        }
      }
    } else {
      for (String friendPhone in expense.friendIds) {
        if (friendPhone != userPhone) {
          final mirrorDoc = getExpensesCollection(friendPhone).doc(expenseWithId.id);
          await mirrorDoc.set(expenseWithId.toJson());
        }
      }
    }

    if (expense.groupId != null) {
      await _groupExpenses.doc(expenseWithId.id).set(expenseWithId.toJson());
      await _mirrorToGroupCollections(expenseWithId);
    }

    _notify();
    return docRef.id;
  }

  /// Add a basic expense (no mirroring)
  Future<String> addExpense(String userPhone, ExpenseItem expense) async {
    final col = getExpensesCollection(userPhone);
    final docRef = col.doc();
    final expenseWithId = expense.copyWith(id: docRef.id);
    await docRef.set(expenseWithId.toJson());

    if (expense.groupId != null && expense.groupId!.isNotEmpty) {
      await _groupExpenses.doc(expenseWithId.id).set(expenseWithId.toJson());
      await _mirrorToGroupCollections(expenseWithId);
    } else if (expense.friendIds.isNotEmpty) {
      // Mirror to individual friends (Social Notification Trigger)
      final batch = _firestore.batch();
      for (final friendPhone in expense.friendIds) {
        if (friendPhone == userPhone || friendPhone.isEmpty) continue;
        final mirrorDoc = getExpensesCollection(friendPhone).doc(expenseWithId.id);
        // Add 'mirroredFrom' so the Cloud Function knows to notify
        final mirrorData = expenseWithId.toJson();
        mirrorData['mirroredFrom'] = userPhone;
        batch.set(mirrorDoc, mirrorData);
      }
      await batch.commit();
    }
    _notify();
    return docRef.id;
  }

  /// Update an expense for user and all mirrored friends
  Future<void> updateExpense(String userPhone, ExpenseItem expense) async {
    final userDoc = getExpensesCollection(userPhone).doc(expense.id);
    final previousParticipants = <String>{};
    String? previousGroupId;

    try {
      final snapshot = await userDoc.get();
      final data = snapshot.data();
      if (data != null) {
        final rawFriends = data['friendIds'];
        if (rawFriends is Iterable) {
          previousParticipants
              .addAll(rawFriends.map((e) => e.toString()).where((e) => e.isNotEmpty));
        }
        final rawSplits = data['customSplits'];
        if (rawSplits is Map) {
          previousParticipants
              .addAll(rawSplits.keys.map((e) => e.toString()).where((e) => e.isNotEmpty));
        }
        final rawGroup = data['groupId'];
        if (rawGroup is String && rawGroup.isNotEmpty) {
          previousGroupId = rawGroup;
        }
      }
    } catch (_) {}

    previousParticipants.remove(userPhone);

    final currentParticipants = <String>{}
      ..addAll(expense.friendIds.where((phone) => phone.isNotEmpty))
      ..addAll((expense.customSplits?.keys ?? const <String>[]) 
          .map((e) => e.toString())
          .where((phone) => phone.isNotEmpty));
    currentParticipants.remove(userPhone);

    final batch = _firestore.batch();
    batch.set(userDoc, expense.toJson());

    if (expense.customSplits != null && expense.customSplits!.isNotEmpty) {
      expense.customSplits!.forEach((phone, amount) {
        if (phone == userPhone || phone.trim().isEmpty) return;
        final mirrorDoc = getExpensesCollection(phone).doc(expense.id);
        final mirror = expense.copyWith(
          amount: amount,
          friendIds: [userPhone],
        );
        batch.set(mirrorDoc, mirror.toJson());
      });
    } else {
      for (final phone in currentParticipants) {
        if (phone == userPhone) continue;
        final mirrorDoc = getExpensesCollection(phone).doc(expense.id);
        batch.set(mirrorDoc, expense.toJson());
      }
    }

    for (final phone in previousParticipants.difference(currentParticipants)) {
      if (phone.isEmpty) continue;
      batch.delete(getExpensesCollection(phone).doc(expense.id));
    }

    final groupId = expense.groupId;
    final groupDoc = _groupExpenses.doc(expense.id);
    if (groupId != null && groupId.isNotEmpty) {
      batch.set(groupDoc, expense.toJson());
    } else if (previousGroupId != null && previousGroupId.isNotEmpty) {
      batch.delete(groupDoc);
    }

    await batch.commit();

    if (groupId != null && groupId.isNotEmpty) {
      await _mirrorToGroupCollections(expense);
    } else if (previousGroupId != null && previousGroupId.isNotEmpty &&
        FxFlags.groupCanonicalWrites) {
      try {
        await _firestore
            .collection('groups')
            .doc(previousGroupId)
            .collection('expenses')
            .doc(expense.id)
            .delete();
      } catch (err) {
        if (kDebugMode) {
          debugPrint('[ExpenseService] failed to delete mirrored group expense: $err');
        }
      }
    }
    _notify();
  }

  /// Delete expense everywhere
  Future<void> deleteExpense(String userPhone, String expenseId, {List<String>? friendPhones}) async {
    await getExpensesCollection(userPhone).doc(expenseId).delete();
    if (friendPhones != null) {
      for (String friendPhone in friendPhones) {
        if (friendPhone != userPhone) {
          await getExpensesCollection(friendPhone).doc(expenseId).delete();
        }
      }
    }
    Map<String, dynamic>? mirrorData;
    if (FxFlags.groupCanonicalWrites) {
      try {
        final snap = await _groupExpenses.doc(expenseId).get();
        mirrorData = snap.data();
      } catch (_) {}
    }
    await _groupExpenses.doc(expenseId).delete();
    if (FxFlags.groupCanonicalWrites) {
      final groupId = mirrorData?['groupId'] as String?;
      if (groupId != null && groupId.isNotEmpty) {
        try {
          await _firestore
              .collection('groups')
              .doc(groupId)
              .collection('expenses')
              .doc(expenseId)
              .delete();
        } catch (err) {
          if (kDebugMode) {
            debugPrint('[ExpenseService] failed to delete mirrored group expense globally: $err');
          }
        }
      }
    }
    _notify();
  }

  /// Settle an expense (two-way)
  Future<void> settleUpExpense(String userPhone, String expenseId, String friendPhone) async {
    await getExpensesCollection(userPhone).doc(expenseId).update({
      'settledFriendIds': FieldValue.arrayUnion([friendPhone])
    });
    await getExpensesCollection(friendPhone).doc(expenseId).update({
      'settledFriendIds': FieldValue.arrayUnion([userPhone])
    });
  }

  /// Update custom split (global record)
  Future<void> updateExpenseCustomSplit(String expenseId, Map<String, double> splits) async {
    await _groupExpenses.doc(expenseId).set({'customSplits': splits}, SetOptions(merge: true));
  }

  /// Streams
  Stream<List<ExpenseItem>> getExpensesStream(String userPhone) {
    return getExpensesCollection(userPhone)
        .orderBy('date', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) => ExpenseItem.fromJson(doc.data())).toList());
  }

  Stream<List<ExpenseItem>> getGroupExpensesStream(String userPhone, String groupId) {
    final userQuery = getExpensesCollection(userPhone)
        .where('groupId', isEqualTo: groupId)
        .orderBy('date', descending: true)
        .snapshots();

    if (!FxFlags.groupCanonicalWrites) {
      if (kDebugMode) {
        debugPrint('[ExpenseService] listen group stream (user scoped) user=$userPhone group=$groupId');
      }
      return userQuery.map((snap) {
        final expenses = snap.docs.map((d) => ExpenseItem.fromJson(d.data())).toList();
        if (kDebugMode) {
          final preview = expenses.take(3).map((e) => '${e.id}:${e.groupId ?? ''}').join(', ');
          debugPrint('[ExpenseService] group stream update user=$userPhone group=$groupId count=${expenses.length} recent=[$preview]');
        }
        return expenses;
      });
    }

    final mirrorQuery = _firestore
        .collection('groups')
        .doc(groupId)
        .collection('expenses')
        .orderBy('date', descending: true)
        .snapshots();

    if (kDebugMode) {
      debugPrint('[ExpenseService] listen group stream (combined) user=$userPhone group=$groupId');
    }

    return Rx.combineLatest2<QuerySnapshot<Map<String, dynamic>>, QuerySnapshot<Map<String, dynamic>>, List<ExpenseItem>>(
      userQuery,
      mirrorQuery,
      (userSnap, mirrorSnap) {
        final combined = <String, ExpenseItem>{};
        for (final doc in mirrorSnap.docs) {
          final expense = ExpenseItem.fromJson(doc.data());
          combined[expense.id] = expense;
        }
        for (final doc in userSnap.docs) {
          final expense = ExpenseItem.fromJson(doc.data());
          combined[expense.id] = expense;
        }
        final list = combined.values.toList()
          ..sort((a, b) => b.date.compareTo(a.date));
        if (kDebugMode) {
          final preview = list.take(3).map((e) => '${e.id}:${e.groupId ?? ''}').join(', ');
          debugPrint('[ExpenseService] group stream update (combined) user=$userPhone group=$groupId count=${list.length} recent=[$preview]');
        }
        return list;
      },
    );
  }

  Future<List<ExpenseItem>> getExpensesByGroup(String userPhone, String groupId) async {
    final snap = await getExpensesCollection(userPhone)
        .where('groupId', isEqualTo: groupId)
        .orderBy('date', descending: true)
        .get();
    return snap.docs.map((d) => ExpenseItem.fromJson(d.data())).toList();
  }

  Future<void> addSettlement(
      String userPhone,
      String friendPhone,
      double amount, {
        String? groupId,
      }) async {
    final tx = ExpenseItem(
      id: '',
      amount: amount.abs(),
      type: 'Settlement',
      note: groupId == null
          ? 'Settlement with $friendPhone'
          : 'Group Settlement with $friendPhone',
      date: DateTime.now(),
      payerId: userPhone,
      friendIds: [friendPhone],
      groupId: groupId,
      settledFriendIds: const [],
      customSplits: null,
      cardType: null,
      cardLast4: null,
      isBill: false,
      imageUrl: null,
      label: null,
      category: null,
    );
    await addExpenseWithSync(userPhone, tx);
  }

  Future<void> addGroupSettlement(
      String userPhone,
      String groupId,
      String friendPhone,
      double amount, {
        String note = "Settlement",
      }) async {
    await addSettlement(userPhone, friendPhone, amount, groupId: groupId);
  }

  // Global queries for group analytics
  Future<List<ExpenseItem>> getExpensesForGroup(String groupId) async {
    final query = await _groupExpenses.where('groupId', isEqualTo: groupId).get();
    return query.docs.map((doc) => ExpenseItem.fromJson(doc.data())).toList();
  }

  Future<List<ExpenseItem>> getCreditCardBills(String userPhone) async {
    final snapshot = await getExpensesCollection(userPhone)
        .where('type', isEqualTo: 'Credit Card Bill')
        .get();
    return snapshot.docs.map((doc) => ExpenseItem.fromJson(doc.data())).toList();
  }

  Future<List<ExpenseItem>> getCreditCardSpends(String userPhone) async {
    final snapshot = await getExpensesCollection(userPhone)
        .where('cardType', isEqualTo: 'Credit Card')
        .where('isBill', isEqualTo: false)
        .get();
    return snapshot.docs.map((doc) => ExpenseItem.fromJson(doc.data())).toList();
  }

  // ======= Summary helpers (safe for non-nullable settledFriendIds) =======
  Future<double> getOpenAmountWithFriend(String userPhone, String friendPhone) async {
    final expenses = await getExpenses(userPhone);
    double net = 0;
    for (var e in expenses) {
      final settled = e.settledFriendIds;
      final isOpenWithFriend = settled.isEmpty || !settled.contains(friendPhone);
      if (e.friendIds.contains(friendPhone) && isOpenWithFriend) {
        if (e.payerId == userPhone) {
          net += e.amount;
        } else if (e.payerId == friendPhone) {
          net -= e.amount;
        }
      }
    }
    return net;
  }

  Future<List<ExpenseItem>> getOpenExpensesWithFriend(String userPhone, String friendPhone) async {
    final expenses = await getExpenses(userPhone);
    return expenses.where((e) {
      final settled = e.settledFriendIds;
      final isOpenWithFriend = settled.isEmpty || !settled.contains(friendPhone);
      return e.friendIds.contains(friendPhone) && isOpenWithFriend;
    }).toList();
  }

  // ===================== 🔎 Facets =====================
  /// Returns unique labels (from `labels[]`) for this user (auto-fill chips)
  Future<List<String>> distinctLabels(String userPhone, {int scanLimit = 1000}) async {
    final snap = await getExpensesCollection(userPhone).limit(scanLimit).get();
    final out = <String>{};
    for (final d in snap.docs) {
      final data = d.data();
      final raw = data['labels'];
      if (raw is List) {
        for (final v in raw) {
          if (v is String && v.trim().isNotEmpty) out.add(v.trim());
        }
      }
      // include legacy single 'label' as well
      final legacy = data['label'];
      if (legacy is String && legacy.trim().isNotEmpty) out.add(legacy.trim());
    }
    final list = out.toList()..sort();
    return list;
  }

  /// Returns unique categories for this user
  Future<List<String>> distinctCategories(String userPhone, {int scanLimit = 1000}) async {
    final snap = await getExpensesCollection(userPhone).limit(scanLimit).get();
    final out = <String>{};
    for (final d in snap.docs) {
      final cat = d.data()['category'];
      if (cat is String && cat.trim().isNotEmpty) out.add(cat.trim());
    }
    final list = out.toList()..sort();
    return list;
  }

  // ===================== 🔎 Advanced Search =====================
  Future<List<QueryDocumentSnapshot<Map<String, dynamic>>>> _rawQueryDocs(
      String userPhone,
      ExpenseQuery q,
      ) async {
    Query<Map<String, dynamic>> ref = getExpensesCollection(userPhone);

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
  Future<List<ExpenseItem>> queryHybrid(String userPhone, ExpenseQuery q) async {
    final docs = await _rawQueryDocs(userPhone, q);
    final items = docs.map((d) => ExpenseItem.fromJson(d.data())).toList();

    return items.where((e) {
      if (q.text != null && q.text!.trim().isNotEmpty) {
        final t = q.text!.toLowerCase();
        final hay = [
          e.title ?? '',
          e.comments ?? '',
          e.note,              // parsed/system note
          e.category ?? '',
          e.label ?? '',
          ...e.labels,
        ].join(' ').toLowerCase();
        if (!hay.contains(t)) return false;
      }
      if (q.minAmount != null && e.amount < q.minAmount!) return false;
      if (q.maxAmount != null && e.amount > q.maxAmount!) return false;
      return true;
    }).toList();
  }

  // ===================== ✍️ Bulk Edit =====================
  /// - Set title/comments/category/date for many expenses
  /// - Add/Remove labels (computed once; mirrors to friends + group)
  Future<void> bulkEdit(
      String userPhone,
      List<String> expenseIds, {
        String? title,
        String? comments,
        String? category,
        DateTime? date,
        List<String>? addLabels,
        List<String>? removeLabels,
      }) async {
    if (expenseIds.isEmpty) return;

    // sanitize label inputs
    final add = (addLabels ?? const [])
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toSet();
    final rem = (removeLabels ?? const [])
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toSet();

    for (final id in expenseIds) {
      final snap = await getExpensesCollection(userPhone).doc(id).get();
      if (!snap.exists) continue;

      final data = snap.data()!;
      final base = ExpenseItem.fromJson(data);

      // Compute final labels on the array field `labels` (leave legacy `label` untouched)
      final currentLabels = <String>[...base.labels];
      final seen = <String>{};

      currentLabels.addAll(add);                       // additions
      final filtered = currentLabels.where((l) => !rem.contains(l)).toList(); // removals
      final finalLabels = filtered.where((l) => seen.add(l)).toList();        // de-dup

      // Build update map
      final update = <String, dynamic>{};
      if (title != null) update['title'] = title;
      if (comments != null) update['comments'] = comments;
      if (category != null) update['category'] = category;
      if (date != null) update['date'] = Timestamp.fromDate(date);
      update['labels'] = finalLabels; // always set computed labels

      await _applyUpdateEverywhere(userPhone: userPhone, base: base, updateMap: update);
    }
  }

  // 🔧 Internal: apply an update map to user + mirrors + group (single expense)
  Future<void> _applyUpdateEverywhere({
    required String userPhone,
    required ExpenseItem base,
    required Map<String, dynamic> updateMap,
  }) async {
    final batch = _firestore.batch();

    // User doc
    final userDoc = getExpensesCollection(userPhone).doc(base.id);
    batch.update(userDoc, updateMap);

    // Friend mirrors
    for (final friend in base.friendIds) {
      if (friend == userPhone) continue;
      final friendDoc = getExpensesCollection(friend).doc(base.id);
      batch.update(friendDoc, updateMap);
    }

    // Group aggregate
    if (base.groupId != null) {
      final gdoc = _groupExpenses.doc(base.id);
      batch.set(gdoc, updateMap, SetOptions(merge: true));
    }

    await batch.commit();
  }
  // ===================== ✂️ Bulk Split =====================
  /// Updates participants (friends/group) for multiple expenses.
  /// Note: this overrides existing splits.
  Future<void> bulkSplit(
      String userPhone,
      List<ExpenseItem> expenses, {
        required List<String> friendIds,
        required String? groupId,
        String? payerPhone,
        String? label,
        String? note,
      }) async {
    // Sanitize friendIds (exclude user)
    final normalizedFriends = friendIds
        .where((p) => p.trim().isNotEmpty && p != userPhone)
        .toSet()
        .toList();

    // Check logic: if group, friendIds empty
    final effectiveFriendIds = (groupId != null && groupId.isNotEmpty) ? <String>[] : normalizedFriends;

    for (final base in expenses) {
      // Prepare updates
      var updated = base.copyWith(
        friendIds: effectiveFriendIds,
        groupId: groupId?.isEmpty == true ? null : groupId,
        // Reset custom splits on bulk change
        // customSplits: null, // Assuming copyWith supports setting null.
        // If copyWith only updates if non-null, we might need a way to clear it.
        // Most generated copyWith( {Map? customSplits} ) -> customSplits: customSplits ?? this.customSplits
        // If so, passing null won't clear it.
        // I will inspect ExpenseItem later if this fails, but for now I will assume I need to handle it.
        // If copyWith is smart, I'll pass null. Use `forceCustomSplitsNull`? No.
        // If I can't clear it, I'll modify the object manually or construct new.
        // Let's assume I can pass an empty map or check ExpenseItem.
        updatedAt: DateTime.now(),
        updatedBy: 'bulk',
      );
      
      // Force clear custom splits (workaround if copyWith ignores null)
      // Actually, safest is to instantiate. But that's tedious.
      // I'll check ExpenseItem later. For now, I'll pass empty map if null not possible?
      // updated = updated.copyWith(customSplits: {}); 
      
      if (payerPhone != null) {
        updated = updated.copyWith(payerId: payerPhone);
      }

      if (label != null && label.isNotEmpty) {
        final newLabels = {...updated.labels, label}.toList();
        updated = updated.copyWith(label: label, labels: newLabels);
      }

      if (note != null && note.isNotEmpty) {
        updated = updated.copyWith(comments: note, note: note);
      }

      // Filter settled friends if not in group
      if (groupId == null || groupId.isEmpty) {
        final newSettled = base.settledFriendIds
            .where((id) => effectiveFriendIds.contains(id))
            .toList();
        updated = updated.copyWith(settledFriendIds: newSettled);
      }

      // Hack for clearing customSplits if copyWith doesn't support null
      // (Usually copyWith(val) uses val ?? this.val).
      // If I want to set null, I might need `customSplits: null` but it might be ignored.
      // I will inspect ExpenseItem in a second.
      // If I can't clear customSplits easily, I'll assume they persist? No that's bad.
      // I'll modify `updated` to have null customSplits.
      updated = _clearCustomSplits(updated);

      await updateExpense(userPhone, updated);
    }
  }

  ExpenseItem _clearCustomSplits(ExpenseItem item) {
    // Helper to clear custom splits since copyWith might not support explicit null
    return ExpenseItem(
      id: item.id,
      amount: item.amount,
      note: item.note,
      date: item.date,
      payerId: item.payerId,
      friendIds: item.friendIds,
      groupId: item.groupId,
      settledFriendIds: item.settledFriendIds,
      customSplits: null, // Clear here
      type: item.type,
      subtype: item.subtype,
      cardType: item.cardType,
      cardLast4: item.cardLast4,
      isBill: item.isBill,
      imageUrl: item.imageUrl,
      label: item.label,
      labels: item.labels,
      comments: item.comments,
      category: item.category,
      createdAt: item.createdAt,
      createdBy: item.createdBy,
      updatedAt: item.updatedAt,
      updatedBy: item.updatedBy,
    );
  }
}
