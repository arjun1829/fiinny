import 'package:flutter/material.dart';
import '../widgets/financial_ring.dart';

class FinancialRingCard extends StatelessWidget {
  final String userName;
  final double credit;
  final double debit;
  final String period;
  final VoidCallback onFilterTap;

  const FinancialRingCard({
    super.key,
    required this.userName,
    required this.credit,
    required this.debit,
    required this.period,
    required this.onFilterTap,
  });

  @override
  Widget build(BuildContext context) {
    final double total =
        (credit + debit) == 0 ? 1 : (credit + debit); // avoid zero division

    return Container(
      width: double.infinity,
      height: MediaQuery.of(context).size.height * 0.41, // Big hero card!
      decoration: BoxDecoration(
        color: const Color(0xFF0F1D2B),
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(32),
          bottomRight: Radius.circular(32),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 32,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Hello Name
            Padding(
              padding: const EdgeInsets.only(top: 8.0, bottom: 14),
              child: Align(
                alignment: Alignment.center,
                child: Text(
                  "Hello $userName",
                  style: const TextStyle(
                    fontSize: 24,
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),

            // Ring and Balance
            TweenAnimationBuilder<double>(
              tween: Tween(
                  begin: 0, end: ((credit - debit) / total).clamp(0.0, 1.0)),
              duration: const Duration(milliseconds: 900),
              curve: Curves.easeOutCubic,
              builder: (context, val, _) => Column(
                children: [
                  // Animated Ring
                  FinancialRingWidget(
                    label: "Balance",
                    value:
                        (credit - debit) * val, // smooth animate to new balance
                    maxValue: total,
                    icon: Icons.account_balance_wallet_rounded,
                    color: Colors.tealAccent,
                    showPercent: false,
                    ringSize: 122,
                    strokeWidth: 13,
                    gradientColors: const [
                      Colors.tealAccent,
                      Colors.greenAccent,
                      Colors.teal,
                    ],
                  ),
                  const SizedBox(height: 10),
                  // Balance value in center below ring
                  Text(
                    "₹${((credit - debit) * val).toStringAsFixed(0)}",
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 28,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 14),

            // Income & Expense + Filter Row
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _StatTile(
                      label: "Income",
                      amount: credit,
                      color: Colors.greenAccent),
                  InkWell(
                    onTap: onFilterTap,
                    borderRadius: BorderRadius.circular(18),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        children: [
                          Text(
                            period,
                            style: const TextStyle(
                                color: Colors.white70, fontSize: 14),
                          ),
                          const Icon(Icons.expand_more_rounded,
                              color: Colors.white70, size: 19),
                        ],
                      ),
                    ),
                  ),
                  _StatTile(
                      label: "Expense", amount: debit, color: Colors.redAccent),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final double amount;
  final Color color;

  const _StatTile({
    required this.label,
    required this.amount,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label,
            style: TextStyle(
              color: Colors.white70,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            )),
        const SizedBox(height: 2),
        Text(
          "₹${amount.toStringAsFixed(0)}",
          style: TextStyle(
            color: color,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }
}
