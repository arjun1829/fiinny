import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/payments/app_razorpay.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/providers/cart_provider.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/loading_overlay.dart';
import '../data/payment_service.dart';
import '../../orders/data/order_repository.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _pincodeCtrl = TextEditingController();

  late final AppRazorpay _razorpay;
  final _paymentService = PaymentService();
  final _orderRepo = OrderRepository();

  bool _isLoading = false;
  bool _prefilled = false;
  String? _error;
  String? _razorpayOrderId;

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
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _pincodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _proceedToPayment() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final items = ref.read(cartProvider);
      final user = FirebaseAuth.instance.currentUser!;
      final delivery = await ref.read(deliveryChargeProvider.future);
      final gst = ref.read(cartGstProvider);

      final result = await _paymentService.createCartOrder(
        items: items,
        userId: user.uid,
        clientDelivery: delivery.totalCharge,
        clientGst: gst,
      );

      // The Razorpay API returns the order ID in the 'id' field, not 'orderId'
      _razorpayOrderId = result['id'] as String?;
      final amount = (result['amount'] as num).toInt();
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
          'name': _nameCtrl.text.trim(),
        },
        'theme': {'color': '#2E7D32'},
      });

      setState(() => _isLoading = false);
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = 'Failed to initiate payment: $e';
      });
    }
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

      // Write orders to Firestore (one per seller)
      final items = ref.read(cartProvider);
      final user = FirebaseAuth.instance.currentUser!;
      final delivery = await ref.read(deliveryChargeProvider.future);

      await _orderRepo.createOrdersAfterPayment(
        items: items,
        customerName: _nameCtrl.text.trim(),
        customerPhone: user.phoneNumber ?? '',
        customerAddress: {
          'name': _nameCtrl.text.trim(),
          'phone': _phoneCtrl.text.trim(),
          'address': _addressCtrl.text.trim(),
          'city': _cityCtrl.text.trim(),
          'pincode': _pincodeCtrl.text.trim(),
        },
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
        deliveryChargesBySeller: delivery.bySellerCharge,
      );

      ref.read(cartProvider.notifier).clear();
      if (mounted) context.go('/orders');
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = 'Payment received but order creation failed. Contact support.';
        });
      }
    }
  }

  void _onPaymentError(AppPaymentError response) {
    setState(() {
      _isLoading = false;
      _error = response.message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartProvider);
    final subtotal = ref.watch(cartTotalProvider);
    final savings = ref.watch(cartSavingsProvider);
    final gst = ref.watch(cartGstProvider);
    final deliveryAsync = ref.watch(deliveryChargeProvider);

    // One-time prefill of the address form from the user's saved profile so
    // returning buyers don't retype what the app already knows.
    final profile = ref.watch(currentUserProvider).value;
    if (!_prefilled && profile != null) {
      _prefilled = true;
      if (_nameCtrl.text.isEmpty) _nameCtrl.text = profile.name;
      if (_addressCtrl.text.isEmpty) _addressCtrl.text = profile.address ?? '';
      if (_cityCtrl.text.isEmpty) _cityCtrl.text = profile.city ?? '';
      if (_pincodeCtrl.text.isEmpty) _pincodeCtrl.text = profile.pincode ?? '';
    }

    // While the delivery estimate loads, the grand total is unknown — the Pay
    // button stays disabled so the shown amount always equals the charge.
    final estimating = deliveryAsync.isLoading;
    final delivery = deliveryAsync.value;
    final deliveryCharge = delivery?.totalCharge ?? 0.0;
    final grandTotal = subtotal + deliveryCharge + gst;

    final appBar = AppBar(
      elevation: 0,
      backgroundColor: Colors.transparent,
      foregroundColor: Colors.white,
      flexibleSpace: Container(
        decoration: BoxDecoration(gradient: topBarGradient()),
      ),
      titleSpacing: 0,
      title: Text('Checkout',
          style: AppTextStyles.heading2.copyWith(color: Colors.white)),
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
                      _ItemTile(item: items[i]),
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
                    _field(_nameCtrl, 'Full Name', Icons.person_outline,
                        validator: _required),
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
                    _priceRow('Subtotal (MRP)', CurrencyUtils.format(subtotal)),
                    if (savings > 0)
                      _priceRow(
                        'Discount savings',
                        '− ${CurrencyUtils.format(savings)}',
                        valueColor: const Color(0xFF15803D),
                      ),
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
                    if (gst > 0)
                      _priceRow('Total GST', CurrencyUtils.format(gst)),
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
                  onPressed: (_isLoading || estimating)
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

  Widget _priceRow(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTextStyles.body),
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
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
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

class _ItemTile extends StatelessWidget {
  final CartItemModel item;
  const _ItemTile({required this.item});

  @override
  Widget build(BuildContext context) {
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
                    'Qty ${item.quantity} × ${CurrencyUtils.format(item.price)}',
                    style: AppTextStyles.caption
                        .copyWith(color: AppColors.onSurfaceVariant),
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
