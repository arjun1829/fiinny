import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../../../core/constants/app_config.dart';
import 'plan_ladder.dart';

/// One step of a rep's funnel for a referral code — see app/lib/referrals.ts,
/// which computes it server-side from server-written payment records.
class ReferralStats {
  final int opens;
  final int reachedCheckout;
  final int startedBuyers;
  final int paidBuyers;
  final int paidOrders;
  final int failedOrders;
  final int abandonedOrders;
  final int revenue;
  final double conversionPct;
  final List<ReferralDay> daily;
  final List<ReferralLead> leads;

  const ReferralStats({
    required this.opens,
    required this.reachedCheckout,
    required this.startedBuyers,
    required this.paidBuyers,
    required this.paidOrders,
    required this.failedOrders,
    required this.abandonedOrders,
    required this.revenue,
    required this.conversionPct,
    required this.daily,
    required this.leads,
  });

  factory ReferralStats.fromJson(Map<String, dynamic> j) {
    int i(String k) => (j[k] as num?)?.toInt() ?? 0;
    return ReferralStats(
      opens: i('opens'),
      reachedCheckout: i('reachedCheckout'),
      startedBuyers: i('startedBuyers'),
      paidBuyers: i('paidBuyers'),
      paidOrders: i('paidOrders'),
      failedOrders: i('failedOrders'),
      abandonedOrders: i('abandonedOrders'),
      revenue: i('revenue'),
      conversionPct: (j['conversionPct'] as num?)?.toDouble() ?? 0,
      daily: ((j['daily'] as List?) ?? const [])
          .whereType<Map>()
          .map((m) => ReferralDay.fromJson(Map<String, dynamic>.from(m)))
          .toList(),
      leads: ((j['leads'] as List?) ?? const [])
          .whereType<Map>()
          .map((m) => ReferralLead.fromJson(Map<String, dynamic>.from(m)))
          .toList(),
    );
  }
}

class ReferralDay {
  final String date;
  final int opens;
  final int started;
  final int paid;
  const ReferralDay(this.date, this.opens, this.started, this.paid);
  factory ReferralDay.fromJson(Map<String, dynamic> j) => ReferralDay(
    '${j['date'] ?? ''}',
    (j['opens'] as num?)?.toInt() ?? 0,
    (j['started'] as num?)?.toInt() ?? 0,
    (j['paid'] as num?)?.toInt() ?? 0,
  );
}

/// Someone from the rep's link who has not paid — to follow up with.
class ReferralLead {
  final String userId;
  final String? name;
  final String? phone;

  /// viewed | pending | abandoned | failed
  final String status;
  final int? amount;
  final int? seatCount;
  final int? durationMonths;
  final DateTime? lastAt;

  const ReferralLead({
    required this.userId,
    required this.name,
    required this.phone,
    required this.status,
    required this.amount,
    required this.seatCount,
    required this.durationMonths,
    required this.lastAt,
  });

  factory ReferralLead.fromJson(Map<String, dynamic> j) => ReferralLead(
    userId: '${j['userId'] ?? ''}',
    name: j['name'] as String?,
    phone: j['phone'] as String?,
    status: '${j['status'] ?? 'viewed'}',
    amount: (j['amount'] as num?)?.toInt(),
    seatCount: (j['seatCount'] as num?)?.toInt(),
    durationMonths: (j['durationMonths'] as num?)?.toInt(),
    lastAt: DateTime.tryParse('${j['lastAt'] ?? ''}')?.toLocal(),
  );

  String get statusLabel => switch (status) {
    'pending' => 'Paying now',
    'abandoned' => 'Started, didn\'t pay',
    'failed' => 'Payment failed',
    _ => 'Saw plans, didn\'t start',
  };
}

class MyReferralCode {
  final String code;
  final bool active;
  final ReferralStats stats;
  const MyReferralCode({
    required this.code,
    required this.active,
    required this.stats,
  });
}

class ReferralRepository {
  /// Codes admin assigned to this rep, with live stats. Server-computed via
  /// `/api/referral/me` — the rep never reads payment records directly.
  Future<List<MyReferralCode>> fetchMine() async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw Exception('Not signed in.');
    final res = await http
        .get(
          Uri.parse('${AppConfig.apiBaseUrl}/api/referral/me'),
          headers: {'Authorization': 'Bearer $token'},
        )
        .timeout(const Duration(seconds: 20));
    Map<String, dynamic> body = const {};
    try {
      body = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {}
    if (res.statusCode != 200) {
      throw Exception(
        body['error'] ??
            'Could not load referral stats (HTTP ${res.statusCode}).',
      );
    }
    return ((body['codes'] as List?) ?? const [])
        .whereType<Map>()
        .map(
          (m) => MyReferralCode(
            code: '${m['code']}',
            active: m['active'] != false,
            stats: ReferralStats.fromJson(
              Map<String, dynamic>.from(m['stats'] as Map? ?? {}),
            ),
          ),
        )
        .toList();
  }

  /// The plans sellers can actually buy right now — the same settings/pricing
  /// ladder checkout charges from, or the built-in defaults when none is
  /// saved. An offer link can only point at one of these.
  Future<List<SubscriptionPlan>> fetchPlans() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('settings')
          .doc('pricing')
          .get();
      final parsed = parseSubscriptionPlans(snap.data());
      if (parsed != null && parsed.isNotEmpty) return parsed;
    } catch (_) {
      /* fall through to defaults, like checkout does */
    }
    return defaultSubscriptionPlans;
  }
}

/// `https://krishidukan.com/subscribe?ref=CODE[&plan=KEY][&seats=N]` — opens
/// the app if installed, otherwise the website. [seats] is only included for a
/// per-listing Custom plan, and is snapped to the 10-block sale rule.
String referralLink(String code, {SubscriptionPlan? plan, int? seats}) {
  final params = <String, String>{'ref': code};
  if (plan != null) {
    params['plan'] = plan.key;
    if (!plan.isStandard && !plan.isFlat && seats != null) {
      params['seats'] = '${normalizeSeatCount(seats)}';
    }
  }
  return Uri.parse(
    '${AppConfig.apiBaseUrl}/subscribe',
  ).replace(queryParameters: params).toString();
}
