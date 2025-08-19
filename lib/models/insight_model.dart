// models/insight_model.dart

enum InsightType {
  info,
  warning,
  positive,
  critical,
  creditCardDue,    // NEW: For CC bill reminders
  billDue,          // NEW: For any bill due
  overdueAlert,     // NEW: For overdue notices
  // Add more as needed (eg: netWorth, loan, asset, goal, crisis)
}

class InsightModel {
  final String? id; // (optional) Unique id for insight, for DB
  final String title;
  final String description;
  final InsightType type;
  final DateTime timestamp;
  final String? userId;

  final String? relatedLoanId;
  final String? relatedAssetId;
  final String? relatedGoalId;
  final String? relatedCreditCardId; // NEW
  final String? relatedBillId;       // NEW

  final String? category; // eg: 'loan', 'asset', 'expense', 'goal', 'general', 'credit_card', 'bill'
  final bool? isRead; // for notification-like behavior
  final int? severity; // 0=info, 1=positive, 2=warning, 3=critical

  final bool? isActionable; // NEW: tap to pay/mark as paid

  InsightModel({
    this.id,
    required this.title,
    required this.description,
    required this.type,
    required this.timestamp,
    this.userId,
    this.relatedLoanId,
    this.relatedAssetId,
    this.relatedGoalId,
    this.relatedCreditCardId,
    this.relatedBillId,
    this.category,
    this.isRead,
    this.severity,
    this.isActionable,
  });

  // 🔁 Convert InsightType <-> String
  static InsightType _stringToType(String value) {
    switch (value.toLowerCase()) {
      case 'warning':
        return InsightType.warning;
      case 'positive':
        return InsightType.positive;
      case 'critical':
        return InsightType.critical;
      case 'creditcarddue':
      case 'credit_card_due':
      case 'credit_carddue':
        return InsightType.creditCardDue;
      case 'billdue':
      case 'bill_due':
        return InsightType.billDue;
      case 'overduealert':
      case 'overdue_alert':
        return InsightType.overdueAlert;
      default:
        return InsightType.info;
    }
  }

  static String _typeToString(InsightType type) {
    return type.toString().split('.').last;
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      'title': title,
      'description': description,
      'type': _typeToString(type),
      'timestamp': timestamp.toIso8601String(),
      if (userId != null) 'userId': userId,
      if (relatedLoanId != null) 'relatedLoanId': relatedLoanId,
      if (relatedAssetId != null) 'relatedAssetId': relatedAssetId,
      if (relatedGoalId != null) 'relatedGoalId': relatedGoalId,
      if (relatedCreditCardId != null) 'relatedCreditCardId': relatedCreditCardId,
      if (relatedBillId != null) 'relatedBillId': relatedBillId,
      if (category != null) 'category': category,
      if (isRead != null) 'isRead': isRead,
      if (severity != null) 'severity': severity,
      if (isActionable != null) 'isActionable': isActionable,
    };
  }

  factory InsightModel.fromJson(Map<String, dynamic> json) {
    return InsightModel(
      id: json['id'],
      title: json['title'],
      description: json['description'],
      type: _stringToType(json['type']),
      timestamp: DateTime.parse(json['timestamp']),
      userId: json['userId'],
      relatedLoanId: json['relatedLoanId'],
      relatedAssetId: json['relatedAssetId'],
      relatedGoalId: json['relatedGoalId'],
      relatedCreditCardId: json['relatedCreditCardId'],
      relatedBillId: json['relatedBillId'],
      category: json['category'],
      isRead: json['isRead'],
      severity: json['severity'],
      isActionable: json['isActionable'],
    );
  }
}
