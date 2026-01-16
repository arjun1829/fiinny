import 'package:flutter/material.dart';

class CrisisAlertBanner extends StatelessWidget {
  final String userId;
  final double totalIncome;
  final double totalExpense;
  final double? totalLoan; // Optional: can trigger different crisis later
  final double? totalAssets;
  final String? customMessage;

  const CrisisAlertBanner({
    Key? key,
    required this.userId,
    required this.totalIncome,
    required this.totalExpense,
    this.totalLoan,
    this.totalAssets,
    this.customMessage,
  }) : super(key: key);

  bool get isCrisis => totalExpense > totalIncome;

  String get crisisMessage {
    if (customMessage != null && customMessage!.isNotEmpty) return customMessage!;
    if (totalExpense > totalIncome) {
      return "⚠️ High expenses alert! You’ve spent more than your income this month.";
    }
    // Example: Add more crisis types if needed
    // if ((totalLoan ?? 0) > (totalAssets ?? 0)) return "⚠️ Loan crisis! Your debt is greater than assets.";
    return "";
  }

  @override
  Widget build(BuildContext context) {
    if (!isCrisis) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.redAccent.withValues(alpha: 0.90),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.red.withValues(alpha: 0.22),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Colors.white),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              crisisMessage,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 15.2,
                letterSpacing: 0.05,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
