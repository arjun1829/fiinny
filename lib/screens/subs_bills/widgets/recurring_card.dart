import 'package:flutter/material.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/ui/atoms/brand_avatar.dart';
import 'package:lifemap/screens/subs_bills/widgets/brand_avatar_registry.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';

class RecurringCard extends StatelessWidget {
  final List<SharedItem> top;   // non-monthly (yearly/weekly/custom)
  final double annualTotal;
  final VoidCallback? onManage;

  const RecurringCard({
    super.key,
    required this.top,
    required this.annualTotal,
    this.onManage,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Colors.black.withOpacity(.92);

    return TonalCard(
      tint: AppColors.electricPurple, // <- changed from 'accent' to 'tint'
      padding: const EdgeInsets.all(AppSpacing.l),
      header: Row(
        children: [
          const Icon(Icons.repeat_rounded, color: AppColors.electricPurple),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Recurring Payments',
              style: TextStyle(
                color: AppColors.electricPurple,
                fontWeight: FontWeight.w900,
                fontSize: 16,
              ),
            ),
          ),
          _chip('₹ ${_fmtAmount(annualTotal)} / yr', AppColors.electricPurple, dark),
          const SizedBox(width: 8),
          TextButton(
            onPressed: onManage,
            style: TextButton.styleFrom(foregroundColor: AppColors.electricPurple),
            child: const Text('Manage'),
          ),
        ],
      ),
      child: Column(
        children: [
          for (final e in top) ...[
            _row(e),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }

  Widget _row(SharedItem e) {
    final title = e.title ?? 'Recurring';
    final amt = (e.rule.amount ?? 0).toDouble();
    final due = e.nextDueAt;
    final freq = (e.rule.frequency ?? '').isNotEmpty ? e.rule.frequency : null;
    final asset = BrandAvatarRegistry.assetFor(title);

    return Row(
      children: [
        BrandAvatar(assetPath: asset, label: title, size: 36, radius: 10),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 2),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (freq != null && freq!.isNotEmpty)
                    _tag(freq!, AppColors.electricPurple),
                  if (due != null)
                    Text(
                      'Next ${_fmtDate(due)}',
                      style: const TextStyle(fontSize: 12, color: Colors.black54),
                    ),
                  _tag('₹ ${_fmtAmount(amt)}', AppColors.electricPurple),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  static Widget _chip(String text, Color c, Color dark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(.25)),
      ),
      child: Text(text, style: TextStyle(color: dark, fontWeight: FontWeight.w900)),
    );
  }

  static Widget _tag(String text, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(.18)),
      ),
      child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: c)),
    );
  }

  String _fmtAmount(double v) {
    final i = v.round();
    if (i >= 10000000) return '${(i / 10000000).toStringAsFixed(1)}Cr';
    if (i >= 100000) return '${(i / 100000).toStringAsFixed(1)}L';
    if (i >= 1000) return '${(i / 1000).toStringAsFixed(1)}k';
    return i.toString();
  }

  String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }
}
