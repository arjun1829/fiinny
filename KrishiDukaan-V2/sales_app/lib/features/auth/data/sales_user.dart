/// The signed-in rep, as resolved from their Firestore user doc.
class SalesUser {
  final String uid;
  final String email;
  final String name;
  final String phone;
  final String role;

  const SalesUser({
    required this.uid,
    required this.email,
    required this.name,
    required this.phone,
    required this.role,
  });

  bool get isAdmin => role == 'admin';

  /// Falls back through name → email local part → phone so the greeting on the
  /// dashboard is never blank.
  String get displayName {
    if (name.trim().isNotEmpty) return name.trim();
    if (email.contains('@')) return email.split('@').first;
    if (phone.isNotEmpty) return phone;
    return 'Sales Executive';
  }

  String get initials {
    final parts = displayName.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2 && parts[1].isNotEmpty) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    final n = displayName.trim();
    return (n.length >= 2 ? n.substring(0, 2) : n).toUpperCase();
  }
}
