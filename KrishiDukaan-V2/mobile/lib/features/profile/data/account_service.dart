import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import '../../../core/constants/app_config.dart';

/// Calls the shared backend endpoint (also used by the web app) that
/// permanently deletes the signed-in user's account: Firestore data across
/// every collection keyed by their phone/uid, then the Firebase Auth user
/// itself. See app/api/account/delete/route.ts for the full cleanup scope.
class AccountService {
  Future<void> deleteMyAccount() async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw Exception('Not authenticated');

    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/account/delete'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode != 200) {
      final body = jsonDecode(response.body) as Map<String, dynamic>?;
      throw Exception(body?['error'] ?? 'Failed to delete account.');
    }
  }
}
