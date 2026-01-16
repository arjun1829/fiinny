import 'package:flutter/material.dart';

import 'package:lifemap/core/flags/fx_flags.dart';
import 'package:lifemap/models/friend_model.dart';
import 'package:lifemap/models/group_model.dart';
import 'package:lifemap/settlements/debt_simplifier.dart';
import 'package:lifemap/settlements/transfer_models.dart';
import 'package:lifemap/services/contact_name_service.dart';
import 'package:lifemap/widgets/settleup_dialog.dart';

class SettleSmartSheet extends StatelessWidget {
  const SettleSmartSheet({
    super.key,
    required this.userPhone,
    required this.netBalances,
    required this.participants,
    required this.settleEligiblePhones,
    required this.onLaunchSettle,
    this.friends = const <FriendModel>[],
    this.groups = const <GroupModel>[],
  });

  final String userPhone;
  final Map<String, double> netBalances;
  final Map<String, SettleSmartParticipant> participants;
  final Set<String> settleEligiblePhones;
  final Future<void> Function(String counterparty)? onLaunchSettle;
  final List<FriendModel> friends;
  final List<GroupModel> groups;

  bool get _featureEnabled => FxFlags.settleSmart;

  @override
  Widget build(BuildContext context) {
    final transfers = _featureEnabled
        ? const DebtSimplifier().simplify(netBalances)
        : const <Transfer>[];

    return DraggableScrollableSheet(
      expand: false,
      maxChildSize: 0.95,
      initialChildSize: 0.85,
      minChildSize: 0.6,
      builder: (context, controller) {
        return Container(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.94),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            border: Border.all(
                color: const Color(0xFFE4F1EE).withValues(alpha: 0.9)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x1A000000),
                offset: Offset(0, -8),
                blurRadius: 24,
              ),
            ],
          ),
          child: Column(
            children: [
              const SizedBox(height: 12),
              Container(
                width: 52,
                height: 5,
                decoration: BoxDecoration(
                  color: const Color(0xFF09857a).withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(height: 18),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    const Icon(Icons.auto_graph_rounded,
                        color: Color(0xFF09857a)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Settle smart suggestions',
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => Navigator.of(context).maybePop(),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              if (transfers.isEmpty)
                Expanded(
                  child: _EmptySettleSmartState(
                    isFeatureDisabled: !_featureEnabled,
                    participants: participants,
                    netBalances: netBalances,
                  ),
                )
              else
                Expanded(
                  child: ListView.separated(
                    controller: controller,
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                    itemBuilder: (context, index) {
                      final transfer = transfers[index];
                      final payer = participants[transfer.from];
                      final receiver = participants[transfer.to];

                      return _SettleSmartRow(
                        transfer: transfer,
                        payer: payer,
                        receiver: receiver,
                        isUserPayer: transfer.from == userPhone,
                        isUserReceiver: transfer.to == userPhone,
                        onLaunchSettle: onLaunchSettle,
                        settleEligiblePhones: settleEligiblePhones,
                        userPhone: userPhone,
                        friends: friends,
                        groups: groups,
                      );
                    },
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemCount: transfers.length,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _SettleSmartRow extends StatelessWidget {
  const _SettleSmartRow({
    required this.transfer,
    required this.payer,
    required this.receiver,
    required this.isUserPayer,
    required this.isUserReceiver,
    required this.onLaunchSettle,
    required this.settleEligiblePhones,
    required this.userPhone,
    required this.friends,
    required this.groups,
  });

  final Transfer transfer;
  final SettleSmartParticipant? payer;
  final SettleSmartParticipant? receiver;
  final bool isUserPayer;
  final bool isUserReceiver;
  final Future<void> Function(String counterparty)? onLaunchSettle;
  final Set<String> settleEligiblePhones;
  final String userPhone;
  final List<FriendModel> friends;
  final List<GroupModel> groups;

  @override
  Widget build(BuildContext context) {
    final displayPayer =
        payer ?? SettleSmartParticipant.anonymous(transfer.from);
    final displayReceiver =
        receiver ?? SettleSmartParticipant.anonymous(transfer.to);

    final primaryText = isUserPayer
        ? 'Pay ₹${transfer.amount.toStringAsFixed(0)} to ${displayReceiver.displayName}'
        : isUserReceiver
            ? '${displayPayer.displayName} should pay you ₹${transfer.amount.toStringAsFixed(0)}'
            : '${displayPayer.displayName} → ${displayReceiver.displayName}';

    final subtitle = !isUserPayer && !isUserReceiver
        ? 'Share this with your friends to minimise hops.'
        : 'Tap to record via Settle Up once done.';

    final counterparty = isUserPayer ? transfer.to : transfer.from;
    final useCallback =
        onLaunchSettle != null && settleEligiblePhones.contains(counterparty);
    final canLaunch = isUserPayer || isUserReceiver;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xF2FFFFFF), Color(0xE0F3FBF7)],
        ),
        border: Border.all(color: const Color(0xFFE2F0EC)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            offset: Offset(0, 12),
            blurRadius: 24,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _AvatarBubble(participant: displayPayer),
              const SizedBox(width: 10),
              const Icon(Icons.arrow_forward_rounded, color: Color(0xFF09857a)),
              const SizedBox(width: 10),
              _AvatarBubble(participant: displayReceiver),
              const Spacer(),
              Text(
                '₹${transfer.amount.toStringAsFixed(0)}',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: const Color(0xFF065F57),
                    ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            primaryText,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: Colors.teal[700]?.withValues(alpha: 0.75)),
          ),
          if (canLaunch) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF09857a),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: () async {
                  final navigator = Navigator.of(context);
                  final hostContext = navigator.context;
                  navigator.pop();
                  await Future<void>.delayed(Duration.zero);
                  if (useCallback) {
                    await onLaunchSettle!(counterparty);
                    return;
                  }
                  final targetParticipant =
                      isUserPayer ? displayReceiver : displayPayer;
                  if (hostContext.mounted) {
                    await _openLegacySettle(hostContext, targetParticipant);
                  }
                },
                child: Text(
                  isUserPayer ? 'Record this payment' : 'Mark as received',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _openLegacySettle(
    BuildContext context,
    SettleSmartParticipant target,
  ) async {
    final friendList = List<FriendModel>.from(friends);
    FriendModel? initialFriend;

    final existingIndex =
        friendList.indexWhere((friend) => friend.phone == target.id);
    if (existingIndex >= 0) {
      initialFriend = friendList[existingIndex];
    } else {
      final avatar = target.avatarUrl;
      initialFriend = FriendModel(
        phone: target.id,
        name: target.displayName,
        avatar: avatar != null && avatar.isNotEmpty
            ? avatar
            : (target.fallbackEmoji ?? '👤'),
      );
      friendList.add(initialFriend);
    }

    await showDialog(
      context: context,
      builder: (_) => SettleUpDialog(
        userPhone: userPhone,
        friends: friendList,
        groups: groups,
        initialFriend: initialFriend,
      ),
    );
  }
}

class _AvatarBubble extends StatelessWidget {
  const _AvatarBubble({required this.participant});

  final SettleSmartParticipant participant;

  @override
  Widget build(BuildContext context) {
    if (participant.avatarUrl != null && participant.avatarUrl!.isNotEmpty) {
      return CircleAvatar(
        radius: 22,
        backgroundImage: participant.avatarUrl!.startsWith('http')
            ? NetworkImage(participant.avatarUrl!)
            : AssetImage(participant.avatarUrl!) as ImageProvider,
      );
    }
    return CircleAvatar(
      radius: 22,
      backgroundColor: const Color(0xFF09857a).withValues(alpha: 0.12),
      child: Text(
        participant.initials,
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          color: Color(0xFF09857a),
        ),
      ),
    );
  }
}

class SettleSmartParticipant {
  const SettleSmartParticipant({
    required this.id,
    required this.displayName,
    this.avatarUrl,
    this.fallbackEmoji,
  });

  final String id;
  final String displayName;
  final String? avatarUrl;
  final String? fallbackEmoji;

  String get initials {
    if (fallbackEmoji != null && fallbackEmoji!.isNotEmpty) {
      return fallbackEmoji!;
    }
    final parts = displayName
        .trim()
        .split(RegExp(r"\s+"))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty)
      return id.isNotEmpty ? id.characters.take(2).toString() : '?';
    if (parts.length == 1) {
      final word = parts.first;
      return word.characters.take(2).toString().toUpperCase();
    }
    return (parts.first.characters.take(1).toString() +
            parts.last.characters.take(1).toString())
        .toUpperCase();
  }

  factory SettleSmartParticipant.anonymous(String id) {
    return SettleSmartParticipant(
      id: id,
      displayName: id,
      fallbackEmoji: '👤',
    );
  }
}

class _EmptySettleSmartState extends StatelessWidget {
  const _EmptySettleSmartState({
    required this.isFeatureDisabled,
    required this.participants,
    required this.netBalances,
  });

  final bool isFeatureDisabled;
  final Map<String, SettleSmartParticipant> participants;
  final Map<String, double> netBalances;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final outstanding = netBalances.entries
        .where((e) => e.value.abs() >= 0.01)
        .map((e) =>
            '${participants[e.key]?.displayName ?? e.key}: ₹${e.value.toStringAsFixed(0)}')
        .join('\n');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 42,
              backgroundColor: const Color(0xFF09857a).withValues(alpha: 0.1),
              child: const Icon(Icons.celebration_rounded,
                  size: 38, color: Color(0xFF09857a)),
            ),
            const SizedBox(height: 18),
            Text(
              isFeatureDisabled
                  ? 'Settle smart is switched off'
                  : 'All caught up!',
              style:
                  textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              isFeatureDisabled
                  ? 'Enable the flag in FxFlags to preview suggestions.'
                  : 'No cash flow optimisations needed right now.',
              style: textTheme.bodyMedium?.copyWith(color: Colors.grey[700]),
              textAlign: TextAlign.center,
            ),
            if (!isFeatureDisabled && outstanding.isNotEmpty) ...[
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF09857a).withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE0ECE9)),
                ),
                child: Text(
                  outstanding,
                  style: textTheme.bodySmall?.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

SettleSmartParticipant buildParticipantFor(
  String id,
  ContactNameService contacts, {
  String? remoteName,
  String? fallback,
  String? avatar,
  String? emoji,
}) {
  if (id.isEmpty) {
    return const SettleSmartParticipant(
      id: 'unknown',
      displayName: 'Unknown',
      fallbackEmoji: '❓',
    );
  }

  final display = contacts.bestDisplayName(
    phone: id,
    remoteName: remoteName,
    fallback: fallback ?? id,
  );

  return SettleSmartParticipant(
    id: id,
    displayName: display,
    avatarUrl: avatar,
    fallbackEmoji: emoji,
  );
}
