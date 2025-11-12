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

    final bankTiles = _bankExpansionTiles(groups);

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
                  if (bankTiles.isEmpty)
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
                  else ...bankTiles,
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

  String _formatBankName(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty || trimmed == 'UNKNOWN') return 'Unknown Bank';
    if (trimmed.length <= 4) return trimmed.toUpperCase();
    return trimmed
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .map((word) =>
            word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}')
        .join(' ');
  }

  String _slugBank(String s) {
    final x = s.toLowerCase();
    if (x.contains('axis')) return 'axis';
    if (x.contains('hdfc')) return 'hdfc';
    if (x.contains('icici')) return 'icici';
    if (x.contains('kotak')) return 'kotak';
    if (x.contains('sbi') || x.contains('state bank')) return 'sbi';
    if (x.contains('american express') || x.contains('amex')) return 'amex';
    return x.replaceAll(RegExp(r'[^a-z]'), '');
  }

  String? _bankLogoAsset(String? bank, {String? network}) {
    final candidates = <String>[];
    if (bank != null && bank.trim().isNotEmpty) {
      final slug = _slugBank(bank);
      if (slug.isNotEmpty) {
        candidates.addAll([
          'assets/banks/$slug.png',
          'lib/assets/banks/$slug.png',
        ]);
      }
    }

    if (network != null && network.trim().isNotEmpty) {
      final n = network.toLowerCase();
      String networkSlug = '';
      if (n.contains('visa')) {
        networkSlug = 'visa';
      } else if (n.contains('master')) {
        networkSlug = 'mastercard';
      } else if (n.contains('amex') || n.contains('american express')) {
        networkSlug = 'amex';
      } else if (n.contains('rupay')) {
        networkSlug = 'rupay';
      }

      if (networkSlug.isNotEmpty) {
        candidates.addAll([
          'assets/banks/$networkSlug.png',
          'lib/assets/banks/$networkSlug.png',
        ]);
      }
    }

    return candidates.isNotEmpty ? candidates.first : null;
  }

  String _bankInitials(String? bank) {
    final safeBank = (bank ?? '').trim();
    final label =
        _formatBankName(safeBank.isEmpty ? 'Unknown Bank' : safeBank);
    final parts =
        label.split(RegExp(r'\s+')).where((part) => part.isNotEmpty).toList();
    if (parts.isEmpty) return 'BK';
    if (parts.length == 1) {
      final word = parts.first;
      if (word.length >= 2) return word.substring(0, 2).toUpperCase();
      return word.substring(0, 1).toUpperCase();
    }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  Widget _bankLogo(String? bank, {String? network, double size = 36}) {
    final asset = _bankLogoAsset(bank, network: network);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: Colors.black12),
      ),
      clipBehavior: Clip.antiAlias,
      child: ClipOval(
        child: asset != null
            ? Image.asset(
                asset,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _bankLogoFallback(bank),
              )
            : _bankLogoFallback(bank),
      ),
    );
  }

  Widget _bankLogoFallback(String? bank) {
    return ColoredBox(
      color: Colors.teal.shade50,
      child: Center(
        child: Text(
          _bankInitials(bank),
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            color: Colors.teal,
          ),
        ),
      ),
    );
  }

  List<Widget> _bankExpansionTiles(List<_BanksCardsGroup> groups) {
    if (groups.isEmpty) return const [];

    final grouped = <String, List<_BanksCardsGroup>>{};
    for (final group in groups) {
      grouped.putIfAbsent(group.bank, () => []).add(group);
    }

    final bankKeys = grouped.keys.toList()..sort();
    return bankKeys.map((bank) {
      final accounts = List<_BanksCardsGroup>.from(grouped[bank]!);
      accounts.sort((a, b) => b.netOutflow.compareTo(a.netOutflow));
      final bankNet =
          accounts.fold<double>(0, (sum, item) => sum + item.netOutflow);
      final bankColor = bankNet >= 0
          ? Colors.red.shade700
          : Colors.green.shade700;
      final totalBankTx =
          accounts.fold<int>(0, (sum, item) => sum + item.count);

      final tiles = <Widget>[
        ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          leading: _bankLogo(bank, size: 32),
          minLeadingWidth: 40,
          title: Text('All ${_formatBankName(bank)}'),
          subtitle: Text('$totalBankTx tx'),
          trailing: Text(
            INR.f(bankNet),
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: bankColor,
            ),
          ),
        ),
      ];

      if (accounts.isNotEmpty) {
        tiles.add(const SizedBox(height: 6));
      }

      for (final account in accounts) {
        final subtitleParts = <String>[];
        if (account.last4 != null && account.last4!.isNotEmpty) {
          subtitleParts.add('••${account.last4}');
        }
        if ((account.network ?? '').isNotEmpty) {
          subtitleParts.add(account.network!);
        }
        subtitleParts.add('${account.count} tx');
        final subtitle = subtitleParts.join(' • ');
        final accountColor = account.netOutflow >= 0
            ? Colors.red.shade700
            : Colors.green.shade700;

        tiles.add(
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: _bankLogo(
              bank,
              network: account.network,
              size: 32,
            ),
            minLeadingWidth: 40,
            title: Text(account.instrument),
            subtitle: subtitle.isNotEmpty ? Text(subtitle) : null,
            trailing: Text(
              INR.f(account.netOutflow),
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: accountColor,
              ),
            ),
          ),
        );
      }

      return Theme(
        data: Theme.of(context).copyWith(
          dividerColor: Colors.transparent,
          splashColor: Colors.transparent,
          highlightColor: Colors.transparent,
        ),
        child: ExpansionTile(
          key: PageStorageKey('dashboard-bank-$bank'),
          tilePadding: const EdgeInsets.symmetric(horizontal: 12),
          childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          leading: _bankLogo(bank, size: 40),
          title: Row(
            children: [
              Expanded(
                child: Text(
                  _formatBankName(bank),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                INR.f(bankNet),
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: bankColor,
              ),
            ),
          ],
          ),
          children: tiles,
        ),
      );
    }).toList();
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

