import 'package:flutter/material.dart';

import '../models/asset_model.dart';
import '../models/price_quote.dart';
import '../services/asset_service.dart';
import '../services/market_data_yahoo.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import '../widgets/holding_row.dart';
import '../../../../services/expense_service.dart';
import '../../../../services/income_service.dart';
import '../../../../widgets/dashboard/bank_cards_carousel.dart';
import '../../../../models/expense_item.dart';
import '../../../../models/income_item.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Portfolio list + quick totals (refactored to use HoldingRow widget)
class PortfolioScreen extends StatefulWidget {
  const PortfolioScreen({super.key});

  @override
  State<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends State<PortfolioScreen> {
  final _assetService = AssetService();
  final _market = MarketDataYahoo();

  bool _loading = true;
  List<AssetModel> _assets = [];
  Map<String, PriceQuote> _quotes = {};
  List<ExpenseItem> _expenses = [];
  List<IncomeItem> _incomes = [];
  String _userName = 'User';

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _loading = true);
    final uid = FirebaseAuth.instance.currentUser?.uid;

    // Fetch Assets
    final assets = await _assetService.loadAssets();

    // Fetch User, Expenses, Incomes if user is logged in
    List<ExpenseItem> expenses = [];
    List<IncomeItem> incomes = [];
    String userName = 'User';

    if (uid != null) {
      try {
        expenses = await ExpenseService().getExpenses(uid);
        incomes = await IncomeService().getIncomes(uid);
        final userDoc =
            await FirebaseFirestore.instance.collection('users').doc(uid).get();
        if (userDoc.exists) {
          userName = userDoc.data()?['name'] ?? 'User';
        }
      } catch (e) {
        debugPrint('Failed to load aux data in Portfolio: $e');
      }
    }

    // Build the symbol list for quotes:
    // - stocks -> use their symbol uppercased
    // - gold   -> treat as 'GOLD'
    final symbols = <String>{
      for (final a in assets) a.type == 'stock' ? a.name.toUpperCase() : 'GOLD'
    }.toList();

    final quotes = symbols.isEmpty
        ? <String, PriceQuote>{}
        : await _market.fetchQuotes(symbols);

    if (mounted) {
      setState(() {
        _assets = assets;
        _quotes = quotes;
        _expenses = expenses;
        _incomes = incomes;
        _userName = userName;
        _loading = false;
      });
    }
  }

  PriceQuote? _quoteFor(AssetModel a) {
    final key = a.type == 'stock' ? a.name.toUpperCase() : 'GOLD';
    return _quotes[key];
  }

  double get _totalInvested =>
      _assets.fold(0.0, (prev, a) => prev + a.investedValue());

  double get _totalCurrent {
    double total = 0.0;
    for (final a in _assets) {
      final q = _quoteFor(a)?.ltp ?? a.avgBuyPrice;
      total += a.currentValue(q);
    }
    return total;
  }

  Future<void> _addFlow() async {
    // Go to type picker → (it will push entry screen internally).
    await Navigator.pushNamed(context, '/asset-type-picker');
    await _loadAll();
  }

  Future<void> _delete(String id) async {
    await _assetService.removeAsset(id);
    await _loadAll();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Portfolio'),
        actions: [
          IconButton(
            tooltip: 'Refresh prices',
            onPressed: _loadAll,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addFlow,
        icon: const Icon(Icons.add),
        label: const Text('Add'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadAll,
              child: _assets.isEmpty
                  ? ListView(
                      children: [
                        const SizedBox(height: 120),
                        Icon(Icons.folder_open,
                            size: 48, color: theme.colorScheme.outline),
                        const SizedBox(height: 12),
                        Center(
                          child: Text(
                            'No holdings yet.\nTap “Add” to create your first asset.',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: theme.colorScheme.outline),
                          ),
                        ),
                      ],
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
                      children: [
                        _TotalsCard(
                          invested: _totalInvested,
                          current: _totalCurrent,
                        ),
                        const SizedBox(height: 24),
                        BankCardsCarousel(
                          expenses: _expenses,
                          incomes: _incomes,
                          userName: _userName,
                          onAddCard:
                              _addFlow, // Using Asset add flow temporarily or just placeholder
                        ),
                        const SizedBox(height: 12),

                        // Holdings list using the reusable widget
                        ..._assets.map(
                          (a) => HoldingRow(
                            asset: a,
                            quote: _quoteFor(a),
                            onLongPress: () =>
                                _confirmDelete(context, a, _delete),
                          ),
                        ),

                        const SizedBox(height: 16),
                        Center(
                          child: Text(
                            'Prices are demo (random-walk). Plug a real provider later.',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.outline,
                            ),
                          ),
                        ),
                        const SizedBox(height: 120),
                      ],
                    ),
            ),
    );
  }

  void _confirmDelete(
    BuildContext context,
    AssetModel asset,
    Future<void> Function(String id) onDelete,
  ) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove asset?'),
        content: Text('Delete ${asset.name}? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton.tonal(
            onPressed: () async {
              Navigator.pop(context);
              await onDelete(asset.id);
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}

class _TotalsCard extends StatelessWidget {
  final double invested;
  final double current;

  const _TotalsCard({required this.invested, required this.current});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pnl = current - invested;
    final pnlPct = invested == 0 ? 0 : (pnl / invested) * 100;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Row(
          children: [
            Expanded(
              child: _kpi(
                context,
                label: 'Invested',
                value: '₹${invested.toStringAsFixed(2)}',
              ),
            ),
            Expanded(
              child: _kpi(
                context,
                label: 'Current',
                value: '₹${current.toStringAsFixed(2)}',
              ),
            ),
            Expanded(
              child: _kpi(
                context,
                label: 'P/L',
                value:
                    '${pnl >= 0 ? '+' : '-'}₹${pnl.abs().toStringAsFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toStringAsFixed(2)}%)',
                color: pnl >= 0 ? Colors.green : Colors.red,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kpi(BuildContext context,
      {required String label, required String value, Color? color}) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: theme.textTheme.labelMedium
                ?.copyWith(color: theme.colorScheme.outline)),
        const SizedBox(height: 6),
        Text(
          value,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
            color: color ?? theme.colorScheme.onSurface,
          ),
        ),
      ],
    );
  }
}
