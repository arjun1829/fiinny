import 'package:flutter/material.dart';
import '../models/loan_model.dart';
import '../services/loan_service.dart';

class LoansScreen extends StatefulWidget {
  final String userId;
  const LoansScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<LoansScreen> createState() => _LoansScreenState();
}

class _LoansScreenState extends State<LoansScreen> {
  late Future<List<LoanModel>> _loansFuture;

  @override
  void initState() {
    super.initState();
    _fetchLoans();
  }

  void _fetchLoans() {
    _loansFuture = LoanService().getLoans(widget.userId);
  }

  Future<void> _deleteLoan(LoanModel loan) async {
    await LoanService().deleteLoan(loan.id!);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Loan "${loan.title}" deleted!'), backgroundColor: Colors.red),
    );
    setState(_fetchLoans);
  }

  void _showLoanDetails(LoanModel loan) async {
    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(
              loan.isClosed ? Icons.verified_rounded : Icons.account_balance_wallet_rounded,
              color: loan.isClosed ? Colors.green : Colors.deepPurple,
            ),
            SizedBox(width: 8),
            Expanded(child: Text(loan.title)),
            if (loan.isClosed)
              Container(
                margin: EdgeInsets.only(left: 8),
                padding: EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.green[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text("Closed", style: TextStyle(color: Colors.green[800], fontWeight: FontWeight.w600)),
              ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Amount: ₹${loan.amount.toStringAsFixed(0)}"),
            Text("Lender: ${loan.lenderType}"),
            if (loan.startDate != null)
              Text("Start Date: ${loan.startDate!.day}/${loan.startDate!.month}/${loan.startDate!.year}"),
            if (loan.dueDate != null)
              Text("Due Date: ${loan.dueDate!.day}/${loan.dueDate!.month}/${loan.dueDate!.year}"),
            if (loan.interestRate != null)
              Text("Interest Rate: ${loan.interestRate}%"),
            if (loan.emi != null)
              Text("EMI: ₹${loan.emi}"),
            if (loan.note != null && loan.note!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text("Note: ${loan.note}"),
              ),
            if (loan.isClosed)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text("Status: Closed", style: TextStyle(color: Colors.green[700], fontWeight: FontWeight.w600)),
              ),
            if (loan.createdAt != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text("Added: ${loan.createdAt!.day}/${loan.createdAt!.month}/${loan.createdAt!.year}"),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _confirmDeleteLoan(loan);
            },
            child: const Text("Delete", style: TextStyle(color: Colors.red)),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text("Close"),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDeleteLoan(LoanModel loan) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Loan?'),
        content: Text('Are you sure you want to delete "${loan.title}"? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _deleteLoan(loan);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Your Loans"),
      ),
      body: FutureBuilder<List<LoanModel>>(
        future: _loansFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return const Center(child: Text("No loans found."));
          }
          final loans = snapshot.data!;
          // Sort: open loans first, then closed, then by date desc
          loans.sort((a, b) {
            if (a.isClosed != b.isClosed) {
              return a.isClosed ? 1 : -1;
            }
            final aDate = a.startDate ?? DateTime(2000);
            final bDate = b.startDate ?? DateTime(2000);
            return bDate.compareTo(aDate);
          });
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: loans.length,
            separatorBuilder: (_, __) => const Divider(height: 16),
            itemBuilder: (context, i) {
              final loan = loans[i];
              return Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 3,
                color: loan.isClosed ? Colors.green[50] : null,
                child: ListTile(
                  leading: Icon(
                    loan.isClosed ? Icons.verified_rounded : Icons.account_balance_wallet_rounded,
                    color: loan.isClosed ? Colors.green : Colors.deepPurple,
                  ),
                  title: Text(loan.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("Amount: ₹${loan.amount.toStringAsFixed(0)}"),
                      Text("Lender: ${loan.lenderType}"),
                      if (loan.emi != null) Text("EMI: ₹${loan.emi}"),
                      if (loan.interestRate != null) Text("Interest: ${loan.interestRate}%"),
                      if (loan.dueDate != null)
                        Text("Due: ${loan.dueDate!.day}/${loan.dueDate!.month}/${loan.dueDate!.year}"),
                      if (loan.isClosed)
                        Text("Closed", style: TextStyle(color: Colors.green[700], fontWeight: FontWeight.w600)),
                    ],
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    onPressed: () => _confirmDeleteLoan(loan),
                  ),
                  onTap: () => _showLoanDetails(loan),
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        child: const Icon(Icons.add),
        onPressed: () async {
          final added = await Navigator.pushNamed(context, '/addLoan', arguments: widget.userId);
          if (added == true) setState(_fetchLoans);
        },
      ),
    );
  }
}
