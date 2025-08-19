// screens/bills_overview_screen.dart

import 'package:flutter/material.dart';
import '../models/bill_model.dart'; // You should have this model, else let me know!
import '../services/bill_service.dart'; // Create a BillService (just like CreditCardService)
import '../models/credit_card_model.dart';
import '../services/credit_card_service.dart';

class BillsOverviewScreen extends StatefulWidget {
  final String userId;
  const BillsOverviewScreen({Key? key, required this.userId}) : super(key: key);

  @override
  State<BillsOverviewScreen> createState() => _BillsOverviewScreenState();
}

class _BillsOverviewScreenState extends State<BillsOverviewScreen> {
  List<BillModel> _bills = [];
  List<CreditCardModel> _cards = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchBills();
  }

  Future<void> _fetchBills() async {
    setState(() => _loading = true);
    try {
      final bills = await BillService().getUserBills(widget.userId);
      final cards = await CreditCardService().getUserCards(widget.userId);
      setState(() {
        _bills = bills;
        _cards = cards;
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error fetching bills: $e')),
      );
    }
    setState(() => _loading = false);
  }

  Future<void> _markBillPaid(BillModel bill) async {
    await BillService().markBillPaid(widget.userId, bill.id, DateTime.now());
    await _fetchBills();
  }

  Future<void> _markCardPaid(CreditCardModel card) async {
    await CreditCardService().markCardBillPaid(widget.userId, card.id, DateTime.now());
    await _fetchBills();
  }

  @override
  Widget build(BuildContext context) {
    final allBills = [
      ..._bills.map((b) => _BillEntry(bill: b, onPaid: () => _markBillPaid(b))),
      ..._cards.where((c) => !c.isPaid).map((c) => _CardBillEntry(card: c, onPaid: () => _markCardPaid(c))),
    ];
    allBills.sort((a, b) {
      final aDue = a is _BillEntry ? a.bill.dueDate : (a as _CardBillEntry).card.dueDate;
      final bDue = b is _BillEntry ? b.bill.dueDate : (b as _CardBillEntry).card.dueDate;
      return aDue.compareTo(bDue);
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Upcoming Bills')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : allBills.isEmpty
          ? const Center(child: Text('No upcoming bills!'))
          : ListView(
        padding: const EdgeInsets.all(16),
        children: allBills,
      ),
    );
  }
}

// For utility, rent, etc.
class _BillEntry extends StatelessWidget {
  final BillModel bill;
  final VoidCallback onPaid;
  const _BillEntry({required this.bill, required this.onPaid});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: bill.isPaid ? Colors.green[50] : Colors.orange[50],
      margin: const EdgeInsets.only(bottom: 14),
      child: ListTile(
        leading: Icon(Icons.receipt_long, color: bill.isPaid ? Colors.green : Colors.orange, size: 29),
        title: Text(bill.name, style: TextStyle(fontWeight: FontWeight.bold, color: bill.isPaid ? Colors.green[900] : Colors.orange[900])),
        subtitle: Text("₹${bill.amount.toStringAsFixed(0)} • Due ${bill.dueDate.day}/${bill.dueDate.month}"),
        trailing: bill.isPaid
            ? const Icon(Icons.check_circle_rounded, color: Colors.green)
            : IconButton(
          icon: const Icon(Icons.check, color: Colors.teal),
          tooltip: 'Mark as Paid',
          onPressed: onPaid,
        ),
      ),
    );
  }
}

// For credit card bills
class _CardBillEntry extends StatelessWidget {
  final CreditCardModel card;
  final VoidCallback onPaid;
  const _CardBillEntry({required this.card, required this.onPaid});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: card.isPaid ? Colors.green[50] : Colors.blue[50],
      margin: const EdgeInsets.only(bottom: 14),
      child: ListTile(
        leading: Icon(Icons.credit_card, color: card.isPaid ? Colors.green : Colors.blue, size: 28),
        title: Text("${card.bankName} Card", style: TextStyle(fontWeight: FontWeight.bold, color: card.isPaid ? Colors.green[900] : Colors.blue[900])),
        subtitle: Text("₹${card.totalDue.toStringAsFixed(0)} • Due ${card.dueDate.day}/${card.dueDate.month}"),
        trailing: card.isPaid
            ? const Icon(Icons.check_circle_rounded, color: Colors.green)
            : IconButton(
          icon: const Icon(Icons.check, color: Colors.teal),
          tooltip: 'Mark as Paid',
          onPressed: onPaid,
        ),
      ),
    );
  }
}
