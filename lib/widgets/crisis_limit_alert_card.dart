import 'package:flutter/material.dart';

class CrisisLimitAlertCard extends StatelessWidget {
  final double spent;
  final double limit;

  const CrisisLimitAlertCard({
    super.key,
    required this.spent,
    required this.limit,
  });

  @override
  Widget build(BuildContext context) {
    if (spent <= limit) {
      return const SizedBox.shrink(); // Don't show if not exceeded
    }

    final overBy = spent - limit;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Colors.red.shade50,
      elevation: 6,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: ListTile(
        leading: const Icon(Icons.warning_amber_rounded,
            color: Colors.red, size: 32),
        title: const Text(
          "Limit Exceeded!",
          style: TextStyle(
            color: Colors.red,
            fontWeight: FontWeight.bold,
            fontSize: 17,
            letterSpacing: 0.08,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 3.0),
          child: Text(
            "You've spent ₹${spent.toStringAsFixed(0)} this week.\nThat's ₹${overBy.toStringAsFixed(0)} over your limit of ₹${limit.toStringAsFixed(0)}.",
            style: const TextStyle(
              color: Colors.black87,
              fontWeight: FontWeight.w500,
              fontSize: 13.5,
            ),
          ),
        ),
      ),
    );
  }
}
