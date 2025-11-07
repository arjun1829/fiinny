import 'package:flutter/material.dart';

import '../../core/formatters/inr.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';
import '../../themes/glass_card.dart';
import '../../themes/tokens.dart';

class BanksCardsSummaryCard extends StatefulWidget {
  const BanksCardsSummaryCard({
    super.key,
    required this.expenses,
    required this.incomes,
    required this.onOpenAnalytics,
    this.initiallyExpanded = false,
  });

  final List<ExpenseItem> expenses;
  final List<IncomeItem> incomes;
  final VoidCallback onOpenAnalytics;
  final bool initiallyExpanded;

  @override
  State<BanksCardsSummaryCard> createState() => _BanksCardsSummaryCardState();
}

class _BanksCardsSummaryCardState extends State<BanksCardsSummaryCard> {
  bool _open = false;

  @override
  void initState() {
    super.initState();
    _open = widget.initiallyExpanded;
  }

  String _normInstrument(String? raw) {
    final u = (raw ?? '').toUpperCase();
    if (u.contains('CREDIT')) return 'Credit Card';
    if (u.contains('DEBIT')) return 'Debit Card';
    if (u.contains('UPI')) return 'UPI';
    if (u.contains('NET')) return 'NetBanking';
    if (u.contains('IMPS')) return 'IMPS';
    if (u.contains('NEFT')) return 'NEFT';
    if (u.contains('RTGS')) return 'RTGS';
    if (u.contains('ATM')) return 'ATM';
    if (u.contains('POS')) return 'POS';
    return (raw ?? '').trim().isEmpty ? 'Account' : raw!.trim();
  }

  List<_BanksCardsGroup> _buildGroups(
    List<ExpenseItem> expenses,
    List<IncomeItem> incomes,
  ) {
    final map = <String, _BanksCardsGroup>{};

    void add({
      required bool debit,
      required double amount,
      String? bank,
      String? instrument,
      String? last4,
      String? network,
    }) {
      final bankLabel = (bank ?? 'Unknown').trim();
      final instrumentLabel = _normInstrument(instrument);
      if (bankLabel.isEmpty && instrumentLabel.isEmpty) return;

      final sanitizedLast4 = (last4 != null && last4.trim().length >= 4)
          ? last4.trim().substring(last4.trim().length - 4)
          : null;

      final key = '${bankLabel.toUpperCase()}|$instrumentLabel|${sanitizedLast4 ?? ''}|${(network ?? '').toUpperCase()}';
      final group = map.putIfAbsent(
        key,
        () => _BanksCardsGroup(
          bank: bankLabel.toUpperCase(),
          instrument: instrumentLabel,
          last4: sanitizedLast4,
          network: (network ?? '').isEmpty ? null : network,
        ),
      );

      if (debit) {
        group.debit += amount;
      } else {
        group.credit += amount;
      }
      group.count += 1;
    }

    for (final expense in expenses) {
      add(
        debit: true,
        amount: expense.amount,
        bank: expense.issuerBank,
        instrument: expense.instrument,
        last4: expense.cardLast4,
        network: expense.instrumentNetwork,
      );
    }

    for (final income in incomes) {
      add(
        debit: false,
        amount: income.amount,
        bank: income.issuerBank,
        instrument: income.instrument,
        last4: null, // incomes typically don't expose card last4
        network: income.instrumentNetwork,
      );
    }

    final groups = map.values.toList();
    groups.sort((a, b) {
      final diff = b.netOutflow.compareTo(a.netOutflow);
      if (diff != 0) return diff;
      return b.count.compareTo(a.count);
    });
    return groups;
  }

  Widget _pill(String label, {IconData? icon, Color? color}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(.04),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.black12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: color ?? Fx.text),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: color ?? Fx.text,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final expenses = widget.expenses;
    final incomes = widget.incomes;

    final banks = <String>{};
    final cards = <String>{};

    for (final expense in expenses) {
      final bank = expense.issuerBank;
      if (bank != null && bank.trim().isNotEmpty) {
        banks.add(bank.toUpperCase());
      }
      final instrument = _normInstrument(expense.instrument).toLowerCase();
      if (instrument.contains('credit') || instrument.contains('debit')) {
        final last4 = (expense.cardLast4 ?? '').trim();
        if (last4.isNotEmpty) {
          cards.add('${(expense.issuerBank ?? '').toUpperCase()}-$last4');
        }
      }
    }

    for (final income in incomes) {
      final bank = income.issuerBank;
      if (bank != null && bank.trim().isNotEmpty) {
        banks.add(bank.toUpperCase());
      }
      final instrument = _normInstrument(income.instrument).toLowerCase();
      if (instrument.contains('credit') || instrument.contains('debit')) {
        final last4 = ''; // ignore last4 for incomes
        if (last4.isNotEmpty) {
          cards.add('${(income.issuerBank ?? '').toUpperCase()}-$last4');
        }
      }
    }

    final spent = expenses.fold<double>(0, (sum, e) => sum + e.amount);
    final received = incomes.fold<double>(0, (sum, i) => sum + i.amount);
    final txCount = expenses.length + incomes.length;

