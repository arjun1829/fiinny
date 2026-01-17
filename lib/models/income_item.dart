// lib/models/income_item.dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// Multiple attachments support (kept local to this file for easy drop-in).
class AttachmentMeta {
  final String? url; // public or gs:// url
  final String? name; // original file name
  final int? size; // bytes
  final String? mimeType; // e.g. image/png, application/pdf
  final String? storagePath; // Firebase Storage path for deletes

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

class IncomeItem {
  // --- Core fields (existing) ---
  final String id;
  final String type; // "Email Credit" | "SMS Credit" | "Salary" etc.
  final double amount;

  /// System/parsed note (from email/SMS extraction). Do not edit by user.
  final String note;
  final DateTime date;
  final String source; // "Email" | "SMS" | "Manual"

  // Existing UI/meta
  final String? imageUrl;
  final String? label; // legacy single label (kept)
  final String? bankLogo;
  final String? category; // "Income", "Salary", "Refund", etc.
  final String? subcategory; // Added to match Firestore

  // --- NEW: Counterparty / Instrument / Banking context (mirrors expense) ---
  /// Display-ready "Received from" (employer/merchant/UPI VPA/person)
  final String? counterparty;

  /// EMPLOYER | MERCHANT | FRIEND | SELF | UPI_P2P | REFUND | UNKNOWN
  final String? counterpartyType;
  final String? upiVpa;

  /// UPI | IMPS | NEFT | RTGS | NetBanking | Wallet | Cash | CardRefund
  final String? instrument;
  final String? instrumentNetwork; // VISA/MASTERCARD/RUPAY/AMEX (for refunds)
  final String? issuerBank;
  final bool? isInternational;
  final Map<String, dynamic>? fx; // {"currency":"USD","amount":100.0,...}
  final Map<String, double>?
      fees; // uncommon for credits, but keep for reversals

  // --- NEW UX fields (non-breaking) ---
  final String? title;
  final String? comments;
  final List<String> labels;
  final List<AttachmentMeta> attachments;

  // --- NEW: Source Record (for raw data access & feedback) ---
  final Map<String, dynamic>? sourceRecord;

  // --- Legacy single-attachment fields (optional parity; harmless if unused) ---
  final String? attachmentUrl;
  final String? attachmentName;
  final int? attachmentSize;

  // 🧠 Fiinnny Brain (optional)
  final Map<String, dynamic>? brainMeta; // employer, recurringKey, etc.
  final double? confidence; // 0..1
  final List<String>? tags; // ["fixed_income","refund","cashback",...]

  // Audit
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? createdBy;
  final String? updatedBy;

  IncomeItem({
    required this.id,
    required this.type,
    required this.amount,
    required this.note,
    required this.date,
    required this.source,
    this.imageUrl,
    this.label,
    this.bankLogo,
    this.category,
    this.subcategory,
    // NEW context
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
    // NEW UX
    this.title,
    this.comments,
    this.labels = const [],
    this.attachments = const [],
    this.sourceRecord,
    // legacy single-attachment
    this.attachmentUrl,
    this.attachmentName,
    this.attachmentSize,
    // Brain
    this.brainMeta,
    this.confidence,
    this.tags,
    // Audit
    this.createdAt,
    this.updatedAt,
    this.createdBy,
    this.updatedBy,
  });

