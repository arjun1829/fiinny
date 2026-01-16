import 'package:flutter/material.dart';
import '../models/bill_model.dart';

class BillReminderWidget extends StatelessWidget {
  final List<BillModel> bills;
  final void Function(BillModel)?
      onTapPay; // Optional callback for marking bill as paid

  const BillReminderWidget({
    super.key,
    required this.bills,
    this.onTapPay,
  });

  @override
  Widget build(BuildContext context) {
    if (bills.isEmpty) {
      return Card(
        color: Colors.green[50],
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Icon(Icons.receipt_long_rounded,
                  color: Colors.teal[700], size: 28),
              const SizedBox(width: 16),
              const Text(
                "No upcoming bills!",
                style: TextStyle(fontSize: 16, color: Colors.teal),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: bills.map((bill) {
        final overdue = bill.isOverdue;
        final days = bill.daysToDue();
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          color: overdue ? Colors.red[50] : Colors.yellow[50],
          child: ListTile(
            leading: Icon(
              overdue
                  ? Icons.warning_amber_rounded
                  : Icons.receipt_long_rounded,
              color: overdue ? Colors.red : Colors.amber[800],
              size: 30,
            ),
            title: Text(
              "${bill.name} • ${bill.billType}",
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: overdue ? Colors.red : Colors.black87,
              ),
            ),
            subtitle: Text(
              overdue
                  ? "Overdue by ${-days} days • ₹${bill.amount.toStringAsFixed(0)}"
                  : "Due in $days days • ₹${bill.amount.toStringAsFixed(0)}",
              style: TextStyle(
                color: overdue ? Colors.red : Colors.orange[900],
                fontWeight: FontWeight.w500,
              ),
            ),
            trailing: bill.isPaid
                ? const Icon(Icons.check_circle, color: Colors.green)
                : ElevatedButton(
                    onPressed: onTapPay != null ? () => onTapPay!(bill) : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor:
                          overdue ? Colors.red : Colors.orange[800],
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 10),
                      textStyle: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    child: Text(overdue ? "Pay Now" : "Pay"),
                  ),
          ),
        );
      }).toList(),
    );
  }
}
