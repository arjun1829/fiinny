import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';

class ExpenseService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Always use user phone (E.164) as key
  CollectionReference<Map<String, dynamic>> getExpensesCollection(String userPhone) {
    return _firestore.collection('users').doc(userPhone).collection('expenses');
  }

  /// List all expenses for user (includes credit card, group, etc.)
  Future<List<ExpenseItem>> getExpenses(String userPhone) async {
    final snapshot = await getExpensesCollection(userPhone).get();
    return snapshot.docs.map((doc) => ExpenseItem.fromJson(doc.data())).toList();
  }

  /// Add an expense (handles custom splits, mirroring, group logic, supports unregistered)
  Future<String> addExpenseWithDialog(ExpenseItem expense, String userPhone) async {
    final docRef = getExpensesCollection(userPhone).doc();
    final expenseWithId = expense.copyWith(id: docRef.id);
    await docRef.set(expenseWithId.toJson());

    // --- Handle custom splits for all participants (by phone) ---
    if (expense.customSplits != null && expense.customSplits!.isNotEmpty) {
      for (final entry in expense.customSplits!.entries) {
        final friendPhone = entry.key;
        if (friendPhone != userPhone) {
          // Each participant gets their split amount
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

    // Write to global group collection for group analytics
    if (expense.groupId != null) {
      await _firestore.collection('expenses').doc(expenseWithId.id).set(expenseWithId.toJson());
    }

    return docRef.id;
  }

  /// Add an expense (with custom splits and sync logic)
  Future<String> addExpenseWithSync(String userPhone, ExpenseItem expense) async {
    final docRef = getExpensesCollection(userPhone).doc();
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
      // Fallback: classic friends mirroring
      for (String friendPhone in expense.friendIds) {
        if (friendPhone != userPhone) {
          final mirrorDoc = getExpensesCollection(friendPhone).doc(expenseWithId.id);
          await mirrorDoc.set(expenseWithId.toJson());
        }
      }
    }

    if (expense.groupId != null) {
      await _firestore.collection('expenses').doc(expenseWithId.id).set(expenseWithId.toJson());
    }

    return docRef.id;
  }

  /// Add a basic expense (no mirroring, only for user)
  Future<String> addExpense(String userPhone, ExpenseItem expense) async {
    final docRef = getExpensesCollection(userPhone).doc();
    final expenseWithId = expense.copyWith(id: docRef.id);
    await docRef.set(expenseWithId.toJson());

    if (expense.groupId != null) {
      await _firestore.collection('expenses').doc(expenseWithId.id).set(expenseWithId.toJson());
    }
    return docRef.id;
  }

  /// Update an expense everywhere (user, friends, mirrored) by phone
  Future<void> updateExpense(String userPhone, ExpenseItem expense) async {
    await getExpensesCollection(userPhone).doc(expense.id).update(expense.toJson());
    for (String friendPhone in expense.friendIds) {
      if (friendPhone != userPhone) {
        await getExpensesCollection(friendPhone).doc(expense.id).update(expense.toJson());
      }
    }
  }

  /// Delete an expense everywhere (user, friends, group-level/global) by phone
  Future<void> deleteExpense(String userPhone, String expenseId, {List<String>? friendPhones}) async {
    await getExpensesCollection(userPhone).doc(expenseId).delete();
    if (friendPhones != null) {
      for (String friendPhone in friendPhones) {
        if (friendPhone != userPhone) {
          await getExpensesCollection(friendPhone).doc(expenseId).delete();
        }
      }
    }
    // Remove from group/global expenses collection
    await _firestore.collection('expenses').doc(expenseId).delete();
  }

  /// Settle up an expense (marks as settled for both users)
  Future<void> settleUpExpense(String userPhone, String expenseId, String friendPhone) async {
    final ref = getExpensesCollection(userPhone).doc(expenseId);
    await ref.update({
      'settledFriendIds': FieldValue.arrayUnion([friendPhone])
    });
    final friendRef = getExpensesCollection(friendPhone).doc(expenseId);
    await friendRef.update({
      'settledFriendIds': FieldValue.arrayUnion([userPhone])
    });
  }

  /// Update custom split for an expense (advanced, rarely used directly)
  Future<void> updateExpenseCustomSplit(String expenseId, Map<String, double> splits) async {
    await _firestore.collection('expenses').doc(expenseId).update({
      'customSplits': splits,
    });
  }

  /// Realtime stream for user expenses (by phone)
  Stream<List<ExpenseItem>> getExpensesStream(String userPhone) {
    return getExpensesCollection(userPhone)
        .orderBy('date', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) => ExpenseItem.fromJson(doc.data())).toList());
  }

  /// Realtime stream for group expenses (by phone)
  Stream<List<ExpenseItem>> getGroupExpensesStream(String userPhone, String groupId) {
    final ref = getExpensesCollection(userPhone).where('groupId', isEqualTo: groupId);

    return ref.snapshots().map((snap) =>
        snap.docs.map((d) => ExpenseItem.fromJson(d.data())).toList());
  }

  Future<List<ExpenseItem>> getExpensesByGroup(String userPhone, String groupId) async {
    final snap = await getExpensesCollection(userPhone)
        .where('groupId', isEqualTo: groupId)
        .get();
    return snap.docs.map((d) => ExpenseItem.fromJson(d.data())).toList();
  }

  /// Add a settlement record (auto-mirrored)
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

  /// Group-level settlement helper
  Future<void> addGroupSettlement(
      String userPhone,
      String groupId,
      String friendPhone,
      double amount, {
        String note = "Settlement",
      }) async {
    await addSettlement(userPhone, friendPhone, amount, groupId: groupId);
  }

  /// All expenses for a group (global)
  Future<List<ExpenseItem>> getExpensesForGroup(String groupId) async {
    final query = await _firestore
        .collection('expenses')
        .where('groupId', isEqualTo: groupId)
        .get();
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

  // ======= ADVANCED HELPERS FOR SUMMARY =======

  /// Returns the open (not settled) net amount between user and friend
  /// - Negative: You owe friend
  /// - Positive: Friend owes you
  Future<double> getOpenAmountWithFriend(String userPhone, String friendPhone) async {
    final expenses = await getExpenses(userPhone);
    double net = 0;
    for (var e in expenses) {
      if (e.friendIds.contains(friendPhone) && (e.settledFriendIds == null || !e.settledFriendIds!.contains(friendPhone))) {
        if (e.payerId == userPhone) {
          net += e.amount;
        } else if (e.payerId == friendPhone) {
          net -= e.amount;
        }
      }
    }
    return net;
  }

  /// Returns all open (not settled) expenses with a friend (for history, etc)
  Future<List<ExpenseItem>> getOpenExpensesWithFriend(String userPhone, String friendPhone) async {
    final expenses = await getExpenses(userPhone);
    return expenses.where((e) =>
    e.friendIds.contains(friendPhone) &&
        (e.settledFriendIds == null || !e.settledFriendIds!.contains(friendPhone))
    ).toList();
  }

  /// Utility: Settle up all open expenses between you and friend (across groups too)
  Future<void> settleAllWithFriend(String userPhone, String friendPhone) async {
    final expenses = await getExpenses(userPhone);
    for (var e in expenses) {
      if (e.friendIds.contains(friendPhone) && (e.settledFriendIds == null || !e.settledFriendIds!.contains(friendPhone))) {
        await settleUpExpense(userPhone, e.id, friendPhone);
      }
    }
  }
}
