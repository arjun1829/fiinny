// lib/models/subscription_item.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:lifemap/details/models/recurring_rule.dart';
import 'package:lifemap/details/models/shared_item.dart';

/// Lightweight model representing a personal subscription/bill stored under
/// `/users/{userPhone}/subscriptions/{subscriptionId}`.
///
/// The shape intentionally mirrors [SharedItem] so that the existing
/// Subscriptions & Bills experience can treat the newly added documents the
/// same way as items coming from the "recurring" tree.
class SubscriptionItem {
  final String? id;
  final String title;
  final double amount;
  final String type; // subscription | bill | trial
  final String frequency; // monthly | yearly | weekly | custom | daily | once
  final String currency;
  final int? intervalDays;
  final DateTime anchorDate;
  final DateTime? nextDueAt;
  final bool paused;
  final bool autopay;
  final String? provider;
  final String? plan;
  final String? note;
  final String? category; // 'streaming', 'utility', 'rent', etc.
  final int? reminderDaysBefore;
  final String? reminderTime; // HH:mm
  final List<ParticipantShare> participants;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  
  // New fields for "Ultimate" features
  final double? averageAmount; // For variable bills
  final DateTime? trialEndDate; // For trials
  final String status; // active | paused | canceled | expired

  const SubscriptionItem({
    this.id,
    required this.title,
    required this.amount,
    required this.type,
    required this.frequency,
    this.currency = 'INR',
    this.intervalDays,
    required this.anchorDate,
    this.nextDueAt,
    this.paused = false,
    this.autopay = false,
    this.provider,
    this.plan,
    this.note,
    this.category,
    this.reminderDaysBefore,
    this.reminderTime,
    this.participants = const <ParticipantShare>[],
    this.createdAt,
    this.updatedAt,
    this.averageAmount,
    this.trialEndDate,
    this.status = 'active',
  });

  SubscriptionItem copyWith({
    String? id,
    String? title,
    double? amount,
    String? type,
    String? frequency,
    String? currency,
    int? intervalDays,
    DateTime? anchorDate,
    DateTime? nextDueAt,
    bool? paused,
    bool? autopay,
    String? provider,
    String? plan,
    String? note,
    String? category,
    int? reminderDaysBefore,
    String? reminderTime,
    List<ParticipantShare>? participants,
    DateTime? createdAt,
    DateTime? updatedAt,
    double? averageAmount,
    DateTime? trialEndDate,
    String? status,
  }) {
    return SubscriptionItem(
      id: id ?? this.id,
      title: title ?? this.title,
      amount: amount ?? this.amount,
      type: type ?? this.type,
      frequency: frequency ?? this.frequency,
      currency: currency?? this.currency,
      intervalDays: intervalDays ?? this.intervalDays,
      anchorDate: anchorDate ?? this.anchorDate,
      nextDueAt: nextDueAt ?? this.nextDueAt,
      paused: paused ?? this.paused,
      autopay: autopay ?? this.autopay,
      provider: provider ?? this.provider,
      plan: plan ?? this.plan,
      note: note ?? this.note,
      category: category ?? this.category,
      reminderDaysBefore: reminderDaysBefore ?? this.reminderDaysBefore,
      reminderTime: reminderTime ?? this.reminderTime,
      participants: participants ?? this.participants,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      averageAmount: averageAmount ?? this.averageAmount,
      trialEndDate: trialEndDate ?? this.trialEndDate,
      status: status ?? this.status,
    );
  }

  bool get isPaused => paused || status == 'paused';
  bool get isActive => status == 'active';
  bool get isTrial => type.toLowerCase() == 'trial';
  bool get isVariable => type.toLowerCase() == 'bill';

  Map<String, dynamic> toJson() {
    return {
      'title': title,
      'amount': amount,
      'type': type,
      'frequency': frequency,
      'currency': currency,
      if (intervalDays != null) 'intervalDays': intervalDays,
      'anchorDate': Timestamp.fromDate(anchorDate),
      if (nextDueAt != null) 'nextDueAt': Timestamp.fromDate(nextDueAt!),
      'paused': paused,
      'autopay': autopay,
      if (provider != null && provider!.isNotEmpty) 'provider': provider,
      if (plan != null && plan!.isNotEmpty) 'plan': plan,
      if (note != null && note!.isNotEmpty) 'note': note,
      if (category != null && category!.isNotEmpty) 'category': category,
      if (reminderDaysBefore != null) 'reminderDaysBefore': reminderDaysBefore,
      if (reminderTime != null) 'reminderTime': reminderTime,
      if (participants.isNotEmpty)
        'participants': participants.map((e) => e.toJson()).toList(),
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
      if (averageAmount != null) 'averageAmount': averageAmount,
      if (trialEndDate != null) 'trialEndDate': Timestamp.fromDate(trialEndDate!),
      'status': status,
    };
  }

