import 'package:flutter/material.dart';

class TransactionsSummaryCard extends StatelessWidget {
  final double credit;
  final double debit;
  final double net;
  final String period;
  final String title;
  final String? subtitle;
  final VoidCallback onFilterTap;
  final VoidCallback? onLimitTap;
  final double? limit;
  final double? used;
  final bool savingLimit;

  const TransactionsSummaryCard({
    Key? key,
    required this.credit,
    required this.debit,
    required this.net,
    required this.period,
    required this.title,
    this.subtitle,
    required this.onFilterTap,
    this.onLimitTap,
    this.limit,
    this.used,
    this.savingLimit = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final netColor = net >= 0 ? Colors.teal : Colors.red;
    final hasLimit = (limit ?? 0) > 0;
    final usedValue = used ?? 0;
    final limitValue = limit ?? 0;
    final progress = hasLimit && limitValue > 0
        ? (usedValue / limitValue).clamp(0.0, 1.0)
        : 0.0;
    final isCompact = MediaQuery.of(context).size.width < 360;

    return Card(
      elevation: 2.5,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: EdgeInsets.fromLTRB(isCompact ? 14 : 18, 16, isCompact ? 14 : 18, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          fontSize: isCompact ? 15.5 : 17,
                        ),
                      ),
                      if (subtitle != null && subtitle!.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          subtitle!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: Colors.grey[600],
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    padding: EdgeInsets.symmetric(
                      horizontal: isCompact ? 8 : 10,
                      vertical: 6,
                    ),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    minimumSize: Size.zero,
                    visualDensity: VisualDensity.compact,
                    side: BorderSide(color: Colors.grey.shade300),
                    textStyle: TextStyle(
                      fontSize: isCompact ? 11 : 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  onPressed: onFilterTap,
                  icon: Icon(Icons.filter_list_rounded, size: isCompact ? 16 : 18),
                  label: Text(period),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _Stat(
                    label: 'Credit',
                    value: credit,
                    color: Colors.green[700]!,
                    icon: Icons.arrow_downward_rounded,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Stat(
                    label: 'Debit',
                    value: debit,
                    color: Colors.red[600]!,
                    icon: Icons.arrow_upward_rounded,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Stat(
                    label: 'Net',
                    value: net,
                    color: netColor,
                    icon: Icons.trending_up_rounded,
                  ),
                ),
              ],
            ),
            if (hasLimit || onLimitTap != null) ...[
              const SizedBox(height: 16),
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  color: const Color(0xFFE9F6F4),
                  border: Border.all(color: const Color(0xFFC6E6DF)),
                ),
                padding: EdgeInsets.symmetric(
                  horizontal: isCompact ? 12 : 14,
                  vertical: 12,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          hasLimit ? Icons.flag_rounded : Icons.outlined_flag,
                          color: const Color(0xFF0F766E),
                          size: isCompact ? 18 : 20,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            hasLimit
                                ? 'Spending limit ₹${limitValue.toStringAsFixed(0)}'
                                : 'No spending limit set yet',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                              fontSize: isCompact ? 12.5 : 13.5,
                              color: const Color(0xFF0F766E),
                            ),
                          ),
                        ),
                        if (onLimitTap != null)
                          TextButton(
                            style: TextButton.styleFrom(
                              padding: EdgeInsets.symmetric(
                                horizontal: isCompact ? 10 : 12,
                                vertical: 6,
                              ),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              textStyle: TextStyle(
                                fontSize: isCompact ? 11 : 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            onPressed: savingLimit ? null : onLimitTap,
                            child: savingLimit
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(strokeWidth: 2.3),
                                  )
                                : Text(hasLimit ? 'Edit' : 'Set limit'),
                          ),
                      ],
                    ),
                    if (hasLimit) ...[
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          minHeight: 6,
                          value: progress,
                          backgroundColor: Colors.white,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            progress >= 1.0 ? Colors.redAccent : const Color(0xFF0F766E),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            'Used ₹${usedValue.toStringAsFixed(0)}',
                            style: theme.textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.w600,
                              fontSize: isCompact ? 11.5 : 12.5,
                              color: progress >= 1.0
                                  ? Colors.redAccent
                                  : const Color(0xFF0F766E),
                            ),
                          ),
                          const Spacer(),
                          Text(
                            '${limitValue == 0 ? '0' : (usedValue / limitValue * 100).clamp(0, 999).toStringAsFixed(0)}% of limit',
                            style: theme.textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.w500,
                              fontSize: isCompact ? 11 : 12,
                              color: Colors.grey[700],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  final IconData icon;

  const _Stat({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 18),
              const SizedBox(width: 6),
              Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '₹${value.toStringAsFixed(0)}',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: color,
              fontSize: 18,
            ),
          ),
        ],
      ),
    );
  }
}
