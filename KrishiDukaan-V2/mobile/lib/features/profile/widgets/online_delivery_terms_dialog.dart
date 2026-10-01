import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';

/// Mirrors web's components/shared/online-delivery-terms-dialog.tsx: the
/// blocking consent dialog shown every time Online Delivery transitions
/// off -> on, after the GST step, before the account is actually enabled.
/// Reads live commercial rates from settings/route + settings/pricing (same
/// docs/fields web reads), falling back to web's own documented defaults.
class OnlineDeliveryTermsDialog extends StatefulWidget {
  final bool isHindi;

  const OnlineDeliveryTermsDialog({super.key, required this.isHindi});

  /// Shows the dialog and returns the terms-acceptance record to persist, or
  /// null if the seller cancelled.
  static Future<Map<String, dynamic>?> show(
    BuildContext context, {
    required bool isHindi,
  }) {
    return showDialog<Map<String, dynamic>?>(
      context: context,
      barrierDismissible: false,
      builder: (_) => OnlineDeliveryTermsDialog(isHindi: isHindi),
    );
  }

  @override
  State<OnlineDeliveryTermsDialog> createState() =>
      _OnlineDeliveryTermsDialogState();
}

/// Matches web's DELIVERY_TERMS_VERSION (app/lib/legal-constants.ts) — the
/// version stamped on every acceptance record, independent of the site-wide
/// Terms of Use version.
const _deliveryTermsVersion = '2026-08-26';

