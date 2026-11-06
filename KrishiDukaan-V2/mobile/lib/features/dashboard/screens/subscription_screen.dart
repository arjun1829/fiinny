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
import '../data/referral_service.dart';
import '../data/subscription_pricing.dart';
import '../providers/dashboard_provider.dart';
import '../../../core/widgets/back_or_home_button.dart';

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

/// Plans of one tab in display order — Standard longest period first (Yearly
/// left, Monthly right), Custom short to long. Defaults always pick the FIRST
/// card shown, so the preselected plan is the one on the left. Mirrors the
/// web's tierInDisplayOrder.
List<SubscriptionPlan> _inDisplayOrder(
  List<SubscriptionPlan> plans,
  PlanTier tier,
) => plans.where((p) => p.tier == tier).toList()
  ..sort(
    (a, b) => tier == PlanTier.standard
        ? b.months.compareTo(a.months)
        : a.months.compareTo(b.months),
  );

class SubscriptionScreen extends ConsumerStatefulWidget {
  /// 'new_account' → just signed up; 'paywall' → bounced off the dashboard;
  /// 'renewal' → opened from a subscription_expiry notification.
  final String? reason;

  /// Seats and plan length from the user's expiring subscription, passed by a
  /// subscription_expiry notification so renewal comes up pre-configured and
  /// the user only has to pay. Null when the screen is opened any other way.
  final int? initialSeats;
  final int? initialMonths;

  /// Sales / marketing referral link (krishidukan.com/subscribe?ref=…):
  /// the code to apply, and optionally the offer's plan (a ladder key — only
  /// honoured if that exact plan is currently offered) with seats in
  /// [initialSeats].
  final String? referralCode;
  final String? offerPlanId;
  final bool fromReferralLink;

