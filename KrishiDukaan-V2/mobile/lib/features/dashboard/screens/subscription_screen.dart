import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import '../../../core/payments/app_razorpay.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../cart/data/payment_service.dart' show PaymentService;
import '../data/subscription_pricing.dart';
import '../providers/dashboard_provider.dart';

/// Firestore document holding the live pricing ladder — the same one the web
/// admin Pricing screen writes and `api/payment/create-order` charges from.
const _pricingCollection = 'settings';
const _pricingDoc = 'pricing';

/// The published legal documents a subscription is sold under.
///
/// Mirrors `app/lib/legal-constants.ts` on the web. Both checkouts must show and
/// record the same thing — the whole point of the standard Seller &
/// Manufacturer Subscription Terms is that there is one deal, not one per
/// client. Keep [_termsVersion] in step with TERMS_VERSION over there.
const _termsPath = '/terms';
const _sellerTermsPath = '/seller-terms';
const _termsVersion = '2026-08-26';

/// The plan to reopen on a renewal: the Standard pack whose period and size
/// match the expiring subscription, else the Custom plan for that period.
SubscriptionPlan? _matchRenewal(
  List<SubscriptionPlan> plans,
  int months,
  int? seats,
) {
  for (final p in plans) {
    if (p.isStandard && p.months == months && p.includedListings == seats) {
      return p;
    }
  }
  for (final p in plans) {
    if (!p.isStandard && !p.isFlat && p.months == months) return p;
  }
  return null;
}

class SubscriptionScreen extends ConsumerStatefulWidget {
  /// 'new_account' → just signed up; 'paywall' → bounced off the dashboard;
  /// 'renewal' → opened from a subscription_expiry notification.
  final String? reason;

  /// Seats and plan length from the user's expiring subscription, passed by a
  /// subscription_expiry notification so renewal comes up pre-configured and
  /// the user only has to pay. Null when the screen is opened any other way.
  final int? initialSeats;
  final int? initialMonths;

