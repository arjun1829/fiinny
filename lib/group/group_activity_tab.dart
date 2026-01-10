// lib/group/group_activity_tab.dart
import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import '../models/group_model.dart';
import '../models/friend_model.dart';
import '../models/expense_item.dart';
import 'group_balance_math.dart';

class GroupActivityTab extends StatelessWidget {
  final String currentUserPhone;
  final GroupModel group;
  final List<FriendModel> members;
  final List<ExpenseItem> expenses;

  /// Optional actions exposed to the parent
  final void Function(ExpenseItem e)? onEdit;
  final void Function(ExpenseItem e)? onDelete;

  /// Use this to jump to Chat tab and prefill context
  final void Function(ExpenseItem e)? onComment;

  const GroupActivityTab({
    Key? key,
    required this.currentUserPhone,
    required this.group,
    required this.members,
    required this.expenses,
    this.onEdit,
    this.onDelete,
    this.onComment,
  }) : super(key: key);

  // ---------- Helpers ----------
  FriendModel _friend(String phone) => members.firstWhere(
        (f) => f.phone == phone,
        orElse: () => FriendModel(phone: phone, name: phone, avatar: "👤"),
      );

  Widget _avatar(String phone, {double radius = 16}) {
    final f = _friend(phone);
    final a = f.avatar;
    if (a.startsWith('http')) {
      return CircleAvatar(radius: radius, backgroundImage: NetworkImage(a));
    }
    final text = (a.isNotEmpty ? a : (f.name.isNotEmpty ? f.name[0] : '?'))
        .toUpperCase();
    return CircleAvatar(radius: radius, child: Text(text));
  }

