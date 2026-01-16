// lib/widgets/expense_list_widget.dart
import 'package:flutter/material.dart';

import '../models/expense_item.dart';
import '../models/friend_model.dart';

/// Upgraded list of expenses with:
/// - robust overflow handling on narrow screens
/// - attachment chip (attachmentUrl/attachmentName OR URL in note)
/// - compact chips & optional "in <Group>" badge
/// - friend-aware pairwise math for signed amounts
/// - optional onTap (or built-in fallback detail sheet)
/// - optional onDelete
class ExpenseListWidget extends StatelessWidget {
  final List<ExpenseItem> expenses;
  final String currentUserPhone;
  final FriendModel? friend;

  /// map of groupId -> groupName for badges
  final Map<String, String>? groupNames;

  final bool showGroupBadge;
  final void Function(ExpenseItem e)? onTapExpense;
  final void Function(ExpenseItem e)? onDelete;

  const ExpenseListWidget({
    Key? key,
    required this.expenses,
    required this.currentUserPhone,
    this.friend,
    this.groupNames,
    this.showGroupBadge = true,
    this.onTapExpense,
    this.onDelete,
  }) : super(key: key);

  // -------------------- formatting --------------------
  String _money(double v, {bool noPaise = false}) =>
      "₹${noPaise ? v.toStringAsFixed(0) : v.toStringAsFixed(2)}";

  String _dateShort(DateTime? d) {
    if (d == null) return "";
    final dd = d.toLocal();
    const months = [
      'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'
    ];
    return "${dd.day} ${months[dd.month - 1]} ${dd.year}";
  }

  // -------------------- logic --------------------
  bool _isSettlement(ExpenseItem e) {
    final t = (e.type).toLowerCase();
    final lbl = (e.label ?? '').toLowerCase();
    if (t.contains('settle') || lbl.contains('settle')) return true;
    if ((e.friendIds.length == 1) && (e.customSplits == null || e.customSplits!.isEmpty)) {
      return e.isBill == true;
    }
    return false;
  }

  Set<String> _participantsOf(ExpenseItem e) {
    final s = <String>{};
    if (e.payerId.isNotEmpty) s.add(e.payerId);
    s.addAll(e.friendIds);
    if (e.customSplits != null && e.customSplits!.isNotEmpty) {
      s.addAll(e.customSplits!.keys);
    }
    return s;
  }

  Map<String, double> _splits(ExpenseItem e) {
    if (e.customSplits != null && e.customSplits!.isNotEmpty) {
      return Map<String, double>.from(e.customSplits!);
    }
    final ps = _participantsOf(e).toList();
    if (ps.isEmpty) return const {};
    final each = e.amount / ps.length;
    return {for (final id in ps) id: each};
  }

  /// Signed pairwise delta between 'you' and 'other':
  /// + => other owes YOU ; - => YOU owe other ; 0 => no pairwise effect.
  double _pairSigned(ExpenseItem e, String you, String other) {
    final participants = _participantsOf(e);
    if (!participants.contains(you) || !participants.contains(other)) return 0.0;

    if (_isSettlement(e)) {
      final others = e.friendIds;
      if (others.isEmpty) return 0.0;
      final per = e.amount / others.length;
      if (e.payerId == you && others.contains(other)) return per;   // you paid them
      if (e.payerId == other && others.contains(you)) return -per;  // they paid you
      return 0.0;
    }

    final splits = _splits(e);
    if (e.payerId == you && splits.containsKey(other)) {
      return splits[other] ?? 0.0; // they owe you their share
    }
    if (e.payerId == other && splits.containsKey(you)) {
      return -(splits[you] ?? 0.0); // you owe them your share
    }
    return 0.0;
  }

  bool _noteHasUrl(String note) {
    if (note.isEmpty) return false;
    return RegExp(r'https?://\S+', caseSensitive: false).hasMatch(note);
  }

  IconData _categoryIcon(String? cat) {
    final c = (cat ?? '').toLowerCase();
    if (c.contains('food') || c.contains('lunch') || c.contains('dinner')) {
      return Icons.restaurant_rounded;
    }
    if (c.contains('travel') || c.contains('trip') || c.contains('flight')) {
      return Icons.flight_takeoff_rounded;
    }
    if (c.contains('stay') || c.contains('hotel')) return Icons.hotel_rounded;
    if (c.contains('cab') || c.contains('ride') || c.contains('uber')) {
      return Icons.local_taxi_rounded;
    }
    if (c.contains('grocer')) return Icons.local_grocery_store_rounded;
    if (c.contains('movie') || c.contains('entertain')) return Icons.local_activity_rounded;
    if (c.contains('fuel') || c.contains('gas')) return Icons.local_gas_station_rounded;
    return Icons.receipt_long_rounded;
  }

