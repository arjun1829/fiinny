// lib/models/expense_item.dart
import 'package:cloud_firestore/cloud_firestore.dart';

class ExpenseItem {
  // --- Core fields (existing) ---
  final String id;
  final String type;
  final double amount;
  final String note;
  final DateTime date;
  final List<String> friendIds;
  final String? groupId;
  final List<String> settledFriendIds;
  final String payerId;
  final Map<String, double>? customSplits;
  final String? cardType;
  final String? cardLast4;
  final bool isBill;
  final String? imageUrl;
  final String? label;
  final String? category;
  final String? bankLogo;            // ✅ existing
  final String? attachmentUrl;       // ✅ existing
  final String? attachmentName;      // ✅ existing
  final int? attachmentSize;         // ✅ existing

  // --- Fiinnny Brain (new, optional & non-breaking) ---
  /// Arbitrary metadata learned by the brain (feeType, merchant, fxFee, recurringKey, etc.)
  final Map<String, dynamic>? brainMeta;
  /// Confidence score (0..1) for assigned label/category/tags.
  final double? confidence;
  /// Tags like: ["fee","subscription","loan_emi","autopay","forex","fixed_income"]
  final List<String>? tags;

  ExpenseItem({
    required this.id,
    required this.type,
    required this.amount,
    required this.note,
    required this.date,
    this.friendIds = const [],
    this.groupId,
    this.settledFriendIds = const [],
    required this.payerId,
    this.customSplits,
    this.cardType,
    this.cardLast4,
    this.isBill = false,
    this.imageUrl,
    this.label,
    this.category,
    this.bankLogo,
    this.attachmentUrl,
    this.attachmentName,
    this.attachmentSize,
    // brain
    this.brainMeta,
    this.confidence,
    this.tags,
  });

