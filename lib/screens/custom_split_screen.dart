import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';

// Palette
const Color tiffanyBlue = Color(0xFF81e6d9);
const Color mintGreen = Color(0xFFb9f5d8);
const Color deepTeal = Color(0xFF09857a);

class CustomSplitScreen extends StatefulWidget {
  final List<ExpenseItem> selectedExpenses;
  final List<FriendModel> selectedFriends;
  final List<GroupModel> selectedGroups;
  final String userPhone; // <-- Use phone, not userId

  const CustomSplitScreen({
    super.key,
    required this.selectedExpenses,
    required this.selectedFriends,
    required this.selectedGroups,
    required this.userPhone,
  });

  @override
  State<CustomSplitScreen> createState() => _CustomSplitScreenState();
}

class _CustomSplitScreenState extends State<CustomSplitScreen> {
  late double _totalAmount;
  late List<String> _allParticipantPhones;
  late Map<String, TextEditingController> _splitControllers;
  bool _useCustomSplit = false;

  @override
  void initState() {
    super.initState();
    _totalAmount = widget.selectedExpenses.fold(0, (a, b) => a + b.amount);

    // Aggregate all unique participant phones (friends + group members + YOU)
    _allParticipantPhones = {
      widget.userPhone, // Always include YOU first
      ...widget.selectedFriends.map((f) => f.phone),
      ...widget.selectedGroups.expand((g) => g.memberPhones),
    }.toList();

    // Setup controllers for custom split (including YOU)
    final perHead = _allParticipantPhones.isEmpty
        ? 0
        : _totalAmount / _allParticipantPhones.length;
    _splitControllers = {
      for (final phone in _allParticipantPhones)
        phone: TextEditingController(text: perHead.toStringAsFixed(2))
    };
  }

  @override
  void dispose() {
    for (final c in _splitControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() async {
    final Map<String, double> splits = {};
    if (_useCustomSplit) {
      double sum = 0;
      for (final phone in _allParticipantPhones) {
        final double value =
            double.tryParse(_splitControllers[phone]?.text ?? "0") ?? 0;
        splits[phone] = value;
        sum += value;
      }
      if ((_totalAmount - sum).abs() > 0.5) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(
                  "Split amounts must add up to ₹${_totalAmount.toStringAsFixed(2)}")),
        );
        return;
      }
    }

    final expense = ExpenseItem(
      id: '',
      type: 'Expense',
      amount: _totalAmount,
      note: 'Split from ${widget.selectedExpenses.length} transactions',
      date: DateTime.now(),
      payerId: widget.userPhone,
      friendIds: _allParticipantPhones
          .where((phone) => phone != widget.userPhone)
          .toList(),
      groupId: widget.selectedGroups.isNotEmpty
          ? widget.selectedGroups.first.id
          : null,
      customSplits: _useCustomSplit ? splits : null,
    );
    await ExpenseService().addExpense(widget.userPhone, expense);

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content: Text("Expense split & saved!"), backgroundColor: mintGreen),
    );
    Navigator.pop(context, true);
  }

  Widget _nameForPhone(String phone) {
    if (phone == widget.userPhone) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text("🧑", style: TextStyle(fontSize: 26)),
          const SizedBox(width: 5),
          const Text("You", style: TextStyle(fontWeight: FontWeight.bold)),
        ],
      );
    }
    final friend = widget.selectedFriends.firstWhere(
      (f) => f.phone == phone,
      orElse: () {
        for (final g in widget.selectedGroups) {
          for (final memPhone in g.memberPhones) {
            if (memPhone == phone) {
              return FriendModel(phone: phone, name: "Friend", avatar: "👤");
            }
          }
        }
        return FriendModel(phone: phone, name: phone, avatar: "👤");
      },
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(friend.avatar, style: const TextStyle(fontSize: 26)),
        const SizedBox(width: 5),
        Text(friend.name, style: const TextStyle(fontWeight: FontWeight.w500)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final perHead = _allParticipantPhones.isEmpty
        ? 0
        : _totalAmount / _allParticipantPhones.length;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(78),
        child: ClipRRect(
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(17),
            bottomRight: Radius.circular(17),
          ),
          child: Container(
            height: 78,
            decoration: BoxDecoration(
              color: tiffanyBlue.withValues(alpha: 0.94),
              boxShadow: [
                BoxShadow(
                  color: Colors.black12.withValues(alpha: 0.11),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: SafeArea(
              child: Center(
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.groups_2_rounded,
                          color: deepTeal, size: 32),
                      const SizedBox(width: 12),
                      const Text(
                        "Custom Split",
                        style: TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 23,
                          fontWeight: FontWeight.bold,
                          color: deepTeal,
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
          const _AnimatedMintBackground(),
          ListView(
            padding:
                const EdgeInsets.only(top: 98, left: 18, right: 18, bottom: 12),
            children: [
              const Text("Selected Transactions",
                  style: TextStyle(fontWeight: FontWeight.bold)),
              ...widget.selectedExpenses.map((e) => _GlassSplitCard(
                    child: ListTile(
                      leading: const Icon(Icons.receipt, color: deepTeal),
                      title: Text("₹${e.amount.toStringAsFixed(2)}",
                          style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Text(e.note),
                      trailing: Text(
                        "${e.date.day}/${e.date.month}/${e.date.year}",
                        style: const TextStyle(color: Colors.grey),
                      ),
                    ),
                  )),
              const SizedBox(height: 20),
              Text(
                "Total Amount: ₹${_totalAmount.toStringAsFixed(2)}",
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.bold, color: deepTeal),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Checkbox(
                    value: _useCustomSplit,
                    onChanged: (v) =>
                        setState(() => _useCustomSplit = v ?? false),
                    activeColor: deepTeal,
                  ),
                  const Text("Custom Split",
                      style: TextStyle(fontWeight: FontWeight.w500)),
                  const Spacer(),
                  if (!_useCustomSplit)
                    const Text("Split equally",
                        style: TextStyle(color: Colors.grey)),
                ],
              ),
              const SizedBox(height: 8),
              ..._allParticipantPhones.map((phone) {
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: _nameForPhone(phone),
                  title: const SizedBox.shrink(),
                  trailing: SizedBox(
                    width: 90,
                    child: _useCustomSplit
                        ? TextField(
                            controller: _splitControllers[phone],
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true),
                            decoration: const InputDecoration(
                              suffixText: "₹",
                              isDense: true,
                            ),
                          )
                        : Text(
                            "₹${perHead.toStringAsFixed(2)}",
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w500),
                          ),
                  ),
                );
              }),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: _submit,
                icon: const Icon(Icons.done),
                label: const Text("Save Split"),
                style: ElevatedButton.styleFrom(
                  backgroundColor: deepTeal,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  textStyle: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// Glass Card for each split line
class _GlassSplitCard extends StatelessWidget {
  final Widget child;
  const _GlassSplitCard({required this.child});
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        color: Colors.white.withValues(alpha: 0.16),
        border:
            Border.all(color: tiffanyBlue.withValues(alpha: 0.16), width: 1),
        boxShadow: [
          BoxShadow(
            color: mintGreen.withValues(alpha: 0.08),
            blurRadius: 6,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(13),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
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
              Colors.white.withValues(alpha: 0.91),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            stops: [0, value, 1],
          ),
        ),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 11, sigmaY: 11),
          child: Container(color: Colors.transparent),
        ),
      ),
    );
  }
}