  const SubscriptionScreen({
    super.key,
    this.reason,
    this.initialSeats,
    this.initialMonths,
    this.referralCode,
    this.offerPlanId,
    this.fromReferralLink = false,
  });

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {
  late final AppRazorpay _razorpay;
  int _seats = seatStep;
  late final TextEditingController _seatCtrl;
  List<SubscriptionPlan> _plans = defaultSubscriptionPlans;
  // Standard is the default tab; the first card shown (Yearly) is preselected.
  PlanTier _tier = PlanTier.standard;
  SubscriptionPlan _duration =
      _inDisplayOrder(
        defaultSubscriptionPlans,
        PlanTier.standard,
      ).firstOrNull ??
      defaultSubscriptionPlans.first;
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

  /// Referral — only a server-validated code is shown as applied or sent.
  final _referralCtrl = TextEditingController();
  String? _referralCode;
  String? _referralOwner;
  String? _referralError;
  bool _referralChecking = false;

  /// Set when an offer link's plan is no longer on the ladder.
  String? _offerNote;
  bool _offerResolved = false;

  /// Per-sale charges, read from settings/route (display only). No numeric
  /// fallback: if the read fails the note is shown without figures rather than
  /// quoting a rate that may not be the live one. Mirrors the web upgrade page.
  double? _commissionPct;
  double? _gatewayPct;

  /// "Have a promo or referral code?" disclosure; also opens by itself when a
  /// code is already in play (e.g. a rep's referral link).
  bool _codesOpen = false;

  Future<void> _loadFeeRates() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('settings')
          .doc('route')
          .get();
      final d = snap.data();
      final c = (d?['commissionPercent'] as num?)?.toDouble();
      final g = (d?['gatewayFeePercent'] as num?)?.toDouble();
      if (!mounted || c == null || g == null) return;
      setState(() {
        _commissionPct = c;
        _gatewayPct = g;
      });
    } catch (_) {
      /* keep the figure-free note */
    }
  }

  static String _pct(double v) =>
      v == v.roundToDouble() ? '${v.round()}%' : '$v%';

  /// Tab names. The 100-product pack's size comes from the plan itself.
  String _tierLabel(PlanTier t) {
    if (t == PlanTier.standard) {
      final size = _plans
          .where((p) => p.isStandard)
          .map((p) => p.includedListings)
          .whereType<int>()
          .firstOrNull;
      return size != null ? '$size-product pack' : 'Standard pack';
    }
    return 'Pay per product';
  }

  String _tierHint(PlanTier t) => t == PlanTier.standard
      ? 'Fixed price, best for big catalogues'
      : 'Choose exactly how many';

  /// A pack of the same length that covers this many products for less than
  /// the per-product price. Offered as a one-tap switch; nothing changes
  /// unless the seller taps it.
  SubscriptionPlan? get _cheaperPack {
    if (_tier != PlanTier.custom || _duration.isFlat) return null;
    final base = _duration.totalPrice(_seats);
    for (final o in _plans) {
      final listings = o.includedListings;
      if (o.isStandard &&
          o.months == _duration.months &&
          o.flatPrice != null &&
          listings != null &&
          _seats <= listings &&
          o.flatPrice! < base) {
        return o;
      }
    }
    return null;
  }

  Widget _cheaperPackBanner(SubscriptionPlan pack) {
    final save = _duration.totalPrice(_seats) - pack.flatPrice!;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => setState(() {
        _tier = PlanTier.standard;
        _duration = pack;
      }),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.primaryContainer.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                'Save ${CurrencyUtils.format(save.toDouble())}: the ${_tierLabel(PlanTier.standard)} '
                '(${pack.label}) gives you up to ${pack.includedListings} products for '
                '${CurrencyUtils.format(pack.flatPrice!.toDouble())}.',
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                'Switch',
                style: AppTextStyles.caption.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Rupees per month for a plan at the chosen product count (display only).
  int _monthlyFor(SubscriptionPlan p) =>
      (p.totalPrice(_seats) / p.months).round();

  Widget _stepHeader(int n, String title) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      children: [
        Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.primary,
            shape: BoxShape.circle,
          ),
          child: Text(
            '$n',
            style: AppTextStyles.caption.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(title, style: AppTextStyles.heading3),
      ],
    ),
  );

  bool get _hasTier => _plans.any((p) => p.tier == _tier);
  bool get _showToggle =>
      _plans.any((p) => p.isStandard) && _plans.any((p) => !p.isStandard);
  // Standard cards run longest period first (Yearly left, Monthly right),
  // matching the web; Custom keeps its short-to-long order.
  List<SubscriptionPlan> get _tierPlans => _inDisplayOrder(_plans, _tier);
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
    final first = _inDisplayOrder(_plans, next);
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
    _loadFeeRates();

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

    // An offer link's plan, against the built-in ladder for now; re-checked
    // against the live ladder once it loads (_resolveOffer).
    _applyOffer(_plans);

    final code = widget.referralCode;
    if (code != null && code.trim().isNotEmpty) {
      _referralCtrl.text = ReferralService.normalize(code);
      if (widget.fromReferralLink) {
        ReferralService.logEvent(
          code,
          'open',
          uid: FirebaseAuth.instance.currentUser?.uid,
          plan: widget.offerPlanId,
        );
      }
      _applyReferral();
    }

    _loadPlans();
  }

  /// Selects the offer link's plan if it is on [plans]. Seats only matter for
  /// a per-listing Custom plan and are snapped to the 10-block rule, so a link
  /// can never produce a quantity that isn't sold.
  bool _applyOffer(List<SubscriptionPlan> plans) {
    final id = widget.offerPlanId;
    if (id == null || id.isEmpty) return false;
    final match = plans.where((p) => p.key == id);
    if (match.isEmpty) return false;
    _duration = match.first;
    _tier = match.first.tier;
    final seats = widget.initialSeats;
    if (!_duration.isStandard &&
        !_duration.isFlat &&
        seats != null &&
        seats > 0) {
      _seats = normalizeSeatCount(seats);
      _seatCtrl.text = '$_seats';
    }
    return true;
  }

  /// Once the live ladder is known (or known to be absent): honour the offer
  /// if its plan is really offered, otherwise say so and let them choose.
  void _resolveOffer() {
    if (_offerResolved || !mounted) return;
    _offerResolved = true;
    final id = widget.offerPlanId;
    if (id == null || id.isEmpty) return;
    setState(() {
      if (!_applyOffer(_plans)) {
        _offerNote =
            'The plan in your link is no longer offered — please choose a plan below.';
      }
    });
  }

  Future<void> _applyReferral() async {
    final raw = _referralCtrl.text;
    if (raw.trim().isEmpty) return;
    setState(() {
      _referralChecking = true;
      _referralError = null;
    });
    final r = await ReferralService.validate(raw);
    if (!mounted) return;
    setState(() {
      _referralChecking = false;
      if (r.valid) {
        _referralCode = r.code;
        _referralOwner = r.ownerName;
      } else {
        _referralCode = null;
        _referralOwner = null;
        _referralError = r.error;
      }
    });
    if (r.valid) {
      ReferralService.logEvent(
        r.code!,
        'checkout_view',
        uid: FirebaseAuth.instance.currentUser?.uid,
        plan: widget.offerPlanId,
      );
    }
  }

  void _removeReferral() {
    setState(() {
      _referralCode = null;
      _referralOwner = null;
      _referralError = null;
      _referralCtrl.clear();
    });
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
      // account's role isn't allowed to buy. A consumer buys as a retailer —
      // paying upgrades them (same rule as create-order).
      final rawRole = ref.read(currentUserProvider).value?.role;
      final role = rawRole == 'consumer' || rawRole == 'customer'
          ? 'retailer'
          : rawRole;
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
          orElse: () => renewal ?? _inDisplayOrder(parsed, _tier).first,
        );
        _tier = _duration.tier;
      });
    } catch (_) {
      /* unreachable settings doc keeps the built-in ladder */
    } finally {
      _resolveOffer();
    }
  }

  @override
  void dispose() {
    _razorpay.clear();
    _seatCtrl.dispose();
    _promoCtrl.dispose();
    _referralCtrl.dispose();
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
              // Server-validated above; create-order re-checks it too.
              'referralCode': _referralCode,
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
        referralCode: verifyData['referralCode'] as String?,
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

    /// From the order notes — create-order only stamps a validated code.
    String? referralCode,
  }) async {
    final refCode = (referralCode ?? '').trim().toUpperCase();
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
    final roleUpdate = user.role == 'consumer' || user.role == 'customer'
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
      if (refCode.isNotEmpty) 'referralCode': refCode,
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
      // Sales attribution — only when a validated code was used at checkout.
      if (refCode.isNotEmpty) 'referralCode': refCode,
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
          referralCode: reconciliation.notes?['referralCode']?.toString(),
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
        // New sellers and referral links land here with nothing underneath.
        leading: const BackOrHomeButton(fallback: '/profile'),
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

          _stepHeader(1, 'Choose your plan'),

          // ── Standard / Custom toggle ──────────────────────────────────────
          // Hidden when the admin has left plans in only one tier.
          if (_offerNote != null)
            _noticeBanner(
              icon: Icons.info_outline,
              color: AppColors.warning,
              title: 'Offer changed',
              subtitle: _offerNote!,
            ),
          if (_showToggle) ...[
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<PlanTier>(
                segments: [
                  ButtonSegment(
                    value: PlanTier.standard,
                    label: Text(
                      _tierLabel(PlanTier.standard),
                      textAlign: TextAlign.center,
                    ),
                    icon: const Icon(
                      Icons.workspace_premium_outlined,
                      size: 18,
                    ),
                  ),
                  ButtonSegment(
                    value: PlanTier.custom,
                    label: Text(
                      _tierLabel(PlanTier.custom),
                      textAlign: TextAlign.center,
                    ),
                    icon: const Icon(Icons.tune, size: 18),
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
            const SizedBox(height: 6),
            Text(
              _tierHint(_tier),
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 14),
          ],

          if (_tier == PlanTier.standard) ...[
            // ── Standard plan cards ─────────────────────────────────────────
            // Same height side by side: Yearly carries a badge and a struck
            // price Monthly doesn't, so top-aligned cards came out uneven.
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
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
            ),
            const SizedBox(height: 16),
          ] else ...[
            // ── Duration cards (Custom plans) ───────────────────────────────
            // Each card shows what the chosen number of products costs per
            // month, plus the per-product monthly rate (display only).
            ..._tierPlans.map((d) {
              final selected = _duration.key == d.key;
              final perMonth = _monthlyFor(d);
              return GestureDetector(
                onTap: () => setState(() => _duration = d),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: selected
                        ? AppColors.primaryContainer.withValues(alpha: 0.3)
                        : Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selected ? AppColors.primary : AppColors.divider,
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
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  d.label,
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
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
                            const SizedBox(height: 2),
                            Text(
                              d.isFlat
                                  ? 'Up to ${d.includedListings} products'
                                  : '₹${(d.pricePerSeat / d.months).round()} per product / month',
                              style: AppTextStyles.caption.copyWith(
                                color: AppColors.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '${CurrencyUtils.format(perMonth.toDouble())}/month',
                            style: AppTextStyles.price,
                          ),
                          if (d.months > 1)
                            Text(
                              '${CurrencyUtils.format(d.totalPrice(_seats).toDouble())} total',
                              style: AppTextStyles.caption.copyWith(
                                color: AppColors.onSurfaceVariant,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 6),

            // ── Seat picker (per-listing plans only) ────────────────────────
            if (!_duration.isFlat) ...[
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _stepHeader(2, 'How many products'),
                  _SectionCard(
                    title: 'Products to list',
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
                                  contentPadding: EdgeInsets.symmetric(
                                    vertical: 8,
                                  ),
                                ),
                                // Snap to the 10-block rule only once editing ends, so
                                // the field stays freely editable while typing (an
                                // in-progress "1" of "100" must not jump to 10).
                                onChanged: (v) {
                                  final n = int.tryParse(v);
                                  if (n != null) {
                                    setState(
                                      () => _seats = normalizeSeatCount(n),
                                    );
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
                                '$_seats products',
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
                                  label: Text('$n'),
                                  selected: _seats == n,
                                  onSelected: (_) => _setSeats(n),
                                ),
                              ),
                              if (n != seatPresets.last)
                                const SizedBox(width: 8),
                            ],
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Minimum $seatStep products, in blocks of $seatStep',
                          style: AppTextStyles.bodySmall.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (_cheaperPack != null) ...[
                _cheaperPackBanner(_cheaperPack!),
                const SizedBox(height: 16),
              ] else
                const SizedBox(height: 6),
            ],
          ],

          // ── Promo + referral codes, folded away until needed ─────────────
          Builder(
            builder: (context) {
              final codesShown =
                  _codesOpen ||
                  _referralCode != null ||
                  _referralError != null ||
                  _promoDoc != null ||
                  _promoLookupError != null ||
                  _promoCtrl.text.trim().isNotEmpty;
              return Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.divider),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => setState(() => _codesOpen = !codesShown),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.sell_outlined,
                              size: 18,
                              color: AppColors.primary,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Have a promo or referral code?',
                                style: AppTextStyles.bodyMedium.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            if (promoOk || _referralCode != null)
                              Container(
                                margin: const EdgeInsets.only(right: 8),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(
                                    alpha: 0.1,
                                  ),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  'Applied',
                                  style: AppTextStyles.caption.copyWith(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            Icon(
                              codesShown
                                  ? Icons.expand_less
                                  : Icons.expand_more,
                              color: AppColors.onSurfaceVariant,
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (codesShown)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                        child: Column(
                          children: [
                            _SectionCard(
                              title: 'Promo code',
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Expanded(
                                        child: TextField(
                                          controller: _promoCtrl,
                                          textCapitalization:
                                              TextCapitalization.characters,
                                          inputFormatters: [
                                            TextInputFormatter.withFunction(
                                              (oldValue, newValue) =>
                                                  newValue.copyWith(
                                                    text: newValue.text
                                                        .toUpperCase(),
                                                  ),
                                            ),
                                          ],
                                          onChanged: _onPromoTextChanged,
                                          decoration: InputDecoration(
                                            hintText: 'Enter promo code',
                                            isDense: true,
                                            contentPadding:
                                                const EdgeInsets.symmetric(
                                                  horizontal: 12,
                                                  vertical: 12,
                                                ),
                                            border: OutlineInputBorder(
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      FilledButton(
                                        onPressed:
                                            (_promoLoading ||
                                                _promoCtrl.text.trim().isEmpty)
                                            ? null
                                            : _applyPromo,
                                        style: FilledButton.styleFrom(
                                          backgroundColor: AppColors.primary
                                              .withValues(alpha: 0.1),
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
                                                child:
                                                    CircularProgressIndicator(
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
                            const SizedBox(height: 12),
                            _SectionCard(
                              title: 'Referral code (optional)',
                              child: _referralCode != null
                                  ? Row(
                                      children: [
                                        const Icon(
                                          Icons.verified,
                                          color: AppColors.primary,
                                          size: 18,
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            '$_referralCode'
                                            '${(_referralOwner ?? '').isNotEmpty ? ' · Referred by $_referralOwner' : ''}',
                                            style: AppTextStyles.bodyMedium
                                                .copyWith(
                                                  color: AppColors.primary,
                                                  fontWeight: FontWeight.w700,
                                                ),
                                          ),
                                        ),
                                        TextButton(
                                          onPressed: _removeReferral,
                                          child: const Text('Remove'),
                                        ),
                                      ],
                                    )
                                  : Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Expanded(
                                              child: TextField(
                                                controller: _referralCtrl,
                                                textCapitalization:
                                                    TextCapitalization
                                                        .characters,
                                                inputFormatters: [
                                                  LengthLimitingTextInputFormatter(
                                                    20,
                                                  ),
                                                  TextInputFormatter.withFunction(
                                                    (oldValue, newValue) =>
                                                        newValue.copyWith(
                                                          text: newValue.text
                                                              .toUpperCase()
                                                              .replaceAll(
                                                                RegExp(
                                                                  r'[^A-Z0-9]',
                                                                ),
                                                                '',
                                                              ),
                                                        ),
                                                  ),
                                                ],
                                                onChanged: (_) => setState(
                                                  () => _referralError = null,
                                                ),
                                                decoration: InputDecoration(
                                                  hintText:
                                                      'Code from your KrishiDukan representative',
                                                  isDense: true,
                                                  contentPadding:
                                                      const EdgeInsets.symmetric(
                                                        horizontal: 12,
                                                        vertical: 12,
                                                      ),
                                                  border: OutlineInputBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          10,
                                                        ),
                                                  ),
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 8),
                                            FilledButton(
                                              onPressed:
                                                  (_referralChecking ||
                                                      _referralCtrl.text
                                                          .trim()
                                                          .isEmpty)
                                                  ? null
                                                  : _applyReferral,
                                              style: FilledButton.styleFrom(
                                                backgroundColor: AppColors
                                                    .primary
                                                    .withValues(alpha: 0.1),
                                                foregroundColor:
                                                    AppColors.primary,
                                                elevation: 0,
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      horizontal: 16,
                                                      vertical: 14,
                                                    ),
                                              ),
                                              child: _referralChecking
                                                  ? const SizedBox(
                                                      height: 16,
                                                      width: 16,
                                                      child:
                                                          CircularProgressIndicator(
                                                            strokeWidth: 2,
                                                            color: AppColors
                                                                .primary,
                                                          ),
                                                    )
                                                  : const Text('Apply'),
                                            ),
                                          ],
                                        ),
                                        if (_referralError != null) ...[
                                          const SizedBox(height: 8),
                                          Text(
                                            _referralError!,
                                            style: AppTextStyles.bodySmall
                                                .copyWith(
                                                  color: AppColors.error,
                                                ),
                                          ),
                                        ],
                                      ],
                                    ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 16),

          // ── Order summary ─────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ORDER SUMMARY',
                  style: AppTextStyles.caption.copyWith(
                    color: Colors.white70,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        _duration.isStandard
                            ? '${_tierLabel(PlanTier.standard)} · ${_duration.label}'
                            : _duration.isFlat
                            ? 'Up to ${_duration.includedListings} products · ${_duration.label}'
                            : '$_seats products × ₹${_duration.pricePerSeat} · ${_duration.label}',
                        style: AppTextStyles.body.copyWith(
                          color: Colors.white70,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      CurrencyUtils.format(totalPrice.toDouble()),
                      style: AppTextStyles.bodyMedium.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
                if (promoOk) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Promo ${promoEval?.code ?? ''} (−${formatPercent(promoEval!.discountPercent)})',
                          style: AppTextStyles.body.copyWith(
                            color: Colors.yellow.shade300,
                          ),
                        ),
                      ),
                      Text(
                        '−${CurrencyUtils.format((totalPrice - finalPrice).toDouble())}',
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: Colors.yellow.shade300,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ],
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Divider(height: 1, color: Colors.white24),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Total',
                            style: AppTextStyles.bodyMedium.copyWith(
                              color: Colors.white70,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          if (_duration.months > 1)
                            Text(
                              '≈ ${CurrencyUtils.format((finalPrice / _duration.months).roundToDouble())} per month',
                              style: AppTextStyles.caption.copyWith(
                                color: Colors.white70,
                              ),
                            ),
                        ],
                      ),
                    ),
                    Text(
                      CurrencyUtils.format(finalPrice.toDouble()),
                      style: AppTextStyles.priceLarge.copyWith(
                        color: Colors.yellow.shade300,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

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
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.surfaceVariant,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              (_commissionPct != null && _gatewayPct != null
                      ? 'When farmers pay you online, a ${_pct(_commissionPct!)} platform fee and '
                            'payment gateway charges (currently about ${_pct(_gatewayPct!)}) apply per sale.'
                      : 'When farmers pay you online, a platform fee and payment gateway charges '
                            'apply per sale, as set out in the Seller Terms.') +
                  ' Nothing on cash or offline sales.',
              textAlign: TextAlign.center,
              style: AppTextStyles.caption.copyWith(
                color: AppColors.onSurfaceVariant,
                height: 1.5,
              ),
            ),
          ),
          const SizedBox(height: 20),

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
