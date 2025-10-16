import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:share_plus/share_plus.dart';

import '../models/income_item.dart';
import '../models/expense_item.dart';
import '../models/goal_model.dart';

class BackupService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static DocumentReference<Map<String, dynamic>> _docRef(String userId) {
    return _firestore.collection('users').doc(userId).collection('backups').doc('latest');
  }

  static Future<void> backupUserData({
    required String userId,
    required List<IncomeItem> incomes,
    required List<ExpenseItem> expenses,
    required List<GoalModel> goals,
  }) async {
    final payload = {
      'incomes': incomes.map((i) => i.toJson()).toList(),
      'expenses': expenses.map((e) => e.toJson()).toList(),
      'goals': goals.map((g) => g.toJson()).toList(),
      'updatedAt': DateTime.now().toIso8601String(),
    };

    await _docRef(userId).set(payload, SetOptions(merge: true));
  }

  static Future<Map<String, dynamic>?> restoreUserData(String userId) async {
    final snap = await _docRef(userId).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  // 🚀 Share/Export data using share_plus
  static Future<void> shareUserData({required String userId}) async {
    final data = await restoreUserData(userId);
    if (data == null) {
      throw Exception("No backup found to share!");
    }

    final jsonString = jsonEncode(data);
    await Share.share(
      jsonString,
      subject: "My Fiinny App Data Backup",
    );
  }
}
