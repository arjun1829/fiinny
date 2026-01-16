import 'package:flutter/material.dart';
import '../widgets/crisis_option_card.dart';
import 'survival_mode_screen.dart';

class CrisisModeScreen extends StatelessWidget {
  final String userId;
  final double creditCardBill;
  final double salary;

  const CrisisModeScreen({
    Key? key,
    required this.userId,
    required this.creditCardBill,
    required this.salary,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final double riskRatio = creditCardBill / (salary != 0 ? salary : 1); // avoid divide-by-zero

    return Scaffold(
      appBar: AppBar(
        title: const Text("💳 Crisis Mode Activated"),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Your Credit Card Bill: ₹${creditCardBill.toStringAsFixed(0)}",
              style: const TextStyle(fontSize: 18),
            ),
            Text(
              "Your Salary: ₹${salary.toStringAsFixed(0)}",
              style: const TextStyle(fontSize: 18),
            ),
            const SizedBox(height: 20),
            const Text(
              "Choose your path:",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),

            // Survival Mode Option
            CrisisOptionCard(
              title: "Survival Mode",
              subtitle: "Pay full now. We'll help you limit spending for the month.",
              icon: Icons.shield_rounded,
              isActive: true, // If you want to highlight it
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => SurvivalModeScreen(
                      userId: userId,
                      creditCardBill: creditCardBill,
                      salary: salary,
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 16),

            // Convert to EMI Option
            CrisisOptionCard(
              title: "Convert to EMI",
              subtitle: "Break large payment into smaller parts. We'll create a plan.",
              icon: Icons.autorenew_rounded,
              isActive: false,
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("EMI Planner coming soon...")),
                );
              },
            ),
            const SizedBox(height: 16),

            // Add more options if needed, e.g. Negotiate, Pause, etc.
            // CrisisOptionCard(
            //   title: "Pause Payment",
            //   subtitle: "Request to pause the payment for a short period.",
            //   icon: Icons.pause_circle_filled_rounded,
            //   isActive: false,
            //   onTap: () {},
            // ),
            // const SizedBox(height: 16),

            if (riskRatio > 2.0)
              const Text(
                "⚠️ This bill is over 2X your income. Urgent action needed!",
                style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
              ),
          ],
        ),
      ),
    );
  }
}
