import 'package:flutter/material.dart';
import '../models/asset_model.dart';
import '../models/price_quote.dart';

/// Displays a single holding row (used by Portfolio list).
class HoldingRow extends StatelessWidget {
  final AssetModel asset;
  final PriceQuote? quote;
  final VoidCallback? onLongPress;

  const HoldingRow({
    super.key,
    required this.asset,
    required this.quote,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final ltp = quote?.ltp ?? asset.avgBuyPrice;
    final invested = asset.investedValue();
    final current = asset.currentValue(ltp);
    final pnl = current - invested;
    final pnlPct = invested == 0 ? 0 : (pnl / invested) * 100;

    return Card(
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        leading: CircleAvatar(
          child: Text(
            asset.type == 'stock' ? 'S' : 'G',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ),
        title: Text(
          asset.name.toUpperCase(),
          style: theme.textTheme.titleMedium,
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(
              asset.type == 'stock'
                  ? 'Qty: ${asset.quantity.toStringAsFixed(2)}  •  LTP: ₹${ltp.toStringAsFixed(2)}'
                  : 'Grams: ${asset.quantity.toStringAsFixed(2)}  •  LTP/g: ₹${ltp.toStringAsFixed(2)}',
            ),
            const SizedBox(height: 2),
            Text(
              'Invested: ₹${invested.toStringAsFixed(2)}  •  Value: ₹${current.toStringAsFixed(2)}',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${pnl >= 0 ? '+' : '-'}₹${pnl.abs().toStringAsFixed(2)}',
              style: theme.textTheme.titleSmall?.copyWith(
                color: pnl >= 0 ? Colors.green : Colors.red,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              '${pnlPct >= 0 ? '+' : ''}${pnlPct.toStringAsFixed(2)}%',
              style: theme.textTheme.bodySmall?.copyWith(
                color: pnlPct >= 0 ? Colors.green : Colors.red,
              ),
            ),
          ],
        ),
        onLongPress: onLongPress,
      ),
    );
  }
}