  // -------------------- build --------------------
  @override
  Widget build(BuildContext context) {
    if (expenses.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Text(friend != null
            ? "No transactions with ${friend!.name} yet."
            : "No transactions yet."),
      );
    }

    // Copy to preserve caller list
    final items = List<ExpenseItem>.from(expenses);

    // In friend view: keep only rows that affect YOU <-> FRIEND
    if (friend != null) {
      final you = currentUserPhone;
      final other = friend!.phone;
      items.removeWhere((e) => _pairSigned(e, you, other).abs() < 0.005);
      if (items.isEmpty) {
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Text("No transactions impacting you and ${friend!.name}."),
        );
      }
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(), // parent scrolls
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final e = items[i];

        final isSettlement = _isSettlement(e);
        final paidByYou = e.payerId == currentUserPhone;

        final String title = isSettlement
            ? "Settlement"
            : (e.label?.trim().isNotEmpty == true
            ? e.label!.trim()
            : (e.category?.trim().isNotEmpty == true
            ? e.category!.trim()
            : "Expense"));

        final String dateStr = _dateShort(e.date);

        // Signed amount (friend view) or +/- by payer
        late final String trailingText;
        late final Color trailingColor;
        if (friend != null) {
          final v = _pairSigned(e, currentUserPhone, friend!.phone);
          trailingText = _money(v.abs(), noPaise: true);
          trailingColor = v >= 0 ? Colors.teal.shade800 : Colors.redAccent;
        } else {
          trailingText = (paidByYou ? "- " : "+ ") + _money(e.amount, noPaise: true);
          trailingColor = paidByYou ? Colors.red.shade700 : Colors.green.shade700;
        }

        // Chips
        final List<Widget> chips = [];
        if (isSettlement) {
          final who = friend?.name ?? "member";
          final settleText = paidByYou ? "You settled with $who" : "$who settled with you";
          chips.add(_chip(
            text: settleText,
            fg: Colors.teal.shade900,
            bg: Colors.teal.withValues(alpha: .10),
            icon: Icons.handshake,
          ));
        } else {
          chips.add(_chip(
            text: paidByYou ? "You paid" : "Paid by ${friend != null ? friend!.name : 'member'}",
            fg: Colors.grey.shade900,
            bg: Colors.grey.withValues(alpha: .12),
            icon: Icons.person,
          ));
        }

        if ((e.category ?? '').trim().isNotEmpty) {
          chips.add(_chip(
            text: e.category!.trim(),
            fg: Colors.indigo.shade900,
            bg: Colors.indigo.withValues(alpha: .08),
            icon: _categoryIcon(e.category),
          ));
        }

        // Custom split quick summary (your share / friend's share)
        final hasCustom = e.customSplits != null && e.customSplits!.isNotEmpty;
        if (hasCustom) {
          final yourShare = e.customSplits?[currentUserPhone];
          if (yourShare != null) {
            chips.add(_chip(
              text: "You ${_money(yourShare, noPaise: true)}",
              fg: Colors.black87,
              bg: Colors.grey.withValues(alpha: .12),
              icon: Icons.account_circle,
            ));
          }
          if (friend != null) {
            final fs = e.customSplits?[friend!.phone];
            if (fs != null) {
              chips.add(_chip(
                text: "${friend!.name} ${_money(fs, noPaise: true)}",
                fg: Colors.black87,
                bg: Colors.grey.withValues(alpha: .12),
                icon: Icons.account_circle_outlined,
              ));
            }
          }
        }

        // Attachment/Note badges
        final hasAttachExplicit = (e.attachmentUrl ?? '').trim().isNotEmpty ||
            (e.attachmentName ?? '').trim().isNotEmpty;
        final hasAttachViaNote = _noteHasUrl(e.note);
        final hasNote = e.note.trim().isNotEmpty;

        if (hasNote) {
          chips.add(_chip(
            text: "Note",
            fg: Colors.orange.shade900,
            bg: Colors.orange.withValues(alpha: .10),
            icon: Icons.sticky_note_2_outlined,
          ));
        }
        if (hasAttachExplicit || hasAttachViaNote) {
          chips.add(_chip(
            text: "Attachment",
            fg: Colors.blueGrey.shade900,
            bg: Colors.blueGrey.withValues(alpha: .10),
            icon: Icons.attach_file_rounded,
          ));
        }

