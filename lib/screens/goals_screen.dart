// lib/screens/goals_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';

import '../core/ads/ads_shell.dart';
import '../models/goal_model.dart';
import '../services/goal_service.dart';
import '../widgets/add_goal_dialog.dart';
import '../widgets/goal_card.dart'; // Import the new card


class GoalsScreen extends StatefulWidget {
  final String userId;
  const GoalsScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<GoalsScreen> createState() => _GoalsScreenState();
}

class _GoalsScreenState extends State<GoalsScreen> {
  // Quotes (auto-rotate)
  static const _quotes = <String>[
    "Small steps. Big wins.",
    "Pay yourself first — even ₹50 counts.",
    "Today’s consistency beats tomorrow’s plan.",
    "Your money should have a mission.",
    "Save like you mean it. Spend like you planned it.",
  ];
  int _quoteIndex = 0;
  Timer? _quoteTimer;

  @override
  void initState() {
    super.initState();
    _quoteTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted) return;
      setState(() => _quoteIndex = (_quoteIndex + 1) % _quotes.length);
    });
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    super.dispose();
  }

  Future<void> _showAddGoalDialog() async {
    await showDialog(
      context: context,
      builder: (ctx) => AddGoalDialog(
        onAdd: (GoalModel goal) async {
          await GoalService().addGoal(widget.userId, goal);
        },
      ),
    );
  }

  Future<void> _addProgressSheet(GoalModel g) async {
    final ctrl = TextEditingController();
    final result = await showModalBottomSheet<double>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
            left: 24,
            right: 24,
            top: 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
               Text('Add savings to "${g.title}"',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
              const SizedBox(height: 16),
              TextField(
                controller: ctrl,
                keyboardType: TextInputType.number,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: "Amount",
                  prefixText: "₹ ",
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.grey[50],
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    final v = double.tryParse(ctrl.text.trim());
                    if (v != null && v > 0) Navigator.pop(ctx, v);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.teal,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text("Add Savings", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        );
      },
    );

    if (result != null) {
      try {
        await GoalService()
            .incrementSavedAmount(widget.userId, g.id, result, clampToTarget: true);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Added ₹${result.toStringAsFixed(0)} to '${g.title}'")),
          );
        }
      } catch (e) {
        debugPrint("Error: $e");
      }
    }
  }

  Future<void> _confirmAndDelete(GoalModel g) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Delete goal?"),
        content: Text("This will permanently remove '${g.title}'."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel")),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text("Delete"),
          ),
        ],
      ),
    );
    if (ok == true) {
      await GoalService().deleteGoal(widget.userId, g.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50], // Match website bg-slate-50ish
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddGoalDialog,
        backgroundColor: Colors.black, // Dark/Black theme for button
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text("New Goal", style: TextStyle(color: Colors.white)),
      ),
      body: StreamBuilder<List<GoalModel>>(
        stream: GoalService().goalsStream(widget.userId),
        builder: (context, snap) {
          if (!snap.hasData) { // Loading state
             return const Center(child: CircularProgressIndicator());
          }
          
          final goals = snap.data ?? [];
          final bottomInset = context.adsBottomPadding(extra: 80); // + FAB space

          return CustomScrollView(
            slivers: [
              // Header
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 60, 24, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "Financial Goals",
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF0F172A), // Slate 900
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        "Track your savings and targets",
                        style: TextStyle(
                          fontSize: 16,
                          color: Colors.grey.shade500,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Goals List
              if (goals.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            color: Colors.grey[100],
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.track_changes_rounded, size: 40, color: Colors.grey[400]),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          "No goals yet",
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                        ),
                        const SizedBox(height: 8),
                         Text(
                          "Set financial targets and track your progress.",
                          style: TextStyle(color: Colors.grey[500]),
                        ),
                      ],
                    ),
                  ),
                )
              else
                SliverPadding(
                   padding: EdgeInsets.fromLTRB(24, 10, 24, bottomInset),
                   sliver: SliverList(
                     delegate: SliverChildBuilderDelegate(
                       (context, index) {
                         final goal = goals[index];
                         return GoalCard(
                           goal: goal,
                           onDelete: () => _confirmAndDelete(goal),
                           onTap: () => _addProgressSheet(goal),
                         );
                       },
                       childCount: goals.length,
                     ),
                   ),
                ),
            ],
          );
        },
      ),
    );
  }
}

