import 'package:flutter/material.dart';
import '../models/credit_card_model.dart';

class CreditCardReminderWidget extends StatelessWidget {
  final List<CreditCardModel> cards;
  final void Function(CreditCardModel)?
      onTapPay; // Optional: handler for pay button

  const CreditCardReminderWidget({
    super.key,
    required this.cards,
    this.onTapPay,
  });

  @override
  Widget build(BuildContext context) {
    if (cards.isEmpty) {
      return Card(
        color: Colors.green[50],
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Icon(Icons.credit_card, color: Colors.teal[700], size: 28),
              const SizedBox(width: 16),
              const Text(
                "No upcoming credit card bills!",
                style: TextStyle(fontSize: 16, color: Colors.teal),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: cards.map((card) {
        final overdue = card.isOverdue;
        final days = card.daysToDue();
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          color: overdue ? Colors.red[50] : Colors.yellow[50],
          child: ListTile(
            leading: Icon(
              overdue ? Icons.warning_amber_rounded : Icons.credit_card,
              color: overdue ? Colors.red : Colors.amber[800],
              size: 30,
            ),
            title: Text(
              "${card.bankName} card • ${card.last4Digits}",
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: overdue ? Colors.red : Colors.black87,
              ),
            ),
            subtitle: Text(
              overdue
                  ? "Bill overdue by ${-days} days! Total due: ₹${card.totalDue.toStringAsFixed(0)}"
                  : "Due in $days days • ₹${card.totalDue.toStringAsFixed(0)} due",
              style: TextStyle(
                color: overdue ? Colors.red : Colors.orange[900],
                fontWeight: FontWeight.w500,
              ),
            ),
            trailing: card.isPaid
                ? const Icon(Icons.check_circle, color: Colors.green)
                : ElevatedButton(
                    onPressed: onTapPay != null ? () => onTapPay!(card) : null,
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
