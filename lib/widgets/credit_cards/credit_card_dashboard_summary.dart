import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/credit_card_model.dart';
import '../../services/credit_card_service.dart';
import '../../screens/credit_card_details_screen.dart';

class CreditCardDashboardSummaryCard extends StatefulWidget {
  const CreditCardDashboardSummaryCard({super.key, required this.userId});

  final String userId;

  @override
  State<CreditCardDashboardSummaryCard> createState() =>
      _CreditCardDashboardSummaryCardState();
}

class _CreditCardDashboardSummaryCardState
    extends State<CreditCardDashboardSummaryCard> {
  final CreditCardService _service = CreditCardService();
  bool _loading = true;
  List<CreditCardModel> _cards = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final cards = await _service.getUserCards(widget.userId);
      if (!mounted) return;
      setState(() {
        _cards = cards;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () async {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => CreditCardDetailsScreen(userId: widget.userId),
          ),
        );
        if (mounted) {
          _load();
        }
      },
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        elevation: 2,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: _loading
              ? const SizedBox(
                  height: 64,
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                )
              : _cards.isEmpty
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Text(
                          'Credit Cards',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                        SizedBox(height: 8),
                        Text('Add your credit cards to track dues automatically'),
                      ],
                    )
                  : _buildSummary(),
        ),
      ),
    );
  }

  Widget _buildSummary() {
    final currency = NumberFormat.currency(symbol: '₹', decimalDigits: 0);
    double totalOutstanding = 0;
    double totalMinDue = 0;
    int overdueCount = 0;
    int dueSoon = 0;
    final now = DateTime.now();

    for (final card in _cards) {
      if (!card.isPaid) {
        totalOutstanding += card.totalDue;
        totalMinDue += card.minDue;
      }
      if (card.isOverdue) {
        overdueCount++;
      } else if (!card.isPaid &&
          card.dueDate.isAfter(now) &&
          card.dueDate.difference(now).inDays <= 7) {
        dueSoon++;
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: const [
            Icon(Icons.credit_card, color: Colors.teal),
            SizedBox(width: 8),
            Text(
              'Credit Cards',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Outstanding ${currency.format(totalOutstanding)}',
          style: const TextStyle(fontSize: 15),
        ),
        Text(
          'Minimum due ${currency.format(totalMinDue)}',
          style: const TextStyle(fontSize: 13, color: Colors.black54),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            _chip(Icons.warning, Colors.redAccent, '$overdueCount overdue'),
            _chip(Icons.schedule, Colors.orange, '$dueSoon due soon'),
            _chip(Icons.layers, Colors.teal, '${_cards.length} cards'),
          ],
        ),
      ],
    );
  }

  Widget _chip(IconData icon, Color color, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: color, fontSize: 13)),
        ],
      ),
    );
  }
}
