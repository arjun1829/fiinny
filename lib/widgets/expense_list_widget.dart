// lib/widgets/expense_list_widget.dart
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';

class ExpenseListWidget extends StatelessWidget {
  final List<ExpenseItem> expenses;
  final String currentUserPhone; // was userId, now phone!
  final FriendModel? friend;
  final void Function(ExpenseItem)? onDelete; // optional

  const ExpenseListWidget({
    Key? key,
    required this.expenses,
    required this.currentUserPhone,
    this.friend,
    this.onDelete,
  }) : super(key: key);

  String _money(double v) => "₹${v.toStringAsFixed(2)}";

  String _dateShort(DateTime? d) {
    if (d == null) return "";
    final dd = d.toLocal();
    return "${dd.day}/${dd.month}/${dd.year}";
  }

  // ---------- math helpers (local only; no API changes) ----------
  bool _isSettlement(ExpenseItem e) {
    final t = (e.type).toLowerCase();
    final lbl = (e.label ?? '').toLowerCase();
    if (t.contains('settle') || lbl.contains('settle')) return true;
    // Settle-up heuristic used across the app: single counterparty, no custom splits, flagged
    if ((e.friendIds.length == 1) && (e.customSplits == null || e.customSplits!.isNotEmpty == false)) {
      return e.isBill == true;
    }
    return false;
  }

  /// Participants = payer + friendIds + customSplit keys (defensive against legacy data).
  Set<String> _participantsOf(ExpenseItem e) {
    final s = <String>{};
    if (e.payerId.isNotEmpty) s.add(e.payerId);
    s.addAll(e.friendIds);
    if (e.customSplits != null && e.customSplits!.isNotEmpty) {
      s.addAll(e.customSplits!.keys);
    }
    return s;
  }

  /// Splits:
  /// - customSplits when present
  /// - else equal among participants
  Map<String, double> _splits(ExpenseItem e) {
    if (e.customSplits != null && e.customSplits!.isNotEmpty) {
      return Map<String, double>.from(e.customSplits!);
    }
    final participants = _participantsOf(e).toList();
    if (participants.isEmpty) return const {};
    final each = e.amount / participants.length;
    return {for (final id in participants) id: each};
  }

  /// Signed pairwise delta between 'you' and 'other':
  /// + => other owes YOU ; - => YOU owe other ; 0 => no effect between you two.
  double _pairSigned(ExpenseItem e, String you, String other) {
    final participants = _participantsOf(e);
    if (!participants.contains(you) || !participants.contains(other)) return 0.0;

    // Settlements: direct transfer payer -> friendIds, split equally among friendIds
    if (_isSettlement(e)) {
      final others = e.friendIds;
      if (others.isEmpty) return 0.0;
      final perOther = e.amount / others.length;
      if (e.payerId == you && others.contains(other)) return perOther;      // you paid them
      if (e.payerId == other && others.contains(you)) return -perOther;     // they paid you
      return 0.0;                                                            // third-party settlement
    }

    // Normal expenses
    final splits = _splits(e);

    // You paid ⇒ they owe you THEIR share.
    if (e.payerId == you && splits.containsKey(other)) {
      return splits[other] ?? 0.0;
    }
    // They paid ⇒ you owe them YOUR share.
    if (e.payerId == other && splits.containsKey(you)) {
      return -(splits[you] ?? 0.0);
    }

    // Third party paid (e.g., F1 paid while you’re viewing F2) ⇒ no pairwise effect.
    return 0.0;
  }

  @override
  Widget build(BuildContext context) {
    if (expenses.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Text(
          friend != null
              ? "No transactions with ${friend!.name} yet."
              : "No transactions yet.",
        ),
      );
    }

    // Copy list to preserve original order
    final items = List<ExpenseItem>.from(expenses);

    // In friend context: only keep rows that actually affect YOU <-> FRIEND
    if (friend != null) {
      final you = currentUserPhone;
      final other = friend!.phone;

      items.removeWhere((e) {
        final delta = _pairSigned(e, you, other);
        return delta.abs() < 0.005; // drop noise / third-party rows
      });

      if (items.isEmpty) {
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Text("No transactions impacting you and ${friend!.name}."),
        );
      }
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const ClampingScrollPhysics(),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final e = items[i];

        final isSettlement = _isSettlement(e);
        final isPaidByYou = e.payerId == currentUserPhone;

        // Who’s the counterparty label
        String counterParty() {
          if (friend != null) return friend!.name;
          // Group context or mixed: keep generic label
          return isPaidByYou ? "Group" : "A member";
        }

        // Custom split (for details / chips only)
        final hasCustomSplit = e.customSplits != null && e.customSplits!.isNotEmpty;
        final yourSplit = e.customSplits?[currentUserPhone] ?? 0.0;
        final friendSplit =
        friend != null ? (e.customSplits?[friend!.phone] ?? 0.0) : null;

        // Subtitle content (unchanged visually)
        Widget subtitle;
        if (isSettlement) {
          subtitle = Text(
            isPaidByYou
                ? "You settled up with ${counterParty()}"
                : "${counterParty()} settled up with you",
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          );
        } else if (hasCustomSplit) {
          final chips = <Widget>[
            _MiniChip(label: "You ${_money(yourSplit)}"),
          ];
          if (friendSplit != null) {
            chips.add(_MiniChip(label: "${friend!.name} ${_money(friendSplit)}"));
          }
          if (e.note.isNotEmpty) chips.add(_MiniChip(label: "Note"));
          subtitle = Wrap(
            spacing: 6,
            runSpacing: -6,
            children: chips,
          );
        } else {
          final who = isPaidByYou ? "You paid" : "${counterParty()} paid";
          final hasNote = e.note.isNotEmpty;
          subtitle = Text(
            hasNote ? "$who  •  ${e.note}" : who,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          );
        }

