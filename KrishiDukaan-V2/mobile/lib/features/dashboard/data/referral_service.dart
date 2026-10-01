import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../../core/constants/app_config.dart';

/// Sales / marketing referral codes on the app side — the mirror of the web's
/// app/lib/referral-client.ts (model: app/lib/referrals.ts).
///
/// Referral codes are not client-readable, so a code is validated through
/// `/api/referral/validate`, and create-order checks it again before stamping
/// it on the Razorpay order. Credit goes only to the code applied at that
/// checkout — nothing is stored on the account (owner's decision).
class ReferralCheck {
  final bool valid;
  final String? code;
  final String? ownerName;
  final String? error;
  const ReferralCheck.ok(this.code, this.ownerName)
      : valid = true,
        error = null;
  const ReferralCheck.fail(this.error)
      : valid = false,
        code = null,
        ownerName = null;
}

class ReferralService {
  ReferralService._();

  static final _format = RegExp(r'^[A-Z0-9]{3,20}$');

  static String normalize(String raw) =>
      raw.trim().toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

  static Future<ReferralCheck> validate(String raw) async {
    final code = normalize(raw);
    if (!_format.hasMatch(code)) {
      return const ReferralCheck.fail('Enter a valid referral code.');
    }
    try {
      final res = await http
          .get(Uri.parse(
              '${AppConfig.apiBaseUrl}/api/referral/validate?code=${Uri.encodeQueryComponent(code)}'))
          .timeout(const Duration(seconds: 10));
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (data['valid'] == true) {
        return ReferralCheck.ok(
            data['code'] as String? ?? code, data['ownerName'] as String?);
      }
      return ReferralCheck.fail(
          data['error'] as String? ?? 'This referral code is not valid.');
    } catch (_) {
      return const ReferralCheck.fail(
          'Could not check the referral code. Try again.');
    }
  }

  // Once per code per app session, like the web's sessionStorage dedupe.
  static final _logged = <String>{};

  /// Funnel event (`open` for a link that opened the app, `checkout_view` for
  /// a signed-in user seeing checkout with the code applied). Fire-and-forget:
  /// firestore.rules only accept an existing code and the caller's own uid.
  static void logEvent(
    String rawCode,
    String type, {
    String? uid,
    String? plan,
  }) {
    final code = normalize(rawCode);
    if (!_format.hasMatch(code)) return;
    if (type == 'checkout_view' && (uid == null || uid.isEmpty)) return;
    final key = '$type|$code|${uid ?? ''}';
    if (!_logged.add(key)) return;
    FirebaseFirestore.instance.collection('referralEvents').add({
      'code': code,
      'type': type,
      'platform': kIsWeb
          ? 'web'
          : defaultTargetPlatform == TargetPlatform.iOS
              ? 'ios'
              : 'android',
      'uid': uid,
      'plan': (plan != null && plan.isNotEmpty)
          ? plan.substring(0, plan.length > 40 ? 40 : plan.length)
          : null,
      'at': FieldValue.serverTimestamp(),
    }).then((_) {}, onError: (_) {
      // Unknown / paused code or offline — tracking only, never blocks.
    });
  }
}