  IncomeItem copyWith({
    String? id,
    String? type,
    double? amount,
    String? note,
    DateTime? date,
    String? source,
    String? imageUrl,
    String? label,
    String? bankLogo,
    String? category,
    String? subcategory,
    // NEW context
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
    // NEW UX
    String? title,
    String? comments,
    List<String>? labels,
    List<AttachmentMeta>? attachments,
    Map<String, dynamic>? sourceRecord,
    // legacy single-attachment
    String? attachmentUrl,
    String? attachmentName,
    int? attachmentSize,
    // Brain
    Map<String, dynamic>? brainMeta,
    double? confidence,
    List<String>? tags,
    // Audit
    DateTime? createdAt,
    DateTime? updatedAt,
    String? createdBy,
    String? updatedBy,
  }) {
    return IncomeItem(
      id: id ?? this.id,
      type: type ?? this.type,
      amount: amount ?? this.amount,
      note: note ?? this.note,
      date: date ?? this.date,
      source: source ?? this.source,
      imageUrl: imageUrl ?? this.imageUrl,
      label: label ?? this.label,
      bankLogo: bankLogo ?? this.bankLogo,
      category: category ?? this.category,
      subcategory: subcategory ?? this.subcategory,
      // NEW context
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
      // NEW UX
      title: title ?? this.title,
      comments: comments ?? this.comments,
      labels: labels ?? List<String>.from(this.labels),
      attachments: attachments ?? List<AttachmentMeta>.from(this.attachments),
      sourceRecord: sourceRecord ?? this.sourceRecord,
      // legacy single-attachment
      attachmentUrl: attachmentUrl ?? this.attachmentUrl,
      attachmentName: attachmentName ?? this.attachmentName,
      attachmentSize: attachmentSize ?? this.attachmentSize,
      // Brain
      brainMeta: brainMeta ?? this.brainMeta,
      confidence: confidence ?? this.confidence,
      tags: tags ?? this.tags,
      // Audit
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      createdBy: createdBy ?? this.createdBy,
      updatedBy: updatedBy ?? this.updatedBy,
    );
  }

  /// Convenience: all labels including legacy single `label`
  List<String> get allLabels {
    final out = <String>[...labels];
    if (label != null && label!.trim().isNotEmpty) out.add(label!.trim());
    final seen = <String>{};
    return out.where((e) => seen.add(e)).toList();
  }

  bool get hasAttachments => attachments.isNotEmpty || attachmentUrl != null;
  AttachmentMeta? get primaryAttachment => attachments.isNotEmpty
      ? attachments.first
      : (attachmentUrl != null
          ? AttachmentMeta(
              url: attachmentUrl, name: attachmentName, size: attachmentSize)
          : null);

  bool get isUserEdited =>
      (updatedBy?.contains('user') ?? false) ||
      (createdBy?.contains('user') ?? false);

  String? get rawMerchantString {
    if (sourceRecord == null) return null;
    return sourceRecord!['merchant'] as String? ??
        sourceRecord!['rawMerchantGuess'] as String?;
  }

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{
      'id': id,
      'type': type,
      'amount': amount,
      'note': note, // parsed/system note
      'date': Timestamp.fromDate(date),
      'source': source,
      if (imageUrl != null) 'imageUrl': imageUrl,
      if (label != null) 'label': label, // legacy
      'bankLogo': bankLogo,
      if (category != null) 'category': category,
      if (subcategory != null) 'subcategory': subcategory,
      // NEW context
      // NEW context
      if (counterparty != null && counterparty!.trim().isNotEmpty)
        'counterparty': counterparty,
      if (counterpartyType != null) 'counterpartyType': counterpartyType,
      if (upiVpa != null && upiVpa!.trim().isNotEmpty) 'upiVpa': upiVpa,
      if (instrument != null) 'instrument': instrument,
      if (instrumentNetwork != null) 'instrumentNetwork': instrumentNetwork,
      if (issuerBank != null) 'issuerBank': issuerBank,
      if (isInternational != null) 'isInternational': isInternational,
      if (fx != null && fx!.isNotEmpty) 'fx': fx,
      if (fees != null && fees!.isNotEmpty) 'fees': fees,
      // NEW UX
      if (title != null && title!.trim().isNotEmpty) 'title': title,
      if (comments != null && comments!.trim().isNotEmpty) 'comments': comments,
      if (labels.isNotEmpty) 'labels': labels,
      if (attachments.isNotEmpty)
        'attachments': attachments.map((a) => a.toMap()).toList(),
      if (sourceRecord != null) 'sourceRecord': sourceRecord,
      // Legacy single-attachment mirror
      if (attachmentUrl != null) 'attachmentUrl': attachmentUrl,
      if (attachmentName != null) 'attachmentName': attachmentName,
      if (attachmentSize != null) 'attachmentSize': attachmentSize,
      // Brain
      if (brainMeta != null) 'brainMeta': brainMeta,
      if (confidence != null) 'confidence': confidence,
      if (tags != null) 'tags': tags,
      // Audit
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
      if (createdBy != null) 'createdBy': createdBy,
      if (updatedBy != null) 'updatedBy': updatedBy,
    };

