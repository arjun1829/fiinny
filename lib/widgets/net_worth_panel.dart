// lib/widgets/net_worth_panel.dart
import 'package:flutter/material.dart';
import '../themes/tokens.dart';
import '../themes/glass_card.dart';
import '../core/formatters/inr.dart';

class NetWorthPanel extends StatelessWidget {
  final double totalAssets;
  final double totalLoan;

  const NetWorthPanel({
    super.key,
    required this.totalAssets,
    required this.totalLoan,
  });

  @override
  Widget build(BuildContext context) {
    final net = totalAssets - totalLoan;
    final color = net >= 0 ? Fx.good : Fx.bad;

    return GlassCard(
      radius: Fx.r24,
      child: Row(
        children: [
          Icon(Icons.equalizer, color: Fx.mintDark, size: 30),
          const SizedBox(width: Fx.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Net Worth", style: Fx.title),
                const SizedBox(height: Fx.s2),
                Text(INR.f(net), style: Fx.number.copyWith(color: color)),
                const SizedBox(height: Fx.s8),
                Wrap(spacing: Fx.s8, runSpacing: Fx.s6, children: [
                  _pill("Assets", INR.f(totalAssets), Fx.good, Icons.savings_rounded),
                  _pill("Loans", INR.f(totalLoan), Fx.bad, Icons.account_balance_rounded),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _pill(String t, String v, Color c, IconData i) => Container(
        padding: const EdgeInsets.symmetric(horizontal: Fx.s10, vertical: Fx.s4),
        decoration: BoxDecoration(
          color: c.withOpacity(.10),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: c.withOpacity(.25)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(i, size: 14, color: c),
          const SizedBox(width: Fx.s6),
          Text("$t: $v", style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 12)),
        ]),
      );
}
