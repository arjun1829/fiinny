import 'package:flutter/material.dart';
import '../services/fiinny_brain_service.dart';
import '../models/insight_model.dart';
import '../services/user_data.dart'; // Your app's existing user data

class FiinnyBrainSummary extends StatelessWidget {
  final UserData userData;

  const FiinnyBrainSummary({Key? key, required this.userData}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    List<InsightModel> insights = FiinnyBrainService.generateInsights(userData);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      color: Colors.white.withOpacity(0.9),
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("🧠 Fiinny Brain Summary",
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            const SizedBox(height: 12),
            ...insights.take(3).map((insight) => Padding(
              padding: const EdgeInsets.only(bottom: 8.0),
              child: Text("• ${insight.title}"),
            )),
            const SizedBox(height: 8),
            if (insights.isNotEmpty)
              TextButton(
                onPressed: () {
                  // Optional: navigate to full insight feed screen
                },
                child: const Text("View All Insights"),
              )
            else
              const Text("✅ All good this week!"),
          ],
        ),
      ),
    );
  }
}