        // Card colors
        final baseColor = isSettlement ? Colors.green : Colors.blue;
        final bg = isSettlement ? Colors.green.withOpacity(.06) : Colors.blue.withOpacity(.06);

        // Pairwise amount for friend view; legacy amount elsewhere
        double? pairSigned;
        if (friend != null) {
          pairSigned = _pairSigned(e, currentUserPhone, friend!.phone);
        }

        return InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _showDetailsSheet(context, e, isSettlement, hasCustomSplit, yourSplit, friendSplit),
          onLongPress: () => _showActions(context, e, canDelete: onDelete != null),
          child: Container(
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: baseColor.withOpacity(.12)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Leading icon
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: baseColor.withOpacity(.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    isSettlement ? Icons.handshake : Icons.currency_rupee,
                    color: baseColor,
                  ),
                ),
                const SizedBox(width: 10),

                // Title + subtitle + date
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Title row (ellipsis-safe)
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              isSettlement
                                  ? "Settlement"
                                  : (e.label?.isNotEmpty == true ? e.label! : "Expense"),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15.5,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          // Date (small)
                          Text(
                            _dateShort(e.date),
                            style: TextStyle(
                              fontSize: 11.5,
                              color: Colors.grey[700],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      subtitle,
                    ],
                  ),
                ),

                const SizedBox(width: 10),

                // Trailing amount (friend context shows pairwise amount)
                ConstrainedBox(
                  constraints: const BoxConstraints(minWidth: 68, maxWidth: 120),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: Text(
                      friend != null
                          ? "₹${(pairSigned!.abs()).toStringAsFixed(0)}"
                          : (isPaidByYou ? "- " : "+ ") + _money(e.amount),
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        color: friend != null
                            ? (pairSigned! >= 0 ? Colors.teal.shade800 : Colors.redAccent)
                            : (isPaidByYou ? Colors.red[700] : Colors.green[700]),
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        letterSpacing: .2,
                      ),
                    ),
                  ),
                ),

                if (onDelete != null) ...[
                  const SizedBox(width: 2),
                  IconButton(
                    tooltip: "Delete",
                    splashRadius: 20,
                    icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                    onPressed: () => onDelete!(e),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  void _showDetailsSheet(
      BuildContext context,
      ExpenseItem e,
      bool isSettlement,
      bool hasCustomSplit,
      double yourSplit,
      double? friendSplit,
      ) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(22, 18, 22, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    isSettlement ? Icons.handshake : Icons.receipt_long,
                    color: isSettlement ? Colors.green : Colors.blue,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    isSettlement
                        ? "Settlement"
                        : (e.label?.isNotEmpty == true ? e.label! : "Expense"),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const Spacer(),
                  Text(
                    _dateShort(e.date),
                    style: TextStyle(fontSize: 12.5, color: Colors.grey[700]),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Text("Amount:", style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(width: 6),
                  Text(_money(e.amount)),
                ],
              ),
              const SizedBox(height: 6),
              if (hasCustomSplit) ...[
                const Text("Custom Split:", style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                _SplitLine(label: "You", value: yourSplit),
                if (friend != null)
                  _SplitLine(label: friend!.name, value: friendSplit ?? 0.0),
                const SizedBox(height: 6),
              ],
              if (e.category != null && e.category!.isNotEmpty) ...[
                Row(
                  children: [
                    const Text("Category:", style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(width: 6),
                    Text(e.category!),
                  ],
                ),
                const SizedBox(height: 6),
              ],
              if (e.note.isNotEmpty) ...[
                const Text("Note:", style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(e.note),
                const SizedBox(height: 6),
              ],
              Row(
                children: [
                  const Spacer(),
                  if (onDelete != null)
                    TextButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        onDelete!(e);
                      },
                      icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                      label: const Text("Delete"),
                      style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
                    ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  void _showActions(BuildContext context, ExpenseItem e, {required bool canDelete}) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.info_outline),
              title: const Text('View details'),
              onTap: () {
                Navigator.pop(context);
                final isSettlement = _isSettlement(e);
                final hasCustomSplit = e.customSplits != null && e.customSplits!.isNotEmpty;
                final yourSplit = e.customSplits?[currentUserPhone] ?? 0.0;
                final friendSplit =
                friend != null ? (e.customSplits?[friend!.phone] ?? 0.0) : null;
                _showDetailsSheet(context, e, isSettlement, hasCustomSplit, yourSplit, friendSplit);
              },
            ),
            if (canDelete)
              ListTile(
                leading: const Icon(Icons.delete_outline, color: Colors.redAccent),
                title: const Text('Delete'),
                onTap: () {
                  Navigator.pop(context);
                  onDelete?.call(e);
                },
              ),
          ],
        ),
      ),
    );
  }
}

class _MiniChip extends StatelessWidget {
  final String label;
  const _MiniChip({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.grey.withOpacity(.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 12.5),
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

class _SplitLine extends StatelessWidget {
  final String label;
  final double value;
  const _SplitLine({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, bottom: 2),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13.5),
            ),
          ),
          const SizedBox(width: 6),
          Text("•  ₹${value.toStringAsFixed(2)}",
              style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