        // Group badge
        final gid = (e.groupId ?? '');
        if (showGroupBadge && gid.isNotEmpty) {
          final gName = groupNames?[gid] ?? 'Group';
          chips.add(_chip(
            text: "in $gName",
            fg: Colors.teal.shade900,
            bg: Colors.teal.withValues(alpha: .10),
            icon: Icons.groups_rounded,
          ));
        }

        // Visual styles
        final Color accent = isSettlement ? Colors.teal : Colors.indigo;
        final Color cardBorder = accent.withValues(alpha: .14);
        final Color cardBg = accent.withValues(alpha: .06);

        return InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => onTapExpense != null ? onTapExpense!(e) : _showFallbackDetails(context, e),
          onLongPress: () => _showActions(context, e, canDelete: onDelete != null),
          child: Container(
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: cardBorder),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // leading bubble
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(color: accent.withValues(alpha: .15), shape: BoxShape.circle),
                  child: Icon(isSettlement ? Icons.handshake : Icons.receipt_long_rounded, color: accent),
                ),
                const SizedBox(width: 10),

                // middle (expands and ellipsizes first)
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // title + date row
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              dateStr,
                              maxLines: 1,
                              softWrap: false,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.right,
                              style: TextStyle(fontSize: 11.5, color: Colors.grey[700]),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      // chips
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Wrap(
                          spacing: 6,
                          runSpacing: -6,
                          children: chips,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(width: 8),

                // right cluster (fits instead of overflowing)
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        trailingText,
                        maxLines: 1,
                        overflow: TextOverflow.fade,
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          color: trailingColor,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          letterSpacing: .2,
                        ),
                      ),
                      if (onDelete != null) ...[
                        const SizedBox(width: 6),
                        ConstrainedBox(
                          constraints: const BoxConstraints.tightFor(width: 36, height: 36),
                          child: IconButton(
                            padding: EdgeInsets.zero,
                            splashRadius: 18,
                            tooltip: "Delete",
                            onPressed: () => onDelete!(e),
                            icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // -------------------- fallback details sheet --------------------
  void _showFallbackDetails(BuildContext context, ExpenseItem e) {
    final isSettlement = _isSettlement(e);
    final hasCustom = e.customSplits != null && e.customSplits!.isNotEmpty;

    final yourSplit = e.customSplits?[currentUserPhone] ?? 0.0;
    final friendSplit = (friend != null) ? (e.customSplits?[friend!.phone] ?? 0.0) : null;

    final hasAttach = (e.attachmentUrl ?? '').trim().isNotEmpty ||
        (e.attachmentName ?? '').trim().isNotEmpty ||
        _noteHasUrl(e.note);

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(isSettlement ? Icons.handshake : Icons.receipt_long_rounded,
                    color: isSettlement ? Colors.teal : Colors.indigo),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isSettlement ? "Settlement" : (e.label?.isNotEmpty == true ? e.label! : "Expense"),
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Text(_dateShort(e.date), style: TextStyle(color: Colors.grey[700])),
              ],
            ),
            const SizedBox(height: 10),

            Row(children: [
              const Text("Amount:", style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(width: 6),
              Text(_money(e.amount)),
            ]),
            const SizedBox(height: 6),

            if ((e.category ?? '').isNotEmpty) ...[
              Row(children: [
                const Text("Category:", style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(width: 6),
                Flexible(child: Text(e.category!)),
              ]),
              const SizedBox(height: 6),
            ],

            if (hasCustom) ...[
              const Text("Custom split", style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              _SplitLine(label: "You", value: yourSplit),
              if (friend != null) _SplitLine(label: friend!.name, value: friendSplit ?? 0.0),
              const SizedBox(height: 6),
            ],

            if (e.note.trim().isNotEmpty) ...[
              const Text("Note", style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(e.note.trim()),
              const SizedBox(height: 6),
            ],

            if (hasAttach) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(Icons.attach_file_rounded, size: 18),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      (e.attachmentName ?? '').trim().isNotEmpty
                          ? e.attachmentName!.trim()
                          : ((e.attachmentUrl ?? '').trim().isNotEmpty ? 'Attachment' : 'Link in note'),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
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
      ),
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
                onTapExpense != null ? onTapExpense!(e) : _showFallbackDetails(context, e);
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

  // -------------------- tiny UI bits --------------------
  Widget _chip({
    required String text,
    required Color fg,
    required Color bg,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: fg),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg), maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
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
            child: Text(label, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5)),
          ),
          const SizedBox(width: 6),
          Text("•  ₹${value.toStringAsFixed(2)}", style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
