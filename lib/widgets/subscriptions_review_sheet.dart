import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';

class SubscriptionsReviewSheet extends StatefulWidget {
  final String userId;
  final int daysWindow;

  /// Optional fast-path payload of candidate txns.
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

  // simple grouping key
  String _keyFor(ExpenseItem e) {
    final meta = (e.toJson()['brainMeta'] as Map?)?.cast<String, dynamic>();
    final merchant = (meta?['merchant'] as String?) ?? e.label ?? e.category ?? 'Merchant';
    final bucket = ((e.amount / 10).round() * 10).toString();
    return '${merchant.toLowerCase()}|$bucket';
  }
  void _showInfo(BuildContext ctx, String msg) {
    showModalBottomSheet(
      context: ctx,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        child: Text(msg),
      ),
    );
  }


  final Map<String, List<ExpenseItem>> _groups = {};
  final _q = TextEditingController();
  String _sort = 'count_desc'; // count_desc | amount_desc | newest

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
      setState(() => _loading = false);
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
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // entries with basic metadata
    final entries = _groups.entries.map((e) {
      final merchant = e.key.split('|').first;
      final amt = e.value.isEmpty ? 0.0 : e.value.first.amount;
      final count = e.value.length;
      final newest = e.value.map((x) => x.date).fold<DateTime?>(null, (m, d) => (m == null || d.isAfter(m)) ? d : m) ?? DateTime(2000);
      return (key: e.key, merchant: merchant, amount: amt, count: count, newest: newest, items: e.value);
    }).toList();

    // filter + sort
    final q = _q.text.trim().toLowerCase();
    var filtered = entries.where((e) => q.isEmpty || e.merchant.toLowerCase().contains(q)).toList();
    filtered.sort((a, b) {
      switch (_sort) {
        case 'amount_desc': return b.amount.compareTo(a.amount);
        case 'newest': return b.newest.compareTo(a.newest);
        case 'count_desc':
        default: return b.count.compareTo(a.count);
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
            // Header
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Subscriptions & Auto-pays',
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  tooltip: 'What is this?',
                  icon: const Icon(Icons.info_outline, size: 18),
                  onPressed: () => _showInfo(
                    context,
                    'We group recurring-looking debits by merchant & amount bucket. Save a group to track it as a subscription.',
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
              ],
            ),

            const SizedBox(height: 4),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: [
                _chip('Groups', '${filtered.length}'),
                _chip('Window', '${widget.daysWindow}d'),
              ],
            ),

            const SizedBox(height: 10),

            // Search + sort row
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _q,
                    decoration: InputDecoration(
                      hintText: 'Search merchant',
                      prefixIcon: const Icon(Icons.search),
                      isDense: true,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 8),
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
              ],
            ),

            const SizedBox(height: 10),

            // List
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
                    title: Text('${_title(e.merchant)} • ₹${e.amount.toStringAsFixed(0)}'),
                    subtitle: Text('${e.count} occurrence(s) • last ${_ddmmyy(e.newest)}'),
                    childrenPadding: const EdgeInsets.only(left: 16, right: 8, bottom: 8),
                    children: [
                      // occurrences list (max 5 for brevity)
                      ...e.items.take(5).map((x) => ListTile(
                        dense: true,
                        contentPadding: const EdgeInsets.only(left: 8, right: 0),
                        title: Text('₹${x.amount.toStringAsFixed(0)} • ${_ddmmyy(x.date)}'),
                        subtitle: Text(x.note, maxLines: 2, overflow: TextOverflow.ellipsis),
                      )),
                      if (e.items.length > 5)
                        Padding(
                          padding: const EdgeInsets.only(left: 8, bottom: 6),
                          child: Text('+ ${e.items.length - 5} more…',
                              style: const TextStyle(color: Colors.black54)),
                        ),
                      Row(
                        children: [
                          TextButton.icon(
                            icon: const Icon(Icons.delete_outline_rounded),
                            label: const Text('Dismiss'),
                            onPressed: () async => _dismissGroup(e.merchant, e.amount),
                          ),
                          const SizedBox(width: 6),
                          ElevatedButton.icon(
                            icon: const Icon(Icons.save_rounded),
                            label: const Text('Confirm / Save'),
                            onPressed: () async => _saveGroup(e.merchant, e.amount, e.items),
                          ),
                        ],
                      ),
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

  Widget _chip(String t, String v) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: Colors.indigo.withOpacity(0.08),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Text('$t: ', style: const TextStyle(color: Colors.black54)),
      Text(v, style: const TextStyle(fontWeight: FontWeight.w800)),
    ]),
  );

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

    // mark suggestion doc if present (best-effort)
    final key = '${merchant.toLowerCase()}|${((amount / 10).round() * 10)}';
    final suggRef = db.collection('users').doc(widget.userId)
        .collection('subscription_suggestions').doc(key);
    await suggRef.set({'status': 'saved'}, SetOptions(merge: true));

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Saved ${_title(merchant)} subscription')),
      );
    }
  }

  Future<void> _dismissGroup(String merchant, double amount) async {
    final db = FirebaseFirestore.instance;
    final key = '${merchant.toLowerCase()}|${((amount / 10).round() * 10)}';
    final suggRef = db.collection('users').doc(widget.userId)
        .collection('subscription_suggestions').doc(key);
    await suggRef.set({'status': 'dismissed'}, SetOptions(merge: true));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Dismissed')));
    }
  }

  static String _title(String s) => s
      .split(RegExp(r'\s+'))
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
      .join(' ');
  static String _ddmmyy(DateTime d) => '${_tw(d.day)}/${_tw(d.month)}/${d.year % 100}';
  static String _tw(int n) => n < 10 ? '0$n' : '$n';
}
