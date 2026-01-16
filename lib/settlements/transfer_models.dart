
/// A single cash movement suggestion from [from] -> [to].
class Transfer {
  final String from;
  final String to;
  final double amount;

  const Transfer({
    required this.from,
    required this.to,
    required this.amount,
  }) : assert(amount >= 0, 'Transfer amount cannot be negative');

  Transfer copyWith({String? from, String? to, double? amount}) {
    return Transfer(
      from: from ?? this.from,
      to: to ?? this.to,
      amount: amount ?? this.amount,
    );
  }

  @override
  String toString() =>
      'Transfer(from: $from, to: $to, amount: ${amount.toStringAsFixed(2)})';

  @override
  bool operator ==(Object other) {
    return other is Transfer &&
        other.from == from &&
        other.to == to &&
        (other.amount - amount).abs() < 0.0001;
  }

  @override
  int get hashCode => Object.hash(from, to, amount.toStringAsFixed(2));
}
