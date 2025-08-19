import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class PartnerTransactionList extends StatefulWidget {
  final String partnerUserId; // phone-based docId (kept name to avoid breaking callers)
  final int lookbackDays;
  final int maxItems;

  const PartnerTransactionList({
    Key? key,
    required this.partnerUserId,
    this.lookbackDays = 7,
    this.maxItems = 100,
  }) : super(key: key);

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
    List<Map<String, dynamic>> items = [
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
          : (a['date'] is DateTime ? a['date'] as DateTime : DateTime.fromMillisecondsSinceEpoch(0));
      final db = (b['date'] is Timestamp)
          ? (b['date'] as Timestamp).toDate()
          : (b['date'] is DateTime ? b['date'] as DateTime : DateTime.fromMillisecondsSinceEpoch(0));
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
            return const ListView( // so RefreshIndicator works while loading
              children: [SizedBox(height: 280, child: Center(child: CircularProgressIndicator()))],
            );
          }
          if (snapshot.hasError) {
            return ListView(
              children: [
                const SizedBox(height: 40),
                Center(
                  child: Text(
                    "Failed to load partner transactions.",
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
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

          // Build grouped list by day label
          String dayLabel(DateTime d) => "${d.day}/${d.month}/${d.year}";
          final tiles = <Widget>[];
          String? currentHeader;

          for (final data in txns) {
            final dt = (data['date'] is Timestamp)
                ? (data['date'] as Timestamp).toDate()
                : (data['date'] is DateTime ? data['date'] as DateTime : null);

            final header = dt != null ? dayLabel(DateTime(dt.year, dt.month, dt.day)) : "Unknown date";

            if (currentHeader != header) {
              currentHeader = header;
              tiles.add(
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
                  child: Text(
                    currentHeader,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
              );
            }

            final kind = (data['kind'] as String?) ?? 'debit';
            final isDebit = kind == 'debit';
            final amountNum = (data['amount'] is num) ? (data['amount'] as num).toDouble() : 0.0;
            final type = (data['type'] as String?) ?? (isDebit ? 'Expense' : 'Income');
            final note = (data['note'] as String?) ?? '';

            tiles.add(
              ListTile(
                leading: Icon(
                  isDebit ? Icons.remove_circle : Icons.add_circle,
                  color: isDebit ? Colors.red : Colors.green,
                ),
                title: Text(
                  type,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  note.isNotEmpty ? note : (dt != null ? "${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}" : ""),
                  maxLines: 2,
                ),
                trailing: Text(
                  "₹${amountNum.toStringAsFixed(0)}",
                  style: TextStyle(
                    color: isDebit ? Colors.red : Colors.green,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                isThreeLine: note.isNotEmpty,
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
}
