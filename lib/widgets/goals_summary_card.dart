import 'package:flutter/material.dart';

class GoalsSummaryCard extends StatelessWidget {
  final String userId;
  final int goalCount;
  final double totalGoalAmount;
  final VoidCallback onAddGoal;

  const GoalsSummaryCard({
    required this.userId,
    required this.goalCount,
    required this.totalGoalAmount,
    required this.onAddGoal,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.all(13.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Goals",
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Colors.teal[800],
                  fontSize: 16,
                )),
            const SizedBox(height: 7),
            Text(
              "₹${totalGoalAmount.toStringAsFixed(0)}",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                color: Colors.green[700],
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("$goalCount active", style: const TextStyle(fontSize: 13)),
                IconButton(
                  icon: const Icon(Icons.add_circle, color: Colors.teal),
                  tooltip: "Add Goal",
                  onPressed: onAddGoal,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
