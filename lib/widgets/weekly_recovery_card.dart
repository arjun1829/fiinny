import 'package:flutter/material.dart';

class WeeklyRecoveryCard extends StatelessWidget {
  final double weeklyLimit;
  final double spentSoFar;
  final int daysLeft;

  const WeeklyRecoveryCard({
    super.key,
    required this.weeklyLimit,
    required this.spentSoFar,
    required this.daysLeft,
  });

  @override
  Widget build(BuildContext context) {
    final double progress = (spentSoFar / weeklyLimit).clamp(0, 1);

    return Card(
      margin: const EdgeInsets.all(16),
      color: Colors.white.withValues(alpha: 0.9),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("🚀 Weekly Recovery Plan",
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text("Spend Limit: ₹${weeklyLimit.toStringAsFixed(0)}"),
            Text("Spent so far: ₹${spentSoFar.toStringAsFixed(0)}"),
            Text("Days left: $daysLeft"),
            const SizedBox(height: 12),
            LinearProgressIndicator(value: progress),
            const SizedBox(height: 12),
            if (progress <= 1)
              const Text("🎯 You're on track — nice job!")
            else
              const Text("⚠️ You’ve overspent this week. Reduce costs ahead."),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("Plan Updated")),
                );
              },
              child: const Text("Edit Plan"),
            ),
          ],
        ),
      ),
    );
  }
}
