import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../models/friend_model.dart';
import '../themes/custom_card.dart';

class UnifiedTransactionList extends StatefulWidget {
  final List<ExpenseItem> expenses;
  final List<IncomeItem> incomes;
  final int previewCount;
  final String filterType; // "All", "Income", "Expense"
  final Map<String, FriendModel> friendsById;

  final Function(dynamic tx)? onEdit;
  final Function(dynamic tx)? onDelete;
  final Function(dynamic tx)? onSplit;
  final bool showBillIcon;

  // --- Multi-select support ---
  final bool multiSelectEnabled;
  final Set<String> selectedIds;
  final void Function(String txId, bool selected)? onSelectTx;

  // --- NEW (optional): unified docs from Firestore `users/{uid}/transactions`
  // Each doc should include:
  // amount(double), date(Timestamp/DateTime), isDebit(bool), category(String),
  // note(String), merchant(String), badges.bankLogo(String?), badges.schemeLogo(String?),
  // meta.cardLast4(String?), meta.channel(String?), provider(String?), tags(List<String>)?
  final List<Map<String, dynamic>>? unifiedDocs;

  const UnifiedTransactionList({
    Key? key,
    required this.expenses,
    required this.incomes,
    required this.friendsById,
    this.previewCount = 10,
    this.filterType = "All",
    this.onEdit,
    this.onDelete,
    this.onSplit,
    this.showBillIcon = false,
    this.multiSelectEnabled = false,
    this.selectedIds = const {},
    this.onSelectTx,
    this.unifiedDocs, // optional
  }) : super(key: key);

  @override
  State<UnifiedTransactionList> createState() => _UnifiedTransactionListState();
}

class _UnifiedTransactionListState extends State<UnifiedTransactionList> {
  // Unified internal structure:
  // {'mode':'legacy'|'unified', 'type':'expense'|'income', 'id':String, 'date':DateTime,
  //  'amount':double, 'category':String, 'note':String, 'raw':dynamic (item or map),
  //  'merchant':String?, 'bankLogo':String?, 'schemeLogo':String?, 'cardLast4':String?, 'channel':String?}
  late List<Map<String, dynamic>> allTx;
  int shownCount = 10;

  @override
  void initState() {
    super.initState();
    shownCount = widget.previewCount;
    _combine();
  }

  @override
  void didUpdateWidget(UnifiedTransactionList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (shownCount < widget.previewCount) shownCount = widget.previewCount;
    _combine();
  }

  // ---------- COMBINE ----------
  void _combine() {
    // If unified docs provided, prefer them.
    if (widget.unifiedDocs != null) {
      allTx = _fromUnified(widget.unifiedDocs!);
    } else {
      allTx = _fromLegacy(widget.expenses, widget.incomes);
    }

    // Filter
    if (widget.filterType == "Income") {
      allTx = allTx.where((t) => t['type'] == 'income').toList();
    } else if (widget.filterType == "Expense") {
      allTx = allTx.where((t) => t['type'] == 'expense').toList();
    }

    // Sort desc by date
    allTx.sort((a, b) {
      final DateTime ad = a['date'] as DateTime;
      final DateTime bd = b['date'] as DateTime;
      return bd.compareTo(ad);
    });
  }

  List<Map<String, dynamic>> _fromLegacy(List<ExpenseItem> expenses, List<IncomeItem> incomes) {
    final tx = <Map<String, dynamic>>[];

    tx.addAll(expenses.map((e) => {
      'mode': 'legacy',
      'type': 'expense',
      'id': e.id,
      'date': e.date,
      'amount': e.amount,
      'category': e.type,
      'note': e.note ?? '',
      'raw': e,
      'merchant': null,
      'bankLogo': null,
      'schemeLogo': null,
      'cardLast4': e.cardLast4,
      'channel': null,
    }));

    tx.addAll(incomes.map((i) => {
      'mode': 'legacy',
      'type': 'income',
      'id': i.id,
      'date': i.date,
      'amount': i.amount,
      'category': i.type,
      'note': i.note ?? '',
      'raw': i,
      'merchant': null,
      'bankLogo': null,
      'schemeLogo': null,
      'cardLast4': null,
      'channel': null,
    }));

    return tx;
  }

