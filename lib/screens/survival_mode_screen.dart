import 'package:flutter/material.dart';

class SurvivalModeScreen extends StatelessWidget {
  final String userId;
  final double creditCardBill;
  final double salary;

  const SurvivalModeScreen({
    super.key,
    required this.userId,
    required this.creditCardBill,
    required this.salary,
  });

  @override
  Widget build(BuildContext context) {
    final double weeklyLimit = (salary * 0.5) / 4;

    return Scaffold(
      appBar: AppBar(title: const Text("🛡️ Survival Mode")),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "📉 Weekly Spend Limit",
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Text(
                "🧾 Your credit card bill is ₹${creditCardBill.toStringAsFixed(0)}"),
            Text("💼 Your salary is ₹${salary.toStringAsFixed(0)}"),
            const SizedBox(height: 12),
            Text(
                "🔐 To stay safe, keep spending under ₹${weeklyLimit.toStringAsFixed(0)} per week."),
            const SizedBox(height: 20),
            const Text(
              "✅ Tips to survive the month:",
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text("• Pause Swiggy/Zomato orders"),
            const Text("• Avoid online shopping temptations"),
            const Text("• Prefer UPI over credit cards"),
            const Text("• Track daily spend with Fiinny 📱"),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text("🎯 Survival Mode Activated"),
                  ),
                );
                Navigator.pop(context);
              },
              child: const Text("Activate Plan"),
            ),
          ],
        ),
      ),
    );
  }
}