  String _fmtShort(DateTime dt) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${dt.day} ${months[dt.month - 1]}';
  }

  String _bucketFor(DateTime dt) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final d = DateTime(dt.year, dt.month, dt.day);
    final diff = today.difference(d).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    if (now.year == dt.year && now.month == dt.month) return 'This Month';
    return 'Earlier';
  }

  void _showExpenseDetails(BuildContext context, ExpenseItem e) {
    final splits = computeSplits(e);
    final payer = _friend(e.payerId);

    showModalBottomSheet(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 4,
              width: 44,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            // Header row
            Row(
              children: [
                const Icon(Icons.receipt_long_rounded),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    e.label?.isNotEmpty == true
                        ? e.label!
                        : (e.category?.isNotEmpty == true
                            ? e.category!
                            : "Expense"),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  "₹${e.amount.toStringAsFixed(2)}",
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // Payer / date
            Row(
              children: [
                const Text("Paid by: ",
                    style: TextStyle(fontWeight: FontWeight.w700)),
                _avatar(e.payerId, radius: 12),
                const SizedBox(width: 8),
                InkWell(
                  onTap: payer.phone == currentUserPhone
                      ? null
                      : () {
                          Navigator.pushNamed(
                            context,
                            '/friend-detail',
                            arguments: {
                              'friendId': payer.phone,
                              'friendName': payer.name,
                            },
                          );
                        },
                  borderRadius: BorderRadius.circular(4),
                  child: Text(
                    payer.phone == currentUserPhone ? "You" : payer.name,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      decoration: payer.phone == currentUserPhone
                          ? null
                          : TextDecoration.underline,
                      color: payer.phone == currentUserPhone
                          ? null
                          : Theme.of(context).primaryColor,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  "${_fmtShort(e.date)} ${e.date.hour.toString().padLeft(2, '0')}:${e.date.minute.toString().padLeft(2, '0')}",
                  style: TextStyle(color: Colors.grey.shade700),
                ),
              ],
            ),
            if (e.category != null && e.category!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  const Text("Category: ",
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  Flexible(child: Text(e.category!)),
                ],
              ),
            ],
            if (e.note.isNotEmpty) ...[
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: Text("Note: ${e.note}"),
              ),
            ],
            const Divider(height: 22),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                "Split details",
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: Colors.teal.shade900,
                ),
              ),
            ),
            const SizedBox(height: 10),
            ...splits.entries.map((s) {
              final f = _friend(s.key);
              final isYou = s.key == currentUserPhone;
              final owes = s.key != e.payerId; // payer "paid", others "owe"
              final subtitle = owes
                  ? (isYou ? "You owe" : "Owes")
                  : (isYou ? "You paid" : "Paid");
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: _avatar(s.key),
                title: Text(isYou ? "You" : f.name,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text("$subtitle ₹${s.value.toStringAsFixed(2)}"),
                trailing: Text(
                  "₹${s.value.toStringAsFixed(2)}",
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: owes ? Colors.redAccent : Colors.green,
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
            // Actions inside sheet
            Row(
              children: [
                OutlinedButton.icon(
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const Text('Discuss'),
                  onPressed: onComment == null
                      ? null
                      : () {
                          Navigator.pop(context);
                          onComment!(e);
                        },
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  icon: const Icon(Icons.edit),
                  label: const Text('Edit'),
                  onPressed: onEdit == null
                      ? null
                      : () {
                          Navigator.pop(context);
                          onEdit!(e);
                        },
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  icon:
                      const Icon(Icons.delete_outline, color: Colors.redAccent),
                  label: const Text('Delete',
                      style: TextStyle(color: Colors.redAccent)),
                  onPressed: onDelete == null
                      ? null
                      : () {
                          Navigator.pop(context);
                          onDelete!(e);
                        },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    if (expenses.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.receipt_long_outlined,
                size: 42, color: Colors.grey.shade500),
            const SizedBox(height: 8),
            Text("No group activity yet.",
                style: TextStyle(color: Colors.grey.shade700)),
          ],
        ),
      );
    }

    // Sort & bucket
    final sorted = [...expenses]..sort((a, b) => b.date.compareTo(a.date));
    final sections = <String, List<ExpenseItem>>{};
    for (final e in sorted) {
      final key = _bucketFor(e.date);
      (sections[key] ??= []).add(e);
    }

    final headerStyle = TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.w800,
      color: Colors.teal.shade900,
      letterSpacing: .2,
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: sections.entries.map((entry) {
        final title = entry.key;
        final list = entry.value;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Section header
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 10, 2, 8),
              child: Text(title.toUpperCase(), style: headerStyle),
            ),
            ...list.map((e) => _GlassExpenseCard(
                  expense: e,
                  currentUserPhone: currentUserPhone,
                  friendResolver: _friend,
                  avatarBuilder: _avatar,
                  onTap: () => _showExpenseDetails(context, e),
                  onEdit: onEdit,
                  onDelete: onDelete,
                  onComment: onComment,
                )),
            const SizedBox(height: 8),
          ],
        );
      }).toList(),
    );
  }
}

// ============== Glassy Item card ==============
class _GlassExpenseCard extends StatelessWidget {
  final ExpenseItem expense;
  final String currentUserPhone;
  final FriendModel Function(String phone) friendResolver;
  final Widget Function(String phone, {double radius}) avatarBuilder;
  final VoidCallback onTap;
  final void Function(ExpenseItem e)? onEdit;
  final void Function(ExpenseItem e)? onDelete;
  final void Function(ExpenseItem e)? onComment;

  const _GlassExpenseCard({
    Key? key,
    required this.expense,
    required this.currentUserPhone,
    required this.friendResolver,
    required this.avatarBuilder,
    required this.onTap,
    this.onEdit,
    this.onDelete,
    this.onComment,
  }) : super(key: key);

  String _dateStr(DateTime d) =>
      "${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}";

