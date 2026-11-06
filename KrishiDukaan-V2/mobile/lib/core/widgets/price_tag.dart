import 'package:flutter/material.dart';
import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../utils/currency_utils.dart';
import '../utils/price_display.dart';

/// Marketplace-style price line — the price paid, then (only for a real
/// discount) the pre-discount price struck out and "% off":
///
///   ₹86,999  ₹99,900  12% off
///
/// Wraps instead of truncating, so narrow cards still show all three parts.
class PriceTag extends StatelessWidget {
  final DisplayPrice value;
  final double fontSize;

  /// Shown before the price, e.g. "From" when several sellers stock it.
  final String? prefix;

  const PriceTag({
    super.key,
    required this.value,
    this.fontSize = 16,
    this.prefix,
  });

  @override
  Widget build(BuildContext context) {
    final small = (fontSize * 0.72).clamp(10.0, 16.0);
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.end,
      spacing: 5,
      runSpacing: 1,
      children: [
        if (prefix != null)
          Text(
            prefix!,
            style: AppTextStyles.caption.copyWith(
              fontSize: small,
              fontWeight: FontWeight.w600,
            ),
          ),
        Text(
          CurrencyUtils.format(value.price),
          style: AppTextStyles.price.copyWith(
            fontSize: fontSize,
            color: AppColors.onSurface,
          ),
        ),
        if (value.hasOffer) ...[
          Text(
            CurrencyUtils.format(value.mrp!),
            semanticsLabel: 'MRP ${CurrencyUtils.format(value.mrp!)}',
            style: AppTextStyles.caption.copyWith(
              fontSize: small,
              decoration: TextDecoration.lineThrough,
            ),
          ),
          Text(
            '${value.pct}% off',
            style: AppTextStyles.caption.copyWith(
              fontSize: small,
              color: const Color(0xFF15803D),
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ],
    );
  }
}
