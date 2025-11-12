// lib/widgets/split_summary_widget.dart
import 'package:flutter/material.dart';
import 'package:characters/characters.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../group/group_balance_math.dart';
import '../services/contact_name_service.dart';

class SplitSummaryWidget extends StatelessWidget {
  final List<ExpenseItem> expenses;
  final List<FriendModel> friends;
  final String userPhone;
  final ContactNameService? contactNames;

  const SplitSummaryWidget({
    Key? key,
    required this.expenses,
    required this.friends,
    required this.userPhone,
    this.contactNames,
  }) : super(key: key);

  FriendModel? _friend(String phone) {
    try {
      return friends.firstWhere((f) => f.phone == phone);
    } catch (_) {
      return null;
    }
  }

  bool _involvesUser(ExpenseItem e) {
    return e.payerId == userPhone ||
        e.friendIds.contains(userPhone) ||
        (e.customSplits?.containsKey(userPhone) ?? false);
  }

  String _groupDigits(String s) {
    return s.replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]} ',
    );
  }

  String _money0(num v) => "₹${_groupDigits(v.toStringAsFixed(0))}";

  @override
  Widget build(BuildContext context) {
    final pair = pairwiseNetForUser(expenses, userPhone);

    double owedToYou = 0, youOwe = 0;
    int openBalances = 0;

    pair.forEach((phone, net) {
      if (net == 0) return;
      openBalances++;
      if (net > 0) {
        owedToYou += net;
      } else {
        youOwe += -net;
      }
    });

    final net = owedToYou - youOwe;
    final yourTxCount = expenses.where(_involvesUser).length;

    final top = pair.entries
        .where((e) => e.key != userPhone && e.value != 0)
        .toList()
      ..sort((a, b) => b.value.abs().compareTo(a.value.abs()));
    final top4 = top.take(4).toList();

    final isEmpty = owedToYou == 0 && youOwe == 0;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.7),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min, // Fix overflow
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Icon(Icons.receipt_long_rounded,
                  color: Theme.of(context).colorScheme.primary, size: 22),
              const SizedBox(width: 8),
              const Text(
                "Split Summary",
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          _RowLine(
            label: "Owed to you",
            value: _money0(owedToYou),
            valueColor: Colors.teal.shade800,
          ),
          _RowLine(
            label: "You owe",
            value: _money0(youOwe),
            valueColor: Colors.redAccent,
          ),
          _RowLine(
            label: "Net",
            value: "${net >= 0 ? '+ ' : '- '}${_money0(net.abs())}",
            valueColor: net >= 0 ? Colors.green : Colors.redAccent,
            isBold: true,
          ),
          _RowLine(
            label: "Open balances",
            value: _groupDigits(openBalances.toString()),
          ),
          _RowLine(
            label: "Your transactions",
            value: _groupDigits(yourTxCount.toString()),
          ),

          const SizedBox(height: 12),
          Divider(color: Colors.grey.shade200, height: 1),
          const SizedBox(height: 10),

          Row(
            children: [
              Icon(Icons.trending_up_rounded,
                  size: 18, color: Colors.teal.shade800),
              const SizedBox(width: 8),
              Text(
                "Top Balances",
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  color: Colors.teal.shade900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          if (isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(
                "All settled for now.",
                style: TextStyle(color: Colors.grey.shade700),
              ),
            )
          else
            ...top4.map((entry) {
              final friend = _friend(entry.key);
              final displayName = _displayName(friend, entry.key);
              final owesYou = entry.value > 0;
              final description = owesYou
                  ? '$displayName owes you'
                  : 'You owe $displayName';
              return _TopLine(
                phone: entry.key,
                friend: friend,
                displayName: displayName,
                description: description,
                amountText: _money0(entry.value.abs()),
                amountColor:
                    owesYou ? Colors.teal.shade800 : Colors.redAccent,
              );
            }),
        ],
      ),
    );
  }

  String _displayName(FriendModel? f, String phone) {
    final fallback = (f != null && f.name.isNotEmpty) ? f.name : phone;
    final remoteName = f?.name;
    final service = contactNames;
    if (service != null) {
      return service
          .bestDisplayName(
            phone: phone,
            remoteName: remoteName,
            fallback: fallback,
          )
          .trim();
    }
    if (f == null) return fallback;
    return fallback;
  }
}

class _RowLine extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final bool isBold;

  const _RowLine({
    Key? key,
    required this.label,
    required this.value,
    this.valueColor,
    this.isBold = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
      child: Row(
        children: [
          Expanded(
              child: Text(label,
                  style: TextStyle(
                      color: Colors.grey.shade800,
                      fontWeight: FontWeight.w600))),
          Text(value,
              style: TextStyle(
                  color: valueColor ?? Colors.black87,
                  fontWeight: isBold ? FontWeight.w800 : FontWeight.w700)),
        ],
      ),
    );
  }
}

class _TopLine extends StatelessWidget {
  final String phone;
  final FriendModel? friend;
  final String displayName;
  final String description;
  final String amountText;
  final Color amountColor;

  const _TopLine({
    Key? key,
    required this.phone,
    required this.friend,
    required this.displayName,
    required this.description,
    required this.amountText,
    required this.amountColor,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          _TinyAvatar(phone: phone, friend: friend, displayName: displayName),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              "$displayName — $description",
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontWeight: FontWeight.w600, color: Colors.black87),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            amountText,
            style: TextStyle(
                color: amountColor, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _AvatarCache {
  static final Map<String, String?> _map = {};

  static Future<String?> getUrl(String phone) async {
    if (_map.containsKey(phone)) return _map[phone];
    try {
      final snap = await FirebaseFirestore.instance
          .collection('users')
          .doc(phone)
          .get();
      final url = (snap.data()?['avatar'] as String?)?.trim();
      _map[phone] = (url != null && url.isNotEmpty) ? url : null;
      return _map[phone];
    } catch (_) {
      _map[phone] = null;
      return null;
    }
  }
}

class _TinyAvatar extends StatelessWidget {
  final String phone;
  final FriendModel? friend;
  final String displayName;
  const _TinyAvatar({
    required this.phone,
    this.friend,
    required this.displayName,
  });

  @override
  Widget build(BuildContext context) {
    final a = friend?.avatar ?? '';
    if (a.startsWith('http')) {
      return CircleAvatar(radius: 14, backgroundImage: NetworkImage(a));
    }
    if (a.startsWith('assets/')) {
      return CircleAvatar(radius: 14, backgroundImage: AssetImage(a));
    }
    if (a.isNotEmpty && a.length == 1) {
      return CircleAvatar(
          radius: 14, child: Text(a, style: const TextStyle(fontSize: 13)));
    }

    return FutureBuilder<String?>(
      future: _AvatarCache.getUrl(phone),
      builder: (context, snap) {
        final url = snap.data;
        if (url != null && url.startsWith('http')) {
          return CircleAvatar(radius: 14, backgroundImage: NetworkImage(url));
        }
        final nameSource =
            (friend?.name.isNotEmpty == true) ? friend!.name : displayName;
        final initial = nameSource.isNotEmpty
            ? nameSource.characters.first.toUpperCase()
            : '👤';
        return CircleAvatar(
            radius: 14, child: Text(initial, style: const TextStyle(fontSize: 13)));
      },
    );
  }
}