  @override
  Widget build(BuildContext context) {
    final payer = friendResolver(expense.payerId);
    final splits = computeSplits(expense);
    final title = expense.label?.isNotEmpty == true
        ? expense.label!
        : (expense.category?.isNotEmpty == true
            ? expense.category!
            : "Expense");
    final cat = expense.category;

    // People preview (first 3)
    final previewPhones = splits.keys.take(3).toList();
    final more = splits.length - previewPhones.length;

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(.65),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(.6)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(.06),
                blurRadius: 12,
                offset: const Offset(0, 6),
              )
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title + amount + menu
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  avatarBuilder(expense.payerId, radius: 16),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.teal.withOpacity(.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      "₹${expense.amount.toStringAsFixed(0)}",
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: Colors.teal.shade900,
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  PopupMenuButton<String>(
                    tooltip: 'More',
                    onSelected: (v) {
                      if (v == 'edit' && onEdit != null) onEdit!(expense);
                      if (v == 'delete' && onDelete != null) onDelete!(expense);
                      if (v == 'discuss' && onComment != null)
                        onComment!(expense);
                    },
                    itemBuilder: (_) => [
                      const PopupMenuItem(
                          value: 'discuss',
                          child: ListTile(
                              leading: Icon(Icons.chat_bubble_outline),
                              title: Text('Discuss'),
                              dense: true)),
                      const PopupMenuItem(
                          value: 'edit',
                          child: ListTile(
                              leading: Icon(Icons.edit),
                              title: Text('Edit'),
                              dense: true)),
                      const PopupMenuItem(
                          value: 'delete',
                          child: ListTile(
                              leading: Icon(Icons.delete_outline,
                                  color: Colors.redAccent),
                              title: Text('Delete',
                                  style: TextStyle(color: Colors.redAccent)),
                              dense: true)),
                    ],
                    icon: const Icon(Icons.more_vert),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Meta chips: category / date / people
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (cat != null && cat.isNotEmpty)
                    _chip(
                        icon: Icons.category_outlined,
                        text: cat,
                        fg: Colors.indigo.shade900,
                        bg: Colors.indigo.withOpacity(.08)),
                  _chip(
                      icon: Icons.event,
                      text: _dateStr(expense.date),
                      fg: Colors.grey.shade900,
                      bg: Colors.grey.withOpacity(.10)),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ...previewPhones.map((p) => Padding(
                            padding: const EdgeInsets.only(right: 4),
                            child: avatarBuilder(p, radius: 10),
                          )),
                      if (more > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.teal.withOpacity(.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text("+$more",
                              style: TextStyle(
                                  color: Colors.teal.shade900,
                                  fontWeight: FontWeight.w700)),
                        ),
                    ],
                  ),
                ],
              ),

              // Note (quiet, single line)
              if (expense.note.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  expense.note,
                  style: TextStyle(color: Colors.grey.shade800),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],

              // Actions row (small, subtle)
              const SizedBox(height: 8),
              Row(
                children: [
                  InkWell(
                    onTap: payer.phone == currentUserPhone
                        ? null
                        : () {
                            Navigator.pushNamed(
                              context,
                              '/friend-detail',
                              arguments: {
                                'friendId': payer.phone,
                                'friendName': payer.name,
                              },
                            );
                          },
                    borderRadius: BorderRadius.circular(4),
                    child: Text(
                      "Paid by ${payer.phone == currentUserPhone ? "You" : payer.name}",
                      style: TextStyle(
                        color: payer.phone == currentUserPhone
                            ? Colors.grey.shade800
                            : Theme.of(context).primaryColor,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                        decoration: payer.phone == currentUserPhone
                            ? null
                            : TextDecoration.underline,
                      ),
                    ),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => onTap(),
                    icon: const Icon(Icons.info_outline, size: 18),
                    label: const Text("Details"),
                    style: TextButton.styleFrom(
                        foregroundColor: Colors.teal.shade800),
                  ),
                  const SizedBox(width: 6),
                  TextButton.icon(
                    onPressed:
                        onComment == null ? null : () => onComment!(expense),
                    icon: const Icon(Icons.chat_bubble_outline, size: 18),
                    label: const Text("Discuss"),
                    style: TextButton.styleFrom(
                        foregroundColor: Colors.orange.shade800),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip({
    required IconData icon,
    required String text,
    required Color fg,
    required Color bg,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 6),
          Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
