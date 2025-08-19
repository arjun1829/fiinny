import 'package:cloud_firestore/cloud_firestore.dart';

class GoalModel {
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
  });

  // -- from Firestore Document
  factory GoalModel.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final json = doc.data()!;
    return GoalModel(
      id: doc.id,
      title: json['title'] ?? '',
      targetAmount: (json['targetAmount'] is int)
          ? (json['targetAmount'] as int).toDouble()
          : (json['targetAmount'] ?? 0).toDouble(),
      savedAmount: (json['savedAmount'] is int)
          ? (json['savedAmount'] as int).toDouble()
          : (json['savedAmount'] ?? 0).toDouble(),
      targetDate: (json['targetDate'] is Timestamp)
          ? (json['targetDate'] as Timestamp).toDate()
          : DateTime.tryParse(json['targetDate']?.toString() ?? '') ?? DateTime.now(),
      emoji: json['emoji'],
      category: json['category'],
      priority: json['priority'],
      notes: json['notes'],
      dependencies: json['dependencies'] == null
          ? null
          : List<String>.from(json['dependencies'] as List),
    );
  }

  // -- from plain map (manual toJson/fromJson, etc.)
  factory GoalModel.fromJson(Map<String, dynamic> json, {String? id}) {
    return GoalModel(
      id: id ?? (json['id']?.toString() ?? ''),
      title: json['title'] ?? '',
      targetAmount: (json['targetAmount'] is int)
          ? (json['targetAmount'] as int).toDouble()
          : (json['targetAmount'] ?? 0).toDouble(),
      savedAmount: (json['savedAmount'] is int)
          ? (json['savedAmount'] as int).toDouble()
          : (json['savedAmount'] ?? 0).toDouble(),
      targetDate: (json['targetDate'] is Timestamp)
          ? (json['targetDate'] as Timestamp).toDate()
          : DateTime.tryParse(json['targetDate']?.toString() ?? '') ?? DateTime.now(),
      emoji: json['emoji'],
      category: json['category'],
      priority: json['priority'],
      notes: json['notes'],
      dependencies: json['dependencies'] == null
          ? null
          : List<String>.from(json['dependencies'] as List),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'title': title,
      'targetAmount': targetAmount,
      'savedAmount': savedAmount,
      'targetDate': Timestamp.fromDate(targetDate),
      'emoji': emoji,
      'category': category,
      'priority': priority,
      'notes': notes,
      'dependencies': dependencies,
      // 'id' is not stored as field! Only as doc id.
    };
  }

  // copyWith utility
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
    );
  }
}
