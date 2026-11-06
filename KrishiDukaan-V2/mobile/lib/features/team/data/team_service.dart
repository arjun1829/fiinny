import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../../../core/constants/app_config.dart';
import '../../../core/models/staff_session.dart';

/// One helper in the owner's team (GET /api/team).
class TeamMember {
  final String phone;
  final String name;
  final List<String> permissions;
  final String status;
  final bool addedByAdmin;
  final DateTime? lastActiveAt;

  const TeamMember({
    required this.phone,
    required this.name,
    required this.permissions,
    required this.status,
    required this.addedByAdmin,
    required this.lastActiveAt,
  });

  factory TeamMember.fromJson(Map<String, dynamic> j) => TeamMember(
        phone: (j['phone'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        permissions: [for (final p in (j['permissions'] as List? ?? const [])) p.toString()],
        status: j['status'] == 'paused' ? 'paused' : 'active',
        addedByAdmin: j['addedBy'] == 'admin',
        lastActiveAt: DateTime.tryParse((j['lastActiveAt'] ?? '').toString()),
      );

  bool get isActive => status == 'active';
}

class TeamData {
  final String shopName;
  final List<TeamMember> members;
  const TeamData({required this.shopName, required this.members});
}

/// Talks to the website's /api/team endpoints — the only writer of shop
/// teams (firestore.rules deny clients), shared with the web Team page.
class TeamService {
  TeamService._();
  static final instance = TeamService._();

  Future<Map<String, String>> _headers() async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw Exception('Please sign in again.');
    return {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'};
  }

  Map<String, dynamic> _decode(http.Response res) {
    final body = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error'] ?? 'Something went wrong. Please try again.');
    }
    return body;
  }

  /// A helper opening the app: their access, or null when they are not (or
  /// no longer) on a team. Refreshes the sign-in token when the server just
  /// granted the kdStaff claim, so the security rules see it.
  Future<StaffSession?> checkIn() async {
    final res = await http
        .post(Uri.parse('${AppConfig.apiBaseUrl}/api/team/me'), headers: await _headers())
        .timeout(const Duration(seconds: 15));
    final body = _decode(res);
    final staff = body['staff'];
    if (staff is! Map) return null;
    if (body['refreshToken'] == true) {
      await FirebaseAuth.instance.currentUser?.getIdToken(true);
    }
    return StaffSession.fromJson(Map<String, dynamic>.from(staff));
  }

  Future<TeamData> load() async {
    final res = await http
        .get(Uri.parse('${AppConfig.apiBaseUrl}/api/team'), headers: await _headers())
        .timeout(const Duration(seconds: 15));
    final body = _decode(res);
    return TeamData(
      shopName: ((body['owner'] as Map?)?['name'] ?? '').toString(),
      members: [
        for (final m in (body['members'] as List? ?? const []))
          TeamMember.fromJson(Map<String, dynamic>.from(m as Map)),
      ],
    );
  }

  Future<void> _post(Map<String, Object?> body) async {
    final res = await http
        .post(Uri.parse('${AppConfig.apiBaseUrl}/api/team'),
            headers: await _headers(), body: jsonEncode(body))
        .timeout(const Duration(seconds: 20));
    _decode(res);
  }

  Future<void> add({required String name, required String phone, required List<String> permissions}) =>
      _post({'action': 'add', 'name': name, 'phone': phone, 'permissions': permissions});

  Future<void> setPermissions(String phone, List<String> permissions) =>
      _post({'action': 'update', 'phone': phone, 'permissions': permissions});

  Future<void> setStatus(String phone, {required bool active}) =>
      _post({'action': 'update', 'phone': phone, 'status': active ? 'active' : 'paused'});

  Future<void> remove(String phone) => _post({'action': 'remove', 'phone': phone});
}
