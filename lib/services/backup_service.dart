import 'dart:convert';
import '../shims/shared_prefs_shim.dart';

import 'package:share_plus/share_plus.dart'; // <-- NEW!
import '../models/income_item.dart';
import '../models/expense_item.dart';
import '../models/goal_model.dart';

class BackupService {
  static Future<void> backupUserData({
    required String userId,
    required List<IncomeItem> incomes,
    required List<ExpenseItem> expenses,
    required List<GoalModel> goals,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('backup_$userId', jsonEncode({
      'incomes': incomes.map((i) => i.toJson()).toList(),
      'expenses': expenses.map((e) => e.toJson()).toList(),
      'goals': goals.map((g) => g.toJson()).toList(),
    }));
  }

  static Future<Map<String, dynamic>?> restoreUserData(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = prefs.getString('backup_$userId');
    if (jsonString == null) return null;
    return jsonDecode(jsonString);
  }

  // 🚀 New: Share/Export data using share_plus
  static Future<void> shareUserData({String userId = 'default'}) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = prefs.getString('backup_$userId');
    if (jsonString == null) {
      throw Exception("No backup found to share!");
    }
    // Optionally: Save as .json file and share as file
    await Share.share(
      jsonString,
      subject: "My Fiinny App Data Backup",
    );
  }
}
