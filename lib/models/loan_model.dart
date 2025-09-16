// lib/models/loan_model.dart
import 'package:cloud_firestore/cloud_firestore.dart' show Timestamp;

/// How interest is calculated for this loan.
enum LoanInterestMethod { reducing, flat }

LoanInterestMethod _parseMethod(dynamic v) {
  final s = (v ?? '').toString().toLowerCase();
  if (s == 'flat') return LoanInterestMethod.flat;
  return LoanInterestMethod.reducing;
}

String _methodToString(LoanInterestMethod m) => m.name;

/// v2 model notes:
/// - Backward-compatible with your existing data.
/// - Adds optional UX/credit-style fields (accountLast4, minDue, billCycleDay, tags).
/// - Adds helpful computed getters: nextPaymentDate, isDueToday, isHighInterest, monthsBetweenDates, etc.
/// - Flexible parsing for Timestamp / ISO / millis.
class LoanModel {
  final String? id;                 // Firestore doc id (optional when creating)
  final String userId;
  final String title;

  /// Current outstanding/principal (what's left to repay).
  final double amount;

  /// Original sanctioned principal (optional).
  final double? originalAmount;

  /// "Bank" / "Friend" / "Other" (string kept for backward compatibility)
  final String lenderType;
  final String? lenderName;

  /// Optional meta often useful for cards/bills UI.
  final String? accountLast4;       // e.g., "1234" (masked)
  final double? minDue;             // for credit-style loans/cards
  final int? billCycleDay;          // statement/cycle day (1..28 preferred)

  final DateTime? startDate;        // optional
  final DateTime? dueDate;          // final maturity or manual override

  final double? interestRate;       // Annual %, e.g. 12.5
  final LoanInterestMethod interestMethod;

  /// Monthly EMI (computed or user-provided override).
  final double? emi;

  /// Remaining or total tenure, in months (can be derived from dates).
  final int? tenureMonths;

  // Reminders / prefs
  /// Safe day-of-month for payment (1..28).
  final int? paymentDayOfMonth;
  final bool? reminderEnabled;
  final int? reminderDaysBefore;    // e.g., 2 days before
  /// Stored as "HH:mm" (24h) for portability (e.g., "09:00").
  final String? reminderTime;
  final bool? autopay;

  // Payment tracking (optional, for richer UI/insights)
  final DateTime? lastPaymentDate;
  final double? lastPaymentAmount;

  // Tagging/labels for filters (e.g., ["education","secured"])
  final List<String>? tags;

  final String? note;
  final bool isClosed;
  final DateTime? createdAt;

  const LoanModel({
    this.id,
    required this.userId,
    required this.title,
    required this.amount,
    required this.lenderType,
    this.originalAmount,
    this.lenderName,
    this.accountLast4,
    this.minDue,
    this.billCycleDay,
    this.startDate,
    this.dueDate,
    this.interestRate,
    this.interestMethod = LoanInterestMethod.reducing,
    this.emi,
    this.tenureMonths,
    this.paymentDayOfMonth,
    this.reminderEnabled,
    this.reminderDaysBefore,
    this.reminderTime,
    this.autopay,
    this.lastPaymentDate,
    this.lastPaymentAmount,
    this.tags,
    this.note,
    this.isClosed = false,
    this.createdAt,
  });

  // ---------------------------- Parsing helpers ----------------------------

  static DateTime? _asDate(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    if (v is Timestamp) return v.toDate();
    if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  static double? _asDoubleN(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString().trim());
  }

  static double _asDouble(dynamic v, {double fallback = 0.0}) =>
      _asDoubleN(v) ?? fallback;