  factory SubscriptionItem.fromJson(String id, Map<String, dynamic> json) {
    DateTime? toDate(dynamic v) {
      if (v == null) return null;
      if (v is Timestamp) return v.toDate();
      if (v is DateTime) return v;
      if (v is int) {
        final millis = v > 2000000000 ? v : v * 1000;
        return DateTime.fromMillisecondsSinceEpoch(millis);
      }
      if (v is String) {
        return DateTime.tryParse(v);
      }
      return null;
    }

    final rawParticipants = (json['participants'] as List?) ?? const [];
    final parts = <ParticipantShare>[
      for (final entry in rawParticipants)
        if (entry is Map<String, dynamic>)
          ParticipantShare.fromJson(entry)
    ];

    final rawStatus = (json['status'] as String?)?.toLowerCase() ?? 'active';
    final legacyPaused = (json['paused'] as bool?) ??
        (((json['rule'] as Map?)?['status'] as String?)?.toLowerCase() ==
            'paused');
    
    // Unify paused state
    final effectiveStatus = legacyPaused ? 'paused' : rawStatus;

    return SubscriptionItem(
      id: id,
      title: (json['title'] as String? ?? '').trim(),
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      type: (json['type'] as String? ?? 'subscription').toLowerCase(),
      frequency: (json['frequency'] as String? ??
              (json['rule'] is Map
                  ? ((json['rule'] as Map)['frequency'] as String?)
                  : null) ??
              'monthly')
          .toLowerCase(),
      currency: (json['currency'] as String?)?.toUpperCase() ?? 'INR',
      intervalDays: (json['intervalDays'] as num?)?.toInt() ??
          ((json['rule'] is Map
                  ? ((json['rule'] as Map)['intervalDays'] as num?)
                  : null)
              ?.toInt()),
      anchorDate: toDate(json['anchorDate']) ??
          toDate((json['rule'] as Map?)?['anchorDate']) ??
          DateTime.now(),
      nextDueAt: toDate(json['nextDueAt']),
      paused: legacyPaused,
      autopay: (json['autopay'] as bool?) ?? false,
      provider: (json['provider'] as String?)?.trim(),
      plan: (json['plan'] as String?)?.trim(),
      note: (json['note'] as String?)?.trim(),
      category: (json['category'] as String?)?.trim(),
      reminderDaysBefore: (json['reminderDaysBefore'] as num?)?.toInt(),
      reminderTime: (json['reminderTime'] as String?)?.trim(),
      participants: parts,
      createdAt: toDate(json['createdAt']),
      updatedAt: toDate(json['updatedAt']),
      averageAmount: (json['averageAmount'] as num?)?.toDouble(),
      trialEndDate: toDate(json['trialEndDate']),
      status: effectiveStatus,
    );
  }

  RecurringRule toRecurringRule({
    required String ownerUserId,
  }) {
    final effectiveParticipants = participants.isNotEmpty
        ? participants
        : [ParticipantShare(userId: ownerUserId)];
    return RecurringRule(
      frequency: frequency,
      anchorDate: anchorDate,
      intervalDays: intervalDays,
      amount: amount,
      participants: effectiveParticipants,
      status: isPaused ? 'paused' : 'active',
    );
  }

  /// Convert the item into a [SharedItem] consumed by the overview UI.
  SharedItem toSharedItem({required String ownerUserId}) {
    final rule = toRecurringRule(ownerUserId: ownerUserId);
    return SharedItem(
      id: id ?? '',
      type: type,
      rule: rule,
      nextDueAt: nextDueAt,
      title: title,
      provider: provider?.isNotEmpty == true ? provider : title,
      note: note,
      amount: amount,
      meta: {
        'origin': 'userSubscriptions',
        if (plan != null && plan!.isNotEmpty) 'plan': plan,
        if (category != null && category!.isNotEmpty) 'category': category,
        'autopay': autopay,
        'status': status,
        if(isTrial) 'isTrial': true,
        if(trialEndDate != null) 'trialEndDate': trialEndDate!.toIso8601String(),
      },
      notify: reminderDaysBefore == null && reminderTime == null
          ? null
          : {
              if (reminderDaysBefore != null)
                'daysBefore': reminderDaysBefore,
              if (reminderTime != null) 'time': reminderTime,
            },
      ownerUserId: ownerUserId,
      sharing: 'user',
      participantUserIds: effectiveParticipantIds(ownerUserId),
    );
  }

  List<String> effectiveParticipantIds(String ownerUserId) {
    if (participants.isEmpty) return [ownerUserId];
    final ids = <String>{};
    for (final p in participants) {
      final id = p.userId.trim();
      if (id.isNotEmpty) ids.add(id);
    }
    if (ids.isEmpty) ids.add(ownerUserId);
    return ids.toList();
  }
}
