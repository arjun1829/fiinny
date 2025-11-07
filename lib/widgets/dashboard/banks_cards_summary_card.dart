import 'package:flutter/material.dart';

import '../../core/formatters/inr.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';
import '../../themes/glass_card.dart';
import '../../themes/tokens.dart';
import '../../ui/atoms/brand_avatar.dart';
import '../../screens/subs_bills/widgets/brand_avatar_registry.dart';

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

    final miniCards = _miniAccountCards(byBank);

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
                  if (miniCards.isEmpty)
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
                    _buildAccountLayout(context, miniCards),
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

  List<_MiniAccountCardData> _miniAccountCards(Map<String, List<_Acct>> byBank) {
    final entries = byBank.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final out = <_MiniAccountCardData>[];
    for (final entry in entries) {
      final prettyBank = _formatBankName(entry.key);
      final assetPathBase = BrandAvatarRegistry.assetFor(prettyBank);
      final accounts = List<_Acct>.from(entry.value)
        ..sort((a, b) => b.total.compareTo(a.total));
      for (final acct in accounts) {
        final assetPath = assetPathBase ??
            BrandAvatarRegistry.assetFor(acct.instrument) ??
            BrandAvatarRegistry.assetFor(acct.label);
        out.add(
          _MiniAccountCardData(
            bank: prettyBank,
            subtitle: _subtitleForAcct(acct),
            total: acct.total,
            assetPath: assetPath,
          ),
        );
      }
    }
    return out;
  }

  Widget _buildAccountLayout(BuildContext context, List<_MiniAccountCardData> cards) {
    final isWide = MediaQuery.of(context).size.width >= 640;
    if (isWide) {
      return GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 2.8,
        children: cards
            .map((card) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: _miniAccountCard(context, card),
                ))
            .toList(),
      );
    }

    return SizedBox(
      height: 118,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          children: cards
              .map(
                (card) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: SizedBox(
                    width: 240,
                    child: _miniAccountCard(context, card),
                  ),
                ),
              )
              .toList(),
        ),
      ),
    );
  }

  Widget _miniAccountCard(BuildContext context, _MiniAccountCardData card) {
    final amountColor = card.total >= 0 ? Fx.bad : Fx.good;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 12,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          BrandAvatar(
            assetPath: card.assetPath,
            label: card.bank,
            size: 32,
            radius: 10,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  card.bank,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15.5,
                    color: Fx.textStrong,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  card.subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Fx.label.copyWith(
                    fontSize: 12.5,
                    color: Fx.text.withOpacity(.65),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            INR.f(card.total),
            style: Fx.label.copyWith(
              fontWeight: FontWeight.w800,
              color: amountColor,
            ),
          ),
        ],
      ),
    );
  }

  String _formatBankName(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return 'Bank';
    if (trimmed.length <= 4) return trimmed.toUpperCase();
    return trimmed
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .map((word) =>
            word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}')
        .join(' ');
  }

  String _subtitleForAcct(_Acct acct) {
    final last4 = (acct.last4 ?? '').trim();
    final instrument = (acct.instrument).trim();
    final label = (acct.label).trim();
    if (last4.isNotEmpty && instrument.isNotEmpty) {
      return '•••• $last4 · $instrument';
    }
    if (last4.isNotEmpty) {
      return '•••• $last4';
    }
    if (label.isNotEmpty) {
      return label;
    }
    if (instrument.isNotEmpty) {
      return instrument;
    }
    return 'Account';
  }
}

class _MiniAccountCardData {
  const _MiniAccountCardData({
    required this.bank,
    required this.subtitle,
    required this.total,
    this.assetPath,
  });

  final String bank;
  final String subtitle;
  final double total;
  final String? assetPath;
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
