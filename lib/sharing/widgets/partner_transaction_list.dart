import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

class PartnerTransactionList extends StatefulWidget {
  final String
      partnerUserId; // phone-based docId (kept name to avoid breaking callers)
  final int lookbackDays;
  final int maxItems;

  const PartnerTransactionList({
    super.key,
    required this.partnerUserId,
    this.lookbackDays = 7,
    this.maxItems = 100,
  });

  @override
  State<PartnerTransactionList> createState() => _PartnerTransactionListState();
}

class _PartnerTransactionListState extends State<PartnerTransactionList> {
  late Future<List<Map<String, dynamic>>> _loader;

  @override
  void initState() {
    super.initState();
    _loader = _fetchTxns();
  }

  Future<List<Map<String, dynamic>>> _fetchTxns() async {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: widget.lookbackDays - 1)); // inclusive window

    // Query both collections with server-side ordering and windowing
    final userRef = FirebaseFirestore.instance
        .collection('users')
        .doc(widget.partnerUserId);

    final expSnap = await userRef
        .collection('expenses')
        .where('date', isGreaterThanOrEqualTo: start)
        .orderBy('date', descending: true)
        .limit(widget.maxItems)
        .get();

    final incSnap = await userRef
        .collection('incomes')
        .where('date', isGreaterThanOrEqualTo: start)
        .orderBy('date', descending: true)
        .limit(widget.maxItems)
        .get();

    // Normalize + merge
    final List<Map<String, dynamic>> items = [
      ...expSnap.docs.map((d) {
        final data = d.data();
        return <String, dynamic>{
          ...data,
          'kind': 'debit',
          '_docId': d.id,
          '_coll': 'expenses',
        };
      }),
      ...incSnap.docs.map((d) {
        final data = d.data();
        return <String, dynamic>{
          ...data,
          'kind': 'credit',
          '_docId': d.id,
          '_coll': 'incomes',
        };
      }),
    ];

    // Robust sort by date desc
    items.sort((a, b) {
      final da = (a['date'] is Timestamp)
          ? (a['date'] as Timestamp).toDate()
          : (a['date'] is DateTime
              ? a['date'] as DateTime
              : DateTime.fromMillisecondsSinceEpoch(0));
      final db = (b['date'] is Timestamp)
          ? (b['date'] as Timestamp).toDate()
          : (b['date'] is DateTime
              ? b['date'] as DateTime
              : DateTime.fromMillisecondsSinceEpoch(0));
      return db.compareTo(da);
    });

    return items;
  }

  Future<void> _refresh() async {
    setState(() {
      _loader = _fetchTxns();
    });
    await _loader;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<List<Map<String, dynamic>>>(
        future: _loader,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return ListView(
              // so RefreshIndicator works while loading
              children: [
                SizedBox(
                    height: 280,
                    child: Center(child: CircularProgressIndicator()))
              ],
            );
          }
          if (snapshot.hasError) {
            return ListView(
              children: [
                const SizedBox(height: 40),
                Center(
                  child: Text(
                    "Failed to load partner transactions.",
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
              ],
            );
          }
          final txns = snapshot.data ?? const [];
          if (txns.isEmpty) {
            return ListView(
              children: const [
                SizedBox(height: 40),
                Center(child: Text("No transactions in the selected window.")),
              ],
            );
          }

          final tiles = <Widget>[];
          String? currentHeader;
          for (final data in txns) {
            final dt = (data['date'] is Timestamp)
                ? (data['date'] as Timestamp).toDate()
                : (data['date'] is DateTime ? data['date'] as DateTime : null);

            final header = dt != null ? _readableHeader(dt) : 'Unknown date';

            if (currentHeader != header) {
              currentHeader = header;
              tiles.add(
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
                  child: Text(
                    currentHeader,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
              );
            }

            final kind = (data['kind'] as String?) ?? 'debit';
            final isDebit = kind == 'debit';
            final amountNum = (data['amount'] is num)
                ? (data['amount'] as num).toDouble()
                : 0.0;
            final type =
                (data['type'] as String?) ?? (isDebit ? 'Expense' : 'Income');
            final note = (data['note'] as String?)?.trim() ?? '';
            final timeLabel = dt != null ? DateFormat('HH:mm').format(dt) : '';

            tiles.add(
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: _SharingUnifiedTile(
                  isIncome: !isDebit,
                  amount: amountNum,
                  category: type,
                  note: note,
                  time: timeLabel,
                ),
              ),
            );
          }

          return ListView(
            children: tiles,
          );
        },
      ),
    );
  }

  String _readableHeader(DateTime date) {
    final today = DateTime.now();
    final justDate = DateTime(date.year, date.month, date.day);
    final todayDate = DateTime(today.year, today.month, today.day);
    if (justDate == todayDate) {
      return 'Today';
    }
    if (justDate == todayDate.subtract(const Duration(days: 1))) {
      return 'Yesterday';
    }
    return DateFormat('d MMM, yyyy').format(date);
  }
}

class _SharingUnifiedTile extends StatelessWidget {
  final bool isIncome;
  final double amount;
  final String category;
  final String note;
  final String time;

  const _SharingUnifiedTile({
    required this.isIncome,
    required this.amount,
    required this.category,
    required this.note,
    required this.time,
  });

  Color get _side =>
      isIncome ? const Color(0xFF1DB954) : const Color(0xFFE53935);
  Color get _iconBg =>
      isIncome ? const Color(0x221DB954) : const Color(0x22E53935);
  IconData get _icon =>
      isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded;

  String _money(double v) => '₹${v.toStringAsFixed(0)}';

  @override
  Widget build(BuildContext context) {
    final textPrimary =
        Theme.of(context).textTheme.bodyLarge?.color ?? Colors.black87;
    final textMuted = Colors.black.withValues(alpha: .55);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: null,
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Colors.white, Colors.white.withValues(alpha: .96)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.black.withValues(alpha: .05)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: .05),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 6,
                height: 68,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      _side.withValues(alpha: .95),
                      _side.withValues(alpha: .7)
                    ],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(18),
                    bottomLeft: Radius.circular(18),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Container(
                width: 44,
                height: 44,
                margin: const EdgeInsets.only(left: 2),
                decoration: BoxDecoration(
                  color: _iconBg,
                  shape: BoxShape.circle,
                ),
                child: Icon(_icon, color: _side),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _money(amount),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 17.5,
                                fontWeight: FontWeight.w900,
                                color:
                                    isIncome ? _side : const Color(0xFFB71C1C),
                                letterSpacing: .2,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (time.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.grey.withValues(alpha: .14),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(time,
                                  style: TextStyle(
                                      fontSize: 11.5, color: textMuted)),
                            ),
                          const SizedBox(width: 8),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        note.isNotEmpty ? '$category  •  $note' : category,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
