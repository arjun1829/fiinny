import 'dart:math' as math;

import 'transfer_models.dart';

/// Simplifies a map of participant -> net balance into concrete transfers.
///
/// Positive net means the participant should receive money. Negative net means
/// they owe the network. Amounts are rounded to 2 decimals to keep currency
/// friendly suggestions.
class DebtSimplifier {
  const DebtSimplifier();

  List<Transfer> simplify(Map<String, double> netBalances) {
    if (netBalances.isEmpty) return const [];

    final receivers = <_Entry>[];
    final payers = <_Entry>[];

    double round2(double value) => (value * 100).roundToDouble() / 100.0;

    netBalances.forEach((id, raw) {
      final amount = round2(raw);
      if (amount.abs() < 0.005) return;
      if (amount > 0) {
        receivers.add(_Entry(id, amount));
      } else {
        payers.add(_Entry(id, -amount));
      }
    });

    if (receivers.isEmpty || payers.isEmpty) return const [];

    // Deterministic ordering: largest balances first, stable by id.
    int comparator(_Entry a, _Entry b) {
      final cmp = b.amount.compareTo(a.amount);
      if (cmp != 0) return cmp;
      return a.id.toLowerCase().compareTo(b.id.toLowerCase());
    }

    receivers.sort(comparator);
    payers.sort(comparator);

    final transfers = <Transfer>[];
    var recvIndex = 0;
    var payIndex = 0;

    while (recvIndex < receivers.length && payIndex < payers.length) {
      final receiver = receivers[recvIndex];
      final payer = payers[payIndex];

      final settledAmount = math.min(receiver.amount, payer.amount);
      if (settledAmount <= 0) {
        break;
      }
      transfers.add(Transfer(
        from: payer.id,
        to: receiver.id,
        amount: round2(settledAmount),
      ));

      receiver.amount = round2(receiver.amount - settledAmount);
      payer.amount = round2(payer.amount - settledAmount);

      if (receiver.amount <= 0.004) {
        recvIndex++;
      }
      if (payer.amount <= 0.004) {
        payIndex++;
      }
    }

    return transfers;
  }
}

class _Entry {
  _Entry(this.id, this.amount);
  final String id;
  double amount;
}
