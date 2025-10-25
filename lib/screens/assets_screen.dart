// lib/screens/assets_screen.dart
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/ads/ads_shell.dart';
import '../models/asset_model.dart';
import '../services/asset_service.dart';

class AssetsScreen extends StatefulWidget {
  final String userId;
  const AssetsScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AssetsScreen> createState() => _AssetsScreenState();
}

class _AssetsScreenState extends State<AssetsScreen> {
  late Future<List<AssetModel>> _assetsFuture;

  // UI/state
  final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  final Color _accentTop = const Color(0xFF10B981); // emerald
  final Color _accentBottom = const Color(0xFF0F172A); // deep navy
  final Color _cardBg = Colors.white;

  // Category filter
  String _segment = 'all'; // 'all', 'equity', 'mf_etf', 'fixed_deposit', 'real_estate', 'gold', 'bonds', 'crypto', 'cash_bank', 'retirement', 'other'

  // Quotes (rotating)
  static const _quotes = [
    "Make your money earn while you sleep.",
    "Automate investing. Automate winning.",
    "Every rupee is a worker—deploy it.",
    "Small SIPs, big futures.",
  ];
  int _quoteIndex = 0;
  Timer? _quoteTimer;

  @override
  void initState() {
    super.initState();
    _fetchAssets();
    _quoteTimer = Timer.periodic(const Duration(seconds: 6), (_) {
      if (!mounted) return;
      setState(() => _quoteIndex = (_quoteIndex + 1) % _quotes.length);
    });
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    super.dispose();
  }

  void _fetchAssets() {
    _assetsFuture = AssetService().getAssets(widget.userId);
  }

  // ----------------------------- Helpers --------------------------------

  List<AssetModel> _filterBySegment(List<AssetModel> all) {
    if (_segment == 'all') return all;
    return all.where((a) => (a.assetType.toLowerCase() == _segment)).toList();
  }

  Map<String, double> _breakdownByType(List<AssetModel> list) {
    final Map<String, double> m = {};
    for (final a in list) {
      final key = a.assetType.toLowerCase();
      m[key] = (m[key] ?? 0) + a.value;
    }
    return m;
  }

  String _topCategory(Map<String, double> b) {
    if (b.isEmpty) return "--";
    final entry = b.entries.reduce((a, b) => a.value >= b.value ? a : b);
    return _labelForType(entry.key);
  }

  String _labelForType(String type) {
    switch (type.toLowerCase()) {
      case 'equity': return "Equity";
      case 'mf_etf': return "MF/ETF";
      case 'fixed_deposit': return "Fixed Deposit";
      case 'real_estate': return "Real Estate";
      case 'gold': return "Gold";
      case 'bonds': return "Bonds";
      case 'crypto': return "Crypto";
      case 'cash_bank': return "Cash/Bank";
      case 'retirement': return "Retirement";
      case 'other': return "Other";
      default: return type;
    }
  }

  IconData _iconForType(String type) {
    switch (type.toLowerCase()) {
      case 'equity': return Icons.show_chart_rounded;
      case 'mf_etf': return Icons.scatter_plot_rounded;
      case 'fixed_deposit': return Icons.lock_rounded;
      case 'real_estate': return Icons.house_rounded;
      case 'gold': return Icons.workspace_premium_rounded;
      case 'bonds': return Icons.request_page_rounded;
      case 'crypto': return Icons.token_rounded;
      case 'cash_bank': return Icons.account_balance_rounded;
      case 'retirement': return Icons.savings_rounded;
      default: return Icons.category_rounded;
    }
  }

