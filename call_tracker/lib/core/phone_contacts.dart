import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:permission_handler/permission_handler.dart';

import 'models.dart';

/// The phone's own address book: names for incoming numbers, and the place
/// team-saved names get written to.
class PhoneContacts {
  static Future<bool> canRead() async => !kIsWeb && await Permission.contacts.isGranted;

  /// number key -> display name, from every contact on the phone.
  static Future<Map<String, String>> namesByNumber() async {
    if (!await canRead()) return {};
    final contacts = await FlutterContacts.getAll(properties: {ContactProperty.phone});
    final out = <String, String>{};
    for (final c in contacts) {
      final name = c.displayName?.trim();
      if (name == null || name.isEmpty) continue;
      for (final ph in c.phones) {
        final key = numberKey(ph.normalizedNumber ?? ph.number);
        if (key.isNotEmpty) out.putIfAbsent(key, () => name);
      }
    }
    return out;
  }

  /// Adds a new contact to the phone. Existing phone contacts are never
  /// renamed: the phone owner's own naming wins.
  static Future<bool> save(String name, String number) async {
    if (kIsWeb || !await Permission.contacts.isGranted) return false;
    final parts = name.trim().split(RegExp(r'\s+'));
    await FlutterContacts.create(Contact(
      name: Name(
        first: parts.first,
        last: parts.length > 1 ? parts.sublist(1).join(' ') : null,
      ),
      phones: [Phone(number: number)],
    ));
    return true;
  }
}
