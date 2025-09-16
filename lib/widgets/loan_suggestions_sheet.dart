import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../brain/loan_detection_service.dart';
import '../models/loan_model.dart';
import '../services/loan_service.dart';

class LoanSuggestionsSheet extends StatefulWidget {
  final String userId;
  const LoanSuggestionsSheet({super.key, required this.userId});
  @override
  State<LoanSuggestionsSheet> createState() => _LoanSuggestionsSheetState();
}

class _LoanSuggestionsSheetState extends State<LoanSuggestionsSheet> {
  final _detector = LoanDetectionService();
  final _loanSvc = LoanService();
  List<Map<String,dynamic>> _items = [];
  bool _loading = true;

  // UI
  String _sort = 'newest'; // newest | emi_desc | lender
  final Set<String> _selected = {};
  bool _selectMode = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(()=>_loading=true);
    _items = await _detector.listPending(widget.userId);
    setState(()=>_loading=false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    List<Map<String,dynamic>> xs = List.of(_items);
    xs.sort((a, b) {
      switch (_sort) {
        case 'emi_desc':
          final ae = (a['emi'] as num?)?.toDouble() ?? 0;
          final be = (b['emi'] as num?)?.toDouble() ?? 0;
          return be.compareTo(ae);
        case 'lender':
          return (a['lender'] ?? '').toString().toLowerCase()
              .compareTo((b['lender'] ?? '').toString().toLowerCase());
        case 'newest':
        default:
          final at = (a['lastSeen'] as Timestamp?)?.toDate() ?? DateTime(2000);
          final bt = (b['lastSeen'] as Timestamp?)?.toDate() ?? DateTime(2000);
          return bt.compareTo(at);
      }
    });

    final totalEmi = xs.fold<double>(0, (s, m) => s + ((m['emi'] as num?)?.toDouble() ?? 0));

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : xs.isEmpty
            ? const Center(child: Text('No detected loans right now.'))
            : Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Loan Suggestions',
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  tooltip: 'What is this?',
                  icon: const Icon(Icons.info_outline, size: 18),
                  onPressed: () => _showInfo(
                    context,
                    'We surface recurring lender/EMI patterns. Accept to add a loan, or dismiss if not relevant.',
                  ),
                ),
                IconButton(
                  tooltip: _selectMode ? 'Exit selection' : 'Select',
                  icon: Icon(_selectMode ? Icons.checklist_rtl : Icons.checklist),
                  onPressed: () => setState(() {
                    _selectMode = !_selectMode;
                    _selected.clear();
                  }),
                ),
                PopupMenuButton<String>(
                  tooltip: 'Sort',
                  onSelected: (v) => setState(() => _sort = v),
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'newest', child: Text('Newest first')),
                    PopupMenuItem(value: 'emi_desc', child: Text('EMI (high → low)')),
                    PopupMenuItem(value: 'lender', child: Text('Lender (A → Z)')),
                  ],
                  child: const Padding(
                    padding: EdgeInsets.all(8.0),
                    child: Icon(Icons.sort_rounded),
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
                _chip('Suggestions', '${xs.length}'),
                _chip('Total EMI', '₹${totalEmi.toStringAsFixed(0)}'),
              ],
            ),

            const SizedBox(height: 10),

            if (_selectMode)
              Row(
                children: [
                  TextButton(
                    onPressed: () => setState(() => _selected
                      ..clear()
                      ..addAll(xs.map((m) => (m['id'] as String)))),
                    child: const Text('Select all'),
                  ),
                  TextButton(
                    onPressed: () => setState(() => _selected.clear()),
                    child: const Text('Clear'),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    icon: const Icon(Icons.delete_outline_rounded),
                    label: const Text('Dismiss selected'),
                    onPressed: _selected.isEmpty ? null : () async {
                      for (final id in _selected) {
                        await _detector.dismiss(widget.userId, id);
                      }
                      await _load();
                    },
                  ),
                  const SizedBox(width: 6),
                  FilledButton.icon(
                    icon: const Icon(Icons.save_rounded),
                    label: const Text('Accept selected'),
                    onPressed: _selected.isEmpty ? null : () async {
                      for (final id in _selected) {
                        final s = xs.firstWhere((e) => e['id'] == id);
                        await _acceptOne(s, silent: true);
                      }
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Accepted ${_selected.length} loan(s).')),
                        );
                      }
                      await _load();
                    },
                  ),
                ],
              ),

            const SizedBox(height: 6),

            // List
            Expanded(
              child: ListView.separated(
                itemCount: xs.length,
                separatorBuilder: (_, __) => const Divider(height: 12),
                itemBuilder: (_, i) {
                  final s = xs[i];
                  final id = (s['id'] as String?) ?? '';
                  final lender = (s['lender'] as String?)?.trim().isNotEmpty == true
                      ? (s['lender'] as String).trim()
                      : 'Loan';
                  final emi = (s['emi'] as num?)?.toDouble() ?? 0.0;
                  final lastSeen = (s['lastSeen'] as Timestamp?)?.toDate();
                  final autopay = (s['autopay'] as bool?) ?? false;
                  final selected = _selected.contains(id);

                  return ListTile(
                    leading: _selectMode
                        ? Checkbox(
                      value: selected,
                      onChanged: (v) => setState(() {
                        if (v == true) _selected.add(id);
                        else _selected.remove(id);
                      }),
                    )
                        : const Icon(Icons.account_balance_rounded),
                    title: Text(lender),
                    subtitle: Text(
                      'EMI ₹${emi.toStringAsFixed(0)}'
                          '${autopay ? ' • Autopay' : ''}'
                          '${lastSeen != null ? ' • Last ${_ddmmyy(lastSeen)}' : ''}',
                    ),
                    trailing: _selectMode
                        ? null
                        : Wrap(
                      spacing: 6,
                      children: [
                        TextButton(
                          child: const Text('Dismiss'),
                          onPressed: () async {
                            await _detector.dismiss(widget.userId, id);
                            await _load();
                          },
                        ),
                        ElevatedButton(
                          child: const Text('Accept'),
                          onPressed: () async {
                            await _acceptOne(s);
                            await _load();
                          },
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _acceptOne(Map<String, dynamic> s, {bool silent = false}) async {
    final lender = (s['lender'] as String?)?.trim().isNotEmpty == true
        ? (s['lender'] as String).trim()
        : 'Loan';

    final emiNum = (s['emi'] as num?)?.toDouble() ?? 0.0;
    final firstSeenTs = s['firstSeen'] as Timestamp?;
    final lastSeenTs  = s['lastSeen'] as Timestamp?;
    final paymentDay  = (s['paymentDay'] as num?)?.toInt();

    final loan = LoanModel(
      id: null,
      userId: widget.userId,
      title: lender,
      amount: (emiNum > 0 ? emiNum * 12 : 1000).toDouble(),
      lenderType: _inferLenderType(lender),
      lenderName: lender,
      emi: emiNum > 0 ? emiNum : null,
      startDate: firstSeenTs?.toDate(),
      paymentDayOfMonth: paymentDay,
      autopay: (s['autopay'] as bool?) ?? false,
      isClosed: false,
      createdAt: DateTime.now(),
      tags: const ['detected', 'emi'],
      note: 'Detected from recurring debits',
    );

    final id = await _loanSvc.addLoan(loan);

    await FirebaseFirestore.instance
        .collection('users').doc(widget.userId)
        .collection('loan_suggestions').doc(s['id'])
        .update({'status': 'accepted', 'loanId': id});

    if (!silent && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Loan added: ${loan.title}')),
      );
    }
  }

  Widget _chip(String t, String v) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: Colors.pink.withOpacity(0.08),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Text('$t: ', style: const TextStyle(color: Colors.black54)),
      Text(v, style: const TextStyle(fontWeight: FontWeight.w800)),
    ]),
  );

  static String _ddmmyy(DateTime d) => '${_tw(d.day)}/${_tw(d.month)}/${d.year%100}';
  static String _tw(int n) => n<10 ? '0$n' : '$n';

  String _inferLenderType(String lender) {
    final l = lender.toLowerCase();
    const bankHints = [
      'bank', 'hdfc', 'sbi', 'icici', 'axis', 'kotak', 'yes bank',
      'indusind', 'federal', 'boi', 'pnb', 'canara', 'idfc', 'union bank',
    ];
    const nbfcHints = [
      'bajaj', 'tatacap', 'tata capital', 'moneyview', 'home credit',
      'kreditbee', 'cashe', 'paytm postpaid', 'slice', 'lazy', 'simpl',
      'asha', 'aditya birla finance', 'muthoot', 'manappuram',
    ];
    if (bankHints.any((h) => l.contains(h))) return 'Bank';
    if (nbfcHints.any((h) => l.contains(h))) return 'NBFC';
    return 'Other';
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
}
