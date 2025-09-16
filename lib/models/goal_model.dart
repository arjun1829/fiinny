// lib/models/goal_model.dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// Optional enums (serialized as strings in Firestore)
enum GoalStatus { active, paused, completed, archived }
enum GoalType { oneTime, recurring, milestone }

GoalStatus _statusFrom(dynamic v) {
  final s = (v ?? '').toString().toLowerCase();
  switch (s) {
    case 'paused':
      return GoalStatus.paused;
    case 'completed':
      return GoalStatus.completed;
    case 'archived':
      return GoalStatus.archived;
    case 'active':
    default:
      return GoalStatus.active;
  }
}

GoalType _typeFrom(dynamic v) {
  final s = (v ?? '').toString().toLowerCase();
  switch (s) {
    case 'recurring':
      return GoalType.recurring;
    case 'milestone':
      return GoalType.milestone;
    case 'one-time':
    case 'onetime':
    case 'one_time':
    default:
      return GoalType.oneTime;
  }
}

double _toDouble(dynamic v) {
  if (v == null) return 0.0;
  if (v is num) return v.toDouble();
  if (v is String) {
    final p = double.tryParse(v.replaceAll(',', '').trim());
    return p ?? 0.0;
  }
  return 0.0;
}

DateTime? _toDate(dynamic v) {
  if (v == null) return null;
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  if (v is int) {
    // epoch seconds vs ms
    if (v > 100000000000) {
      return DateTime.fromMillisecondsSinceEpoch(v);
    } else if (v > 1000000000) {
      return DateTime.fromMillisecondsSinceEpoch(v * 1000);
    }
  }
  if (v is String) {
    return DateTime.tryParse(v);
  }
  return null;
}

List<String>? _toStringList(dynamic v) {
  if (v == null) return null;
  if (v is List) {
    return v.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList();
  }
  return null;
}

class GoalModel {
  // --- core fields (existing) ---
  final String id;
  final String title;
  final double targetAmount;
  final double savedAmount;
  final DateTime targetDate;
  final String? emoji;
  final String? category;
  final String? priority;
  final String? notes;
  final List<String>? dependencies;

  // --- new fields (backward compatible) ---
  final GoalStatus status;          // active/paused/completed/archived
  final GoalType goalType;          // oneTime/recurring/milestone
  final String? recurrence;         // Weekly/Monthly/Quarterly/Yearly (if recurring)
  final List<String>? milestones;   // for milestone goals
  final String? imageUrl;           // optional preview image
  final bool archived;              // convenience flag (mirrors status sometimes)
  final DateTime? createdAt;        // when goal was created
  final DateTime? completedAt;      // when goal was achieved

  GoalModel({
    required this.id,
    required this.title,
    required this.targetAmount,
    required this.savedAmount,
    required this.targetDate,
    this.emoji,
    this.category,
    this.priority,
    this.notes,
    this.dependencies,
    // new:
    this.status = GoalStatus.active,
    this.goalType = GoalType.oneTime,
    this.recurrence,
    this.milestones,
    this.imageUrl,
    this.archived = false,
    this.createdAt,
    this.completedAt,
  });

  // --- handy computed helpers ---
  double get progress =>
      targetAmount <= 0 ? 0.0 : (savedAmount / targetAmount).clamp(0.0, 1.0);

  double get amountRemaining =>
      (targetAmount - savedAmount) <= 0 ? 0.0 : (targetAmount - savedAmount);

  int get daysRemaining {
    final now = DateTime.now();
    return targetDate.difference(DateTime(now.year, now.month, now.day)).inDays;
  }

  bool get isOverdue => progress < 1.0 && daysRemaining < 0;
  bool get isAchieved => progress >= 1.0 || status == GoalStatus.completed;

  /// Rough required monthly saving to hit target on time (based on 30d month)
  double get requiredPerMonth {
    final days = daysRemaining;
    if (days <= 0) return amountRemaining;
    return (amountRemaining / days) * 30.0;
  }

