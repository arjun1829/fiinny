import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';

class ForexFindingsSheet extends StatefulWidget {
  final String userId;
  final int daysWindow;

  /// Optional fast-path payloads, passed by the Diagnosis card.
  final List<ExpenseItem>? prefetchedIntl;
  final List<ExpenseItem>? prefetchedFees;

  const ForexFindingsSheet({
    super.key,
    required this.userId,
    this.daysWindow = 180,
    this.prefetchedIntl,
    this.prefetchedFees,
  });

  @override
  State<ForexFindingsSheet> createState() => _ForexFindingsSheetState();
}

class _ForexFindingsSheetState extends State<ForexFindingsSheet> {
  bool _loading = true;

  // Regex tuned to avoid “Avl Limit …”
  final _reSpentFx = RegExp(
    r'(spent|purchase|txn)\s+(usd|eur|gbp|aud|cad|sgd|aed|jpy)\s*([0-9]+(?:\.[0-9]+)?)',
    caseSensitive: false,
  );
  final _reInrDebit = RegExp(
    r'(spent|debited|txn|transaction|purchase)\s*(inr|rs\.?)\s*([0-9,]+(?:\.[0-9]+)?)',
    caseSensitive: false,
  );
  final _fxHint = RegExp(
    r'\b(forex|fx|cross.?currency|intl|international|overseas|markup)\b',
    caseSensitive: false,
  );
  final _fxSymbol = RegExp(r'(\$|€|£|usd|eur|gbp|aud|cad|sgd|aed|jpy)', caseSensitive: false);
  final _fxVerb = RegExp(
    r'\b(spent|purchase|charged|txn|transaction|pos)\b',
    caseSensitive: false,
  );
  final _balanceWords = RegExp(
    r'\b(available|avl|closing|current|passbook)\s*balance\b',
    caseSensitive: false,
  );
  final _promoWords = RegExp(
    r'\b(offer|subscribe|newsletter|utm_|unsubscribe)\b',
    caseSensitive: false,
  );
  final _feeWords = RegExp(
    r'\b(?:convenience\s*fee|conv\.?\s*fee|processing\s*fee|platform\s*fee|late\s*fee|penalt(?:y|ies)|surcharge|fuel\s*surcharge|gst|igst|cgst|sgst|markup)\b',
    caseSensitive: false,
  );
  final _feeBlacklist = RegExp(
    r'\b(recharge|top[-\s]?up|prepaid|plan|pack|dth)\b',
    caseSensitive: false,
  );

  List<ExpenseItem> _intl = [];
  List<ExpenseItem> _fees = [];

