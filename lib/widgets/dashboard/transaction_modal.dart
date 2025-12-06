import 'package:flutter/material.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';
import '../../themes/tokens.dart';

class TransactionModal extends StatefulWidget {
  final ExpenseItem? expense;
  final IncomeItem? income;
  final String userPhone;
  final Function(dynamic updated) onSave;
  final Function(String id) onDelete;

  const TransactionModal({
    Key? key,
    this.expense,
    this.income,
    required this.userPhone,
    required this.onSave,
    required this.onDelete,
  }) : super(key: key);

  @override
  State<TransactionModal> createState() => _TransactionModalState();
}

class _TransactionModalState extends State<TransactionModal> {
  // Simple view for now
  @override
  Widget build(BuildContext context) {
    final isExpense = widget.expense != null;
    final id = isExpense ? widget.expense!.id : widget.income!.id;
    final amount = isExpense ? widget.expense!.amount : widget.income!.amount;
    final category = isExpense ? widget.expense!.category : widget.income!.category;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(isExpense ? "Edit Expense" : "Edit Income", style: Fx.title),
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
            ],
          ),
          const SizedBox(height: 24),
          // Placeholder details
          ListTile(
            leading: Icon(isExpense ? Icons.arrow_downward : Icons.arrow_upward, color: isExpense ? Colors.red : Colors.green),
            title: Text(category ?? 'Unknown', style: Fx.label),
            trailing: Text("₹$amount", style: Fx.number.copyWith(fontSize: 18)),
          ),
          const SizedBox(height: 32),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {
                    widget.onDelete(id);
                    Navigator.pop(context);
                  },
                  icon: const Icon(Icons.delete, color: Colors.red),
                  label: const Text("Delete", style: TextStyle(color: Colors.red)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    side: const BorderSide(color: Colors.red),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {
                    // Logic to save
                    Navigator.pop(context);
                  },
                  icon: const Icon(Icons.save),
                  label: const Text("Save"),
                   style: ElevatedButton.styleFrom(
                    backgroundColor: Fx.mint,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
