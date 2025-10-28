import 'package:flutter/material.dart';

import '../models/bill_model.dart';
import '../models/credit_card_model.dart';
import '../services/bill_service.dart';
import '../services/credit_card_service.dart';

class BillsOverviewScreen extends StatefulWidget {
  const BillsOverviewScreen({super.key, required this.userId});

  final String userId;

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
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error fetching bills: $e')),
      );
    }
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  Future<void> _markBillPaid(BillModel bill) async {
    await BillService().markBillPaid(widget.userId, bill.id, DateTime.now());
    await _fetchBills();
  }

  Future<void> _markCardPaid(CreditCardModel card) async {
    await CreditCardService()
        .markCardBillPaid(widget.userId, card.id, DateTime.now());
    await _fetchBills();
  }

  @override
  Widget build(BuildContext context) {
    final allBills = [
      ..._bills.map(
        (b) => _BillEntry(
          bill: b,
          onPaid: () => _markBillPaid(b),
        ),
      ),
      ..._cards
          .where((c) => !c.isPaid)
          .map(
            (c) => _CardBillEntry(
              card: c,
              onPaid: () => _markCardPaid(c),
            ),
          ),
    ];
    allBills.sort((a, b) {
      DateTime dueOf(dynamic entry) {
        if (entry is _BillEntry) return entry.bill.dueDate;
        final card = (entry as _CardBillEntry).card;
        return card.dueDate;
      }

      return dueOf(a).compareTo(dueOf(b));
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

class _BillEntry extends StatelessWidget {
  const _BillEntry({required this.bill, required this.onPaid});

  final BillModel bill;
  final VoidCallback onPaid;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: bill.isPaid ? Colors.green[50] : Colors.orange[50],
      margin: const EdgeInsets.only(bottom: 14),
      child: ListTile(
        leading: Icon(
          Icons.receipt_long,
          color: bill.isPaid ? Colors.green : Colors.orange,
          size: 29,
        ),
        title: Text(
          bill.name,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: bill.isPaid ? Colors.green[900] : Colors.orange[900],
          ),
        ),
        subtitle: Text(
          '₹${bill.amount.toStringAsFixed(0)} • Due ${bill.dueDate.day}/${bill.dueDate.month}',
        ),
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

class _CardBillEntry extends StatelessWidget {
  const _CardBillEntry({required this.card, required this.onPaid});

  final CreditCardModel card;
  final VoidCallback onPaid;

  @override
  Widget build(BuildContext context) {
    final totalDue = card.totalDue;
    final due = card.dueDate;
    final dueText = '${due.day}/${due.month}';

    return Card(
      color: card.isPaid ? Colors.green[50] : Colors.blue[50],
      margin: const EdgeInsets.only(bottom: 14),
      child: ListTile(
        leading: Icon(
          Icons.credit_card,
          color: card.isPaid ? Colors.green : Colors.blue,
          size: 28,
        ),
        title: Text(
          '${card.bankName} Card',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: card.isPaid ? Colors.green[900] : Colors.blue[900],
          ),
        ),
        subtitle: Text('₹${totalDue.toStringAsFixed(0)} • Due $dueText'),
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
