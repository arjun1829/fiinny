import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';

class HiddenChargesReviewSheet extends StatefulWidget {
  final String userId;
  final int daysWindow;

  /// Optional fast-path payload, passed by the Diagnosis card.
  final List<ExpenseItem>? prefetched;

  const HiddenChargesReviewSheet({
    super.key,
    required this.userId,
    this.daysWindow = 90,
    this.prefetched,
  });

  @override
  State<HiddenChargesReviewSheet> createState() =>
      _HiddenChargesReviewSheetState();
}

class _HiddenChargesReviewSheetState extends State<HiddenChargesReviewSheet> {
  bool _loading = true;
  final _feeWords = RegExp(
    r'\b(fee|charge|convenience|processing|gst|markup|penalty|late)\b',
    caseSensitive: false,
  );

  List<ExpenseItem> _items = [];
  List<ExpenseItem> _filtered = [];

  // UI state
  final _q = TextEditingController();
  String _sort = 'date_desc'; // date_desc | amount_desc | amount_asc
  double _minAmt = 0;
  bool _selectMode = false;
  final Set<String> _selected = {};

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
      _items = List.of(widget.prefetched!);
      _applyFilters();
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

    final out = <ExpenseItem>[];
    DocumentSnapshot? cursor;
    const page = 250;

    while (true) {
      Query q = FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userId)
          .collection('expenses')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
          .orderBy('date', descending: true)
          .limit(page);
      if (cursor != null) q = (q).startAfterDocument(cursor);

      final snap = await q.get();
      if (snap.docs.isEmpty) break;

