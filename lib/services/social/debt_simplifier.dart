class DebtSimplifier {
  /// Optimizes the settlement graph to minimize total transactions.
  /// Input: List of {payer, payee, amount}
  /// Output: Simplified List of {from, to, amount}
  List<SettlementTxn> simplifyDebts(List<RawDebt> rawDebts) {
    // 1. Calculate Net Balance for each person
    final balances = <String, double>{};

    for (var d in rawDebts) {
      // Payer gets positive balance (owed money)
      balances[d.payer] = (balances[d.payer] ?? 0) + d.amount;
      // Payee (borrower) gets negative balance (owes money)
      // Note: Definition of "payee" can vary. Here assuming:
      // A lends to B -> Payer: A, Borrower: B.
      // So A is +50, B is -50.
      balances[d.borrower] = (balances[d.borrower] ?? 0) - d.amount;
    }

    // 2. Separate into Debtors (-) and Creditors (+)
    final debtors = <String>[];
    final creditors = <String>[];

    // Filter out ~0 balances using epsilon
    const epsilon = 0.01;
    balances.forEach((person, balance) {
      if (balance > epsilon) {
        creditors.add(person);
      } else if (balance < -epsilon) {
        debtors.add(person);
      }
    });

    // Sort to optimize matching (Greedy approach helps, though not always optimal optimal,
    // it's good enough for N < 20).
    // Sorting by magnitude helps clear largest debts first.
    debtors.sort((a, b) => balances[a]!.compareTo(balances[b]!)); // Ascending (most negative first)
    creditors.sort((a, b) => balances[b]!.compareTo(balances[a]!)); // Descending (most positive first)

    final settlements = <SettlementTxn>[];

    int i = 0; // index for debtors
    int j = 0; // index for creditors

    while (i < debtors.length && j < creditors.length) {
      final debtor = debtors[i];
      final creditor = creditors[j];

      final amountOwed = -balances[debtor]!; // Convert -ve to +ve
      final amountToReceive = balances[creditor]!;

      // Greedily settle
      final settlementAmount = amountOwed < amountToReceive ? amountOwed : amountToReceive;

      // Record transaction
      settlements.add(SettlementTxn(from: debtor, to: creditor, amount: settlementAmount));

      // Update remaining balances
      balances[debtor] = balances[debtor]! + settlementAmount;
      balances[creditor] = balances[creditor]! - settlementAmount;

      // Move pointers if settled
      if (balances[debtor]!.abs() < epsilon) {
        i++;
      }
      if (balances[creditor]!.abs() < epsilon) {
        j++;
      }
    }

    return settlements;
  }
}

class RawDebt {
  final String payer; // The one who PAID (Lent money)
  final String borrower; // The one who OWES
  final double amount;

  RawDebt({required this.payer, required this.borrower, required this.amount});
}

class SettlementTxn {
  final String from; // Needs to pay
  final String to;   // Receives money
  final double amount;

  SettlementTxn({required this.from, required this.to, required this.amount});

  @override
  String toString() => '$from pays $to: ${amount.toStringAsFixed(2)}';
}
