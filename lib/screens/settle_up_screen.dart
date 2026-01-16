import 'dart:ui';
import 'package:flutter/material.dart';
import '../core/ads/ads_shell.dart';
import '../models/group_model.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../services/expense_service.dart';
import '../services/friend_service.dart';
import '../core/ads/ads_banner_card.dart';

const Color tiffanyBlue = Color(0xFF81e6d9);
const Color mintGreen = Color(0xFFb9f5d8);
const Color deepTeal = Color(0xFF09857a);

class SettleUpScreen extends StatefulWidget {
  final String userId;
  final GroupModel group;
  const SettleUpScreen({required this.userId, required this.group, super.key});

  @override
  State<SettleUpScreen> createState() => _SettleUpScreenState();
}

class _SettleUpScreenState extends State<SettleUpScreen> {
  List<ExpenseItem> _expenses = [];
  Map<String, double> _balances = {};
  Map<String, FriendModel> _friends = {};
  bool _loading = true;
  bool _bulkSettling = false;

  @override
  void initState() {
    super.initState();
    _initData();
  }

  Future<void> _initData() async {
    setState(() => _loading = true);
    // Fetch group-level expenses (correct for all members)
    _expenses = await ExpenseService().getExpensesForGroup(widget.group.id);
    final List<FriendModel> friends = await FriendService()
        .getFriendsByIds(widget.userId, widget.group.memberPhones);
    _friends = {for (var f in friends) f.phone: f};
    // Add yourself as "You"
    _friends[widget.userId] = FriendModel(
      phone: widget.userId,
      name: "You",
      avatar: "👤",
    );
    _balances = _calculateBalances(_expenses, widget.group.memberPhones);
    setState(() => _loading = false);
  }

  // Calculate net group balances
  Map<String, double> _calculateBalances(
      List<ExpenseItem> expenses, List<String> memberIds) {
    final Map<String, double> balances = {for (var id in memberIds) id: 0.0};
    for (final exp in expenses) {
      if (exp.type == "Settlement") {
        // Settlements: payer pays, friends receive
        if (balances.containsKey(exp.payerId)) {
          balances[exp.payerId] = (balances[exp.payerId] ?? 0) + exp.amount;
        }
        for (final fid in exp.friendIds) {
          if (balances.containsKey(fid)) {
            balances[fid] = (balances[fid] ?? 0) - exp.amount;
          }
        }
      } else {
        // Expenses: custom splits or equal split
        if (exp.customSplits != null && exp.customSplits!.isNotEmpty) {
          final splits = exp.customSplits!;
          for (final entry in splits.entries) {
            if (balances.containsKey(entry.key)) {
              if (entry.key == exp.payerId) {
                balances[entry.key] =
                    (balances[entry.key] ?? 0) + exp.amount - entry.value;
              } else {
                balances[entry.key] = (balances[entry.key] ?? 0) - entry.value;
              }
            }
          }
        } else {
          final splitWith = List<String>.from(exp.friendIds)..add(exp.payerId);
          final splitAmt = exp.amount / splitWith.length;
          for (final m in splitWith) {
            if (m == exp.payerId) {
              balances[m] = (balances[m] ?? 0) + exp.amount - splitAmt;
            } else {
              balances[m] = (balances[m] ?? 0) - splitAmt;
            }
          }
        }
      }
    }
    return balances;
  }

