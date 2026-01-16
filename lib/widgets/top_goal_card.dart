import 'package:flutter/material.dart';
import '../models/goal_model.dart';

class TopGoalCard extends StatelessWidget {
  final GoalModel goal;

  const TopGoalCard({Key? key, required this.goal}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    double percent = goal.savedAmount / (goal.targetAmount == 0 ? 1 : goal.targetAmount);
    percent = percent.clamp(0.0, 1.0);
    final int daysLeft = goal.targetDate.difference(DateTime.now()).inDays;
    final String progressPhrase = percent >= 1
        ? "Goal completed! 🏆"
        : "You’re ${((percent) * 100).toStringAsFixed(0)}% there. ${daysLeft > 0 ? "$daysLeft days left!" : "Target date reached!"}";

    return Card(
      elevation: 5,
      color: Colors.white.withValues(alpha: 0.97),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 18.0, horizontal: 22.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(goal.emoji ?? "🎯", style: const TextStyle(fontSize: 36)),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    goal.title,
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Progress Bar
            LinearProgressIndicator(
              value: percent,
              minHeight: 12,
              backgroundColor: Colors.grey.shade300,
              color: percent >= 1 ? Colors.green : Colors.deepPurpleAccent,
              borderRadius: BorderRadius.circular(8),
            ),
            const SizedBox(height: 10),
            Text(
              "Target: ₹${goal.targetAmount.toStringAsFixed(0)}  •  Saved: ₹${goal.savedAmount.toStringAsFixed(0)}",
              style: const TextStyle(fontSize: 14, color: Colors.black54),
            ),
            const SizedBox(height: 6),
            Text(
              "By: ${goal.targetDate.day}/${goal.targetDate.month}/${goal.targetDate.year}",
              style: const TextStyle(fontSize: 13, color: Colors.deepPurple),
            ),
            const SizedBox(height: 8),
            Text(
              progressPhrase,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: percent >= 1 ? Colors.green : Colors.deepPurpleAccent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
