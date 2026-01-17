// lib/widgets/group_expense_list_widget.dart

import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';

class GroupExpenseListWidget extends StatelessWidget {
  final List<ExpenseItem> expenses;
  final String currentUserId;
  final List<FriendModel> members;
  final void Function(ExpenseItem)? onDelete;

  const GroupExpenseListWidget({
    super.key,
    required this.expenses,
    required this.currentUserId,
    required this.members,
    this.onDelete,
  });

  // Helper: find a FriendModel by id (for payer display, etc)
  FriendModel? _findMember(String id) =>
      members.firstWhere((f) => f.phone == id,
          orElse: () => FriendModel(phone: id, name: 'Unknown'));

  @override
  Widget build(BuildContext context) {
    if (expenses.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Text("No expenses in this group yet."),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: NeverScrollableScrollPhysics(),
      itemCount: expenses.length,
      separatorBuilder: (_, __) => Divider(height: 1),
      itemBuilder: (context, i) {
        final e = expenses[i];
        final isSettlement = e.type.toLowerCase().contains('settle') ||
            (e.label ?? '').toLowerCase().contains('settle');
        final payer = _findMember(e.payerId);
        final isPaidByYou = e.payerId == currentUserId;

        // For custom splits, show your share in trailing and optionally other splits
        final isCustomSplit =
            e.customSplits != null && e.customSplits!.isNotEmpty;
        final yourShare = e.customSplits?[currentUserId] ??
            (e.amount / (e.friendIds.length + 1));
        String splitText = '';
        if (isCustomSplit) {
          splitText = 'Split: ';
          e.customSplits!.forEach((uid, amt) {
            final m = _findMember(uid);
            splitText += '${m?.name ?? 'User'} ₹${amt.toStringAsFixed(2)}, ';
          });
          splitText = splitText.replaceAll(RegExp(r', $'), '');
        }

        Widget subtitle;
        if (isSettlement) {
          subtitle = Text(
            isPaidByYou
                ? "You settled up"
                : "${payer?.name ?? "Someone"} settled up",
          );
        } else if (isCustomSplit) {
          subtitle = Text(
            splitText + (e.note.isNotEmpty ? " (Tap for details)" : ""),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          );
        } else {
          subtitle = Text(
            (isPaidByYou ? "You paid" : "${payer?.name ?? "Someone"} paid") +
                (e.note.isNotEmpty ? " (Tap for details)" : ""),
          );
        }

        return ListTile(
          leading: payer != null &&
                  payer.avatar.isNotEmpty &&
                  payer.avatar.startsWith('http')
              ? CircleAvatar(
                  backgroundImage: NetworkImage(payer.avatar), radius: 20)
              : CircleAvatar(
                  child: Text(payer?.avatar.isNotEmpty == true
                      ? payer!.avatar
                      : payer?.name[0] ?? "👤")),
          title: Text(
            isSettlement
                ? "Settlement"
                : (e.label?.isNotEmpty == true ? e.label! : "Expense"),
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          subtitle: subtitle,
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                "${isPaidByYou ? "- " : "+ "}₹${yourShare.toStringAsFixed(2)}",
                style: TextStyle(
                  color: isPaidByYou ? Colors.red : Colors.green,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (onDelete != null)
                IconButton(
                  icon: Icon(Icons.delete_outline, color: Colors.redAccent),
                  tooltip: "Delete entry",
                  onPressed: () => onDelete!(e),
                ),
            ],
          ),
          onTap: () {
            showModalBottomSheet(
              context: context,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              builder: (_) {
                return Padding(
                  padding: const EdgeInsets.all(22),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isSettlement
                            ? "Settlement"
                            : (e.label?.isNotEmpty == true
                                ? e.label!
                                : "Expense"),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      SizedBox(height: 8),
                      Text("Amount: ₹${e.amount.toStringAsFixed(2)}"),
                      if (isCustomSplit) ...[
                        SizedBox(height: 6),
                        Text("Custom Splits:"),
                        ...e.customSplits!.entries.map((entry) {
                          final m = _findMember(entry.key);
                          return Text(
                              "  • ${m?.name ?? 'User'}: ₹${entry.value.toStringAsFixed(2)}");
                        }),
                      ],
                      if (e.note.isNotEmpty) ...[
                        SizedBox(height: 10),
                        Text("Note:",
                            style: TextStyle(fontWeight: FontWeight.bold)),
                        Text(e.note),
                      ],
                      ...[
                        SizedBox(height: 10),
                        Text(
                            "Date: ${e.date.toLocal().toString().substring(0, 10)}"),
                      ],
                      if (e.category != null && e.category!.isNotEmpty) ...[
                        SizedBox(height: 10),
                        Text("Category: ${e.category}"),
                      ],
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}