  static int? _asIntN(dynamic v) {
    if (v == null) return null;
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString().trim());
  }

  static String? _asStringN(dynamic v) {
    if (v == null) return null;
    final s = v.toString();
    return s.isEmpty ? null : s;
  }

  static List<String>? _asStringListN(dynamic v) {
    if (v == null) return null;
    if (v is List) {
      final list = v.map((e) => e?.toString()).whereType<String>().toList();
      return list.isEmpty ? null : list;
    }
    return null;
  }

  // -------------------------------- Factory --------------------------------

  factory LoanModel.fromJson(Map<String, dynamic> json, [String? id]) {
    return LoanModel(
      id: id,
      userId: (json['userId'] ?? '') as String,
      title: (json['title'] ?? '') as String,
      amount: _asDouble(json['amount']),
      originalAmount: _asDoubleN(json['originalAmount']),
      lenderType: (json['lenderType'] ?? '') as String,
      lenderName: _asStringN(json['lenderName']),
      accountLast4: _asStringN(json['accountLast4']),
      minDue: _asDoubleN(json['minDue']),
      billCycleDay: _asIntN(json['billCycleDay']),
      startDate: _asDate(json['startDate']),
      dueDate: _asDate(json['dueDate']),
      interestRate: _asDoubleN(json['interestRate']),
      interestMethod: json['interestMethod'] == null
          ? LoanInterestMethod.reducing
          : _parseMethod(json['interestMethod']),
      emi: _asDoubleN(json['emi']),
      tenureMonths: _asIntN(json['tenureMonths']),
      paymentDayOfMonth: _asIntN(json['paymentDayOfMonth']),
      reminderEnabled: json['reminderEnabled'] is bool ? json['reminderEnabled'] as bool : null,
      reminderDaysBefore: _asIntN(json['reminderDaysBefore']),
      reminderTime: _asStringN(json['reminderTime']),
      autopay: json['autopay'] is bool ? json['autopay'] as bool : null,
      lastPaymentDate: _asDate(json['lastPaymentDate']),
      lastPaymentAmount: _asDoubleN(json['lastPaymentAmount']),
      tags: _asStringListN(json['tags']),
      note: _asStringN(json['note']),
      isClosed: (json['isClosed'] as bool?) ?? false,
      createdAt: _asDate(json['createdAt']),
    );
  }

  // Alias for Firestore docs
  factory LoanModel.fromFirestore(Map<String, dynamic> data, String id) =>
      LoanModel.fromJson(data, id);

  // -------------------------------- JSON ----------------------------------

  Map<String, dynamic> toJson({bool asTimestamp = false}) {
    Object? _outDate(DateTime? d) {
      if (d == null) return null;
      return asTimestamp ? Timestamp.fromDate(d) : d.toIso8601String();
    }

    return {
      'userId': userId,
      'title': title,
      'amount': amount,
      if (originalAmount != null) 'originalAmount': originalAmount,
      'lenderType': lenderType,
      if (lenderName != null) 'lenderName': lenderName,
      if (accountLast4 != null) 'accountLast4': accountLast4,
      if (minDue != null) 'minDue': minDue,
      if (billCycleDay != null) 'billCycleDay': billCycleDay,
      if (startDate != null) 'startDate': _outDate(startDate),
      if (dueDate != null) 'dueDate': _outDate(dueDate),
      if (interestRate != null) 'interestRate': interestRate,
      'interestMethod': _methodToString(interestMethod),
      if (emi != null) 'emi': emi,
      if (tenureMonths != null) 'tenureMonths': tenureMonths,
      if (paymentDayOfMonth != null) 'paymentDayOfMonth': paymentDayOfMonth,
      if (reminderEnabled != null) 'reminderEnabled': reminderEnabled,
      if (reminderDaysBefore != null) 'reminderDaysBefore': reminderDaysBefore,
      if (reminderTime != null) 'reminderTime': reminderTime,
      if (autopay != null) 'autopay': autopay,
      if (lastPaymentDate != null) 'lastPaymentDate': _outDate(lastPaymentDate),
      if (lastPaymentAmount != null) 'lastPaymentAmount': lastPaymentAmount,
      if (tags != null && tags!.isNotEmpty) 'tags': tags,
      if (note != null && note!.isNotEmpty) 'note': note,
      'isClosed': isClosed,
      if (createdAt != null) 'createdAt': _outDate(createdAt),
    };
  }

  // --------------------------- Convenience getters ---------------------------

  bool get isActive => !isClosed;
  bool get hasRate => (interestRate ?? 0) > 0;
  bool get hasEmi => (emi ?? 0) > 0;
  bool get isHighInterest => (interestRate ?? 0) >= 24;

  /// If both dates exist, months between (rounded down).
  int? get monthsBetweenDates {
    if (startDate == null || dueDate == null) return tenureMonths;
    final y = dueDate!.year - startDate!.year;
    final m = dueDate!.month - startDate!.month;
    final total = y * 12 + m;
    return total >= 0 ? total : 0;
  }

  bool get isOverdue {
    if (isClosed) return false;
    if (dueDate == null) return false;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return dueDate!.isBefore(today);
  }

  /// Returns the safe day-of-month clamped to 1..28 (avoids month-end bugs).
  int? get safePaymentDay => paymentDayOfMonth == null
      ? null
      : paymentDayOfMonth!.clamp(1, 28);

  /// Compute next payment date using [paymentDayOfMonth] (clamped) and [dueDate].
  /// - If closed => null
  /// - If recurring day present => next occurrence (today or next month), clamped to final due if earlier
  /// - Else => final [dueDate]
  DateTime? nextPaymentDate({DateTime? now}) {
    if (isClosed) return null;
    now ??= DateTime.now();
    if (safePaymentDay != null) {
      // compute this month's occurrence
      final int day = _minDay(now.year, now.month, safePaymentDay!);
      DateTime candidate = DateTime(now.year, now.month, day);
      final today = DateTime(now.year, now.month, now.day);
      if (!candidate.isAfter(today)) {
        // next month
        int ny = now.year, nm = now.month + 1;
        if (nm == 13) { nm = 1; ny++; }
        final int day2 = _minDay(ny, nm, safePaymentDay!);
        candidate = DateTime(ny, nm, day2);
      }
      if (dueDate != null && dueDate!.isBefore(candidate)) {
        return dueDate;
      }
      return candidate;
    }
    return dueDate;
  }

  bool get isDueToday {
    final nd = nextPaymentDate();
    if (nd == null) return false;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final d = DateTime(nd.year, nd.month, nd.day);
    return d.isAtSameMomentAs(today);
  }

  /// Months elapsed since start (rounded down).
  int get monthsElapsed {
    if (startDate == null) return 0;
    final now = DateTime.now();
    final y = now.year - startDate!.year;
    final m = now.month - startDate!.month;
    final total = y * 12 + m;
    return total < 0 ? 0 : total;
  }

  // -------------------------------- copyWith --------------------------------

  LoanModel copyWith({
    String? id,
    String? userId,
    String? title,
    double? amount,
    double? originalAmount,
    String? lenderType,
    String? lenderName,
    String? accountLast4,
    double? minDue,
    int? billCycleDay,
    DateTime? startDate,
    DateTime? dueDate,
    double? interestRate,
    LoanInterestMethod? interestMethod,
    double? emi,
    int? tenureMonths,
    int? paymentDayOfMonth,
    bool? reminderEnabled,
    int? reminderDaysBefore,
    String? reminderTime,
    bool? autopay,
    DateTime? lastPaymentDate,
    double? lastPaymentAmount,
    List<String>? tags,
    String? note,
    bool? isClosed,
    DateTime? createdAt,
  }) {
    return LoanModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      title: title ?? this.title,
      amount: amount ?? this.amount,
      originalAmount: originalAmount ?? this.originalAmount,
      lenderType: lenderType ?? this.lenderType,
      lenderName: lenderName ?? this.lenderName,
      accountLast4: accountLast4 ?? this.accountLast4,
      minDue: minDue ?? this.minDue,
      billCycleDay: billCycleDay ?? this.billCycleDay,
      startDate: startDate ?? this.startDate,
      dueDate: dueDate ?? this.dueDate,
      interestRate: interestRate ?? this.interestRate,
      interestMethod: interestMethod ?? this.interestMethod,
      emi: emi ?? this.emi,
      tenureMonths: tenureMonths ?? this.tenureMonths,
      paymentDayOfMonth: paymentDayOfMonth ?? this.paymentDayOfMonth,
      reminderEnabled: reminderEnabled ?? this.reminderEnabled,
      reminderDaysBefore: reminderDaysBefore ?? this.reminderDaysBefore,
      reminderTime: reminderTime ?? this.reminderTime,
      autopay: autopay ?? this.autopay,
      lastPaymentDate: lastPaymentDate ?? this.lastPaymentDate,
      lastPaymentAmount: lastPaymentAmount ?? this.lastPaymentAmount,
      tags: tags ?? this.tags,
      note: note ?? this.note,
      isClosed: isClosed ?? this.isClosed,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  // ----------------------------- Utils / internals -----------------------------

  static int _daysInMonth(int year, int month) {
    final firstOfNext = (month == 12)
        ? DateTime(year + 1, 1, 1)
        : DateTime(year, month + 1, 1);
    return firstOfNext.subtract(const Duration(days: 1)).day;
  }

  static int _minDay(int year, int month, int desired) {
    final dim = _daysInMonth(year, month);
    return desired > dim ? dim : desired;
  }

  // -------------------------- Optional equality/hash --------------------------

  @override
  String toString() =>
      'LoanModel(id: $id, title: $title, amount: $amount, lenderType: $lenderType, isClosed: $isClosed)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          other is LoanModel &&
              runtimeType == other.runtimeType &&
              id == other.id &&
              userId == other.userId &&
              title == other.title &&
              amount == other.amount &&
              lenderType == other.lenderType &&
              isClosed == other.isClosed;

  @override
  int get hashCode =>
      id.hashCode ^ userId.hashCode ^ title.hashCode ^ amount.hashCode ^ lenderType.hashCode ^ isClosed.hashCode;
}
