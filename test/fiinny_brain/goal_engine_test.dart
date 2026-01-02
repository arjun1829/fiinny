import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/goal_engine.dart';
import 'package:lifemap/models/goal_model.dart';

void main() {
  group('GoalEngine', () {
    test('Calculates On Track correctly', () {
      final goal = GoalModel(
        id: '1', 
        title: 'Car', 
        targetAmount: 100000, 
        savedAmount: 50000, 
        targetDate: DateTime.now().add(const Duration(days: 300)), // ~10 months
      ); 
      // Remaining: 50k. Time: 10 months. Need 5k/month.
      
      // Case 1: Saving 6k/month -> On Track
      final r1 = GoalEngine.checkStatus(goal, 6000);
      expect(r1.onTrack, true);
      expect(r1.etaMonths, lessThan(10));

      // Case 2: Saving 1k/month -> Off Track
      final r2 = GoalEngine.checkStatus(goal, 1000);
      expect(r2.onTrack, false);
      expect(r2.etaMonths, 50.0);
    });

    test('Handles completed goals', () {
        final goal = GoalModel(
        id: '1', title: 'Done', targetAmount: 100, savedAmount: 100, targetDate: DateTime.now(),
        status: GoalStatus.completed,
      );
      final r = GoalEngine.checkStatus(goal, 0);
      expect(r.onTrack, true);
      expect(r.etaMonths, 0);
    });
  });
}
