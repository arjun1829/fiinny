// lib/details/models/group.dart
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Lightweight group / household / team model that pairs with SharedItem.groupId.
/// All fields are optional except `id`. Parsing is tolerant to mixed types.
@immutable
class Group {
  // --- identity ---
  final String id;
  final String? name;             // e.g. "Flat 12A", "Family", "Trip Goa"
  final String? ownerUserId;      // canonical owner/creator

  // --- visuals ---
  final String? emoji;            // quick icon (e.g., "🏠")
  final String? photoUrl;         // optional banner/avatar

  // --- membership ---
  final List<GroupMember> members;

  // --- settings / prefs ---
  /// ISO currency code; UI can default to 'INR'.
  final String? currency;

  /// Default split method for new shared items in this group: "equal" | "percent" | "fixed".
  final String? defaultSplitMethod;

  /// Default split map (userId -> percent/fixed) applied if method != equal.
  final Map<String, num>? defaultSplit;

  /// Free-form settings (e.g., notifications, reminders).
  final Map<String, dynamic>? settings;

  /// Free-form metadata bag for future safe extensions.
  final Map<String, dynamic>? meta;

  // --- invites / access ---
  final String? inviteCode;           // short code for deep-link joins
  final DateTime? inviteExpiresAt;

  // --- lifecycle ---
  final bool archived;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const Group({
    required this.id,
    this.name,
    this.ownerUserId,
    this.emoji,
    this.photoUrl,
    this.members = const <GroupMember>[],
    this.currency,
    this.defaultSplitMethod,
    this.defaultSplit,
    this.settings,
    this.meta,
    this.inviteCode,
    this.inviteExpiresAt,
    this.archived = false,
    this.createdAt,
    this.updatedAt,
  });

