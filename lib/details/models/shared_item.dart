// lib/details/models/shared_item.dart
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/recurring_rule.dart';

/// Unified recurring item used by Subs/Bills UI.
/// Backward-compatible: new fields are optional and only written when present.
@immutable
class SharedItem {
  // ----- identity & core type -----
  final String id;                 // Firestore doc id (not stored inside the doc)
  final String? type;              // "subscription" | "emi" | "recurring" | "reminder" | ...
  final String? kind;              // optional subtype badge like 'emi'
  final RecurringRule rule;

  // ----- timing -----
  final DateTime? lastPostedAt;    // nullable (last ledger post)
  final DateTime? nextDueAt;       // nullable (computed or cached)
  final int failures;

  // ----- display -----
  final String? title;             // e.g., "Netflix Premium"
  final String? provider;          // e.g., "Netflix", "HDFC"
  final String? note;

  // ----- optional extras -----
  final double? amount;            // convenience if present at top-level
  final Map<String, dynamic>? link;
  final Map<String, dynamic>? meta;

  // ----- sharing / participants (NEW) -----
  /// Mirror of participants.userIds if present (used for chips & split)
  final List<String>? participantUserIds;

  /// Canonical owner of this item (userId/phone). Useful when mirrored to others.
  final String? ownerUserId;

  /// If shared to a group, group id; otherwise null.
  final String? groupId;

  /// "private" | "shared" | "group" (soft enum; tolerant to missing/unknown).
  final String? sharing;

  /// Split algorithm: "equal" | "percent" | "fixed".
  final String? splitMethod;

  /// Split details:
  ///  - percent: userId -> 0..100
  ///  - fixed:   userId -> absolute amount
  final Map<String, num>? split;

  /// Optional cached notify prefs block (if your service writes/reads it).
  final Map<String, dynamic>? notify;

  /// Optional deeplink (top-level or inside meta['deeplink']).
  final String? deeplink;

  const SharedItem({
    required this.id,
    required this.rule,
    this.type,
    this.kind,
    this.lastPostedAt,
    this.nextDueAt,
    this.failures = 0,
    this.title,
    this.provider,
    this.note,
    this.amount,
    this.link,
    this.meta,
    // sharing
    this.participantUserIds,
    this.ownerUserId,
    this.groupId,
    this.sharing,
    this.splitMethod,
    this.split,
    // misc
    this.notify,
    this.deeplink,
  });

  SharedItem copyWith({
    String? id,
    String? type,
    String? kind,
    RecurringRule? rule,
    DateTime? lastPostedAt,
    DateTime? nextDueAt,
    int? failures,
    String? title,
    String? provider,
    String? note,
    double? amount,
    Map<String, dynamic>? link,
    Map<String, dynamic>? meta,
    List<String>? participantUserIds,
    String? ownerUserId,
    String? groupId,
    String? sharing,
    String? splitMethod,
    Map<String, num>? split,
    Map<String, dynamic>? notify,
    String? deeplink,
  }) {
    return SharedItem(
      id: id ?? this.id,
      type: type ?? this.type,
      kind: kind ?? this.kind,
      rule: rule ?? this.rule,
      lastPostedAt: lastPostedAt ?? this.lastPostedAt,
      nextDueAt: nextDueAt ?? this.nextDueAt,
      failures: failures ?? this.failures,
      title: title ?? this.title,
      provider: provider ?? this.provider,
      note: note ?? this.note,
      amount: amount ?? this.amount,
      link: link ?? this.link,
      meta: meta ?? this.meta,
      participantUserIds: participantUserIds ?? this.participantUserIds,
      ownerUserId: ownerUserId ?? this.ownerUserId,
      groupId: groupId ?? this.groupId,
      sharing: sharing ?? this.sharing,
      splitMethod: splitMethod ?? this.splitMethod,
      split: split ?? this.split,
      notify: notify ?? this.notify,
      deeplink: deeplink ?? this.deeplink,
    );
  }