  // --- Firestore ---
  factory GoalModel.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final json = doc.data() ?? {};
    return GoalModel(
      id: doc.id,
      title: (json['title'] ?? '').toString(),
      targetAmount: _toDouble(json['targetAmount']),
      savedAmount: _toDouble(json['savedAmount']),
      targetDate: _toDate(json['targetDate']) ?? DateTime.now(),
      emoji: json['emoji']?.toString(),
      category: json['category']?.toString(),
      priority: json['priority']?.toString(),
      notes: json['notes']?.toString(),
      dependencies: _toStringList(json['dependencies']),
      // new fields (safe defaults if missing):
      status: _statusFrom(json['status']),
      goalType: _typeFrom(json['goalType']),
      recurrence: json['recurrence']?.toString(),
      milestones: _toStringList(json['milestones']),
      imageUrl: json['imageUrl']?.toString(),
      archived: (json['archived'] is bool) ? json['archived'] as bool : false,
      createdAt: _toDate(json['createdAt']),
      completedAt: _toDate(json['completedAt']),
    );
  }

  factory GoalModel.fromJson(Map<String, dynamic> json, {String? id}) {
    return GoalModel(
      id: id ?? (json['id']?.toString() ?? ''),
      title: (json['title'] ?? '').toString(),
      targetAmount: _toDouble(json['targetAmount']),
      savedAmount: _toDouble(json['savedAmount']),
      targetDate: _toDate(json['targetDate']) ?? DateTime.now(),
      emoji: json['emoji']?.toString(),
      category: json['category']?.toString(),
      priority: json['priority']?.toString(),
      notes: json['notes']?.toString(),
      dependencies: _toStringList(json['dependencies']),
      status: _statusFrom(json['status']),
      goalType: _typeFrom(json['goalType']),
      recurrence: json['recurrence']?.toString(),
      milestones: _toStringList(json['milestones']),
      imageUrl: json['imageUrl']?.toString(),
      archived: (json['archived'] is bool) ? json['archived'] as bool : false,
      createdAt: _toDate(json['createdAt']),
      completedAt: _toDate(json['completedAt']),
    );
  }

  Map<String, dynamic> toJson({bool setServerCreatedAtIfNull = true}) {
    final map = <String, dynamic>{
      'title': title,
      'targetAmount': targetAmount,
      'savedAmount': savedAmount,
      'targetDate': Timestamp.fromDate(targetDate),
      'emoji': emoji,
      'category': category,
      'priority': priority,
      'notes': notes,
      'dependencies': dependencies,
      // new
      'status': status.name,
      'goalType': goalType.name,
      'recurrence': recurrence,
      'milestones': milestones,
      'imageUrl': imageUrl,
      'archived': archived,
      'completedAt': completedAt != null ? Timestamp.fromDate(completedAt!) : null,
      // createdAt: set to server time if not provided (useful on create)
      'createdAt': createdAt != null
          ? Timestamp.fromDate(createdAt!)
          : (setServerCreatedAtIfNull ? FieldValue.serverTimestamp() : null),
      // 'id' not stored (doc id is the id)
    };
    // remove nulls to keep Firestore tidy
    map.removeWhere((_, v) => v == null);
    return map;
  }

  GoalModel copyWith({
    String? id,
    String? title,
    double? targetAmount,
    double? savedAmount,
    DateTime? targetDate,
    String? emoji,
    String? category,
    String? priority,
    String? notes,
    List<String>? dependencies,
    // new:
    GoalStatus? status,
    GoalType? goalType,
    String? recurrence,
    List<String>? milestones,
    String? imageUrl,
    bool? archived,
    DateTime? createdAt,
    DateTime? completedAt,
  }) {
    return GoalModel(
      id: id ?? this.id,
      title: title ?? this.title,
      targetAmount: targetAmount ?? this.targetAmount,
      savedAmount: savedAmount ?? this.savedAmount,
      targetDate: targetDate ?? this.targetDate,
      emoji: emoji ?? this.emoji,
      category: category ?? this.category,
      priority: priority ?? this.priority,
      notes: notes ?? this.notes,
      dependencies: dependencies ?? this.dependencies,
      status: status ?? this.status,
      goalType: goalType ?? this.goalType,
      recurrence: recurrence ?? this.recurrence,
      milestones: milestones ?? this.milestones,
      imageUrl: imageUrl ?? this.imageUrl,
      archived: archived ?? this.archived,
      createdAt: createdAt ?? this.createdAt,
      completedAt: completedAt ?? this.completedAt,
    );
  }
}