  ExpenseItem copyWith({
    String? id,
    String? type,
    double? amount,
    String? note,
    DateTime? date,
    List<String>? friendIds,
    String? groupId,
    List<String>? settledFriendIds,
    String? payerId,
    Map<String, double>? customSplits,
    String? cardType,
    String? cardLast4,
    bool? isBill,
    String? imageUrl,
    String? label,
    String? category,
    String? bankLogo,
    String? attachmentUrl,
    String? attachmentName,
    int? attachmentSize,
    Map<String, dynamic>? brainMeta,
    double? confidence,
    List<String>? tags,
  }) {
    return ExpenseItem(
      id: id ?? this.id,
      type: type ?? this.type,
      amount: amount ?? this.amount,
      note: note ?? this.note,
      date: date ?? this.date,
      friendIds: friendIds ?? List<String>.from(this.friendIds),
      groupId: groupId ?? this.groupId,
      settledFriendIds:
      settledFriendIds ?? List<String>.from(this.settledFriendIds),
      payerId: payerId ?? this.payerId,
      customSplits: customSplits ?? this.customSplits,
      cardType: cardType ?? this.cardType,
      cardLast4: cardLast4 ?? this.cardLast4,
      isBill: isBill ?? this.isBill,
      imageUrl: imageUrl ?? this.imageUrl,
      label: label ?? this.label,
      category: category ?? this.category,
      bankLogo: bankLogo ?? this.bankLogo,
      attachmentUrl: attachmentUrl ?? this.attachmentUrl,
      attachmentName: attachmentName ?? this.attachmentName,
      attachmentSize: attachmentSize ?? this.attachmentSize,
      // brain
      brainMeta: brainMeta ?? this.brainMeta,
      confidence: confidence ?? this.confidence,
      tags: tags ?? this.tags,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type,
    'amount': amount,
    'note': note,
    'date': Timestamp.fromDate(date),
    'friendIds': friendIds,
    'groupId': groupId,
    'settledFriendIds': settledFriendIds,
    'payerId': payerId,
    if (customSplits != null) 'customSplits': customSplits,
    if (cardType != null) 'cardType': cardType,
    if (cardLast4 != null) 'cardLast4': cardLast4,
    'isBill': isBill,
    if (imageUrl != null) 'imageUrl': imageUrl,
    if (label != null) 'label': label,
    if (category != null) 'category': category,
    'bankLogo': bankLogo,
    if (attachmentUrl != null) 'attachmentUrl': attachmentUrl,
    if (attachmentName != null) 'attachmentName': attachmentName,
    if (attachmentSize != null) 'attachmentSize': attachmentSize,
    // brain
    if (brainMeta != null) 'brainMeta': brainMeta,
    if (confidence != null) 'confidence': confidence,
    if (tags != null) 'tags': tags,
  };

  factory ExpenseItem.fromJson(Map<String, dynamic> json) {
    Map<String, double>? parseCustomSplits(dynamic value) {
      if (value == null) return null;
      final raw = Map<String, dynamic>.from(value);
      return raw.map((k, v) => MapEntry(k, (v as num?)?.toDouble() ?? 0.0));
    }

    return ExpenseItem(
      id: json['id'] ?? '',
      type: json['type'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      note: json['note'] ?? '',
      date: (json['date'] is Timestamp)
          ? (json['date'] as Timestamp).toDate()
          : DateTime.tryParse(json['date']?.toString() ?? '') ??
          DateTime.now(),
      friendIds: (json['friendIds'] is List)
          ? List<String>.from(json['friendIds'])
          : const [],
      groupId: json['groupId'],
      settledFriendIds: (json['settledFriendIds'] is List)
          ? List<String>.from(json['settledFriendIds'])
          : const [],
      payerId: json['payerId'] ?? '',
      customSplits: parseCustomSplits(json['customSplits']),
      cardType: json['cardType'],
      cardLast4: json['cardLast4'],
      isBill: json['isBill'] ?? false,
      imageUrl: json['imageUrl'],
      label: json['label'],
      category: json['category'],
      bankLogo: json['bankLogo'],
      attachmentUrl: json['attachmentUrl'],
      attachmentName: json['attachmentName'],
      attachmentSize: (json['attachmentSize'] as num?)?.toInt(),
      // brain
      brainMeta: (json['brainMeta'] is Map)
          ? Map<String, dynamic>.from(json['brainMeta'])
          : null,
      confidence: (json['confidence'] as num?)?.toDouble(),
      tags: (json['tags'] is List) ? List<String>.from(json['tags']) : null,
    );
  }

  factory ExpenseItem.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    Map<String, double>? parseCustomSplits(dynamic value) {
      if (value == null) return null;
      final raw = Map<String, dynamic>.from(value);
      return raw.map((k, v) => MapEntry(k, (v as num?)?.toDouble() ?? 0.0));
    }

    return ExpenseItem(
      id: doc.id,
      type: data['type'] ?? '',
      amount: (data['amount'] as num?)?.toDouble() ?? 0.0,
      note: data['note'] ?? '',
      date: (data['date'] is Timestamp)
          ? (data['date'] as Timestamp).toDate()
          : DateTime.tryParse(data['date']?.toString() ?? '') ??
          DateTime.now(),
      friendIds: (data['friendIds'] is List)
          ? List<String>.from(data['friendIds'])
          : const [],
      groupId: data['groupId'],
      settledFriendIds: (data['settledFriendIds'] is List)
          ? List<String>.from(data['settledFriendIds'])
          : const [],
      payerId: data['payerId'] ?? '',
      customSplits: parseCustomSplits(data['customSplits']),
      cardType: data['cardType'],
      cardLast4: data['cardLast4'],
      isBill: data['isBill'] ?? false,
      imageUrl: data['imageUrl'],
      label: data['label'],
      category: data['category'],
      bankLogo: data['bankLogo'],
      attachmentUrl: data['attachmentUrl'],
      attachmentName: data['attachmentName'],
      attachmentSize: (data['attachmentSize'] as num?)?.toInt(),
      // brain
      brainMeta: (data['brainMeta'] is Map)
          ? Map<String, dynamic>.from(data['brainMeta'])
          : null,
      confidence: (data['confidence'] as num?)?.toDouble(),
      tags: (data['tags'] is List) ? List<String>.from(data['tags']) : null,
    );
  }

  // --- (nice to have) quick helpers ---
  bool hasTag(String t) => tags?.contains(t) ?? false;
  bool get isFee => hasTag('fee') || (brainMeta?['feeType'] != null);
}