      for (final d in snap.docs) {
        final e = ExpenseItem.fromFirestore(d);
        final tags = (e.toJson()['tags'] as List?)?.cast<String>() ?? const [];
        final isFee =
            tags.contains('fee') || _feeWords.hasMatch(e.note.toLowerCase());
        if (isFee) out.add(e);
      }
      cursor = snap.docs.last;
    }

    _items = out;
    _applyFilters();
    setState(() => _loading = false);
  }

  void _applyFilters() {
    final q = _q.text.trim().toLowerCase();
    final List<ExpenseItem> xs = _items.where((e) {
      if (e.amount < _minAmt) return false;
      if (q.isEmpty) return true;
      final text =
          '${e.note} ${e.label ?? ''} ${e.category ?? ''}'.toLowerCase();
      return text.contains(q);
    }).toList();

    xs.sort((a, b) {
      switch (_sort) {
        case 'amount_desc':
          return b.amount.compareTo(a.amount);
        case 'amount_asc':
          return a.amount.compareTo(b.amount);
        case 'date_desc':
        default:
          return b.date.compareTo(a.date);
      }
    });

    _filtered = xs;
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final sum = _filtered.fold<double>(0, (a, b) => a + b.amount);
    final theme = Theme.of(context);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header row
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Hidden Charges',
                          style: theme.textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w800),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      IconButton(
                        tooltip: 'What counts as a hidden charge?',
                        icon: const Icon(Icons.info_outline, size: 18),
                        onPressed: () => _showInfo(
                          context,
                          'Hidden charges include convenience/processing/markup/penalty/GST lines and any expense tagged as a fee.',
                        ),
                      ),
                      IconButton(
                        tooltip: _selectMode ? 'Exit selection' : 'Select',
                        icon: Icon(_selectMode
                            ? Icons.checklist_rtl
                            : Icons.checklist),
                        onPressed: () => setState(() {
                          _selectMode = !_selectMode;
                          _selected.clear();
                        }),
                      ),
                      IconButton(
                        tooltip: 'Close',
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () => Navigator.of(context).maybePop(),
                      ),
                    ],
                  ),

                  const SizedBox(height: 4),
                  // Stats chips
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _chip('Total', '₹${sum.toStringAsFixed(0)}'),
                      _chip('Lines', '${_filtered.length}'),
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
                            hintText: 'Search notes / merchant',
                            prefixIcon: const Icon(Icons.search),
                            isDense: true,
                            border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(10)),
                          ),
                          onChanged: (_) => _applyFilters(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      PopupMenuButton<String>(
                        tooltip: 'Sort',
                        onSelected: (v) {
                          _sort = v;
                          _applyFilters();
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                              value: 'date_desc', child: Text('Newest first')),
                          PopupMenuItem(
                              value: 'amount_desc',
                              child: Text('Amount (high → low)')),
                          PopupMenuItem(
                              value: 'amount_asc',
                              child: Text('Amount (low → high)')),
                        ],
                        child: const Padding(
                          padding: EdgeInsets.all(8.0),
                          child: Icon(Icons.sort_rounded),
                        ),
                      ),
                      const SizedBox(width: 6),
                      PopupMenuButton<double>(
                        tooltip: 'Min amount',
                        onSelected: (v) {
                          _minAmt = v;
                          _applyFilters();
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: 0, child: Text('₹0+')),
                          PopupMenuItem(value: 50, child: Text('₹50+')),
                          PopupMenuItem(value: 100, child: Text('₹100+')),
                          PopupMenuItem(value: 250, child: Text('₹250+')),
                          PopupMenuItem(value: 500, child: Text('₹500+')),
                          PopupMenuItem(value: 1000, child: Text('₹1,000+')),
                        ],
                        child: Padding(
                          padding: const EdgeInsets.all(8.0),
                          child: Text('₹≥${_minAmt.toStringAsFixed(0)}',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 10),

                  if (_selectMode)
                    Row(
                      children: [
                        TextButton.icon(
                          onPressed: _selected.isEmpty
                              ? null
                              : () async {
                                  final ids = _selected.toList();
                                  for (final id in ids) {
                                    await _markSuggestion(
                                        id,
                                        'hidden_charge_suggestions',
                                        'dismissed');
                                    _items.removeWhere((e) => e.id == id);
                                  }
                                  _applyFilters();
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                          content: Text(
                                              'Dismissed ${ids.length} fee line(s).')),
                                    );
                                  }
                                },
                          icon: const Icon(Icons.done_all_rounded),
                          label: const Text('Dismiss selected'),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: () => setState(() {
                            _selected
                              ..clear()
                              ..addAll(_filtered.map((e) => e.id));
                          }),
                          child: const Text('Select all'),
                        ),
                        TextButton(
                          onPressed: () => setState(() => _selected.clear()),
                          child: const Text('Clear'),
                        ),
                      ],
                    ),

                  const SizedBox(height: 6),

                  // List
                  Expanded(
                    child: _filtered.isEmpty
                        ? const Center(
                            child:
                                Text('No hidden charges match your filters.'))
                        : ListView.separated(
                            itemCount: _filtered.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (_, i) {
                              final e = _filtered[i];
                              final selected = _selected.contains(e.id);
                              return ListTile(
                                dense: true,
                                leading: _selectMode
                                    ? Checkbox(
                                        value: selected,
                                        onChanged: (v) {
                                          setState(() {
                                            if (v == true) {
                                              _selected.add(e.id);
                                            } else {
                                              _selected.remove(e.id);
                                            }
                                          });
                                        },
                                      )
                                    : const Icon(
                                        Icons.report_gmailerrorred_rounded,
                                        color: Colors.deepOrange),
                                title: Text(
                                    '₹${e.amount.toStringAsFixed(0)} • ${_ddmmyy(e.date)}'),
                                subtitle: Text(
                                  e.note,
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                trailing: !_selectMode
                                    ? PopupMenuButton<String>(
                                        onSelected: (v) async {
                                          if (v == 'dismiss') {
                                            await _markSuggestion(
                                                e.id,
                                                'hidden_charge_suggestions',
                                                'dismissed');
                                            if (mounted) {
                                              setState(() => _items.removeWhere(
                                                  (x) => x.id == e.id));
                                              _applyFilters();
                                            }
                                          }
                                        },
                                        itemBuilder: (_) => const [
                                          PopupMenuItem(
                                              value: 'dismiss',
                                              child: Text('Dismiss')),
                                        ],
                                      )
                                    : null,
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
          color: Colors.deepOrange.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text('$t: ', style: const TextStyle(color: Colors.black54)),
          Text(v, style: const TextStyle(fontWeight: FontWeight.w800)),
        ]),
      );

  Future<void> _markSuggestion(
      String expenseId, String col, String status) async {
    final ref = FirebaseFirestore.instance
        .collection('users')
        .doc(widget.userId)
        .collection(col)
        .doc(expenseId);
    await ref.set({'status': status}, SetOptions(merge: true));
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

  static String _ddmmyy(DateTime d) =>
      '${_tw(d.day)}/${_tw(d.month)}/${d.year % 100}';
  static String _tw(int n) => n < 10 ? '0$n' : '$n';
}
