import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../models/friend_model.dart';

// Use this as the tile for both expense and income
class TransactionTile extends StatelessWidget {
  final dynamic transaction; // ExpenseItem or IncomeItem
  final Map<String, FriendModel>? friendsById;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onSplit;

  const TransactionTile({
    super.key,
    required this.transaction,
    this.friendsById,
    this.onEdit,
    this.onDelete,
    this.onSplit,
  });

  @override
  Widget build(BuildContext context) {
    final bool isIncome = transaction is IncomeItem;
    final bool isExpense = transaction is ExpenseItem;

    String mainText;
    String subtitleText = '';
    String trailingText;
    IconData icon;
    Color color;

    if (isIncome) {
      final item = transaction as IncomeItem;
      mainText = "${item.type}: ₹${item.amount.toStringAsFixed(2)}";
      subtitleText = item.note;
      trailingText = "Income";
      icon = Icons.arrow_downward;
      color = Colors.green;
    } else if (isExpense) {
      final item = transaction as ExpenseItem;
      mainText = "${item.type}: ₹${item.amount.toStringAsFixed(2)}";
      subtitleText = item.note;
      trailingText = "Expense";
      icon = Icons.arrow_upward;
      color = Colors.pinkAccent;
    } else {
      mainText = "Transaction";
      trailingText = "";
      icon = Icons.swap_horiz;
      color = Colors.grey;
    }

    String dateStr = "";
    if (transaction.date != null) {
      final d = transaction.date;
      dateStr = "${d.day}/${d.month}/${d.year}";
    }

    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(mainText),
      subtitle: Text("$subtitleText\n$dateStr"),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (onEdit != null)
            IconButton(
              icon: Icon(Icons.edit, color: Colors.blue),
              tooltip: 'Edit',
              onPressed: onEdit,
            ),
          if (onDelete != null)
            IconButton(
              icon: Icon(Icons.delete, color: Colors.red),
              tooltip: 'Delete',
              onPressed: onDelete,
            ),
          if (isExpense && onSplit != null)
            IconButton(
              icon: Icon(Icons.call_split, color: Colors.orange),
              tooltip: 'Split',
              onPressed: onSplit,
            ),
        ],
      ),
      isThreeLine: true,
      onTap: () {
        // Optional: tap can show detail, if you want
      },
    );
  }
}
