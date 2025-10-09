class Transaction {
  final String id;
  final DateTime date;
  final String merchant;
  final double amount;
  final String description;

  const Transaction({
    required this.id,
    required this.date,
    required this.merchant,
    required this.amount,
    this.description = '',
  });
}