  // Try to locate a logo from logoHint or institution.
  // Put your logos in assets/banks/ or assets/institutions/ and declare in pubspec.
  String? _logoFor(AssetModel a) {
    final hint = (a.logoHint ?? a.institution ?? '').trim().toLowerCase();
    if (hint.isEmpty) return null;

    // Normalize common names to snake_case file names
    String norm(String s) => s
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'_+'), '_')
        .replaceAll(RegExp(r'^_|_$'), '');

    final n = norm(hint);

    // Try multiple folders (banks & institutions). Extend as you add more.
    final candidates = [
      'assets/banks/$n.png',
      'assets/banks/$n.jpg',
      'assets/institutions/$n.png',
      'assets/institutions/$n.jpg',
    ];
    // We can’t check file existence synchronously; attempt to show and let Flutter handle if missing.
    // To avoid red errors, we’ll only return paths; Image will use errorBuilder fallback.
    return candidates.first; // pick the first candidate
  }

  Future<void> _confirmDelete(AssetModel asset) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Asset?'),
        content: Text('Are you sure you want to delete "${asset.title}"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (ok == true) {
      await AssetService().deleteAsset(asset.id!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Asset "${asset.title}" deleted!'), backgroundColor: Colors.red),
      );
      setState(_fetchAssets);
    }
  }

  void _showDetails(AssetModel a) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              top: 8,
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header row
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      _LogoOrIcon(a, size: 40, fallback: _iconForType(a.assetType)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          a.title,
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.teal.withOpacity(.07),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.teal.withOpacity(.18)),
                        ),
                        child: Text(
                          _labelForType(a.assetType),
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: [
                      _kpi("Value", _inr.format(a.value)),
                      if ((a.institution ?? '').isNotEmpty) _kpi("Institution", a.institution!),
                      if ((a.subType ?? '').isNotEmpty) _kpi("Type", a.subType!),
                      if (a.quantity != null && a.quantity! > 0) _kpi("Qty", a.quantity!.toStringAsFixed(2)),
                      if (a.avgBuyPrice != null && a.avgBuyPrice! > 0)
                        _kpi("Avg Buy", _inr.format(a.avgBuyPrice)),
                      if (a.purchaseValue != null) _kpi("Purchase", _inr.format(a.purchaseValue)),
                      if (a.purchaseDate != null)
                        _kpi("Bought on", DateFormat('d MMM, yyyy').format(a.purchaseDate!)),
                      if (a.valuationDate != null)
                        _kpi("Valued on", DateFormat('d MMM, yyyy').format(a.valuationDate!)),
                      if ((a.currency ?? '').isNotEmpty) _kpi("Currency", a.currency!),
                    ],
                  ),

                  if ((a.tags ?? []).isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: a.tags!
                          .map((t) => Chip(
                        label: Text(t),
                        backgroundColor: Colors.teal[50],
                        visualDensity: VisualDensity.compact,
                      ))
                          .toList(),
                    )
                  ],

                  if ((a.notes ?? '').isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(a.notes!, style: const TextStyle(color: Colors.black87)),
                  ],

                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      ElevatedButton.icon(
                        onPressed: () async {
                          Navigator.pop(ctx);
                          final edited = await Navigator.pushNamed(context, '/editAsset', arguments: a.id);
                          if (edited == true && mounted) setState(_fetchAssets);
                        },
                        icon: const Icon(Icons.edit_rounded),
                        label: const Text("Edit"),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.teal,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          elevation: 0,
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(ctx);
                          _confirmDelete(a);
                        },
                        icon: const Icon(Icons.delete_forever_rounded, color: Colors.red),
                        label: const Text("Delete", style: TextStyle(color: Colors.red)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Colors.red),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _kpi(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.teal.withOpacity(.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.teal.withOpacity(.16)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text("$label: ", style: TextStyle(fontSize: 12, color: Colors.grey[800], fontWeight: FontWeight.w700)),
        Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
      ]),
    );
  }

  // ------------------------------ UI -----------------------------------

  @override
  Widget build(BuildContext context) {
    // Unfocus keyboard when tapping outside
    return GestureDetector(
      onTap: () => FocusScope.of(context).unfocus(),
      child: Scaffold(
        backgroundColor: Colors.grey[50],
        appBar: PreferredSize(
          preferredSize: const Size.fromHeight(68),
          child: _GlassAppBar(
            top: _accentTop,
            bottom: _accentBottom,
            child: SafeArea(
              bottom: false,
              child: Column(
                children: [
                  const SizedBox(height: 6),
                  // Motivational chip
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 300),
                        switchInCurve: Curves.easeOut,
                        child: Container(
                          key: ValueKey(_quoteIndex),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(.18),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.white.withOpacity(.30)),
                          ),
                          child: Text(
                            _quotes[_quoteIndex],
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 12.5,
                              letterSpacing: -.1,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Centered title
                  Text(
                    "Assets",
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      fontSize: 22,
                      letterSpacing: -.3,
                      shadows: const [Shadow(color: Color(0x33000000), blurRadius: 8, offset: Offset(0, 2))],
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
        ),
        floatingActionButton: FloatingActionButton(
          heroTag: 'assets-fab',
          backgroundColor: _accentTop,
          onPressed: () async {
            final added = await Navigator.pushNamed(context, '/addAsset', arguments: widget.userId);
            if (added == true) setState(_fetchAssets);
          },
          child: const Icon(Icons.add, color: Colors.white),
          tooltip: "Add Asset",
        ),
        body: FutureBuilder<List<AssetModel>>(
          future: _assetsFuture,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            final bottomInset = context.adsBottomPadding(extra: 24);
            final assets = snap.data ?? [];

            // Aggregates
            final total = assets.fold<double>(0.0, (s, a) => s + a.value);
            final breakdown = _breakdownByType(assets);
            final topCat = _topCategory(breakdown);

            // Category counts for chips
            final counts = <String, int>{};
            for (final a in assets) {
              final k = a.assetType.toLowerCase();
              counts[k] = (counts[k] ?? 0) + 1;
            }
            final filtered = _filterBySegment(assets);

            return RefreshIndicator(
              onRefresh: () async {
                setState(_fetchAssets);
                await Future.delayed(const Duration(milliseconds: 300));
              },
              child: CustomScrollView(
                physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                slivers: [
                  // Summary Card
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
                      child: _AssetsSummaryCard(
                        total: total,
                        count: assets.length,
                        topCategory: topCat,
                        breakdown: breakdown,
                        currency: _inr,
                      ),
                    ),
                  ),

                  // Category chips
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: _Segments(
                        segment: _segment,
                        counts: counts,
                        accent: _accentTop,
                        onChanged: (s) => setState(() => _segment = s),
                      ),
                    ),
                  ),

                  // List
                  if (filtered.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.savings_rounded, size: 72, color: Colors.grey),
                              const SizedBox(height: 12),
                              const Text("No assets yet.", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                              const SizedBox(height: 8),
                              ElevatedButton.icon(
                                onPressed: () async {
                                  final added = await Navigator.pushNamed(context, '/addAsset', arguments: widget.userId);
                                  if (added == true) setState(_fetchAssets);
                                },
                                icon: const Icon(Icons.add),
                                label: const Text("Add Asset"),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: _accentTop,
                                  foregroundColor: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(16, 2, 16, bottomInset),
                      sliver: SliverList.separated(
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (ctx, i) {
                          final a = filtered[i];
                          return _AssetTile(
                            asset: a,
                            currency: _inr,
                            accent: _accentTop,
                            icon: _iconForType(a.assetType),
                            onTap: () => _showDetails(a),
                            logoPath: _logoFor(a),
                          );
                        },
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

// ====================== Sub-widgets ========================

class _GlassAppBar extends StatelessWidget {
  final Color top;
  final Color bottom;
  final Widget child;
  const _GlassAppBar({Key? key, required this.top, required this.bottom, required this.child}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [top, bottom]),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 10, offset: Offset(0, 4))],
      ),
      child: child,
    );
  }
}

class _AssetsSummaryCard extends StatelessWidget {
  final double total;
  final int count;
  final String topCategory;
  final Map<String, double> breakdown;
  final NumberFormat currency;

  const _AssetsSummaryCard({
    Key? key,
    required this.total,
    required this.count,
    required this.topCategory,
    required this.breakdown,
    required this.currency,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Compute stacked distribution units
    final sum = breakdown.values.fold<double>(0.0, (s, v) => s + v);
    final entries = breakdown.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(.85),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withOpacity(.55)),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 14, offset: Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top row
          Row(
            children: [
              Expanded(
                child: Text(
                  "Your Assets",
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                    color: Colors.grey[900],
                    letterSpacing: -.2,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.teal.withOpacity(.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.teal.withOpacity(.2)),
                ),
                child: Text("$count items", style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            currency.format(total),
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Colors.black87),
          ),
          const SizedBox(height: 8),

          // Stacked distribution bar
          if (sum > 0) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                height: 10,
                child: Row(
                  children: entries.map((e) {
                    final pct = e.value / sum;
                    return Expanded(
                      flex: math.max(1, (pct * 1000).round()),
                      child: Container(color: _colorForKey(e.key).withOpacity(.9)),
                    );
                  }).toList(),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: entries.take(6).map((e) {
                final pct = sum > 0 ? (e.value / sum * 100) : 0;
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: _colorForKey(e.key).withOpacity(.10),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _colorForKey(e.key).withOpacity(.3)),
                  ),
                  child: Text(
                    "${_labelForKey(e.key)} ${pct.toStringAsFixed(0)}%",
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                  ),
                );
              }).toList(),
            ),
          ],

          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.emoji_events_rounded, size: 18, color: Colors.teal),
              const SizedBox(width: 6),
              Text("Top category: $topCategory", style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
        ],
      ),
    );
  }

  String _labelForKey(String key) {
    switch (key) {
      case 'equity': return 'Equity';
      case 'mf_etf': return 'MF/ETF';
      case 'fixed_deposit': return 'FD';
      case 'real_estate': return 'Real Estate';
      case 'gold': return 'Gold';
      case 'bonds': return 'Bonds';
      case 'crypto': return 'Crypto';
      case 'cash_bank': return 'Cash/Bank';
      case 'retirement': return 'Retirement';
      default: return 'Other';
    }
  }

  Color _colorForKey(String key) {
    switch (key) {
      case 'equity': return const Color(0xFF22C55E);
      case 'mf_etf': return const Color(0xFF06B6D4);
      case 'fixed_deposit': return const Color(0xFFF59E0B);
      case 'real_estate': return const Color(0xFF8B5CF6);
      case 'gold': return const Color(0xFFEAB308);
      case 'bonds': return const Color(0xFF0EA5E9);
      case 'crypto': return const Color(0xFFEF4444);
      case 'cash_bank': return const Color(0xFF10B981);
      case 'retirement': return const Color(0xFF6366F1);
      default: return const Color(0xFF94A3B8);
    }
  }
}

