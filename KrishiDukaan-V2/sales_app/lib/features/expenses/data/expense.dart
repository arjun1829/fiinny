import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';

enum ExpenseCategory {
  travel('travel', 'Travel', Icons.directions_bus_rounded),
  fuel('fuel', 'Fuel', Icons.local_gas_station_rounded),
  food('food', 'Food', Icons.restaurant_rounded),
  lodging('lodging', 'Lodging', Icons.hotel_rounded),
  toll('toll', 'Toll & Parking', Icons.toll_rounded),
  mobile('mobile', 'Mobile & Data', Icons.smartphone_rounded),
  other('other', 'Other', Icons.receipt_long_rounded);

  const ExpenseCategory(this.wire, this.label, this.icon);
  final String wire;
  final String label;
  final IconData icon;

  static ExpenseCategory from(dynamic raw) => ExpenseCategory.values.firstWhere(
    (c) => c.wire == '${raw ?? ''}',
    orElse: () => ExpenseCategory.other,
  );
}

enum ExpenseStatus {
  pending('PENDING', 'Pending', AppColors.warning, AppColors.warningContainer),
  approved(
    'APPROVED',
    'Approved',
    AppColors.success,
    AppColors.successContainer,
  ),
  rejected('REJECTED', 'Rejected', AppColors.error, AppColors.errorContainer);

  const ExpenseStatus(this.wire, this.label, this.color, this.background);
  final String wire;
  final String label;
  final Color color;
  final Color background;

  static ExpenseStatus from(dynamic raw) => ExpenseStatus.values.firstWhere(
    (s) => s.wire == '${raw ?? ''}',
    orElse: () => ExpenseStatus.pending,
  );
}

/// A field expense claim raised by a rep and reviewed by an admin.
///
/// Amounts are stored as plain rupees (a number), matching how every other
/// money field in this project is stored — not paise. Only Razorpay works in
/// paise, and no payment ever touches this collection.
class Expense {
  final String id;
  final String salesExecutiveId;

  /// IST day the spend happened on — which is not necessarily the day it was
  /// entered, since reps commonly file yesterday's bills the next morning.
  final String date;
  final ExpenseCategory category;
  final double amount;
  final String? description;
  final String? billUrl;
  final String? billPath;
  final ExpenseStatus status;
  final String? reviewNote;
  final DateTime? reviewedAt;
  final String? daySessionId;
  final DateTime? createdAt;

  const Expense({
    required this.id,
    required this.salesExecutiveId,
    required this.date,
    required this.category,
    required this.amount,
    this.description,
    this.billUrl,
    this.billPath,
    required this.status,
    this.reviewNote,
    this.reviewedAt,
    this.daySessionId,
    this.createdAt,
  });

  /// Only a claim still awaiting review may be edited or withdrawn — once an
  /// admin has decided, the record is an audit trail. The Firestore rules
  /// enforce the same thing server-side; this is the UI's copy of that fact.
  bool get isEditable => status == ExpenseStatus.pending;

  factory Expense.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const {};
    return Expense(
      id: doc.id,
      salesExecutiveId: '${d['salesExecutiveId'] ?? ''}',
      date: '${d['date'] ?? ''}',
      category: ExpenseCategory.from(d['category']),
      amount: (d['amount'] as num?)?.toDouble() ?? 0,
      description: d['description'] as String?,
      billUrl: d['billUrl'] as String?,
      billPath: d['billPath'] as String?,
      status: ExpenseStatus.from(d['status']),
      reviewNote: d['reviewNote'] as String?,
      reviewedAt: (d['reviewedAt'] as Timestamp?)?.toDate(),
      daySessionId: d['daySessionId'] as String?,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}

class ExpenseInput {
  final String date;
  final ExpenseCategory category;
  final double amount;
  final String? description;
  final String? daySessionId;

  const ExpenseInput({
    required this.date,
    required this.category,
    required this.amount,
    this.description,
    this.daySessionId,
  });
}