  Group copyWith({
    String? id,
    String? name,
    String? ownerUserId,
    String? emoji,
    String? photoUrl,
    List<GroupMember>? members,
    String? currency,
    String? defaultSplitMethod,
    Map<String, num>? defaultSplit,
    Map<String, dynamic>? settings,
    Map<String, dynamic>? meta,
    String? inviteCode,
    DateTime? inviteExpiresAt,
    bool? archived,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Group(
      id: id ?? this.id,
      name: name ?? this.name,
      ownerUserId: ownerUserId ?? this.ownerUserId,
      emoji: emoji ?? this.emoji,
      photoUrl: photoUrl ?? this.photoUrl,
      members: members ?? this.members,
      currency: currency ?? this.currency,
      defaultSplitMethod: defaultSplitMethod ?? this.defaultSplitMethod,
      defaultSplit: defaultSplit ?? this.defaultSplit,
      settings: settings ?? this.settings,
      meta: meta ?? this.meta,
      inviteCode: inviteCode ?? this.inviteCode,
      inviteExpiresAt: inviteExpiresAt ?? this.inviteExpiresAt,
      archived: archived ?? this.archived,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  // ------------ Helpers (tolerant codecs) ------------
  static DateTime? _toDate(dynamic v) {
    if (v == null) return null;
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is int) {
      final ms = v > 2000000000 ? v : v * 1000;
      return DateTime.fromMillisecondsSinceEpoch(ms);
    }
    if (v is String) {
      try { return DateTime.parse(v); } catch (_) {}
    }
    return null;
  }

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
          final p = num.tryParse(val);
          if (p != null) out['$k'] = p;
        }
      });
      return out.isEmpty ? null : out;
    }
    return null;
  }

  static List<GroupMember> _asMembers(dynamic v) {
    if (v is List) {
      return v
          .whereType<Map>()
          .map((m) => GroupMember.fromJson(m.cast<String, dynamic>()))
          .toList(growable: false);
    }
    // Also support map-of-members (userId -> obj)
    if (v is Map) {
      return v.values
          .whereType<Map>()
          .map((m) => GroupMember.fromJson(m.cast<String, dynamic>()))
          .toList(growable: false);
    }
    return const <GroupMember>[];
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'name': name,
      'ownerUserId': ownerUserId,
      if (emoji != null) 'emoji': emoji,
      if (photoUrl != null) 'photoUrl': photoUrl,
      'members': members.map((m) => m.toJson()).toList(growable: false),
      if (currency != null) 'currency': currency,
      if (defaultSplitMethod != null) 'defaultSplitMethod': defaultSplitMethod,
      if (defaultSplit != null) 'defaultSplit': defaultSplit,
      if (settings != null) 'settings': settings,
      if (meta != null) 'meta': meta,
      if (inviteCode != null) 'inviteCode': inviteCode,
      if (inviteExpiresAt != null) 'inviteExpiresAt': Timestamp.fromDate(inviteExpiresAt!),
      'archived': archived,
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
    };
  }

  factory Group.fromJson(String id, Map<String, dynamic> j) {
    return Group(
      id: id,
      name: (j['name'] as String?)?.trim(),
      ownerUserId: (j['ownerUserId'] as String?)?.trim(),
      emoji: (j['emoji'] as String?)?.trim(),
      photoUrl: (j['photoUrl'] as String?)?.trim(),
      members: _asMembers(j['members']),
      currency: (j['currency'] as String?)?.trim(),
      defaultSplitMethod: (j['defaultSplitMethod'] as String?)?.trim(),
      defaultSplit: _asNumMap(j['defaultSplit']),
      settings: _asStringMap(j['settings']),
      meta: _asStringMap(j['meta']),
      inviteCode: (j['inviteCode'] as String?)?.trim(),
      inviteExpiresAt: _toDate(j['inviteExpiresAt']),
      archived: j['archived'] == true,
      createdAt: _toDate(j['createdAt']),
      updatedAt: _toDate(j['updatedAt']),
    );
  }

  static Group? fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    try {
      final data = doc.data();
      if (data == null) return null;
      return Group.fromJson(doc.id, data);
    } catch (e) {
      debugPrint('[Group] fromDoc failed for ${doc.id}: $e');
      return null;
    }
  }

  // ------------ Derived helpers ------------
  List<String> get memberIds => members.map((m) => m.userId).toList(growable: false);

  bool isOwner(String userId) => ownerUserId != null && ownerUserId == userId;

  bool isAdmin(String userId) =>
      members.any((m) => m.userId == userId && (m.role == GroupMember.roleOwner || m.role == GroupMember.roleAdmin));

  bool canManage(String userId) => isAdmin(userId);

  GroupMember? memberFor(String userId) =>
      members.firstWhere((m) => m.userId == userId, orElse: () => const GroupMember.missing());

  /// Compute a per-user split for an amount using group defaults.
  /// Returns map<userId, amount>. If equal split, divides among ACTIVE members.
  Map<String, double> computeDefaultSplit(double amount) {
    final method = (defaultSplitMethod ?? 'equal').toLowerCase();
    final active = members.where((m) => m.status == GroupMember.statusActive).toList(growable: false);
    if (active.isEmpty || amount <= 0) return const {};

    switch (method) {
      case 'percent': {
        final m = defaultSplit ?? const {};
        return {
          for (final gm in active)
            gm.userId: amount * ((m[gm.userId]?.toDouble() ?? 0.0) / 100.0),
        };
      }
      case 'fixed': {
        final m = defaultSplit ?? const {};
        return {
          for (final gm in active)
            gm.userId: (m[gm.userId]?.toDouble() ?? 0.0),
        };
      }
      default: {
        final n = active.length;
        final each = amount / n;
        return { for (final gm in active) gm.userId: each };
      }
    }
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          other is Group &&
              runtimeType == other.runtimeType &&
              id == other.id &&
              name == other.name &&
              ownerUserId == other.ownerUserId &&
              emoji == other.emoji &&
              photoUrl == other.photoUrl &&
              listEquals(members, other.members) &&
              currency == other.currency &&
              defaultSplitMethod == other.defaultSplitMethod &&
              mapEquals(defaultSplit, other.defaultSplit) &&
              mapEquals(settings, other.settings) &&
              mapEquals(meta, other.meta) &&
              inviteCode == other.inviteCode &&
              inviteExpiresAt == other.inviteExpiresAt &&
              archived == other.archived &&
              createdAt == other.createdAt &&
              updatedAt == other.updatedAt;

  @override
  int get hashCode => Object.hashAll([
    id,
    name,
    ownerUserId,
    emoji,
    photoUrl,
    Object.hashAll(members),
    currency,
    defaultSplitMethod,
    defaultSplit == null ? 0 : Object.hashAll(defaultSplit!.entries),
    settings == null ? 0 : Object.hashAll(settings!.entries),
    meta == null ? 0 : Object.hashAll(meta!.entries),
    inviteCode,
    inviteExpiresAt,
    archived,
    createdAt,
    updatedAt,
  ]);
}

/// Member record embedded in Group.
/// Keep string roles/status for Firestore readability & easy querying.
@immutable
class GroupMember {
  // Soft-enum role values
  static const roleOwner  = 'owner';
  static const roleAdmin  = 'admin';
  static const roleMember = 'member';
  static const roleViewer = 'viewer';

  // Soft-enum status values
  static const statusActive  = 'active';
  static const statusInvited = 'invited';
  static const statusLeft    = 'left';

