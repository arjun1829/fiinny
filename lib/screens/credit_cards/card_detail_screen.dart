import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/credit_card_cycle.dart';
import '../../models/credit_card_model.dart';
import '../../models/credit_card_payment.dart';
import '../../services/credit_card_service.dart';
import '../../services/cards/card_due_notifier.dart';
import '../../services/notification_service.dart';

class CardDetailScreen extends StatefulWidget {
  const CardDetailScreen({super.key, required this.userId, required this.card});

  final String userId;
  final CreditCardModel card;

  @override
  State<CardDetailScreen> createState() => _CardDetailScreenState();
}

class _CardDetailScreenState extends State<CardDetailScreen>
    with SingleTickerProviderStateMixin {
  final _svc = CreditCardService();
  final NotificationService _notificationService = NotificationService();
  late TabController _tab;
  CreditCardCycle? _latest;
  List<CreditCardCycle> _cycles = [];
  List<CreditCardPayment> _payments = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 3, vsync: this);
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final latest = await _svc.getLatestCycle(widget.userId, widget.card.id);
    final cycles = await _svc.listCycles(widget.userId, widget.card.id, limit: 12);
    final from = cycles.isNotEmpty
        ? cycles.last.periodStart
        : DateTime.now().subtract(const Duration(days: 365));
    final pays =
        await _svc.listPayments(widget.userId, widget.card.id, from, DateTime.now());
    if (!mounted) return;
    setState(() {
      _latest = latest;
      _cycles = cycles;
      _payments = (pays..sort((a, b) => b.date.compareTo(a.date)));
      _loading = false;
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('d MMM yyyy');

    final double total = _latest?.totalDue ?? widget.card.totalDue;
    final double paid =
        _latest?.paidAmount ?? (widget.card.isPaid ? widget.card.totalDue : 0.0);
    final double progress = total <= 0
        ? 1.0
        : ((paid / total).clamp(0.0, 1.0) as double);
    final overdue = widget.card.isOverdue;
    final chipText = overdue
        ? 'Overdue by ${DateTime.now().difference(widget.card.dueDate).inDays}d'
        : 'Due in ${widget.card.daysToDue()}d';

    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.card.bankName} • ${widget.card.last4Digits}'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          Chip(label: Text(chipText)),
                          Chip(
                            label: Text(
                              'Due: ₹${total.toStringAsFixed(0)} on ${df.format(widget.card.dueDate)}',
                            ),
                          ),
                          if (widget.card.creditLimit != null)
                            Chip(
                              label: Text(
                                'Limit: ₹${widget.card.creditLimit!.toStringAsFixed(0)}',
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      LinearProgressIndicator(value: progress),
                      const SizedBox(height: 6),
                      Text(
                        '${(progress * 100).round()}% paid',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
                TabBar(
                  controller: _tab,
                  tabs: const [
                    Tab(text: 'Overview'),
                    Tab(text: 'Statements'),
                    Tab(text: 'Payments'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    controller: _tab,
                    children: [
                      _overview(),
                      _statements(),
                      _paymentsTab(),
                    ],
                  ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddPayment,
        icon: const Icon(Icons.add),
        label: const Text('Add payment'),
      ),
    );
  }

  Widget _overview() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
      children: [
        ListTile(
          title: const Text('Autopay'),
          subtitle:
              Text((widget.card.autopayEnabled ?? false) ? 'Enabled' : 'Disabled'),
          leading: Icon((widget.card.autopayEnabled ?? false)
              ? Icons.shield
              : Icons.shield_outlined),
        ),
        if (widget.card.availableCredit != null)
          ListTile(
            title: const Text('Available credit'),
            trailing:
                Text('₹${widget.card.availableCredit!.toStringAsFixed(0)}'),
          ),
        if (widget.card.rewardsInfo != null)
          ListTile(
            title: const Text('Rewards'),
            subtitle: Text(widget.card.rewardsInfo!),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          icon: const Icon(Icons.done_all),
          label: const Text('Mark current bill paid'),
          onPressed: () async {
            final latest = _latest;
            await _svc.markCardBillPaid(
              widget.userId,
              widget.card.id,
              DateTime.now(),
            );
            if (latest != null) {
              await CardDueNotifier(_svc, _notificationService)
                  .cancelFor(widget.card.id, latest.id);
            }
            await CardDueNotifier(_svc, _notificationService)
                .scheduleAll(widget.userId);
            await _load();
            if (!mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Marked paid')),
            );
          },
        )
      ],
    );
  }

  Widget _statements() {
    final df = DateFormat('d MMM');
    if (_cycles.isEmpty) {
      return const Center(child: Text('No statements yet'));
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
      itemCount: _cycles.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final c = _cycles[i];
        return Card(
          child: ListTile(
            title: Text('${c.id}  •  Due ${df.format(c.dueDate)}'),
            subtitle: Text(
              'Period ${df.format(c.periodStart)} — ${df.format(c.periodEnd)}',
            ),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '₹${c.totalDue.toStringAsFixed(0)}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  c.status,
                  style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _paymentsTab() {
    final df = DateFormat('d MMM yyyy');
    if (_payments.isEmpty) {
      return const Center(child: Text('No payments recorded'));
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
      itemCount: _payments.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final p = _payments[i];
        return Card(
          child: ListTile(
            leading: const Icon(Icons.payments_outlined),
            title: Text('₹${p.amount.toStringAsFixed(0)}'),
            subtitle: Text(df.format(p.date)),
            trailing: Text(p.source),
          ),
        );
      },
    );
  }

  Future<void> _showAddPayment() async {
    final amountCtrl = TextEditingController();
    DateTime paidOn = DateTime.now();

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Add payment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountCtrl,
              keyboardType: TextInputType.number,
              decoration:
                  const InputDecoration(prefixText: '₹ ', labelText: 'Amount'),
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Paid on'),
              subtitle: Text(DateFormat('d MMM yyyy').format(paidOn)),
              trailing: const Icon(Icons.event),
              onTap: () async {
                final now = DateTime.now();
                final d = await showDatePicker(
                  context: context,
                  initialDate: paidOn,
                  firstDate: now.subtract(const Duration(days: 365)),
                  lastDate: now.add(const Duration(days: 1)),
                );
                if (d != null) paidOn = d;
              },
            )
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Add'),
          ),
        ],
      ),
    );

    if (ok == true) {
      final amt =
          double.tryParse(amountCtrl.text.replaceAll(',', '').trim()) ?? 0;
      if (amt <= 0) return;
      final payment = CreditCardPayment(
        id: 'manual_${DateTime.now().millisecondsSinceEpoch}',
        amount: amt,
        date: paidOn,
        source: 'manual',
      );
      await _svc.addPayment(widget.userId, widget.card.id, payment);
      final latest = await _svc.getLatestCycle(widget.userId, widget.card.id);
      if (latest != null) {
        await _svc.recomputeCycleStatus(widget.userId, widget.card.id, latest.id);
        await CardDueNotifier(_svc, _notificationService)
            .scheduleAll(widget.userId);
      }
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment added')),
      );
    }
  }
}
