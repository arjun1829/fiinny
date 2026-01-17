import 'package:flutter/material.dart';

class WeeklySpendingRing extends StatelessWidget {
  final double spent;
  final double limit;

  const WeeklySpendingRing(
      {super.key, required this.spent, required this.limit});

  @override
  Widget build(BuildContext context) {
    final progress = (spent / limit).clamp(0.0, 1.0);

    return Column(
      children: [
        const Text("Weekly Spend Progress",
            style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 10),
        Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              width: 100,
              height: 100,
              child: CircularProgressIndicator(
                value: progress,
                backgroundColor: Colors.grey.shade300,
                color: progress >= 1.0 ? Colors.red : Colors.green,
                strokeWidth: 10,
              ),
            ),
            Text("₹${spent.toStringAsFixed(0)} / ₹${limit.toStringAsFixed(0)}",
                textAlign: TextAlign.center),
          ],
        ),
      ],
    );
  }
}