    final groups = _buildGroups(expenses, incomes);

    final Map<String, List<_Acct>> byBank = {};
    void addAcct(String bank, String? last4, String instrument, double amount) {
      final normalizedBank = (bank.isEmpty ? 'BANK' : bank).toUpperCase();
      byBank.putIfAbsent(normalizedBank, () => []);
      final sanitizedLast4 =
          (last4 != null && last4.trim().isNotEmpty) ? last4.trim() : null;
      final label = sanitizedLast4 != null ? '••$sanitizedLast4' : instrument;
      final list = byBank[normalizedBank]!;
      final index = list.indexWhere((acct) => acct.label == label);
      if (index >= 0) {
        list[index] =
            list[index].copyWith(total: list[index].total + amount);
      } else {
        list.add(
          _Acct(
            label: label,
            instrument: instrument,
            last4: sanitizedLast4,
            total: amount,
          ),
        );
      }
    }

    for (final group in groups) {
      addAcct(group.bank, group.last4, group.instrument, group.netOutflow);
    }

    final bankNames = byBank.keys.toList()..sort();

    return GestureDetector(
      onTap: widget.onOpenAnalytics,
      behavior: HitTestBehavior.opaque,
      child: GlassCard(
        radius: Fx.r24,
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.credit_card_rounded, color: Fx.mintDark),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Banks & Cards',
                    style: Fx.title,
                  ),
                ),
                IconButton(
                  tooltip: _open ? 'Collapse' : 'Expand',
                  onPressed: () {
                    setState(() {
                      _open = !_open;
                    });
                  },
                  icon: Icon(
                    _open ? Icons.expand_less : Icons.expand_more,
                    color: Fx.text,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _pill('Banks: ${banks.length}', icon: Icons.account_balance_rounded),
                _pill('Cards: ${cards.length}', icon: Icons.credit_card),
                _pill('Tx: $txCount', icon: Icons.list_alt),
                _pill('Spent ${INR.f(spent)}', icon: Icons.south_east_rounded, color: Colors.red[700]),
                _pill('Received ${INR.f(received)}', icon: Icons.north_east_rounded, color: Colors.green[700]),
              ],
            ),
            AnimatedCrossFade(
              firstChild: const SizedBox.shrink(),
              secondChild: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 12),
                  if (bankNames.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.grey.shade200),
                      ),
                      child: const Text(
                        'We will list your most active cards and accounts once we have enough data for this period.',
                        style: TextStyle(fontWeight: FontWeight.w500),
                      ),
                    )
                  else
                    ListView(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        for (final bank in bankNames) ...[
                          Builder(
                            builder: (_) {
                              final accounts = List<_Acct>.from(byBank[bank]!);
                              accounts.sort((a, b) => b.total.compareTo(a.total));
                              final bankTotal =
                                  accounts.fold<double>(0, (sum, acct) => sum + acct.total);
                              final bankColor = bankTotal >= 0
                                  ? Colors.redAccent
                                  : Colors.green;

                              return ExpansionTile(
                                tilePadding: const EdgeInsets.symmetric(horizontal: 12),
                                childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                                title: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        bank,
                                        style: const TextStyle(fontWeight: FontWeight.w800),
                                      ),
                                    ),
                                    Text(
                                      INR.f(bankTotal),
                                      style: TextStyle(
                                        fontWeight: FontWeight.w800,
                                        color: bankColor,
                                      ),
                                    ),
                                  ],
                                ),
                                children: [
                                  for (final acct in accounts)
                                    ListTile(
                                      dense: true,
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(acct.label),
                                      subtitle: Text(acct.instrument),
                                      trailing: Text(
                                        INR.f(acct.total),
                                        style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                          color: acct.total >= 0
                                              ? Colors.redAccent
                                              : Colors.green,
                                        ),
                                      ),
                                    ),
                                ],
                              );
                            },
                          ),
                        ],
                      ],
                    ),
                ],
              ),
              crossFadeState:
                  _open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
              duration: const Duration(milliseconds: 220),
            ),
          ],
        ),
      ),
    );
  }
}

class _BanksCardsGroup {
  _BanksCardsGroup({
    required this.bank,
    required this.instrument,
    this.last4,
    this.network,
    this.debit = 0,
    this.credit = 0,
    this.count = 0,
  });

  final String bank;
  final String instrument;
  final String? last4;
  final String? network;
  double debit;
  double credit;
  int count;

  double get netOutflow => debit - credit;
}

class _Acct {
  const _Acct({
    required this.label,
    required this.instrument,
    this.last4,
    required this.total,
  });

  final String label;
  final String instrument;
  final String? last4;
  final double total;

  _Acct copyWith({
    String? label,
    String? instrument,
    String? last4,
    double? total,
  }) {
    return _Acct(
      label: label ?? this.label,
      instrument: instrument ?? this.instrument,
      last4: last4 ?? this.last4,
      total: total ?? this.total,
    );
  }
}
