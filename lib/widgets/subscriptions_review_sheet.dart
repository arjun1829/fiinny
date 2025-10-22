import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../models/expense_item.dart';
import '../themes/tokens.dart';
import '../themes/badge.dart';
import '../themes/glass_card.dart';

class SubscriptionsReviewSheet extends StatefulWidget {
  final String userId;
  final int daysWindow;
  final List<ExpenseItem>? prefetched;

  const SubscriptionsReviewSheet({
    super.key,
    required this.userId,
    this.daysWindow = 180,
    this.prefetched,
  });

  @override
  State<SubscriptionsReviewSheet> createState() => _SubscriptionsReviewSheetState();
}

class _SubscriptionsReviewSheetState extends State<SubscriptionsReviewSheet> {
  bool _loading = true;
  final Map<String, List<ExpenseItem>> _groups = {};
  final _q = TextEditingController();
  String _sort = 'count_desc'; // count_desc | amount_desc | newest
  static final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  String _keyFor(ExpenseItem e) {
    final meta = (e.toJson()['brainMeta'] as Map?)?.cast<String, dynamic>();
    final merchant = (meta?['merchant'] as String?) ?? e.label ?? e.category ?? 'Merchant';
    final bucket = ((e.amount / 10).round() * 10).toString();
    return '${merchant.toLowerCase()}|$bucket';
  }

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    if (widget.prefetched != null) {
      for (final e in widget.prefetched!) {
        _groups.putIfAbsent(_keyFor(e), () => []).add(e);
      }
      if (mounted) setState(() => _loading = false);
      return;
    }
    await _loadFromDb();
  }

  Future<void> _loadFromDb() async {
    setState(() => _loading = true);
    final now = DateTime.now();
    final from = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: widget.daysWindow));

    final items = <ExpenseItem>[];
    DocumentSnapshot? cursor;
    const page = 250;

    while (true) {
      Query q = FirebaseFirestore.instance
          .collection('users').doc(widget.userId)
          .collection('expenses')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
          .orderBy('date', descending: true)
          .limit(page);
      if (cursor != null) q = (q as Query).startAfterDocument(cursor);
      final snap = await q.get();
      if (snap.docs.isEmpty) break;
      for (final d in snap.docs) {
        items.add(ExpenseItem.fromFirestore(d));
      }
      cursor = snap.docs.last;
    }

    for (final e in items) {
      _groups.putIfAbsent(_keyFor(e), () => []).add(e);
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final entries = _groups.entries.map((e) {
      final merchant = e.key.split('|').first;
      final amt = e.value.isEmpty ? 0.0 : e.value.first.amount;
      final count = e.value.length;
      final newest = e.value
              .map((x) => x.date)
              .fold<DateTime?>(null, (m, d) => (m == null || d.isAfter(m)) ? d : m) ??
          DateTime(2000);
      return (key: e.key, merchant: merchant, amount: amt, count: count, newest: newest, items: e.value);
    }).toList();

    final q = _q.text.trim().toLowerCase();
    var filtered = entries.where((e) => q.isEmpty || e.merchant.toLowerCase().contains(q)).toList();
    filtered.sort((a, b) {
      switch (_sort) {
        case 'amount_desc':
          return b.amount.compareTo(a.amount);
        case 'newest':
          return b.newest.compareTo(a.newest);
        case 'count_desc':
        default:
          return b.count.compareTo(a.count);
      }
    });

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.autorenew_rounded, color: Fx.mintDark),
                    const SizedBox(width: Fx.s8),
                    Text('Subscriptions & Auto-pays', style: Fx.title),
                    const Spacer(),
                    PillBadge('${filtered.length}', color: Fx.mintDark),
                    IconButton(
                      tooltip: 'Close',
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => Navigator.of(context).maybePop(),
                    ),
                  ]),
                  const SizedBox(height: Fx.s8),
                  Wrap(spacing: Fx.s8, runSpacing: Fx.s8, children: [
                    PillBadge('Window: ${widget.daysWindow}d', color: Fx.mintDark, icon: Icons.schedule_rounded),
                    if (q.isNotEmpty) PillBadge('Filter: "$q"', color: Fx.mintDark, icon: Icons.filter_alt_rounded),
                  ]),
                  const SizedBox(height: Fx.s12),

                  Row(children: [
                    Expanded(
                      child: TextField(
                        controller: _q,
                        decoration: InputDecoration(
                          hintText: 'Search merchant',
                          prefixIcon: const Icon(Icons.search),
                          isDense: true,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(Fx.r12)),
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    const SizedBox(width: Fx.s8),
                    PopupMenuButton<String>(
                      tooltip: 'Sort',
                      onSelected: (v) => setState(() => _sort = v),
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: 'count_desc', child: Text('Most occurrences')),
                        PopupMenuItem(value: 'amount_desc', child: Text('Amount (high → low)')),
                        PopupMenuItem(value: 'newest', child: Text('Newest')),
                      ],
                      child: const Padding(
                        padding: EdgeInsets.all(8.0),
                        child: Icon(Icons.sort_rounded),
                      ),
                    ),
                  ]),
                  const SizedBox(height: Fx.s10),

                  Expanded(
                    child: filtered.isEmpty
                        ? const Center(child: Text('No recurring-looking groups match your filters.'))
                        : ListView.separated(
                            itemCount: filtered.length,
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (_, i) {
                              final e = filtered[i];
                              return ExpansionTile(
                                leading: const Icon(Icons.autorenew_rounded, color: Colors.indigo),
                                title: Text('${_title(e.merchant)} • ${_inr.format(e.amount)}'),
                                subtitle: Text('${e.count} occurrence(s) • last ${_ddmmyy(e.newest)}'),
                                childrenPadding: const EdgeInsets.only(left: 16, right: 8, bottom: 8),
                                children: [
                                  ...e.items.take(5).map((x) => ListTile(
                                        dense: true,
                                        contentPadding: const EdgeInsets.only(left: 8, right: 0),
                                        title: Text('${_inr.format(x.amount)} • ${_ddmmyy(x.date)}'),
                                        subtitle: Text(x.note, maxLines: 2, overflow: TextOverflow.ellipsis),
                                      )),
                                  if (e.items.length > 5)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 8, bottom: 6),
                                      child: Text('+ ${e.items.length - 5} more…', style: const TextStyle(color: Colors.black54)),
                                    ),
                                  Row(children: [
                                    TextButton.icon(
                                      icon: const Icon(Icons.delete_outline_rounded),
                                      label: const Text('Dismiss'),
                                      onPressed: () async {
                                        await _dismissGroup(e.merchant, e.amount);
                                        HapticFeedback.lightImpact();
                                      },
                                    ),
                                    const SizedBox(width: Fx.s6),
                                    ElevatedButton.icon(
                                      icon: const Icon(Icons.save_rounded),
                                      label: const Text('Confirm / Save'),
                                      onPressed: () async {
                                        await _saveGroup(e.merchant, e.amount, e.items);
                                        HapticFeedback.mediumImpact();
                                      },
                                    ),
                                  ]),
                                ],
                              );
                            },
                          ),
                  ),
                ],
              ),
      ),
    );
  }

  Future<void> _saveGroup(String merchant, double amount, List<ExpenseItem> items) async {
    final db = FirebaseFirestore.instance;
    final dest = db.collection('users').doc(widget.userId).collection('subscriptions').doc();
    await dest.set({
      'userId': widget.userId,
      'merchant': _title(merchant),
      'amount': amount,
      'cycle': 'monthly',
      'sourceExpenseIds': items.map((e) => e.id).toList(),
      'createdAt': FieldValue.serverTimestamp(),
      'active': true,
    });

    final key = '${merchant.toLowerCase()}|${((amount / 10).round() * 10)}';
    final suggRef = db.collection('users').doc(widget.userId)
        .collection('subscription_suggestions').doc(key);
    await suggRef.set({'status': 'saved'}, SetOptions(merge: true));

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Saved ${_title(merchant)} subscription')),
    );
  }

  Future<void> _dismissGroup(String merchant, double amount) async {
    final db = FirebaseFirestore.instance;
    final key = '${merchant.toLowerCase()}|${((amount / 10).round() * 10)}';
    final suggRef = db.collection('users').doc(widget.userId)
        .collection('subscription_suggestions').doc(key);
    await suggRef.set({'status': 'dismissed'}, SetOptions(merge: true));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Dismissed')));
  }

  Widget _chip(String t, String v) => PillBadge('$t: $v', color: Fx.mintDark);

  static String _title(String s) => s
      .split(RegExp(r'\s+'))
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
      .join(' ');
  static String _ddmmyy(DateTime d) => '${_tw(d.day)}/${_tw(d.month)}/${d.year % 100}';
  static String _tw(int n) => n < 10 ? '0$n' : '$n';
}
