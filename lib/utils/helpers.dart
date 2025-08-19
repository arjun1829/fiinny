import 'package:flutter/material.dart';
import '../models/friend_model.dart';

class Helpers {
  static void showSnackbar(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  /// Helper to build the current user as a FriendModel for dialogs/logic.
  /// Uses phone number as unique ID.
  static FriendModel buildCurrentUserModel({
    required String userIdOrPhone, // Use phone as the ID (unified everywhere)
    String name = "You",
    String? avatar,
    String? phone,
    String? email,
  }) {
    return FriendModel(
      phone: phone ?? userIdOrPhone, // Always prefer phone as ID!
      name: (name.isNotEmpty ? name : "You"),
      email: email,
      avatar: (avatar != null && avatar.isNotEmpty)
          ? avatar
          : "🧑", // Fallback emoji
    );
  }
}
