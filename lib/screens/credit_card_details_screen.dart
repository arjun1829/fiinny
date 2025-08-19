import 'package:flutter/material.dart';
import '../models/credit_card_model.dart'; // Make sure this model exists!
import '../services/credit_card_service.dart'; // Service to fetch cards

class CreditCardDetailsScreen extends StatefulWidget {
  final String userId;
  const CreditCardDetailsScreen({Key? key, required this.userId}) : super(key: key);

  @override
  State<CreditCardDetailsScreen> createState() => _CreditCardDetailsScreenState();
}

class _CreditCardDetailsScreenState extends State<CreditCardDetailsScreen> {
  bool _loading = true;
  List<CreditCardModel> _cards = [];

  @override
  void initState() {
    super.initState();
    _loadCards();
  }

  Future<void> _loadCards() async {
    setState(() => _loading = true);
    try {
      _cards = await CreditCardService().getUserCards(widget.userId);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error loading cards: $e')),
      );
    }
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("💳 Credit Cards"),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: "Add Card",
            onPressed: () async {
              // Implement add card logic/screen here
              // If card added: await _loadCards();
            },
          )
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _cards.isEmpty
          ? const Center(child: Text("No cards found. Add your first!"))
          : ListView.builder(
        itemCount: _cards.length,
        itemBuilder: (ctx, i) {
          final card = _cards[i];
          return Card(
            margin: const EdgeInsets.symmetric(vertical: 7, horizontal: 16),
            child: ListTile(
              leading: const Icon(Icons.credit_card, color: Colors.teal, size: 28),
              title: Text("${card.bankName} - ${card.last4Digits}"),
              subtitle: Text("Due: ₹${card.totalDue.toStringAsFixed(0)}  |  Due Date: ${card.dueDate.day}/${card.dueDate.month}"),
              trailing: card.isPaid
                  ? const Icon(Icons.check_circle, color: Colors.green)
                  : const Icon(Icons.error_outline, color: Colors.red),
              onTap: () {
                // You can implement a details view if needed
              },
            ),
          );
        },
      ),
    );
  }
}
