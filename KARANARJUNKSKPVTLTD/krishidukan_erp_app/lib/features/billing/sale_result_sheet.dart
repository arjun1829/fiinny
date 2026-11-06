import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../widgets/form_bits.dart';
import 'billing_repository.dart';

enum SaleNext { view, newBill, close }

/// Post-save confirmation shared by POS and B2B. Lists any product that went
/// below zero — the web's formatLowStockAlert — so oversold stock is never
/// silent.
Future<SaleNext> showSaleResult(BuildContext context, SaleResult r) async {
  final v = await showModalBottomSheet<SaleNext>(
    context: context,
    isDismissible: false,
    enableDrag: false,
    showDragHandle: true,
    builder: (ctx) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(Icons.check_circle_rounded, size: 46, color: AppColors.good),
          const SizedBox(height: 10),
          Text('Bill saved',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink)),
          const SizedBox(height: 4),
          Text('${r.number}  ·  ${fmtInr2(r.total)}',
              textAlign: TextAlign.center,
              style: kTabular.copyWith(fontSize: 15, color: AppColors.inkDim)),
          if (r.lowStock.isNotEmpty) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('LOW STOCK — PLEASE CHECK',
                      style: kMicro.copyWith(color: AppColors.warning)),
                  const SizedBox(height: 6),
                  for (final s in r.lowStock)
                    Text('• $s',
                        style: TextStyle(fontSize: 12.5, color: AppColors.ink)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: () => Navigator.pop(ctx, SaleNext.view),
            icon: const Icon(Icons.share_rounded, size: 18),
            label: const Text('View / share invoice'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
            onPressed: () => Navigator.pop(ctx, SaleNext.newBill),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('New bill'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, SaleNext.close),
            child: const Text('Done'),
          ),
        ],
      ),
    ),
  );
  return v ?? SaleNext.close;
}