  // ------- Helpers (tolerant decoders) -------
  static DateTime? _toDate(dynamic v) {
    if (v == null) return null;
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is int) {
      // Heuristic: treat small ints as seconds, large as millis
      final ms = v > 2000000000 ? v : v * 1000;
      return DateTime.fromMillisecondsSinceEpoch(ms);
    }
    if (v is String) {
      try { return DateTime.parse(v); } catch (_) {}
    }
    return null;
  }

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  static Timestamp? _toTs(DateTime? d) => d == null ? null : Timestamp.fromDate(d);

  static Map<String, dynamic>? _asStringMap(dynamic v) {
    if (v is Map) return v.cast<String, dynamic>();
    return null;
  }

  static Map<String, num>? _asNumMap(dynamic v) {
    if (v is Map) {
      final out = <String, num>{};
      v.forEach((k, val) {
        if (val is num) out['$k'] = val;
        if (val is String) {
          final parsed = num.tryParse(val);
          if (parsed != null) out['$k'] = parsed;
        }
      });
      return out.isEmpty ? null : out;
    }
    return null;
  }

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{
      // Do NOT write 'id' (doc id is in Firestore path)
      if (type != null) 'type': type,
      if (kind != null) 'kind': kind,
      'rule': rule.toJson(), // RecurringRule writes Timestamp for dates
      if (lastPostedAt != null) 'lastPostedAt': _toTs(lastPostedAt),
      if (nextDueAt != null) 'nextDueAt': _toTs(nextDueAt),
      'failures': failures,
      if (title != null) 'title': title,
      if (provider != null) 'provider': provider,
      if (note != null) 'note': note,
      if (amount != null) 'amount': amount,
      if (link != null) 'link': link,
      if (meta != null) 'meta': meta,
      if (notify != null) 'notify': notify,
      if (deeplink != null) 'deeplink': deeplink,

      // sharing / group
      if (ownerUserId != null) 'ownerUserId': ownerUserId,
      if (groupId != null) 'groupId': groupId,
      if (sharing != null) 'sharing': sharing,
      if (splitMethod != null) 'splitMethod': splitMethod,
      if (split != null) 'split': split,
    };

    // Write participants.userIds mirror if provided
    if (participantUserIds != null) {
      map['participants'] = {
        'userIds': participantUserIds,
        // room for other fields later
      };
    }

    return map;
  }

  factory SharedItem.fromJson(String id, Map<String, dynamic> j) {
    // tolerant to missing / wrong types
    final Map<String, dynamic> ruleMap =
        (j['rule'] as Map?)?.cast<String, dynamic>() ?? const {};

    final participantsMap = _asStringMap(j['participants']);
    final List<String>? userIds =
    (participantsMap?['userIds'] as List?)?.whereType<String>().toList();

    // deeplink may be top-level or inside meta
    final metaMap = _asStringMap(j['meta']);
    final String? deeplink =
        (j['deeplink'] as String?) ?? (metaMap?['deeplink'] as String?);

    return SharedItem(
      id: id,
      type: (j['type'] as String?)?.trim(),
      kind: (j['kind'] as String?)?.trim(),
      rule: RecurringRule.fromJson(ruleMap),
      lastPostedAt: _toDate(j['lastPostedAt']),
      nextDueAt: _toDate(j['nextDueAt']),
      failures: (j['failures'] is num) ? (j['failures'] as num).toInt() : 0,
      title: (j['title'] as String?)?.trim(),
      provider: (j['provider'] as String?)?.trim(),
      note: (j['note'] as String?)?.trim(),
      amount: _toDouble(j['amount']),
      link: _asStringMap(j['link']),
      meta: metaMap,
      participantUserIds: userIds,

      // sharing / group
      ownerUserId: (j['ownerUserId'] as String?)?.trim(),
      groupId: (j['groupId'] as String?)?.trim(),
      sharing: (j['sharing'] as String?)?.trim(),
      splitMethod: (j['splitMethod'] as String?)?.trim(),
      split: _asNumMap(j['split']),

      // misc
      notify: _asStringMap(j['notify']),
      deeplink: deeplink,
    );
  }

  // Convenience when mapping Firestore docs
  static SharedItem? fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    try {
      final data = doc.data();
      if (data == null) return null;
      return SharedItem.fromJson(doc.id, data);
    } catch (e) {
      debugPrint('[SharedItem] fromDoc failed for ${doc.id}: $e');
      return null;
    }
  }

  // ----- Niceties for UI / business logic -----
  bool get isReminder => (type ?? '').toLowerCase() == 'reminder';
  bool get isPaused => rule.status == 'paused';
  bool get isEnded => rule.status == 'ended';
  bool get isActive => !isEnded;

  bool get isShared => (sharing ?? '').toLowerCase() == 'shared';
  bool get isGroupShared => (sharing ?? '').toLowerCase() == 'group';
  bool get isPrivate => (sharing ?? '').isEmpty || (sharing ?? '').toLowerCase() == 'private';

  String get safeTitle => (title == null || title!.trim().isEmpty)
      ? (type?.isNotEmpty == true ? type!.substring(0, 1).toUpperCase() + type!.substring(1) : 'Item')
      : title!.trim();

  /// Compute a user's share of `rule.amount` based on split info.
  /// - equal: divides among participants (including owner if present)
  /// - percent: amount * (pct/100)
  /// - fixed: exact amount from split map
  /// Returns null if not computable.
  double? amountShareForUser(String userId) {
    final base = (rule.amount ?? amount)?.toDouble();
    if (base == null || base <= 0) return null;

    final method = (splitMethod ?? 'equal').toLowerCase();
    final people = (participantUserIds ?? const <String>[]);
    if (method == 'equal') {
      final n = people.isEmpty ? 1 : people.length;
      return n <= 0 ? null : base / n;
    }

    final m = split ?? const {};
    switch (method) {
      case 'percent':
        final pct = (m[userId] ?? 0).toDouble();
        return (pct <= 0) ? 0 : (base * (pct / 100.0));
      case 'fixed':
        final v = (m[userId] ?? 0).toDouble();
        return v <= 0 ? 0 : v;
      default:
      // fall back to equal
        final n = people.isEmpty ? 1 : people.length;
        return n <= 0 ? null : base / n;
    }
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          other is SharedItem &&
              runtimeType == other.runtimeType &&
              id == other.id &&
              type == other.type &&
              kind == other.kind &&
              rule == other.rule &&
              lastPostedAt == other.lastPostedAt &&
              nextDueAt == other.nextDueAt &&
              failures == other.failures &&
              title == other.title &&
              provider == other.provider &&
              note == other.note &&
              amount == other.amount &&
              mapEquals(link, other.link) &&
              mapEquals(meta, other.meta) &&
              listEquals(participantUserIds, other.participantUserIds) &&
              ownerUserId == other.ownerUserId &&
              groupId == other.groupId &&
              sharing == other.sharing &&
              splitMethod == other.splitMethod &&
              mapEquals(split, other.split) &&
              mapEquals(notify, other.notify) &&
              deeplink == other.deeplink;

  @override
  int get hashCode => Object.hashAll([
    id,
    type,
    kind,
    rule,
    lastPostedAt,
    nextDueAt,
    failures,
    title,
    provider,
    note,
    amount,
    link == null ? 0 : Object.hashAll(link!.entries),
    meta == null ? 0 : Object.hashAll(meta!.entries),
    participantUserIds == null ? 0 : Object.hashAll(participantUserIds!),
    ownerUserId,
    groupId,
    sharing,
    splitMethod,
    split == null ? 0 : Object.hashAll(split!.entries),
    notify == null ? 0 : Object.hashAll(notify!.entries),
    deeplink,
  ]);
}