class _OnlineDeliveryTermsDialogState
    extends State<OnlineDeliveryTermsDialog> {
  bool _loading = true;
  bool _agreed = false;
  bool _busy = false;

  double _platformFeePercent = 1;
  double _gatewayFeePercent = 2;
  double _gstPercent = 18;
  int? _listingFeePerMonth = 21;

  @override
  void initState() {
    super.initState();
    _loadRates();
  }

  Future<void> _loadRates() async {
    try {
      final routeSnap = await FirebaseFirestore.instance
          .collection('settings')
          .doc('route')
          .get();
      final route = routeSnap.data();
      if (route != null) {
        final commission = (route['commissionPercent'] as num?)?.toDouble();
        final gateway = (route['gatewayFeePercent'] as num?)?.toDouble();
        final gatewayGst =
            (route['gatewayFeeGstPercent'] as num?)?.toDouble();
        if (commission != null && commission.isFinite && commission >= 0) {
          _platformFeePercent = commission;
        }
        if (gateway != null && gateway.isFinite && gateway >= 0) {
          _gatewayFeePercent = gateway;
        }
        if (gatewayGst != null && gatewayGst.isFinite && gatewayGst >= 0) {
          _gstPercent = gatewayGst;
        }
      }
    } catch (_) {
      // Unreadable — keep web's documented defaults.
    }

    try {
      final pricingSnap = await FirebaseFirestore.instance
          .collection('settings')
          .doc('pricing')
          .get();
      final raw = pricingSnap.data()?['durations'];
      if (raw is List) {
        DurationPrice? cheapest;
        for (final entry in raw) {
          if (entry is! Map) continue;
          if (entry['flatPrice'] == true) continue;
          final months = (entry['months'] as num?)?.toInt();
          final pricePerSeat = (entry['pricePerSeat'] as num?)?.toDouble();
          if (months == null || months <= 0 || pricePerSeat == null) continue;
          final candidate = DurationPrice(months, pricePerSeat);
          if (cheapest == null || candidate.months < cheapest.months) {
            cheapest = candidate;
          }
        }
        if (cheapest != null) {
          _listingFeePerMonth =
              (cheapest.pricePerSeat / cheapest.months).round();
        }
      }
    } catch (_) {
      // Unreadable — keep the default ₹21/month.
    }

    if (mounted) setState(() => _loading = false);
  }

  String _pct(double value) {
    final trimmed = value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
    return '$trimmed%';
  }

  void _agree() {
    if (!_agreed || _busy) return;
    setState(() => _busy = true);
    Navigator.of(context).pop({
      'version': _deliveryTermsVersion,
      'rates': {
        'listingFeePerMonth': _listingFeePerMonth,
        'platformFeePercent': _platformFeePercent,
        'gatewayFeePercent': _gatewayFeePercent,
        'gstPercent': _gstPercent,
      },
      'acceptedAt': Timestamp.now(),
      'surface': 'mobile',
    });
  }

  @override
  Widget build(BuildContext context) {
    final isHindi = widget.isHindi;
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: _loading
              ? const SizedBox(
                  height: 160,
                  child: Center(child: CircularProgressIndicator()),
                )
              : SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isHindi
                            ? 'ऑनलाइन डिलीवरी की शर्तें'
                            : 'Online Delivery Terms',
                        style: AppTextStyles.heading3,
                      ),
                      const SizedBox(height: 12),
                      _clause(
                        '1',
                        isHindi
                            ? 'लिस्टिंग शुल्क'
                            : 'Listing fee',
                        isHindi
                            ? 'ऑनलाइन बिक्री के लिए हर लिस्टिंग पर लगभग ₹${_listingFeePerMonth ?? 21}/माह का शुल्क लागू होगा.'
                            : 'A listing fee of approximately ₹${_listingFeePerMonth ?? 21}/month per listing applies for online sales.',
                      ),
                      _clause(
                        '2',
                        isHindi
                            ? 'लेन-देन शुल्क'
                            : 'Transaction charges',
                        isHindi
                            ? 'प्लेटफ़ॉर्म शुल्क ${_pct(_platformFeePercent)}, गेटवे शुल्क ${_pct(_gatewayFeePercent)} + GST ${_pct(_gstPercent)} हर ऑनलाइन ऑर्डर पर लागू होगा.'
                            : 'A platform fee of ${_pct(_platformFeePercent)} and a payment gateway fee of ${_pct(_gatewayFeePercent)} + ${_pct(_gstPercent)} GST apply to every online order.',
                        highlight: true,
                      ),
                      _clause(
                        '3',
                        isHindi ? 'पूर्ति की जिम्मेदारी' : 'Fulfilment responsibility',
                        isHindi
                            ? 'ऑर्डर की पैकिंग, गुणवत्ता और समय पर डिलीवरी की जिम्मेदारी आपकी है.'
                            : 'You remain responsible for packing, quality, and on-time delivery of every order.',
                      ),
                      _clause(
                        '4',
                        isHindi ? 'प्रोडक्ट डिस्कवरी' : 'Product discovery',
                        isHindi
                            ? 'आपके उत्पाद मार्केटप्लेस खोज और श्रेणियों में दिखेंगे.'
                            : 'Your products will appear in marketplace search and category listings.',
                      ),
                      _clause(
                        '5',
                        isHindi ? 'रील्स और शिक्षा' : 'Reels & education',
                        isHindi
                            ? 'आप उत्पाद प्रचार के लिए रील्स और शैक्षिक कंटेंट का उपयोग कर सकते हैं.'
                            : 'You may use reels and educational content to promote your products.',
                      ),
                      const SizedBox(height: 12),
                      InkWell(
                        onTap: () => setState(() => _agreed = !_agreed),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Checkbox(
                              value: _agreed,
                              onChanged: (v) =>
                                  setState(() => _agreed = v ?? false),
                              activeColor: AppColors.primary,
                            ),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(top: 12),
                                child: Text(
                                  isHindi
                                      ? 'मैं उपरोक्त शर्तों से सहमत हूं.'
                                      : 'I agree to the terms above.',
                                  style: AppTextStyles.bodySmall,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton(
                              onPressed: _agreed && !_busy ? _agree : null,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: _busy
                                  ? const SizedBox(
                                      height: 18,
                                      width: 18,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2, color: Colors.white),
                                    )
                                  : Text(isHindi
                                      ? 'सहमत हूं और चालू करें'
                                      : 'Agree & Enable Online Delivery'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed:
                                _busy ? null : () => Navigator.of(context).pop(null),
                            child: Text(isHindi ? 'रद्द करें' : 'Cancel'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }

  Widget _clause(String number, String title, String body,
      {bool highlight = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: highlight ? const EdgeInsets.all(8) : EdgeInsets.zero,
        decoration: highlight
            ? BoxDecoration(
                color: Colors.amber.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              )
            : null,
        child: RichText(
          text: TextSpan(
            style: AppTextStyles.bodySmall.copyWith(color: Colors.black87),
            children: [
              TextSpan(
                text: '$number. $title  ',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              TextSpan(text: body),
            ],
          ),
        ),
      ),
    );
  }
}

class DurationPrice {
  final int months;
  final double pricePerSeat;
  const DurationPrice(this.months, this.pricePerSeat);
}
