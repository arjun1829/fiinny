import '../models/goal_model.dart';

import 'snapshot_models.dart';

class GoalEngine {
  static GoalStatusReport checkStatus(GoalModel goal, double monthlySavingsAllocated) {
    if (goal.isAchieved) {
       return GoalStatusReport(
        goalId: goal.id,
        goalName: goal.title,
        onTrack: true,
        etaMonths: 0,
        amountRemaining: 0,
      );
    }

    final remaining = goal.amountRemaining;
    double eta = 999.0; // placeholder for infinite/long
    if (monthlySavingsAllocated > 0) {
      eta = remaining / monthlySavingsAllocated;
    }

    // On Track Logic
    // If ETA <= remaining days (converted to months)
    final remainingMonths = (goal.daysRemaining / 30.0).ceil();
    bool onTrack = false;
    if (remaining <= 0) {
        onTrack = true;
    } else if (monthlySavingsAllocated <= 0) {
        onTrack = false;
    } else {
        onTrack = eta <= remainingMonths;
    }

    // If goal is already overdue (daysRemaining < 0) and not achieved -> Not on track
    if (goal.daysRemaining < 0 && !goal.isAchieved) {
        onTrack = false;
    }

    return GoalStatusReport(
      goalId: goal.id,
      goalName: goal.title,
      onTrack: onTrack,
      etaMonths: double.parse(eta.toStringAsFixed(1)),
      amountRemaining: remaining,
    );
  }
}