  DateTime _asDate(dynamic v) {
    // Supports Firestore Timestamp (has .toDate()), DateTime, or millis/int
    if (v == null) return DateTime.now();
    if (v is DateTime) return v;
    try {
      if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
      if (v is double) return DateTime.fromMillisecondsSinceEpoch(v.toInt());
      final toDate = v as dynamic;
      if (toDate.toDate != null) return toDate.toDate() as DateTime;
    } catch (_) {}
    return DateTime.now();
  }

  double _asDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }

  List<Map<String, dynamic>> _fromUnified(List<Map<String, dynamic>> docs) {
    final tx = <Map<String, dynamic>>[];

    for (final doc in docs) {
      // Exclude bills from list (safety) if present
      final channel = _readString(doc, ['meta', 'channel']);
      if (channel == 'CreditCardBill') continue;

      final bool isDebit = (doc['isDebit'] == true);
      final String type = isDebit ? 'expense' : 'income';

      tx.add({
        'mode': 'unified',
        'type': type,
        'id': (doc['fingerprint'] ?? doc['id'] ?? '').toString(),
        'date': _asDate(doc['date']),
        'amount': _asDouble(doc['amount']),
        'category': (doc['category'] ?? (isDebit ? 'Expense' : 'Income')).toString(),
        'note': (doc['note'] ?? '').toString(),
        'raw': doc,
        'merchant': (doc['merchant'] ?? '').toString(),
        'bankLogo': _readString(doc, ['badges', 'bankLogo']),
        'schemeLogo': _readString(doc, ['badges', 'schemeLogo']),
        'cardLast4': _readString(doc, ['meta', 'cardLast4']),
        'channel': channel,
      });
    }

    return tx;
  }

  String? _readString(Map<String, dynamic> map, List<String> path) {
    dynamic cur = map;
    for (final key in path) {
      if (cur is Map<String, dynamic> && cur.containsKey(key)) {
        cur = cur[key];
      } else {
        return null;
      }
    }
    if (cur == null) return null;
    return cur.toString();
  }

  // ---------- GROUPING ----------
  String getDateLabel(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final d = DateTime(date.year, date.month, date.day);
    if (d == today) return "Today";
    if (d == today.subtract(const Duration(days: 1))) return "Yesterday";
    return DateFormat('d MMM, yyyy').format(date);
  }

  Map<String, List<Map<String, dynamic>>> groupTxByDate() {
    final map = <String, List<Map<String, dynamic>>>{};
    for (final tx in allTx.take(shownCount)) {
      final DateTime d = tx['date'] as DateTime;
      final label = getDateLabel(d);
      map.putIfAbsent(label, () => []).add(tx);
    }
    return map;
  }

  // ---------- ICONS ----------
  IconData getCategoryIcon(String type, {bool isIncome = false}) {
    final t = type.toLowerCase();
    if (isIncome) {
      if (t.contains("salary")) return Icons.account_balance_wallet_rounded;
      if (t.contains("refund")) return Icons.replay_rounded;
      if (t.contains("interest")) return Icons.savings_rounded;
      if (t.contains("reward") || t.contains("cashback")) return Icons.card_giftcard_rounded;
      if (t.contains("cash") || t.contains("credit")) return Icons.attach_money_rounded;
      if (t.contains("bonus")) return Icons.emoji_events_rounded;
      if (t.contains("investment")) return Icons.trending_up_rounded;
      if (t.contains("business")) return Icons.business_center_rounded;
      return Icons.add_circle_outline_rounded;
    } else {
      if (t.contains("food") || t.contains("restaurant")) return Icons.restaurant_rounded;
      if (t.contains("grocery")) return Icons.shopping_cart_rounded;
      if (t.contains("rent")) return Icons.home_rounded;
      if (t.contains("fuel") || t.contains("petrol")) return Icons.local_gas_station_rounded;
      if (t.contains("shopping")) return Icons.shopping_bag_rounded;
      if (t.contains("health") || t.contains("medicine")) return Icons.local_hospital_rounded;
      if (t.contains("travel") || t.contains("flight") || t.contains("train")) return Icons.flight_takeoff_rounded;
      if (t.contains("entertainment") || t.contains("movie")) return Icons.movie_rounded;
      if (t.contains("education")) return Icons.school_rounded;
      if (t.contains("loan")) return Icons.account_balance_rounded;
      if (t.contains("credit card")) return Icons.credit_card_rounded;
      if (t.contains("upi")) return Icons.currency_rupee_rounded;
      return Icons.remove_circle_outline_rounded;
    }
  }

  // ---------- DETAILS SHEET ----------
  void _showBillImage(BuildContext context, String imageUrl) {
    showDialog(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        backgroundColor: Colors.transparent,
        child: GestureDetector(
          onTap: () => Navigator.of(context).pop(),
          child: Stack(
            children: [
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  color: Colors.black87,
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: InteractiveViewer(
                    child: Image.network(
                      imageUrl,
                      fit: BoxFit.contain,
                      loadingBuilder: (context, child, progress) =>
                      progress == null
                          ? child
                          : const Center(child: CircularProgressIndicator()),
                      errorBuilder: (context, error, stackTrace) =>
                      const Center(child: Text("Could not load attachment")),
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 12, top: 12,
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white, size: 32),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDetailsScreenFromUnified(Map<String, dynamic> doc, BuildContext context) async {
    final isIncome = (doc['type'] == 'income');
    final amount = doc['amount'] as double? ?? 0;
    final category = (doc['category'] ?? (isIncome ? 'Income' : 'Expense')).toString();
    final date = (doc['date'] as DateTime);
    final note = (doc['note'] ?? '').toString();
    final merchant = (doc['merchant'] ?? '').toString();
    final bankLogo = doc['bankLogo'] as String?;
    final schemeLogo = doc['schemeLogo'] as String?;
    final last4 = doc['cardLast4'] as String?;
    final channel = doc['channel'] as String?;

    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(18.0),
          child: ListView(
            shrinkWrap: true,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (bankLogo != null) Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Image.asset(bankLogo, width: 28, height: 28),
                  ),
                  Icon(getCategoryIcon(category, isIncome: isIncome),
                      size: 40, color: isIncome ? Colors.green : Colors.pink),
                  if (schemeLogo != null) Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Image.asset(schemeLogo, width: 26, height: 26),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                "${isIncome ? 'Income' : 'Expense'} - $category",
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 19),
                textAlign: TextAlign.center,
              ),
              if (channel != null && channel.isNotEmpty || (last4 != null && last4.isNotEmpty)) ...[
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (channel != null && channel.isNotEmpty)
                      Container(
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.blueGrey.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(channel, style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    if (last4 != null && last4.isNotEmpty)
                      Container(
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.deepPurple.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text("****$last4", style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              Text("Amount: ₹${amount.toStringAsFixed(2)}", style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text("Date: ${DateFormat('d MMM yyyy, h:mm a').format(date)}"),
              if (merchant.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Merchant:", style: TextStyle(fontWeight: FontWeight.bold)),
                Text(merchant),
              ],
              if (note.trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Note:", style: TextStyle(fontWeight: FontWeight.bold)),
                Text(note),
              ],
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (!isIncome && widget.onSplit != null)
                    TextButton.icon(
                      icon: const Icon(Icons.group, color: Colors.deepPurple, size: 21),
                      label: const Text("Split"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onSplit?.call(doc);
                      },
                    ),
                  if (widget.onEdit != null)
                    TextButton.icon(
                      icon: const Icon(Icons.edit, color: Colors.blue, size: 21),
                      label: const Text("Edit"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onEdit?.call(doc);
                      },
                    ),
                  if (widget.onDelete != null)
                    TextButton.icon(
                      icon: const Icon(Icons.delete, color: Colors.red, size: 21),
                      label: const Text("Delete"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onDelete?.call(doc);
                      },
                    ),
                  TextButton(
                    child: const Text("Close"),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  void _showDetailsScreenLegacy(dynamic item, bool isIncome, BuildContext context) async {
    // your existing bottom sheet logic for ExpenseItem/IncomeItem
    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(18.0),
          child: ListView(
            shrinkWrap: true,
            children: [
              Center(
                child: Icon(getCategoryIcon(isIncome ? item.type : item.type, isIncome: isIncome), size: 40, color: isIncome ? Colors.green : Colors.pink),
              ),
              const SizedBox(height: 16),
              Text(
                "${isIncome ? 'Income' : 'Expense'} - ${item.type}",
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 19),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text("Amount: ₹${item.amount.toStringAsFixed(2)}", style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text("Date: ${DateFormat('d MMM yyyy, h:mm a').format(item.date)}"),
              if ((item.note ?? '').toString().trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Note:", style: TextStyle(fontWeight: FontWeight.bold)),
                Text(item.note ?? ''),
              ],
              if (!isIncome && item.friendIds.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Split with:", style: TextStyle(fontWeight: FontWeight.bold)),
                Text(
                  item.friendIds.map((id) => widget.friendsById[id]?.name ?? "Friend").join(', '),
                ),
              ],
              if (isIncome && (item.source ?? '').isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Source:", style: TextStyle(fontWeight: FontWeight.bold)),
                Text(item.source),
              ],
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (!isIncome && widget.onSplit != null)
                    TextButton.icon(
                      icon: const Icon(Icons.group, color: Colors.deepPurple, size: 21),
                      label: const Text("Split"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onSplit?.call(item);
                      },
                    ),
                  if (widget.onEdit != null)
                    TextButton.icon(
                      icon: const Icon(Icons.edit, color: Colors.blue, size: 21),
                      label: const Text("Edit"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onEdit?.call(item);
                      },
                    ),
                  if (widget.onDelete != null)
                    TextButton.icon(
                      icon: const Icon(Icons.delete, color: Colors.red, size: 21),
                      label: const Text("Delete"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onDelete?.call(item);
                      },
                    ),
                  TextButton(
                    child: const Text("Close"),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  // ---------- BUILD ----------
  @override
  Widget build(BuildContext context) {
    final groupedTx = groupTxByDate();

    if (allTx.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: Text("No transactions found.")),
      );
    }

    return CustomDiamondCard(
      padding: const EdgeInsets.symmetric(horizontal: 0, vertical: 0),
      borderRadius: 21,
      child: ListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: groupedTx.keys.length + (shownCount < allTx.length ? 1 : 0),
        itemBuilder: (context, idx) {
          if (idx >= groupedTx.keys.length) {
            return Center(
              child: TextButton(
                child: const Text("Show More"),
                onPressed: () {
                  setState(() {
                    shownCount += 10;
                  });
                },
              ),
            );
          }

          final dateLabel = groupedTx.keys.elementAt(idx);
          final txs = groupedTx[dateLabel]!;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ---- DATE HEADER ----
              Container(
                margin: const EdgeInsets.only(left: 14, right: 8, top: 11, bottom: 4),
                padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
                decoration: BoxDecoration(
                  color: Colors.grey[200],
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Text(dateLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Colors.teal)),
              ),
              ...txs.map((tx) {
                final bool isIncome = tx['type'] == 'income';
                final String id = (tx['id'] ?? '').toString();
                final String category = (tx['category'] ?? (isIncome ? 'Income' : 'Expense')).toString();
                final String note = (tx['note'] ?? '').toString();
                final double amount = (tx['amount'] ?? 0.0) as double;

                // unified extras
                final String? bankLogo = tx['bankLogo'] as String?;
                final String? schemeLogo = tx['schemeLogo'] as String?;
                final String? merchant = (tx['merchant'] as String?)?.trim();
                final String? cardLast4 = tx['cardLast4'] as String?;
                final String? channel = tx['channel'] as String?;

                // legacy raw item
                final raw = tx['raw'];

                // Friend names (legacy only)
                String? friendsStr;
                if (tx['mode'] == 'legacy' && !isIncome && raw.friendIds.isNotEmpty) {
                  friendsStr = raw.friendIds
                      .map((fid) => widget.friendsById[fid]?.name ?? "Friend")
                      .join(', ');
                }

                final String showLine2 = () {
                  if (merchant != null && merchant.isNotEmpty) return merchant;
                  if (note.isNotEmpty) return note.length > 40 ? "${note.substring(0, 40)}..." : note;
                  return '';
                }();

                // --- MULTI-SELECT LOGIC ---
                final bool isSelectable = widget.multiSelectEnabled && widget.onSelectTx != null;
                final bool isSelected = isSelectable && widget.selectedIds.contains(id);

                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: isSelectable
                      ? () => widget.onSelectTx!(id, !isSelected)
                      : () {
                    if (tx['mode'] == 'unified') {
                      _showDetailsScreenFromUnified(tx, context);
                    } else {
                      _showDetailsScreenLegacy(raw, isIncome, context);
                    }
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    constraints: const BoxConstraints(minHeight: 58),
                    margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? Colors.deepPurple.withOpacity(0.09)
                          : Colors.white.withOpacity(0.93),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.grey.withOpacity(0.028),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                      border: isSelected
                          ? Border.all(color: Colors.deepPurple, width: 1.4)
                          : null,
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        if (isSelectable)
                          Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: Checkbox(
                              value: isSelected,
                              onChanged: (val) => widget.onSelectTx!(id, val ?? false),
                              activeColor: Colors.deepPurple,
                              visualDensity: VisualDensity.compact,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(7)),
                            ),
                          ),
                        // Logos + avatar
                        if (bankLogo != null) ...[
                          Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: Image.asset(bankLogo, width: 22, height: 22),
                          ),
                        ],
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: isIncome ? Colors.green[50] : Colors.pink[50],
                          child: Icon(
                            getCategoryIcon(category, isIncome: isIncome),
                            color: isIncome ? Colors.green[700] : Colors.pink[700],
                            size: 18,
                          ),
                        ),
                        if (schemeLogo != null)
                          Padding(
                            padding: const EdgeInsets.only(left: 6, right: 0),
                            child: Image.asset(schemeLogo, width: 18, height: 18),
                          ),
                        const SizedBox(width: 8),
                        // Texts
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Top row: Category/Amount + tags
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      "${category.isNotEmpty ? category : "Others"}: ₹${amount.toStringAsFixed(2)}",
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: isIncome ? Colors.green[700] : Colors.red[700],
                                        fontSize: 15.3,
                                        letterSpacing: 0.01,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  if (channel != null && channel.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 6),
                                      child: Chip(
                                        label: Text(channel, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                                        backgroundColor: Colors.blueGrey.withOpacity(0.12),
                                        visualDensity: VisualDensity.compact,
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                                      ),
                                    ),
                                  if (cardLast4 != null && cardLast4.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 6),
                                      child: Chip(
                                        label: Text("****$cardLast4", style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                                        backgroundColor: Colors.deepPurple.withOpacity(0.12),
                                        visualDensity: VisualDensity.compact,
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                                      ),
                                    ),
                                ],
                              ),
                              if (showLine2.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2.0),
                                  child: Text(
                                    showLine2,
                                    style: TextStyle(fontSize: 12.5, color: Colors.grey[700]),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              if (tx['mode'] == 'legacy')
                                Padding(
                                  padding: const EdgeInsets.only(top: 2.0),
                                  child: Row(
                                    children: [
                                      if (friendsStr != null) ...[
                                        Icon(Icons.person_2_rounded, size: 15, color: Colors.deepPurple[200]),
                                        Flexible(
                                          child: Text(
                                            " $friendsStr",
                                            style: TextStyle(
                                              fontSize: 12.5,
                                              color: Colors.deepPurple[400],
                                              fontWeight: FontWeight.w500,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ],
                                      if (tx['type'] == 'income' && (raw.source ?? '').toString().isNotEmpty) ...[
                                        const SizedBox(width: 8),
                                        Icon(Icons.input_rounded, size: 15, color: Colors.teal[300]),
                                        Flexible(
                                          child: Text(
                                            " ${raw.source}",
                                            style: TextStyle(
                                              fontSize: 12.5,
                                              color: Colors.teal[400],
                                              fontWeight: FontWeight.w500,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                        // Actions
                        Row(
                          children: [
                            if (tx['mode'] == 'legacy' && !isIncome && widget.onSplit != null)
                              IconButton(
                                icon: const Icon(Icons.group, color: Colors.deepPurple, size: 21),
                                tooltip: 'Split',
                                onPressed: () => widget.onSplit?.call(raw),
                              ),
                            if (widget.onEdit != null)
                              IconButton(
                                icon: const Icon(Icons.edit, color: Colors.blue, size: 21),
                                tooltip: 'Edit',
                                onPressed: () => widget.onEdit?.call(tx['mode'] == 'unified' ? tx : raw),
                              ),
                            if (widget.onDelete != null)
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.red, size: 21),
                                tooltip: 'Delete',
                                onPressed: () => widget.onDelete?.call(tx['mode'] == 'unified' ? tx : raw),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }
}
