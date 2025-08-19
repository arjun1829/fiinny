import 'package:flutter/material.dart';
import '../models/transaction_item.dart';

class DebitCreditList extends StatelessWidget {
  final List<TransactionItem> transactions;
  const DebitCreditList({required this.transactions, Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (transactions.isEmpty) {
      return Center(child: Text("No transactions found."));
    }
    return ListView.separated(
      itemCount: transactions.length,
      separatorBuilder: (context, i) => Divider(height: 0),
      itemBuilder: (context, i) {
        final t = transactions[i];
        return ListTile(
          leading: CircleAvatar(
            backgroundColor:
            t.type == TransactionType.credit ? Colors.green[100] : Colors.red[100],
            child: Icon(
              t.type == TransactionType.credit ? Icons.arrow_downward : Icons.arrow_upward,
              color: t.type == TransactionType.credit ? Colors.green : Colors.red,
            ),
          ),
          title: Text(
            "${t.category} ${t.note.isNotEmpty ? '(${t.note})' : ''}",
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            "${t.date.day}/${t.date.month}/${t.date.year}",
            style: TextStyle(fontSize: 13),
          ),
          trailing: Text(
            "₹${t.amount.toStringAsFixed(2)}",
            style: TextStyle(
                fontWeight: FontWeight.bold,
                color: t.type == TransactionType.credit ? Colors.green : Colors.red),
          ),
        );
      },
    );
  }
}