  // Show dialog and actually settle up
  Future<void> _showSettleUpDialog(
      String friendId, double amount, bool youOwe) async {
    final friend = _friends[friendId];
    final controller =
        TextEditingController(text: amount.abs().toStringAsFixed(0));
    final double maxAmount = amount.abs();

    final settled = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(youOwe
            ? "Pay ${friend?.name ?? 'Friend'}"
            : "Receive from ${friend?.name ?? 'Friend'}"),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText:
                "Amount to settle (max ₹${maxAmount.toStringAsFixed(0)})",
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () {
              final double? value = double.tryParse(controller.text.trim());
              if (value == null || value <= 0 || value > maxAmount) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  SnackBar(
                      content: Text(
                          "Enter a valid amount up to ₹${maxAmount.toStringAsFixed(0)}")),
                );
                return;
              }
              Navigator.pop(ctx, true);
            },
            child: Text(youOwe ? "Pay" : "Record"),
          ),
        ],
      ),
    );

    if (settled == true) {
      final double settleAmount = double.parse(controller.text.trim());
      // If you owe: you are paying to friend; If they owe: friend is paying you (so flip payer/friend)
      final userId = youOwe ? widget.userId : friendId;
      final friendToSettle = youOwe ? friendId : widget.userId;

      await ExpenseService().addGroupSettlement(
        userId,
        widget.group.id,
        friendToSettle,
        settleAmount,
        note: "Settlement (${widget.group.name})",
      );
      await _initData();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Settlement recorded!"),
          backgroundColor: mintGreen,
        ),
      );
    }
  }

  Future<void> _settleAllOutstanding() async {
    final entries = _balances.entries
        .where(
            (entry) => entry.key != widget.userId && entry.value.abs() > 0.009)
        .toList();

    if (entries.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Everyone is already settled!')),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Settle with all friends?'),
        content: Text(
            'This will record ${entries.length} settlement${entries.length == 1 ? '' : 's'} '
            'so everyone’s balances drop to zero.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Settle all')),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _bulkSettling = true);

    try {
      for (final entry in entries) {
        final friendId = entry.key;
        final amount = entry.value.abs();
        if (amount <= 0) continue;
        final youOwe = entry.value < 0;
        final payer = youOwe ? widget.userId : friendId;
        final counterparty = youOwe ? friendId : widget.userId;

        await ExpenseService().addGroupSettlement(
          payer,
          widget.group.id,
          counterparty,
          amount,
          note: 'Settlement (${widget.group.name})',
        );
      }

      await _initData();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'Recorded settlements for ${entries.length} friend${entries.length == 1 ? '' : 's'}'),
          backgroundColor: mintGreen,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to settle all: $e')),
      );
    } finally {
      if (mounted) setState(() => _bulkSettling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = context.adsBottomPadding(extra: 22);
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(82),
        child: ClipRRect(
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(21),
            bottomRight: Radius.circular(21),
          ),
          child: Container(
            height: 82,
            decoration: BoxDecoration(
              color: tiffanyBlue.withValues(alpha: 0.93),
              boxShadow: [
                BoxShadow(
                  color: Colors.black12.withValues(alpha: 0.14),
                  blurRadius: 13,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: SafeArea(
              child: Center(
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                  child: Row(
                    children: [
                      Text(
                        "Settle Up (${widget.group.name})",
                        style: TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 23,
                          fontWeight: FontWeight.w700,
                          color: deepTeal,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          _AnimatedMintBackground(),
          _loading
              ? const Center(child: CircularProgressIndicator())
              : _balances.isEmpty
                  ? Center(
                      child: Text(
                        "No balances to settle!",
                        style: TextStyle(
                            fontSize: 19,
                            color: deepTeal,
                            fontWeight: FontWeight.w500),
                      ),
                    )
                  : ListView(
                      padding: EdgeInsets.only(top: 90, bottom: bottomPadding),
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 20, vertical: 6),
                          child: ElevatedButton.icon(
                            onPressed:
                                _bulkSettling ? null : _settleAllOutstanding,
                            icon: _bulkSettling
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2))
                                : const Icon(Icons.task_alt_rounded),
                            label: Text(_bulkSettling
                                ? 'Settling…'
                                : 'Settle all friends'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: deepTeal,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 20, vertical: 6),
                          child: AdsBannerCard(
                            placement: 'settle_up_inline_banner',
                            inline: true,
                            inlineMaxHeight: 100,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 12),
                            minHeight: 76,
                          ),
                        ),
                        ..._balances.entries.map((entry) {
                          final id = entry.key;
                          if (id == widget.userId) {
                            return const SizedBox.shrink();
                          }
                          final bal = entry.value;
                          final friend = _friends[id];

                          if (bal.abs() < 0.01) return const SizedBox.shrink();

                          final youOwe = bal < 0;
                          final buttonLabel = youOwe ? "Pay" : "Record";
                          final subtitleText = youOwe
                              ? "You owe ₹${bal.abs().toStringAsFixed(0)}"
                              : "They owe you ₹${bal.toStringAsFixed(0)}";

                          return _GlassSettleCard(
                            child: ListTile(
                              leading: Text(friend?.avatar ?? "👤",
                                  style: const TextStyle(fontSize: 34)),
                              title: Text(friend?.name ?? "Friend",
                                  style: TextStyle(
                                      color: deepTeal,
                                      fontWeight: FontWeight.bold)),
                              subtitle: Text(
                                subtitleText,
                                style: TextStyle(
                                  color: youOwe
                                      ? Colors.red[400]
                                      : Colors.green[700],
                                ),
                              ),
                              trailing: ElevatedButton(
                                child: Text(buttonLabel),
                                onPressed: () =>
                                    _showSettleUpDialog(id, bal, youOwe),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: deepTeal,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(9)),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ],
                    ),
        ],
      ),
    );
  }
}

// --------- Glass Card for Settle Up ---------
class _GlassSettleCard extends StatelessWidget {
  final Widget child;
  const _GlassSettleCard({required this.child});
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 11, horizontal: 20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: Colors.white.withValues(alpha: 0.15),
        border:
            Border.all(color: tiffanyBlue.withValues(alpha: 0.16), width: 1.1),
        boxShadow: [
          BoxShadow(
            color: mintGreen.withValues(alpha: 0.12),
            blurRadius: 11,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
          child: child,
        ),
      ),
    );
  }
}

// --------- Animated Mint BG ---------
class _AnimatedMintBackground extends StatelessWidget {
  const _AnimatedMintBackground();
  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: 1.0),
      duration: const Duration(seconds: 2),
      builder: (context, value, child) => Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              tiffanyBlue,
              mintGreen,
              Colors.white.withValues(alpha: 0.88),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            stops: [0, value, 1],
          ),
        ),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: Container(color: Colors.transparent),
        ),
      ),
    );
  }
}