  const SubscriptionScreen({
    super.key,
    this.reason,
    this.initialSeats,
    this.initialMonths,
  });

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {
  late final AppRazorpay _razorpay;
  int _seats = seatStep;
  late final TextEditingController _seatCtrl;
  List<SubscriptionPlan> _plans = defaultSubscriptionPlans;
  // Standard is the default tab; its first plan is preselected.
  PlanTier _tier = PlanTier.standard;
  SubscriptionPlan _duration = defaultSubscriptionPlans.firstWhere(
    (p) => p.isStandard,
    orElse: () => defaultSubscriptionPlans.first,
  );
  bool _loading = false;
  String? _error;
  String? _razorpayOrderId;

  /// Order amount in PAISE — see checkout_screen for why this is retained.
  int? _razorpayAmount;

  /// Promo code — mirrors web's SubscriptionView. Validated against the same
  /// `promoCodes` collection create-order re-checks server-side, so what the
  /// seller sees here and what they are actually charged cannot drift.
  final _promoCtrl = TextEditingController();
  // The promoCodes/ doc once looked up. Whether it applies — and the reason
  // when it doesn't — is re-evaluated against the CURRENT plan every build
  // (evaluatePromo, the server's own rules), so switching Standard/Custom,
  // period or seats updates the discount without another lookup.
  Map<String, dynamic>? _promoDoc;
  bool _promoLoading = false;
  // Lookup problems only (not found / network); eligibility comes from eval.
  String? _promoLookupError;

  bool get _hasTier => _plans.any((p) => p.tier == _tier);
  bool get _showToggle =>
      _plans.any((p) => p.isStandard) && _plans.any((p) => !p.isStandard);
  List<SubscriptionPlan> get _tierPlans =>
      _plans.where((p) => p.tier == _tier).toList();
  int get _grantedSeats => _duration.billableSeats(_seats);

  PromoEvaluation? get _promoEval => _promoDoc == null
      ? null
      : evaluatePromo(
          _promoDoc,
          months: _duration.months,
          seatCount: _grantedSeats,
        );

  void _switchTier(PlanTier next) {
    if (next == _tier) return;
    final first = _plans.where((p) => p.tier == next);
    if (first.isEmpty) return;
    setState(() {
      _tier = next;
      _duration = first.first;
    });
  }

  @override
  void initState() {
    super.initState();
    _razorpay = AppRazorpay(onSuccess: _onSuccess, onError: _onError);

    // Preselect the expiring plan on a renewal. An unrecognised month count
    // (an old or admin-set plan length) falls back to the default rather than
    // leaving the screen with no duration selected.
    //
    // A legacy subscription may carry a seat count from before the 10-seat
    // blocks rule (e.g. 1 or 5), so it is normalized too — otherwise renewal
    // would show a price the server won't honour.
    final seats = widget.initialSeats;
    if (seats != null && seats > 0) _seats = normalizeSeatCount(seats);
    _seatCtrl = TextEditingController(text: '$_seats');

    // A renewal whose seats and period match a Standard pack reopens on that
    // Standard plan; anything else reopens on the matching Custom period.
    final months = widget.initialMonths;
    if (months != null) {
      final match = _matchRenewal(_plans, months, seats);
      if (match != null) {
        _duration = match;
        _tier = match.tier;
      }
    }

    _loadPlans();
  }

  /// Pull the live ladder from settings/pricing.
  ///
  /// Prices used to be a const map in this file, so changing them in admin
  /// updated what Razorpay charged while the app kept displaying — and
  /// recording — the old number. Reading them at runtime is what keeps a price
  /// change a config change instead of a store release.
  Future<void> _loadPlans() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection(_pricingCollection)
          .doc(_pricingDoc)
          .get();
      final all = parseSubscriptionPlans(snap.data());
      if (all == null || all.isEmpty || !mounted) return;
      // Don't show a plan checkout would refuse: create-order rejects a plan the
      // account's role isn't allowed to buy.
      final role = ref.read(currentUserProvider).value?.role;
      final parsed = all.where((p) => p.allowsRole(role)).toList();
      if (parsed.isEmpty) return;
      setState(() {
        _plans = parsed;
        // Keep the tab and selection valid if admin removed or renamed plans:
        // same plan if it still exists, else the renewal match, else the
        // first plan of the current tab, else of whichever tab has plans.
        if (!_hasTier) {
          _tier = parsed.any((p) => p.isStandard)
              ? PlanTier.standard
              : PlanTier.custom;
        }
        final renewal = widget.initialMonths != null
            ? _matchRenewal(parsed, widget.initialMonths!, widget.initialSeats)
            : null;
        _duration = parsed.firstWhere(
          (p) => p.key == _duration.key,
          orElse: () => renewal ?? parsed.firstWhere((p) => p.tier == _tier),
        );
        _tier = _duration.tier;
      });
    } catch (_) {
      /* unreachable settings doc keeps the built-in ladder */
    }
  }

  @override
  void dispose() {
    _razorpay.clear();
    _seatCtrl.dispose();
    _promoCtrl.dispose();
    super.dispose();
  }

  /// Applies a new seat count and keeps the text field in step with it.
  void _setSeats(int raw) {
    final next = normalizeSeatCount(raw);
    setState(() => _seats = next);
    if (_seatCtrl.text != '$next') {
      _seatCtrl.text = '$next';
      _seatCtrl.selection = TextSelection.collapsed(
        offset: _seatCtrl.text.length,
      );
    }
  }

  /// Clears whatever the promo field previously resolved to and refreshes the
  /// Apply button's enabled state. Called on every keystroke — without the
  /// clear, changing "SAVE20" to "SAVE2" would keep showing the SAVE20
  /// discount applied while Pay quietly charges full price (create-order only
  /// trusts a code it can re-validate itself, so a stale/edited code is simply
  /// ignored server-side, but the UI must not keep claiming a discount that
  /// will not be honoured).
  void _onPromoTextChanged(String _) {
    setState(() {
      _promoDoc = null;
      _promoLookupError = null;
    });
  }

  /// Validates the typed code against the same `promoCodes` collection
  /// create-order re-checks — mirrors web's applyPromo exactly, including its
  /// three distinct failure messages, so a seller sees the same outcome on
  /// either platform for the same code.
  Future<void> _applyPromo() async {
    final code = _promoCtrl.text.trim().toUpperCase();
    if (code.isEmpty) return;

    setState(() {
      _promoLoading = true;
      _promoLookupError = null;
      _promoDoc = null;
    });

    try {
      // Not filtered on `active`: a deactivated code should say so (same
      // message as the web), not claim it doesn't exist.
      final snap = await FirebaseFirestore.instance
          .collection('promoCodes')
          .where('code', isEqualTo: code)
          .limit(1)
          .get()
          .timeout(const Duration(seconds: 10));

      if (!mounted) return;

      setState(() {
        if (snap.docs.isEmpty) {
          _promoLookupError = 'Invalid or expired promo code.';
        } else {
          _promoDoc = snap.docs.first.data();
        }
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _promoLookupError = 'Could not validate promo code. Try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _promoLoading = false);
    }
  }

  /// What the seller was shown, and therefore accepted, by pressing Pay.
  Map<String, dynamic> _termsAcceptanceRecord() => {
    'version': _termsVersion,
    'documents': [_termsPath, _sellerTermsPath],
    'acceptedAt': DateTime.now().toUtc().toIso8601String(),
    'surface': 'mobile:subscription-checkout',
  };

  Future<void> _openLegalDoc(String path) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path');
    // An external browser, not an in-app webview: the seller should be able to
    // read the terms without losing the checkout they are part-way through.
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open ${uri.toString()}')),
      );
    }
  }

  Future<void> _startPayment() async {
    final user = ref.read(currentUserProvider).value;
    if (user == null) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // Create Razorpay order server-side so amount is tamper-proof.
      // The token is what the server resolves the buyer's role from — a
      // role-restricted plan cannot be bought without it.
      final idToken = await FirebaseAuth.instance.currentUser?.getIdToken();
      final res = await http
          .post(
            Uri.parse('${AppConfig.apiBaseUrl}/api/payment/create-order'),
            headers: {
              'Content-Type': 'application/json',
              if (idToken != null) 'Authorization': 'Bearer $idToken',
              // Same reason as the cart call: without this the attempt is
              // recorded as a web purchase, and same browser caveat.
              if (!kIsWeb) 'x-client': 'mobile',
            },
            body: jsonEncode({
              // Granted seats: a Standard plan is always its full pack.
              'seatCount': _grantedSeats,
              'durationMonths': _duration.months,
              'planId': _duration.key,
              'userId': user.uid,
              // Only an already-validated code, never the raw text box — see
              // _onPromoTextChanged. create-order re-validates it regardless
              // and computes the actual charge itself; this is what tells it
              // which code to check.
              // Only a code that applies to this exact selection.
              'promoCode': (_promoEval?.applies ?? false)
                  ? _promoEval!.code
                  : null,
            }),
          )
          .timeout(const Duration(seconds: 15));

      if (res.statusCode != 200) {
        // 403 is a deliberate refusal (e.g. a plan this account type may not
        // buy) and carries a message worth showing verbatim.
        String? serverMessage;
        try {
          serverMessage =
              (jsonDecode(res.body) as Map<String, dynamic>)['error']
                  as String?;
        } catch (_) {
          /* non-JSON body */
        }
        if (serverMessage != null && serverMessage.isNotEmpty) {
          throw Exception(serverMessage);
        }
        throw Exception(
          'Payment server error (${res.statusCode}). '
          'Check that RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set '
          'in your production environment.',
        );
      }

      final order = jsonDecode(res.body) as Map<String, dynamic>;
      if (order['error'] != null) throw Exception(order['error']);

      // Use the key the backend used to create the order so they always match.
      final razorpayKey = order['key_id'] as String? ?? AppConfig.razorpayKeyId;
      _razorpayOrderId = order['id'] as String?;
      _razorpayAmount = (order['amount'] as num?)?.toInt();

      _razorpay.open({
        'key': razorpayKey,
        'amount': order['amount'],
        'currency': order['currency'] ?? 'INR',
        'order_id': _razorpayOrderId,
        'name': 'KrishiDukan',
        'description':
            '${_duration.isStandard ? 'Standard · ' : ''}'
            '$_grantedSeats listing${_grantedSeats != 1 ? 's' : ''} · ${_duration.label}',
        'prefill': {
          'contact': user.phone,
          'name': user.name,
          if (user.email != null) 'email': user.email,
        },
        'theme': {'color': '#2E7D32'},
        // See checkout_screen.dart's identical option for the full story:
        // the checkout SDK's own completion wait (default 3 minutes) is
        // tight for a UPI collect approval, and giving up on that wait is
        // not the same as Razorpay not having captured the payment.
        // _onError still reconciles against Razorpay directly for whatever
        // slips past this wider window.
        'timeout': 300,
      });
    } catch (e) {
      setState(() {
        _error = 'Could not start payment: $e';
        _loading = false;
      });
    }
  }

  void _onSuccess(AppPaymentSuccess response) async {
    setState(() => _loading = true);

    try {
      // Verify payment signature with backend API
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      final verifyRes = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/payment/verify'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'razorpay_order_id': response.orderId,
          'razorpay_payment_id': response.paymentId,
          'razorpay_signature': response.signature,
        }),
      );

      if (verifyRes.statusCode != 200) {
        throw Exception('Payment verification failed');
      }

      final verifyData = jsonDecode(verifyRes.body) as Map<String, dynamic>;
      if (verifyData['status'] != 'ok') {
        throw Exception('Payment verification failed');
      }

      final verifiedSeatCount =
          (verifyData['seatCount'] as num?)?.toInt() ?? _grantedSeats;

      await _activateSubscription(
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
        seatCount: verifiedSeatCount,
        amountPaid: (verifyData['amountPaid'] as num?)?.toInt(),
        // Gateway-verified promo code from the order notes (via verify/), not
        // the checkout field — persisted for promo usage attribution.
        promoCode: (verifyData['promoCode'] as String?),
        planTier: verifyData['planTier'] as String?,
        planName: verifyData['planName'] as String?,
        planId: verifyData['planId'] as String?,
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Payment verification or DB update failed: $e';
        });
      }
    }
  }

  /// Writes the subscription to Firestore, shared by the normal success
  /// callback and [_onError]'s reconciliation path. [seatCount] comes from
  /// the order's own server-set `notes` either way — via /verify on success,
  /// or via /api/payment/order-status when reconciling a payment the
  /// checkout SDK reported as failed but Razorpay actually captured.
  Future<void> _activateSubscription({
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required int seatCount,
    int? amountPaid,
    String? promoCode,

    /// Plan identity from the Razorpay order's notes (via verify/ or
    /// order-status) — the plan actually charged. Falls back to the screen's
    /// selection only for orders created before these notes existed.
    String? planTier,
    String? planName,
    String? planId,
  }) async {
    final normalizedPromo = (promoCode ?? '').trim().toUpperCase();
    final tier = planTier == 'standard' || planTier == 'custom'
        ? planTier!
        : (_duration.isStandard ? 'standard' : 'custom');
    final name = (planName ?? '').trim().isNotEmpty
        ? planName!.trim()
        : (tier == 'standard' ? 'Standard' : 'Custom');
    final user = ref.read(currentUserProvider).value!;
    final firebaseUser = FirebaseAuth.instance.currentUser!;

    final userDocRef = FirebaseFirestore.instance
        .collection('users')
        .doc(user.phone);
    final currentSeats = user.totalSeats;
    final seatsToAdd = seatCount;

    final batch = FirebaseFirestore.instance.batch();

    // If user is still 'consumer', upgrade to 'retailer' so canAccessDashboard
    // returns true after payment (consumers who pay should get seller access).
    final roleUpdate = user.role == 'consumer'
        ? {'role': 'retailer'}
        : <String, dynamic>{};
    batch.update(userDocRef, {
      'isPaid': true,
      'subscriptionStatus': 'paid',
      'paymentDetails': {
        'orderId': razorpayOrderId,
        'paymentId': razorpayPaymentId,
      },
      'totalSeats': currentSeats + seatsToAdd,
      'updatedAt': FieldValue.serverTimestamp(),
      ...roleUpdate,
    });

    final totalAmount = amountPaid ?? _duration.totalPrice(seatsToAdd);

    final now = DateTime.now();
    final expiry = DateTime.now().add(Duration(days: _duration.months * 30));

    final paymentRef = FirebaseFirestore.instance.collection('payments').doc();
    batch.set(paymentRef, {
      'userId': firebaseUser.uid,
      'userPhone': user.phone,
      'amount': totalAmount,
      'seatCount': seatsToAdd,
      'durationMonths': _duration.months,
      'planName': name,
      'planTier': tier,
      'currency': 'INR',
      'razorpayOrderId': razorpayOrderId,
      'razorpayPaymentId': razorpayPaymentId,
      'timestamp': FieldValue.serverTimestamp(),
      'status': 'success',
      'termsAcceptance': _termsAcceptanceRecord(),
    });

    final subRef = FirebaseFirestore.instance.collection('subscriptions').doc();
    batch.set(subRef, {
      'ownerId': firebaseUser.uid,
      'ownerPhone': user.phone,
      'ownerType': user.role == 'manufacturer' ? 'manufacturer' : 'retailer',
      // Snapshotted, so editing or deleting the plan later never changes
      // what this subscription says it was. Same fields the web writes.
      'planName': name,
      'planTier': tier,
      'planId': planId ?? _duration.key,
      'seatsPurchased': seatsToAdd,
      'durationMonths': _duration.months,
      'amountPaid': totalAmount,
      'currency': 'INR',
      'razorpayOrderId': razorpayOrderId,
      'razorpayPaymentId': razorpayPaymentId,
      'subscriptionStatus': 'active',
      // Promo attribution — written only when a gateway-verified code was used.
      // Absent field = no promo, matching the web write in app/firebase.ts.
      if (normalizedPromo.isNotEmpty) 'promoCode': normalizedPromo,
      'startDate': Timestamp.fromDate(now),
      'expiryDate': Timestamp.fromDate(expiry),
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
      // Which standard terms this subscription was sold under. Same shape the
      // web checkout writes (app/firebase.ts TermsAcceptance), so a query
      // across subscriptions does not have to care which client was used.
      'termsAcceptance': _termsAcceptanceRecord(),
    });

    await batch.commit();

    // Refresh the user state so changes propagate to dashboard and shell
    ref.invalidate(currentUserProvider);
    // Refresh seat counts so "X left · used/total" updates immediately.
    ref.invalidate(seatStatsProvider);

    setState(() => _loading = false);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Subscription activated!'),
          backgroundColor: AppColors.success,
        ),
      );
      // New sellers complete their shop profile before landing on the
      // dashboard; existing users buying more seats go straight back.
      context.go(
        widget.reason == 'new_account'
            ? '/profile/edit?reason=new_account'
            : '/dashboard',
      );
    }
  }

  /// Fires on both a genuine failure AND on the checkout SDK simply giving up
  /// waiting ("...could not complete it in time") — not the same thing as
  /// Razorpay not having captured the payment. Before telling the seller
  /// their purchase failed, this checks Razorpay's own records for the
  /// order; if it actually went through, the subscription is activated
  /// exactly as it would be on success instead of stranding a charged seller
  /// with no seats. See PaymentService.checkOrderStatus for the full story.
  void _onError(AppPaymentError r) async {
    final orderId = _razorpayOrderId;
    if (orderId == null) {
      setState(() {
        _loading = false;
        _error = r.message;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    final reconciliation = await PaymentService().checkOrderStatus(orderId);

    if (reconciliation.captured && reconciliation.paymentId != null) {
      final seatCount =
          (reconciliation.notes?['seatCount'] as num?)?.toInt() ?? _seats;
      // Same field /verify's amountPaid comes from (create-order stamps it
      // into the order's own notes at creation time) — without this, a
      // reconciled late-capture would fall back to the undiscounted full
      // price whenever a promo code had actually been applied at checkout.
      final amountCharged = (reconciliation.notes?['amountCharged'] as num?)
          ?.toInt();
      try {
        await _activateSubscription(
          razorpayOrderId: orderId,
          razorpayPaymentId: reconciliation.paymentId!,
          seatCount: seatCount,
          amountPaid: amountCharged,
          // Promo code from the order's server-set notes, same source as
          // seatCount — keeps attribution correct on the reconciliation path.
          promoCode: (reconciliation.notes?['promoCode'] as String?),
          planTier: reconciliation.notes?['planTier'] as String?,
          planName: reconciliation.notes?['planName'] as String?,
          planId: reconciliation.notes?['planId']?.toString(),
        );
        return; // _activateSubscription already navigated away on success.
      } catch (e) {
        if (mounted) {
          setState(() {
            _loading = false;
            _error = 'Payment verification or DB update failed: $e';
          });
        }
        return;
      }
    }

    // Log only a CONFIRMED failure so the admin's Failed Payments tab
    // reflects reality — never log when checkFailed is true, since that
    // means we genuinely don't know the outcome.
    if (!reconciliation.checkFailed) {
      unawaited(
        PaymentService().logFailedPayment(
          r.message,
          orderId: orderId,
          amount: _razorpayAmount,
          kind: 'subscription',
        ),
      );
    }

    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = reconciliation.checkFailed
          // We genuinely don't know the outcome — never tell a seller who
          // might have been charged that their payment definitely failed.
          ? 'We could not confirm your payment status. If any amount was '
                'deducted, it will be refunded automatically within 5-7 '
                'business days. Please check back before retrying, or '
                'contact support.'
          : r.message;
    });
  }

  Widget _noticeBanner({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTextStyles.bodyMedium.copyWith(
                    color: color,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(subtitle, style: AppTextStyles.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(currentUserProvider);
    final isPaid = userAsync.value?.isPaid ?? false;
    final totalPrice = _duration.totalPrice(_seats);
    final granted = _grantedSeats;
    // Evaluated against the current selection with the server's own rules,
    // and discounted with the server's own formula (applyDiscount), so the
    // figure shown here is exactly what Razorpay charges.
    final promoEval = _promoEval;
    final promoOk = promoEval?.applies ?? false;
    final promoError = _promoLookupError ?? promoEval?.error;
    final finalPrice = promoOk
        ? applyDiscount(totalPrice, promoEval!.discountPercent)
        : totalPrice;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text(
          'Subscription',
          style: AppTextStyles.heading2.copyWith(color: Colors.white),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (!isPaid && widget.reason == 'new_account')
            _noticeBanner(
              icon: Icons.celebration_outlined,
              color: AppColors.primary,
              title: 'Welcome to KrishiDukan! 🎉',
              subtitle:
                  'Your account is ready. Subscribe to unlock your dashboard, '
                  'list products and start selling.',
            ),
          if (!isPaid && widget.reason == 'paywall')
            _noticeBanner(
              icon: Icons.lock_outline,
              color: AppColors.warning,
              title: 'Subscription required',
              subtitle:
                  'The dashboard is locked until you have an active '
                  'subscription. Pick a plan below to continue.',
            ),
          // Renewal arrives while the subscription is still active, so this
          // banner is deliberately not gated on !isPaid the way the two above
          // are — the plan picker below is already preselected to their
          // current seats and duration.
          if (widget.reason == 'renewal')
            _noticeBanner(
              icon: Icons.hourglass_bottom_rounded,
              color: AppColors.warning,
              title: 'Renew your subscription',
              subtitle:
                  'Your current plan is selected below. Complete the payment '
                  'to keep your dashboard and listings live.',
            ),
          if (isPaid && widget.reason != 'renewal')
            Container(
              margin: const EdgeInsets.only(bottom: 20),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.success.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.verified, color: AppColors.success),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Active Subscription',
                          style: AppTextStyles.bodyMedium.copyWith(
                            color: AppColors.success,
                          ),
                        ),
                        Text(
                          'Your store is fully activated',
                          style: AppTextStyles.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          Text('Choose Your Plan', style: AppTextStyles.heading2),
          const SizedBox(height: 6),
          Text(
            _tier == PlanTier.standard
                ? 'A fixed plan for 100 products. Pick monthly or yearly.'
                : 'Pay per product. One seat = one product listing slot.',
            style: AppTextStyles.body.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 16),

          // ── Standard / Custom toggle ──────────────────────────────────────
          // Hidden when the admin has left plans in only one tier.
          if (_showToggle) ...[
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<PlanTier>(
                segments: const [
                  ButtonSegment(
                    value: PlanTier.standard,
                    label: Text('Standard'),
                    icon: Icon(Icons.workspace_premium_outlined, size: 18),
                  ),
                  ButtonSegment(
                    value: PlanTier.custom,
                    label: Text('Custom'),
                    icon: Icon(Icons.tune, size: 18),
                  ),
                ],
                selected: {_tier},
                showSelectedIcon: false,
                onSelectionChanged: (s) => _switchTier(s.first),
                style: SegmentedButton.styleFrom(
                  selectedBackgroundColor: AppColors.primary,
                  selectedForegroundColor: Colors.white,
                  foregroundColor: AppColors.onSurface,
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],

          if (_tier == PlanTier.standard) ...[
            // ── Standard plan cards ─────────────────────────────────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final p in _tierPlans) ...[
                  Expanded(
                    child: _StandardPlanCard(
                      plan: p,
                      selected: _duration.key == p.key,
                      onTap: () => setState(() => _duration = p),
                    ),
                  ),
                  if (p != _tierPlans.last) const SizedBox(width: 10),
                ],
              ],
            ),
            const SizedBox(height: 16),
          ] else ...[
            // ── Seat picker (per-listing plans only) ────────────────────────
            if (!_duration.isFlat) ...[
              _SectionCard(
                title: 'Number of Seats',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        IconButton(
                          onPressed: _seats > seatStep
                              ? () => _setSeats(_seats - seatStep)
                              : null,
                          icon: const Icon(Icons.remove_circle_outline),
                          color: AppColors.primary,
                        ),
                        // Typed entry — buying 100 seats used to mean 100 taps on +.
                        SizedBox(
                          width: 76,
                          child: TextField(
                            controller: _seatCtrl,
                            textAlign: TextAlign.center,
                            keyboardType: TextInputType.number,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(5),
                            ],
                            style: AppTextStyles.heading2,
                            decoration: const InputDecoration(
                              isDense: true,
                              contentPadding: EdgeInsets.symmetric(vertical: 8),
                            ),
                            // Snap to the 10-block rule only once editing ends, so
                            // the field stays freely editable while typing (an
                            // in-progress "1" of "100" must not jump to 10).
                            onChanged: (v) {
                              final n = int.tryParse(v);
                              if (n != null) {
                                setState(() => _seats = normalizeSeatCount(n));
                              }
                            },
                            onEditingComplete: () {
                              _setSeats(
                                int.tryParse(_seatCtrl.text) ?? seatStep,
                              );
                              FocusScope.of(context).unfocus();
                            },
                            onTapOutside: (_) {
                              _setSeats(
                                int.tryParse(_seatCtrl.text) ?? seatStep,
                              );
                              FocusScope.of(context).unfocus();
                            },
                          ),
                        ),
                        IconButton(
                          onPressed: () => _setSeats(_seats + seatStep),
                          icon: const Icon(Icons.add_circle_outline),
                          color: AppColors.primary,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '$_seats product listing slots',
                            style: AppTextStyles.body.copyWith(
                              color: AppColors.onSurfaceVariant,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        for (final n in seatPresets) ...[
                          Expanded(
                            child: ChoiceChip(
                              label: Text('$n seats'),
                              selected: _seats == n,
                              onSelected: (_) => _setSeats(n),
                            ),
                          ),
                          if (n != seatPresets.last) const SizedBox(width: 8),
                        ],
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Sold in blocks of $seatStep · minimum $seatStep seats',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // ── Duration picker (Custom plans) ────────────────────────────────
            _SectionCard(
              title: 'Duration',
              child: Column(
                children: _tierPlans.map((d) {
                  final selected = _duration.key == d.key;
                  return GestureDetector(
                    onTap: () => setState(() => _duration = d),
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppColors.primaryContainer.withValues(alpha: 0.3)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: selected
                              ? AppColors.primary
                              : AppColors.divider,
                          width: selected ? 2 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            selected
                                ? Icons.radio_button_checked
                                : Icons.radio_button_unchecked,
                            color: selected
                                ? AppColors.primary
                                : AppColors.onSurfaceVariant,
                            size: 18,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Row(
                              children: [
                                Text(d.label, style: AppTextStyles.bodyMedium),
                                if (d.badge != null) ...[
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppColors.secondary,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      d.badge!,
                                      style: AppTextStyles.caption.copyWith(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          Text(
                            CurrencyUtils.format(
                              d.totalPrice(_seats).toDouble(),
                            ),
                            style: AppTextStyles.price,
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 16),
          ],

          // ── Promo code ───────────────────────────────────────────────────
          _SectionCard(
            title: 'Promo Code',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _promoCtrl,
                        textCapitalization: TextCapitalization.characters,
                        inputFormatters: [
                          TextInputFormatter.withFunction(
                            (oldValue, newValue) => newValue.copyWith(
                              text: newValue.text.toUpperCase(),
                            ),
                          ),
                        ],
                        onChanged: _onPromoTextChanged,
                        decoration: InputDecoration(
                          hintText: 'Enter promo code',
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 12,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed:
                          (_promoLoading || _promoCtrl.text.trim().isEmpty)
                          ? null
                          : _applyPromo,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary.withValues(
                          alpha: 0.1,
                        ),
                        foregroundColor: AppColors.primary,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                      ),
                      child: _promoLoading
                          ? const SizedBox(
                              height: 16,
                              width: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.primary,
                              ),
                            )
                          : const Text('Apply'),
                    ),
                  ],
                ),
                if (promoOk) ...[
                  const SizedBox(height: 8),
                  Text(
                    '✓ ${formatPercent(promoEval!.discountPercent)} discount applied',
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                if (promoError != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    promoError,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.error,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── Price summary ─────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.2),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _duration.isStandard
                          ? 'Standard · $granted products · ${_duration.label}'
                          : _duration.isFlat
                          ? 'Up to ${_duration.includedListings} listings × ${_duration.label}'
                          : '$_seats seat${_seats != 1 ? 's' : ''} × ${_duration.label}',
                      style: AppTextStyles.bodySmall,
                    ),
                    if (promoOk)
                      Text(
                        CurrencyUtils.format(totalPrice.toDouble()),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.onSurfaceVariant,
                          decoration: TextDecoration.lineThrough,
                        ),
                      ),
                    Text(
                      CurrencyUtils.format(finalPrice.toDouble()),
                      style: AppTextStyles.priceLarge,
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _duration.isStandard
                          ? 'plan price'
                          : _duration.isFlat
                          ? 'bundle price'
                          : '₹${_duration.pricePerSeat}/seat',
                      style: AppTextStyles.caption,
                    ),
                    Text(
                      'one-time payment',
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── Features ──────────────────────────────────────────────────────
          _SectionCard(
            title: "What's included",
            child: Column(
              children:
                  [
                        'Inventory management',
                        'Real-time order tracking',
                        'Discount management',
                        'Delivery settings',
                        'Analytics dashboard',
                        'Customer order notifications',
                      ]
                      .map(
                        (f) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.check_circle,
                                color: AppColors.success,
                                size: 18,
                              ),
                              const SizedBox(width: 8),
                              Text(f, style: AppTextStyles.body),
                            ],
                          ),
                        ),
                      )
                      .toList(),
            ),
          ),
          const SizedBox(height: 8),

          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: AppColors.error.withValues(alpha: 0.3),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.error_outline,
                      color: AppColors.error,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _error!,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.error,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text.rich(
              TextSpan(
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.onSurfaceVariant,
                  height: 1.5,
                ),
                children: [
                  const TextSpan(
                    text: 'By proceeding, you agree to KrishiDukan’s ',
                  ),
                  TextSpan(
                    text: 'Terms & Conditions',
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                      decoration: TextDecoration.underline,
                      height: 1.5,
                    ),
                    recognizer: TapGestureRecognizer()
                      ..onTap = () => _openLegalDoc(_termsPath),
                  ),
                  const TextSpan(text: ' and '),
                  TextSpan(
                    text: 'Seller & Manufacturer Subscription Terms',
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                      decoration: TextDecoration.underline,
                      height: 1.5,
                    ),
                    recognizer: TapGestureRecognizer()
                      ..onTap = () => _openLegalDoc(_sellerTermsPath),
                  ),
                  const TextSpan(text: '.'),
                ],
              ),
              textAlign: TextAlign.center,
            ),
          ),

          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _loading ? null : _startPayment,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      'Pay ${CurrencyUtils.format(finalPrice.toDouble())} · Unlock $granted product${granted != 1 ? 's' : ''}',
                      style: AppTextStyles.button,
                    ),
            ),
          ),

          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.lock_outline,
                size: 12,
                color: AppColors.onSurfaceVariant,
              ),
              const SizedBox(width: 4),
              Text(
                'Secured by Razorpay',
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }
}

/// One Standard plan: period, price (with the struck "was" price when set)
/// and the fixed product count. Mirrors the web's Standard cards.
class _StandardPlanCard extends StatelessWidget {
  final SubscriptionPlan plan;
  final bool selected;
  final VoidCallback onTap;
  const _StandardPlanCard({
    required this.plan,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final price = plan.flatPrice ?? 0;
    final was = plan.compareAtPrice;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primaryContainer.withValues(alpha: 0.35)
              : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.divider,
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    plan.label,
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Icon(
                  selected
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                  size: 18,
                  color: selected
                      ? AppColors.primary
                      : AppColors.onSurfaceVariant,
                ),
              ],
            ),
            if (plan.badge != null) ...[
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.secondary,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  plan.badge!,
                  style: AppTextStyles.caption.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 8),
            if (was != null && was > price)
              Text(
                CurrencyUtils.format(was.toDouble()),
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.onSurfaceVariant,
                  decoration: TextDecoration.lineThrough,
                ),
              ),
            Text(
              CurrencyUtils.format(price.toDouble()),
              style: AppTextStyles.priceLarge,
            ),
            const SizedBox(height: 2),
            Text(
              '/ ${plan.includedListings} products'
              '${plan.months > 1 ? ' · ${CurrencyUtils.format((price / plan.months).roundToDouble())}/mo' : ''}',
              style: AppTextStyles.caption.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
