import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../themes/tokens.dart';
import '../../themes/glass_card.dart';
import '../../themes/badge.dart';

class SubsBillsCard extends StatelessWidget {
  final String userPhone;
  final int? activeCount;
  final int? overdueCount;
  final double? monthTotal;
  final DateTime? nextDue;
  final VoidCallback? onOpen;
  final VoidCallback? onAdd;

  const SubsBillsCard({
    Key? key,
    required this.userPhone,
    this.activeCount,
    this.overdueCount,
    this.monthTotal,
    this.nextDue,
    this.onOpen,
    this.onAdd,
  }) : super(key: key);

  static final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('d MMM');
    final nextDueStr = nextDue == null ? '--' : df.format(nextDue!);
    final totalStr = monthTotal == null ? '--' : _inr.format(monthTotal);
    final activeStr = (activeCount ?? 0).toString();
    final overdueStr = (overdueCount ?? 0).toString();

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(Fx.r16),
        onTap: onOpen,
        child: GlassCard(
          radius: Fx.r20,
          padding: const EdgeInsets.all(Fx.s16),
          child: Row(
            children: [
              Container(
                height: 44, width: 44,
                decoration: BoxDecoration(color: Fx.mint.withOpacity(.10), borderRadius: BorderRadius.circular(Fx.r12)),
                child: const Icon(Icons.receipt_long, color: Fx.mintDark),
              ),
              const SizedBox(width: Fx.s12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Subscriptions & Bills', style: Fx.title),
                    const SizedBox(height: Fx.s6),
                    Wrap(spacing: Fx.s8, runSpacing: Fx.s6, children: [
                      PillBadge('Active: $activeStr', color: Fx.mintDark),
                      PillBadge('Overdue: $overdueStr', color: overdueStr == '0' ? Fx.mintDark : Fx.bad, icon: Icons.warning_amber_rounded),
                      PillBadge('This month: $totalStr', color: Fx.mintDark),
                      PillBadge('Next due: $nextDueStr', color: Fx.mintDark, icon: Icons.calendar_month_rounded),
                    ]),
                  ],
                ),
              ),
              const SizedBox(width: Fx.s8),
              IconButton(
                tooltip: 'Add',
                onPressed: onAdd,
                icon: const Icon(Icons.add_circle_outline, color: Fx.mintDark),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