class _Segments extends StatelessWidget {
  final String segment;
  final void Function(String) onChanged;
  final Map<String, int> counts;
  final Color accent;

  const _Segments({
    Key? key,
    required this.segment,
    required this.onChanged,
    required this.counts,
    required this.accent,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final keys = const [
      'all', 'equity', 'mf_etf', 'fixed_deposit', 'real_estate',
      'gold', 'bonds', 'crypto', 'cash_bank', 'retirement', 'other'
    ];
    final labels = {
      'all': 'All',
      'equity': 'Equity',
      'mf_etf': 'MF/ETF',
      'fixed_deposit': 'FD',
      'real_estate': 'Real Estate',
      'gold': 'Gold',
      'bonds': 'Bonds',
      'crypto': 'Crypto',
      'cash_bank': 'Cash/Bank',
      'retirement': 'Retirement',
      'other': 'Other',
    };

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 2),
        itemCount: keys.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final k = keys[i];
          final selected = k == segment;
          final count = k == 'all'
              ? counts.values.fold<int>(0, (s, v) => s + v)
              : (counts[k] ?? 0);
          return ChoiceChip(
            selected: selected,
            onSelected: (_) => onChanged(k),
            label: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(labels[k]!, overflow: TextOverflow.ellipsis),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: selected ? accent.withOpacity(.20) : Colors.grey[200],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  "$count",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: selected ? accent : Colors.black87,
                  ),
                ),
              ),
            ]),
            selectedColor: accent.withOpacity(.12),
            labelStyle: TextStyle(
              fontWeight: FontWeight.w800,
              color: selected ? accent : Colors.black87,
            ),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          );
        },
      ),
    );
  }
}

