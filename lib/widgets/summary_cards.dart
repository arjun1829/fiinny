import 'package:flutter/material.dart';
import '../services/balance_service.dart';

class SummaryCards extends StatelessWidget {
  final String userId;

  const SummaryCards({Key? key, required this.userId}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<BalanceResult>(
      stream: BalanceService().streamUserBalances(userId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return Center(child: Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: CircularProgressIndicator(),
          ));
        }
        final result = snapshot.data ??
            BalanceResult(
                netBalance: 0,
                totalOwe: 0,
                totalOwedTo: 0,
                perFriendNet: {},
                perGroupNet: {});

        final currency = "₹";
        final owed = result.totalOwe;
        final owedToYou = result.totalOwedTo;
        final net = result.netBalance;

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8),
          child: Row(
            children: [
              _SummaryCard(
                title: "You Owe",
                value: "$currency${owed.toStringAsFixed(2)}",
                color: Colors.redAccent,
                icon: Icons.remove_circle_outline,
              ),
              SizedBox(width: 8),
              _SummaryCard(
                title: "Owed To You",
                value: "$currency${owedToYou.toStringAsFixed(2)}",
                color: Colors.green,
                icon: Icons.add_circle_outline,
              ),
              SizedBox(width: 8),
              _SummaryCard(
                title: "Net",
                value: "$currency${net.toStringAsFixed(2)}",
                color: net >= 0 ? Colors.blue : Colors.red,
                icon: Icons.account_balance_wallet,
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final String value;
  final Color color;
  final IconData icon;

  const _SummaryCard({
    Key? key,
    required this.title,
    required this.value,
    required this.color,
    required this.icon,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        color: color.withOpacity(0.11),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 8),
          child: Column(
            children: [
              Icon(icon, color: color, size: 28),
              SizedBox(height: 6),
              Text(
                value,
                style: TextStyle(
                  color: color,
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                title,
                style: TextStyle(
                  color: Colors.black87,
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
