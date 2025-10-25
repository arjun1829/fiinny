import 'dart:ui';
import 'package:flutter/material.dart';
import '../core/ads/ads_shell.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../screens/custom_split_screen.dart';

// Mint/Tiffany palette
const Color tiffanyBlue = Color(0xFF81e6d9);
const Color mintGreen = Color(0xFFb9f5d8);
const Color deepTeal = Color(0xFF09857a);

class SplitFromTransactionScreen extends StatefulWidget {
  final List<ExpenseItem> expenses;
  final List<FriendModel> friends;
  final List<GroupModel> groups;
  final String userId;

  const SplitFromTransactionScreen({
    Key? key,
    required this.expenses,
    required this.friends,
    required this.groups,
    required this.userId,
  }) : super(key: key);

  @override
  State<SplitFromTransactionScreen> createState() => _SplitFromTransactionScreenState();
}

class _SplitFromTransactionScreenState extends State<SplitFromTransactionScreen> {
  Set<String> _selectedExpenseIds = {};
  Set<String> _selectedFriendIds = {};
  Set<String> _selectedGroupIds = {};

  @override
  Widget build(BuildContext context) {
    // Sort by date desc
    final expenses = List<ExpenseItem>.from(widget.expenses)
      ..sort((a, b) => b.date.compareTo(a.date));
    final bottomInset = context.adsBottomPadding(extra: 16);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(85),
        child: ClipRRect(
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(20), bottomRight: Radius.circular(20),
          ),
          child: Container(
            height: 85,
            decoration: BoxDecoration(
              color: tiffanyBlue.withOpacity(0.96),
              boxShadow: [
                BoxShadow(
                  color: Colors.black12.withOpacity(0.14),
                  blurRadius: 13,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
                  child: Row(
                    children: [
                      Text(
                        "Split from Transactions",
                        style: TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 23,
                          fontWeight: FontWeight.w700,
                          color: deepTeal,
                          letterSpacing: 0.4,
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
          Column(
            children: [
              const SizedBox(height: 95),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Text(
                  "Select Transactions to Split",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: deepTeal,
                  ),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: expenses.length,
                  padding: const EdgeInsets.only(top: 9, left: 8, right: 8),
                  itemBuilder: (_, idx) {
                    final e = expenses[idx];
                    return _GlassCheckCard(
                      checked: _selectedExpenseIds.contains(e.id),
                      child: CheckboxListTile(
                        value: _selectedExpenseIds.contains(e.id),
                        onChanged: (v) {
                          setState(() {
                            if (v == true) {
                              _selectedExpenseIds.add(e.id);
                            } else {
                              _selectedExpenseIds.remove(e.id);
                            }
                          });
                        },
                        activeColor: deepTeal,
                        title: Text(
                          e.note.isNotEmpty ? e.note : "Expense",
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: deepTeal,
                          ),
                        ),
                        subtitle: Text(
                          "₹${e.amount.toStringAsFixed(0)}  ·  ${e.date.day}/${e.date.month}/${e.date.year}",
                          style: TextStyle(
                            color: Colors.teal[900],
                          ),
                        ),
                        controlAffinity: ListTileControlAffinity.leading,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                      ),
                    );
                  },
                ),
              ),
              Divider(height: 2, color: mintGreen, thickness: 1),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(
                  "Select Friends or Groups to Split With",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: deepTeal,
                  ),
                ),
              ),
              // Friends chips
              SizedBox(
                height: 46,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  children: widget.friends.map((f) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: FilterChip(
                        label: Text("${f.avatar} ${f.name}", style: TextStyle(color: deepTeal)),
                        selected: _selectedFriendIds.contains(f.phone),
                        selectedColor: tiffanyBlue.withOpacity(0.22),
                        backgroundColor: Colors.white.withOpacity(0.17),
                        onSelected: (sel) {
                          setState(() {
                            if (sel) _selectedFriendIds.add(f.phone);
                            else _selectedFriendIds.remove(f.phone);
                          });
                        },
                      ),
                    );
                  }).toList(),
                ),
              ),
              // Groups chips
              SizedBox(
                height: 46,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  children: widget.groups.map((g) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: FilterChip(
                        label: Text("👥 ${g.name}", style: TextStyle(color: deepTeal)),
                        selected: _selectedGroupIds.contains(g.id),
                        selectedColor: mintGreen.withOpacity(0.22),
                        backgroundColor: Colors.white.withOpacity(0.15),
                        onSelected: (sel) {
                          setState(() {
                            if (sel) _selectedGroupIds.add(g.id);
                            else _selectedGroupIds.remove(g.id);
                          });
                        },
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.arrow_forward, color: Colors.white),
                  label: const Text("Proceed to Split", style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: deepTeal,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    textStyle: const TextStyle(fontSize: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 8,
                  ),
                  onPressed: (_selectedExpenseIds.isNotEmpty &&
                      (_selectedFriendIds.isNotEmpty || _selectedGroupIds.isNotEmpty))
                      ? () {
                    final selectedExpenses = widget.expenses
                        .where((e) => _selectedExpenseIds.contains(e.id))
                        .toList();
                    final selectedFriends = widget.friends
                        .where((f) => _selectedFriendIds.contains(f.phone))
                        .toList();
                    final selectedGroups = widget.groups
                        .where((g) => _selectedGroupIds.contains(g.id))
                        .toList();

                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => CustomSplitScreen(
                          selectedExpenses: selectedExpenses,
                          selectedFriends: selectedFriends,
                          selectedGroups: selectedGroups,
                          userPhone: widget.userId,
                        ),
                      ),
                    );
                  }
                      : null,
                ),
              ),
              SizedBox(height: bottomInset),
            ],
          ),
        ],
      ),
    );
  }
}

// Animated Minty BG
class _AnimatedMintBackground extends StatelessWidget {
  const _AnimatedMintBackground({super.key});
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
              Colors.white.withOpacity(0.85),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            stops: [0, value, 1],
          ),
        ),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(color: Colors.transparent),
        ),
      ),
    );
  }
}

// Glass Card for selected/checked
class _GlassCheckCard extends StatelessWidget {
  final bool checked;
  final Widget child;
  const _GlassCheckCard({required this.child, required this.checked, super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(15),
        color: checked ? tiffanyBlue.withOpacity(0.21) : Colors.white.withOpacity(0.13),
        border: Border.all(
          color: checked ? deepTeal.withOpacity(0.19) : Colors.transparent,
          width: 1.1,
        ),
        boxShadow: [
          BoxShadow(
            color: mintGreen.withOpacity(0.13),
            blurRadius: 10,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(15),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 7, sigmaY: 7),
          child: child,
        ),
      ),
    );
  }
}
