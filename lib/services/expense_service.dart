import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';

class ExpenseService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // ── USER SCOPED COLLECTION (what Dashboard reads & Mirror writes) ─────────────
  // expenses/<userPhone>/items/*
  CollectionReference<Map<String, dynamic>> getExpensesCollection(String userPhone) {
    return _firestore.collection('users').doc(userPhone).collection('expenses');
  }

  // ── GLOBAL/GROUP ANALYTICS (separate collection to avoid path collision) ─────
  // group_expenses/<expenseId>
  CollectionReference<Map<String, dynamic>> get _groupExpenses =>
      _firestore.collection('group_expenses');

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
    }

    return docRef.id;
  }

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
    }

    return docRef.id;
  }

  /// Add a basic expense (no mirroring)
  Future<String> addExpense(String userPhone, ExpenseItem expense) async {
    final col = getExpensesCollection(userPhone);
    final docRef = col.doc();
    final expenseWithId = expense.copyWith(id: docRef.id);
    await docRef.set(expenseWithId.toJson());

    if (expense.groupId != null) {
      await _groupExpenses.doc(expenseWithId.id).set(expenseWithId.toJson());
    }
    return docRef.id;
  }

  /// Update an expense for user and all mirrored friends
  Future<void> updateExpense(String userPhone, ExpenseItem expense) async {
    await getExpensesCollection(userPhone).doc(expense.id).update(expense.toJson());
    for (String friendPhone in expense.friendIds) {
      if (friendPhone != userPhone) {
        await getExpensesCollection(friendPhone).doc(expense.id).update(expense.toJson());
      }
    }
    if (expense.groupId != null) {
      await _groupExpenses.doc(expense.id).set(expense.toJson(), SetOptions(merge: true));
    }
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
    await _groupExpenses.doc(expenseId).delete();
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
    return getExpensesCollection(userPhone)
        .where('groupId', isEqualTo: groupId)
        .orderBy('date', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map((d) => ExpenseItem.fromJson(d.data())).toList());
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
      settledFriendIds: [],
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

  // ======= Summary helpers (unchanged) =======
  Future<double> getOpenAmountWithFriend(String userPhone, String friendPhone) async {
    final expenses = await getExpenses(userPhone);
    double net = 0;
    for (var e in expenses) {
      if (e.friendIds.contains(friendPhone) &&
          (e.settledFriendIds == null || !e.settledFriendIds!.contains(friendPhone))) {
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
    return expenses.where((e) =>
    e.friendIds.contains(friendPhone) &&
        (e.settledFriendIds == null || !e.settledFriendIds!.contains(friendPhone))
    ).toList();
  }

  Future<void> settleAllWithFriend(String userPhone, String friendPhone) async {
    final expenses = await getExpenses(userPhone);
    for (var e in expenses) {
      if (e.friendIds.contains(friendPhone) &&
          (e.settledFriendIds == null || !e.settledFriendIds!.contains(friendPhone))) {
        await settleUpExpense(userPhone, e.id, friendPhone);
      }
    }
  }
}
