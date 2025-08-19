import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class FriendModel {
  /// Unique identifier everywhere (E.164 phone, e.g., "+91xxxxxxxxxx")
  final String phone;
  final String name;
  final String? email;
  final String avatar;

  /// Firestore doc.id (optional, for UI/legacy reference only)
  final String? docId;

  FriendModel({
    required this.phone,
    required this.name,
    this.email,
    String? avatar,
    this.docId,
  }) : avatar = avatar ?? "👤";

  Map<String, dynamic> toJson() => {
    'phone': phone,
    'name': name,
    if (email != null) 'email': email,
    'avatar': avatar,
    if (docId != null) 'docId': docId, // For easy debugging/migration
  };

  factory FriendModel.fromJson(Map<String, dynamic> json) => FriendModel(
    phone: json['phone'] ?? '',
    name: json['name'] ?? '',
    email: json['email'],
    avatar: json['avatar'] ?? "👤",
    docId: json['docId'],
  );

  /// Firestore factory: expects phone as document key or field
  factory FriendModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return FriendModel(
      phone: data['phone'] ?? doc.id, // fallback to doc.id for migration
      name: data['name'] ?? '',
      email: data['email'],
      avatar: data['avatar'] ?? "👤",
      docId: doc.id,
    );
  }
}

// ---- EXTENSION for COPYWITH (immutable update) ----
extension FriendModelCopy on FriendModel {
  FriendModel copyWith({
    String? phone,
    String? name,
    String? email,
    String? avatar,
    String? docId,
  }) {
    return FriendModel(
      phone: phone ?? this.phone,
      name: name ?? this.name,
      email: email ?? this.email,
      avatar: avatar ?? this.avatar,
      docId: docId ?? this.docId,
    );
  }
}
