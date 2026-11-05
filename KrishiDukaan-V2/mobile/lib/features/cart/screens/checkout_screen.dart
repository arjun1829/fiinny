import 'dart:async';

import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import '../data/server_priced_items.dart';
import '../../../core/payments/app_razorpay.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/indian_states.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/providers/cart_provider.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/services/address_locator.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/utils/delivery_utils.dart';
import '../../../core/widgets/address_pickers.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/loading_overlay.dart';
import '../data/payment_service.dart';
import '../../orders/data/order_repository.dart';
import '../../../core/services/app_review_service.dart';
import '../../../core/widgets/back_or_home_button.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  // First name and surname are both compulsory; joined as [_fullName] for
  // the order, Razorpay and messages (same `customerName` as before).
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _pincodeCtrl = TextEditingController();
  final _districtCtrl = TextEditingController();

  /// The delivery state — always an entry of [kIndianStates], because it
  /// decides a pan-India seller's in-state vs out-of-state delivery charge.
  /// Mirrored into [deliveryStateProvider] so every price on screen follows it.
  String? _state;

  /// Per-seller pricing the SERVER computed for the current payment attempt
  /// (create-cart-order's `sellerBreakdown`), keyed by seller. The order is
  /// written from these — the figures the customer was actually charged.
  Map<String, SellerPricing>? _serverPricing;

  /// The lines as the server priced them (create-cart-order's `items`).
  Object? _serverItems;

  late final AppRazorpay _razorpay;
  final _paymentService = PaymentService();
  final _orderRepo = OrderRepository();
  final _reviewService = AppReviewService();

  bool _isLoading = false;

  /// Cart lines that can't be delivered to the chosen state — a
  /// manufacturer's licence, a store's delivery coverage or a manufacturer's
  /// in-store-only lock — keyed by catalogId|sellerPhone, with the reason.
  /// From POST /api/cart/availability (the rules checkout enforces).
  Map<String, String> _areaWarnings = const {};
  int _areaCheckGen = 0;
  bool _prefilled = false;
  String? _error;
  String? _razorpayOrderId;
  /// Order amount in PAISE, kept so a failure can be logged with the value the
  /// admin Failed Payments card expects (it renders amount / 100).
  int? _razorpayAmount;

  @override
  void initState() {
    super.initState();
    _razorpay = AppRazorpay(
      onSuccess: _onPaymentSuccess,
      onError: _onPaymentError,
    );

    // Pre-fill phone from Firebase Auth
    final user = FirebaseAuth.instance.currentUser;
    if (user?.phoneNumber != null) {
      _phoneCtrl.text = user!.phoneNumber!.replaceAll('+91', '');
    }
  }

  @override
  void dispose() {
    _razorpay.clear();
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _phoneCtrl.dispose();
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _pincodeCtrl.dispose();
    _districtCtrl.dispose();
    super.dispose();
  }

  /// Sets the delivery state and lets the whole cart re-price for it.
  void _setState(String? value) {
    final changed = value != _state;
    setState(() => _state = value);
    if (changed) unawaited(_checkSellArea());
    // Off the build phase: a provider write must not happen while building.
    Future.microtask(() {
      if (mounted) ref.read(deliveryStateProvider.notifier).state = value ?? '';
    });
  }

  /// Fills the address form from a place or a GPS fix. Only fields the source
  /// actually knows are overwritten, so a partial result never blanks what the
  /// customer already typed.
  void _applyFields(AddressFields f) {
    setState(() {
      if (f.area.isNotEmpty) _addressCtrl.text = f.area;
      if (f.city.isNotEmpty) _cityCtrl.text = f.city;
      if (f.district.isNotEmpty) _districtCtrl.text = f.district;
      if (f.pincode.isNotEmpty) _pincodeCtrl.text = f.pincode;
    });
    if (f.state.isNotEmpty) _setState(f.state);
  }

  String get _fullName => '${_firstNameCtrl.text.trim()} ${_lastNameCtrl.text.trim()}'.trim();

  /// "Ramesh Kumar Patil" → first "Ramesh Kumar", surname "Patil".
  void _prefillName(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return;
    if (parts.length == 1) {
      _firstNameCtrl.text = parts.first;
      return;
    }
    _firstNameCtrl.text = parts.sublist(0, parts.length - 1).join(' ');
    _lastNameCtrl.text = parts.last;
  }

  /// The address exactly as written to the order and sent to the server.
  Map<String, dynamic> _addressMap() => {
        'name': _fullName,
        'phone': _phoneCtrl.text.trim(),
        'address': _addressCtrl.text.trim(),
        'city': _cityCtrl.text.trim(),
        if (_districtCtrl.text.trim().isNotEmpty)
          'district': _districtCtrl.text.trim(),
        if ((_state ?? '').isNotEmpty) 'state': _state,
        'pincode': _pincodeCtrl.text.trim(),
      };

  static String _areaKey(String catalogId, String sellerPhone) => '$catalogId|$sellerPhone';

  /// Asks the server which cart lines can't reach [_state]. Returns the
  /// warnings (also kept in state). Best-effort: a failure shows none —
  /// checkout still enforces the same rules.
  Future<Map<String, String>> _checkSellArea() async {
    final gen = ++_areaCheckGen;
    final state = (_state ?? '').trim();
    final items = ref.read(cartProvider);
    if (state.isEmpty || items.isEmpty) {
      if (mounted) setState(() => _areaWarnings = const {});
      return const {};
    }
    try {
      final res = await http
          .post(
            Uri.parse('${AppConfig.apiBaseUrl}/api/cart/availability'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'state': state,
              'items': [
                for (final i in items)
                  {'productId': i.catalogId, 'sellerId': i.sellerPhone, 'sellerPhone': i.sellerPhone},
              ],
            }),
          )
          .timeout(const Duration(seconds: 15));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final next = <String, String>{
        for (final r in (body['items'] as List? ?? const []).whereType<Map>())
          if (r['available'] == false && (r['message'] ?? '').toString().isNotEmpty)
            _areaKey('${r['productId']}', '${r['sellerId']}'): '${r['message']}',
      };
      if (mounted && gen == _areaCheckGen) setState(() => _areaWarnings = next);
      return next;
    } catch (_) {
      if (mounted && gen == _areaCheckGen) setState(() => _areaWarnings = const {});
      return const {};
    }
  }

  Future<void> _proceedToPayment() async {
    if (!_formKey.currentState!.validate()) return;

    // Re-check where these items can be delivered, for the state chosen now.
    final blocked = await _checkSellArea();
    if (blocked.isNotEmpty) {
      if (mounted) {
        setState(() => _error = blocked.length == 1
            ? "1 item can't be delivered to this address. Remove it or choose another store."
            : "${blocked.length} items can't be delivered to this address. Remove them or choose another store.");
      }
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final items = ref.read(cartProvider);
      final user = FirebaseAuth.instance.currentUser!;
      // Re-priced for the address state chosen NOW (not a stale estimate).
      final delivery = await ref.read(deliveryChargeProvider.future);
      final gstAdded = delivery.gstAdded;
      final expectedTotal =
          ref.read(cartTotalProvider) + gstAdded + delivery.totalCharge;

      final result = await _paymentService.createCartOrder(
        items: items,
        userId: user.uid,
        clientDelivery: delivery.totalCharge,
        clientGst: gstAdded,
        customerDeliveryState: _state,
        // Same values createOrdersAfterPayment writes later — sent now so
        // the server can rebuild the order if that later step never runs.
        customerName: _fullName,
        customerPhone: _phoneCtrl.text.trim(),
        customerAddress: _addressMap(),
        deliveryBySeller: delivery.bySellerCharge,
      );

      // The server's own per-seller pricing, when it sent it — what we are
      // about to charge, and what the order will be written from.
      _serverItems = result['items'];
      final rawBreakdown = result['sellerBreakdown'];
      _serverPricing = rawBreakdown is List
          ? {
              for (final e in rawBreakdown.whereType<Map>())
                SellerPricing.fromMap(e).sellerKey: SellerPricing.fromMap(e),
            }
          : null;

      // If the server's total differs from what this screen showed (a price,
      // GST or delivery setting changed, or a size was priced differently),
      // the customer confirms the real figure before Razorpay opens — never
      // a silent surprise on the payment sheet.
      final serverTotal = (result['amount'] as num).toInt() / 100;
      if ((serverTotal - expectedTotal).abs() > 1.0) {
        final ok = await _confirmChangedTotal(expectedTotal, serverTotal);
        if (!ok) {
          if (mounted) setState(() => _isLoading = false);
          return;
        }
      }

      // The Razorpay API returns the order ID in the 'id' field, not 'orderId'
      _razorpayOrderId = result['id'] as String?;
      final amount = (result['amount'] as num).toInt();
      _razorpayAmount = amount;
      // Use the key the backend used to create the order — prevents key-mismatch
      // errors when the server's RAZORPAY_KEY_ID differs from the app default.
      final razorpayKey = result['key_id'] as String? ?? AppConfig.razorpayKeyId;

      _razorpay.open({
        'key': razorpayKey,
        'order_id': _razorpayOrderId,
        'amount': amount,
        'name': 'KrishiDukan',
        'description': 'Order Payment',
        'prefill': {
          'contact': user.phoneNumber,
          'name': _fullName,
        },
        'theme': {'color': '#2E7D32'},
        // Seconds the checkout SDK waits before giving up and reporting
        // PAYMENT_ERROR on its own, independent of whether Razorpay actually
        // captures the payment. The SDK default (3 minutes) is tight for a
        // UPI collect request, which needs the customer to switch to their
        // bank/UPI app, approve, and switch back — on a slow connection that
        // alone can take longer than 3 minutes. Widening this reduces how
        // often the SDK gives up on a payment that goes on to succeed, but
        // does NOT fully close the gap — _onPaymentError still reconciles
        // against Razorpay directly for whatever slips through.
        'timeout': 300,
      });

      setState(() => _isLoading = false);
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = 'Failed to initiate payment: $e';
      });
    }
  }

  /// The server priced this order differently from the estimate on screen.
  /// Shows the real total and asks before any payment sheet opens.
  Future<bool> _confirmChangedTotal(double shown, double actual) async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Your total has changed'),
        content: Text(
          'Prices, GST or delivery were updated. The amount to pay is '
          '${CurrencyUtils.format(actual)} (it was showing '
          '${CurrencyUtils.format(shown)}).',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Pay ${CurrencyUtils.format(actual)}'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  void _onPaymentSuccess(AppPaymentSuccess response) async {
    setState(() => _isLoading = true);

    try {
      // Verify payment signature server-side
      final verified = await _paymentService.verifyPayment(
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
        razorpaySignature: response.signature,
      );

      if (!verified) throw Exception('Payment verification failed');

      await _completeOrder(
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = 'Payment received but order creation failed. Contact support.';
        });
      }
    }
  }

  /// Writes the order(s) to Firestore and navigates away, shared by the
  /// normal success callback and [_onPaymentError]'s reconciliation path —
  /// both end up with a confirmed order/payment id, just via different
  /// routes (a client-supplied signature vs. Razorpay's own server records).
  Future<void> _completeOrder({
    required String razorpayOrderId,
    required String razorpayPaymentId,
  }) async {
    final items = ref.read(cartProvider);
    final user = FirebaseAuth.instance.currentUser!;
    final delivery = await ref.read(deliveryChargeProvider.future);

    await _orderRepo.createOrdersAfterPayment(
      // Each line at the price the server charged, so the order matches it.
      items: withServerPrices(items, _serverItems),
      customerName: _fullName,
      customerPhone: user.phoneNumber ?? '',
      customerAddress: _addressMap(),
      razorpayOrderId: razorpayOrderId,
      razorpayPaymentId: razorpayPaymentId,
      // The server's figures when we have them (what was charged), else the
      // estimate this screen showed.
      pricingBySeller: _serverPricing ??
          {for (final sp in delivery.sellers) sp.sellerKey: sp},
      customerDeliveryState: _state,
    );

    ref.read(cartProvider.notifier).clear();
    // Fire-and-forget: never block navigation on the review prompt.
    unawaited(_reviewService.onOrderCompleted());
    if (mounted) context.go('/orders');
  }

  /// Fires on both a genuine failure AND on the checkout SDK simply giving up
  /// waiting ("...could not complete it in time") — which is not the same
  /// thing as Razorpay not having captured the payment. Before showing the
  /// customer a failure, this checks Razorpay's own records for the order;
  /// if the payment actually went through, the order is completed exactly as
  /// it would be on success instead of stranding a charged customer on a
  /// "Failed" screen. See PaymentService.checkOrderStatus for the full story.
  void _onPaymentError(AppPaymentError response) async {
    final orderId = _razorpayOrderId;
    if (orderId == null) {
      setState(() {
        _isLoading = false;
        _error = response.message;
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    final reconciliation = await _paymentService.checkOrderStatus(orderId);

    if (reconciliation.captured && reconciliation.paymentId != null) {
      try {
        await _completeOrder(
          razorpayOrderId: orderId,
          razorpayPaymentId: reconciliation.paymentId!,
        );
        return; // _completeOrder already navigated away on success.
      } catch (_) {
        if (mounted) {
          setState(() {
            _isLoading = false;
            _error =
                'Payment received but order creation failed. Contact support.';
          });
        }
        return;
      }
    }

    // Log only a CONFIRMED failure (Razorpay itself has no capture on record)
    // so the admin's Failed Payments tab reflects reality — never log when
    // checkFailed is true, since that means we genuinely don't know the
    // outcome and it may well have succeeded.
    if (!reconciliation.checkFailed) {
      unawaited(
        _paymentService.logFailedPayment(
          response.message,
          orderId: orderId,
          amount: _razorpayAmount,
          kind: 'cart',
        ),
      );
    }

    if (!mounted) return;
    setState(() {
      _isLoading = false;
      _error = reconciliation.checkFailed
          // We genuinely don't know the outcome — never tell a customer who
          // might have been charged that their payment definitely failed.
          ? 'We could not confirm your payment status. If any amount was '
              'deducted, it will be refunded automatically within 5-7 '
              'business days. Please check My Orders before retrying, or '
              'contact support.'
          : response.message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartProvider);
    final subtotal = ref.watch(cartTotalProvider);
    // Only lines still in the cart count (a removed item's warning is moot).
    final blockedHere = items
        .where((i) => _areaWarnings.containsKey(_areaKey(i.catalogId, i.sellerPhone)))
        .length;
    final savings = ref.watch(cartSavingsProvider);
    final gstIncluded = ref.watch(cartGstIncludedProvider);
    final deliveryAsync = ref.watch(deliveryChargeProvider);
    final mrpSubtotal =
        items.fold(0.0, (s, i) => s + i.originalPrice * i.quantity);

    // One-time prefill of the address form from the user's saved profile so
    // returning buyers don't retype what the app already knows.
    final profile = ref.watch(currentUserProvider).value;
    if (!_prefilled && profile != null) {
      _prefilled = true;
      if (_firstNameCtrl.text.isEmpty && _lastNameCtrl.text.isEmpty) _prefillName(profile.name);
      if (_addressCtrl.text.isEmpty) _addressCtrl.text = profile.address ?? '';
      if (_cityCtrl.text.isEmpty) _cityCtrl.text = profile.city ?? '';
      if (_pincodeCtrl.text.isEmpty) _pincodeCtrl.text = profile.pincode ?? '';
      // The saved state, matched onto the recognised list ("Orissa" → Odisha),
      // so returning buyers get the right delivery slab without picking again.
      final saved = matchIndianState(profile.state);
      if (_state == null && saved != null) _setState(saved);
    }

    // While the delivery estimate loads, the grand total is unknown — the Pay
    // button stays disabled so the shown amount always equals the charge.
    final estimating = deliveryAsync.isLoading;
    final delivery = deliveryAsync.value;
    final deliveryCharge = delivery?.totalCharge ?? 0.0;
    final gstAdded = delivery?.gstAdded ?? 0.0;
    // items + GST added on top + delivery: the figure the server will charge.
    final grandTotal = subtotal + deliveryCharge + gstAdded;

    // Was a custom AppBar with white text/icons (foregroundColor: Colors.white)
    // painted on topBarGradient() — which is this app's shared FROSTED WHITE
    // top-bar background (see app_top_bar.dart's doc comment), not a colored
    // brand bar. That made every icon/button in the app bar (back arrow,
    // title) invisible against the white background. AppTopBar is the same
    // gradient used correctly everywhere else in the app, with a dark
    // foreground that actually shows up on it.
    // Back always works, even when checkout was opened after login (go)
    // with nothing underneath.
    const appBar = AppTopBar(
      title: 'Checkout',
      leading: BackOrHomeButton(fallback: '/cart'),
    );

    if (items.isEmpty) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: appBar,
        body: EmptyState(
          title: 'Your cart is empty',
          subtitle: 'Add products from the marketplace to check out.',
          icon: Icons.shopping_cart_outlined,
          actionLabel: 'Browse Products',
          onAction: () => context.go('/marketplace'),
        ),
      );
    }

    return LoadingOverlay(
      isLoading: _isLoading,
      message: 'Processing...',
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: appBar,
        body: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // ── Order items ─────────────────────────────────────────────
              _SectionCard(
                icon: Icons.shopping_bag_outlined,
                title: 'Order Items',
                badge: '${items.length}',
                child: Column(
                  children: [
                    for (var i = 0; i < items.length; i++) ...[
                      if (i > 0) const Divider(height: 20),
                      _ItemTile(item: items[i], locked: _isLoading),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // ── Delivery address ────────────────────────────────────────
              _SectionCard(
                icon: Icons.location_on_outlined,
                title: 'Delivery Address',
                child: Column(
                  children: [
                    // Search or locate instead of typing a whole address —
                    // either one fills area, city, district, state, pincode.
                    AddressSearchField(onSelected: _applyFields),
                    const SizedBox(height: 10),
                    UseMyLocationButton(onLocated: _applyFields),
                    const Divider(height: 26),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: _field(_firstNameCtrl, 'First Name *', Icons.person_outline,
                              textCapitalization: TextCapitalization.words,
                              validator: (v) => (v == null || v.trim().isEmpty)
                                  ? 'Enter your first name'
                                  : null),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _field(_lastNameCtrl, 'Last Name *', Icons.badge_outlined,
                              textCapitalization: TextCapitalization.words,
                              validator: (v) => (v == null || v.trim().isEmpty)
                                  ? 'Enter your surname'
                                  : null),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _field(_phoneCtrl, 'Phone Number', Icons.phone_outlined,
                        keyboardType: TextInputType.phone,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(10),
                        ],
                        validator: _required),
                    const SizedBox(height: 12),
                    _field(_addressCtrl, 'Street Address', Icons.home_outlined,
                        maxLines: 2, validator: _required),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: _field(_cityCtrl, 'City', Icons.location_city,
                              validator: _required),
                        ),
                        const SizedBox(width: 12),
                        SizedBox(
                          width: 116,
                          child: _field(_pincodeCtrl, 'Pincode', Icons.pin,
                              keyboardType: TextInputType.number,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly,
                                LengthLimitingTextInputFormatter(6),
                              ],
                              validator: _required),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _field(_districtCtrl, 'District (optional)', Icons.map_outlined),
                    const SizedBox(height: 12),
                    // A dropdown, not free text: the state decides the
                    // delivery charge, so it must be a recognised name.
                    DropdownButtonFormField<String>(
                      initialValue: _state,
                      isExpanded: true,
                      menuMaxHeight: 340,
                      decoration: InputDecoration(
                        labelText: 'State',
                        prefixIcon: const Icon(Icons.flag_outlined, size: 20),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide.none,
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: AppColors.primary, width: 2),
                        ),
                        filled: true,
                        fillColor: AppColors.background,
                        isDense: true,
                      ),
                      items: [
                        for (final st in kIndianStates)
                          DropdownMenuItem(
                            value: st,
                            child: Text(st, overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: _setState,
                      validator: (v) => (v == null || v.isEmpty)
                          ? 'Select your state — delivery is priced by it'
                          : null,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // ── Price details ───────────────────────────────────────────
              _SectionCard(
                icon: Icons.receipt_long_outlined,
                title: 'Price Details',
                child: Column(
                  children: [
                    _priceRow('Subtotal (MRP)', CurrencyUtils.format(mrpSubtotal)),
                    if (savings > 0) ...[
                      _priceRow(
                        'Product discounts',
                        '− ${CurrencyUtils.format(savings)}',
                        valueColor: const Color(0xFF15803D),
                      ),
                      _priceRow('Discounted subtotal',
                          CurrencyUtils.format(subtotal)),
                    ],
                    if (estimating)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Delivery Charges',
                                style: AppTextStyles.body),
                            SizedBox(
                              width: 14,
                              height: 14,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ],
                        ),
                      )
                    else ...[
                      _priceRow(
                        'Delivery Charges',
                        deliveryCharge > 0
                            ? CurrencyUtils.format(deliveryCharge)
                            : 'FREE',
                        valueColor:
                            deliveryCharge == 0 ? AppColors.success : null,
                        badge: delivery?.slabType == null
                            ? null
                            : (delivery!.slabType == DeliveryType.inState
                                ? 'Within-State'
                                : 'Outside-State'),
                      ),
                      if ((_state ?? '').isNotEmpty)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Text(
                              'Deliver to: $_state',
                              style: AppTextStyles.caption
                                  .copyWith(color: Colors.black54),
                            ),
                          ),
                        ),
                      if ((delivery?.totalWeight ?? 0) > 0)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Text(
                              'Est. weight: ${delivery!.totalWeight.toStringAsFixed(2)} kg',
                              style: AppTextStyles.caption
                                  .copyWith(color: Colors.black54),
                            ),
                          ),
                        ),
                    ],
                    // Exclusive GST is a real charge on top of the prices.
                    if (gstAdded > 0)
                      _priceRow('GST', '+ ${CurrencyUtils.format(gstAdded)}'),
                    // Included GST is already in the prices — informational.
                    if (gstIncluded > 0)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Incl. GST (in price)',
                                style: AppTextStyles.caption
                                    .copyWith(color: Colors.black54)),
                            Text(CurrencyUtils.format(gstIncluded),
                                style: AppTextStyles.caption
                                    .copyWith(color: Colors.black54)),
                          ],
                        ),
                      ),
                    const Divider(height: 20),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Total Amount', style: AppTextStyles.heading3),
                        Text(
                          estimating ? '—' : CurrencyUtils.format(grandTotal),
                          style: AppTextStyles.priceLarge,
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Items that can't be delivered to the chosen state, and why.
              if (blockedHere > 0) ...[
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.error.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Not available for your address',
                          style: AppTextStyles.bodyMedium.copyWith(
                              color: AppColors.error, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      for (final i in items)
                        if (_areaWarnings[_areaKey(i.catalogId, i.sellerPhone)] case final msg?)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text('• ${i.catalogName}: $msg',
                                style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurface)),
                          ),
                      const SizedBox(height: 6),
                      Text('Remove these items or choose another store to continue.',
                          style: AppTextStyles.caption),
                    ],
                  ),
                ),
              ],

              if (_error != null) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.error.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: AppColors.error.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline,
                          color: AppColors.error, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(_error!,
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.error)),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.lock_outlined,
                      size: 14, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 4),
                  Text('100% secure payments · Razorpay',
                      style: AppTextStyles.caption),
                ],
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),

        // ── Sticky pay bar (same pattern as cart / product detail) ────────
        bottomNavigationBar: Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: 8,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Total payable',
                          style: AppTextStyles.bodySmall),
                      Text(
                        estimating ? '—' : CurrencyUtils.format(grandTotal),
                        style: AppTextStyles.priceLarge,
                      ),
                    ],
                  ),
                ),
                FilledButton.icon(
                  onPressed: (_isLoading || estimating || blockedHere > 0)
                      ? null
                      : _proceedToPayment,
                  icon: const Icon(Icons.lock_outlined, size: 18),
                  label: Text(
                    estimating ? 'Calculating…' : 'Pay Now',
                    style: AppTextStyles.button,
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    minimumSize: const Size(160, 50),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _priceRow(String label, String value,
      {Color? valueColor, String? badge}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label, style: AppTextStyles.body),
                if (badge != null) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                          color: AppColors.primary.withValues(alpha: 0.2)),
                    ),
                    child: Text(badge,
                        style: AppTextStyles.caption.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                            fontSize: 10)),
                  ),
                ],
              ],
            ),
          ),
          Text(
            value,
            style: AppTextStyles.bodyMedium.copyWith(
              color: valueColor,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label,
    IconData icon, {
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    int maxLines = 1,
    String? Function(String?)? validator,
    TextCapitalization textCapitalization = TextCapitalization.none,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      textCapitalization: textCapitalization,
      inputFormatters: inputFormatters,
      maxLines: maxLines,
      style: AppTextStyles.body,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        filled: true,
        fillColor: AppColors.background,
        isDense: true,
      ),
    );
  }

  String? _required(String? v) =>
      (v == null || v.trim().isEmpty) ? 'This field is required' : null;
}

