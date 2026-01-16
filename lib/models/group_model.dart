import 'package:cloud_firestore/cloud_firestore.dart';

class GroupModel {
  final String id; // Firestore doc ID (group-level)
  final String name;
  final List<String> memberPhones; // Unique: phone numbers of all members
  List<String> get memberIds => memberPhones;
  final Map<String, String>? memberAvatars; // phone -> avatarUrl or emoji/initial
  final Map<String, String>? memberDisplayNames; // phone -> contact display name (optional)
  final String createdBy; // phone (not UID)
  final DateTime createdAt;
  final String? avatarUrl;

  GroupModel({
    required this.id,
    required this.name,
    required this.memberPhones,
    required this.createdBy,
    required this.createdAt,
    this.avatarUrl,
    this.memberAvatars,
    this.memberDisplayNames,
  });

  /// Use to guarantee group always contains creator phone in memberPhones
  factory GroupModel.withCreator({
    required String id,
    required String name,
    required List<String> memberPhones,
    required String createdBy,
    required DateTime createdAt,
    String? avatarUrl,
    Map<String, String>? memberAvatars,
    Map<String, String>? memberDisplayNames,
  }) {
    final members = Set<String>.from(memberPhones);
    members.add(createdBy);
    return GroupModel(
      id: id,
      name: name,
      memberPhones: members.toList(),
      createdBy: createdBy,
      createdAt: createdAt,
      avatarUrl: avatarUrl,
      memberAvatars: memberAvatars,
      memberDisplayNames: memberDisplayNames,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'memberPhones': memberPhones,
    'createdBy': createdBy,
    'createdAt': Timestamp.fromDate(createdAt),
    if (avatarUrl != null) 'avatarUrl': avatarUrl,
    if (memberAvatars != null) 'memberAvatars': memberAvatars,
    if (memberDisplayNames != null) 'memberDisplayNames': memberDisplayNames,
  };

  factory GroupModel.fromJson(Map<String, dynamic> json) {
    DateTime parseDate(dynamic v) {
      if (v is Timestamp) return v.toDate();
      if (v is String) return DateTime.tryParse(v) ?? DateTime.now();
      return DateTime.now();
    }
    final memberAvatars = json['memberAvatars'] != null
        ? Map<String, String>.from(json['memberAvatars'])
        : null;
    final memberDisplayNames = json['memberDisplayNames'] != null
        ? Map<String, String>.from(json['memberDisplayNames'])
        : null;

    return GroupModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      memberPhones: List<String>.from(json['memberPhones'] ?? []),
      createdBy: json['createdBy'] ?? '',
      createdAt: parseDate(json['createdAt']),
      avatarUrl: json['avatarUrl'],
      memberAvatars: memberAvatars,
      memberDisplayNames: memberDisplayNames,
    );
  }

  factory GroupModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    DateTime parseDate(dynamic v) {
      if (v is Timestamp) return v.toDate();
      if (v is String) return DateTime.tryParse(v) ?? DateTime.now();
      return DateTime.now();
    }
    final memberAvatars = data['memberAvatars'] != null
        ? Map<String, String>.from(data['memberAvatars'])
        : null;
    final memberDisplayNames = data['memberDisplayNames'] != null
        ? Map<String, String>.from(data['memberDisplayNames'])
        : null;

    return GroupModel(
      id: doc.id,
      name: data['name'] ?? '',
      memberPhones: List<String>.from(data['memberPhones'] ?? []),
      createdBy: data['createdBy'] ?? '',
      createdAt: parseDate(data['createdAt']),
      avatarUrl: data['avatarUrl'],
      memberAvatars: memberAvatars,
      memberDisplayNames: memberDisplayNames,
    );
  }

  int get memberCount => memberPhones.length;

  /// For widgets: Returns up to 5 member avatar urls, emojis, or empty for fallback.
  List<String> get memberAvatarList {
    if (memberAvatars == null || memberAvatars!.isEmpty) return [];
    return memberPhones
        .take(5)
        .map((phone) => memberAvatars![phone] ?? '')
        .toList();
  }
}