  final String userId;
  final String role;                 // owner|admin|member|viewer
  final String status;               // active|invited|left

  // Optional profile mirrors (handy for quick list rendering)
  final String? displayName;
  final String? phone;
  final String? avatarUrl;

  // Optional split defaults for this member (overrides group defaults when present)
  /// If group's defaultSplitMethod == 'percent', this can store the user's % share.
  final num? percentShare;

  /// If group's defaultSplitMethod == 'fixed', this can store the user's fixed amount.
  final num? fixedShare;

  final DateTime? joinedAt;
  final DateTime? leftAt;

  // Per-member notification prefs
  final Map<String, dynamic>? notify;

  const GroupMember({
    required this.userId,
    this.role = roleMember,
    this.status = statusActive,
    this.displayName,
    this.phone,
    this.avatarUrl,
    this.percentShare,
    this.fixedShare,
    this.joinedAt,
    this.leftAt,
    this.notify,
  });

  const GroupMember.missing()
      : userId = '',
        role = roleMember,
        status = statusActive,
        displayName = null,
        phone = null,
        avatarUrl = null,
        percentShare = null,
        fixedShare = null,
        joinedAt = null,
        leftAt = null,
        notify = null;

  GroupMember copyWith({
    String? userId,
    String? role,
    String? status,
    String? displayName,
    String? phone,
    String? avatarUrl,
    num? percentShare,
    num? fixedShare,
    DateTime? joinedAt,
    DateTime? leftAt,
    Map<String, dynamic>? notify,
  }) {
    return GroupMember(
      userId: userId ?? this.userId,
      role: role ?? this.role,
      status: status ?? this.status,
      displayName: displayName ?? this.displayName,
      phone: phone ?? this.phone,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      percentShare: percentShare ?? this.percentShare,
      fixedShare: fixedShare ?? this.fixedShare,
      joinedAt: joinedAt ?? this.joinedAt,
      leftAt: leftAt ?? this.leftAt,
      notify: notify ?? this.notify,
    );
  }

  static DateTime? _toDate(dynamic v) => Group._toDate(v);
  static Map<String, dynamic>? _asStringMap(dynamic v) => Group._asStringMap(v);

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'userId': userId,
      'role': role,
      'status': status,
      if (displayName != null) 'displayName': displayName,
      if (phone != null) 'phone': phone,
      if (avatarUrl != null) 'avatarUrl': avatarUrl,
      if (percentShare != null) 'percentShare': percentShare,
      if (fixedShare != null) 'fixedShare': fixedShare,
      if (joinedAt != null) 'joinedAt': Timestamp.fromDate(joinedAt!),
      if (leftAt != null) 'leftAt': Timestamp.fromDate(leftAt!),
      if (notify != null) 'notify': notify,
    };
  }

  factory GroupMember.fromJson(Map<String, dynamic> j) {
    return GroupMember(
      userId: (j['userId'] as String? ?? '').trim(),
      role: (j['role'] as String? ?? roleMember).trim(),
      status: (j['status'] as String? ?? statusActive).trim(),
      displayName: (j['displayName'] as String?)?.trim(),
      phone: (j['phone'] as String?)?.trim(),
      avatarUrl: (j['avatarUrl'] as String?)?.trim(),
      percentShare: (j['percentShare'] is num) ? j['percentShare'] as num : (j['percentShare'] is String ? num.tryParse(j['percentShare']) : null),
      fixedShare: (j['fixedShare'] is num) ? j['fixedShare'] as num : (j['fixedShare'] is String ? num.tryParse(j['fixedShare']) : null),
      joinedAt: _toDate(j['joinedAt']),
      leftAt: _toDate(j['leftAt']),
      notify: _asStringMap(j['notify']),
    );
  }

  bool get isAdminLike => role == roleOwner || role == roleAdmin;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          other is GroupMember &&
              runtimeType == other.runtimeType &&
              userId == other.userId &&
              role == other.role &&
              status == other.status &&
              displayName == other.displayName &&
              phone == other.phone &&
              avatarUrl == other.avatarUrl &&
              percentShare == other.percentShare &&
              fixedShare == other.fixedShare &&
              joinedAt == other.joinedAt &&
              leftAt == other.leftAt &&
              mapEquals(notify, other.notify);

  @override
  int get hashCode => Object.hashAll([
    userId,
    role,
    status,
    displayName,
    phone,
    avatarUrl,
    percentShare,
    fixedShare,
    joinedAt,
    leftAt,
    notify == null ? 0 : Object.hashAll(notify!.entries),
  ]);
}
