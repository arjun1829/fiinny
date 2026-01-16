// lib/group/group_overview_tab.dart
import 'package:flutter/material.dart';
import '../models/group_model.dart';
import '../models/friend_model.dart';
import '../models/expense_item.dart';
import 'expense_breakdown_sheet.dart';

class GroupOverviewTab extends StatelessWidget {
  final String currentUserPhone;
  final GroupModel group;
  final List<FriendModel> members;           // resolved members
  final List<ExpenseItem> expenses;          // group-only expenses
  final VoidCallback onAddExpense;
  final VoidCallback onSettleUp;
  final VoidCallback onRemind;               // new button

  const GroupOverviewTab({
    Key? key,
    required this.currentUserPhone,
    required this.group,
    required this.members,
    required this.expenses,
    required this.onAddExpense,
    required this.onSettleUp,
    required this.onRemind,
  }) : super(key: key);

  Map<String, FriendModel> get _byPhone =>
      {for (final f in members) f.phone: f};

  String _nameOf(String phone) {
    if (phone == currentUserPhone) return 'You';
    return _byPhone[phone]?.name ?? phone;
  }

  // Compute net by member (standard)
  Map<String, double> _netByMember() {
    final net = <String, double>{for (final m in members) m.phone: 0.0};

    for (final e in expenses) {
      if (e.payerId.isEmpty) continue;
      final participants = <String>{e.payerId, ...e.friendIds};
      final splits = e.customSplits ??
          {for (final id in participants) id: e.amount / participants.length};

      splits.forEach((id, share) {
        if (id == e.payerId) {
          net[id] = (net[id] ?? 0) + (e.amount - share);
        } else {
          net[id] = (net[id] ?? 0) - share;
        }
      });
    }
    return net;
  }

  // Minimize cash flow → get pairwise transfers (debtors -> creditors)
  List<_Transfer> _minimizeCashFlow(Map<String, double> net) {
    final debtors = <_Balance>[];
    final creditors = <_Balance>[];

    net.forEach((id, v) {
      if (v < -0.01) debtors.add(_Balance(id, -v)); // owes
      if (v > 0.01) creditors.add(_Balance(id, v)); // is owed
    });

    debtors.sort((a, b) => b.amount.compareTo(a.amount));
    creditors.sort((a, b) => b.amount.compareTo(a.amount));

    final transfers = <_Transfer>[];
    int i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      final take = debtors[i].amount < creditors[j].amount
          ? debtors[i].amount
          : creditors[j].amount;

      transfers.add(_Transfer(from: debtors[i].id, to: creditors[j].id, amount: take));

      debtors[i] = _Balance(debtors[i].id, debtors[i].amount - take);
      creditors[j] = _Balance(creditors[j].id, creditors[j].amount - take);

      if (debtors[i].amount <= 0.01) i++;
      if (creditors[j].amount <= 0.01) j++;
    }
    return transfers;
  }

  @override
  Widget build(BuildContext context) {
    final net = _netByMember();

    // Pairwise rows relevant to *you* only
    final pairs = _minimizeCashFlow(net)
        .where((t) => t.from == currentUserPhone || t.to == currentUserPhone)
        .toList();

    // Header: You / Created by
    final createdByYou = group.createdBy == currentUserPhone;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        // Header card
        _card(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _groupAvatar(),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(group.name,
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(
                      'Created by ${createdByYou ? "You" : _nameOf(group.createdBy)}',
                      style: TextStyle(color: Colors.grey[800], fontWeight: FontWeight.w600),
                    ),
                    Text(
                      'Members: ${group.memberPhones.length}',
                      style: TextStyle(color: Colors.grey[700]),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Actions: Add / Settle / Remind
        _card(
          child: Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              ElevatedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Add Expense'),
                onPressed: onAddExpense,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              ElevatedButton.icon(
                icon: const Icon(Icons.handshake_rounded),
                label: const Text('Settle Up'),
                onPressed: onSettleUp,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.teal.shade700,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              ElevatedButton.icon(
                icon: const Icon(Icons.notifications_active_rounded),
                label: const Text('Remind'),
                onPressed: onRemind,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.orange.shade700,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Your pairwise balances
        if (pairs.isNotEmpty)
          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your balances', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.teal.shade900)),
                const SizedBox(height: 8),
                ...pairs.map((t) {
                  final youOwe = t.from == currentUserPhone;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Icon(
                          youOwe ? Icons.call_made_rounded : Icons.call_received_rounded,
                          size: 16,
                          color: youOwe ? Colors.redAccent : Colors.green,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            youOwe
                                ? 'You owe ${_nameOf(t.to)} ₹${t.amount.toStringAsFixed(2)}'
                                : '${_nameOf(t.from)} owes you ₹${t.amount.toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
          ),

        if (pairs.isEmpty)
          _card(
            child: Text('No balances with members right now.',
                style: TextStyle(color: Colors.grey[700])),
          ),

        const SizedBox(height: 12),

        // Shared Group Activity (compact list here; tap → breakdown sheet)
        _card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Shared Group Activity',
                  style: TextStyle(fontWeight: FontWeight.w800, color: Colors.teal.shade900)),
              const SizedBox(height: 6),
              if (expenses.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Text('No transactions yet.', style: TextStyle(color: Colors.grey[700])),
                )
              else
                ...expenses.map((e) {
                  final isPaidByYou = e.payerId == currentUserPhone;
                  return InkWell(
                    onTap: () => showModalBottomSheet(
                      context: context,
                      useSafeArea: true,
                      isScrollControlled: true,
                      shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                      ),
                      builder: (_) => ExpenseBreakdownSheet(
                        expense: e,
                        currentUserPhone: currentUserPhone,
                        membersByPhone: _byPhone,
                      ),
                    ),
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(
                        backgroundColor: isPaidByYou ? Colors.blue.shade50 : Colors.green.shade50,
                        child: Icon(
                          isPaidByYou ? Icons.call_received_rounded : Icons.call_made_rounded,
                          color: isPaidByYou ? Colors.blue : Colors.green,
                        ),
                      ),
                      title: Text(e.label?.isNotEmpty == true ? e.label! : 'Expense',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(
                        (isPaidByYou ? 'You paid' : '${_nameOf(e.payerId)} paid') +
                            (e.note.isNotEmpty ? ' • ${e.note}' : ''),
                      ),
                      trailing: Text('₹${e.amount.toStringAsFixed(2)}',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  // UI helpers
  Widget _card({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 6))],
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: child,
    );
  }

  Widget _groupAvatar() {
    final url = group.avatarUrl;
    if (url != null && url.isNotEmpty) {
      return CircleAvatar(radius: 26, backgroundImage: NetworkImage(url));
    }
    return const CircleAvatar(radius: 26, child: Icon(Icons.groups_rounded));
  }
}

class _Balance {
  final String id;
  final double amount;
  const _Balance(this.id, this.amount);
}

class _Transfer {
  final String from;
  final String to;
  final double amount;
  const _Transfer({required this.from, required this.to, required this.amount});
}
