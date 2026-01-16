import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../services/expense_service.dart';

// --- Palette ---
const Color tiffanyBlue = Color(0xFF81e6d9);
const Color mintGreen = Color(0xFFb9f5d8);
const Color deepTeal = Color(0xFF09857a);

class FriendExpenseHistoryScreen extends StatefulWidget {
  final String userId;
  final FriendModel friend;

  const FriendExpenseHistoryScreen({
    Key? key,
    required this.userId,
    required this.friend,
  }) : super(key: key);

  @override
  State<FriendExpenseHistoryScreen> createState() => _FriendExpenseHistoryScreenState();
}

class _FriendExpenseHistoryScreenState extends State<FriendExpenseHistoryScreen> {
  late Stream<List<ExpenseItem>> _expensesStream;

  @override
  void initState() {
    super.initState();
    _expensesStream = ExpenseService()
        .getExpensesStream(widget.userId)
        .map((list) => list.where((e) => e.friendIds.contains(widget.friend.phone)).toList());
  }

  Future<void> _settleExpense(ExpenseItem expense) async {
    final newSettled = List<String>.from(expense.settledFriendIds);
    if (!newSettled.contains(widget.friend.phone)) {
      newSettled.add(widget.friend.phone);
    }
    final updated = expense.copyWith(settledFriendIds: newSettled);
    await ExpenseService().updateExpense(widget.userId, updated);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Marked as settled!'),
        backgroundColor: mintGreen,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(74),
        child: ClipRRect(
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(18), bottomRight: Radius.circular(18),
          ),
          child: Container(
            height: 74,
            decoration: BoxDecoration(
              color: tiffanyBlue.withValues(alpha: 0.92),
              boxShadow: [
                BoxShadow(
                  color: Colors.black12.withValues(alpha: 0.10),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  child: Row(
                    children: [
                      Text(
                        "${widget.friend.avatar} ${widget.friend.name}",
                        style: TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: deepTeal,
                          letterSpacing: 0.1,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        "History",
                        style: TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 17,
                          color: Colors.teal[900],
                          fontWeight: FontWeight.w500,
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
          StreamBuilder<List<ExpenseItem>>(
            stream: _expensesStream,
            builder: (context, snapshot) {
              if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
              final expenses = snapshot.data!;
              if (expenses.isEmpty) {
                return Center(
                  child: Text(
                    'No shared expenses with this friend.',
                    style: TextStyle(color: deepTeal, fontSize: 18, fontWeight: FontWeight.w500),
                  ),
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.only(top: 82, bottom: 16),
                itemCount: expenses.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final expense = expenses[i];
                  final splitCount = (expense.friendIds.length + 1);
                  final share = expense.amount / splitCount;
                  final isSettled = expense.settledFriendIds.contains(widget.friend.phone);

                  return _GlassExpenseCard(
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: tiffanyBlue.withValues(alpha: 0.75),
                        child: Text(
                          expense.type.isNotEmpty ? expense.type[0] : 'E',
                          style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                      ),
                      title: Text(
                        '${expense.type} • ₹${share.toStringAsFixed(2)}',
                        style: TextStyle(fontWeight: FontWeight.bold, color: deepTeal),
                      ),
                      subtitle: Text(
                        'On ${expense.date.day}/${expense.date.month}/${expense.date.year}\n'
                            '${expense.note.isNotEmpty ? expense.note : ""}',
                        style: const TextStyle(fontSize: 13),
                      ),
                      isThreeLine: true,
                      trailing: isSettled
                          ? Chip(
                        label: const Text('Settled', style: TextStyle(fontWeight: FontWeight.w500)),
                        backgroundColor: mintGreen.withValues(alpha: 0.63),
                      )
                          : ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: deepTeal,
                          foregroundColor: Colors.white,
                        ),
                        onPressed: () => _settleExpense(expense),
                        child: const Text('Settle Up'),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ],
      ),
    );
  }
}

// ------ Glass Card -------
class _GlassExpenseCard extends StatelessWidget {
  final Widget child;
  const _GlassExpenseCard({required this.child});
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 17),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(15),
        color: Colors.white.withValues(alpha: 0.16),
        border: Border.all(color: tiffanyBlue.withValues(alpha: 0.18), width: 1),
        boxShadow: [
          BoxShadow(
            color: mintGreen.withValues(alpha: 0.10),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(15),
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
              Colors.white.withValues(alpha: 0.89),
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
