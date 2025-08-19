import 'package:flutter/material.dart';

class LoansSummaryCard extends StatelessWidget {
  final String userId;
  final int loanCount;
  final double totalLoan;
  final VoidCallback onAddLoan;

  const LoansSummaryCard({
    required this.userId,
    required this.loanCount,
    required this.totalLoan,
    required this.onAddLoan,
    Key? key,
  }) : super(key: key);

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
            Text("Loans", style: TextStyle(fontWeight: FontWeight.bold, color: Colors.teal[800], fontSize: 16)),
            SizedBox(height: 7),
            Text("₹${totalLoan.toStringAsFixed(0)}", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.red[400])),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("$loanCount active", style: TextStyle(fontSize: 13)),
                IconButton(
                  icon: Icon(Icons.add_circle, color: Colors.teal),
                  tooltip: "Add Loan",
                  onPressed: onAddLoan,
                ),
              ],
            )
          ],
        ),
      ),
    );
  }
}
