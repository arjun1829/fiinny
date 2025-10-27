import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../themes/tokens.dart';
import '../../themes/glass_card.dart';

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
    final titleStyle = Theme.of(context)
        .textTheme
        .titleMedium
        ?.copyWith(fontWeight: FontWeight.w700, fontSize: 16, color: Fx.mintDark);

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
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  color: Fx.mint.withOpacity(.10),
                  borderRadius: BorderRadius.circular(Fx.r12),
                ),
                child: const Icon(Icons.receipt_long, color: Fx.mintDark),
              ),
              const SizedBox(width: Fx.s12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Subscriptions & Bills', style: titleStyle),
                    const SizedBox(height: Fx.s6),
                    Text(
                      'This month: $totalStr',
                      style: Fx.number.copyWith(color: Fx.mintDark, fontSize: 20),
                    ),
                    const SizedBox(height: Fx.s10),
                    Wrap(
                      spacing: Fx.s16,
                      runSpacing: Fx.s4,
                      children: [
                        Text('Active: $activeStr', style: Fx.label),
                        Text(
                          'Overdue: $overdueStr',
                          style: Fx.label.copyWith(color: overdueStr == '0' ? Fx.text : Fx.bad),
                        ),
                        Text('Next due: $nextDueStr', style: Fx.label),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: Fx.s8),
              TextButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add'),
                style: TextButton.styleFrom(
                  backgroundColor: Fx.mint.withOpacity(.12),
                  foregroundColor: Fx.mintDark,
                  padding: const EdgeInsets.symmetric(
                    horizontal: Fx.s14,
                    vertical: Fx.s8,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(Fx.r14),
                  ),
                  textStyle: Fx.label.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
