import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/goal_model.dart';

class GoalCard extends StatelessWidget {
  final GoalModel goal;
  final VoidCallback onDelete;
  final VoidCallback? onTap;

  const GoalCard({
    Key? key,
    required this.goal,
    required this.onDelete,
    this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final progress = (goal.savedAmount / goal.targetAmount).clamp(0.0, 1.0);
    final isCompleted = goal.savedAmount >= goal.targetAmount;
    final percentString = (progress * 100).toStringAsFixed(0);
    final currencyFormat = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(24),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header Row
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Icon Box
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: isCompleted ? const Color(0xFFD1FAE5) : const Color(0xFFE0F2FE), // emerald-100 : blue-100
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Center(
                        child: isCompleted
                            ? const Icon(Icons.check_circle_rounded, color: Color(0xFF059669), size: 24) // emerald-600
                            : const Icon(Icons.track_changes_rounded, color: Color(0xFF2563EB), size: 24), // blue-600
                      ),
                    ),
                    const SizedBox(width: 14),
                    // Title & Date
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            goal.title,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF0F172A), // slate-900
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Icon(Icons.calendar_today_rounded, size: 12, color: Colors.grey.shade500),
                              const SizedBox(width: 4),
                              Text(
                                DateFormat('MMM d, yyyy').format(goal.targetDate),
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.grey.shade500,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    // Delete Button
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, size: 20),
                      color: Colors.grey.shade400,
                      onPressed: onDelete,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                      splashRadius: 20,
                    ),
                  ],
                ),
                
                const SizedBox(height: 20),
                
                // Amounts Row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Saved
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Saved",
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade400, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          currencyFormat.format(goal.savedAmount),
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                        ),
                      ],
                    ),
                    // Target
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          "Target",
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade400, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          currencyFormat.format(goal.targetAmount),
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                        ),
                      ],
                    ),
                  ],
                ),

                const SizedBox(height: 12),

                // Progress Bar
                Container(
                  height: 10,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: progress,
                    child: Container(
                      decoration: BoxDecoration(
                        color: isCompleted ? const Color(0xFF10B981) : const Color(0xFF3B82F6), // emerald-500 : blue-500
                        borderRadius: BorderRadius.circular(100),
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 8),

                // Footer Text
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      "$percentString% Complete",
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isCompleted ? const Color(0xFF059669) : const Color(0xFF2563EB),
                      ),
                    ),
                     Text(
                      isCompleted
                          ? "Goal Reached!"
                          : "${currencyFormat.format(goal.targetAmount - goal.savedAmount)} to go",
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade400, fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