// ── Section card: white rounded container with icon + title header ──────────

class _SectionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? badge;
  final Widget child;

  const _SectionCard({
    required this.icon,
    required this.title,
    required this.child,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 18, color: AppColors.primary),
              ),
              const SizedBox(width: 10),
              Text(title, style: AppTextStyles.heading3),
              if (badge != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    badge!,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

// ── Order item tile: thumbnail + name + qty/variant + line total ────────────

class _ItemTile extends ConsumerWidget {
  final CartItemModel item;

  /// True while a payment is being started — the cart must not change under it.
  final bool locked;
  const _ItemTile({required this.item, this.locked = false});

  /// Asks first. Removing the LAST product would leave an empty checkout, so
  /// that case says so and returns the buyer to the cart instead.
  Future<void> _confirmRemove(BuildContext context, WidgetRef ref) async {
    final isLast = ref.read(cartProvider).length <= 1;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove product?'),
        content: Text(
          isLast
              ? '${item.catalogName} is the only product in your order. '
                  'Removing it empties your cart.'
              : 'Remove ${item.catalogName} from this order?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Keep'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    ref.read(cartProvider.notifier).removeItem(item.listingId, item.variantLabel);
    if (isLast) {
      context.go('/cart');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${item.catalogName} removed')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(
            width: 52,
            height: 52,
            child: item.catalogImage != null && item.catalogImage!.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: item.catalogImage!,
                    fit: BoxFit.cover,
                    memCacheWidth: 150,
                    placeholder: (_, _) => _placeholder(),
                    errorWidget: (_, _, _) => _placeholder(),
                  )
                : _placeholder(),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.catalogName,
                style: AppTextStyles.bodyMedium
                    .copyWith(fontWeight: FontWeight.w700),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 3),
              Wrap(
                spacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (item.variantLabel != null &&
                      item.variantLabel!.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppColors.background,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: AppColors.divider),
                      ),
                      child: Text(item.variantLabel!,
                          style: AppTextStyles.caption),
                    ),
                  Text(
                    '× ${CurrencyUtils.format(item.price)}',
                    style: AppTextStyles.caption
                        .copyWith(color: AppColors.onSurfaceVariant),
                  ),
                  if (item.freeDelivery)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: const Color(0xFF15803D).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('Free Delivery',
                          style: AppTextStyles.caption.copyWith(
                              color: const Color(0xFF15803D),
                              fontWeight: FontWeight.w700)),
                    ),
                ],
              ),
              Text(
                item.sellerName,
                style: AppTextStyles.caption
                    .copyWith(color: AppColors.onSurfaceVariant),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 6),
              // Quantity is adjustable here as well as in the cart. Every
              // total on this screen (subtotal, savings, GST, delivery) is
              // derived from cartProvider, so they all recompute on change —
              // nothing needs recalculating by hand.
              // Wraps on narrow phones rather than overflowing the line.
              Wrap(
                spacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _CheckoutQtyControl(item: item),
                  TextButton.icon(
                    onPressed: locked ? null : () => _confirmRemove(context, ref),
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('Remove'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.error,
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(CurrencyUtils.format(item.lineTotal),
                style: AppTextStyles.price),
            if (item.hasDiscount)
              Text(
                CurrencyUtils.format(item.originalPrice * item.quantity),
                style: AppTextStyles.caption.copyWith(
                  decoration: TextDecoration.lineThrough,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _placeholder() => Container(
        color: AppColors.primaryContainer.withValues(alpha: 0.3),
        child: const Icon(Icons.grass, color: AppColors.primary, size: 24),
      );
}

/// Compact +/- stepper for a checkout line.
///
/// Stops at 1 rather than removing the line: removal is the explicit Remove
/// button beside it (_ItemTile._confirmRemove), which asks first and handles
/// the last product.
class _CheckoutQtyControl extends ConsumerWidget {
  final CartItemModel item;
  const _CheckoutQtyControl({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final atMinimum = item.quantity <= 1;

    void setQty(int qty) => ref
        .read(cartProvider.notifier)
        .updateQuantity(item.listingId, item.variantLabel, qty);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.divider),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: const Icon(Icons.remove, size: 16),
            color: atMinimum ? AppColors.onSurfaceVariant : AppColors.primary,
            padding: const EdgeInsets.all(4),
            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
            visualDensity: VisualDensity.compact,
            tooltip: atMinimum ? 'Use Remove to take it out' : 'Reduce quantity',
            onPressed: atMinimum ? null : () => setQty(item.quantity - 1),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Text(
              '${item.quantity}',
              style: AppTextStyles.bodyMedium
                  .copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.add, size: 16),
            color: AppColors.primary,
            padding: const EdgeInsets.all(4),
            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
            visualDensity: VisualDensity.compact,
            tooltip: 'Increase quantity',
            onPressed: () => setQty(item.quantity + 1),
          ),
        ],
      ),
    );
  }
}
