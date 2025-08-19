import 'package:flutter/material.dart';

class EMIPlanScreen extends StatelessWidget {
  final double amount;
  const EMIPlanScreen({Key? key, required this.amount}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    List<int> months = [3, 6, 9, 12];

    return Scaffold(
      appBar: AppBar(title: const Text("🔁 EMI Planner")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text("Convert ₹${amount.toStringAsFixed(0)} to EMI",
                style: const TextStyle(fontSize: 18)),
            const SizedBox(height: 16),
            const Text("Choose a plan:"),
            const SizedBox(height: 12),
            ...months.map((m) {
              double monthly = amount / m * 1.02; // +2% approx interest
              return ListTile(
                title: Text("$m months"),
                subtitle: Text("₹${monthly.toStringAsFixed(0)} per month"),
                trailing: ElevatedButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text("Selected: ₹${monthly.toStringAsFixed(0)} × $m")),
                    );
                    Navigator.pop(context);
                  },
                  child: const Text("Choose"),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
