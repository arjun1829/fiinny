import 'package:flutter/material.dart';

import '../models/credit_card_cycle.dart';
import '../models/credit_card_model.dart';
import '../services/credit_card_service.dart';
import '../services/cards/card_due_notifier.dart';
import '../services/notification_service.dart';
import 'credit_cards/add_card_sheet.dart';
import 'credit_cards/card_detail_screen.dart';

class CreditCardDetailsScreen extends StatefulWidget {
  const CreditCardDetailsScreen({super.key, required this.userId});

  final String userId;

  @override
  State<CreditCardDetailsScreen> createState() =>
      _CreditCardDetailsScreenState();
}

class _CreditCardDetailsScreenState extends State<CreditCardDetailsScreen> {
  final _svc = CreditCardService();
  final NotificationService _notificationService = NotificationService();
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
      _cards = await _svc.getUserCards(widget.userId);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error loading cards: $e')),
      );
    }
    if (!mounted) return;
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('💳 Credit Cards'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _load,
          ),
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add Card',
            onPressed: () async {
              final added = await showModalBottomSheet<bool>(
                context: context,
                isScrollControlled: true,
                useSafeArea: true,
                builder: (_) => AddCardSheet(userId: widget.userId),
              );
              if (added == true) await _load();
            },
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _cards.isEmpty
              ? const Center(child: Text('No cards found. Add your first!'))
              : ListView.builder(
                  itemCount: _cards.length,
                  itemBuilder: (ctx, i) {
                    final card = _cards[i];
                    return _CardTile(
                      userId: widget.userId,
                      card: card,
                      svc: _svc,
                      notificationService: _notificationService,
                    );
                  },
                ),
    );
  }
}

class _CardTile extends StatefulWidget {
  const _CardTile({
    required this.userId,
    required this.card,
    required this.svc,
    required this.notificationService,
  });

  final String userId;
  final CreditCardModel card;
  final CreditCardService svc;
  final NotificationService notificationService;

  @override
  State<_CardTile> createState() => _CardTileState();
}

class _CardTileState extends State<_CardTile> {
  CreditCardCycle? _latest;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final cyc = await widget.svc.getLatestCycle(widget.userId, widget.card.id);
    if (!mounted) return;
    setState(() => _latest = cyc);
  }

  @override
  Widget build(BuildContext context) {
    final days = widget.card.daysToDue();
    final overdue = widget.card.isOverdue;
    final dueLabel = overdue
        ? 'Overdue by ${DateTime.now().difference(widget.card.dueDate).inDays}d'
        : 'Due in ${days}d';

    final paid = _latest?.paidAmount ??
        (widget.card.isPaid ? widget.card.totalDue : 0);
    final total = _latest?.totalDue ?? widget.card.totalDue;
    final progress = total <= 0 ? 1.0 : (paid / total).clamp(0.0, 1.0);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 7, horizontal: 16),
      child: ListTile(
        leading: CircleAvatar(
          child: Icon(overdue ? Icons.error_outline : Icons.credit_card),
        ),
        title: Text('${widget.card.bankName} • ${widget.card.last4Digits}'),
        subtitle: Text('$dueLabel • Due: ₹${total.toStringAsFixed(0)}'),
        trailing: SizedBox(
          width: 72,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              LinearProgressIndicator(value: progress),
              const SizedBox(height: 6),
              Text(
                '${(progress * 100).round()}% paid',
                style: const TextStyle(fontSize: 11),
              ),
            ],
          ),
        ),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => CardDetailScreen(
                userId: widget.userId,
                card: widget.card,
              ),
            ),
          );
        },
        onLongPress: () async {
          final ok = await showDialog<bool>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Mark bill paid?'),
                  content: const Text(
                    'This will add a manual payment for the remaining due.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Mark paid'),
                    ),
                  ],
                ),
              ) ??
              false;
          if (ok) {
            final latest = _latest;
            await widget.svc
                .markCardBillPaid(widget.userId, widget.card.id, DateTime.now());
            if (latest != null) {
              await CardDueNotifier(widget.svc, widget.notificationService)
                  .cancelFor(widget.card.id, latest.id);
            }
            await CardDueNotifier(widget.svc, widget.notificationService)
                .scheduleAll(widget.userId);
            await _load();
            if (!mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Marked paid')),
            );
          }
        },
      ),
    );
  }
}
