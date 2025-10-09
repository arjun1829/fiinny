// lib/models/expense_item.dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// Multiple attachments support (backward compatible with legacy single fields)
class AttachmentMeta {
  final String? url;          // public or gs:// url
  final String? name;         // original file name
  final int? size;            // bytes
  final String? mimeType;     // e.g. image/png, application/pdf
  final String? storagePath;  // Firebase Storage path for deletes

  const AttachmentMeta({
    this.url,
    this.name,
    this.size,
    this.mimeType,
    this.storagePath,
  });

  factory AttachmentMeta.fromMap(Map<String, dynamic> map) {
    return AttachmentMeta(
      url: map['url'] as String?,
      name: map['name'] as String?,
      size: (map['size'] as num?)?.toInt(),
      mimeType: map['mimeType'] as String?,
      storagePath: map['storagePath'] as String?,
    );
  }

  Map<String, dynamic> toMap() => {
    if (url != null) 'url': url,
    if (name != null) 'name': name,
    if (size != null) 'size': size,
    if (mimeType != null) 'mimeType': mimeType,
    if (storagePath != null) 'storagePath': storagePath,
  };
}

class ExpenseItem {
  // --- Core fields (existing) ---
  final String id;
  final String type;               // e.g., "SMS Debit", "Email Debit", "Credit Card Bill"
  final double amount;
  /// System/parsed note (from email/SMS extraction). Do not edit by user.
  final String note;
  final DateTime date;

  // Social/splits
  final List<String> friendIds;
  final String? groupId;
  final List<String> settledFriendIds;
  final String payerId;
  final Map<String, double>? customSplits;

  // Card basics (existing)
  final String? cardType;          // "Credit Card" | "Debit Card"
  final String? cardLast4;
  final bool isBill;               // generic bill marker (still used by UI)
  final String? imageUrl;

  // Legacy tagging
  final String? label;             // legacy single label (kept)
  final String? category;
  final String? bankLogo;

  // --- Legacy single-attachment fields (kept) ---
  final String? attachmentUrl;
  final String? attachmentName;
  final int? attachmentSize;

  // --- NEW: Counterparty / Instrument / Banking context ---
  /// Display-ready "Paid to": merchant name OR UPI VPA OR friend/self fallback.
  final String? counterparty;
  /// MERCHANT | FRIEND | SELF | UPI_P2P | UNKNOWN
  final String? counterpartyType;
  /// UPI Virtual Payment Address (e.g., name@okaxis)
  final String? upiVpa;
  /// UPI | Credit Card | Debit Card | IMPS | NEFT | RTGS | ATM | POS | NetBanking | Wallet | Cash
  final String? instrument;
  /// VISA | MASTERCARD | RUPAY | AMEX (for card rails)
  final String? instrumentNetwork;
  /// Issuer bank code/name (HDFC/ICICI/AXIS/…); best-effort guess
  final String? issuerBank;

  // --- NEW: International/FX & fees ---
  /// true if foreign currency present or SMS/email says "international"
  final bool? isInternational;
  /// Example: {"currency":"USD","amount":23.60,"rate":82.3}
  final Map<String, dynamic>? fx;
  /// Fee map: {"convenience": 10.0, "gst": 1.8, "markup": 5.0, "late_fee": 500.0}
  final Map<String, double>? fees;

  // --- NEW: Credit card bill metadata (for type == "Credit Card Bill" or isBill==true) ---
  final double? billTotalDue;
  final double? billMinDue;
  final DateTime? billDueDate;
  final DateTime? statementStart;
  final DateTime? statementEnd;

  // --- NEW UX fields (non-breaking) ---
  final String? title;       // human label (e.g., "Zomato lunch")
  final String? comments;    // user free text
  final List<String> labels; // user-defined tags
  final List<AttachmentMeta> attachments;

