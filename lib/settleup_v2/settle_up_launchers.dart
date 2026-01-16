import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../group/group_balance_math.dart' as gbm;
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';
import '../services/friend_service.dart';
import '../services/group_service.dart';

import 'pairwise_math.dart';
import 'settle_up_sheet_v2.dart';

class SettleUpFlowV2Launcher {
  static Future<bool?> openForFriend({
    required BuildContext context,
    required String currentUserPhone,
    required FriendModel friend,
    String? friendDisplayName,
    String? friendAvatarUrl,
    String? friendSubtitle,
  }) async {
    final expenses = await ExpenseService().getExpenses(currentUserPhone);
    final pairwise = pairwiseExpenses(currentUserPhone, friend.phone, expenses);
    if (pairwise.isEmpty) {
      return null;
    }

    final breakdown = computePairwiseBreakdown(
      currentUserPhone,
      friend.phone,
      pairwise,
    );
    final totals = breakdown.totals;
    final isReceiveFlow = totals.net >= 0;

    final groups = await GroupService().fetchUserGroups(currentUserPhone);
    final groupNames = {for (final g in groups) g.id: g.name};
    final groupAvatars = {for (final g in groups) g.id: g.avatarUrl};

    final outstanding = <String, double>{};
    final displays = <SettleGroupDisplay>[];

    breakdown.buckets.forEach((id, bucket) {
      final net = bucket.net;
      if (net.abs() < 0.01) {
        return;
      }
      if ((net >= 0) != isReceiveFlow) {
        return;
      }
      outstanding[id] = net;
      final isOutside = id == '__none__';
      displays.add(
        SettleGroupDisplay(
          id: id,
          title: isOutside ? 'Outside groups' : (groupNames[id] ?? 'Group'),
          subtitle: isOutside ? 'Personal expenses' : null,
          amount: net,
          avatarUrl: isOutside ? null : groupAvatars[id],
        ),
      );
    });

    if (displays.isEmpty) {
      return null;
    }

    displays.sort((a, b) => b.amount.abs().compareTo(a.amount.abs()));

    final avatar = (friendAvatarUrl != null && friendAvatarUrl.isNotEmpty)
        ? friendAvatarUrl
        : (friend.avatar.startsWith('http') ? friend.avatar : null);
    final subtitle = friendSubtitle ?? friend.phone;
    final settled = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return FractionallySizedBox(
          heightFactor: 0.94,
          child: SettleUpSheetV2(
            friendName: friendDisplayName ?? friend.name,
            friendId: friend.phone,
            friendAvatarUrl: avatar,
            friendSubtitle: subtitle,
            outstandingByGroup: outstanding,
            groupDisplays: displays,
            isReceiveFlow: isReceiveFlow,
            onMarkReceived: (submission) => _recordFriendSubmission(
              currentUserPhone: currentUserPhone,
              friend: friend,
              submission: submission,
              isReceiveFlow: true,
              groupNames: groupNames,
            ),
            onPay: (submission) => _recordFriendSubmission(
              currentUserPhone: currentUserPhone,
              friend: friend,
              submission: submission,
              isReceiveFlow: false,
              groupNames: groupNames,
            ),
          ),
        );
      },
    );

    return settled == true;
  }

  static Future<bool?> openForGroup({
    required BuildContext context,
    required String currentUserPhone,
    required GroupModel group,
    List<FriendModel>? membersOverride,
    Map<String, String>? memberDisplayNames,
  }) async {
    final members = membersOverride ??
        await _loadGroupMembers(currentUserPhone, group, memberDisplayNames);

    final expenses =
        await ExpenseService().getExpensesByGroup(currentUserPhone, group.id);
    final pairNet = gbm.pairwiseNetForUser(
      expenses,
      currentUserPhone,
      onlyGroupId: group.id,
    );

    final options = pairNet.entries
        .where((entry) => entry.value.abs() >= 0.01)
        .toList()
      ..sort((a, b) => b.value.abs().compareTo(a.value.abs()));

    if (options.isEmpty) {
      return null;
    }

    final choice = options.length == 1
        ? options.first
        : await _promptMemberChoice(
            context: context,
            options: options,
            members: members,
            memberDisplayNames: memberDisplayNames,
          );

    if (choice == null) {
      return false;
    }

    final friendId = choice.key;
    final amount = choice.value;
    final friend = members.firstWhere(
      (f) => f.phone == friendId,
      orElse: () => FriendModel(
        phone: friendId,
        name: memberDisplayNames?[friendId] ?? friendId,
        avatar: '👤',
      ),
    );

    final displayName = memberDisplayNames?[friendId] ??
        (friend.name.isNotEmpty && friend.name != friend.phone
            ? friend.name
            : _maskPhone(friendId));
    final avatar = friend.avatar.startsWith('http') ? friend.avatar : null;
    final subtitle = friend.phone;
    final isReceiveFlow = amount >= 0;

    final outstanding = {group.id: amount};
    final displays = [
      SettleGroupDisplay(
        id: group.id,
        title: group.name,
        subtitle: null,
        amount: amount,
        avatarUrl: group.avatarUrl,
      ),
    ];

    final settled = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return FractionallySizedBox(
          heightFactor: 0.94,
          child: SettleUpSheetV2(
            friendName: displayName,
            friendId: friendId,
            friendAvatarUrl: avatar,
            friendSubtitle: subtitle,
            outstandingByGroup: outstanding,
            groupDisplays: displays,
            isReceiveFlow: isReceiveFlow,
            onMarkReceived: (submission) => _recordGroupSubmission(
              currentUserPhone: currentUserPhone,
              group: group,
              friendId: friendId,
              submission: submission,
              isReceiveFlow: true,
            ),
            onPay: (submission) => _recordGroupSubmission(
              currentUserPhone: currentUserPhone,
              group: group,
              friendId: friendId,
              submission: submission,
              isReceiveFlow: false,
            ),
          ),
        );
      },
    );

    return settled == true;
  }

  static Future<void> _recordFriendSubmission({
    required String currentUserPhone,
    required FriendModel friend,
    required SettleUpResult submission,
    required bool isReceiveFlow,
    required Map<String, String> groupNames,
  }) async {
    final you = currentUserPhone;
    final friendPhone = friend.phone;

    for (final entry in submission.allocations.entries) {
      final rawAmount = entry.value;
      if (rawAmount <= 0) {
        continue;
      }
      final amount = double.parse(rawAmount.toStringAsFixed(2));
      if (amount <= 0) {
        continue;
      }

      final groupId = entry.key == '__none__' ? null : entry.key;
      final payerId = isReceiveFlow ? friendPhone : you;
      final counterparty = isReceiveFlow ? you : friendPhone;
      final note = groupId == null
          ? 'Settlement'
          : 'Settlement (${groupNames[groupId] ?? 'Group'})';

      final expense = ExpenseItem(
        id: '',
        type: 'Settlement',
        label: 'Settlement',
        amount: amount,
        note: note,
        date: DateTime.now(),
        payerId: payerId,
        friendIds: [counterparty],
        customSplits: null,
        groupId: groupId,
        isBill: true,
      );

      await ExpenseService().addExpenseWithSync(you, expense);
    }
  }

  static Future<void> _recordGroupSubmission({
    required String currentUserPhone,
    required GroupModel group,
    required String friendId,
    required SettleUpResult submission,
    required bool isReceiveFlow,
  }) async {
    final amount = double.parse(submission.amount.toStringAsFixed(2));
    if (amount <= 0) {
      return;
    }

    final payer = isReceiveFlow ? friendId : currentUserPhone;
    final counterparty = isReceiveFlow ? currentUserPhone : friendId;

    await ExpenseService().addGroupSettlement(
      payer,
      group.id,
      counterparty,
      amount,
      note: 'Settlement (${group.name})',
    );
  }

  static Future<List<FriendModel>> _loadGroupMembers(
    String currentUserPhone,
    GroupModel group,
    Map<String, String>? memberDisplayNames,
  ) async {
    final service = FriendService();
    final list = <FriendModel>[];
    for (final phone in group.memberPhones) {
      if (phone == currentUserPhone) {
        continue;
      }
      final fetched = await service.getFriendByPhone(currentUserPhone, phone);
      if (fetched != null) {
        list.add(fetched);
        continue;
      }
      final fallbackName = memberDisplayNames?[phone] ?? _maskPhone(phone);
      list.add(FriendModel(phone: phone, name: fallbackName, avatar: '👤'));
    }
    return list;
  }

  static Future<MapEntry<String, double>?> _promptMemberChoice({
    required BuildContext context,
    required List<MapEntry<String, double>> options,
    required List<FriendModel> members,
    Map<String, String>? memberDisplayNames,
  }) async {
    final currency = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
    return showDialog<MapEntry<String, double>>(
      context: context,
      builder: (ctx) {
        return SimpleDialog(
          title: const Text('Choose member to settle with'),
          children: [
            for (final entry in options)
              SimpleDialogOption(
                onPressed: () =>
                    Navigator.pop(ctx, MapEntry(entry.key, entry.value)),
                child: Builder(
                  builder: (_) {
                    final friend = members.firstWhere(
                      (f) => f.phone == entry.key,
                      orElse: () => FriendModel(
                        phone: entry.key,
                        name: memberDisplayNames?[entry.key] ??
                            _maskPhone(entry.key),
                        avatar: '👤',
                      ),
                    );
                    final name = memberDisplayNames?[entry.key] ??
                        (friend.name.isNotEmpty && friend.name != friend.phone
                            ? friend.name
                            : _maskPhone(entry.key));
                    final amount = currency.format(entry.value.abs());
                    final positive = entry.value >= 0;
                    final subtitle =
                        positive ? 'You get back $amount' : 'You owe $amount';
                    return ListTile(
                      leading: friend.avatar.startsWith('http')
                          ? CircleAvatar(
                              backgroundImage: NetworkImage(friend.avatar))
                          : CircleAvatar(child: Text(_initialFor(name))),
                      title: Text(name),
                      subtitle: Text(subtitle),
                    );
                  },
                ),
              ),
          ],
        );
      },
    );
  }

  static String _maskPhone(String phone) {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 4) {
      return phone;
    }
    return 'Member (${digits.substring(digits.length - 4)})';
  }

  static String _initialFor(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) {
      return '?';
    }
    return trimmed.characters.first.toUpperCase();
  }
}
