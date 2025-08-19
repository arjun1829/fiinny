import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/goal_model.dart';
import '../services/goal_service.dart';
import '../widgets/add_goal_dialog.dart';

// 🚨 Import custom theme widgets!
import '../themes/custom_app_bar.dart';
import '../themes/custom_card.dart';

class GoalsScreen extends StatefulWidget {
  final String userId;
  const GoalsScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<GoalsScreen> createState() => _GoalsScreenState();
}

class _GoalsScreenState extends State<GoalsScreen> {
  List<GoalModel> _goals = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadGoals();
  }

  Future<void> _loadGoals() async {
    setState(() => _loading = true);
    _goals = await GoalService().getGoals(widget.userId);
    setState(() => _loading = false);
  }

  Future<void> _showAddGoalDialog() async {
    await showDialog(
      context: context,
      builder: (ctx) => AddGoalDialog(
        onAdd: (GoalModel goal) async {
          await GoalService().addGoal(widget.userId, goal);
          _loadGoals();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: CustomAppBar(
          title: "Your Goals",
          action: IconButton(
            icon: const Icon(Icons.add),
            tooltip: "Add Goal",
            onPressed: _showAddGoalDialog,
          ),
          height: 92,
          diamondOverlay: true,
          backgroundGradient: [
            Theme.of(context).colorScheme.primary.withOpacity(0.95),
            Theme.of(context).colorScheme.secondary.withOpacity(0.85),
            Colors.white.withOpacity(0.73),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : Column(
          children: [
            Material(
              color: Colors.transparent,
              child: const TabBar(
                tabs: [
                  Tab(text: "In Progress"),
                  Tab(text: "Achieved"),
                ],
                indicatorColor: Colors.teal,
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _goalsTab(context, inProgress: true),
                  _goalsTab(context, inProgress: false),
                ],
              ),
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: _showAddGoalDialog,
          backgroundColor: Theme.of(context).colorScheme.primary,
          child: const Icon(Icons.add),
          tooltip: "Add Goal",
        ),
      ),
    );
  }

  Widget _goalsTab(BuildContext context, {required bool inProgress}) {
    List<GoalModel> list = _goals.where((g) {
      final progress = g.targetAmount == 0 ? 0.0 : (g.savedAmount / g.targetAmount);
      return inProgress ? progress < 1.0 : progress >= 1.0;
    }).toList();

    final int totalGoals = list.length;
    final double totalSaved = list.fold(0.0, (a, g) => a + g.savedAmount);
    final double totalTarget = list.fold(0.0, (a, g) => a + g.targetAmount);

    if (list.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/images/goal_trophy.png', height: 110),
            const SizedBox(height: 18),
            Text(
              inProgress ? "No goals in progress!" : "No achieved goals yet!",
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 10),
            ElevatedButton(
              onPressed: _showAddGoalDialog,
              child: const Text("Add Goal"),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.only(top: 12, bottom: 80),
      children: [
        CustomDiamondCard(
          isDiamondCut: false,
          borderRadius: 19,
          child: _analyticsCard(
            totalGoals: totalGoals,
            totalSaved: totalSaved,
            totalTarget: totalTarget,
            inProgress: inProgress,
          ),
        ),
        const SizedBox(height: 10),
        ...list.map((g) => CustomDiamondCard(
          isDiamondCut: true,
          borderRadius: 19,
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 5),
          child: _goalCard(g),
        )),
      ],
    );
  }

  Widget _analyticsCard({
    required int totalGoals,
    required double totalSaved,
    required double totalTarget,
    required bool inProgress,
  }) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                inProgress ? "Goals in Progress" : "Achieved Goals",
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
              ),
              const SizedBox(height: 6),
              Text(
                "Total: $totalGoals",
                style: const TextStyle(fontSize: 15),
              ),
              Text(
                "Saved: ₹${totalSaved.toStringAsFixed(0)}",
                style: const TextStyle(fontSize: 15),
              ),
              if (inProgress)
                Text(
                  "Target: ₹${totalTarget.toStringAsFixed(0)}",
                  style: const TextStyle(fontSize: 15),
                ),
            ],
          ),
        ),
        if (inProgress && totalTarget > 0)
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                "${(totalSaved / totalTarget * 100).clamp(0, 100).toStringAsFixed(1)}% overall",
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ],
          ),
      ],
    );
  }

  Widget _goalCard(GoalModel g) {
    final progress = g.targetAmount == 0
        ? 0.0
        : (g.savedAmount / g.targetAmount).clamp(0.0, 1.0);

    final String insight = _generateGoalInsight(g);

    return ListTile(
      contentPadding: const EdgeInsets.only(left: 2, right: 4, top: 4, bottom: 4),
      leading: Text(g.emoji ?? "🎯", style: const TextStyle(fontSize: 32)),
      title: Row(
        children: [
          Expanded(
            child: Text(
              g.title,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          if (g.category != null)
            Padding(
              padding: const EdgeInsets.only(left: 8.0),
              child: Chip(
                label: Text(g.category ?? ""),
                backgroundColor: Colors.teal[50],
                visualDensity: VisualDensity.compact,
                labelStyle: const TextStyle(fontSize: 12),
              ),
            ),
          if (g.priority != null)
            Padding(
              padding: const EdgeInsets.only(left: 6.0),
              child: Chip(
                label: Text(g.priority ?? ""),
                backgroundColor: Colors.orange[50],
                visualDensity: VisualDensity.compact,
                labelStyle: const TextStyle(fontSize: 12),
              ),
            ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 4),
          Text("Target: ₹${g.targetAmount.toStringAsFixed(0)}"),
          Text("By: ${DateFormat("d MMM, yyyy").format(g.targetDate)}"),
          if (g.notes != null && g.notes!.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3.0, bottom: 3.0),
              child: Text(
                g.notes!,
                style: const TextStyle(fontSize: 12, color: Colors.black54),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          if (g.dependencies != null && g.dependencies!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3.0, bottom: 2.0),
              child: Wrap(
                spacing: 5,
                children: g.dependencies!
                    .map((dep) => Chip(
                  label: Text(dep, style: const TextStyle(fontSize: 11)),
                  backgroundColor: Colors.green[50],
                  visualDensity: VisualDensity.compact,
                ))
                    .toList(),
              ),
            ),
          const SizedBox(height: 5),
          LinearProgressIndicator(
            value: progress,
            backgroundColor: Colors.grey[200],
            color: progress >= 1.0 ? Colors.green : Theme.of(context).colorScheme.primary,
            minHeight: 7,
          ),
          const SizedBox(height: 5),
          Text(
            "${(progress * 100).toStringAsFixed(1)}% completed",
            style: TextStyle(
              fontSize: 12,
              color: progress >= 1.0 ? Colors.green : Theme.of(context).colorScheme.primary,
            ),
          ),
          const SizedBox(height: 6),
          if (insight.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 8),
              margin: const EdgeInsets.only(top: 3),
              decoration: BoxDecoration(
                color: Colors.teal[50],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                insight,
                style: const TextStyle(fontSize: 13, fontStyle: FontStyle.italic),
              ),
            ),
        ],
      ),
      trailing: progress >= 1.0
          ? const Icon(Icons.emoji_events, color: Colors.amber)
          : null,
    );
  }

  String _generateGoalInsight(GoalModel g) {
    final now = DateTime.now();
    final daysLeft = g.targetDate.difference(now).inDays;
    final amountLeft = (g.targetAmount - g.savedAmount).clamp(0, g.targetAmount);
    final progress = g.targetAmount == 0
        ? 0.0
        : (g.savedAmount / g.targetAmount).clamp(0.0, 1.0);

    if (progress >= 1.0) {
      return "Congratulations! Goal achieved.";
    }
    if (daysLeft <= 0 && progress < 1.0) {
      return "Target date passed. Try adjusting the plan.";
    }
    if (amountLeft <= 0) {
      return "";
    }
    final requiredDaily = daysLeft > 0 ? (amountLeft / daysLeft) : amountLeft;
    final requiredMonthly = requiredDaily * 30;
    if (progress > 0.8) {
      return "Almost there. Maintain current savings to finish on time.";
    }
    if (progress < 0.8 && daysLeft > 0) {
      return "Save about ₹${requiredMonthly.toStringAsFixed(0)}/month to reach this goal.";
    }
    if (progress < 0.5) {
      return "You're behind pace. Try to save more this month.";
    }
    return "";
  }
}