  // --- Fiinnny Brain (existing optional) ---
  final Map<String, dynamic>? brainMeta; // feeType, recurringKey, etc.
  final double? confidence;
  final List<String>? tags;              // ["fee","subscription","loan_emi","autopay","forex",...]

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
    // NEW context
    this.counterparty,
    this.counterpartyType,
    this.upiVpa,
    this.instrument,
    this.instrumentNetwork,
    this.issuerBank,
    this.isInternational,
    this.fx,
    this.fees,
    // Bill meta
    this.billTotalDue,
    this.billMinDue,
    this.billDueDate,
    this.statementStart,
    this.statementEnd,
    // NEW UX
    this.title,
    this.comments,
    this.labels = const [],
    this.attachments = const [],
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
    // NEW context
    String? counterparty,
    String? counterpartyType,
    String? upiVpa,
    String? instrument,
    String? instrumentNetwork,
    String? issuerBank,
    bool? isInternational,
    Map<String, dynamic>? fx,
    Map<String, double>? fees,
    // Bill meta
    double? billTotalDue,
    double? billMinDue,
    DateTime? billDueDate,
    DateTime? statementStart,
    DateTime? statementEnd,
    // NEW UX
    String? title,
    String? comments,
    List<String>? labels,
    List<AttachmentMeta>? attachments,
    // brain
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
      // NEW context
      counterparty: counterparty ?? this.counterparty,
      counterpartyType: counterpartyType ?? this.counterpartyType,
      upiVpa: upiVpa ?? this.upiVpa,
      instrument: instrument ?? this.instrument,
      instrumentNetwork: instrumentNetwork ?? this.instrumentNetwork,
      issuerBank: issuerBank ?? this.issuerBank,
      isInternational: isInternational ?? this.isInternational,
      fx: fx ?? this.fx,
      fees: fees ?? this.fees,
      // Bill meta
      billTotalDue: billTotalDue ?? this.billTotalDue,
      billMinDue: billMinDue ?? this.billMinDue,
      billDueDate: billDueDate ?? this.billDueDate,
      statementStart: statementStart ?? this.statementStart,
      statementEnd: statementEnd ?? this.statementEnd,
      // NEW UX
      title: title ?? this.title,
      comments: comments ?? this.comments,
      labels: labels ?? List<String>.from(this.labels),
      attachments: attachments ?? List<AttachmentMeta>.from(this.attachments),
      // brain
      brainMeta: brainMeta ?? this.brainMeta,
      confidence: confidence ?? this.confidence,
      tags: tags ?? this.tags,
    );
  }

  /// Convenience: all labels including legacy single `label`
  List<String> get allLabels {
    final out = <String>[...labels];
    if (label != null && label!.trim().isNotEmpty) out.add(label!.trim());
    final seen = <String>{};
    return out.where((e) => seen.add(e)).toList();
  }

  // Convenience getters
  bool hasTag(String t) => tags?.contains(t) ?? false;
  bool get isFee => hasTag('fee') || (brainMeta?['feeType'] != null) || ((fees ?? const {}).isNotEmpty);
  bool get hasAttachments => attachments.isNotEmpty || attachmentUrl != null;
  AttachmentMeta? get primaryAttachment =>
      attachments.isNotEmpty
          ? attachments.first
          : (attachmentUrl != null
          ? AttachmentMeta(
          url: attachmentUrl, name: attachmentName, size: attachmentSize)
          : null);
  bool get isCreditCard => (cardType ?? '').toLowerCase().contains('credit');
  bool get isDebitCard => (cardType ?? '').toLowerCase().contains('debit');

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{
      'id': id,
      'type': type,
      'amount': amount,
      'note': note, // parsed/system note
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
      if (label != null) 'label': label, // legacy
      if (category != null) 'category': category,
      'bankLogo': bankLogo,
      // NEW context
      if (counterparty != null && counterparty!.trim().isNotEmpty) 'counterparty': counterparty,
      if (counterpartyType != null) 'counterpartyType': counterpartyType,
      if (upiVpa != null && upiVpa!.trim().isNotEmpty) 'upiVpa': upiVpa,
      if (instrument != null) 'instrument': instrument,
      if (instrumentNetwork != null) 'instrumentNetwork': instrumentNetwork,
      if (issuerBank != null) 'issuerBank': issuerBank,
      if (isInternational != null) 'isInternational': isInternational,
      if (fx != null && fx!.isNotEmpty) 'fx': fx,
      if (fees != null && fees!.isNotEmpty) 'fees': fees,
      // Bill meta
      if (billTotalDue != null) 'billTotalDue': billTotalDue,
      if (billMinDue != null) 'billMinDue': billMinDue,
      if (billDueDate != null) 'billDueDate': Timestamp.fromDate(billDueDate!),
      if (statementStart != null) 'statementStart': Timestamp.fromDate(statementStart!),
      if (statementEnd != null) 'statementEnd': Timestamp.fromDate(statementEnd!),
      // NEW UX
      if (title != null && title!.trim().isNotEmpty) 'title': title,
      if (comments != null && comments!.trim().isNotEmpty) 'comments': comments,
      if (labels.isNotEmpty) 'labels': labels,
      if (attachments.isNotEmpty)
        'attachments': attachments.map((a) => a.toMap()).toList(),
      // Keep legacy single attachment fields for compatibility
      if (attachmentUrl != null) 'attachmentUrl': attachmentUrl,
      if (attachmentName != null) 'attachmentName': attachmentName,
      if (attachmentSize != null) 'attachmentSize': attachmentSize,
      // Brain
      if (brainMeta != null) 'brainMeta': brainMeta,
      if (confidence != null) 'confidence': confidence,
      if (tags != null) 'tags': tags,
    };

    // Mirror first attachment into legacy fields if legacy fields absent
    if (attachments.isNotEmpty) {
      map.putIfAbsent('attachmentUrl', () => attachments.first.url);
      map.putIfAbsent('attachmentName', () => attachments.first.name);
      map.putIfAbsent('attachmentSize', () => attachments.first.size);
    }
    return map;
  }

  factory ExpenseItem.fromJson(Map<String, dynamic> json) {
    Map<String, double>? parseCustomSplits(dynamic value) {
      if (value == null) return null;
      final raw = Map<String, dynamic>.from(value);
      return raw.map((k, v) => MapEntry(k, (v as num?)?.toDouble() ?? 0.0));
    }

    List<AttachmentMeta> parseAttachments(Map<String, dynamic> j) {
      final raw = j['attachments'];
      if (raw is List) {
        return raw
            .whereType<Map>()
            .map((m) => AttachmentMeta.fromMap(Map<String, dynamic>.from(m)))
            .toList();
      }
      final url = j['attachmentUrl'] as String?;
      final name = j['attachmentName'] as String?;
      final size = (j['attachmentSize'] as num?)?.toInt();
      if (url != null || name != null || size != null) {
        return [AttachmentMeta(url: url, name: name, size: size)];
      }
      return const <AttachmentMeta>[];
    }

    Map<String, double>? parseFees(dynamic v) {
      if (v is Map) {
        final m = Map<String, dynamic>.from(v);
        return m.map((k, val) => MapEntry(k, (val as num?)?.toDouble() ?? 0.0));
      }
      return null;
    }

    DateTime? _asDate(dynamic v) {
      if (v is Timestamp) return v.toDate();
      if (v is DateTime) return v;
      if (v is String) return DateTime.tryParse(v);
      if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
      return null;
    }

    return ExpenseItem(
      id: json['id'] ?? '',
      type: json['type'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      note: json['note'] ?? '',
      date: (json['date'] is Timestamp)
          ? (json['date'] as Timestamp).toDate()
          : DateTime.tryParse(json['date']?.toString() ?? '') ?? DateTime.now(),
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
      // NEW context
      counterparty: json['counterparty'],
      counterpartyType: json['counterpartyType'],
      upiVpa: json['upiVpa'],
      instrument: json['instrument'],
      instrumentNetwork: json['instrumentNetwork'],
      issuerBank: json['issuerBank'],
      isInternational: json['isInternational'] as bool?,
      fx: (json['fx'] is Map) ? Map<String, dynamic>.from(json['fx']) : null,
      fees: parseFees(json['fees']),
      // Bill meta
      billTotalDue: (json['billTotalDue'] as num?)?.toDouble(),
      billMinDue: (json['billMinDue'] as num?)?.toDouble(),
      billDueDate: _asDate(json['billDueDate']),
      statementStart: _asDate(json['statementStart']),
      statementEnd: _asDate(json['statementEnd']),
      // NEW UX
      title: json['title'],
      comments: json['comments'],
      labels: (json['labels'] is List)
          ? List<String>.from(json['labels'])
          : const [],
      attachments: parseAttachments(json),
      // Brain
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

    List<AttachmentMeta> parseAttachments(Map<String, dynamic> j) {
      final raw = j['attachments'];
      if (raw is List) {
        return raw
            .whereType<Map>()
            .map((m) => AttachmentMeta.fromMap(Map<String, dynamic>.from(m)))
            .toList();
      }
      final url = j['attachmentUrl'] as String?;
      final name = j['attachmentName'] as String?;
      final size = (j['attachmentSize'] as num?)?.toInt();
      if (url != null || name != null || size != null) {
        return [AttachmentMeta(url: url, name: name, size: size)];
      }
      return const <AttachmentMeta>[];
    }

    Map<String, double>? parseFees(dynamic v) {
      if (v is Map) {
        final m = Map<String, dynamic>.from(v);
        return m.map((k, val) => MapEntry(k, (val as num?)?.toDouble() ?? 0.0));
      }
      return null;
    }

    DateTime? _asDate(dynamic v) {
      if (v is Timestamp) return v.toDate();
      if (v is DateTime) return v;
      if (v is String) return DateTime.tryParse(v);
      if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
      return null;
    }

    return ExpenseItem(
      id: doc.id,
      type: data['type'] ?? '',
      amount: (data['amount'] as num?)?.toDouble() ?? 0.0,
      note: data['note'] ?? '',
      date: (data['date'] is Timestamp)
          ? (data['date'] as Timestamp).toDate()
          : DateTime.tryParse(data['date']?.toString() ?? '') ?? DateTime.now(),
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
      // NEW context
      counterparty: data['counterparty'],
      counterpartyType: data['counterpartyType'],
      upiVpa: data['upiVpa'],
      instrument: data['instrument'],
      instrumentNetwork: data['instrumentNetwork'],
      issuerBank: data['issuerBank'],
      isInternational: data['isInternational'] as bool?,
      fx: (data['fx'] is Map) ? Map<String, dynamic>.from(data['fx']) : null,
      fees: parseFees(data['fees']),
      // Bill meta
      billTotalDue: (data['billTotalDue'] as num?)?.toDouble(),
      billMinDue: (data['billMinDue'] as num?)?.toDouble(),
      billDueDate: _asDate(data['billDueDate']),
      statementStart: _asDate(data['statementStart']),
      statementEnd: _asDate(data['statementEnd']),
      // NEW UX
      title: data['title'],
      comments: data['comments'],
      labels: (data['labels'] is List)
          ? List<String>.from(data['labels'])
          : const [],
      attachments: parseAttachments(data),
      // Brain
      brainMeta: (data['brainMeta'] is Map)
          ? Map<String, dynamic>.from(data['brainMeta'])
          : null,
      confidence: (data['confidence'] as num?)?.toDouble(),
      tags: (data['tags'] is List) ? List<String>.from(data['tags']) : null,
    );
  }
}
