import 'dart:ui';
import 'package:flutter/material.dart';

class TransactionsSummaryCard extends StatelessWidget {
  final double credit;
  final double debit;
  final double net;
  final String period;
  final VoidCallback onFilterTap;

  const TransactionsSummaryCard({
    Key? key,
    required this.credit,
    required this.debit,
    required this.net,
    required this.period,
    required this.onFilterTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        height: 160, // 💡 Fixed height so rings can position well
        child: Stack(
          children: [
            // 🎯 CONTAINED RINGS (within card)
            Positioned.fill(
              child: Stack(
                children: const [
                  Positioned(
                    top: -20,
                    right: -20,
                    child: _RingCircle(size: 60, strokeWidth: 2),
                  ),
                  Positioned(
                    bottom: -10,
                    left: -10,
                    child: _RingCircle(size: 40, strokeWidth: 1.5),
                  ),
                ],
              ),
            ),

            // 🌫️ Glass Card Background
            BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  gradient: LinearGradient(
                    colors: [
                      Colors.white.withOpacity(0.14),
                      Colors.white.withOpacity(0.05),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  border: Border.all(color: Colors.white.withOpacity(0.12)),
                ),
                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          "Transactions",
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.teal[800]),
                        ),
                        const Spacer(),
                        InkWell(
                          borderRadius: BorderRadius.circular(30),
                          onTap: onFilterTap,
                          child: Row(
                            children: [
                              Text(
                                period,
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.teal),
                              ),
                              const Icon(Icons.expand_more_rounded, size: 21, color: Colors.teal),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _Stat(label: "Credit", value: credit, color: Colors.green, icon: Icons.arrow_downward_rounded),
                        _Stat(label: "Debit", value: debit, color: Colors.red, icon: Icons.arrow_upward_rounded),
                        _Stat(label: "Net", value: net, color: net >= 0 ? Colors.teal : Colors.red, icon: Icons.trending_up_rounded),
                      ],
                    ),
                  ],
                ),
              ),
            ),
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
    return Column(
      children: [
        Icon(icon, color: color, size: 22),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: color)),
        const SizedBox(height: 2),
        Text("₹${value.toStringAsFixed(0)}", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: color)),
      ],
    );
  }
}

// 🔵 Decorative Ring Circle Widget
class _RingCircle extends StatelessWidget {
  final double size;
  final double strokeWidth;

  const _RingCircle({required this.size, this.strokeWidth = 2});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: Colors.white.withOpacity(0.08),
          width: strokeWidth,
        ),
      ),
    );
  }
}
