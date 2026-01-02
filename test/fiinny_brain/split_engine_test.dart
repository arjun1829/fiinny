import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/fiinny_brain/split_engine.dart';
import 'package:lifemap/models/expense_item.dart';

void main() {
  group('SplitEngine', () {
    test('Calculates equal split correctly (I pay)', () {
      final e = ExpenseItem(
        id: '1', type: 'exp', amount: 100, note: 'Lunch', date: DateTime.now(),
        payerId: 'me',
        friendIds: ['bob'],
        // implicit equal split: me, bob. 50/50. Bob owes me 50.
      ); 
      
      final r = SplitEngine.calculate([e], 'me');
      expect(r.netBalances['bob'], 50.0);
    });

    test('Calculates custom split correctly (Friend pays)', () {
      final e = ExpenseItem(
        id: '1', type: 'exp', amount: 100, note: 'Lunch', date: DateTime.now(),
        payerId: 'bob',
        friendIds: ['me'],
        customSplits: {'me': 20, 'bob': 80}, // I ate less
      ); 
      
      // Bob paid 100.
      // My share is 20.
      // I owe Bob 20. -> Bob owes me -20.
      
      final r = SplitEngine.calculate([e], 'me');
      expect(r.netBalances['bob'], -20.0);
    });

    test('Aggregates multiple expenses', () {
        // 1. I pay 100 for Bob (Bob owes 50)
        final e1 = ExpenseItem(id:'1', type:'exp', amount:100, note:'', date:DateTime.now(), payerId:'me', friendIds:['bob']);
        
        // 2. Bob pays 40 for Me (I owe 20)
        final e2 = ExpenseItem(id:'2', type:'exp', amount:40, note:'', date:DateTime.now(), payerId:'bob', friendIds:['me']);
        
        // Net: Bob owes me 50 - 20 = 30.
        final r = SplitEngine.calculate([e1, e2], 'me');
        expect(r.netBalances['bob'], 30.0);
    });
  });
}
