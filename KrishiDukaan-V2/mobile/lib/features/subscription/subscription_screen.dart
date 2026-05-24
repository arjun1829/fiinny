import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../core/constants.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/firestore_repository.dart';

const _kRazorpayKeyId = 'rzp_test_SmPxtEcNJ25LUj';
const _kWebBase = 'https://krishidukan-e8315.web.app';

class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key, this.onSuccess});
  final VoidCallback? onSuccess;

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {
  final _razorpay = Razorpay();
  int _seatCount = 1;
  bool _loading = false;
  bool _verifying = false;
  String? _error;
  int? _pendingSeatCount;

  @override
  void initState() {
    super.initState();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onPaymentSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onPaymentError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, (_) {});
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  Future<void> _handlePayment() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final uid = ref.read(sessionProvider).uid ?? '';
    try {
      final res = await Dio().post(
        '$_kWebBase/api/payment/create-order',
        data: jsonEncode({'seatCount': _seatCount, 'userId': uid}),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
      final order = res.data as Map<String, dynamic>;
      if (order['error'] != null) throw Exception(order['error']);

      _pendingSeatCount = _seatCount;

      _razorpay.open({
        'key': _kRazorpayKeyId,
        'amount': order['amount'],
        'currency': order['currency'] ?? 'INR',
        'name': 'KrishiDukan',
        'description': 'Purchase $_seatCount Product Listing Seat(s)',
        'order_id': order['id'],
        'theme': {'color': '#154212'},
      });
    } catch (e) {
      setState(() {
        _error = 'Could not start payment. Please try again.';
        _loading = false;
      });
    }
  }

  void _onPaymentSuccess(PaymentSuccessResponse response) async {
    setState(() {
      _loading = false;
      _verifying = true;
      _error = null;
    });
    try {
      final verifyRes = await Dio().post(
        '$_kWebBase/api/payment/verify',
        data: jsonEncode({
          'razorpay_order_id': response.orderId,
          'razorpay_payment_id': response.paymentId,
          'razorpay_signature': response.signature,
        }),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
      final vData = verifyRes.data as Map<String, dynamic>;
      if (vData['status'] != 'ok') {
        throw Exception('Verification failed. Contact support.');
      }

      final seats = vData['seatCount'] as int? ?? _pendingSeatCount ?? _seatCount;
      final uid = ref.read(sessionProvider).uid ?? '';
      final repo = ref.read(firestoreRepoProvider);
      final session = ref.read(sessionProvider);
      final ownerType = session.role?.name ?? 'retailer';

      await repo.createSubscription(
        ownerId: uid,
        ownerType: ownerType,
        seatsPurchased: seats,
        amountPaid: seats * 21.0,
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
      );
      await repo.setUserPaid(uid, true, seats);
      await ref.read(sessionProvider.notifier).setSubscribed(true);

      if (mounted) {
        setState(() => _verifying = false);
        if (widget.onSuccess != null) {
          widget.onSuccess!();
        } else {
          Navigator.of(context).maybePop();
        }
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Subscription activated! Welcome to KrishiDukan Pro.'),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _verifying = false;
          _error = 'Payment received but setup failed. Refresh or contact support.';
        });
      }
    }
  }

  void _onPaymentError(PaymentFailureResponse response) {
    setState(() {
      _loading = false;
      _error = 'Payment was not completed. Please try again.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final isManufacturer = session.role == UserRole.manufacturer;

    final benefits = isManufacturer
        ? [
            'List and manage your full product catalogue',
            'Assign products directly to retailer networks',
            'Track stock and analytics across all retailers',
            'Priority manufacturer support',
          ]
        : [
            'List products in your store profile',
            'Appear in customer searches near you',
            'Manage stock and selling prices',
            'Access retailer analytics dashboard',
          ];

    final badge = isManufacturer ? 'MANUFACTURER PRO' : 'RETAILER PRO';
    final title = isManufacturer
        ? 'Unlock your Manufacturer Dashboard'
        : 'Unlock your Retailer Dashboard';
    final subtitle = isManufacturer
        ? 'Create products, assign to retailers and grow your distribution network.'
        : 'List your store\'s products, manage inventory and reach more farmers.';

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Activate subscription'),
        backgroundColor: AppColors.surface,
        elevation: 0,
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                        color: AppColors.primary.withValues(alpha: 0.2)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.verified_outlined,
                          size: 13, color: AppColors.primary),
                      const SizedBox(width: 5),
                      Text(badge,
                          style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary,
                              letterSpacing: 1.0)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text(title,
                    style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        height: 1.15)),
                const SizedBox(height: 8),
                Text(subtitle,
                    style: const TextStyle(
                        color: AppColors.muted, fontSize: 14, height: 1.5)),
                const SizedBox(height: 24),

                // Benefits
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.02),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                        color: AppColors.primary.withValues(alpha: 0.08)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('INCLUDED BENEFITS',
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary,
                              letterSpacing: 0.8)),
                      const SizedBox(height: 12),
                      for (final b in benefits) _BenefitRow(b),
                      const SizedBox(height: 8),
                      _BenefitRow('List up to $_seatCount product(s)',
                          highlighted: true),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Seat selector card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.border),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.04),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      )
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('PLAN',
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.muted,
                                  letterSpacing: 1.0)),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(badge,
                                style: const TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w900,
                                    color: AppColors.primary,
                                    letterSpacing: 0.8)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Seat selector
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceAlt,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Number of seats',
                                      style: TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 13)),
                                  Text(
                                    'List up to $_seatCount product(s)',
                                    style: const TextStyle(
                                        color: AppColors.muted, fontSize: 11),
                                  ),
                                ],
                              ),
                            ),
                            _SeatCounter(
                              count: _seatCount,
                              onDecrement: () {
                                if (_seatCount > 1) {
                                  setState(() => _seatCount--);
                                }
                              },
                              onIncrement: () => setState(() => _seatCount++),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Price display
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              AppColors.primary.withValues(alpha: 0.02),
                              AppColors.primary.withValues(alpha: 0.05),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: AppColors.primary.withValues(alpha: 0.08)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            const Text('TOTAL PRICE',
                                style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.muted,
                                    letterSpacing: 0.8)),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '₹${_seatCount * 21}.00',
                                  style: const TextStyle(
                                      fontSize: 32,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.text),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color:
                                        AppColors.primary.withValues(alpha: 0.08),
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(
                                        color: AppColors.primary
                                            .withValues(alpha: 0.15)),
                                  ),
                                  child: const Text(
                                    '₹21 PER PRODUCT SEAT',
                                    style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                        color: AppColors.primary),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.warning_amber_rounded,
                            color: Colors.red, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(_error!,
                              style: TextStyle(
                                  color: Colors.red.shade700, fontSize: 12)),
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 24),

                // Pay button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _handlePayment,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(52),
                      textStyle: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w800),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            'Pay ₹${_seatCount * 21} · Unlock ${_seatCount} seat${_seatCount != 1 ? 's' : ''}'),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: const [
                    Icon(Icons.lock_outline, size: 12, color: AppColors.muted),
                    SizedBox(width: 5),
                    Text('Secured by Razorpay',
                        style: TextStyle(
                            color: AppColors.muted,
                            fontSize: 11,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),

          // Verifying overlay
          if (_verifying)
            Container(
              color: Colors.white.withValues(alpha: 0.92),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const CircularProgressIndicator(color: AppColors.primary),
                  const SizedBox(height: 20),
                  const Text('Verifying payment…',
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppColors.primary,
                          fontSize: 16)),
                  const SizedBox(height: 6),
                  Text('Setting up your account',
                      style: TextStyle(
                          color: AppColors.muted.withValues(alpha: 0.7),
                          fontSize: 13)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _BenefitRow extends StatelessWidget {
  const _BenefitRow(this.text, {this.highlighted = false});
  final String text;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: highlighted
                  ? AppColors.primary
                  : AppColors.primary.withValues(alpha: 0.1),
              shape: BoxShape.circle,
              border: Border.all(
                  color: AppColors.primary.withValues(alpha: 0.2)),
            ),
            child: Icon(Icons.check,
                size: 12,
                color: highlighted ? Colors.white : AppColors.primary),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight:
                        highlighted ? FontWeight.w700 : FontWeight.w500,
                    color: highlighted ? AppColors.primary : AppColors.text)),
          ),
        ],
      ),
    );
  }
}

class _SeatCounter extends StatelessWidget {
  const _SeatCounter({
    required this.count,
    required this.onDecrement,
    required this.onIncrement,
  });
  final int count;
  final VoidCallback onDecrement, onIncrement;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          _CountBtn(Icons.remove, onDecrement),
          SizedBox(
            width: 36,
            child: Text('$count',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w800)),
          ),
          _CountBtn(Icons.add, onIncrement),
        ],
      ),
    );
  }
}

class _CountBtn extends StatelessWidget {
  const _CountBtn(this.icon, this.onTap);
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        child: Icon(icon, size: 16, color: AppColors.text),
      ),
    );
  }
}
