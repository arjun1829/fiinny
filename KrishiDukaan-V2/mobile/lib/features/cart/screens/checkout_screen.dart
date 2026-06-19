import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/payments/app_razorpay.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/cart_provider.dart';
import '../../../core/utils/currency_utils.dart';
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

      final result = await _paymentService.createCartOrder(
        items: items,
        userId: user.uid,
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
        'name': 'KrishiDukaan',
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
    final total = ref.watch(cartTotalProvider);

    return LoadingOverlay(
      isLoading: _isLoading,
      message: 'Processing...',
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          title: Text('Checkout',
              style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Delivery Address', style: AppTextStyles.heading3),
                const SizedBox(height: 16),

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
                      width: 120,
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

                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(_error!,
                        style: AppTextStyles.bodySmall
                            .copyWith(color: AppColors.error)),
                  ),
                ],

                const SizedBox(height: 24),
                Text('Order Summary', style: AppTextStyles.heading3),
                const SizedBox(height: 12),
                ...items.map((item) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${item.catalogName} × ${item.quantity}',
                              style: AppTextStyles.body,
                            ),
                          ),
                          Text(
                            CurrencyUtils.format(item.lineTotal),
                            style: AppTextStyles.bodyMedium,
                          ),
                        ],
                      ),
                    )),
                const Divider(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Total', style: AppTextStyles.heading3),
                    Text(CurrencyUtils.format(total),
                        style: AppTextStyles.priceLarge),
                  ],
                ),

                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: _isLoading ? null : _proceedToPayment,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text(
                      'Pay ${CurrencyUtils.format(total)}',
                      style: AppTextStyles.button,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Center(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.lock_outlined,
                          size: 14, color: AppColors.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Text('Secured by Razorpay',
                          style: AppTextStyles.caption),
                    ],
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
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
        prefixIcon: Icon(icon),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        filled: true,
        fillColor: Colors.white,
      ),
    );
  }

  String? _required(String? v) =>
      (v == null || v.trim().isEmpty) ? 'This field is required' : null;
}
