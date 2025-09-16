import 'package:flutter/material.dart';

class SplitsSummaryCard extends StatelessWidget {
  final String userId;
  final double youOwe;     // total you need to pay
  final double owedToYou;  // total you'll receive
  final VoidCallback onOpenFriends;

  const SplitsSummaryCard({
    required this.userId,
    required this.youOwe,
    required this.owedToYou,
    required this.onOpenFriends,
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
            Text("Splits",
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Colors.teal[800],
                  fontSize: 16,
                )),
            const SizedBox(height: 7),
            // Two-line summary
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("You pay",
                    style: TextStyle(fontSize: 13, color: Colors.grey[800])),
                Text("₹${youOwe.toStringAsFixed(0)}",
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Colors.red[400],
                        fontSize: 16)),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("You get",
                    style: TextStyle(fontSize: 13, color: Colors.grey[800])),
                Text("₹${owedToYou.toStringAsFixed(0)}",
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Colors.green[700],
                        fontSize: 16)),
              ],
            ),
            const SizedBox(height: 6),
            // CTA icon (same feel as other cards)
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                icon: const Icon(Icons.group_rounded, color: Colors.teal),
                tooltip: "Open Friends",
                onPressed: onOpenFriends,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
