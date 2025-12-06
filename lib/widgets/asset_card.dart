import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/asset_model.dart';
import '../themes/tokens.dart';

class AssetCard extends StatelessWidget {
  final AssetModel asset;
  final NumberFormat currency;
  final VoidCallback onTap;
  final VoidCallback? onDelete;
  final String? logoPath;

  const AssetCard({
    Key? key,
    required this.asset,
    required this.currency,
    required this.onTap,
    this.onDelete,
    this.logoPath,
  }) : super(key: key);

  Color get _baseColor {
    switch (asset.assetType.toLowerCase()) {
      case 'equity': return const Color(0xFF22C55E); // Green
      case 'mf_etf': return const Color(0xFF06B6D4); // Cyan
      case 'fixed_deposit': return const Color(0xFFF59E0B); // Amber
      case 'gold': return const Color(0xFFEAB308); // Yellow
      case 'real_estate': return const Color(0xFF8B5CF6); // Violet
      case 'crypto': return const Color(0xFFEF4444); // Red
      default: return const Color(0xFF64748B); // Slate
    }
  }

  IconData get _icon {
    switch (asset.assetType.toLowerCase()) {
      case 'equity': return Icons.show_chart_rounded;
      case 'mf_etf': return Icons.scatter_plot_rounded;
      case 'fixed_deposit': return Icons.lock_clock_outlined;
      case 'real_estate': return Icons.house_rounded;
      case 'gold': return Icons.workspace_premium_rounded;
      case 'crypto': return Icons.currency_bitcoin_rounded;
      case 'cash_bank': return Icons.account_balance_rounded;
      default: return Icons.category_rounded;
    }
  }

  String get _typeLabel {
    switch (asset.assetType.toLowerCase()) {
      case 'mf_etf': return 'Mutual Fund';
      case 'fixed_deposit': return 'FD';
      case 'cash_bank': return 'Bank';
      default: return asset.assetType[0].toUpperCase() + asset.assetType.substring(1);
    }
  }

  @override
  Widget build(BuildContext context) {
    // If we have purchase data, calc P&L
    final hasPurchaseData = (asset.purchaseValue != null && asset.purchaseValue! > 0) || 
                            (asset.avgBuyPrice != null && asset.quantity != null);
                            
    double? costBasis;
    if (asset.purchaseValue != null && asset.purchaseValue! > 0) {
      costBasis = asset.purchaseValue;
    } else if (asset.avgBuyPrice != null && asset.quantity != null) {
      costBasis = asset.avgBuyPrice! * asset.quantity!;
    }

    double? gain;
    double? gainPct;
    if (costBasis != null && costBasis > 0) {
      gain = asset.value - costBasis;
      gainPct = (gain / costBasis) * 100;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),
            blurRadius: 12,
            offset: Offset(0, 4),
          )
        ],
        border: Border.all(color: Colors.grey.shade100),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: _baseColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(_icon, color: _baseColor, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            asset.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: Colors.black87,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            (asset.institution ?? _typeLabel), // Fallback to type if no institution
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.grey[500],
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (onDelete != null)
                      IconButton(
                        icon: Icon(Icons.more_horiz_rounded, color: Colors.grey[400]),
                        constraints: const BoxConstraints(),
                        padding: const EdgeInsets.all(8),
                        onPressed: onDelete, // Logic handled by parent or menu
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                
                // Values
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Current Value",
                          style: TextStyle(fontSize: 11, color: Colors.grey[500], fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          currency.format(asset.value),
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: Colors.black87,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    if (hasPurchaseData && gain != null) 
                       Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                           Container(
                             padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                             decoration: BoxDecoration(
                               color: (gain >= 0 ? Fx.good : Fx.bad).withOpacity(0.1),
                               borderRadius: BorderRadius.circular(8),
                             ),
                             child: Row(
                               mainAxisSize: MainAxisSize.min,
                               children: [
                                 Icon(
                                    gain >= 0 ? Icons.trending_up_rounded : Icons.trending_down_rounded,
                                    size: 14,
                                    color: gain >= 0 ? Fx.good : Fx.bad,
                                 ),
                                 const SizedBox(width: 4),
                                 Text(
                                   "${gain >= 0 ? '+' : ''}${gainPct?.toStringAsFixed(1)}%",
                                   style: TextStyle(
                                     fontSize: 12,
                                     fontWeight: FontWeight.w700,
                                     color: gain >= 0 ? Fx.good : Fx.bad,
                                   ),
                                 ),
                               ],
                             ),
                           ),
                           const SizedBox(height: 4),
                           Text(
                             "${gain >= 0 ? '+' : ''}${currency.format(gain)}",
                             style: TextStyle(fontSize: 11, color: Colors.grey[500], fontWeight: FontWeight.w600),
                           ),
                        ],
                       )
                    else if (asset.quantity != null && asset.quantity! > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.grey[100],
                          borderRadius: BorderRadius.circular(8),
                        ),
                         child: Text(
                                   "Qty: ${asset.quantity!.toStringAsFixed(2)}",
                                   style: TextStyle(
                                     fontSize: 12,
                                     fontWeight: FontWeight.w600,
                                     color: Colors.grey[700],
                                   ),
                        ),
                      )
                  ],
                )
              ],
            ),
          ),
        ),
      ),
    );
  }
}