  // UI
  final _q = TextEditingController();
  String _sortIntl = 'date_desc'; // date_desc | amount_desc
  String _sortFee = 'date_desc';

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
    if (widget.prefetchedIntl != null || widget.prefetchedFees != null) {
      _intl = List.of(widget.prefetchedIntl ?? const []);
      _fees = List.of(widget.prefetchedFees ?? const []);
      _loading = false;
      if (mounted) setState(() {});
      return;
    }
    await _loadFromDb();
  }

  Future<void> _loadFromDb() async {
    setState(() => _loading = true);
    final now = DateTime.now();
    final from = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: widget.daysWindow));

    final intl = <ExpenseItem>[];
    final fees = <ExpenseItem>[];

    DocumentSnapshot? cursor;
    const page = 250;

    while (true) {
      Query q = FirebaseFirestore.instance
          .collection('users').doc(widget.userId)
          .collection('expenses')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
          .orderBy('date', descending: true)
          .limit(page);
      if (cursor != null) q = (q).startAfterDocument(cursor);

      final snap = await q.get();
      if (snap.docs.isEmpty) break;

      for (final d in snap.docs) {
        final e = ExpenseItem.fromFirestore(d);
        final lower = e.note.toLowerCase();

        final looksIntl = _fxVerb.hasMatch(lower) &&
            (_reSpentFx.hasMatch(lower) || _fxHint.hasMatch(lower) || _fxSymbol.hasMatch(lower)) &&
            !_balanceWords.hasMatch(lower) &&
            !_promoWords.hasMatch(lower);
        if (!looksIntl) continue;

        final looksFee =
            _feeWords.hasMatch(lower) && !_feeBlacklist.hasMatch(lower);
        if (looksFee) {
          fees.add(e);
        } else {
          intl.add(e);
        }
      }

      cursor = snap.docs.last;
    }

    _intl = intl;
    _fees = fees;
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    // Totals: INR debit only when explicit
    double intlInr = 0;
    for (final e in _intl) {
      final m = _reInrDebit.firstMatch(e.note.toLowerCase());
      if (m != null) {
        final s = m.group(3)!.replaceAll(',', '');
        final v = double.tryParse(s);
        if (v != null) intlInr += v;
      }
    }
    final feesSum = _fees.fold<double>(0, (a, b) => a + b.amount);

    final theme = Theme.of(context);
    final q = _q.text.trim().toLowerCase();

    // filter + sort
    final List<ExpenseItem> intl = _intl.where((e) {
      if (q.isEmpty) return true;
      return ('${e.note} ${e.label ?? ''} ${e.category ?? ''}').toLowerCase().contains(q);
    }).toList();
    intl.sort((a, b) => _sortIntl == 'amount_desc'
        ? b.amount.compareTo(a.amount)
        : b.date.compareTo(a.date));

    final List<ExpenseItem> fees = _fees.where((e) {
      if (q.isEmpty) return true;
      return ('${e.note} ${e.label ?? ''} ${e.category ?? ''}').toLowerCase().contains(q);
    }).toList();
    fees.sort((a, b) => _sortFee == 'amount_desc'
        ? b.amount.compareTo(a.amount)
        : b.date.compareTo(a.date));

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
                    'International Spend',
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  tooltip: 'What is this?',
                  icon: const Icon(Icons.info_outline, size: 18),
                  onPressed: () => _showInfo(
                    context,
                    'We detect overseas spends using currency symbols/keywords and show explicitly stated INR debits. Markup/FX fee lines are listed separately.',
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
                _chip('Intl INR', '₹${intlInr.toStringAsFixed(0)}'),
                _chip('Intl Txns', '${intl.length}'),
                _chip('Fees', '₹${feesSum.toStringAsFixed(0)} (${fees.length})'),
                _chip('Window', '${widget.daysWindow}d'),
              ],
            ),

            const SizedBox(height: 10),

            // Search bar
            TextField(
              controller: _q,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search merchant / note in all lists',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),

            const SizedBox(height: 10),

            // Tabs
            DefaultTabController(
              length: 2,
              child: Expanded(
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: TabBar(
                            tabs: [
                              Tab(text: 'Spends'),
                              Tab(text: 'Fees'),
                            ],
                            isScrollable: false,
                          ),
                        ),
                        const SizedBox(width: 8),
                        PopupMenuButton<String>(
                          tooltip: 'Sort',
                          onSelected: (v) => setState(() {
                            final idx = DefaultTabController.of(context).index;
                            if (idx == 0) _sortIntl = v; else _sortFee = v;
                          }),
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'date_desc', child: Text('Newest first')),
                            PopupMenuItem(value: 'amount_desc', child: Text('Amount (high → low)')),
                          ],
                          child: const Padding(
                            padding: EdgeInsets.all(8.0),
                            child: Icon(Icons.sort_rounded),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: TabBarView(
                        children: [
                          // Spends
                          intl.isEmpty
                              ? const Center(child: Text('No international spends match your filters.'))
                              : ListView.separated(
                            itemCount: intl.length,
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (_, i) => _intlTile(intl[i]),
                          ),
                          // Fees
                          fees.isEmpty
                              ? const Center(child: Text('No forex/markup fee lines match your filters.'))
                              : ListView.separated(
                            itemCount: fees.length,
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (_, i) {
                              final e = fees[i];
                              return ListTile(
                                dense: true,
                                leading: const Icon(Icons.price_change_rounded),
                                title: Text('₹${e.amount.toStringAsFixed(0)} • ${_ddmmyy(e.date)}'),
                                subtitle: Text(
                                  e.note,
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // Prefer showing the *foreign* amount when present (e.g. “USD 23.6”)
  Widget _intlTile(ExpenseItem e) {
    final n = e.note;
    String? fxLabel;
    final m = _reSpentFx.firstMatch(n.toLowerCase());
    if (m != null) {
      final cur = m.group(2)!.toUpperCase();
      final val = m.group(3)!;
      fxLabel = '$cur $val';
    }
    return ListTile(
      dense: true,
      leading: const Icon(Icons.public_rounded),
      title: Text('${fxLabel ?? '₹${e.amount.toStringAsFixed(0)}'} • ${_ddmmyy(e.date)}'),
      subtitle: Text(n, maxLines: 3, overflow: TextOverflow.ellipsis),
    );
  }

  Widget _chip(String t, String v) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: Colors.teal.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Text('$t: ', style: const TextStyle(color: Colors.black54)),
      Text(v, style: const TextStyle(fontWeight: FontWeight.w800)),
    ]),
  );

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

  static String _ddmmyy(DateTime d) => '${_tw(d.day)}/${_tw(d.month)}/${d.year % 100}';
  static String _tw(int n) => n < 10 ? '0$n' : '$n';
}