    // Mirror first attachment into legacy fields if legacy fields absent
    if (attachments.isNotEmpty) {
      map.putIfAbsent('attachmentUrl', () => attachments.first.url);
      map.putIfAbsent('attachmentName', () => attachments.first.name);
      map.putIfAbsent('attachmentSize', () => attachments.first.size);
    }
    return map;
  }

  factory IncomeItem.fromJson(Map<String, dynamic> json) {
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

    return IncomeItem(
      id: json['id'] ?? '',
      type: json['type'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      note: json['note'] ?? '',
      date: (json['date'] is Timestamp)
          ? (json['date'] as Timestamp).toDate()
          : DateTime.tryParse(json['date']?.toString() ?? '') ?? DateTime.now(),
      source: json['source'] ?? '',
      imageUrl: json['imageUrl'],
      label: json['label'], // legacy single
      bankLogo: json['bankLogo'],
      category: json['category'],
      subcategory: json['subcategory'],
      // NEW context
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
      // NEW UX
      title: json['title'],
      comments: json['comments'],
      labels: (json['labels'] is List)
          ? List<String>.from(json['labels'])
          : const [],
      attachments: parseAttachments(json),
      sourceRecord: json['sourceRecord'],
      // Legacy single-attachment (kept)
      attachmentUrl: json['attachmentUrl'],
      attachmentName: json['attachmentName'],
      attachmentSize: (json['attachmentSize'] as num?)?.toInt(),
      // Brain
      brainMeta: (json['brainMeta'] as Map?)?.cast<String, dynamic>(),
      confidence: (json['confidence'] as num?)?.toDouble(),
      tags: (json['tags'] is List) ? List<String>.from(json['tags']) : null,
    );
  }

  factory IncomeItem.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

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

    DateTime? parseTimestamp(dynamic v) {
      if (v is Timestamp) return v.toDate();
      if (v is DateTime) return v;
      if (v is String) return DateTime.tryParse(v);
      if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
      return null;
    }

    return IncomeItem(
      id: doc.id,
      type: data['type'] ?? '',
      amount: (data['amount'] as num?)?.toDouble() ?? 0.0,
      note: data['note'] ?? '',
      date: (data['date'] is Timestamp)
          ? (data['date'] as Timestamp).toDate()
          : DateTime.tryParse(data['date']?.toString() ?? '') ?? DateTime.now(),
      source: data['source'] ?? '',
      imageUrl: data['imageUrl'],
      label: data['label'], // legacy
      bankLogo: data['bankLogo'],
      category: data['category'],
      subcategory: data['subcategory'],
      // NEW context
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
      // NEW UX
      title: data['title'],
      comments: data['comments'],
      labels: (data['labels'] is List)
          ? List<String>.from(data['labels'])
          : const [],
      attachments: parseAttachments(data),
      sourceRecord: data['sourceRecord'],
      // Legacy single-attachment (kept)
      attachmentUrl: data['attachmentUrl'],
      attachmentName: data['attachmentName'],
      attachmentSize: (data['attachmentSize'] as num?)?.toInt(),
      // Brain
      brainMeta: (data['brainMeta'] as Map?)?.cast<String, dynamic>(),
      confidence: (data['confidence'] as num?)?.toDouble(),
      tags: (data['tags'] is List) ? List<String>.from(data['tags']) : null,
      // Audit
      createdAt: parseTimestamp(data['createdAt']),
      updatedAt: parseTimestamp(data['updatedAt']),
      createdBy: data['createdBy'],
      updatedBy: data['updatedBy'],
    );
  }
}