class _AssetTile extends StatelessWidget {
  final AssetModel asset;
  final NumberFormat currency;
  final Color accent;
  final IconData icon;
  final VoidCallback onTap;
  final String? logoPath;

  const _AssetTile({
    Key? key,
    required this.asset,
    required this.currency,
    required this.accent,
    required this.icon,
    required this.onTap,
    this.logoPath,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Bigger logos so they feel "in" the card
    final leading = _LogoOrIcon(asset, size: 36, fallback: icon, logoPath: logoPath);

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              leading,
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    asset.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                  const SizedBox(height: 6),
                  Row(children: [
                    Text(currency.format(asset.value),
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _label(asset),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ]),
                  const SizedBox(height: 6),
                  if ((asset.institution ?? '').isNotEmpty)
                    Text(
                      asset.institution!,
                      style: TextStyle(color: Colors.grey[800], fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _label(AssetModel a) {
    final t = a.assetType.toLowerCase();
    final sub = (a.subType ?? '').trim();
    final main = {
      'equity': 'Equity',
      'mf_etf': 'MF/ETF',
      'fixed_deposit': 'FD',
      'real_estate': 'Real Estate',
      'gold': 'Gold',
      'bonds': 'Bonds',
      'crypto': 'Crypto',
      'cash_bank': 'Cash/Bank',
      'retirement': 'Retirement',
    }[t] ?? 'Other';
    return sub.isEmpty ? main : "$main • $sub";
  }
}

class _LogoOrIcon extends StatelessWidget {
  final AssetModel asset;
  final double size;
  final IconData fallback;
  final String? logoPath;
  const _LogoOrIcon(this.asset, {Key? key, required this.size, required this.fallback, this.logoPath}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final path = logoPath;
    final bg = Colors.white;
    final ring = Colors.black.withOpacity(.06);

    return Container(
      width: size + 10,
      height: size + 10,
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
        border: Border.all(color: ring),
        boxShadow: const [BoxShadow(color: Color(0x11000000), blurRadius: 8, offset: Offset(0, 4))],
      ),
      child: path != null
          ? ClipOval(
        child: Image.asset(
          path,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Icon(fallback, size: size, color: Colors.black87),
        ),
      )
          : Icon(fallback, size: size, color: Colors.black87),
    );
  }
}
