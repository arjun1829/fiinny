import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/utils/gst_utils.dart';

/// The seller-side GST + delivery controls for one product — the app's version
/// of the website's Edit Product "GST" and "Delivery" sections, with the same
/// meaning for every field:
///
///  * GST applicable, and a rate: a preset (0/5/12/18/28) or a custom one.
///  * GST included in the price? YES by default. Included GST is part of the
///    price the seller typed and is never added; exclusive GST is added on top
///    at checkout.
///  * Free Delivery: this product adds no weight and no delivery charge.
///  * Extra delivery charge (₹): added on top of the seller's weight-slab charge.
///
/// Stateless: the parent owns the values, so the add form and the edit sheet
/// share one widget and one wording. [price] / [discountPct] drive the price
/// breakdown preview, computed with the same helper the cart and the server
/// use (core/utils/gst_utils), so what the seller sees is what a buyer pays.
class GstDeliveryFields extends StatelessWidget {
  const GstDeliveryFields({
    super.key,
    required this.gstApplicable,
    required this.gstRate,
    required this.gstIncluded,
    required this.freeDelivery,
    required this.extraDeliveryCtrl,
    required this.onGstApplicable,
    required this.onGstRate,
    required this.onGstIncluded,
    required this.onFreeDelivery,
    this.price = 0,
    this.discountPct = 0,
    this.enabled = true,
  });

  final bool gstApplicable;
  final double gstRate;
  final bool gstIncluded;
  final bool freeDelivery;
  final TextEditingController extraDeliveryCtrl;
  final ValueChanged<bool> onGstApplicable;
  final ValueChanged<double> onGstRate;
  final ValueChanged<bool> onGstIncluded;
  final ValueChanged<bool> onFreeDelivery;

  /// The price the seller entered (before discount), for the breakdown.
  final double price;
  final double discountPct;
  final bool enabled;

  bool get _isPreset => gstRates.contains(gstRate.toInt()) && gstRate == gstRate.roundToDouble();

  /// Parses the extra-delivery text: blank / invalid / negative → 0.
  static double parseExtra(String text) {
    final n = double.tryParse(text.trim());
    return (n != null && n > 0) ? n : 0;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _card(
          child: SwitchListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            title: Text('GST Applicable',
                style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
            subtitle: Text(
              gstApplicable ? 'GST applies to this product' : 'No GST on this product',
              style: AppTextStyles.caption,
            ),
            value: gstApplicable,
            activeThumbColor: AppColors.primary,
            onChanged: enabled ? onGstApplicable : null,
          ),
        ),
        if (gstApplicable) ...[
          const SizedBox(height: 10),
          _card(
            child: SwitchListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              title: Text('GST included in price',
                  style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
              subtitle: Text(
                gstIncluded
                    ? 'The price you entered already includes GST'
                    : 'GST will be added on top of your price at checkout',
                style: AppTextStyles.caption,
              ),
              value: gstIncluded,
              activeThumbColor: AppColors.primary,
              onChanged: enabled ? onGstIncluded : null,
            ),
          ),
          const SizedBox(height: 10),
          _card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('GST Rate',
                      style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final r in gstRates)
                        ChoiceChip(
                          label: Text('$r%'),
                          selected: _isPreset && gstRate == r.toDouble(),
                          onSelected: enabled ? (_) => onGstRate(r.toDouble()) : null,
                        ),
                      ChoiceChip(
                        label: const Text('Custom'),
                        selected: !_isPreset,
                        // A custom rate starts from a value that is not a preset.
                        onSelected: enabled
                            ? (_) => onGstRate(_isPreset ? 3.0 : gstRate)
                            : null,
                      ),
                    ],
                  ),
                  if (!_isPreset) ...[
                    const SizedBox(height: 10),
                    TextFormField(
                      key: ValueKey('custom-gst-${gstRate.toStringAsFixed(2)}'),
                      initialValue: gstRate == gstRate.roundToDouble()
                          ? gstRate.toInt().toString()
                          : gstRate.toString(),
                      enabled: enabled,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                      ],
                      decoration: InputDecoration(
                        labelText: 'Custom GST rate (%)',
                        suffixText: '%',
                        isDense: true,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      // Clamped 0–100, as normalizeGstRate does everywhere.
                      onChanged: (v) => onGstRate(normalizeGstRate(v)),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 10),
        _card(
          child: Column(
            children: [
              SwitchListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                title: Text('Free Delivery',
                    style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
                subtitle: Text(
                  freeDelivery
                      ? 'This product ships free — it adds no delivery charge'
                      : 'Delivery is charged by your delivery settings',
                  style: AppTextStyles.caption,
                ),
                value: freeDelivery,
                activeThumbColor: AppColors.primary,
                onChanged: enabled ? onFreeDelivery : null,
              ),
              if (!freeDelivery)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                  child: TextFormField(
                    controller: extraDeliveryCtrl,
                    enabled: enabled,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                    ],
                    decoration: InputDecoration(
                      labelText: 'Extra delivery charge for this product (₹)',
                      helperText:
                          'Added on top of the weight-slab charge. Leave empty to use only your delivery settings.',
                      helperMaxLines: 2,
                      prefixText: '₹ ',
                      isDense: true,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (price > 0) ...[
          const SizedBox(height: 10),
          _breakdown(),
        ],
      ],
    );
  }

  Widget _card({required Widget child}) => Container(
        decoration: BoxDecoration(
          color: AppColors.surfaceVariant,
          borderRadius: BorderRadius.circular(12),
        ),
        child: child,
      );

  /// Original price → discount → discounted price → GST → what the buyer pays,
  /// the order the whole platform follows.
  Widget _breakdown() {
    final pct = discountPct.clamp(0, 99).toDouble();
    final discounted = pct > 0 ? round2(price * (1 - pct / 100)) : price;
    final p = computeLinePricing(
      unitPrice: discounted,
      gstApplicable: gstApplicable,
      gstRate: gstRate,
      gstIncluded: gstIncluded,
    );

    Widget row(String label, String value, {Color? color, bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(child: Text(label, style: AppTextStyles.bodySmall.copyWith(color: color))),
              Text(value,
                  style: AppTextStyles.bodySmall.copyWith(
                      color: color,
                      fontWeight: bold ? FontWeight.w800 : FontWeight.w600)),
            ],
          ),
        );

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Price breakdown (per unit)',
              style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          row('Original price', CurrencyUtils.format(price)),
          if (pct > 0) ...[
            row('Discount (${pct.toStringAsFixed(pct == pct.roundToDouble() ? 0 : 1)}%)',
                '− ${CurrencyUtils.format(round2(price - discounted))}',
                color: const Color(0xFF15803D)),
            row('Discounted price', CurrencyUtils.format(discounted)),
          ],
          if (p.applicable)
            row(
              p.included
                  ? 'GST (${_rate()}% incl. in price)'
                  : '+ GST (${_rate()}%)',
              p.included
                  ? '(${CurrencyUtils.format(p.gstPerUnit)})'
                  : '+ ${CurrencyUtils.format(p.gstPerUnit)}',
            ),
          const Divider(height: 14),
          row('Customer pays', CurrencyUtils.format(p.lineTotal), bold: true),
          if (p.applicable)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                p.included
                    ? 'GST is already in the price and is not charged separately.'
                    : 'GST is charged on top of the price.',
                style: AppTextStyles.caption.copyWith(color: AppColors.onSurfaceVariant),
              ),
            ),
        ],
      ),
    );
  }

  String _rate() =>
      gstRate == gstRate.roundToDouble() ? gstRate.toInt().toString() : gstRate.toString();
}
