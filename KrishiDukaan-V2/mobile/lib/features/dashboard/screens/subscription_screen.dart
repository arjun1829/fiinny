import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';

// Server-side price per seat (matches API: PRICE_PER_SEAT in create-order/route.ts)
const _pricePerSeat = {1: 21, 3: 54, 6: 90, 12: 144};

const _durations = [
  _Duration(months: 1, label: '1 Month'),
  _Duration(months: 3, label: '3 Months', badge: 'SAVE 14%'),
  _Duration(months: 6, label: '6 Months', badge: 'SAVE 29%'),
  _Duration(months: 12, label: '1 Year', badge: 'BEST VALUE'),
];

class _Duration {
  final int months;
  final String label;
  final String? badge;
  const _Duration({required this.months, required this.label, this.badge});
  int totalPrice(int seats) => seats * (_pricePerSeat[months] ?? months * 21);
}

class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {
  late Razorpay _razorpay;
  int _seats = 1;
  _Duration _duration = _durations[0];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, (_) {});
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  Future<void> _startPayment() async {
    final user = ref.read(currentUserProvider).valueOrNull;
    if (user == null) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // Create Razorpay order server-side so amount is tamper-proof.
      final res = await http
          .post(
            Uri.parse('${AppConfig.apiBaseUrl}/api/payment/create-order'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'seatCount': _seats,
              'durationMonths': _duration.months,
              'userId': user.uid,
            }),
          )
          .timeout(const Duration(seconds: 15));

      if (res.statusCode != 200) {
        throw Exception('Payment server error (${res.statusCode}). '
            'Check that RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set '
            'in your production environment.');
      }

      final order = jsonDecode(res.body) as Map<String, dynamic>;
      if (order['error'] != null) throw Exception(order['error']);

      // Use the key the backend used to create the order so they always match.
      final razorpayKey = order['key_id'] as String? ?? AppConfig.razorpayKeyId;

      _razorpay.open({
        'key': razorpayKey,
        'amount': order['amount'],
        'currency': order['currency'] ?? 'INR',
        'order_id': order['id'],
        'name': 'KrishiDukaan',
        'description':
            '$_seats seat${_seats != 1 ? 's' : ''} · ${_duration.label}',
        'prefill': {
          'contact': user.phone,
          'name': user.name,
          if (user.email != null) 'email': user.email,
        },
        'theme': {'color': '#2E7D32'},
      });
    } catch (e) {
      setState(() {
        _error = 'Could not start payment: $e';
        _loading = false;
      });
    }
  }

  void _onSuccess(PaymentSuccessResponse response) async {
    setState(() => _loading = true);

    try {
      // 1. Verify payment signature with backend API
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      final verifyRes = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/payment/verify'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'razorpay_order_id': response.orderId ?? '',
          'razorpay_payment_id': response.paymentId ?? '',
          'razorpay_signature': response.signature ?? '',
        }),
      );

      if (verifyRes.statusCode != 200) {
        throw Exception('Payment verification failed');
      }

      final verifyData = jsonDecode(verifyRes.body) as Map<String, dynamic>;
      if (verifyData['status'] != 'ok') {
        throw Exception('Payment verification failed');
      }

      final verifiedSeatCount = (verifyData['seatCount'] as num?)?.toInt() ?? _seats;

      // 2. Update Subscription Status in Firestore directly (matches web SDK updateSubscriptionStatus)
      final user = ref.read(currentUserProvider).valueOrNull!;
      final firebaseUser = FirebaseAuth.instance.currentUser!;

      final userDocRef = FirebaseFirestore.instance.collection('users').doc(user.phone);
      final currentSeats = user.totalSeats;
      final seatsToAdd = verifiedSeatCount;

      final batch = FirebaseFirestore.instance.batch();

      batch.update(userDocRef, {
        'isPaid': true,
        'subscriptionStatus': 'paid',
        'paymentDetails': {
          'orderId': response.orderId,
          'paymentId': response.paymentId,
        },
        'totalSeats': currentSeats + seatsToAdd,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      final pricePerSeat = _pricePerSeat[_duration.months] ?? 21;
      final totalAmount = seatsToAdd * pricePerSeat;

      final now = DateTime.now();
      final expiry = DateTime.now().add(Duration(days: _duration.months * 30));

      final paymentRef = FirebaseFirestore.instance.collection('payments').doc();
      batch.set(paymentRef, {
        'userId': firebaseUser.uid,
        'userPhone': user.phone,
        'amount': totalAmount,
        'seatCount': seatsToAdd,
        'durationMonths': _duration.months,
        'currency': 'INR',
        'razorpayOrderId': response.orderId,
        'razorpayPaymentId': response.paymentId,
        'timestamp': FieldValue.serverTimestamp(),
        'status': 'success',
      });

      final subRef = FirebaseFirestore.instance.collection('subscriptions').doc();
      batch.set(subRef, {
        'ownerId': firebaseUser.uid,
        'ownerPhone': user.phone,
        'ownerType': user.role == 'manufacturer' ? 'manufacturer' : 'retailer',
        'planName': 'Standard',
        'seatsPurchased': seatsToAdd,
        'durationMonths': _duration.months,
        'amountPaid': totalAmount,
        'currency': 'INR',
        'razorpayOrderId': response.orderId,
        'razorpayPaymentId': response.paymentId,
        'subscriptionStatus': 'active',
        'startDate': Timestamp.fromDate(now),
        'expiryDate': Timestamp.fromDate(expiry),
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      await batch.commit();

      // Refresh the user state so changes propagate to dashboard and shell
      ref.invalidate(currentUserProvider);

      setState(() => _loading = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Subscription activated!'),
            backgroundColor: AppColors.success,
          ),
        );
        context.go('/dashboard');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Payment verification or DB update failed: $e';
        });
      }
    }
  }

  void _onError(PaymentFailureResponse r) {
    setState(() {
      _loading = false;
      _error = r.message ?? 'Payment failed. Please try again.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(currentUserProvider);
    final isPaid = userAsync.valueOrNull?.isPaid ?? false;
    final totalPrice = _duration.totalPrice(_seats);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Subscription',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (isPaid)
            Container(
              margin: const EdgeInsets.only(bottom: 20),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border:
                    Border.all(color: AppColors.success.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.verified, color: AppColors.success),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Active Subscription',
                            style: AppTextStyles.bodyMedium
                                .copyWith(color: AppColors.success)),
                        Text('Your store is fully activated',
                            style: AppTextStyles.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          Text('Choose Your Plan', style: AppTextStyles.heading2),
          const SizedBox(height: 6),
          Text(
            'Pay per seat. One seat = one product listing slot.',
            style:
                AppTextStyles.body.copyWith(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 24),

          // ── Seat picker ───────────────────────────────────────────────────
          _SectionCard(
            title: 'Number of Seats',
            child: Row(
              children: [
                IconButton(
                  onPressed:
                      _seats > 1 ? () => setState(() => _seats--) : null,
                  icon: const Icon(Icons.remove_circle_outline),
                  color: AppColors.primary,
                ),
                SizedBox(
                  width: 48,
                  child: Text('$_seats',
                      textAlign: TextAlign.center,
                      style: AppTextStyles.heading2),
                ),
                IconButton(
                  onPressed: () => setState(() => _seats++),
                  icon: const Icon(Icons.add_circle_outline),
                  color: AppColors.primary,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '$_seats product listing slot${_seats != 1 ? 's' : ''}',
                    style: AppTextStyles.body
                        .copyWith(color: AppColors.onSurfaceVariant),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── Duration picker ───────────────────────────────────────────────
          _SectionCard(
            title: 'Duration',
            child: Column(
              children: _durations.map((d) {
                final selected = _duration.months == d.months;
                return GestureDetector(
                  onTap: () => setState(() => _duration = d),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
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
                              Text(d.label,
                                  style: AppTextStyles.bodyMedium),
                              if (d.badge != null) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.secondary,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(d.badge!,
                                      style: AppTextStyles.caption.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w700)),
                                ),
                              ],
                            ],
                          ),
                        ),
                        Text(
                          CurrencyUtils.format(d.totalPrice(_seats).toDouble()),
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

          // ── Price summary ─────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
              border:
                  Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$_seats seat${_seats != 1 ? 's' : ''} × ${_duration.label}',
                      style: AppTextStyles.bodySmall,
                    ),
                    Text(
                      CurrencyUtils.format(totalPrice.toDouble()),
                      style: AppTextStyles.priceLarge,
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('₹${_pricePerSeat[_duration.months]}/seat',
                        style: AppTextStyles.caption),
                    Text('one-time payment',
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.onSurfaceVariant)),
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
              children: [
                'Inventory management',
                'Real-time order tracking',
                'Discount management',
                'Delivery settings',
                'Analytics dashboard',
                'Customer order notifications',
              ]
                  .map((f) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            const Icon(Icons.check_circle,
                                color: AppColors.success, size: 18),
                            const SizedBox(width: 8),
                            Text(f, style: AppTextStyles.body),
                          ],
                        ),
                      ))
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
                                .copyWith(color: AppColors.error))),
                  ],
                ),
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
                          strokeWidth: 2, color: Colors.white))
                  : Text(
                      'Pay ${CurrencyUtils.format(totalPrice.toDouble())} · Unlock $_seats seat${_seats != 1 ? 's' : ''}',
                      style: AppTextStyles.button,
                    ),
            ),
          ),

          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.lock_outline,
                  size: 12, color: AppColors.onSurfaceVariant),
              const SizedBox(width: 4),
              Text('Secured by Razorpay',
                  style: AppTextStyles.caption
                      .copyWith(color: AppColors.onSurfaceVariant)),
            ],
          ),
          const SizedBox(height: 80),
        ],
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
              offset: const Offset(0, 2)),
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
