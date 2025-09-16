import 'package:flutter/material.dart';

class LoansSummaryCard extends StatelessWidget {
  final String userId;
  final int loanCount;
  final double totalLoan;
  final VoidCallback onAddLoan;

  // NEW:
  final int pendingSuggestions;               // default 0
  final VoidCallback? onReviewSuggestions;    // open review sheet

  const LoansSummaryCard({
    required this.userId,
    required this.loanCount,
    required this.totalLoan,
    required this.onAddLoan,
    this.pendingSuggestions = 0,
    this.onReviewSuggestions,
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Card(
          elevation: 3,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          child: Padding(
            padding: const EdgeInsets.all(13.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Text("Loans", style: TextStyle(fontWeight: FontWeight.bold, color: Colors.teal[800], fontSize: 16)),
                  const SizedBox(width: 8),
                  if (pendingSuggestions > 0)
                    GestureDetector(
                      onTap: onReviewSuggestions,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.orange.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text('New detected • $pendingSuggestions', style: TextStyle(color: Colors.orange[900], fontSize: 11, fontWeight: FontWeight.w700)),
                      ),
                    ),
                ]),
                const SizedBox(height: 7),
                Text("₹${totalLoan.toStringAsFixed(0)}",
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.red[400])),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text("$loanCount active", style: const TextStyle(fontSize: 13)),
                    Row(children: [
                      if (onReviewSuggestions != null)
                        IconButton(
                          icon: const Icon(Icons.search_rounded, color: Colors.teal),
                          tooltip: "Review Detected Loans",
                          onPressed: onReviewSuggestions,
                        ),
                      IconButton(
                        icon: const Icon(Icons.add_circle, color: Colors.teal),
                        tooltip: "Add Loan",
                        onPressed: onAddLoan,
                      ),
                    ]),
                  ],
                )
              ],
            ),
          ),
        ),
      ],
    );
  }
}
